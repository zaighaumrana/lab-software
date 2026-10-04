const assert=require('node:assert/strict'),{test,before,beforeEach,after}=require('node:test');
const {createRequire}=require('node:module'),{resolve,join,dirname}=require('node:path'),{tmpdir}=require('node:os');
const {mkdtemp,rm,writeFile}=require('node:fs/promises'),{randomUUID}=require('node:crypto');
const {Client}=require('pg'),{createDatabaseClient,assertRuntimePrivileges}=require('@lms/database');
const req=createRequire(resolve('../../apps/api/package.json'));
const {BillingService}=req('./dist/modules/billing/billing.service'),{BookingsService}=req('./dist/modules/bookings/bookings.service');
const {LaboratoryService}=req('./dist/modules/laboratory/laboratory.service'),{ReportingService}=req('./dist/modules/reporting/reporting.service');
const {ReportArtifactService}=req('./dist/modules/printing/report-artifact.service'),{ReportArtifactStore,pdfHash}=req('./dist/modules/printing/report-artifact.store');
const {PublicSyncDispatcher}=req('./dist/modules/public-sync/public-sync.dispatcher'),{PublicSyncService}=req('./dist/modules/public-sync/public-sync.service');
const {MemoryPublicSyncTransport,PublicSyncFailure,validatePublicProjection,PUBLIC_SYNC_TRANSPORT}=req('./dist/modules/public-sync/public-sync.transport');
const {enqueuePublicReport,PUBLIC_REPORT_SCHEMA}=req('./dist/modules/public-sync/public-projection');
let db,db2,owner,tenantId,branchId,actor,operator,patient,catalog,billing,lab,reporting,root,store;
const pdf=Buffer.from('%PDF-1.7\nF1 immutable synthetic bytes\n%%EOF');
const settings={labName:'F1 fixture',printMode:'PLAIN',marginTopMm:10,marginBottomMm:10,reportPagination:'CONTINUOUS'};
before(async()=>{
  assert(/^\/labflow_prisma7_test_[a-f0-9]{16}$/.test(new URL(process.env.DATABASE_TEST_URL).pathname));
  db=createDatabaseClient();db2=createDatabaseClient();await assertRuntimePrivileges(db);
  owner=new Client({connectionString:process.env.DATABASE_TEST_URL});await owner.connect();
  root=await mkdtemp(join(tmpdir(),'labflow-f1-artifacts-'));store=new ReportArtifactStore(root);
  tenantId=(await db.tenant.create({data:{name:'F1 Synthetic',slug:randomUUID()}})).id;
  branchId=(await db.branch.create({data:{tenantId,name:'Fixture',code:'F1'}})).id;
  const passwordHash=await req('bcrypt').hash('fixture-password-only',4);
  actor=(await db.user.create({data:{tenantId,branchId,username:'f1-admin',fullName:'Fixture admin',role:'ADMIN',passwordHash}})).id;
  operator=(await db.user.create({data:{tenantId,branchId,username:'f1-operator',fullName:'Fixture operator',role:'LAB_OPERATOR',passwordHash}})).id;
  patient=await db.patient.create({data:{tenantId,branchId,fullName:'PRIVATE fixture name',phone:'03000000001',cnic:'12345-1234567-1',address:'PRIVATE ADDRESS',dateOfBirth:new Date('2000-01-01'),labNumber:'PRIVATE-LAB',mrcNumber:'PRIVATE-MRC',smsConsent:false}});
  catalog=await db.test.create({data:{tenantId,code:'F1',name:'Synthetic',basePrice:100,parameters:{create:{code:'P',name:'Frozen parameter'}}}});
  billing=new BillingService(db,new BookingsService(db));
  lab=new LaboratoryService(db,{queueTemplatedSms:async()=>{throw Error('No SMS fixture');}},{notifySampleChanged:()=>{}});
  reporting=new ReportingService(db);
  await db.configuration.create({data:{tenantId,key:'public-sync',value:{enabled:true,recoveryHold:false}}});
});
beforeEach(async()=>{
  process.env.LABFLOW_RECOVERY_MODE='false';process.env.PUBLIC_SYNC_ENABLED='true';
  await db.syncOutbox.updateMany({where:{tenantId,status:{in:['QUEUED','RETRYING','SYNCING']}},data:{status:'ABANDONED',claimedBy:null,claimExpiresAt:null,dispatchStartedAt:null,failureCode:'TEST_ISOLATION'}});
});
after(async()=>{
  await db?.$disconnect();await db2?.$disconnect();await owner?.end();
  if(root){assert.equal(resolve(dirname(root)),resolve(tmpdir()));assert(/^labflow-f1-artifacts-/.test(root.slice(dirname(root).length+1)));await rm(root,{recursive:true,force:true});}
});
async function fixture(release=true){
  const booking=await db.booking.create({data:{tenantId,branchId,patientId:patient.id,bookingCode:randomUUID(),status:'CONFIRMED'}});
  const inv=await billing.createInvoice(tenantId,branchId,{bookingId:booking.id,lines:[{testId:catalog.id,quantity:1}]});
  const order=inv.visit.orderedTests[0];
  const sample=await lab.collectSample(tenantId,branchId,{invoiceId:inv.id,orderedTestIds:[order.id],sampleType:'Blood'},actor);
  await lab.receiveSample(tenantId,sample.id,actor);await lab.acceptSample(tenantId,sample.id,undefined,actor);
  const result=await lab.enterResult(tenantId,{sampleId:sample.id,orderedTestId:order.id,values:[{versionParameterId:order.testVersion.versionParameters[0].id,valueNumeric:15}],releaseImmediately:release},actor);
  return {inv,order,sample,result};
}
async function latest(f){return db.syncOutbox.findFirstOrThrow({where:{aggregateId:f.inv.report.id,eventType:PUBLIC_REPORT_SCHEMA},orderBy:{projectionRevision:'desc'}});}
function worker(transport=new MemoryPublicSyncTransport(),client=db){const w=new PublicSyncDispatcher(client,transport);w.store=store;return w;}
async function pay(f){return billing.recordPayment(tenantId,f.inv.id,{amount:100,method:'CASH',operationKey:randomUUID()},actor);}
async function publish(f){const service=new ReportArtifactService(db,{renderPdf:async()=>pdf});service.store=store;return service.pdf(await reporting.findById(tenantId,f.inv.report.id),async()=>settings);}
async function due(id){await db.syncOutbox.update({where:{id},data:{nextAttemptAt:new Date(0)}});}

test('A required outbox insert failure rolls back both financial and report-release transactions',async()=>{
  const paid=await fixture(),draft=await fixture(false),artifact=await fixture();await pay(artifact);
  const revisions=await db.report.findMany({where:{id:{in:[paid.inv.report.id,draft.inv.report.id]}},select:{id:true,publicSyncRevision:true,currentVersionId:true}});
  const auditBefore=await db.auditLog.count();
  await owner.query(`CREATE FUNCTION f1_fixture_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Fixture required intent failure'; END $$`);
  await owner.query('CREATE TRIGGER f1_fixture_fail BEFORE INSERT ON sync_outbox FOR EACH ROW EXECUTE FUNCTION f1_fixture_fail()');
  try{
    await assert.rejects(pay(paid));await assert.rejects(lab.finalizeResult(tenantId,draft.result.id,actor));await assert.rejects(publish(artifact));
    assert.equal((await db.reportVersion.findFirstOrThrow({where:{reportId:artifact.inv.report.id}})).pdfPath,null,'Artifact metadata and required intent commit together');
    assert.equal(await db.payment.count({where:{invoiceId:paid.inv.id}}),0);
    assert.equal((await db.invoice.findUniqueOrThrow({where:{id:paid.inv.id}})).amountDue.toString(),'100');
    assert.equal((await db.result.findUniqueOrThrow({where:{id:draft.result.id}})).status,'ENTERED');
    assert.deepEqual(await db.report.findMany({where:{id:{in:[paid.inv.report.id,draft.inv.report.id]}},select:{id:true,publicSyncRevision:true,currentVersionId:true}}),revisions);
    assert.equal(await db.auditLog.count(),auditBefore);
  }finally{await owner.query('DROP TRIGGER f1_fixture_fail ON sync_outbox');await owner.query('DROP FUNCTION f1_fixture_fail()');}
});
test('B offline failure retains committed clinical/payment state and bounded retry drains on return',async()=>{
  const f=await fixture();await pay(f);const row=await latest(f);
  const report=await db.report.findUniqueOrThrow({where:{id:f.inv.report.id}}),invoice=await db.invoice.findUniqueOrThrow({where:{id:f.inv.id}});
  const transport=new MemoryPublicSyncTransport();let offline=true;
  const original=transport.upsertProjection.bind(transport);transport.upsertProjection=async(...args)=>{if(offline)throw new PublicSyncFailure('NETWORK_UNAVAILABLE',true);return original(...args);};
  const w=worker(transport);await w.runOnce();const pending=await db.syncOutbox.findUniqueOrThrow({where:{id:row.id}});
  assert.equal(pending.status,'RETRYING');assert.equal(pending.attempts,1);assert(pending.nextAttemptAt>Date.now());assert.equal(pending.lastError,'NETWORK_UNAVAILABLE');
  assert.deepEqual(await db.report.findUniqueOrThrow({where:{id:f.inv.report.id}}),report);assert.deepEqual(await db.invoice.findUniqueOrThrow({where:{id:f.inv.id}}),invoice);
  offline=false;await due(row.id);await w.runOnce();assert.equal((await db.syncOutbox.findUniqueOrThrow({where:{id:row.id}})).status,'SYNCED');
  const failed=await fixture();await pay(failed);const denied=worker({isConfigured:()=>true,ensureArtifact:async()=>{},upsertProjection:async()=>{throw new PublicSyncFailure('AUTH_REJECTED',false);}});
  await denied.runOnce();const deniedRow=await latest(failed);assert.equal(deniedRow.status,'FAILED');await denied.runOnce();assert.equal((await latest(failed)).attempts,1);
  const exhausted=await fixture();await pay(exhausted);const t=worker({isConfigured:()=>true,ensureArtifact:async()=>{},upsertProjection:async()=>{throw new PublicSyncFailure('RATE_LIMITED',true);}});
  const exhaustedRow=await latest(exhausted);for(let i=0;i<5;i++){await due(exhaustedRow.id);await t.runOnce();}
  assert.equal((await latest(exhausted)).status,'FAILED');assert.equal((await latest(exhausted)).attempts,5);
});
test('C independent worker connections cannot overlap even when a live attempt lease expires',async()=>{
  const f=await fixture(),transport=new MemoryPublicSyncTransport();let started,release,active=0,maxActive=0;
  const began=new Promise(r=>started=r),gate=new Promise(r=>release=r),original=transport.upsertProjection.bind(transport);
  transport.upsertProjection=async(...args)=>{active++;maxActive=Math.max(maxActive,active);started();await gate;try{return await original(...args);}finally{active--;}};
  const a=worker(transport),b=worker(transport,db2);
  const claims=await Promise.all([a.claimDue(),b.claimDue()]);assert.equal(claims.filter(Boolean).length,1);const claim=claims.find(Boolean);
  await db.syncOutbox.update({where:{id:claim.id},data:{claimExpiresAt:new Date(Date.now()+1000)}});
  const attempt=a.dispatchClaim(claim.id,claim.owner);await began;
  await new Promise(r=>setTimeout(r,1100));await b.recoverExpired();assert.equal(await b.claimDue(),null);assert.equal(active,1);
  release();await attempt;await b.recoverExpired();const replay=await b.claimDue();assert(replay);await b.dispatchClaim(replay.id,replay.owner);
  assert.equal(maxActive,1);assert.equal(transport.projections.size,1);assert.equal((await latest(f)).status,'SYNCED');
});
test('D crashed claims expire, replay with a new owner and fence stale completion/dispatch',async()=>{
  const f=await fixture(),transport=new MemoryPublicSyncTransport(),a=worker(transport),b=worker(transport,db2);
  const dead=await a.claimDue();await db.syncOutbox.update({where:{id:dead.id},data:{claimExpiresAt:new Date(0)}});
  await b.recoverExpired();const live=await b.claimDue();assert.notEqual(live.owner,dead.owner);
  await a.dispatchClaim(dead.id,dead.owner);assert.equal(transport.projections.size,0);await b.dispatchClaim(live.id,live.owner);
  await a.dispatchClaim(dead.id,dead.owner);assert.equal((await latest(f)).status,'SYNCED');assert.equal((await latest(f)).attempts,1);
});
test('E delayed older revision is ignored and identical revision with different content is rejected',async()=>{
  const f=await fixture(),old=(await latest(f)).payload;await pay(f);const newest=(await latest(f)).payload;
  const t=new MemoryPublicSyncTransport(),signal=new AbortController().signal;
  assert.equal(await t.upsertProjection(newest,signal),'APPLIED');assert.equal(await t.upsertProjection(old,signal),'OLDER');
  assert.deepEqual(t.projections.get(newest.projectionKey),newest);
  await assert.rejects(t.upsertProjection({...newest,trackingId:'different'},signal),e=>e.code==='REVISION_CONFLICT');
});
test('F acknowledgement lost after receiver apply replays the exact revision idempotently',async()=>{
  const f=await fixture(),t=new MemoryPublicSyncTransport(),original=t.upsertProjection.bind(t);let first=true;
  t.upsertProjection=async(...args)=>{const result=await original(...args);if(first){first=false;throw new PublicSyncFailure('TIMEOUT',true);}assert.equal(result,'IDENTICAL');return result;};
  const w=worker(t);await w.runOnce();const row=await latest(f);await due(row.id);await w.runOnce();
  assert.equal(t.projections.size,1);assert.equal((await latest(f)).attempts,2);assert.equal((await latest(f)).status,'SYNCED');
});
test('G authoritative payment/refund projection grants then revokes cloud PDF availability',async()=>{
  const f=await fixture(),t=new MemoryPublicSyncTransport(),w=worker(t);await publish(f);
  assert.equal((await latest(f)).payload.onlineEligible,false);assert.equal((await latest(f)).payload.artifact,null);
  const payment=await pay(f);assert((await latest(f)).payload.artifact);await w.runOnce();assert(t.projections.get((await latest(f)).projectionKey).artifact);
  await billing.refund(tenantId,f.inv.id,{amount:50,relatedPaymentId:payment.payment.id,reason:'Fixture refund',operationKey:randomUUID()},actor);
  const revoked=await latest(f);assert.equal(revoked.payload.reportReady,true);assert.equal(revoked.payload.onlineEligible,false);assert.equal(revoked.payload.artifact,null);
  await w.runOnce();assert.equal(t.projections.get(revoked.projectionKey).artifact,null);assert.equal(t.artifacts.size,1,'Historical private bytes may remain; lookup authority is revoked');
  await billing.adjust(tenantId,f.inv.id,{type:'WRITE_OFF',amount:50,reason:'Fixture approved credit',operationKey:randomUUID()},actor);
  assert.equal((await latest(f)).payload.onlineEligible,true);
});
test('H amendment preserves old evidence and replaces only current approved version',async()=>{
  const f=await fixture();await pay(f);await publish(f);const t=new MemoryPublicSyncTransport(),w=worker(t);await w.runOnce();const old=await latest(f);
  const draft=await lab.reopenResult(tenantId,f.result.id,'Fixture correction',actor);
  assert.equal((await latest(f)).payload.currentVersion.versionNo,1,'Draft cannot replace approved B2 version');
  await lab.enterResult(tenantId,{sampleId:f.sample.id,orderedTestId:f.order.id,values:[{versionParameterId:f.order.testVersion.versionParameters[0].id,valueNumeric:20}]},actor);
  await lab.finalizeResult(tenantId,draft.id,actor);const fresh=await latest(f);assert.equal(fresh.payload.currentVersion.versionNo,2);assert.equal(fresh.payload.artifact,null);
  await w.runOnce();assert.equal(t.projections.get(old.projectionKey).currentVersion.versionNo,2);assert.equal(await db.reportVersion.count({where:{reportId:f.inv.report.id}}),2);
  assert.deepEqual((await db.syncOutbox.findUniqueOrThrow({where:{id:old.id}})).payload,old.payload);
});
test('I transfer uses canonical SHA/size/bytes without rendering; corrupt bytes permanently fail',async()=>{
  const f=await fixture();await pay(f);assert.deepEqual(await publish(f),pdf);const row=await latest(f);
  const t=new MemoryPublicSyncTransport(),w=worker(t);await w.runOnce();assert.deepEqual(t.artifacts.get(row.payload.artifact.logicalKey),pdf);assert.equal(row.payload.artifact.sha256,pdfHash(pdf));
  const service=new ReportArtifactService(db,{renderPdf:async()=>{throw Error('Must not rerender');}});service.store=store;
  assert.deepEqual(await service.pdf(await reporting.findById(tenantId,f.inv.report.id),async()=>{throw Error('Must not rebuild settings');}),pdf);
  const corrupt=await fixture();await pay(corrupt);await publish(corrupt);const current=await db.reportVersion.findFirstOrThrow({where:{reportId:corrupt.inv.report.id}});
  await writeFile(join(root,current.pdfPath),Buffer.from('%PDF-corrupt'));await w.runOnce();assert.equal((await latest(corrupt)).status,'FAILED');assert.equal((await latest(corrupt)).failureCode,'ARTIFACT_INVALID');
});
test('J recovery and both disable switches perform zero transport activity and retain intents',async()=>{
  const f=await fixture(),t=new MemoryPublicSyncTransport(),w=worker(t);const row=await latest(f);
  process.env.LABFLOW_RECOVERY_MODE='true';w.onModuleInit();await w.runOnce();assert.equal(await w.claimDue(),null);await w.dispatchClaim(row.id,'fake');await w.recoverExpired();
  assert.equal(t.projections.size,0);assert.equal((await latest(f)).status,'QUEUED');await w.onModuleDestroy();
  process.env.LABFLOW_RECOVERY_MODE='false';process.env.PUBLIC_SYNC_ENABLED='false';await worker(t).runOnce();assert.equal(t.projections.size,0);
  process.env.PUBLIC_SYNC_ENABLED='true';await db.configuration.update({where:{tenantId_key:{tenantId,key:'public-sync'}},data:{value:{enabled:false}}});await worker(t).runOnce();assert.equal(t.projections.size,0);
  await db.configuration.update({where:{tenantId_key:{tenantId,key:'public-sync'}},data:{value:{enabled:true,recoveryHold:true}}});await worker(t).runOnce();assert.equal(t.projections.size,0);
  const service=new PublicSyncService(db,t);await assert.rejects(service.configure(tenantId,'ADMIN',actor,true));await assert.rejects(service.bootstrap(tenantId,'ADMIN',actor));
  await db.configuration.update({where:{tenantId_key:{tenantId,key:'public-sync'}},data:{value:{enabled:true,recoveryHold:false}}});
});
test('K explicit bounded bootstrap of current legacy installation state is idempotent and never automatic',async()=>{
  const f=await fixture();await owner.query('ALTER TABLE sync_outbox DISABLE TRIGGER f1_sync_evidence');
  try{await owner.query('DELETE FROM sync_outbox WHERE "aggregateId"=$1',[f.inv.report.id]);}finally{await owner.query('ALTER TABLE sync_outbox ENABLE TRIGGER f1_sync_evidence');}
  const before=await db.syncOutbox.count();const service=new PublicSyncService(db,new MemoryPublicSyncTransport());
  await assert.rejects(service.bootstrap(tenantId,'LAB_OPERATOR',operator));await assert.rejects(service.bootstrap(tenantId,'ADMIN',actor,51));
  const first=await service.bootstrap(tenantId,'ADMIN',actor,50);assert(first.scanned<=50);assert(first.enqueued>=1);
  const count=await db.syncOutbox.count();assert(count>before);await service.bootstrap(tenantId,'ADMIN',actor,50);assert.equal(await db.syncOutbox.count(),count);
  assert((await latest(f)).createdAt>=new Date(Date.now()-60000));
});
test('L strict public allowlist, immutable intent evidence and ADMIN-only status/maintenance routes',async()=>{
  const f=await fixture();await pay(f);await publish(f);const row=await latest(f),body=JSON.stringify(row.payload);
  validatePublicProjection(row.payload);
  for(const forbidden of ['PRIVATE','03000000001','12345-1234567-1','2000-01-01',patient.id,actor,tenantId,branchId,f.inv.id,f.inv.report.id,'pdfPath','password','session','commission','amountPaid','amountDue','audit'])assert(!body.includes(forbidden),forbidden);
  for(const key of ['phone','cnic','dateOfBirth','address','labNumber','mrcNumber','patient','invoice','token','credentials'])assert.throws(()=>validatePublicProjection({...row.payload,[key]:'forbidden'}));
  await assert.rejects(db.syncOutbox.update({where:{id:row.id},data:{payload:{private:'wrong'}}}));await assert.rejects(db.syncOutbox.delete({where:{id:row.id}}));
  process.env.PUBLIC_SYNC_ENABLED='false';
  const legacy=await db.syncOutbox.create({data:{tenantId,eventType:'legacy-unused',aggregateType:'Legacy',aggregateId:'fixture',payload:{}}});await db.syncOutbox.delete({where:{id:legacy.id}});assert.equal(await db.syncOutbox.count({where:{id:legacy.id}}),0,'Non-F1 deletion semantics preserved');
  const {Test}=req('@nestjs/testing'),{AppModule}=req('./dist/app.module'),{ValidationPipe}=req('@nestjs/common');
  const {SMS_GATEWAY}=req('./dist/modules/notifications/providers/sms-gateway.interface');
  const mod=await Test.createTestingModule({imports:[AppModule]}).overrideProvider(PUBLIC_SYNC_TRANSPORT).useValue(new MemoryPublicSyncTransport())
    .overrideProvider(SMS_GATEWAY).useValue({isConfigured:()=>false,send:async()=>{throw Error('No SMS');}}).compile();
  const app=mod.createNestApplication({logger:false});app.useGlobalPipes(new ValidationPipe({whitelist:true,transform:true}));
  try{
    await app.listen(0,'127.0.0.1');const base=await app.getUrl();
    const login=async username=>{const r=await fetch(base+'/auth/login',{method:'POST',headers:{'Content-Type':'application/json','x-tenant-id':tenantId},body:JSON.stringify({username,password:'fixture-password-only'})});assert.equal(r.status,200);return (await r.json()).sessionId;};
    assert.equal((await fetch(base+'/public-sync/status')).status,401);
    const op=await login('f1-operator'),admin=await login('f1-admin');
    for(const [path,method] of [['status','GET'],['bootstrap','POST'],['configuration','PUT']]){
      const r=await fetch(base+'/public-sync/'+path,{method,headers:{'x-session-id':op,'Content-Type':'application/json'},...(method==='GET'?{}:{body:JSON.stringify(method==='PUT'?{enabled:false}:{})})});assert.equal(r.status,403);
    }
    const r=await fetch(base+'/public-sync/status',{headers:{'x-session-id':admin,'x-tenant-id':'spoofed-tenant'}});assert.equal(r.status,200);const status=await r.json();
    assert.equal(status.effectiveEnabled,false);assert.equal(typeof status.pendingCount,'number');assert(!JSON.stringify(status).includes(patient.phone));
  }finally{await app.close();}
});

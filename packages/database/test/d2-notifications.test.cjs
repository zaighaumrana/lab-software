// Eleven focused groups. The guarded harness creates and drops a disposable database.
const assert=require('node:assert/strict');
const {test,before,after}=require('node:test');
const {createRequire}=require('node:module');
const {resolve}=require('node:path');
const {randomUUID}=require('node:crypto');
const {createDatabaseClient}=require('@lms/database');
const req=createRequire(resolve('../../apps/api/package.json'));
const {NotificationsService}=req('./dist/modules/notifications/notifications.service');
const {NotificationDispatcher}=req('./dist/modules/notifications/notification-dispatcher.service');
const {SendPkProvider}=req('./dist/modules/notifications/providers/sendpk.provider');
const {LaboratoryService}=req('./dist/modules/laboratory/laboratory.service');
const {BillingService}=req('./dist/modules/billing/billing.service');
const {BookingsService}=req('./dist/modules/bookings/bookings.service');
let db,other;
const past=()=>new Date(Date.now()-180000);
const accepted={success:true,providerMessageId:'123456',rawResponse:'OK ID:123456'};
const transient={success:false,failureKind:'TRANSIENT',errorCode:'NETWORK_UNREACHABLE',rawResponse:'not saved'};
before(async()=>{
  const url=process.env.DATABASE_TEST_URL;
  assert(url && /^\/labflow_prisma7_test_[a-f0-9]{16}$/.test(new URL(url).pathname));
  assert.equal(process.env.SENDPK_API_KEY,'');
  db=createDatabaseClient({connectionString:url});other=createDatabaseClient({connectionString:url});
});
after(async()=>{await Promise.all([db?.$disconnect(),other?.$disconnect()]);});
function gateway(send=async()=>accepted,checkDelivery) {
  const calls=[];return {calls,isConfigured:()=>true,send:async p=>{calls.push(structuredClone(p));return send(p);},...(checkDelivery?{checkDelivery}:{})};
}
async function fixture(gw=gateway()) {
  const tenantId=(await db.tenant.create({data:{name:'D2 synthetic lab',slug:randomUUID()}})).id;
  const branchId=(await db.branch.create({data:{tenantId,code:'D2',name:'Fixture'}})).id;
  const actor=(await db.user.create({data:{tenantId,branchId,username:'d2',fullName:'Fixture actor',role:'ADMIN',passwordHash:'not-a-login'}})).id;
  const patient=await db.patient.create({data:{tenantId,branchId,fullName:'Synthetic patient',phone:'03000000001',labNumber:'D2',mrcNumber:'D2',smsConsent:true}});
  for(const key of ['SAMPLE_COLLECTED','REPORT_READY'])await db.smsTemplate.create({data:{tenantId,key,name:key,isActive:true,
    body:'Hello {{patientName}}, {{bookingId}} at {{labName}}',sendpkTemplateId:'original-template',sendpkRequiredVariables:['patient_name','booking_id','lab_name']}});
  const notifications=new NotificationsService(db,gw);
  const lab=new LaboratoryService(db,notifications,{notifySampleChanged:()=>{}});
  return {tenantId,branchId,actor,patient,gw,notifications,lab,worker:new NotificationDispatcher(db,gw)};
}
async function queue(f,key='SAMPLE_COLLECTED',relatedId=randomUUID()) {
  const opts={relatedType:key==='SAMPLE_COLLECTED'?'Booking':'Report',relatedId,patientId:f.patient.id};
  const vars={patientName:'stale name',bookingId:'fixture-booking',labName:'Fixture lab',trackingId:'fixture-tracking'};
  await db.$transaction(tx=>f.notifications.queueTemplatedSms(tx,f.tenantId,key,f.patient.phone,vars,opts));
  return db.notification.findFirstOrThrow({where:{tenantId:f.tenantId,relatedId,templateKey:key}});
}
const current=id=>db.notification.findUniqueOrThrow({where:{id},include:{attemptsHistory:{orderBy:{attemptNo:'asc'}}}});
async function due(id) {await db.notification.update({where:{id},data:{nextAttemptAt:past()}});}
async function clinical(f,quantity=1) {
  const catalog=await db.test.create({data:{tenantId:f.tenantId,code:randomUUID(),name:'Frozen clinical fixture',basePrice:100,parameters:{create:{code:'P',name:'Parameter'}}}});
  const booking=await db.booking.create({data:{tenantId:f.tenantId,branchId:f.branchId,patientId:f.patient.id,bookingCode:randomUUID(),status:'CONFIRMED'}});
  return new BillingService(db,new BookingsService(db)).createInvoice(f.tenantId,f.branchId,{bookingId:booking.id,lines:[{testId:catalog.id,quantity}]});
}
async function collect(f,inv,orders=inv.visit.orderedTests) {
  return f.lab.collectSample(f.tenantId,f.branchId,{invoiceId:inv.id,sampleType:'Blood',orderedTestIds:orders.map(o=>o.id)},f.actor);
}
async function draft(f,s,o) {
  await f.lab.receiveSample(f.tenantId,s.id,f.actor);await f.lab.acceptSample(f.tenantId,s.id,undefined,f.actor);
  return f.lab.enterResult(f.tenantId,{sampleId:s.id,orderedTestId:o.id,values:[{versionParameterId:o.testVersion.versionParameters[0].id,valueNumeric:15}]},f.actor);
}
async function fault(event) {
  assert(['SAMPLE_COLLECTED','REPORT_READY','AUDIT'].includes(event));
  const table=event==='AUDIT'?'audit_logs':'notifications';
  const cond=event==='AUDIT'?`NEW.action='NOTIFICATION_QUEUED'`:`NEW."templateKey"='${event}'`;
  await db.$executeRawUnsafe(`CREATE FUNCTION d2_fixture_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF ${cond} THEN RAISE EXCEPTION 'fixture intent/audit failure'; END IF; RETURN NEW; END $$`);
  await db.$executeRawUnsafe(`CREATE TRIGGER d2_fixture_fail BEFORE INSERT ON ${table} FOR EACH ROW EXECUTE FUNCTION d2_fixture_fail()`);
  return async()=>{await db.$executeRawUnsafe(`DROP TRIGGER d2_fixture_fail ON ${table}`);await db.$executeRawUnsafe('DROP FUNCTION d2_fixture_fail()');};
}
test('A sample/report intent and notification audit failures roll back their domain transactions',{timeout:20000},async()=>{
  const f=await fixture(),inv=await clinical(f);const beforeAudit=await db.auditLog.count({where:{tenantId:f.tenantId}});
  let remove=await fault('SAMPLE_COLLECTED');
  try{await assert.rejects(()=>collect(f,inv));}finally{await remove();}
  assert.equal(await db.sample.count({where:{invoiceId:inv.id}}),0);
  assert.equal(await db.sampleEvent.count({where:{tenantId:f.tenantId}}),0);
  assert.equal(await db.auditLog.count({where:{tenantId:f.tenantId}}),beforeAudit);
  remove=await fault('AUDIT');try{await assert.rejects(()=>collect(f,inv));}finally{await remove();}
  assert.equal(await db.sample.count({where:{invoiceId:inv.id}}),0);
  assert.equal(await db.notification.count({where:{tenantId:f.tenantId}}),0);
  const sample=await collect(f,inv),result=await draft(f,sample,inv.visit.orderedTests[0]);
  const reportBefore=await db.report.findUniqueOrThrow({where:{id:inv.report.id}});
  const auditBeforeRelease=await db.auditLog.count({where:{tenantId:f.tenantId}});
  remove=await fault('REPORT_READY');
  try{await assert.rejects(()=>f.lab.markInvoiceReady(f.tenantId,inv.id,f.actor));}finally{await remove();}
  assert.equal((await db.result.findUniqueOrThrow({where:{id:result.id}})).status,'ENTERED');
  assert.equal(await db.reportVersion.count({where:{reportId:inv.report.id}}),0);
  assert.equal((await db.report.findUniqueOrThrow({where:{id:inv.report.id}})).currentVersionId,reportBefore.currentVersionId);
  assert.equal(await db.auditLog.count({where:{tenantId:f.tenantId}}),auditBeforeRelease);
  assert.equal(f.gw.calls.length,0);
  await f.lab.markInvoiceReady(f.tenantId,inv.id,f.actor);await f.worker.runOnce();
  assert.equal(f.gw.calls.length,2);
});
test('B queued intent survives replacement service/dispatcher and startup shutdown is clean',{timeout:20000},async()=>{
  const f=await fixture(),n=await queue(f);
  assert.equal(n.status,'QUEUED');assert.equal(f.gw.calls.length,0);
  const restarted=new NotificationDispatcher(other,f.gw);restarted.onModuleInit();
  await restarted.runOnce();await restarted.onModuleDestroy();
  assert.equal((await current(n.id)).status,'SENT');assert.equal(f.gw.calls.length,1);
  await assert.rejects(()=>f.notifications.retry(n.id,f.tenantId));
});
test('C two workers and overlapping cycles own only one active provider attempt',{timeout:20000},async()=>{
  let unblock,started;const entered=new Promise(r=>started=r),hold=new Promise(r=>unblock=r);
  const f=await fixture(gateway(async()=>{started();await hold;return accepted;})),n=await queue(f);
  const a=f.worker.runOnce();await entered;
  try{
    const b=new NotificationDispatcher(other,f.gw);await b.runOnce();
    const row=await current(n.id);assert.equal(row.status,'SENDING');assert(row.dispatchStartedAt);assert.equal(row.attempts,1);
    assert.equal(f.gw.calls.length,1);const overlap=f.worker.runOnce();unblock();await overlap;
  }finally{unblock();await a;}
  assert.equal((await current(n.id)).attemptsHistory.length,1);
});
test('D expired pre-dispatch lease recovers safely and fences the obsolete owner',{timeout:20000},async()=>{
  const f=await fixture(),n=await queue(f),claim=await f.worker.claimDue();assert.equal(claim.id,n.id);
  await db.notification.update({where:{id:n.id},data:{claimExpiresAt:past()}});
  await new NotificationDispatcher(other,f.gw).runOnce();await f.worker.dispatchClaim(claim.id,claim.owner);
  const row=await current(n.id);assert.equal(row.status,'SENT');assert.equal(row.attempts,1);assert.equal(f.gw.calls.length,1);
});
test('E transient rejection waits for persisted backoff then succeeds with two attempts',{timeout:20000},async()=>{
  let count=0;const f=await fixture(gateway(async()=>++count===1?transient:accepted)),n=await queue(f);
  await f.worker.runOnce();let row=await current(n.id);
  assert.equal(row.status,'RETRYING');assert(row.nextAttemptAt.getTime()-Date.now()>55000);
  assert.equal(row.attemptsHistory[0].outcome,'TRANSIENT_FAILURE');
  await f.worker.runOnce();assert.equal(f.gw.calls.length,1);
  await due(n.id);await f.worker.runOnce();row=await current(n.id);
  assert.equal(row.status,'SENT');assert.deepEqual(row.attemptsHistory.map(a=>a.attemptNo),[1,2]);assert(row.acceptedAt);
});
test('F invalid/permanent failures do not loop; transient attempts stop at four; provider classifications are conservative',{timeout:20000},async()=>{
  const f=await fixture(gateway(async()=>({success:false,failureKind:'PERMANENT',errorCode:'PROVIDER_REJECTED',rawResponse:'rejected'}))),n=await queue(f);
  await f.worker.runOnce();await f.worker.runOnce();assert.equal((await current(n.id)).status,'FAILED');assert.equal(f.gw.calls.length,1);
  await db.patient.update({where:{id:f.patient.id},data:{phone:'bad'}});const invalid=await queue(f);
  assert.equal(invalid.status,'FAILED');assert.equal(invalid.lastErrorCode,'INVALID_RECIPIENT');await assert.rejects(()=>f.notifications.retry(invalid.id,f.tenantId));
  await db.patient.update({where:{id:f.patient.id},data:{phone:f.patient.phone}});
  await db.smsTemplate.update({where:{tenantId_key:{tenantId:f.tenantId,key:'SAMPLE_COLLECTED'}},data:{sendpkTemplateId:null}});
  const missing=await queue(f);assert.equal(missing.lastErrorCode,'MISSING_TEMPLATE');await assert.rejects(()=>f.notifications.retry(missing.id,f.tenantId));
  const retry=await fixture(gateway(async()=>transient)),limited=await queue(retry);
  for(let i=0;i<4;i++){
    await due(limited.id);await retry.worker.runOnce();const row=await current(limited.id);
    if(i<3)assert(row.nextAttemptAt.getTime()-Date.now()>[55000,295000,895000][i]);
  }
  assert.equal((await current(limited.id)).status,'ABANDONED');assert.equal(retry.gw.calls.length,4);await assert.rejects(()=>retry.notifications.retry(limited.id,retry.tenantId));
  // Pure mocked HTTP: no provider request or real credentials are used.
  const oldFetch=global.fetch,oldKey=process.env.SENDPK_API_KEY,oldSender=process.env.SENDPK_SENDER;
  process.env.SENDPK_API_KEY='fixture-secret';process.env.SENDPK_SENDER='fixture';
  try{
    const provider=new SendPkProvider(),p={mobile:'923000000001',templateId:'fixture',variables:{}};
    let response='OK ID:123456';global.fetch=async(url,options)=>{assert(!url.includes('fixture-secret'));assert.equal(options.method,'POST');return {ok:true,status:200,text:async()=>response};};
    assert.equal((await provider.send(p)).providerMessageId,'123456');
    response='7';assert.equal((await provider.send(p)).failureKind,'PERMANENT');
    response='8';assert.equal((await provider.send(p)).failureKind,'TRANSIENT');
    response='unknown fixture-secret';const unknown=await provider.send(p);assert.equal(unknown.failureKind,'AMBIGUOUS');assert(!unknown.rawResponse.includes('fixture-secret'));
    global.fetch=async()=>{const e=new Error('fixture-secret');e.name='AbortError';throw e;};
    const timeout=await provider.send(p);assert.equal(timeout.failureKind,'AMBIGUOUS');assert(!JSON.stringify(timeout).includes('fixture-secret'));
    global.fetch=async()=>{throw Object.assign(new Error('fixture-secret'),{cause:{code:'ECONNREFUSED'}});};assert.equal((await provider.send(p)).failureKind,'TRANSIENT');
    global.fetch=async()=>({ok:true,status:200,text:async()=>response});response='DELIVERED';assert.equal(await provider.checkDelivery('123456'),'DELIVERED');
    response='1';assert.equal(await provider.checkDelivery('123456'),'UNKNOWN');
  }finally{global.fetch=oldFetch;process.env.SENDPK_API_KEY=oldKey;process.env.SENDPK_SENDER=oldSender;}
});
test('G template edits cannot change frozen retry payload or event identity',{timeout:20000},async()=>{
  let i=0;const f=await fixture(gateway(async()=>++i===1?transient:accepted)),n=await queue(f);
  await f.worker.runOnce();
  await db.smsTemplate.update({where:{tenantId_key:{tenantId:f.tenantId,key:'SAMPLE_COLLECTED'}},data:{body:'Changed {{patientName}}',sendpkTemplateId:'changed-template'}});
  await f.notifications.retry(n.id,f.tenantId);await f.worker.runOnce();
  assert.deepEqual(f.gw.calls[1],f.gw.calls[0]);assert.equal((await current(n.id)).body,n.body);
  for(const data of [{body:'tamper'},{recipient:'923000000002'},{providerTemplateId:'tamper'},{providerVariables:{name:'tamper'}},{relatedId:'tamper'},{smsParts:2},{messageType:'unicode'}])await assert.rejects(()=>db.notification.update({where:{id:n.id},data}));
  await assert.rejects(()=>db.notification.delete({where:{id:n.id}}));
  await assert.rejects(()=>db.notification.update({where:{id:n.id},data:{status:'RETRYING'}}));
});
test('H consent withdrawn after queue abandons intent; current no-consent does not queue',{timeout:20000},async()=>{
  const f=await fixture(),n=await queue(f);await db.patient.update({where:{id:f.patient.id},data:{smsConsent:false}});
  await f.worker.runOnce();const row=await current(n.id);assert.equal(row.status,'ABANDONED');assert.equal(row.lastErrorCode,'CONSENT_WITHDRAWN');assert.equal(row.attempts,0);assert.equal(f.gw.calls.length,0);
  const result=await db.$transaction(tx=>f.notifications.queueTemplatedSms(tx,f.tenantId,'SAMPLE_COLLECTED',f.patient.phone,{},{relatedType:'Booking',relatedId:randomUUID(),patientId:f.patient.id}));
  assert.equal(result.reason,'DISABLED');assert.equal(await db.notification.count({where:{tenantId:f.tenantId}}),1);
});
test('I repeated sample/report actions preserve one intent per existing event key including amendments',{timeout:20000},async()=>{
  const f=await fixture(),inv=await clinical(f,2),[a,b]=inv.visit.orderedTests;
  const s1=await collect(f,inv,[a]),s2=await collect(f,inv,[b]);await draft(f,s1,a);await draft(f,s2,b);
  await f.lab.markInvoiceReady(f.tenantId,inv.id,f.actor);await f.lab.markInvoiceReady(f.tenantId,inv.id,f.actor);
  const result=await db.result.findFirstOrThrow({where:{sampleId:s1.id}});
  await f.lab.amendResult(f.tenantId,result.id,{amendmentReason:'Fixture correction',values:[{versionParameterId:a.testVersion.versionParameters[0].id,valueNumeric:16}]},f.actor);
  assert.equal(await db.notification.count({where:{tenantId:f.tenantId,templateKey:'SAMPLE_COLLECTED',relatedId:inv.bookingId}}),1);
  assert.equal(await db.notification.count({where:{tenantId:f.tenantId,templateKey:'REPORT_READY',relatedId:inv.id}}),1);
  // A concurrent duplicate insert takes the same native key, without poisoning a transaction.
  await Promise.all([1,2].map(()=>db.$transaction(tx=>f.notifications.queueTemplatedSms(tx,f.tenantId,'REPORT_READY',f.patient.phone,{bookingId:'other',labName:'other'},{relatedType:'Report',relatedId:inv.id,patientId:f.patient.id}))));
  assert.equal(await db.notification.count({where:{tenantId:f.tenantId}}),2);await f.worker.runOnce();assert.equal(f.gw.calls.length,2);
});
test('J attempt evidence is append-only, unique, bounded, scoped and contains no arbitrary provider secrets',{timeout:20000},async()=>{
  const f=await fixture(gateway(async()=>({...accepted,rawResponse:'fixture-secret '.repeat(1000),errorMessage:'fixture-secret'}))),n=await queue(f);await f.worker.runOnce();
  const row=await current(n.id),a=row.attemptsHistory[0];assert.equal(a.outcome,'ACCEPTED');assert(a.completedAt>=a.startedAt);assert.equal(a.providerMessageId,'123456');assert(a.providerResponse.length<=500);
  assert(!JSON.stringify(row).includes('fixture-secret'));
  await assert.rejects(()=>db.notificationAttempt.update({where:{id:a.id},data:{outcome:'UNKNOWN'}}));await assert.rejects(()=>db.notificationAttempt.delete({where:{id:a.id}}));
  await assert.rejects(()=>db.$executeRawUnsafe('TRUNCATE notification_attempts'));
  const {id,...copy}=a;
  await assert.rejects(()=>db.notificationAttempt.create({data:copy}));
  await assert.rejects(()=>db.notificationAttempt.create({data:{...copy,attemptNo:2,errorMessage:'x'.repeat(501)}}));
  await assert.rejects(()=>db.notificationAttempt.create({data:{...copy,attemptNo:2,tenantId:'other-tenant'}}));
  assert.equal(await db.auditLog.count({where:{entityId:n.id,action:'NOTIFICATION_SENT'}}),1);
});
test('K expired dispatch-start and ambiguous response hold safely; bounded delivery checks never resend',{timeout:20000},async()=>{
  const f=await fixture(),n=await queue(f),claim=await f.worker.claimDue();
  await db.notification.update({where:{id:n.id},data:{dispatchStartedAt:past(),attempts:1,claimExpiresAt:past()}});
  await new NotificationDispatcher(other,f.gw).runOnce();await f.worker.dispatchClaim(n.id,claim.owner);
  let row=await current(n.id);assert.equal(row.status,'RECONCILIATION_REQUIRED');assert.equal(row.attemptsHistory[0].outcome,'UNKNOWN');assert.equal(f.gw.calls.length,0);
  await assert.rejects(()=>f.notifications.retry(n.id,f.tenantId));
  const legacy=await db.notification.create({data:{tenantId:f.tenantId,recipient:f.patient.phone,body:'Historical fixture',status:'SENDING'}});
  await f.worker.runOnce();assert.equal((await current(legacy.id)).status,'RECONCILIATION_REQUIRED');assert.equal((await current(legacy.id)).attemptsHistory.length,0);
  const uncertain=await fixture(gateway(async()=>({success:false,failureKind:'AMBIGUOUS',errorCode:'NETWORK_TIMEOUT',rawResponse:''}))),u=await queue(uncertain);
  await uncertain.worker.runOnce();await uncertain.worker.runOnce();assert.equal((await current(u.id)).status,'RECONCILIATION_REQUIRED');assert.equal(uncertain.gw.calls.length,1);
  let checks=0;const polled=await fixture(gateway(async()=>accepted,async()=>{checks++;return 'DELIVERED';})),p=await queue(polled);
  await polled.worker.runOnce();await db.notification.update({where:{id:p.id},data:{nextDeliveryCheckAt:past()}});await polled.worker.runOnce();
  assert((await current(p.id)).deliveredAt);assert.equal(polled.gw.calls.length,1);assert.equal(checks,1);
  const unknown=await fixture(gateway(async()=>({...accepted,providerMessageId:'654321'}),async()=>{checks++;return 'undocumented-1';})),unk=await queue(unknown);
  await unknown.worker.runOnce();for(let i=0;i<3;i++){await db.notification.update({where:{id:unk.id},data:{nextDeliveryCheckAt:past()}});await unknown.worker.runOnce();}
  row=await current(unk.id);assert.equal(row.deliveryChecks,3);assert.equal(row.nextDeliveryCheckAt,null);assert.equal(row.providerStatus,'UNKNOWN');assert.equal(unknown.gw.calls.length,1);
});

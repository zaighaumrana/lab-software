const assert=require('node:assert/strict'),{test,before,after}=require('node:test');
const fs=require('node:fs/promises'),{resolve,join,dirname}=require('node:path'),{tmpdir}=require('node:os');
const {randomBytes,randomUUID}=require('node:crypto'),{createRequire}=require('node:module');const cp=require('node:child_process');
let dumpFailure=false,diskFailure=false,oldTools=false;const originalSpawn=cp.spawn,originalWrite=fs.writeFile;
cp.spawn=(exe,args,...rest)=>oldTools&&args.includes('--version')?originalSpawn(process.execPath,['-e',"console.log('pg_dump (PostgreSQL) 17.0')"]):dumpFailure&&args.some(x=>x==='--format=custom')?originalSpawn(process.execPath,['-e','process.exit(1)']):originalSpawn(exe,args,...rest);
fs.writeFile=async(...args)=>{if(diskFailure&&String(args[0]).endsWith('artifact-manifest.json')){const e=new Error('Synthetic disk full');e.code='ENOSPC';throw e;}return originalWrite(...args);};
const lib=require('../../../scripts/lib/backup-recovery.cjs'),{provision,ident}=require('../../../scripts/lib/runtime-db.cjs');
const {Client}=require('pg'),{createDatabaseClient,assertRuntimePrivileges}=require('@lms/database');
const req=createRequire(resolve('../../apps/api/package.json'));
let root,sourceRoot,destination,admin,db,app,backup,restored,restoredDb,sourceDestroyed=false,session,tenant,reportId,pdf,holdIds,sentRows,sessionRows,memberships,cutover;
const sourceUrl=process.env.DATABASE_TEST_URL;
const baseOptions=()=>({ownerUrl:sourceUrl,adminUrl:process.env.PROVISION_DATABASE_URL,artifactRoot:sourceRoot,destination});
const verifyOptions=()=>({...baseOptions(),backupPath:backup.backupPath});
const recoveryOptions=()=>({...verifyOptions(),ownerUrl:process.env.E2_TARGET_OWNER_URL,targetDatabase:process.env.E2_TARGET_DATABASE,targetArtifactRoot:join(root,'restored'),runtimeRole:process.env.E2_TARGET_RUNTIME_ROLE});
const calls=[];const gateway={isConfigured:()=>true,getSenderId:()=> 'Fixture',send:async p=>{calls.push(p);return {success:true,providerMessageId:'fixture-'+calls.length,rawResponse:'OK'};}};
async function cloneBackup(){const parent=await fs.mkdtemp(join(root,'clone-')),copy=join(parent,backup.manifest.backupId);await fs.cp(backup.backupPath,copy,{recursive:true});return copy;}
before(async()=>{
  assert(/^\/labflow_prisma7_test_[a-f0-9]{16}$/.test(new URL(sourceUrl).pathname));
  root=await fs.mkdtemp(join(tmpdir(),'labflow-e2-'));sourceRoot=join(root,'source-artifacts');destination=join(root,'backups');await fs.mkdir(sourceRoot);await fs.mkdir(destination);
  admin=new Client({connectionString:process.env.PROVISION_DATABASE_URL});await admin.connect();
  const sourceAdminUrl=new URL(process.env.PROVISION_DATABASE_URL);sourceAdminUrl.pathname=new URL(sourceUrl).pathname;
  const sourceAdmin=new Client({connectionString:sourceAdminUrl.toString()});await sourceAdmin.connect();
  const password=randomBytes(32).toString('base64url');try{await provision(sourceAdmin,{runtimeRole:process.env.E2_SOURCE_RUNTIME_ROLE,password});}finally{await sourceAdmin.end();}
  const runtime=new URL(sourceUrl);runtime.username=process.env.E2_SOURCE_RUNTIME_ROLE;runtime.password=password;
  process.env.RUNTIME_DATABASE_URL=runtime.toString();process.env.DB_RUNTIME_MODE='hardened';db=createDatabaseClient();
  const tenantId=(await db.tenant.create({data:{name:'E2 Synthetic private lab',slug:randomUUID()}})).id;tenant=tenantId;
  const branchId=(await db.branch.create({data:{tenantId,name:'Fixture',code:'E2'}})).id;
  const loginPassword=randomBytes(24).toString('base64url');await db.user.create({data:{tenantId,branchId,username:'e2',fullName:'Synthetic recovery user',role:'ADMIN',passwordHash:await req('bcrypt').hash(loginPassword,4)}});
  const catalog=await db.test.create({data:{tenantId,code:'E2',name:'Fixture test',basePrice:100,parameters:{create:{code:'P',name:'Frozen parameter'}}}});
  for(const key of ['SAMPLE_COLLECTED','REPORT_READY'])await db.smsTemplate.create({data:{tenantId,key,name:key,body:'Hello {{patientName}}',isActive:true,sendpkTemplateId:'fixture',sendpkRequiredVariables:['patient_name']}});
  const {Test}=req('@nestjs/testing'),{AppModule}=req('./dist/app.module'),{ValidationPipe}=req('@nestjs/common');
  const {SMS_GATEWAY}=req('./dist/modules/notifications/providers/sms-gateway.interface');
  const mod=await Test.createTestingModule({imports:[AppModule]}).overrideProvider(SMS_GATEWAY).useValue(gateway).compile();
  app=mod.createNestApplication({logger:false});app.useGlobalPipes(new ValidationPipe({whitelist:true,transform:true}));await app.listen(0,'127.0.0.1');
  const base=await app.getUrl();const request=async(p,method='GET',data)=>{const r=await fetch(base+p,{method,headers:{'Content-Type':'application/json','x-tenant-id':tenantId,...(session?{'x-session-id':session}:{})},...(data?{body:JSON.stringify(data)}:{})});assert(r.ok,`Fixture HTTP ${r.status}`);return r.json();};
  session=(await request('/auth/login','POST',{username:'e2',password:loginPassword})).sessionId;
  const patient=await request('/patients','POST',{fullName:'E2 Synthetic private patient',phone:'03000000001',smsConsent:true});
  const booking=await request('/bookings','POST',{patientId:patient.id});
  const invoice=await request('/billing/invoices','POST',{bookingId:booking.id,lines:[{testId:catalog.id,quantity:1}]});
  await request(`/billing/invoices/${invoice.id}/payments`,'POST',{amount:100,method:'CASH',operationKey:randomUUID()});
  const order=invoice.visit.orderedTests[0],sample=await request('/laboratory/samples','POST',{invoiceId:invoice.id,sampleType:'Blood',orderedTestIds:[order.id]});
  await request(`/laboratory/samples/${sample.id}/receive`,'PATCH');await request(`/laboratory/samples/${sample.id}/accept`,'PATCH',{});
  await request('/laboratory/results','POST',{sampleId:sample.id,orderedTestId:order.id,values:[{versionParameterId:order.testVersion.versionParameters[0].id,valueNumeric:15}]});
  await request(`/laboratory/invoices/${invoice.id}/ready-for-collection`,'PATCH');reportId=invoice.report.id;
  const {NotificationDispatcher}=req('./dist/modules/notifications/notification-dispatcher.service');await app.get(NotificationDispatcher).runOnce();assert.equal(calls.length,2);
  await app.close();app=null;
  const {ReportingService}=req('./dist/modules/reporting/reporting.service'),{ReportArtifactService}=req('./dist/modules/printing/report-artifact.service'),{ReportArtifactStore}=req('./dist/modules/printing/report-artifact.store'),{PrintingService}=req('./dist/modules/printing/printing.service');
  const printing=new PrintingService(),artifactService=new ReportArtifactService(db,printing);artifactService.store=new ReportArtifactStore(sourceRoot);
  try{pdf=await artifactService.pdf(await new ReportingService(db).findVersion(tenantId,reportId,1),async()=>({labName:'Synthetic fixture',printMode:'PLAIN',marginTopMm:10,marginBottomMm:10,reportPagination:'CONTINUOUS'}));}finally{await printing.onModuleDestroy();}
  assert(pdf.subarray(0,5).equals(Buffer.from('%PDF-')));assert(pdf.length>1000);
  const example=await db.notification.findFirst({where:{tenantId}});holdIds=[];
  for(const status of ['QUEUED','RETRYING','SENDING']){const n=await db.notification.create({data:{tenantId,channel:'SMS',recipient:example.recipient,body:example.body,templateKey:'RECOVERY_'+status,relatedType:'Invoice',relatedId:invoice.id,provider:'SENDPK',providerTemplateId:'fixture',providerVariables:example.providerVariables,messageType:example.messageType,smsParts:example.smsParts,patientId:patient.id,status,attempts:status==='QUEUED'?0:1,...(status==='SENDING'?{claimedBy:'fixture-worker',claimedAt:new Date(),claimExpiresAt:new Date(Date.now()+120000),dispatchStartedAt:new Date()}:{})}});holdIds.push(n.id);if(status==='RETRYING')await db.notificationAttempt.create({data:{tenantId,notificationId:n.id,attemptNo:1,startedAt:new Date(),completedAt:new Date(),outcome:'TRANSIENT_FAILURE',errorCode:'NETWORK_UNREACHABLE'}});}
  // Stop background work before capturing the historical source fixture.
  sentRows=await db.notification.findMany({where:{status:'SENT'},orderBy:{id:'asc'}});sessionRows=await db.authSession.findMany();memberships=await db.reportVersionResult.findMany();
});
after(async()=>{process.env.LABFLOW_RECOVERY_MODE='true';await app?.close();await db?.$disconnect();await restoredDb?.$disconnect();await admin?.end();cp.spawn=originalSpawn;fs.writeFile=originalWrite;if(root){assert.equal(resolve(dirname(root)),resolve(tmpdir()));assert(root.includes('labflow-e2-'));await fs.rm(root,{recursive:true,force:true});}});
test('1 consistent custom backup finalizes atomically with readable dump and hashed real PDF',async()=>{
  backup=await lib.backup(baseOptions());const v=await lib.verifyBackup(verifyOptions());const migrations=await fs.readdir(resolve('prisma/migrations'));assert.equal(v.manifest.migrationCount,migrations.filter(x=>/^\d/.test(x)).length);assert.equal(v.artifacts.length,1);assert.equal(v.manifest.tableCounts.payments,1);assert(v.manifest.tableCounts.audit_logs>0);assert(v.manifest.tableCounts.notification_attempts>=2);assert(!(await fs.readdir(destination)).some(x=>x.endsWith('.incomplete')));
});
test('2 pg_dump/disk/tool/partial/format failures never produce a valid completed package',async()=>{
  dumpFailure=true;try{await assert.rejects(()=>lib.backup(baseOptions()));}finally{dumpFailure=false;}
  diskFailure=true;try{await assert.rejects(()=>lib.backup(baseOptions()));}finally{diskFailure=false;}
  const failed=(await fs.readdir(destination)).filter(x=>x.endsWith('.incomplete'));assert.equal(failed.length,2);for(const d of failed)await assert.rejects(()=>lib.verifyBackup({...verifyOptions(),backupPath:join(destination,d)}),/INCOMPLETE/);
  await assert.rejects(()=>lib.backup({...baseOptions(),pgBin:join(root,'missing-tools')}));
  oldTools=true;try{await assert.rejects(()=>lib.backup(baseOptions()),/POSTGRES_MAJOR_MISMATCH/);}finally{oldTools=false;}
  const copy=await cloneBackup();const m=JSON.parse(await fs.readFile(join(copy,'manifest.json')));m.formatVersion=999;await fs.writeFile(join(copy,'manifest.json'),JSON.stringify(m));await assert.rejects(()=>lib.verifyBackup({...verifyOptions(),backupPath:copy}),/FORMAT/);
});
test('3 corrupt dump checksum is rejected before a restore database is created',async()=>{
  const copy=await cloneBackup();await fs.appendFile(join(copy,'database.dump'),'corrupt');await assert.rejects(()=>lib.restore({...recoveryOptions(),backupPath:copy}),/DUMP_INTEGRITY/);assert.equal((await admin.query('SELECT 1 FROM pg_database WHERE datname=$1',[process.env.E2_TARGET_DATABASE])).rowCount,0);
});
test('4 missing/wrong-size/wrong-hash canonical artifact fails backup and verification',async()=>{
  const record=(await lib.verifyBackup(verifyOptions())).artifacts[0],file=join(sourceRoot,record.path);await fs.unlink(file);await assert.rejects(()=>lib.backup(baseOptions()),/ARTIFACT_MISSING/);await fs.writeFile(file,pdf);
  const broken=Buffer.from(pdf);broken[broken.length-1]^=1;await fs.writeFile(file,broken);await assert.rejects(()=>lib.backup(baseOptions()),/ARTIFACT_INTEGRITY/);await fs.writeFile(file,Buffer.from('%PDF-'));await assert.rejects(()=>lib.backup(baseOptions()),/ARTIFACT_INTEGRITY/);await fs.writeFile(file,pdf);
  const copy=await cloneBackup();await fs.unlink(join(copy,'report-artifacts',record.path));await assert.rejects(()=>lib.verifyBackup({...verifyOptions(),backupPath:copy}),/ARTIFACT_MISSING/);
});
test('5 destroy disposable source database and files, restore to new owner/database/root',async()=>{
  await db.$disconnect();db=null;const name=new URL(sourceUrl).pathname.slice(1);await admin.query(`DROP DATABASE ${ident(name)} WITH (FORCE)`);
  assert(lib.inside(root,sourceRoot));assert.equal(resolve(dirname(sourceRoot)),resolve(root));await fs.rm(sourceRoot,{recursive:true});sourceDestroyed=true;
  assert.equal((await admin.query('SELECT 1 FROM pg_database WHERE datname=$1',[name])).rowCount,0);await assert.rejects(()=>fs.stat(sourceRoot));
  restored=await lib.restore(recoveryOptions());restoredDb=createDatabaseClient({connectionString:restored.runtimeUrl});assert.notEqual(restored.targetDatabase,name);assert.notEqual(new URL(restored.ownerUrl).username,new URL(sourceUrl).username);
});
test('6 restored migrations/counts/full-row fingerprints and Prisma schema match exactly',async()=>{
  const s=await lib.validateRestored({ownerUrl:restored.ownerUrl,targetArtifactRoot:restored.targetArtifactRoot},await lib.verifyBackup(verifyOptions()));assert.equal(s.rowFingerprint,backup.manifest.rowFingerprint);
  assert.equal(restored.schemaValidation,'passed','Restore helper must enforce an empty supported Prisma schema diff');
});
test('7 restored canonical PDF and historical membership are byte-identical and portable',async()=>{
  const {ReportingService}=req('./dist/modules/reporting/reporting.service'),{ReportArtifactService}=req('./dist/modules/printing/report-artifact.service'),{ReportArtifactStore}=req('./dist/modules/printing/report-artifact.store');
  const projection=await new ReportingService(restoredDb).findVersion(tenant,reportId,1);const service=new ReportArtifactService(restoredDb,{renderPdf:()=>assert.fail('Historical artifact must never regenerate')});service.store=new ReportArtifactStore(restored.targetArtifactRoot);assert.deepEqual(await service.pdf(projection,()=>assert.fail('Frozen PDF requires no settings')),pdf);assert.deepEqual(await restoredDb.reportVersionResult.findMany(),memberships);
});
test('8 restored actual Nest startup/read-only application smoke uses E1 restricted runtime',async()=>{
  process.env.LABFLOW_RECOVERY_MODE='true';process.env.RUNTIME_DATABASE_URL=restored.runtimeUrl;process.env.REPORT_STORAGE_ROOT=restored.targetArtifactRoot;
  const {Test}=req('@nestjs/testing'),{AppModule}=req('./dist/app.module'),{PrismaService}=req('./dist/common/prisma/prisma.service'),{ReportingService}=req('./dist/modules/reporting/reporting.service');
  const mod=await Test.createTestingModule({imports:[AppModule]}).compile();await mod.init();try{const p=mod.get(PrismaService);await assertRuntimePrivileges(p);assert.equal(await p.patient.count(),1);assert.equal(await p.payment.count(),1);assert((await mod.get(ReportingService).findVersion(tenant,reportId,1)).selectedVersion);await assert.rejects(()=>p.$executeRawUnsafe('CREATE TABLE public.e2_forbidden(id int)'));}finally{await mod.close();}
  await lib.validateRestored({ownerUrl:restored.ownerUrl,targetArtifactRoot:restored.targetArtifactRoot},await lib.verifyBackup(verifyOptions()));
});
test('9 recovery mode blocks dispatch, claims, direct send, polling and provider HTTP',async()=>{
  const {NotificationDispatcher}=req('./dist/modules/notifications/notification-dispatcher.service'),{SendPkProvider}=req('./dist/modules/notifications/providers/sendpk.provider');const dispatcher=new NotificationDispatcher(restoredDb,gateway);const prior=calls.length;dispatcher.onModuleInit();await dispatcher.runOnce();assert.equal(await dispatcher.claimDue(),null);await dispatcher.dispatchClaim(holdIds[0],'fixture-worker');await dispatcher.onModuleDestroy();assert.equal(calls.length,prior);
  const fetchBefore=global.fetch;let http=0;global.fetch=async()=>{http++;throw new Error('Forbidden network');};try{const provider=new SendPkProvider();await provider.send({mobile:'923000000001',templateId:'fixture',variables:{}});await assert.rejects(()=>provider.checkDelivery('fixture'));await provider.checkBalance();await assert.rejects(()=>provider.listTemplates());assert.equal(http,0);}finally{global.fetch=fetchBefore;}
});
test('10 explicit post-comparison cutover holds restored SMS and public sync without rewriting evidence',async()=>{
  cutover=await lib.cutover({...verifyOptions(),ownerUrl:restored.ownerUrl,targetArtifactRoot:restored.targetArtifactRoot});assert.equal(cutover.notifications,3);const held=await restoredDb.notification.findMany({where:{id:{in:holdIds}}});assert(held.every(x=>x.status==='RECONCILIATION_REQUIRED'&&x.lastErrorCode==='RESTORED_BACKUP_UNCERTAIN'&&!x.nextAttemptAt&&!x.nextDeliveryCheckAt&&!x.claimedBy));assert.deepEqual(await restoredDb.notification.findMany({where:{status:'SENT'},orderBy:{id:'asc'}}),sentRows);
  const sync=await restoredDb.syncOutbox.findMany({where:{eventType:'public-report/v1'}});assert(cutover.syncIntents>0);assert(sync.filter(x=>x.failureCode==='RECOVERY_HOLD').length===cutover.syncIntents);assert(sync.every(x=>!['QUEUED','RETRYING','SYNCING'].includes(x.status)));
  assert.deepEqual((await restoredDb.configuration.findUniqueOrThrow({where:{tenantId_key:{tenantId:tenant,key:'public-sync'}}})).value,{enabled:false,recoveryHold:true});
  process.env.LABFLOW_RECOVERY_MODE='false';const liveUrl=new URL(restored.runtimeUrl);liveUrl.searchParams.delete('options');const live=createDatabaseClient({connectionString:liveUrl.toString()});
  try{const dispatcher=new(req('./dist/modules/notifications/notification-dispatcher.service').NotificationDispatcher)(live,gateway);assert.equal(await dispatcher.claimDue(),null);await dispatcher.runOnce();assert.equal(calls.length,2);await dispatcher.onModuleDestroy();}finally{await live.$disconnect();process.env.LABFLOW_RECOVERY_MODE='true';}
});
test('11 restored sessions compare unchanged first, then revoke with atomic recovery audit',async()=>{
  assert(sessionRows.length>0);assert.equal(cutover.sessions,sessionRows.length);const sessions=await restoredDb.authSession.findMany();assert(sessions.every(x=>x.revokedAt&&x.revocationReason==='DISASTER_RECOVERY'));assert.equal(await new(req('./dist/modules/auth/auth.service').AuthService)(restoredDb).validateSession(session),null);assert.equal(await restoredDb.auditLog.count({where:{action:'RECOVERY_CUTOVER'}}),1);
});
test('12 operational/overlapping/existing restore targets refuse; verify-only is read-only',async()=>{
  await assert.rejects(()=>lib.restore({...recoveryOptions(),targetDatabase:'lms_v2'}),/OPERATIONAL_RESTORE_REFUSED/);
  await assert.rejects(()=>lib.restore({...recoveryOptions(),targetArtifactRoot:sourceRoot}),/OPERATIONAL_RESTORE_REFUSED/);
  await assert.rejects(()=>lib.restore({...recoveryOptions(),targetDatabase:process.env.E2_TARGET_DATABASE,targetArtifactRoot:join(root,'other')}),/TARGET_DATABASE_EXISTS/);
  await assert.rejects(()=>lib.restore({...recoveryOptions(),targetDatabase:'lms_v2_restore_test_other'}),/TARGET_ARTIFACT_ROOT_EXISTS/);
  const check=cp.spawnSync('powershell.exe',['-NoProfile','-File',resolve('../../scripts/restore-labflow.ps1'),'-BackupPath',backup.backupPath,'-VerifyOnly'],{encoding:'utf8',timeout:60000});assert.equal(check.status,0,'PowerShell VerifyOnly must work without connecting to destroyed source DB');assert.match(check.stdout,/passed/);
  for(const value of ['E2 Synthetic private',session,new URL(sourceUrl).password])assert(!check.stdout.includes(value),'Verification output must contain no private fixture data');
});
test('13 manifests/logs contain no secrets/PII; verified status and safe retention preserve newest',async()=>{
  const text=await fs.readFile(join(backup.backupPath,'manifest.json'),'utf8');for(const forbidden of ['E2 Synthetic private','03000000001',session,'DATABASE_URL','RUNTIME_DATABASE_URL','PROVISION_DATABASE_URL','SENDPK_API_KEY'])assert(!text.includes(forbidden));assert(!text.includes(new URL(sourceUrl).password));assert(!text.includes(new URL(restored.runtimeUrl).password));
  const latest=await lib.status({...baseOptions(),retentionDays:1});assert.equal(latest.verification,'passed');
  // Retention only considers valid completed packages and never deletes the newest.
  const m=JSON.parse(text);m.createdAt='2020-01-01T00:00:00.000Z';await fs.writeFile(join(backup.backupPath,'manifest.json'),JSON.stringify(m));await lib.retention({...baseOptions(),retentionDays:1});assert((await fs.stat(backup.backupPath)).isDirectory());assert((await fs.readdir(destination)).some(x=>x.endsWith('.incomplete')));assert(sourceDestroyed);
  const newestId='LabFlow_Backup_'+new Date().toISOString().replace(/[:.]/g,'-')+'_'+randomUUID(),newestPath=join(destination,newestId);
  await fs.cp(backup.backupPath,newestPath,{recursive:true});m.backupId=newestId;m.createdAt=new Date().toISOString();await fs.writeFile(join(newestPath,'manifest.json'),JSON.stringify(m));
  const unrelated=join(destination,'keep-unrelated');await fs.mkdir(unrelated);await fs.writeFile(join(unrelated,'manifest.json'),'{}');
  await lib.retention({...baseOptions(),retentionDays:1});await assert.rejects(()=>fs.stat(backup.backupPath));assert((await fs.stat(newestPath)).isDirectory());assert((await fs.stat(unrelated)).isDirectory());
});

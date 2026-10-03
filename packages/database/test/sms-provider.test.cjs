// Eight small SMS provider groups, preserving the D2 queue and existing history.
const assert=require('node:assert/strict');const {test,before,after}=require('node:test');const {randomUUID,randomBytes}=require('node:crypto');
const {createRequire,Module}=require('node:module');const {resolve}=require('node:path');const {readFileSync}=require('node:fs');
const {createDatabaseClient}=require('@lms/database');const req=createRequire(resolve('../../apps/api/package.json'));
const {SettingsService}=req('./dist/modules/settings/settings.service');const {NotificationsService}=req('./dist/modules/notifications/notifications.service');
const {NotificationDispatcher}=req('./dist/modules/notifications/notification-dispatcher.service');
const {BillingService}=req('./dist/modules/billing/billing.service');const {BookingsService}=req('./dist/modules/bookings/bookings.service');
const {LaboratoryService}=req('./dist/modules/laboratory/laboratory.service');const {selectSmsGateway}=req('./dist/modules/notifications/sms-provider-config');
let db;
before(()=>{const url=process.env.DATABASE_TEST_URL;assert(url&&/^\/labflow_prisma7_test_[a-f0-9]{16}$/.test(new URL(url).pathname));db=createDatabaseClient({connectionString:url});});
after(async()=>{await db?.$disconnect();});
async function fixture(){
  const tenantId=(await db.tenant.create({data:{name:'SMS synthetic lab',slug:randomUUID()}})).id;
  const branchId=(await db.branch.create({data:{tenantId,name:'Fixture',code:'SMS'}})).id;
  const username='sms-'+randomUUID();
  const actor=(await db.user.create({data:{tenantId,branchId,username,fullName:'Fixture actor',role:'ADMIN',passwordHash:'not-a-login'}})).id;
  const patient=await db.patient.create({data:{tenantId,branchId,fullName:'Synthetic patient',phone:'03000000001',labNumber:'SMS',mrcNumber:'SMS',smsConsent:true}});
  for(const key of ['SAMPLE_COLLECTED','REPORT_READY'])await db.smsTemplate.create({data:{tenantId,key,name:key,body:'Hello {{patientName}}',isActive:true,sendpkTemplateId:'fixture',sendpkRequiredVariables:['patient_name']}});
  const calls={send:0,balance:0,templates:0,delivery:0};const gw={isConfigured:()=>true,getSenderId:()=> 'Fixture',
    send:async()=>{calls.send++;return {success:true,providerMessageId:'123456',rawResponse:'OK'};},
    checkBalance:async()=>{calls.balance++;return 10;},listTemplates:async()=>{calls.templates++;return [];},checkDelivery:async()=>{calls.delivery++;return 'PENDING';}};
  const notifications=new NotificationsService(db,gw);return {tenantId,branchId,actor,username,patient,gw,calls,notifications,settings:new SettingsService(db,gw),worker:new NotificationDispatcher(db,gw)};
}
const toggle=(f,enabled)=>f.settings.saveSmsProvider(f.tenantId,'ADMIN',{enabled,provider:'SENDPK'});
async function queue(f){return db.$transaction(tx=>f.notifications.queueTemplatedSms(tx,f.tenantId,'SAMPLE_COLLECTED',f.patient.phone,{patientName:f.patient.fullName},{relatedType:'Booking',relatedId:randomUUID(),patientId:f.patient.id}));}
const current=id=>db.notification.findUniqueOrThrow({where:{id},include:{attemptsHistory:true}});
test('1 enabled SENDPK and the absent-row compatibility default preserve current intent/dispatch',async()=>{
  const f=await fixture();assert.deepEqual((await f.settings.getPublicSettings(f.tenantId)).smsProvider,{enabled:true,provider:'SENDPK'});
  await toggle(f,true);const n=await queue(f);await f.worker.runOnce();assert.equal((await current(n.notificationId)).status,'SENT');assert.equal(f.calls.send,1);
  assert.equal(selectSmsGateway('unsupported',f.gw),undefined);
  await assert.rejects(()=>f.settings.saveSmsProvider(f.tenantId,'ADMIN',{enabled:true,provider:'TWILIO'}));
});
test('2 disabled SMS creates no intent and sample/result/report business transactions still succeed',async()=>{
  const f=await fixture();await toggle(f,false);assert.equal((await queue(f)).reason,'DISABLED');
  const catalog=await db.test.create({data:{tenantId:f.tenantId,code:randomUUID(),name:'Fixture test',basePrice:100,parameters:{create:{code:'P',name:'Parameter'}}}});
  const booking=await db.booking.create({data:{tenantId:f.tenantId,branchId:f.branchId,patientId:f.patient.id,bookingCode:randomUUID()}});
  const invoice=await new BillingService(db,new BookingsService(db)).createInvoice(f.tenantId,f.branchId,{bookingId:booking.id,lines:[{testId:catalog.id,quantity:1}]});
  const order=invoice.visit.orderedTests[0],lab=new LaboratoryService(db,f.notifications,{notifySampleChanged:()=>{}});
  const sample=await lab.collectSample(f.tenantId,f.branchId,{invoiceId:invoice.id,orderedTestIds:[order.id],sampleType:'Blood'},f.actor);
  await lab.receiveSample(f.tenantId,sample.id,f.actor);await lab.acceptSample(f.tenantId,sample.id,undefined,f.actor);
  await lab.enterResult(f.tenantId,{sampleId:sample.id,orderedTestId:order.id,values:[{versionParameterId:order.testVersion.versionParameters[0].id,valueNumeric:15}],releaseImmediately:true},f.actor);
  assert((await db.report.findUniqueOrThrow({where:{id:invoice.report.id}})).currentVersionId);
  assert.equal(await db.notification.count({where:{tenantId:f.tenantId}}),0);await f.worker.runOnce();assert.equal(f.calls.send,0);
});
test('3 disabled queued/pre-dispatch leases are abandoned without sending; worker independently rechecks',async()=>{
  const f=await fixture(),n=await queue(f),claim=await f.worker.claimDue();assert.equal(claim.id,n.notificationId);
  await toggle(f,false);await f.worker.dispatchClaim(claim.id,claim.owner);let row=await current(n.notificationId);assert.equal(row.status,'ABANDONED');assert.equal(row.lastErrorCode,'PROVIDER_DISABLED');assert.equal(row.attempts,0);
  const other=await fixture(),q=await queue(other),c=await other.worker.claimDue();
  // Simulate server configuration changed outside the settings service cancellation path.
  await db.configuration.create({data:{tenantId:other.tenantId,key:'sms_provider',value:{enabled:false,provider:'SENDPK'}}});
  await other.worker.dispatchClaim(c.id,c.owner);row=await current(q.notificationId);assert.equal(row.lastErrorCode,'PROVIDER_DISABLED');assert.equal(other.calls.send,0);assert.equal(f.calls.send,0);
});
test('4 stale/direct authenticated SMS endpoints cannot bypass current provider disable',async()=>{
  const f=await fixture(),n=await queue(f);await toggle(f,false);
  const password=randomBytes(24).toString('base64url');await db.user.update({where:{id:f.actor},data:{passwordHash:await req('bcrypt').hash(password,4)}});
  const {Test}=req('@nestjs/testing'),{ValidationPipe}=req('@nestjs/common'),{AppModule}=req('./dist/app.module'),{SMS_GATEWAY}=req('./dist/modules/notifications/providers/sms-gateway.interface');
  const module=await Test.createTestingModule({imports:[AppModule]}).overrideProvider(SMS_GATEWAY).useValue(f.gw).compile();
  const app=module.createNestApplication({logger:false});app.useGlobalPipes(new ValidationPipe({whitelist:true,forbidNonWhitelisted:true,transform:true}));
  try{
    await app.listen(0,'127.0.0.1');const base=await app.getUrl();const login=await fetch(base+'/auth/login',{method:'POST',headers:{'Content-Type':'application/json','x-tenant-id':f.tenantId},body:JSON.stringify({username:f.username,password})});assert.equal(login.status,200);const session=(await login.json()).sessionId;
    const headers={'Content-Type':'application/json','x-session-id':session};
    for(const [path,method,body] of [['/settings/sms/sync','POST'],['/settings/sms/SAMPLE_COLLECTED','PUT',{body:'Hello {{patientName}}',isActive:true}],['/notifications/'+n.notificationId+'/retry','POST']]){
      const r=await fetch(base+path,{method,headers,...(body?{body:JSON.stringify(body)}:{})});assert.equal(r.status,400);
    }
    const settings=await fetch(base+'/settings/sms',{headers});assert.equal(settings.status,200);const result=await settings.json();assert.deepEqual(result.events,[]);assert.equal(result.provider.configured,false);
    assert.equal(f.calls.send+f.calls.balance+f.calls.templates+f.calls.delivery,0);
  }finally{await app.close();}
});
test('5 re-enable affects new events only; old provider-disabled intent requires explicit safe retry',async()=>{
  const f=await fixture(),old=await queue(f);await toggle(f,false);await toggle(f,true);await f.worker.runOnce();assert.equal((await current(old.notificationId)).status,'ABANDONED');assert.equal(f.calls.send,0);
  const fresh=await queue(f);await f.worker.runOnce();assert.equal((await current(fresh.notificationId)).status,'SENT');assert.equal(f.calls.send,1);
  await f.notifications.retry(old.notificationId,f.tenantId);await f.worker.runOnce();assert.equal((await current(old.notificationId)).status,'SENT');assert.equal(f.calls.send,2);
});
function renderSettings(enabled,tab){
  const webReq=createRequire(resolve('../../apps/web/package.json')),React=webReq('react'),{renderToStaticMarkup}=webReq('react-dom/server'),ts=webReq('typescript');
  const path=resolve('../../apps/web/src/pages/settings/SettingsPage.tsx');const js=ts.transpileModule(readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;
  const m=new Module(path);m.filename=path;m.paths=[];
  m.require=id=>{
    if(id==='react')return {...React,useState:initial=>React.useState(initial==='users'?tab:initial)};
    if(id.includes('contexts/AuthContext'))return {useAuth:()=>({user:{role:'ADMIN'}})};
    if(id.includes('contexts/SettingsContext'))return {useSettings:()=>({branding:{},printLayout:{},discountMode:'PER_LINE',smsProvider:{enabled,provider:'SENDPK'},refresh:async()=>{}})};
    if(id.includes('api/settings'))return {};
    if(id.includes('SmsSettingsTab'))return {SmsSettingsTab:()=>React.createElement('div',null,'SMS_DETAILS_FIXTURE')};
    if(id.includes('components/Loading'))return {Loading:()=>null};
    return webReq(id);
  };
  m._compile(js,path);return renderToStaticMarkup(React.createElement(m.exports.SettingsPage));
}
test('6 actual settings render hides SMS navigation/details off while master control remains accessible',()=>{
  const off=renderSettings(false,'channels');assert(off.includes('Optional features'));assert(off.includes('Enable SMS'));assert(!off.includes('SMS / Notifications'));assert(!off.includes('SMS provider'));assert(!off.includes('SMS_DETAILS_FIXTURE'));
  assert(!renderSettings(false,'sms').includes('SMS_DETAILS_FIXTURE'));const on=renderSettings(true,'channels');assert(on.includes('SMS / Notifications'));assert(on.includes('SMS provider'));assert(!on.includes('TWILIO'));assert(renderSettings(true,'sms').includes('SMS_DETAILS_FIXTURE'));
});
test('7 historical sent notifications/attempts/templates remain unchanged and disabled lookup performs no HTTP',async()=>{
  const f=await fixture(),n=await queue(f);await f.worker.runOnce();const old=await current(n.notificationId),templates=await db.smsTemplate.findMany({where:{tenantId:f.tenantId},orderBy:{key:'asc'}});
  // Make accepted delivery lookup due before disabling; off must leave evidence unchanged.
  await db.notification.update({where:{id:n.notificationId},data:{nextDeliveryCheckAt:new Date(Date.now()-1000)}});const before=await current(n.notificationId);
  await toggle(f,false);await f.settings.getSmsSettings(f.tenantId);await f.worker.runOnce();assert.deepEqual(await current(n.notificationId),before);
  assert.deepEqual(await db.smsTemplate.findMany({where:{tenantId:f.tenantId},orderBy:{key:'asc'}}),templates);assert.equal(f.calls.delivery+f.calls.balance+f.calls.templates,0);assert.deepEqual(before.attemptsHistory,old.attemptsHistory);
});
test('8 master configuration audit is transactional, scoped, safe and contains before/after metadata',async()=>{
  const f=await fixture();await toggle(f,false);await toggle(f,true);
  const audits=await db.auditLog.findMany({where:{tenantId:f.tenantId,entityId:'sms_provider'},orderBy:{createdAt:'asc'}});assert.equal(audits.length,2);
  assert.equal(audits[0].before.enabled,true);assert.equal(audits[0].after.enabled,false);assert.equal(audits[1].after.provider,'SENDPK');assert(!/api.?key|password|credential/i.test(JSON.stringify(audits)));
  await assert.rejects(()=>f.settings.saveSmsProvider(f.tenantId,'LAB_OPERATOR',{enabled:false,provider:'SENDPK'}));
});

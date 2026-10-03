// D1 A-L and the six requested discount checks. Only fresh disposable fixtures.
const assert=require('node:assert/strict');
const {test,before,after}=require('node:test');
const {createRequire}=require('node:module');
const {resolve}=require('node:path');
const {randomBytes,randomUUID,createHash}=require('node:crypto');
const {createDatabaseClient}=require('@lms/database');
const req=createRequire(resolve('../../apps/api/package.json'));
const {AuthService}=req('./dist/modules/auth/auth.service');
const {SettingsService}=req('./dist/modules/settings/settings.service');
const {BillingService}=req('./dist/modules/billing/billing.service');
const {BookingsService}=req('./dist/modules/bookings/bookings.service');
const {auditContext,appendAudit}=req('./dist/common/audit');
const {buildInvoiceHtml}=req('./dist/modules/printing/templates/invoice.template');
const bcrypt=req('bcrypt');
let db,secondDb,authA,authB,settings,billing,tenantId,branchId,branchB,actor,patient,catalog,app,base;
const secrets=[],priorTenant=process.env.DEFAULT_TENANT_ID;
const hash=v=>createHash('sha256').update(v).digest('hex');
before(async()=>{
 const url=process.env.DATABASE_TEST_URL;
 assert(url&&/^\/labflow_prisma7_test_[a-f0-9]{16}$/.test(new URL(url).pathname));
 db=createDatabaseClient({connectionString:url});secondDb=createDatabaseClient({connectionString:url});
 tenantId=(await db.tenant.create({data:{name:'D1 fixture',slug:'d1-fixture'}})).id;
 process.env.DEFAULT_TENANT_ID=tenantId;
 branchId=(await db.branch.create({data:{tenantId,name:'A',code:'A'}})).id;
 branchB=(await db.branch.create({data:{tenantId,name:'B',code:'B'}})).id;
 authA=new AuthService(db);authB=new AuthService(secondDb);
 settings=new SettingsService(db,{isConfigured:()=>false});
 actor=await user();
 patient=await db.patient.create({data:{tenantId,branchId,fullName:'Synthetic fixture',phone:'03000000000',labNumber:'D1',mrcNumber:'D1',smsConsent:false}});
 catalog=await db.test.create({data:{tenantId,code:'D1',name:'Fixture test',basePrice:1000,parameters:{create:{code:'P',name:'Frozen parameter'}}}});
 billing=new BillingService(db,new BookingsService(db),{notifyInvoiceChanged:()=>{}});
 const {NestFactory}=req('@nestjs/core'),{ValidationPipe}=req('@nestjs/common'),{AppModule}=req('./dist/app.module');
 app=await NestFactory.create(AppModule,{logger:false});app.useGlobalPipes(new ValidationPipe({whitelist:true,forbidNonWhitelisted:true,transform:true}));
 await app.listen(0,'127.0.0.1');base=await app.getUrl();
});
after(async()=>{await app?.close();await db?.$disconnect();await secondDb?.$disconnect();if(priorTenant===undefined)delete process.env.DEFAULT_TENANT_ID;else process.env.DEFAULT_TENANT_ID=priorTenant;});
async function user(){const password=randomBytes(24).toString('hex'),passwordHash=await bcrypt.hash(password,4);secrets.push(password,passwordHash);const row=await db.user.create({data:{tenantId,branchId,username:randomUUID(),fullName:'Synthetic operator',role:'ADMIN',passwordHash}});return {...row,password};}
async function login(u,auth=authA){const value=await auth.login({username:u.username,password:u.password});secrets.push(value.sessionId);return value.sessionId;}
function asActor(fn,sessionRecordId){return auditContext.run({tenantId,actorId:actor.id,sessionRecordId,ipAddress:'127.0.0.1',userAgent:'D1 fixture'},fn);}
async function request(path,token,method='GET',body){return fetch(base+path,{method,headers:{'Content-Type':'application/json',...(token?{'x-session-id':token}:{})},...(body?{body:JSON.stringify(body)}:{})});}
async function sale(extra={},lines=[{testId:catalog.id}]){const booking=await db.booking.create({data:{tenantId,branchId,patientId:patient.id,bookingCode:randomUUID(),status:'CONFIRMED'}});return asActor(()=>billing.createInvoice(tenantId,branchId,{bookingId:booking.id,lines,...extra}));}
async function mode(value){return asActor(()=>settings.saveDiscountMode(tenantId,'ADMIN',{mode:value}));}
const pay=(inv,amount)=>billing.recordPayment(tenantId,inv.id,{amount,method:'CASH',operationKey:randomUUID()},actor.id);

test('A session survives service restart and is shared across independent clients',async()=>{
 const u=await user(),token=await login(u);authA.onModuleDestroy();const restarted=new AuthService(secondDb);
 assert.equal((await restarted.getSession(token)).userId,u.id);
 const stored=await db.authSession.findUniqueOrThrow({where:{tokenHash:hash(token)}});assert.notEqual(stored.tokenHash,token);assert.equal(stored.tokenHash.length,64);
 assert.equal(stored.expiresAt-stored.lastSeenAt,12*60*60*1000);
 await db.$executeRaw`UPDATE auth_sessions SET "createdAt"=clock_timestamp()-interval '2 hours',"lastSeenAt"=clock_timestamp()-interval '2 hours',"expiresAt"=clock_timestamp()+interval '10 hours' WHERE id=${stored.id}`;
 await restarted.validateSession(token);const touched=await db.authSession.findUniqueOrThrow({where:{id:stored.id}});
 assert(touched.lastSeenAt>stored.lastSeenAt);assert(touched.expiresAt>stored.expiresAt);
 await assert.rejects(()=>db.authSession.create({data:{tenantId,userId:u.id,tokenHash:hash(token),expiresAt:new Date(Date.now()+10000)}}));
 const other=await db.tenant.create({data:{name:'Other tenant',slug:'d1-other'}});
 await assert.rejects(()=>db.authSession.create({data:{tenantId:other.id,userId:u.id,tokenHash:hash(randomUUID()),expiresAt:new Date(Date.now()+10000)}}));
});
test('B logout revokes durably across instances and subsequent HTTP requests',async()=>{
 const u=await user(),token=await login(u);await authB.logout(token);assert.equal(await authA.validateSession(token),null);
 assert.equal(await new AuthService(db).validateSession(token),null);assert.equal((await request('/auth/me',token)).status,401);
 const records=await db.auditLog.findMany({where:{tenantId,actorId:u.id,action:'LOGOUT'}});assert.equal(records.length,1);
 await authB.logout(token);assert.equal(await db.auditLog.count({where:{tenantId,actorId:u.id,action:'LOGOUT'}}),1);
});
test('C deactivation transaction revokes every session and rejects the next request',async()=>{
 const u=await user(),a=await login(u),b=await login(u,authB);
 await asActor(()=>settings.updateUser(tenantId,'ADMIN',u.id,{isActive:false}));
 assert.equal(await authA.validateSession(a),null);assert.equal(await authB.validateSession(b),null);
 assert.equal((await request('/auth/me',a)).status,401);assert.equal(await db.authSession.count({where:{userId:u.id,revokedAt:null}}),0);
 await asActor(()=>settings.updateUser(tenantId,'ADMIN',u.id,{isActive:true}));assert.equal(await authB.validateSession(b),null);assert(await login(u));
 const fresh=await login(u);await db.tenant.update({where:{id:tenantId},data:{isActive:false}});
 try{assert.equal(await authA.validateSession(fresh),null);}finally{await db.tenant.update({where:{id:tenantId},data:{isActive:true}});}
});
test('D role changes take effect in SessionGuard and PermissionGuard on the next request',async()=>{
 const u=await user(),token=await login(u);assert.equal((await request('/settings/audit',token)).status,200);
 await asActor(()=>settings.updateUser(tenantId,'ADMIN',u.id,{role:'LAB_TECH'}));
 assert.equal((await authB.getSession(token)).role,'LAB_TECH');assert.equal((await request('/settings/audit',token)).status,403);
 assert.equal((await request('/auth/me',token)).status,200);
});
test('E branch assignment and removal are read freshly',async()=>{
 const u=await user(),token=await login(u);await asActor(()=>settings.updateUser(tenantId,'ADMIN',u.id,{branchId:branchB}));
 assert.equal((await authB.getSession(token)).branchId,branchB);assert.equal((await (await request('/auth/me',token)).json()).branchId,branchB);
 await asActor(()=>settings.updateUser(tenantId,'ADMIN',u.id,{branchId:null}));assert.equal((await authA.getSession(token)).branchId,null);
});
test('F persisted database expiry rejects without any cleanup timer',async()=>{
 const u=await user(),token=await login(u);
 await db.$executeRaw`UPDATE auth_sessions SET "createdAt"=clock_timestamp()-interval '13 hours',"lastSeenAt"=clock_timestamp()-interval '13 hours',"expiresAt"=clock_timestamp()-interval '1 hour' WHERE "tokenHash"=${hash(token)}`;
 assert.equal(await new AuthService(secondDb).validateSession(token),null);assert.equal((await request('/auth/me',token)).status,401);
 assert.equal(await db.authSession.count({where:{tokenHash:hash(token)}}),1);
});
test('G lockout persists across instances/restart for existing and unknown normalized usernames',async()=>{
 const u=await user(),unknown=randomUUID();
 for(const name of [u.username,unknown]){
  for(let i=0;i<5;i++)await assert.rejects(()=>(i%2?authA:authB).login({username:name,password:randomUUID()}),/Invalid username or password/);
  await assert.rejects(()=>new AuthService(secondDb).login({username:' '+name.toUpperCase()+' ',password:u.password}),/Too many failed attempts/);
  assert.equal((await db.loginAttempt.findUniqueOrThrow({where:{attemptKey:hash(name)}})).failures,5);
 }
});
test('H concurrent failures preserve increments and a successful login resets counters',async()=>{
 const name=randomUUID();const result=await Promise.allSettled(Array.from({length:5},(_,i)=>(i%2?authA:authB).login({username:name,password:randomUUID()})));
 assert.equal(result.filter(r=>r.status==='rejected').length,5);const attempt=await db.loginAttempt.findUniqueOrThrow({where:{attemptKey:hash(name)}});assert.equal(attempt.failures,5);assert(attempt.lockedUntil);
 const u=await user();await assert.rejects(()=>authA.login({username:u.username,password:randomUUID()}));
 await Promise.all([login(u,authA),login(u,authB)]);assert.equal((await db.loginAttempt.findUniqueOrThrow({where:{attemptKey:hash(u.username)}})).failures,0);
});
test('I self password change keeps current session/revokes other devices; admin reset revokes all',async()=>{
 const u=await user(),current=await login(u),secondary=await login(u,authB),session=await authA.validateSession(current),newPassword=randomBytes(24).toString('hex');secrets.push(newPassword);
 await assert.rejects(()=>asActor(()=>authA.updateOwnProfile(u.id,tenantId,{currentPassword:randomUUID(),newPassword}),session.sessionRecordId));
 assert(await authB.validateSession(secondary));
 await auditContext.run({tenantId,actorId:u.id,sessionRecordId:session.sessionRecordId},()=>authA.updateOwnProfile(u.id,tenantId,{currentPassword:u.password,newPassword}));
 assert(await authB.validateSession(current));assert.equal(await authA.validateSession(secondary),null);await assert.rejects(()=>login(u));
 const updated={...u,password:newPassword},newSession=await login(updated),reset=randomBytes(24).toString('hex');secrets.push(reset);
 await asActor(()=>settings.updateUser(tenantId,'ADMIN',u.id,{password:reset}));assert.equal(await authA.validateSession(current),null);assert.equal(await authB.validateSession(newSession),null);
 assert(await login({...u,password:reset}));
});
test('J audit insert failure rolls back payment and role/password security mutations',async()=>{
 await mode('PER_LINE');const inv=await sale(),u=await user(),token=await login(u),original=await db.user.findUniqueOrThrow({where:{id:u.id}});
 await db.$executeRawUnsafe(`CREATE FUNCTION d1_fixture_fail_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action IN ('PAYMENT_RECORDED','ROLE_CHANGE','PASSWORD_CHANGE') THEN RAISE EXCEPTION 'fixture audit failure'; END IF; RETURN NEW; END $$`);
 await db.$executeRawUnsafe('CREATE TRIGGER d1_fixture_fail BEFORE INSERT ON audit_logs FOR EACH ROW EXECUTE FUNCTION d1_fixture_fail_audit()');
 try{
  await assert.rejects(()=>pay(inv,100));assert.equal(await db.payment.count({where:{invoiceId:inv.id}}),0);assert.equal((await db.invoice.findUniqueOrThrow({where:{id:inv.id}})).amountDue.toFixed(2),'1000.00');
  await assert.rejects(()=>asActor(()=>settings.updateUser(tenantId,'ADMIN',u.id,{role:'LAB_TECH'})));
  await assert.rejects(()=>asActor(()=>settings.updateUser(tenantId,'ADMIN',u.id,{password:randomUUID()})));
  const retained=await db.user.findUniqueOrThrow({where:{id:u.id}});assert.equal(retained.role,original.role);assert(retained.passwordHash===original.passwordHash);assert(await authB.validateSession(token));
 }finally{await db.$executeRawUnsafe('DROP TRIGGER d1_fixture_fail ON audit_logs');await db.$executeRawUnsafe('DROP FUNCTION d1_fixture_fail_audit()');}
});
test('K PostgreSQL rejects audit update/delete/truncate',async()=>{
 const row=await db.auditLog.findFirstOrThrow({where:{tenantId}}),count=await db.auditLog.count();
 await assert.rejects(()=>db.auditLog.update({where:{id:row.id},data:{action:'ALTERED'}}));await assert.rejects(()=>db.auditLog.delete({where:{id:row.id}}));await assert.rejects(()=>db.$executeRawUnsafe('TRUNCATE audit_logs'));
 assert.equal(await db.auditLog.count(),count);assert.deepEqual(await db.auditLog.findUniqueOrThrow({where:{id:row.id}}),row);
});
test('L audit is bounded, contains no credentials/tokens, and listing is scoped/paginated/admin-only',async()=>{
 const sentinel=randomBytes(24).toString('hex');secrets.push(sentinel);
 await asActor(()=>db.$transaction(tx=>appendAudit(tx,{tenantId,action:'D1_METADATA_CHECK',entityType:'Fixture',entityId:'bounded',after:{password:sentinel,passwordHash:sentinel,rawToken:sentinel,smsCredentials:sentinel,apiKey:sentinel,pdfBytes:sentinel,reason:'x'.repeat(5000),ok:true}})));
 const row=await db.auditLog.findFirstOrThrow({where:{tenantId,action:'D1_METADATA_CHECK'}});assert.equal(row.after.reason.length,1000);assert.deepEqual(Object.keys(row.after).sort(),['ok','reason']);assert.equal(row.actorId,actor.id);assert.equal(row.ipAddress,'127.0.0.1');
 const httpToken=await login(actor);
 const saved=await request('/settings/sms/REPORT_READY',httpToken,'PUT',{body:'Fixture '+sentinel,isActive:false,sendpkTemplateId:'fixture-map'});assert.equal(saved.status,200);
 const savedTemplate=await saved.json(),smsAudit=await db.auditLog.findFirstOrThrow({where:{tenantId,entityType:'SmsTemplate',entityId:savedTemplate.id},orderBy:{createdAt:'desc'}});
 assert.equal(smsAudit.actorId,actor.id);assert.equal(smsAudit.ipAddress,'127.0.0.1');assert(smsAudit.userAgent);
 const syncSettings=new SettingsService(db,{listTemplates:async()=>[{id:'fixture-map',name:'Approved fixture',message:sentinel,variables:[]}]});
 await asActor(()=>syncSettings.syncSendPkTemplates(tenantId,'ADMIN'));
 assert.equal((await db.smsTemplate.findUniqueOrThrow({where:{id:savedTemplate.id}})).sendpkApprovedBody,sentinel);
 const serialized=JSON.stringify(await db.auditLog.findMany());for(const secret of secrets)assert(!serialized.includes(secret),'Credential/token omitted from audit');assert(!serialized.includes('passwordHash'));
 const token=await login(actor),res=await request('/settings/audit?action=LOGIN_SUCCESS&actorId='+actor.id+'&limit=1&page=1',token);assert.equal(res.status,200);const list=await res.json();assert.equal(list.items.length,1);assert(list.items.every(r=>r.tenantId===tenantId&&r.actorId===actor.id&&r.action==='LOGIN_SUCCESS'));
 assert.equal((await request('/settings/audit',null)).status,401);assert.equal((await request('/settings/audit?limit=1000',token)).status,400);
});
test('Discount 1 PER_LINE retains test/package discount arithmetic and defaults',async()=>{
 await mode('PER_LINE');const pkg=await db.package.create({data:{tenantId,code:'D1-PACK',name:'Fixture package',basePrice:600,items:{create:{testId:catalog.id}}}});
 const inv=await sale({},[{testId:catalog.id,manualDiscount:100},{packageId:pkg.id,manualDiscount:50}]);assert.equal(inv.discountMode,'PER_LINE');assert.equal(inv.subtotal.toFixed(2),'1600.00');assert.equal(inv.discountTotal.toFixed(2),'150.00');assert.equal(inv.grandTotal.toFixed(2),'1450.00');assert.equal(inv.invoiceDiscountAmount.toFixed(2),'0.00');
});
test('Discount 2 INVOICE_LEVEL applies fixed discount once after subtotal without adjustment rows',async()=>{
 await mode('INVOICE_LEVEL');const inv=await sale({invoiceDiscountAmount:125.25},[{testId:catalog.id,quantity:2}]);assert.equal(inv.subtotal.toFixed(2),'2000.00');assert.equal(inv.grandTotal.toFixed(2),'1874.75');assert.equal(inv.discountTotal.toFixed(2),'125.25');assert.equal(inv.invoiceDiscountAmount.toFixed(2),'125.25');assert.equal(inv.lines[0].lineTotal.toFixed(2),'2000.00');assert.equal(inv.lines[0].discountAmount.toFixed(2),'0.00');assert.equal(await db.invoiceAdjustment.count({where:{invoiceId:inv.id}}),0);
 for(const amount of [-1,0.001,2001])await assert.rejects(()=>sale({invoiceDiscountAmount:amount},[{testId:catalog.id,quantity:2}]));
});
test('Discount 3 current server mode rejects mixed discounts and direct SQL bypass',async()=>{
 await mode('INVOICE_LEVEL');await assert.rejects(()=>sale({invoiceDiscountAmount:100},[{testId:catalog.id,manualDiscount:50}]));
 const inv=await sale({invoiceDiscountAmount:100});await assert.rejects(()=>db.invoiceLine.create({data:{invoiceId:inv.id,description:'Mixed',unitPrice:1,basePrice:1,lineTotal:0,discountAmount:1,manualDiscount:1}}));
 await mode('PER_LINE');await assert.rejects(()=>sale({invoiceDiscountAmount:100}));
});
test('Discount 4 config switches preserve old invoice snapshots/totals and native snapshot guard',async()=>{
 await mode('PER_LINE');const old=await sale({},[{testId:catalog.id,manualDiscount:100}]);await mode('INVOICE_LEVEL');const fresh=await sale({invoiceDiscountAmount:200});await mode('PER_LINE');
 const current=await billing.findInvoiceById(tenantId,old.id),retained=await billing.findInvoiceById(tenantId,fresh.id);assert.equal(current.discountMode,'PER_LINE');assert.equal(current.grandTotal.toFixed(2),'900.00');assert.equal(retained.discountMode,'INVOICE_LEVEL');assert.equal(retained.grandTotal.toFixed(2),'800.00');await assert.rejects(()=>db.invoice.update({where:{id:fresh.id},data:{discountMode:'PER_LINE',invoiceDiscountAmount:0}}));
});
test('Discount 5 printed invoice uses snapshot with one totals discount row and no line discount column',async()=>{
 await mode('INVOICE_LEVEL');const inv=await sale({invoiceDiscountAmount:200},[{testId:catalog.id},{testId:catalog.id}]);await mode('PER_LINE');const print={labName:'Fixture',printMode:'PLAIN',marginTopMm:14,marginBottomMm:14,reportPagination:'CONTINUOUS'};
 const html=buildInvoiceHtml(await billing.findInvoiceById(tenantId,inv.id),print);assert.equal((html.match(/Invoice Discount/g)||[]).length,1);assert(!/<th[^>]*>Discount<\/th>/.test(html));assert(html.includes('Rs 1,800'));
 const legacy=await sale({},[{testId:catalog.id,manualDiscount:100}]),legacyHtml=buildInvoiceHtml(legacy,print);assert(/<th[^>]*>Discount<\/th>/.test(legacyHtml));assert(!legacyHtml.includes('Invoice Discount'));
});
test('Discount 6 concurrent payment/refund uses discounted total and preserves Phase C balances',async()=>{
 await mode('INVOICE_LEVEL');const inv=await sale({invoiceDiscountAmount:200});const results=await Promise.allSettled([pay(inv,500),pay(inv,500)]);assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
 const first=results.find(r=>r.status==='fulfilled').value.payment;assert.equal((await billing.findInvoiceById(tenantId,inv.id)).amountDue.toFixed(2),'300.00');await pay(inv,300);
 const refund=()=>billing.refund(tenantId,inv.id,{amount:400,relatedPaymentId:first.id,reason:'Verified fixture',operationKey:randomUUID()},actor.id);
 const refunds=await Promise.allSettled([refund(),refund()]);assert.equal(refunds.filter(r=>r.status==='fulfilled').length,1);const current=await billing.findInvoiceById(tenantId,inv.id);assert.equal(current.grandTotal.toFixed(2),'800.00');assert.equal(current.amountPaid.toFixed(2),'400.00');assert.equal(current.amountDue.toFixed(2),'400.00');assert.equal(current.status,'ISSUED');assert.equal(current.adjustments.length,1);
});

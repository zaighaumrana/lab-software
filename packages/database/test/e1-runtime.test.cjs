// Ten compact E1 groups, using only the harness-owned temporary roles/database.
const assert=require('node:assert/strict');const {test,before,after}=require('node:test');const {randomBytes,randomUUID}=require('node:crypto');
const {createRequire}=require('node:module');const {resolve}=require('node:path');const {Client}=require('pg');
const {spawnSync}=require('node:child_process');
const {createDatabaseClient,assertRuntimePrivileges}=require('@lms/database');
const {provision,FUNCTION_ALLOWLIST}=require('../../../scripts/lib/runtime-db.cjs');
const req=createRequire(resolve('../../apps/api/package.json'));
const {Test}=req('@nestjs/testing');const {ValidationPipe}=req('@nestjs/common');const {AppModule}=req('./dist/app.module');
const {SMS_GATEWAY}=req('./dist/modules/notifications/providers/sms-gateway.interface');
const {NotificationDispatcher}=req('./dist/modules/notifications/notification-dispatcher.service');
const {PrismaService}=req('./dist/common/prisma/prisma.service');
let admin,owner,sql,db,app,scope;
const calls=[];const gw={isConfigured:()=>true,getSenderId:()=> 'Fixture',send:async p=>{calls.push(p);return {success:true,providerMessageId:'123456',rawResponse:'OK'};}};
before(async()=>{
  const url=process.env.DATABASE_TEST_URL;assert(url&&/^\/labflow_prisma7_test_[a-f0-9]{16}$/.test(new URL(url).pathname));
  admin=new Client({connectionString:process.env.PROVISION_DATABASE_URL});owner=new Client({connectionString:url});
  await admin.connect();await owner.connect();
  await provision(admin,{runtimeRole:process.env.RUNTIME_DB_ROLE,password:process.env.RUNTIME_DB_PASSWORD});
  // Repeat the deterministic grant step without password rotation.
  await provision(admin,{runtimeRole:process.env.RUNTIME_DB_ROLE,createLogin:false});
  sql=new Client({connectionString:process.env.RUNTIME_DATABASE_URL});await sql.connect();
  db=createDatabaseClient({connectionString:process.env.RUNTIME_DATABASE_URL});await assertRuntimePrivileges(db);
});
after(async()=>{await app?.close();await db?.$disconnect();await sql?.end();await owner?.end();await admin?.end();});
async function denied(statement){await assert.rejects(()=>sql.query(statement),e=>e.code==='42501');}
test('1 representative application transactions and API startup succeed under runtime credentials only',async()=>{
  const tenantId=(await db.tenant.create({data:{name:'E1 synthetic lab',slug:randomUUID()}})).id;
  const branchId=(await db.branch.create({data:{tenantId,name:'Fixture',code:'E1'}})).id;
  const password=randomBytes(24).toString('base64url');const bcrypt=req('bcrypt');
  const actor=(await db.user.create({data:{tenantId,branchId,username:'e1',fullName:'Fixture actor',role:'ADMIN',passwordHash:await bcrypt.hash(password,4)}})).id;
  const catalog=await db.test.create({data:{tenantId,code:'E1',name:'Fixture test',basePrice:100,parameters:{create:{code:'P',name:'Frozen parameter'}}}});
  for(const key of ['SAMPLE_COLLECTED','REPORT_READY'])await db.smsTemplate.create({data:{tenantId,key,name:key,body:'Hello {{patientName}}',isActive:true,sendpkTemplateId:'fixture',sendpkRequiredVariables:['patient_name']}});
  const module=await Test.createTestingModule({imports:[AppModule]}).overrideProvider(SMS_GATEWAY).useValue(gw).compile();
  app=module.createNestApplication({logger:false});app.useGlobalPipes(new ValidationPipe({whitelist:true,forbidNonWhitelisted:true,transform:true}));await app.listen(0,'127.0.0.1');
  const base=await app.getUrl();let session;
  const request=async(path,method='GET',body)=>{const response=await fetch(base+path,{method,headers:{'Content-Type':'application/json','x-tenant-id':tenantId,...(session?{'x-session-id':session}:{})},...(body?{body:JSON.stringify(body)}:{})});assert(response.ok,`Runtime ${method} ${path} status ${response.status}`);return response.json();};
  session=(await request('/auth/login','POST',{username:'e1',password})).sessionId;assert(session);await request('/auth/me');
  const patient=await request('/patients','POST',{fullName:'Synthetic patient',phone:'03000000001',smsConsent:true});
  const booking=await request('/bookings','POST',{patientId:patient.id});await request('/patients/'+patient.id);await request('/bookings/'+booking.id);
  const invoice=await request('/billing/invoices','POST',{bookingId:booking.id,lines:[{testId:catalog.id,quantity:1}]});
  const payment=await request(`/billing/invoices/${invoice.id}/payments`,'POST',{amount:100,method:'CASH',operationKey:randomUUID()});assert.equal(Number(payment.invoice.amountDue),0);
  const order=invoice.visit.orderedTests[0];const sample=await request('/laboratory/samples','POST',{invoiceId:invoice.id,sampleType:'Blood',orderedTestIds:[order.id]});
  await request(`/laboratory/samples/${sample.id}/receive`,'PATCH');await request(`/laboratory/samples/${sample.id}/accept`,'PATCH',{});
  const result=await request('/laboratory/results','POST',{sampleId:sample.id,orderedTestId:order.id,values:[{versionParameterId:order.testVersion.versionParameters[0].id,valueNumeric:15}]});
  await request(`/laboratory/invoices/${invoice.id}/ready-for-collection`,'PATCH');const report=await request('/reports/'+invoice.report.id);assert(report.currentVersionId);
  await request('/settings');await request('/settings/discount-mode','PUT',{mode:'PER_LINE'});
  await app.get(NotificationDispatcher).runOnce();assert.equal(calls.length,2);
  const attempts=await db.notificationAttempt.findMany({where:{tenantId}});assert.equal(attempts.length,2);assert(await db.auditLog.count({where:{tenantId}})>0);
  scope={tenantId,invoice,payment,result,report,attempt:attempts[0],catalog,actor};
});
test('2 verified non-superuser migration owner owns schema, guards and can perform migration DDL',async()=>{
  await owner.query('CREATE TABLE public.e1_owner_probe (id integer)');await owner.query('DROP TABLE public.e1_owner_probe');
  const ownership=(await owner.query(`SELECT count(*)::int AS n FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND pg_get_userbyid(p.proowner)<>current_user`)).rows[0];assert.equal(ownership.n,0);
  const tables=(await owner.query(`SELECT count(*)::int AS n FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relowner=(SELECT oid FROM pg_roles WHERE rolname=$1)`,[process.env.RUNTIME_DB_ROLE])).rows[0];assert.equal(tables.n,0);
});
test('3 runtime cannot migrate, create roles/databases or change role attributes',async()=>{
  const migration=spawnSync(process.execPath,[resolve('node_modules/prisma/build/index.js'),'migrate','deploy'],
    {env:{...process.env,DATABASE_URL:process.env.RUNTIME_DATABASE_URL},encoding:'utf8',timeout:30000});
  assert.notEqual(migration.status,0);assert.match(migration.stdout+ migration.stderr,/denied|not allowed|P1010/i);
  await denied('CREATE TABLE public.e1_migration_probe (id integer)');
  await denied('INSERT INTO public._prisma_migrations(id,checksum,migration_name,started_at) VALUES (\'e1\',\'e1\',\'e1\',now())');
  await denied('CREATE ROLE e1_forbidden');await denied('CREATE DATABASE e1_forbidden');
  await denied(`ALTER ROLE "${process.env.RUNTIME_DB_ROLE}" SUPERUSER`);
  await denied(`ALTER ROLE "${new URL(process.env.DATABASE_TEST_URL).username}" CREATEDB`);
});
test('4 runtime cannot ALTER/DROP/TRUNCATE or disable/drop critical triggers/functions',async()=>{
  for(const table of ['results','report_versions','payments','audit_logs','notification_attempts']){
    await denied(`ALTER TABLE public.${table} DISABLE TRIGGER ALL`);await denied(`ALTER TABLE public.${table} ADD COLUMN e1_forbidden integer`);
    await denied(`DROP TABLE public.${table}`);await denied(`TRUNCATE public.${table}`);
  }
  await denied('DROP FUNCTION public.d2_reject_attempt_mutation()');
  await denied('DROP TRIGGER notification_attempt_immutable ON public.notification_attempts');
  await denied('SET session_replication_role=replica');
});
test('5 runtime cannot update/delete append-only AuditLog',async()=>{
  await denied('UPDATE public.audit_logs SET action=\'tamper\'');await denied('DELETE FROM public.audit_logs');
});
test('6 runtime cannot bypass clinical/report/financial/notification evidence guards',async()=>{
  await denied('UPDATE public.notification_attempts SET outcome=\'UNKNOWN\'');await denied('DELETE FROM public.notification_attempts');
  await denied('UPDATE public.payments SET amount=0');await denied('DELETE FROM public.report_version_results');
  await assert.rejects(()=>db.result.update({where:{id:scope.result.id},data:{notes:'tamper'}}));
  await assert.rejects(()=>db.reportVersion.update({where:{id:scope.report.currentVersionId},data:{contentHash:'tamper'}}));
  await assert.rejects(()=>db.notification.update({where:{id:scope.attempt.notificationId},data:{body:'tamper'}}));
  await assert.rejects(()=>sql.query('UPDATE public.test_versions SET id=id')); // row-lock column grant is not mutation permission
});
test('7 runtime cannot create arbitrary schema objects, shadowing temp tables or replace native guards',async()=>{
  await denied('CREATE TABLE public.e1_forbidden (id integer)');await denied('CREATE SCHEMA e1_forbidden');await denied('CREATE TEMP TABLE patients (id text)');
  await denied("CREATE FUNCTION public.e1_forbidden() RETURNS integer LANGUAGE sql AS 'SELECT 1'");
  await denied("CREATE OR REPLACE FUNCTION public.d1_reject_audit_mutation() RETURNS trigger LANGUAGE plpgsql AS 'BEGIN RETURN NEW; END'");
});
test('8 only explicit directly/nested-called functions have runtime EXECUTE',async()=>{
  const functions=(await owner.query(`SELECT p.oid::regprocedure::text AS signature,has_function_privilege($1,p.oid,'EXECUTE') AS allowed FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public'`,[process.env.RUNTIME_DB_ROLE])).rows;
  for(const f of functions)assert.equal(f.allowed,FUNCTION_ALLOWLIST.includes(f.signature),f.signature);
  await denied('SELECT public.d1_reject_audit_mutation()');
  await owner.query("CREATE FUNCTION public.e1_admin_only() RETURNS integer LANGUAGE sql AS 'SELECT 1'");await denied('SELECT public.e1_admin_only()');
});
test('9 owner defaults permit future table/sequence DML, never arbitrary function EXECUTE or DDL',async()=>{
  await owner.query('CREATE TABLE public.e1_future (id serial PRIMARY KEY,value text)');
  const r=await sql.query("INSERT INTO public.e1_future(value) VALUES ('fixture') RETURNING id");await sql.query("UPDATE public.e1_future SET value='updated' WHERE id=$1",[r.rows[0].id]);
  assert.equal((await sql.query('SELECT count(*)::int AS n FROM public.e1_future')).rows[0].n,1);await sql.query('DELETE FROM public.e1_future');await denied('TRUNCATE public.e1_future');
  await owner.query('DROP TABLE public.e1_future');await owner.query('DROP FUNCTION public.e1_admin_only()');
});
test('10 hardened startup self-check rejects owner and deliberately overprivileged runtime',async()=>{
  await assert.rejects(()=>assertRuntimePrivileges({$queryRawUnsafe:async(q,...args)=>(await owner.query(q,args)).rows}),/Unsafe PostgreSQL runtime/);
  await admin.query(`ALTER ROLE "${process.env.RUNTIME_DB_ROLE}" CREATEDB`);
  try{await assert.rejects(()=>assertRuntimePrivileges(db),/Unsafe PostgreSQL runtime/);const service=new PrismaService();await assert.rejects(()=>service.onModuleInit(),/Unsafe PostgreSQL runtime/);}
  finally{await admin.query(`ALTER ROLE "${process.env.RUNTIME_DB_ROLE}" NOCREATEDB`);}
  await assertRuntimePrivileges(db);
});

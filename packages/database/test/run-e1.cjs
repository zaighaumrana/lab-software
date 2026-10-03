// Guarded E1 fixture: temporary roles/database only; no operational rows.
const {randomBytes}=require('node:crypto');const {resolve}=require('node:path');const {spawnSync}=require('node:child_process');
const {Client}=require('pg');const {loadDatabaseEnvironment}=require('../dist/environment');const {ident,scramVerifier}=require('../../../scripts/lib/runtime-db.cjs');
loadDatabaseEnvironment();
(async()=>{
  if(!process.env.PROVISION_DATABASE_URL)throw new Error('Configure the installation/admin connection before running E1 role tests');
  const source=new URL(process.env.PROVISION_DATABASE_URL);if(!['localhost','127.0.0.1','[::1]'].includes(source.hostname))throw new Error('E1 harness requires local PostgreSQL');
  const suffix=randomBytes(8).toString('hex'),name='labflow_prisma7_test_'+suffix,ownerName='labflow_e1_owner_'+suffix,appName='labflow_e1_app_'+suffix;
  const ownerPassword=randomBytes(32).toString('base64url'),appPassword=randomBytes(32).toString('base64url');
  const adminUrl=new URL(source);adminUrl.pathname='/postgres';const admin=new Client({connectionString:adminUrl.toString()});
  let ownerCreated=false,created=false;
  await admin.connect();
  try{
    await admin.query(`CREATE ROLE ${ident(ownerName)} LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD '${scramVerifier(ownerPassword)}'`);ownerCreated=true;
    const current=(await admin.query('SELECT current_user AS name')).rows[0].name;
    await admin.query(`GRANT ${ident(ownerName)} TO ${ident(current)}`);
    await admin.query(`CREATE DATABASE ${ident(name)} OWNER ${ident(ownerName)}`);created=true;
    const ownerUrl=new URL(source);ownerUrl.pathname='/'+name;ownerUrl.username=ownerName;ownerUrl.password=ownerPassword;
    const adminFixture=new URL(source);adminFixture.pathname='/'+name;
    const appUrl=new URL(ownerUrl);appUrl.username=appName;appUrl.password=appPassword;
    const env={...process.env,DATABASE_URL:ownerUrl.toString(),DATABASE_TEST_URL:ownerUrl.toString(),PROVISION_DATABASE_URL:adminFixture.toString(),
      RUNTIME_DATABASE_URL:appUrl.toString(),RUNTIME_DB_ROLE:appName,RUNTIME_DB_PASSWORD:appPassword,DB_RUNTIME_MODE:'hardened',NODE_ENV:'test',SENDPK_API_KEY:'',SENDPK_SENDER:''};
    for(const args of [[resolve('node_modules/prisma/build/index.js'),'migrate','deploy'],[resolve('test/e1-runtime.test.cjs')]]){
      const result=spawnSync(process.execPath,args,{env,stdio:'inherit',timeout:120000});
      if(result.error||result.status!==0)throw new Error('E1 isolated check failed');
    }
    const remaining=(await admin.query('SELECT count(*)::int AS n FROM pg_stat_activity WHERE datname=$1',[name])).rows[0].n;
    if(remaining!==0)throw new Error('E1 test connection leak');
    console.log('E1 isolated checks passed; zero remaining pool connections.');
  }finally{
    if(created){if(!/^labflow_prisma7_test_[a-f0-9]{16}$/.test(name))throw new Error('Unsafe fixture name');await admin.query(`DROP DATABASE ${ident(name)} WITH (FORCE)`);}
    await admin.query(`DROP ROLE IF EXISTS ${ident(appName)}`);
    if(ownerCreated)await admin.query(`DROP ROLE ${ident(ownerName)}`);
    await admin.end();
  }
})().catch(error=>{console.error(error.message==='Configure the installation/admin connection before running E1 role tests'?error.message:'E1 fixture/provisioning failed; connection details suppressed');process.exitCode=1;});

// Fresh local database and separate owner/runtime roles; never operational patient data or cloud I/O.
const {randomBytes}=require('node:crypto'),{resolve}=require('node:path'),{spawnSync}=require('node:child_process');
const {Client}=require('pg'),{loadDatabaseEnvironment}=require('../dist/environment');
const {ident,scramVerifier,provision}=require('../../../scripts/lib/runtime-db.cjs');
loadDatabaseEnvironment();
(async()=>{
  const source=new URL(process.env.PROVISION_DATABASE_URL);
  if(!['localhost','127.0.0.1','[::1]'].includes(source.hostname))throw new Error('Local admin required');
  const suffix=randomBytes(8).toString('hex'),name='labflow_prisma7_test_'+suffix;
  const ownerName='labflow_f1_owner_'+suffix,appName='labflow_f1_app_'+suffix;
  const ownerPassword=randomBytes(32).toString('base64url'),appPassword=randomBytes(32).toString('base64url');
  const a=new URL(source);a.pathname='/postgres';const admin=new Client({connectionString:a.toString()});await admin.connect();
  let created=false,ownerCreated=false;
  try{
    await admin.query(`CREATE ROLE ${ident(ownerName)} LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD '${scramVerifier(ownerPassword)}'`);ownerCreated=true;
    await admin.query(`CREATE DATABASE ${ident(name)} OWNER ${ident(ownerName)}`);created=true;
    const owner=new URL(source);owner.pathname='/'+name;owner.username=ownerName;owner.password=ownerPassword;
    const runtime=new URL(owner);runtime.username=appName;runtime.password=appPassword;
    const adminFixture=new URL(source);adminFixture.pathname='/'+name;
    const env={...process.env,DATABASE_URL:owner.toString(),DATABASE_TEST_URL:owner.toString(),RUNTIME_DATABASE_URL:runtime.toString(),
      PROVISION_DATABASE_URL:adminFixture.toString(),DB_RUNTIME_MODE:'hardened',NODE_ENV:'test',SENDPK_API_KEY:'',SENDPK_SENDER:'',
      LABFLOW_RECOVERY_MODE:'false',PUBLIC_SYNC_ENABLED:'true'};
    const migrate=spawnSync(process.execPath,[resolve('node_modules/prisma/build/index.js'),'migrate','deploy'],{env,stdio:'inherit',timeout:120000});
    if(migrate.error||migrate.status!==0)throw new Error('Fixture migration failed');
    const grants=new Client({connectionString:adminFixture.toString()});await grants.connect();
    try{await provision(grants,{runtimeRole:appName,password:appPassword});}finally{await grants.end();}
    const focused=process.argv[2];if(focused&&!/^[A-L]$/.test(focused))throw new Error('Invalid focused F1 group');
    const result=spawnSync(process.execPath,['--test',...(focused?['--test-name-pattern=^'+focused+' ']:[]),resolve('test/f1-public-sync.test.cjs')],{env,stdio:'inherit',timeout:180000});
    if(result.error||result.status!==0)throw new Error('F1 tests failed');
    if((await admin.query('SELECT count(*)::int AS n FROM pg_stat_activity WHERE datname=$1',[name])).rows[0].n!==0)throw new Error('F1 connection leak');
    console.log('F1 checks passed under restricted runtime; zero remaining database connections.');
  }finally{
    if(created){if(!/^labflow_prisma7_test_[a-f0-9]{16}$/.test(name))throw new Error('Unsafe fixture name');await admin.query(`DROP DATABASE ${ident(name)} WITH (FORCE)`);}
    if(!/^labflow_f1_app_[a-f0-9]{16}$/.test(appName)||!/^labflow_f1_owner_[a-f0-9]{16}$/.test(ownerName))throw new Error('Unsafe fixture role');
    await admin.query(`DROP ROLE IF EXISTS ${ident(appName)}`);if(ownerCreated)await admin.query(`DROP ROLE ${ident(ownerName)}`);await admin.end();
  }
})().catch(()=>{console.error('F1 disposable fixture failed; credentials and row contents suppressed');process.exitCode=1;});

// Exactly 13 focused groups; all destructive operations are confined to harness-owned fixtures.
const {randomBytes}=require('node:crypto'),{resolve}=require('node:path'),{spawnSync}=require('node:child_process');
const {Client}=require('pg');const {loadDatabaseEnvironment}=require('../dist/environment');
const {ident,scramVerifier}=require('../../../scripts/lib/runtime-db.cjs');
const {existsSync}=require('node:fs');
loadDatabaseEnvironment();
(async()=>{
  const source=new URL(process.env.PROVISION_DATABASE_URL);if(!['localhost','127.0.0.1','[::1]'].includes(source.hostname))throw new Error('Local admin required');
  const suffix=randomBytes(8).toString('hex');const dbNames=['labflow_prisma7_test_'+suffix,'lms_v2_restore_test_'+suffix];
  const roleNames=['labflow_e2_source_'+suffix,'labflow_e2_owner_'+suffix,'labflow_e2_app_'+suffix,'labflow_e2_restored_'+suffix];
  const a=new URL(source);a.pathname='/postgres';const admin=new Client({connectionString:a.toString()});await admin.connect();
  try{
    const secrets=[randomBytes(32).toString('base64url'),randomBytes(32).toString('base64url')];
    for(let i=0;i<2;i++)await admin.query(`CREATE ROLE ${ident(roleNames[i])} LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD '${scramVerifier(secrets[i])}'`);
    await admin.query(`CREATE DATABASE ${ident(dbNames[0])} OWNER ${ident(roleNames[0])}`);
    const owner=new URL(source);owner.pathname='/'+dbNames[0];owner.username=roleNames[0];owner.password=secrets[0];
    const targetOwner=new URL(source);targetOwner.pathname='/postgres';targetOwner.username=roleNames[1];targetOwner.password=secrets[1];
    const env={...process.env,DATABASE_URL:owner.toString(),DATABASE_TEST_URL:owner.toString(),PROVISION_DATABASE_URL:a.toString(),
      E2_TARGET_DATABASE:dbNames[1],E2_TARGET_OWNER_URL:targetOwner.toString(),E2_SOURCE_RUNTIME_ROLE:roleNames[2],E2_TARGET_RUNTIME_ROLE:roleNames[3],
      SENDPK_API_KEY:'',SENDPK_SENDER:'',RUNTIME_DATABASE_URL:'',DB_RUNTIME_MODE:'development',NODE_ENV:'test',LABFLOW_RECOVERY_MODE:'false'};
    // Use a locally installed browser if Puppeteer's separate cache is absent; no download/install.
    if(!env.PUPPETEER_EXECUTABLE_PATH)env.PUPPETEER_EXECUTABLE_PATH=['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(existsSync)||'';
    for(const args of [[resolve('node_modules/prisma/build/index.js'),'migrate','deploy'],['--test',resolve('test/e2-recovery.test.cjs')]]){
      const result=spawnSync(process.execPath,args,{env,stdio:'inherit',timeout:240000});if(result.error||result.status!==0)throw new Error('Isolated E2 check failed');
    }
    const open=(await admin.query('SELECT count(*)::int AS n FROM pg_stat_activity WHERE datname=ANY($1)',[dbNames])).rows[0].n;
    if(open!==0)throw new Error('E2 connection leak');console.log('E2 checks passed; zero remaining database connections.');
  }finally{
    for(const name of dbNames){if(!/^(labflow_prisma7_test_|lms_v2_restore_test_)[a-f0-9]{16}$/.test(name))throw new Error('Unsafe fixture name');await admin.query(`DROP DATABASE IF EXISTS ${ident(name)} WITH (FORCE)`);}
    for(const role of roleNames)await admin.query(`DROP ROLE IF EXISTS ${ident(role)}`);await admin.end();
  }
})().catch(()=>{console.error('E2 disposable fixture failed; credentials and row contents suppressed');process.exitCode=1;});

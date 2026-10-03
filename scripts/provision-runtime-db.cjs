// Run through provision-runtime-db.ps1, or supply environment variables privately.
const {createRequire}=require('node:module'),{randomBytes}=require('node:crypto');
const {readFileSync,writeFileSync,existsSync}=require('node:fs');const {resolve}=require('node:path');
const req=createRequire(resolve(__dirname,'../packages/database/package.json'));
req('./dist/environment').loadDatabaseEnvironment();const {Client}=req('pg');
const runtimeEnvPath=resolve(__dirname,'../apps/api/.env.runtime');
const priorRuntime=existsSync(runtimeEnvPath)?require('node:util').parseEnv(readFileSync(runtimeEnvPath,'utf8')):{};
if(existsSync(runtimeEnvPath))require('node:process').loadEnvFile(runtimeEnvPath);
const {assertRuntimePrivileges}=req('./dist');const {provision,roleName}=require('./lib/runtime-db.cjs');
(async()=>{
  const ownerUrl=process.env.DATABASE_URL;
  let adminUrl=process.env.PROVISION_DATABASE_URL||ownerUrl;
  if(ownerUrl && process.env.PROVISION_ADMIN_USER && process.env.PROVISION_ADMIN_PASSWORD){const u=new URL(ownerUrl);u.username=process.env.PROVISION_ADMIN_USER;u.password=process.env.PROVISION_ADMIN_PASSWORD;adminUrl=u.toString();}
  if(!ownerUrl||!adminUrl)throw new Error('Configure owner and installation/admin connections');
  const owner=new Client({connectionString:ownerUrl}),admin=new Client({connectionString:adminUrl});let runtime;
  try{
    await owner.connect();const meta=(await owner.query(`SELECT current_user AS role,pg_get_userbyid(datdba) AS owner,datname FROM pg_database WHERE datname=current_database()`)).rows[0];
    if(meta.role!==meta.owner)throw new Error('DATABASE_URL must be the verified migration/database owner connection');
    await admin.connect();const target=(await admin.query('SELECT current_database() AS name')).rows[0];
    if(target.name!==meta.datname)throw new Error('Provisioning connection must target the same LabFlow database');
    if(process.argv.includes('--configure-admin')){
      const rights=(await admin.query('SELECT rolcreaterole,rolcreatedb,rolsuper FROM pg_roles WHERE rolname=current_user')).rows[0];
      if(!rights.rolsuper&&!(rights.rolcreaterole&&rights.rolcreatedb))throw new Error('Installation/admin role creation and disposable database access required');
      const path=resolve(__dirname,'../packages/database/.env'),re=/^PROVISION_DATABASE_URL=.*$/m;
      let contents=readFileSync(path,'utf8'),line='PROVISION_DATABASE_URL='+JSON.stringify(adminUrl);
      contents=re.test(contents)?contents.replace(re,()=>line):contents.trimEnd()+'\n'+line+'\n';writeFileSync(path,contents);
      console.log('Admin connection verified and saved privately. No roles, grants or business data changed.');return;
    }
    const grantsOnly=process.argv.includes('--grants-only');
    const runtimeRole=roleName(process.env.RUNTIME_DB_ROLE || (grantsOnly&&process.env.RUNTIME_DATABASE_URL
      ? decodeURIComponent(new URL(process.env.RUNTIME_DATABASE_URL).username) : 'labflow_app'));
    const password=grantsOnly?undefined:process.env.RUNTIME_DB_PASSWORD||randomBytes(32).toString('base64url');
    await provision(admin,{runtimeRole,password,createLogin:!grantsOnly});
    const runtimeUrl=new URL(ownerUrl);runtimeUrl.username=runtimeRole;if(password)runtimeUrl.password=password;
    const connection=grantsOnly?process.env.RUNTIME_DATABASE_URL:runtimeUrl.toString();
    if(!connection)throw new Error('RUNTIME_DATABASE_URL is required to verify grants');
    runtime=new Client({connectionString:connection});await runtime.connect();
    if((await runtime.query('SELECT current_user AS role')).rows[0].role!==runtimeRole)throw new Error('Runtime login does not match the provisioned role');
    await assertRuntimePrivileges({$queryRawUnsafe:async(sql,...args)=>(await runtime.query(sql,args)).rows});
    await owner.query('SELECT 1');
    if(process.argv.includes('--write-runtime-env')&&!grantsOnly){
      // Owner/admin credentials stay in the tooling file. API loads only its runtime file.
      const values={...priorRuntime,RUNTIME_DATABASE_URL:runtimeUrl.toString(),DB_RUNTIME_MODE:'hardened',
        SENDPK_API_KEY:priorRuntime.SENDPK_API_KEY??process.env.SENDPK_API_KEY??'',SENDPK_SENDER:priorRuntime.SENDPK_SENDER??process.env.SENDPK_SENDER??''};
      for(const key of Object.keys(values))if(key==='DATABASE_URL'||key.startsWith('PROVISION_')||key==='RUNTIME_DB_PASSWORD')delete values[key];
      writeFileSync(runtimeEnvPath,Object.entries(values).map(([key,value])=>key+'='+JSON.stringify(value)).join('\n')+'\n');
      console.log('Restricted runtime verified; isolated untracked API environment updated. Owner connection retained.');
    }else console.log('Restricted runtime verified; owner connection retained.');
  }finally{await runtime?.end();await admin.end();await owner.end();}
})().catch(()=>{console.error('Database provisioning failed. Check installation/admin access, target database and role prerequisites. Connection details suppressed.');process.exitCode=1;});

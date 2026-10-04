// Database-local logical recovery; never log raw subprocess or database errors.
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const {createHash,randomUUID,randomBytes}=require('node:crypto');
const {spawn}=require('node:child_process'),{createRequire}=require('node:module');
const req=createRequire(path.resolve(__dirname,'../../packages/database/package.json'));
const {Client}=req('pg');const {provision,ident,roleName}=require('./runtime-db.cjs');
const {assertRuntimePrivileges}=req('./dist');
const FORMAT='labflow-backup',VERSION=1;
function fail(code){throw new Error(code);}
function inside(root,target){const r=path.relative(root,target);return !path.isAbsolute(r)&&r!=='..'&&!r.startsWith('..'+path.sep);}
async function safePath(p){
  if(typeof p!=='string'||!path.isAbsolute(p))fail('ABSOLUTE_PATH_REQUIRED');
  p=path.resolve(p);
  for(let part=p;;part=path.dirname(part)){
    try{if((await fs.lstat(part)).isSymbolicLink())fail('SYMLINK_PATH_REJECTED');}catch(e){if(e.code!=='ENOENT')throw e;}
    if(path.dirname(part)===part)break;
  }
  return p;
}
async function exists(p){try{await fs.lstat(p);return true;}catch(e){if(e.code==='ENOENT')return false;throw e;}}
const sha=b=>createHash('sha256').update(b).digest('hex');
async function fileHash(p){const h=createHash('sha256');const f=await fs.open(p,'r');try{for await(const chunk of f.createReadStream())h.update(chunk);return h.digest('hex');}finally{await f.close();}}
async function command(exe,args,env={},replaceEnvironment=false){
  return new Promise((resolve,reject)=>{
    const child=spawn(exe,args,{env:replaceEnvironment?env:{...process.env,...env},windowsHide:true,stdio:['ignore','pipe','pipe']});
    let out='',err='',done=false;const timer=setTimeout(()=>{child.kill();},600000);
    child.stdout.on('data',b=>{if(out.length<4e6)out+=b;});child.stderr.on('data',b=>{if(err.length<4e6)err+=b;});
    const finish=(error)=>{if(done)return;done=true;clearTimeout(timer);if(error){
      const category=[[/service.*not found/i,'SERVICE_CONFIGURATION'],[/password authentication failed/i,'AUTHENTICATION'],[/permission denied/i,'PERMISSION'],[/snapshot/i,'SNAPSHOT'],[/could not open|cannot open/i,'FILE_ACCESS'],[/connection.*failed/i,'CONNECTION']].find(([pattern])=>pattern.test(err));
      reject(new Error('TOOL_FAILED_'+path.basename(exe).toUpperCase().replace(/[^A-Z_]/g,'_')+(category?'_'+category[1]:'')));
    }else resolve(out);};
    child.on('error',()=>finish(true));child.on('close',code=>finish(code!==0));
  });
}
function pgEnv(connection){
  const u=new URL(connection);if(!['postgres:','postgresql:'].includes(u.protocol))fail('POSTGRES_URL_REQUIRED');
  return {PGHOST:u.hostname.replace(/^\[|\]$/g,''),PGPORT:u.port||'5432',PGDATABASE:decodeURIComponent(u.pathname.slice(1)),
    PGUSER:decodeURIComponent(u.username),PGPASSWORD:decodeURIComponent(u.password),PGSSLMODE:u.searchParams.get('sslmode')||'prefer',
    PGSERVICE:undefined,PGSERVICEFILE:undefined,PGOPTIONS:'',PGAPPNAME:'labflow-recovery-tools'};
}
function tool(options,name){return options.pgBin?path.join(options.pgBin,name+(process.platform==='win32'?'.exe':'')):name;}
async function toolMajor(options,name){const s=await command(tool(options,name),['--version']);const m=s.match(/PostgreSQL\) (\d+)\./);if(!m)fail('WRONG_POSTGRES_TOOLING');return Number(m[1]);}
async function checkTools(options,major){for(const name of ['pg_dump','pg_restore'])if(await toolMajor(options,name)!==major)fail('POSTGRES_MAJOR_MISMATCH');}
async function privateDirectory(p){
  await fs.mkdir(p,{mode:0o700});
  if(process.platform==='win32'){
    const user=(await command('whoami',[])).trim();
    await command('icacls',[p,'/inheritance:r','/grant:r',user+':(OI)(CI)F','*S-1-5-18:(OI)(CI)F','*S-1-5-32-544:(OI)(CI)F']);
  }
}
async function jsonWrite(p,value){await fs.writeFile(p,JSON.stringify(value,null,2)+'\n',{flag:'wx',mode:0o600,flush:true});}
async function snapshot(db){
  await db.query("SET LOCAL TIME ZONE 'UTC'");
  const meta=(await db.query(`SELECT current_database() AS database,current_user AS role,pg_get_userbyid(datdba) AS owner,
    current_setting('server_version_num')::int/10000 AS major FROM pg_database WHERE datname=current_database()`)).rows[0];
  const tables=(await db.query("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename COLLATE \"C\"")).rows;
  const tableCounts={},fingerprints={};const all=createHash('sha256');
  for(const {tablename} of tables){
    const h=createHash('sha256');let count=0;
    await db.query(`DECLARE labflow_rows NO SCROLL CURSOR FOR SELECT to_jsonb(t)::text AS row FROM public.${ident(tablename)} t ORDER BY to_jsonb(t)::text COLLATE "C"`);
    try{while(true){const rows=(await db.query('FETCH 500 FROM labflow_rows')).rows;if(!rows.length)break;for(const r of rows){h.update(r.row+'\n');count++;}}}
    finally{await db.query('CLOSE labflow_rows');}
    tableCounts[tablename]=count;fingerprints[tablename]=h.digest('hex');all.update(tablename+'\0'+count+'\0'+fingerprints[tablename]);
  }
  const migrations=(await db.query('SELECT migration_name AS name,checksum FROM public._prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL ORDER BY migration_name')).rows;
  if(!migrations.length||!(await db.query('SELECT count(*)::int AS n FROM public._prisma_migrations WHERE finished_at IS NULL AND rolled_back_at IS NULL')).rows.every(r=>r.n===0))fail('MIGRATIONS_UNHEALTHY');
  const artifacts=(await db.query(`SELECT "pdfPath" AS path,"pdfSha256" AS sha256,"pdfByteSize" AS size FROM public.report_versions WHERE "pdfPath" IS NOT NULL ORDER BY "pdfPath"`)).rows;
  return {meta,tableCounts,fingerprints,rowFingerprint:all.digest('hex'),migrations,artifacts};
}
function artifactRecord(r){
  if(!r||!/^reports\/[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+\/version-[1-9][0-9]*\/[a-f0-9-]{36}\.pdf$/.test(r.path)
    ||!Number.isSafeInteger(r.size)||r.size<=0||!/^[a-f0-9]{64}$/.test(r.sha256))fail('INVALID_ARTIFACT_METADATA');
  return {path:r.path,size:r.size,sha256:r.sha256};
}
async function verifyFile(root,r){r=artifactRecord(r);const file=await safePath(path.join(root,...r.path.split('/')));
  if(!inside(root,file))fail('ARTIFACT_ESCAPE');let st;try{st=await fs.stat(file);}catch{fail('ARTIFACT_MISSING');}
  if(!st.isFile()||st.size!==r.size||await fileHash(file)!==r.sha256)fail('ARTIFACT_INTEGRITY');return file;
}
async function copyArtifacts(source,target,records){
  for(const r of records){const from=await verifyFile(source,r),to=path.join(target,...r.path.split('/'));await safePath(to);await fs.mkdir(path.dirname(to),{recursive:true,mode:0o700});await fs.copyFile(from,to,require('node:fs').constants.COPYFILE_EXCL);
    const handle=await fs.open(to,'r+');try{await handle.sync();}finally{await handle.close();}await verifyFile(target,r);}
}
async function verifyBackup(options){
  const root=await safePath(options.backupPath);
  if(path.basename(root).includes('.incomplete')&&!options.internal)fail('INCOMPLETE_BACKUP');
  let m,a;try{m=JSON.parse(await fs.readFile(await safePath(path.join(root,'manifest.json')),'utf8'));}catch{fail('INVALID_MANIFEST');}
  if(m.format!==FORMAT||m.formatVersion!==VERSION||m.status!=='complete'||!/^LabFlow_Backup_[0-9TZ_-]+_[a-f0-9-]{36}$/.test(m.backupId)
    ||!Number.isInteger(m.postgresMajor)||!m.tableCounts||!m.fingerprints||!Array.isArray(m.migrations)||!/^[a-f0-9]{64}$/.test(m.dumpSha256)
    ||!/^[a-f0-9]{64}$/.test(m.artifactManifestSha256)||!Number.isSafeInteger(m.artifactCount)||!Number.isFinite(Date.parse(m.createdAt)))fail('WRONG_BACKUP_FORMAT');
  if(!options.internal&&path.basename(root)!==m.backupId)fail('BACKUP_NAME_MISMATCH');
  if(m.migrationCount!==m.migrations.length||m.migrationCount<1||m.latestAppliedMigration!==m.migrations.at(-1)?.name
    ||!/^[a-f0-9]{64}$/.test(m.rowFingerprint)||!Object.keys(m.tableCounts).length
    ||Object.entries(m.tableCounts).some(([name,count])=>!Number.isSafeInteger(count)||count<0||!/^[a-f0-9]{64}$/.test(m.fingerprints[name])))fail('INVALID_MANIFEST_METADATA');
  const dump=await safePath(path.join(root,'database.dump')),am=await safePath(path.join(root,'artifact-manifest.json'));
  if(await fileHash(dump)!==m.dumpSha256||!(await fs.stat(dump)).size)fail('DUMP_INTEGRITY');
  if(await fileHash(am)!==m.artifactManifestSha256)fail('ARTIFACT_MANIFEST_INTEGRITY');
  try{a=JSON.parse(await fs.readFile(am,'utf8'));}catch{fail('INVALID_ARTIFACT_MANIFEST');}
  if(!(await fs.stat(await safePath(path.join(root,'report-artifacts')))).isDirectory())fail('ARTIFACT_DIRECTORY_REQUIRED');
  if(!Array.isArray(a)||a.length!==m.artifactCount||new Set(a.map(r=>r.path)).size!==a.length)fail('ARTIFACT_COUNT_MISMATCH');
  await checkTools(options,m.postgresMajor);await command(tool(options,'pg_restore'),['--list',dump]);
  for(const r of a)await verifyFile(path.join(root,'report-artifacts'),r);
  return {manifest:m,artifacts:a,root};
}
async function backup(options){
  const destination=await safePath(options.destination),sourceRoot=await safePath(options.artifactRoot);
  if(inside(sourceRoot,destination)||inside(destination,sourceRoot))fail('BACKUP_DESTINATION_OVERLAPS_REPORT_STORAGE');
  if(!(await fs.stat(destination)).isDirectory())fail('BACKUP_DESTINATION_MUST_EXIST');
  const db=new Client({connectionString:options.ownerUrl});await db.connect();let begun=false;
  try{
    await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');begun=true;
    const meta=(await db.query(`SELECT current_user AS role,pg_get_userbyid(datdba) AS owner,current_setting('server_version_num')::int/10000 AS major FROM pg_database WHERE datname=current_database()`)).rows[0];
    if(meta.role!==meta.owner)fail('BACKUP_REQUIRES_DATABASE_OWNER');await checkTools(options,meta.major);
    const snapshotId=(await db.query('SELECT pg_export_snapshot() AS id')).rows[0].id;
    const createdAt=new Date().toISOString();
    const id='LabFlow_Backup_'+createdAt.replace(/[:.]/g,'-')+'_'+randomUUID();
    const incomplete=path.join(destination,id+'.incomplete'),final=path.join(destination,id);await privateDirectory(incomplete);
    await command(tool(options,'pg_dump'),['--format=custom','--no-acl','--snapshot='+snapshotId,'--file='+path.join(incomplete,'database.dump'),'--no-password'],pgEnv(options.ownerUrl));
    const captured=await snapshot(db);await db.query('COMMIT');begun=false;
    const records=captured.artifacts.map(artifactRecord);await fs.mkdir(path.join(incomplete,'report-artifacts'),{mode:0o700});
    await copyArtifacts(sourceRoot,path.join(incomplete,'report-artifacts'),records);
    await jsonWrite(path.join(incomplete,'artifact-manifest.json'),records);
    let gitCommit=null;try{gitCommit=(await command('git',['-C',path.resolve(__dirname,'../..'),'rev-parse','HEAD'])).trim();}catch{}
    const manifest={format:FORMAT,formatVersion:VERSION,status:'complete',backupId:id,createdAt,
      postgresMajor:captured.meta.major,database:captured.meta.database,gitCommit,migrationCount:captured.migrations.length,
      latestAppliedMigration:captured.migrations.at(-1).name,migrations:captured.migrations,tableCounts:captured.tableCounts,
      fingerprints:captured.fingerprints,rowFingerprint:captured.rowFingerprint,dumpSha256:await fileHash(path.join(incomplete,'database.dump')),
      artifactCount:records.length,artifactManifestSha256:await fileHash(path.join(incomplete,'artifact-manifest.json'))};
    await jsonWrite(path.join(incomplete,'manifest.json'),manifest);
    await verifyBackup({...options,backupPath:incomplete,internal:true});await fs.rename(incomplete,final);
    let retentionWarning=false;if(options.retentionDays)try{await retention({...options,destination});}catch{retentionWarning=true;}
    return {backupPath:final,manifest,retentionWarning,sameVolume:path.parse(destination).root.toLowerCase()===path.parse(sourceRoot).root.toLowerCase()};
  }finally{if(begun)await db.query('ROLLBACK');await db.end();}
}
async function retention(options){
  if(!Number.isSafeInteger(options.retentionDays)||options.retentionDays<1)fail('INVALID_RETENTION');
  const root=await safePath(options.destination),valid=[];
  for(const entry of await fs.readdir(root,{withFileTypes:true})){
    if(!entry.isDirectory()||entry.isSymbolicLink()||!entry.name.startsWith('LabFlow_Backup_'))continue;
    try{const v=await verifyBackup({...options,backupPath:path.join(root,entry.name)});valid.push(v);}catch{}
  }
  valid.sort((a,b)=>Date.parse(b.manifest.createdAt)-Date.parse(a.manifest.createdAt));
  for(const v of valid.slice(1))if(Date.parse(v.manifest.createdAt)<Date.now()-options.retentionDays*86400000){
    const target=await safePath(v.root);if(target===root||!inside(root,target)||path.dirname(target)!==root)fail('UNSAFE_RETENTION_PATH');
    await fs.rm(target,{recursive:true});
  }
}
async function status(options){
  const root=await safePath(options.destination);let newest=null;
  for(const e of await fs.readdir(root,{withFileTypes:true}))if(e.isDirectory()&&!e.isSymbolicLink())try{
    const v=await verifyBackup({...options,backupPath:path.join(root,e.name)});if(!newest||Date.parse(v.manifest.createdAt)>Date.parse(newest.manifest.createdAt))newest=v;
  }catch{}
  return newest?{backupPath:newest.root,createdAt:newest.manifest.createdAt,verification:'passed'}:{backupPath:null,verification:'no valid completed backup'};
}
async function validateRestored(options,verified){
  const db=new Client({connectionString:options.ownerUrl});await db.connect();
  try{await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');const s=await snapshot(db);await db.query('COMMIT');
    const m=verified.manifest;
    if(s.rowFingerprint!==m.rowFingerprint||JSON.stringify(s.tableCounts)!==JSON.stringify(m.tableCounts)||JSON.stringify(s.migrations)!==JSON.stringify(m.migrations))fail('RESTORE_DATABASE_COMPARISON');
    if(JSON.stringify(s.artifacts.map(artifactRecord))!==JSON.stringify(verified.artifacts.map(artifactRecord)))fail('RESTORE_ARTIFACT_METADATA_COMPARISON');
    for(const r of s.artifacts)await verifyFile(options.targetArtifactRoot,r);return s;
  }finally{await db.end();}
}
async function restore(options){
  const verified=await verifyBackup({...options,internal:false});if(options.verifyOnly)return {verification:'passed',manifest:verified.manifest};
  if(typeof options.targetDatabase!=='string')fail('TARGET_DATABASE_REQUIRED');
  const target=roleName(options.targetDatabase),root=await safePath(options.targetArtifactRoot),protectedRoot=await safePath(options.artifactRoot);
  const sourceDatabase=pgEnv(options.ownerUrl).PGDATABASE;
  const dangerous=target==='lms_v2'||target===sourceDatabase||target===verified.manifest.database||inside(protectedRoot,root)||inside(root,protectedRoot);
  if(dangerous&&!(options.allowOperationalRestore&&options.confirmOperationalRestore==='RESTORE '+target))fail('OPERATIONAL_RESTORE_REFUSED');
  if(inside(verified.root,root)||inside(root,verified.root))fail('RESTORE_ROOT_OVERLAPS_BACKUP');
  if(await exists(root))fail('TARGET_ARTIFACT_ROOT_EXISTS');
  const owner=new Client({connectionString:options.ownerUrl}),admin=new Client({connectionString:options.adminUrl});
  let runtime;
  try{
    await owner.connect();await admin.connect();
    const name=(await owner.query('SELECT current_user AS name')).rows[0].name;
    if((await admin.query('SELECT 1 FROM pg_database WHERE datname=$1',[target])).rowCount)fail('TARGET_DATABASE_EXISTS');
    const major=(await admin.query("SELECT current_setting('server_version_num')::int/10000 AS major")).rows[0].major;
    if(major!==verified.manifest.postgresMajor)fail('POSTGRES_MAJOR_MISMATCH');
    const a=pgEnv(options.adminUrl),o=pgEnv(options.ownerUrl);if(a.PGHOST!==o.PGHOST||a.PGPORT!==o.PGPORT)fail('OWNER_ADMIN_SERVER_MISMATCH');
    await admin.query(`CREATE DATABASE ${ident(target)} OWNER ${ident(name)} TEMPLATE template0`);
    const targetUrl=new URL(options.ownerUrl);targetUrl.pathname='/'+target;
    await command(tool(options,'pg_restore'),['--no-owner','--no-acl','--exit-on-error','--single-transaction','--no-password','--dbname='+target,path.join(verified.root,'database.dump')],pgEnv(targetUrl.toString()));
    await privateDirectory(root);await copyArtifacts(path.join(verified.root,'report-artifacts'),root,verified.artifacts);
    await validateRestored({ownerUrl:targetUrl.toString(),targetArtifactRoot:root},verified);
    await command(process.execPath,[path.resolve(__dirname,'../../packages/database/node_modules/prisma/build/index.js'),
      'migrate','diff','--config',path.resolve(__dirname,'../../packages/database/prisma7.config.ts'),
      '--from-config-datasource','--to-schema',path.resolve(__dirname,'../../packages/database/prisma/schema.prisma'),'--exit-code'],
      {DATABASE_URL:targetUrl.toString()});
    const targetAdminUrl=new URL(options.adminUrl);targetAdminUrl.pathname='/'+target;
    const targetAdmin=new Client({connectionString:targetAdminUrl.toString()});await targetAdmin.connect();
    const runtimeRole=roleName(options.runtimeRole||'labflow_restore_'+randomBytes(8).toString('hex'));
    const password=randomBytes(32).toString('base64url');
    try{await provision(targetAdmin,{runtimeRole,password});}finally{await targetAdmin.end();}
    const runtimeUrl=new URL(targetUrl);runtimeUrl.username=runtimeRole;runtimeUrl.password=password;
    runtime=new Client({connectionString:runtimeUrl.toString()});await runtime.connect();
    await assertRuntimePrivileges({$queryRawUnsafe:async(q,...args)=>(await runtime.query(q,args)).rows});
    const readOnly=new URL(runtimeUrl);readOnly.searchParams.set('options','-c default_transaction_read_only=on');
    // A separate private recovery config contains newly provisioned credentials, never copied backup secrets.
    const recoveryConfig=path.join(root,'recovery.env');
    const smokeEnv={...process.env,LABFLOW_RECOVERY_MODE:'true',DB_RUNTIME_MODE:'hardened',RUNTIME_DATABASE_URL:readOnly.toString(),REPORT_STORAGE_ROOT:root,SENDPK_API_KEY:'',SENDPK_SENDER:''};
    for(const key of Object.keys(smokeEnv))if(key==='DATABASE_URL'||key.startsWith('PROVISION_')||key==='RUNTIME_DB_PASSWORD')delete smokeEnv[key];
    await command(process.execPath,[path.resolve(__dirname,'../recovery-smoke.cjs')],smokeEnv,true);
    await validateRestored({ownerUrl:targetUrl.toString(),targetArtifactRoot:root},verified);
    await fs.writeFile(recoveryConfig,'LABFLOW_RECOVERY_MODE="true"\nDB_RUNTIME_MODE="hardened"\nRUNTIME_DATABASE_URL='+JSON.stringify(readOnly.toString())+'\nREPORT_STORAGE_ROOT='+JSON.stringify(root)+'\nSENDPK_API_KEY=""\nSENDPK_SENDER=""\n',{flag:'wx',mode:0o600});
    return {targetDatabase:target,targetArtifactRoot:root,runtimeRole,recoveryConfig,runtimeUrl:readOnly.toString(),ownerUrl:targetUrl.toString(),schemaValidation:'passed',manifest:verified.manifest};
  }finally{await runtime?.end();await owner.end();await admin.end();}
}
async function cutover(options){
  // Explicit owner-side maintenance only, after exact restore verification and with API stopped.
  const verified=await verifyBackup(options);
  const target=pgEnv(options.ownerUrl).PGDATABASE;
  if((target==='lms_v2'||target===verified.manifest.database)&&!(options.allowOperationalRestore&&options.confirmOperationalRestore==='RESTORE '+target))fail('OPERATIONAL_CUTOVER_REFUSED');
  await validateRestored(options,verified);
  const db=new Client({connectionString:options.ownerUrl});await db.connect();
  try{await db.query('BEGIN');const totals={sessions:0,notifications:0};
    const tenants=(await db.query('SELECT id FROM tenants ORDER BY id FOR UPDATE')).rows;
    for(const t of tenants){
      const sessions=await db.query(`UPDATE auth_sessions SET "revokedAt"=clock_timestamp(),"revocationReason"='DISASTER_RECOVERY' WHERE "tenantId"=$1 AND "revokedAt" IS NULL`,[t.id]);
      const notifications=await db.query(`UPDATE notifications SET status='RECONCILIATION_REQUIRED',"lastErrorCode"='RESTORED_BACKUP_UNCERTAIN',"lastError"='Historical backup requires administrator reconciliation',"nextAttemptAt"=NULL,"nextDeliveryCheckAt"=NULL,"claimedAt"=NULL,"claimExpiresAt"=NULL,"claimedBy"=NULL,"updatedAt"=clock_timestamp() WHERE "tenantId"=$1 AND channel='SMS' AND status IN ('QUEUED','RETRYING','SENDING')`,[t.id]);
      totals.sessions+=sessions.rowCount;totals.notifications+=notifications.rowCount;
      if(sessions.rowCount||notifications.rowCount)await db.query(`INSERT INTO audit_logs(id,"tenantId",action,"entityType","entityId","after") VALUES (gen_random_uuid()::text,$1,'RECOVERY_CUTOVER','Recovery',$2,$3::jsonb)`,[t.id,verified.manifest.backupId,JSON.stringify({revokedSessions:sessions.rowCount,heldNotifications:notifications.rowCount,actorContext:'OWNER_RECOVERY_MAINTENANCE'})]);
    }
    await db.query('COMMIT');return totals;
  }catch(e){await db.query('ROLLBACK');throw e;}finally{await db.end();}
}
module.exports={backup,verifyBackup,restore,cutover,validateRestored,snapshot,retention,status,pgEnv,command,tool,safePath,inside,fileHash};

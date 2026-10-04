const {resolve}=require('node:path'),{existsSync}=require('node:fs'),{createRequire}=require('node:module');
const req=createRequire(resolve(__dirname,'../packages/database/package.json'));
req('./dist/environment').loadDatabaseEnvironment();
if(existsSync(resolve(__dirname,'../apps/api/.env.runtime')))require('node:process').loadEnvFile(resolve(__dirname,'../apps/api/.env.runtime'));
const apiReq=createRequire(resolve(__dirname,'../apps/api/package.json'));
const {persistentReportRoot}=apiReq('./dist/modules/printing/report-artifact.store');
const lib=require('./lib/backup-recovery.cjs');
(async()=>{
  const [action,...argv]=process.argv.slice(2),args={};
  const allowed=new Set(['destination','retentionDays','backupPath','targetDatabase','targetArtifactRoot','verifyOnly','pgBin','allowOperationalRestore','confirmOperationalRestore','confirmCutover']);
  for(let i=0;i<argv.length;i++){const key=argv[i].replace(/^--/,'');if(!argv[i].startsWith('--')||!allowed.has(key))throw new Error('INVALID_ARGUMENT');args[key]=['verifyOnly','allowOperationalRestore'].includes(key)?true:argv[++i];if(args[key]===undefined)throw new Error('MISSING_ARGUMENT');}
  const options={...args,ownerUrl:process.env.DATABASE_URL,adminUrl:process.env.PROVISION_DATABASE_URL,
    artifactRoot:args.verifyOnly||action==='status'?undefined:persistentReportRoot()};
  if(args.retentionDays)options.retentionDays=Number(args.retentionDays);
  let result;
  if(action==='backup'){
    result=await lib.backup(options);
    if(result.sameVolume)console.warn('Backup and report storage are on the same volume; this does not protect against that volume failing. Also confirm the database data volume is separate.');
    if(result.retentionWarning)console.warn('Backup completed, but retention did not finish. Review older packages separately.');
    result={backupPath:result.backupPath,createdAt:result.manifest.createdAt,migrationCount:result.manifest.migrationCount,artifactCount:result.manifest.artifactCount,verification:'passed'};
  }else if(action==='restore'){
    result=await lib.restore(options);
    result=args.verifyOnly?{verification:'passed'}:{targetDatabase:result.targetDatabase,targetArtifactRoot:result.targetArtifactRoot,recoveryConfig:result.recoveryConfig,verification:'passed; recovery mode required; exact comparison complete'};
  }else if(action==='cutover'){
    if(!args.targetDatabase||args.confirmCutover!=='CUTOVER '+args.targetDatabase)throw new Error('EXPLICIT_CUTOVER_CONFIRMATION_REQUIRED');
    const u=new URL(options.ownerUrl);u.pathname='/'+args.targetDatabase;options.ownerUrl=u.toString();
    if(args.targetDatabase==='lms_v2'&&!(args.allowOperationalRestore&&args.confirmOperationalRestore==='RESTORE lms_v2'))throw new Error('OPERATIONAL_CUTOVER_REFUSED');
    result=await lib.cutover(options);
  }else if(action==='status')result=await lib.status(options);
  else throw new Error('INVALID_ACTION');
  console.log(JSON.stringify(result));
})().catch(e=>{console.error('LabFlow backup/recovery failed: '+(/^[A-Z_]+$/.test(e.message)?e.message:'IO_OR_DATABASE_ERROR')+'. Raw details suppressed to protect medical data and credentials.');process.exitCode=1;});

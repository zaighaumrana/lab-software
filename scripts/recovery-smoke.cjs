// Controlled read-only API context; no listener, login, printing counters or outbound providers.
const {createRequire}=require('node:module'),{resolve}=require('node:path');
const req=createRequire(resolve(__dirname,'../apps/api/package.json'));
const {NestFactory}=req('@nestjs/core'),{AppModule}=req('./dist/app.module');
const {PrismaService}=req('./dist/common/prisma/prisma.service');
const {ReportingService}=req('./dist/modules/reporting/reporting.service');
const {ReportArtifactService}=req('./dist/modules/printing/report-artifact.service');
const {ReportArtifactStore}=req('./dist/modules/printing/report-artifact.store');
(async()=>{
  if(process.env.LABFLOW_RECOVERY_MODE!=='true'||process.env.DATABASE_URL||process.env.PROVISION_DATABASE_URL)throw new Error('Recovery environment isolation required');
  const app=await NestFactory.createApplicationContext(AppModule,{logger:false});
  try{
    const db=app.get(PrismaService);await db.patient.count();await db.payment.count();await db.auditLog.count();
    const rows=await db.reportVersion.findMany({where:{pdfPath:{not:null}},select:{tenantId:true,reportId:true,versionNo:true}});
    const artifacts=app.get(ReportArtifactService);artifacts.store=new ReportArtifactStore(process.env.REPORT_STORAGE_ROOT);
    for(const row of rows){const projection=await app.get(ReportingService).findVersion(row.tenantId,row.reportId,row.versionNo);await artifacts.pdf(projection,()=>{throw new Error('Canonical PDF must not regenerate');});}
  }finally{await app.close();}
  console.log('Read-only recovery application smoke passed.');
})().catch(()=>{console.error('Recovery application smoke failed; private details suppressed.');process.exitCode=1;});

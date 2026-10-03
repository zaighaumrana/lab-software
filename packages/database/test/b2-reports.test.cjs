// Nine B2 invariants, using the existing fresh/disposable database harness and a fake PDF renderer.
const assert = require('node:assert/strict');
const { test, before, after } = require('node:test');
const { createRequire } = require('node:module');
const { resolve, join, dirname } = require('node:path');
const { tmpdir } = require('node:os');
const { mkdtemp, rm, readFile, writeFile, unlink, readdir } = require('node:fs/promises');
const { randomUUID } = require('node:crypto');
const { createDatabaseClient, captureReleasedReportVersion } = require('@lms/database');
const req = createRequire(resolve('../../apps/api/package.json'));
const { BillingService } = req('./dist/modules/billing/billing.service');
const { BookingsService } = req('./dist/modules/bookings/bookings.service');
const { LaboratoryService } = req('./dist/modules/laboratory/laboratory.service');
const { ReportingService } = req('./dist/modules/reporting/reporting.service');
const { ReportArtifactService } = req('./dist/modules/printing/report-artifact.service');
const { ReportArtifactStore, pdfHash, persistentReportRoot } = req('./dist/modules/printing/report-artifact.store');
const { buildReportHtml } = req('./dist/modules/printing/templates/report.template');
const { canPrintReport } = req('./dist/common/report-eligibility.util');
let db, tenantId, branchId, patient, actor, doctor, catalog, billing, lab, reporting;
const roots = [];
const settings = { labName:'Fixture branding',printMode:'PLAIN',marginTopMm:10,marginBottomMm:10,reportPagination:'CONTINUOUS' };
before(async()=>{
  const url=process.env.DATABASE_TEST_URL;
  assert(url && /^\/labflow_prisma7_test_[a-f0-9]{16}$/.test(new URL(url).pathname));
  db=createDatabaseClient({connectionString:url});
  tenantId=(await db.tenant.create({data:{name:'B2 fixture',slug:'b2-fixture'}})).id;
  branchId=(await db.branch.create({data:{tenantId,name:'Fixture',code:'B2'}})).id;
  actor=(await db.user.create({data:{tenantId,branchId,username:'b2',fullName:'Release actor',role:'ADMIN',passwordHash:'not-a-login'}})).id;
  patient=await db.patient.create({data:{tenantId,branchId,fullName:'Original patient',phone:'03000000001',labNumber:'LAB-B2',mrcNumber:'MRC-B2',gender:'MALE',smsConsent:false}});
  doctor=await db.doctor.create({data:{tenantId,fullName:'Original referrer',shareValue:0}});
  catalog=await db.test.create({data:{tenantId,code:'B2',name:'Original test',basePrice:100,parameters:{create:{code:'P',name:'Frozen parameter'}}}});
  billing=new BillingService(db,new BookingsService(db));
  lab=new LaboratoryService(db,{sendTemplatedSms:async()=>{}},{notifySampleChanged:()=>{}});
  reporting=new ReportingService(db);
});
after(async()=>{
  await db?.$disconnect();
  for(const root of roots) {
    assert.equal(resolve(dirname(root)),resolve(tmpdir())); assert(root.includes('labflow-b2-artifacts-'));
    await rm(root,{recursive:true,force:true});
  }
});
async function fixture(complete=true) {
  const booking=await db.booking.create({data:{tenantId,branchId,patientId:patient.id,doctorId:doctor.id,bookingCode:randomUUID(),status:'CONFIRMED'}});
  const inv=await billing.createInvoice(tenantId,branchId,{bookingId:booking.id,lines:[{testId:catalog.id,quantity:2}]});
  const orders=inv.visit.orderedTests;
  const sample=await lab.collectSample(tenantId,branchId,{invoiceId:inv.id,orderedTestIds:orders.map(o=>o.id),sampleType:'Blood'},actor);
  await lab.receiveSample(tenantId,sample.id,actor); await lab.acceptSample(tenantId,sample.id,undefined,actor);
  const results=[];
  if(complete) for(const order of orders) results.push(await enter(sample,order));
  return {inv,orders,sample,results};
}
function enter(sample,order,value=15) {
  return lab.enterResult(tenantId,{sampleId:sample.id,orderedTestId:order.id,values:[{versionParameterId:order.testVersion.versionParameters[0].id,valueNumeric:value}],releaseImmediately:true},actor);
}
async function versions(f) { return reporting.listVersions(tenantId,f.inv.report.id); }
async function correct(f,index=0,value=20) {
  const draft=await lab.reopenResult(tenantId,f.results[index].id,'Verified transcription correction',actor);
  await lab.enterResult(tenantId,{sampleId:f.sample.id,orderedTestId:f.orders[index].id,
    values:[{versionParameterId:f.orders[index].testVersion.versionParameters[0].id,valueNumeric:value}]},actor);
  return lab.finalizeResult(tenantId,draft.id,actor);
}
async function artifactService(render) {
  const root=await mkdtemp(join(tmpdir(),'labflow-b2-artifacts-')); roots.push(root);
  const service=new ReportArtifactService(db,{renderPdf:render});
  service.store=new ReportArtifactStore(root); // Fixture-only dependency; never resolves persistent runtime storage.
  return {service,root,store:service.store};
}
test('A initial release records exact occurrence membership only after every result is released',async()=>{
  const f=await fixture(false); assert.equal((await versions(f)).length,0);
  const first=await enter(f.sample,f.orders[0]); assert.equal((await versions(f)).length,0);
  const second=await enter(f.sample,f.orders[1]);
  const report=await reporting.findById(tenantId,f.inv.report.id),v=report.currentVersion;
  assert.equal(v.versionNo,1); assert.equal(v.kind,'INITIAL'); assert.equal(v.releasedById,actor);
  assert.equal(v.previousVersionId,null); assert.equal(report.currentVersionId,v.id);
  assert.deepEqual(v.memberships.map(m=>m.resultId),[first.id,second.id]);
  assert.deepEqual(v.memberships.map(m=>m.orderedTestId),f.orders.map(o=>o.id));
});
test('B unchanged recomputation and simultaneous capture are idempotent',async()=>{
  const f=await fixture(),before=(await versions(f))[0];
  const ids=await Promise.all([1,2].map(()=>db.$transaction(tx=>captureReleasedReportVersion(tx,tenantId,f.inv.report.id))));
  await lab.markInvoiceReady(tenantId,f.inv.id,actor);
  assert.deepEqual(ids,[before.id,before.id]); assert.equal((await versions(f)).length,1);
  assert.equal((await versions(f))[0].contentHash,before.contentHash);
});
test('C corrected finalization appends version two and reuses unchanged result revisions',async()=>{
  const f=await fixture(),v1=await reporting.findVersion(tenantId,f.inv.report.id,1);
  const replacement=await correct(f),v2=await reporting.findById(tenantId,f.inv.report.id);
  assert.equal(v2.currentVersion.versionNo,2); assert.equal(v2.currentVersion.previousVersionId,v1.selectedVersion.id);
  assert.equal(v2.currentVersion.kind,'AMENDMENT'); assert.equal(v2.status,'AMENDED');
  assert.equal(v2.currentVersion.amendmentReason,'Verified transcription correction'); assert.equal(v2.currentVersion.releasedById,actor);
  assert.deepEqual(v2.currentVersion.memberships.map(m=>m.resultId),[replacement.id,f.results[1].id]);
  assert.deepEqual((await reporting.findVersion(tenantId,f.inv.report.id,1)).selectedVersion.memberships.map(m=>m.resultId),f.results.map(r=>r.id));
  await Promise.all([1,2].map(()=>db.$transaction(tx=>captureReleasedReportVersion(tx,tenantId,f.inv.report.id))));
  assert.equal((await versions(f)).length,2);
  const simultaneous=[];
  for(const id of [replacement.id,f.results[1].id]) simultaneous.push(await lab.reopenResult(tenantId,id,'Parallel review',actor));
  await Promise.all(simultaneous.map(d=>lab.finalizeResult(tenantId,d.id,actor)));
  assert.deepEqual((await versions(f)).map(v=>v.versionNo),[1,2,3]);
});
test('D open correction preserves the prior current version without publishing a draft',async()=>{
  const f=await fixture(),v1=(await versions(f))[0];
  await lab.reopenResult(tenantId,f.results[0].id,'Review',actor);
  const report=await reporting.findById(tenantId,f.inv.report.id);
  assert.equal(report.currentVersionId,v1.id); assert.equal((await versions(f)).length,1);
  assert.deepEqual(report.currentVersion.memberships.map(m=>m.resultId),f.results.map(r=>r.id));
  assert.equal(canPrintReport(report,report.invoice),false,'Payment gating still applies to a released version');
});
test('E current/tracking reads use pinned membership even when live released rows differ',async()=>{
  const f=await fixture();
  const drafts=[]; for(const result of f.results) drafts.push(await lab.reopenResult(tenantId,result.id,'Review both',actor));
  await lab.finalizeResult(tenantId,drafts[0].id,actor); // Other draft prevents publication of another full report.
  assert.equal((await versions(f)).length,1);
  for(const report of [await reporting.findById(tenantId,f.inv.report.id),await reporting.findByTrackingId(tenantId,f.inv.report.trackingId)]) {
    assert.deepEqual(report.invoice.samples.flatMap(s=>s.results).map(r=>r.id),f.results.map(r=>r.id));
  }
  assert.equal((await db.result.findUniqueOrThrow({where:{id:f.results[0].id}})).status,'SUPERSEDED');
});
test('F historical content/snapshots survive amendment and master-data edits; native history edits fail',async()=>{
  const f=await fixture(); await correct(f);
  await db.patient.update({where:{id:patient.id},data:{fullName:'Changed patient',phone:'03000000002'}});
  await db.doctor.update({where:{id:doctor.id},data:{fullName:'Changed referrer'}});
  await db.test.update({where:{id:catalog.id},data:{name:'Changed catalog label'}});
  const old=await reporting.findVersion(tenantId,f.inv.report.id,1);
  assert.equal(old.invoice.booking.patient.fullName,'Original patient'); assert.equal(old.invoice.booking.doctor.fullName,'Original referrer');
  assert.deepEqual(old.selectedVersion.memberships.map(m=>m.resultId),f.results.map(r=>r.id));
  assert.equal(old.selectedVersion.memberships[0].result.test.name,'Original test');
  const html=buildReportHtml(old,settings); assert(html.includes('Original patient')); assert(!html.includes('Changed patient'));
  await assert.rejects(()=>reporting.findVersion('another-tenant',f.inv.report.id,1));
  await assert.rejects(()=>db.reportVersion.update({where:{id:old.selectedVersion.id},data:{displaySnapshot:{patient:{fullName:'tamper'}}}}));
  await assert.rejects(()=>db.reportVersion.delete({where:{id:old.selectedVersion.id}}));
  await assert.rejects(()=>db.reportVersionResult.deleteMany({where:{reportVersionId:old.selectedVersion.id}}));
  const replacementId=(await reporting.findVersion(tenantId,f.inv.report.id,2)).selectedVersion.memberships[0].resultId;
  await assert.rejects(()=>db.reportVersionResult.update({where:{reportVersionId_orderedTestId:{reportVersionId:old.selectedVersion.id,orderedTestId:f.orders[0].id}},data:{resultId:replacementId}}));
  await db.patient.update({where:{id:patient.id},data:{fullName:'Original patient',phone:'03000000001'}});
  await db.doctor.update({where:{id:doctor.id},data:{fullName:'Original referrer'}});
  await db.test.update({where:{id:catalog.id},data:{name:'Original test'}});
});
test('G first artifact renders/stores/reads back; later requests reuse exact bytes and version print metadata',async()=>{
  const f=await fixture(),report=await reporting.findVersion(tenantId,f.inv.report.id,1); let renders=0;
  const {service,root,store}=await artifactService(async()=>{renders++;return Buffer.from('%PDF-1.4\nFixture canonical PDF\n%%EOF');});
  const first=await service.pdf(report,async()=>settings);
  const second=await service.pdf(report,async()=>{throw new Error('Stored artifact must not reload settings');});
  assert.equal(renders,1); assert.deepEqual(second,first);
  const v=await db.reportVersion.findUniqueOrThrow({where:{id:report.selectedVersion.id}});
  assert.equal(v.pdfSha256,pdfHash(first)); assert.equal(v.pdfByteSize,first.length);
  assert.deepEqual(await readFile(join(root,v.pdfPath)),first);
  assert((await readdir(dirname(join(root,v.pdfPath)))).every(name=>name.endsWith('.pdf')));
  await assert.rejects(()=>store.read('another-tenant',f.inv.report.id,1,v));
  await assert.rejects(()=>store.publish('../escape',f.inv.report.id,1,first));
  const configured=process.env.REPORT_STORAGE_ROOT; process.env.REPORT_STORAGE_ROOT=root;
  try { assert.throws(()=>persistentReportRoot()); } finally { if(configured===undefined)delete process.env.REPORT_STORAGE_ROOT;else process.env.REPORT_STORAGE_ROOT=configured; }
  await billing.recordPayment(tenantId,f.inv.id,{amount:200,method:'CASH',operationKey:randomUUID()},actor);
  await Promise.all([1,2].map(()=>reporting.markPrinted(tenantId,f.inv.report.id,v.id)));
  const printed=await db.reportVersion.findUniqueOrThrow({where:{id:v.id}});
  assert.equal(printed.printCount,2); assert(printed.firstPrintedAt<=printed.lastPrintedAt);
  assert.equal((await db.report.findUniqueOrThrow({where:{id:f.inv.report.id}})).printCount,2);
});
test('H rendering failure retries; competing artifacts select one canonical file; corruption is never regenerated',async()=>{
  const f=await fixture(),report=await reporting.findVersion(tenantId,f.inv.report.id,1);let renders=0;
  const {service,root}=await artifactService(async()=>{renders++;if(renders===1)throw new Error('Renderer unavailable');return Buffer.from(`%PDF-1.4\nCandidate ${renders}\n%%EOF`);});
  await assert.rejects(()=>service.pdf(report,async()=>settings));
  assert.equal((await db.reportVersion.findUniqueOrThrow({where:{id:report.selectedVersion.id}})).pdfPath,null);
  const bytes=await Promise.all([1,2].map(()=>service.pdf(report,async()=>settings)));
  assert.deepEqual(bytes[0],bytes[1]);
  const v=await db.reportVersion.findUniqueOrThrow({where:{id:report.selectedVersion.id}});
  assert.equal((await readdir(dirname(join(root,v.pdfPath)))).length,1);
  await assert.rejects(()=>db.reportVersion.update({where:{id:v.id},data:{pdfSha256:'0'.repeat(64)}}));
  await writeFile(join(root,v.pdfPath),'corrupt');const before=renders;
  await assert.rejects(()=>service.pdf(report,async()=>settings),/missing or corrupt/);
  await unlink(join(root,v.pdfPath)); await assert.rejects(()=>service.pdf(report,async()=>settings),/missing or corrupt/);
  assert.equal(renders,before);assert.equal((await versions(f)).length,1);
});
test('I unversioned legacy reports retain the isolated legacy result read path',async()=>{
  const booking=await db.booking.create({data:{tenantId,branchId,patientId:patient.id,bookingCode:randomUUID()}});
  const inv=await db.invoice.create({data:{tenantId,branchId,bookingId:booking.id,invoiceNumber:randomUUID(),subtotal:100,grandTotal:100,amountDue:100,
    lines:{create:{testId:catalog.id,description:'Legacy',quantity:1,basePrice:100,unitPrice:100,lineTotal:100}}},include:{lines:true}});
  const sample=await lab.collectSample(tenantId,branchId,{invoiceId:inv.id,sampleType:'Blood'},actor);
  await lab.receiveSample(tenantId,sample.id,actor);await lab.acceptSample(tenantId,sample.id,undefined,actor);
  const parameter=await db.testParameter.findFirstOrThrow({where:{testId:catalog.id}});
  const result=await lab.enterResult(tenantId,{sampleId:sample.id,testId:catalog.id,invoiceLineId:inv.lines[0].id,values:[{testParameterId:parameter.id,valueNumeric:15}],releaseImmediately:true},actor);
  const row=await db.report.findUniqueOrThrow({where:{invoiceId:inv.id}}),report=await reporting.findById(tenantId,row.id);
  assert.equal(report.currentVersion,null);assert.equal(report.invoice.samples[0].results[0].id,result.id);
  assert.deepEqual(await reporting.listVersions(tenantId,row.id),[]);
});

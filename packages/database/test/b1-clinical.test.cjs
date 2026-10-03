// Nine focused integration checks; the existing harness owns and drops this disposable DB.
const assert = require('node:assert/strict');
const { test, before, after } = require('node:test');
const { createRequire } = require('node:module');
const { resolve } = require('node:path');
const { randomUUID } = require('node:crypto');
const { createDatabaseClient, materializeInvoiceClinicalWork, assignSampleToOrderedTest, Decimal } = require('@lms/database');
const apiRequire = createRequire(resolve('../../apps/api/package.json'));
const { BillingService } = apiRequire('./dist/modules/billing/billing.service');
const { BookingsService } = apiRequire('./dist/modules/bookings/bookings.service');
const { LaboratoryService } = apiRequire('./dist/modules/laboratory/laboratory.service');
const { CatalogService } = apiRequire('./dist/modules/catalog/catalog.service');
const { ReportingService } = apiRequire('./dist/modules/reporting/reporting.service');
const { pickCompatibleRange, ageAtCollection } = apiRequire('./dist/modules/laboratory/clinical-results');
let db, tenantId, branchId, patient, actor, catalog, billing, lab, reporting, editor;
const key = () => randomUUID();
before(async () => {
  const url = process.env.DATABASE_TEST_URL;
  assert(url && /^\/labflow_prisma7_test_[a-f0-9]{16}$/.test(new URL(url).pathname));
  db = createDatabaseClient({ connectionString:url });
  tenantId = (await db.tenant.create({data:{name:'B1 fixture',slug:'b1-fixture'}})).id;
  branchId = (await db.branch.create({data:{tenantId,code:'B1',name:'Fixture'}})).id;
  actor = (await db.user.create({data:{tenantId,branchId,username:'b1',fullName:'Fixture actor',role:'ADMIN',passwordHash:'not-a-login'}})).id;
  patient = await db.patient.create({data:{tenantId,branchId,fullName:'Fixture patient',phone:'03000000001',labNumber:'B1',mrcNumber:'B1',smsConsent:false,gender:'MALE',dateOfBirth:new Date('2000-01-01T00:00:00Z')}});
  catalog = await newTest();
  billing = new BillingService(db,new BookingsService(db));
  lab = new LaboratoryService(db,{sendTemplatedSms:async()=>{}},{notifySampleChanged:()=>{}});
  reporting = new ReportingService(db); editor = new CatalogService(db);
});
after(async()=>{await db?.$disconnect();});
async function newTest(ranges=[{lowNormal:'10',highNormal:'20'}]) {
  return db.test.create({data:{tenantId,code:key(),name:'Frozen fixture',basePrice:'100',parameters:{create:{code:'P',name:'Original parameter',unit:'u',referenceRanges:{create:ranges}}}},include:{parameters:true}});
}
async function booking() {
  return db.booking.create({data:{tenantId,branchId,patientId:patient.id,bookingCode:key(),status:'CONFIRMED'}});
}
async function invoice(lines=[{testId:catalog.id,quantity:1}]) {
  const b=await booking(); return billing.createInvoice(tenantId,branchId,{bookingId:b.id,lines});
}
async function specimen(inv, orders=inv.visit.orderedTests) {
  const s=await lab.collectSample(tenantId,branchId,{invoiceId:inv.id,sampleType:'Blood',orderedTestIds:orders.map(o=>o.id)},actor);
  await lab.receiveSample(tenantId,s.id,actor); await lab.acceptSample(tenantId,s.id,undefined,actor); return s;
}
async function enter(s,o,value=15,releaseImmediately=false,extras={}) {
  return lab.enterResult(tenantId,{sampleId:s.id,orderedTestId:o.id,values:[{versionParameterId:o.testVersion.versionParameters[0].id,valueNumeric:value}],releaseImmediately,...extras},actor);
}
test('1 invoice activation: quantities, duplicate lines, package-only report and retry',async()=>{
  const inv=await invoice([{testId:catalog.id,quantity:2},{testId:catalog.id,quantity:1}]);
  assert.equal(inv.visit.orderedTests.length,3); assert.equal(inv.report.visitId,inv.visitId);
  await db.$transaction(tx=>materializeInvoiceClinicalWork(tx,inv.id));
  await assert.rejects(()=>billing.createInvoice(tenantId,branchId,{bookingId:inv.bookingId,lines:[{testId:catalog.id,quantity:1}]}));
  assert.equal(await db.visit.count({where:{bookingId:inv.bookingId}}),1);
  assert.equal(await db.orderedTest.count({where:{visitId:inv.visitId}}),3);
  const pkg=await db.package.create({data:{tenantId,code:key(),name:'Package fixture',basePrice:'180',items:{create:{testId:catalog.id}}}});
  const packaged=await invoice([{packageId:pkg.id,quantity:2}]);
  assert.equal(packaged.visit.orderedTests.length,2); assert.equal(packaged.report.visitId,packaged.visitId);
  const s=await specimen(packaged); for(const o of packaged.visit.orderedTests) await enter(s,o);
  await lab.markInvoiceReady(tenantId,packaged.id,actor);
  assert.equal((await reporting.findById(tenantId,packaged.report.id)).invoice.samples[0].results.length,2);
});
test('2 specimen assignment rejects cross-Visit scope in API and native assignment',async()=>{
  const a=await invoice(), b=await invoice(), s=await specimen(a);
  await assert.rejects(()=>lab.collectSample(tenantId,branchId,{invoiceId:a.id,orderedTestIds:[b.visit.orderedTests[0].id]},actor));
  await assert.rejects(()=>db.$transaction(tx=>assignSampleToOrderedTest(tx,s.id,b.visit.orderedTests[0].id)));
  assert.equal(await db.sample.count({where:{invoiceId:a.id}}),1);
});
test('3 result ownership rejects unassigned work and substituted client source identities',async()=>{
  const inv=await invoice([{testId:catalog.id,quantity:2}]), [a,b]=inv.visit.orderedTests;
  const s=await specimen(inv,[a]);
  await assert.rejects(()=>enter(s,b));
  await assert.rejects(()=>enter(s,a,15,false,{testId:'wrong'}));
  await assert.rejects(()=>enter(s,a,15,false,{invoiceLineId:'wrong'}));
  await assert.rejects(()=>lab.enterResult(tenantId,{sampleId:s.id,testId:catalog.id,invoiceLineId:a.invoiceLineId,values:[{testParameterId:catalog.parameters[0].id,valueNumeric:15}]},actor));
  assert.equal(await db.result.count({where:{sampleId:s.id}}),0);
});
test('4 catalog edits leave ordered frozen definition and evaluation intact',async()=>{
  const t=await newTest(), inv=await invoice([{testId:t.id,quantity:1}]), o=inv.visit.orderedTests[0];
  const capture=await db.testVersion.findUniqueOrThrow({where:{id:o.testVersionId}});
  await editor.replaceParameters(tenantId,t.id,[{code:'P',name:'Changed parameter',unit:'new',referenceRanges:[{lowNormal:100,highNormal:200}]}]);
  const s=await specimen(inv), result=await enter(s,o,15);
  assert.equal(result.values[0].parameter.name,'Original parameter'); assert.equal(result.values[0].flag,'NORMAL'); assert.equal(result.values[0].unit,'u');
  assert.equal((await db.testVersion.findUniqueOrThrow({where:{id:o.testVersionId}})).definitionHash,capture.definitionHash);
  await assert.rejects(()=>db.testVersionParameter.update({where:{id:o.testVersion.versionParameters[0].id},data:{name:'tamper'}}));
  await assert.rejects(()=>db.testVersionReferenceRange.deleteMany({where:{versionParameterId:o.testVersion.versionParameters[0].id}}));
});
test('5 applicability filters gender/age/unknown; no eligible range leaves flag empty',async()=>{
  const base={ageMinMonths:null,ageMaxMonths:null,lowNormal:new Decimal(10),highNormal:new Decimal(20),criticalLow:null,criticalHigh:null,unit:null,interpretation:null};
  const male={...base,id:'male',gender:'MALE'}, female={...base,id:'female',gender:'FEMALE'}, child={...base,id:'child',gender:null,ageMaxMonths:12}, generic={...base,id:'generic',gender:null};
  assert.equal(pickCompatibleRange([female,male],'MALE',240).id,'male');
  assert.equal(pickCompatibleRange([child,generic],'MALE',240).id,'generic');
  assert.equal(pickCompatibleRange([female,male,child,generic],'UNKNOWN',null).id,'generic');
  assert.equal(pickCompatibleRange([female,child],'MALE',240),null);
  assert.equal(ageAtCollection(new Date('2000-01-01T00:00:00Z'),new Date('2001-01-01T00:00:00Z')),12);
  const t=await newTest([{gender:'FEMALE',lowNormal:'10',highNormal:'20'}]), inv=await invoice([{testId:t.id,quantity:1}]);
  const result=await enter(await specimen(inv),inv.visit.orderedTests[0],15);
  assert.equal(result.values[0].flag,null); assert.equal(result.values[0].selectedRangeId,null);
  assert.equal(result.values[0].evaluationAgeMonths,ageAtCollection(patient.dateOfBirth,result.values[0].evaluatedAt));
});
test('6 released evidence is immutable; reopen/finalize and direct amendment share revisions',async()=>{
  const inv=await invoice(),o=inv.visit.orderedTests[0],s=await specimen(inv),v1=await enter(s,o,15,true);
  await assert.rejects(()=>db.result.update({where:{id:v1.id},data:{notes:'tamper'}}));
  await assert.rejects(()=>db.resultValue.update({where:{id:v1.values[0].id},data:{valueNumeric:99}}));
  await assert.rejects(()=>db.resultValue.delete({where:{id:v1.values[0].id}}));
  await assert.rejects(()=>db.result.update({where:{id:v1.id},data:{status:'SUPERSEDED'}}));
  const draft=await lab.reopenResult(tenantId,v1.id,'Correct transcription',actor);
  assert.notEqual(draft.id,v1.id); assert.equal(draft.revisionNo,2);
  assert.equal((await db.result.findUniqueOrThrow({where:{id:v1.id}})).status,'RELEASED');
  await assert.rejects(()=>lab.reopenResult(tenantId,v1.id,'Second draft',actor));
  await enter(s,o,16); await lab.finalizeResult(tenantId,draft.id,actor);
  const old=await db.result.findUniqueOrThrow({where:{id:v1.id},include:{values:true}});
  assert.equal(old.status,'SUPERSEDED'); assert.equal(old.values[0].valueNumeric.toString(),'15'); assert.equal(old.releasedAt.toISOString(),v1.releasedAt.toISOString());
  const v3=await lab.amendResult(tenantId,draft.id,{amendmentReason:'Reviewed correction',values:[{versionParameterId:o.testVersion.versionParameters[0].id,valueNumeric:17}]},actor);
  assert.equal(v3.revisionNo,3); assert.equal(v3.status,'RELEASED'); assert.equal(v3.amendmentActorId,actor);
});
test('7 duplicate occurrences require distinct results before readiness completes',async()=>{
  const inv=await invoice([{testId:catalog.id,quantity:2}]),s=await specimen(inv),[a,b]=inv.visit.orderedTests;
  await enter(s,a,15,true);
  let detail=await lab.getSample(tenantId,s.id); assert.equal(detail.invoiceReadiness.enteredCount,1); assert.equal(detail.invoiceReadiness.allReleased,false);
  await assert.rejects(()=>lab.markInvoiceReady(tenantId,inv.id,actor));
  await enter(s,b,15); await lab.markInvoiceReady(tenantId,inv.id,actor);
  detail=await lab.getSample(tenantId,s.id); assert.equal(detail.invoiceReadiness.allReleased,true); assert.equal(detail.invoiceResultsPreview.length,2);
  const released=detail.results.find(r=>r.orderedTestId===a.id);
  await lab.reopenResult(tenantId,released.id,'Review',actor);
  assert.equal((await lab.getSample(tenantId,s.id)).invoiceReadiness.allReleased,false);
});
test('8 current report and tracking projection exclude superseded evidence',async()=>{
  const inv=await invoice(),o=inv.visit.orderedTests[0],s=await specimen(inv),v1=await enter(s,o,15,true);
  const draft=await lab.reopenResult(tenantId,v1.id,'Correction',actor);
  assert.equal((await reporting.findById(tenantId,inv.report.id)).invoice.samples[0].results[0].id,v1.id);
  await enter(s,o,18); await lab.finalizeResult(tenantId,draft.id,actor);
  for(const report of [await reporting.findById(tenantId,inv.report.id),await reporting.findByTrackingId(tenantId,inv.report.trackingId)]) {
    const results=report.invoice.samples.flatMap(s=>s.results); assert.equal(results.length,1); assert.equal(results[0].id,draft.id); assert.equal(results[0].values[0].parameter.name,'Original parameter');
  }
  assert.equal(await db.result.count({where:{orderedTestId:o.id}}),2);
});
test('9 genuine legacy invoice/result remains readable without occurrence identity',async()=>{
  const b=await booking();
  const inv=await db.invoice.create({data:{tenantId,branchId,bookingId:b.id,invoiceNumber:key(),subtotal:100,grandTotal:100,amountDue:100,lines:{create:{testId:catalog.id,description:'Legacy',quantity:1,basePrice:100,unitPrice:100,lineTotal:100}}},include:{lines:true}});
  const s=await lab.collectSample(tenantId,branchId,{invoiceId:inv.id,sampleType:'Blood'},actor);
  await lab.receiveSample(tenantId,s.id,actor); await lab.acceptSample(tenantId,s.id,undefined,actor);
  const result=await lab.enterResult(tenantId,{sampleId:s.id,invoiceLineId:inv.lines[0].id,testId:catalog.id,values:[{testParameterId:catalog.parameters[0].id,valueNumeric:15}],releaseImmediately:true},actor);
  assert.equal(result.orderedTestId,null);
  const report=await db.report.findUniqueOrThrow({where:{invoiceId:inv.id}});
  assert.equal((await reporting.findById(tenantId,report.id)).invoice.samples[0].results[0].values[0].parameter.name,'Original parameter');
  assert.equal((await lab.getSample(tenantId,s.id)).invoiceReadiness.allReleased,true);
});

// Ten Phase C invariants plus one focused multi-workstation stale-state check.
const assert=require('node:assert/strict');
const {test,before,after}=require('node:test');
const {createRequire}=require('node:module');
const {resolve,join,dirname}=require('node:path');
const {tmpdir}=require('node:os');
const {mkdtemp,rm,readFile}=require('node:fs/promises');
const {randomUUID}=require('node:crypto');
const {createDatabaseClient,Decimal}=require('@lms/database');
const req=createRequire(resolve('../../apps/api/package.json'));
const {BillingService}=req('./dist/modules/billing/billing.service');
const {BookingsService}=req('./dist/modules/bookings/bookings.service');
const {CashShiftsService}=req('./dist/modules/cash-shifts/cash-shifts.service');
const {LaboratoryService}=req('./dist/modules/laboratory/laboratory.service');
const {ReportingService}=req('./dist/modules/reporting/reporting.service');
const {ReportingController}=req('./dist/modules/reporting/reporting.controller');
const {PrintingController}=req('./dist/modules/printing/printing.controller');
const {ReportArtifactService}=req('./dist/modules/printing/report-artifact.service');
const {ReportArtifactStore}=req('./dist/modules/printing/report-artifact.store');
const {canPrintReport}=req('./dist/common/report-eligibility.util');
let db,tenantId,branchId,otherBranch,actor,otherActor,patient,doctor,catalog,billing,shifts;
const hints=[],roots=[];
before(async()=>{
  const url=process.env.DATABASE_TEST_URL;
  assert(url && /^\/labflow_prisma7_test_[a-f0-9]{16}$/.test(new URL(url).pathname));
  db=createDatabaseClient({connectionString:url});
  tenantId=(await db.tenant.create({data:{name:'C fixture',slug:'c-fixture'}})).id;
  branchId=(await db.branch.create({data:{tenantId,name:'C',code:'C'}})).id;
  otherBranch=(await db.branch.create({data:{tenantId,name:'Other',code:'OTHER'}})).id;
  actor=(await db.user.create({data:{tenantId,branchId,username:'cashier-a',fullName:'Operator A',role:'ADMIN',passwordHash:'not-a-login'}})).id;
  otherActor=(await db.user.create({data:{tenantId,branchId,username:'cashier-b',fullName:'Operator B',role:'ADMIN',passwordHash:'not-a-login'}})).id;
  patient=await db.patient.create({data:{tenantId,branchId,fullName:'Fixture patient',phone:'03000000000',labNumber:'C',mrcNumber:'C',smsConsent:false}});
  doctor=await db.doctor.create({data:{tenantId,fullName:'Doctor',shareValue:10}});
  catalog=await db.test.create({data:{tenantId,code:'C',name:'Frozen clinical test',basePrice:1000,parameters:{create:{code:'P',name:'Parameter'}}}});
  billing=new BillingService(db,new BookingsService(db),{notifyInvoiceChanged:(tenant,id)=>hints.push({tenant,id})});
  shifts=new CashShiftsService(db);
});
after(async()=>{
  await db?.$disconnect();
  for(const root of roots) { assert.equal(dirname(root),resolve(tmpdir()));assert(root.includes('labflow-c-artifacts-'));await rm(root,{recursive:true,force:true}); }
});
async function invoice(total='1000.00',branch=branchId) {
  const booking=await db.booking.create({data:{tenantId,branchId:branch,patientId:patient.id,bookingCode:randomUUID(),status:'CONFIRMED'}});
  return db.invoice.create({data:{tenantId,branchId:branch,bookingId:booking.id,invoiceNumber:randomUUID(),status:'ISSUED',subtotal:total,grandTotal:total,amountDue:total,
    lines:{create:{description:'Original sale',basePrice:total,unitPrice:total,lineTotal:total}}},include:{lines:true}});
}
function pay(inv,amount,who=actor,key=randomUUID(),method='CASH') {return billing.recordPayment(tenantId,inv.id,{amount,method,operationKey:key},who);}
function refund(inv,payment,amount,who=actor,key=randomUUID()) {return billing.refund(tenantId,inv.id,{amount,relatedPaymentId:payment.id,reason:'Verified refund',operationKey:key},who);}
function voidInvoice(inv,key=randomUUID()) {return billing.voidInvoice(tenantId,inv.id,{reason:'Verified cancellation',operationKey:key},actor);}

test('A concurrent 700 payments against 1000 lock and re-read the remaining balance',async()=>{
  const inv=await invoice();
  const settled=await Promise.allSettled([pay(inv,700),pay(inv,700,otherActor)]);
  assert.equal(settled.filter(s=>s.status==='fulfilled').length,1);
  const current=await db.invoice.findUniqueOrThrow({where:{id:inv.id}});
  assert.equal(current.amountPaid.toFixed(2),'700.00');assert.equal(current.amountDue.toFixed(2),'300.00');
  assert.equal(await db.payment.count({where:{invoiceId:inv.id}}),1);
});
test('B exact Decimal payment and central charge/discount/write-off projection preserve the original sale',async()=>{
  const inv=await invoice('0.30'); await pay(inv,0.10); const closed=await pay(inv,0.20);
  assert.equal(closed.invoice.status,'CLOSED');assert.equal(closed.invoice.amountPaid.toFixed(2),'0.30');
  assert.equal(closed.payment.recordedById,actor);assert(closed.payment.postedAt);
  for(const [type,amount] of [['CHARGE',1],['DISCOUNT',0.25],['WRITE_OFF',0.75]]) {
    await billing.adjust(tenantId,inv.id,{type,amount,reason:'Verified adjustment',operationKey:randomUUID()},actor);
  }
  const current=await db.invoice.findUniqueOrThrow({where:{id:inv.id}});
  assert.equal(current.grandTotal.toFixed(2),'0.30');assert.equal(current.amountDue.toFixed(2),'0.00');assert.equal(current.status,'CLOSED');
  await assert.rejects(()=>pay(inv,0.001));
  await assert.rejects(()=>db.invoice.update({where:{id:inv.id},data:{grandTotal:1}}));
  await assert.rejects(()=>db.invoiceLine.update({where:{id:inv.lines[0].id},data:{lineTotal:1}}));
});
test('C identical concurrent keys reuse one movement and changed payload keys fail',async()=>{
  const inv=await invoice(),key=randomUUID();
  const [a,b]=await Promise.all([pay(inv,500,actor,key),pay(inv,500,actor,key)]);
  assert.equal(a.payment.id,b.payment.id);assert.equal(await db.payment.count({where:{invoiceId:inv.id}}),1);
  await assert.rejects(()=>pay(inv,400,actor,key));
  assert(hints.some(h=>h.tenant===tenantId && h.id===inv.id));
});
test('D partial refund retains immutable receipt and lowers net paid/reopens balance',async()=>{
  const inv=await invoice(),receipt=(await pay(inv,1000)).payment,key=randomUUID();
  const original=await db.payment.findUniqueOrThrow({where:{id:receipt.id}});
  const first=await refund(inv,receipt,250,actor,key),retry=await refund(inv,receipt,250,actor,key);
  assert.equal(first.adjustment.id,retry.adjustment.id);assert.equal(first.invoice.status,'ISSUED');
  assert.equal(first.invoice.amountPaid.toFixed(2),'750.00');assert.equal(first.invoice.amountDue.toFixed(2),'250.00');
  assert.deepEqual(await db.payment.findUniqueOrThrow({where:{id:receipt.id}}),original);
  await assert.rejects(()=>db.payment.update({where:{id:receipt.id},data:{amount:900}}));
  await assert.rejects(()=>db.payment.delete({where:{id:receipt.id}}));
  await assert.rejects(()=>db.invoiceAdjustment.update({where:{id:first.adjustment.id},data:{amount:1}}));
});
test('E concurrent refunds cannot exceed received funds; full refund is explicit and blocks receipt',async()=>{
  const inv=await invoice(),receipt=(await pay(inv,1000)).payment;
  const results=await Promise.allSettled([refund(inv,receipt,700),refund(inv,receipt,700,otherActor)]);
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
  const rest=await refund(inv,receipt,300);
  assert.equal(rest.invoice.status,'REFUNDED');assert.equal(rest.invoice.amountPaid.toFixed(2),'0.00');
  assert.equal(rest.invoice.amountDue.toFixed(2),'1000.00');await assert.rejects(()=>pay(inv,1000));
});
test('F unpaid void records actor/reason and blocks later payments even with cached balance',async()=>{
  const inv=await invoice(),key=randomUUID();
  const first=await voidInvoice(inv,key),retry=await voidInvoice(inv,key);
  assert.equal(first.adjustment.id,retry.adjustment.id);assert.equal(first.adjustment.createdById,actor);
  assert.equal(first.invoice.status,'VOIDED');assert.equal(first.invoice.voidReason,'Verified cancellation');
  assert.equal(first.invoice.amountDue.toFixed(2),'0.00');await assert.rejects(()=>pay(inv,100));
  assert.equal(canPrintReport({status:'COMPLETE'},first.invoice),false);
});
test('G paid invoice cannot silently void; explicit complete refund permits a retained void',async()=>{
  const inv=await invoice(),receipt=(await pay(inv,500)).payment;
  await assert.rejects(()=>voidInvoice(inv));assert.equal(await db.invoiceAdjustment.count({where:{invoiceId:inv.id}}),0);
  await refund(inv,receipt,500); const cancelled=await voidInvoice(inv);
  assert.equal(cancelled.invoice.status,'VOIDED');assert.equal(cancelled.invoice.amountPaid.toFixed(2),'0.00');
  assert.equal(await db.payment.count({where:{invoiceId:inv.id}}),1);
});
test('H refunds/voids reverse unpaid shares and retain paid share evidence in clawback state',async()=>{
  const inv=await invoice(),receipt=(await pay(inv,1000)).payment;
  const a=await db.doctorShare.create({data:{tenantId,doctorId:doctor.id,invoiceId:inv.id,shareType:'PERCENTAGE',rateOrAmount:10,calculatedAmount:100}});
  const b=await db.doctorShare.create({data:{tenantId,doctorId:doctor.id,invoiceId:inv.id,shareType:'PERCENTAGE',rateOrAmount:10,calculatedAmount:100,status:'PAID',paidAmount:100,paidAt:new Date()}});
  await refund(inv,receipt,100);
  const unpaid=await db.doctorShare.findUniqueOrThrow({where:{id:a.id}}),paid=await db.doctorShare.findUniqueOrThrow({where:{id:b.id}});
  assert.equal(unpaid.status,'REVERSED');assert.equal(unpaid.calculatedAmount.toFixed(2),'100.00');
  assert.equal(paid.status,'CLAWBACK_PENDING');assert.equal(paid.paidAmount.toFixed(2),'100.00');assert(paid.paidAt);assert(paid.clawbackAt);
  const cancelled=await invoice(); const share=await db.doctorShare.create({data:{tenantId,doctorId:doctor.id,invoiceId:cancelled.id,shareType:'FIXED_AMOUNT',rateOrAmount:100,calculatedAmount:100}});
  await voidInvoice(cancelled);assert.equal((await db.doctorShare.findUniqueOrThrow({where:{id:share.id}})).status,'REVERSED');
});
test('I cash shift attributes branch/cashier receipts and refunds once and serializes closing',async()=>{
  const openings=await Promise.allSettled([shifts.open(tenantId,branchId,actor),shifts.open(tenantId,branchId,otherActor)]);
  assert.equal(openings.filter(r=>r.status==='fulfilled').length,1);
  const shift=openings.find(r=>r.status==='fulfilled').value,who=shift.openedById,other=who===actor?otherActor:actor;
  const owned=await invoice(),receipt=(await pay(owned,100,who)).payment;
  await pay(await invoice(),200,other);await pay(await invoice(),300,who,randomUUID(),'BANK_TRANSFER');await pay(await invoice('1000',otherBranch),400,who);
  await refund(owned,receipt,25,who);
  assert.equal((await shifts.getCurrent(tenantId,branchId)).expectedSoFar.toFixed(2),'75.00');
  await assert.rejects(()=>shifts.close(tenantId,shift.id,other,{countedCash:75}));
  const pending=await invoice();
  await Promise.allSettled([pay(pending,50,who),shifts.close(tenantId,shift.id,who,{countedCash:75})]);
  const closed=await db.cashShift.findUniqueOrThrow({where:{id:shift.id}});
  const assigned=await db.payment.aggregate({where:{cashShiftId:shift.id},_sum:{amount:true}});
  assert.equal(closed.expectedCash.toFixed(2),new Decimal(assigned._sum.amount).minus(25).toFixed(2));
  const next=await shifts.open(tenantId,branchId,who);assert.equal((await shifts.getCurrent(tenantId,branchId)).expectedSoFar.toFixed(2),'0.00');
  await shifts.close(tenantId,next.id,who,{countedCash:0});
});
test('J failures after movement creation roll back receipt/adjustment and projection together',async()=>{
  const inv=await invoice();
  const fault={$transaction:fn=>db.$transaction(tx=>fn(new Proxy(tx,{get(target,key){
    if(key==='invoice')return new Proxy(target.invoice,{get(model,method){if(method==='update')return async()=>{throw new Error('Injected projection failure');};return model[method];}});
    return target[key];
  }})))};
  const failing=new BillingService(fault,new BookingsService(db));
  await assert.rejects(()=>failing.recordPayment(tenantId,inv.id,{amount:100,method:'CASH',operationKey:randomUUID()},actor),/Injected projection failure/);
  await assert.rejects(()=>failing.adjust(tenantId,inv.id,{type:'CHARGE',amount:100,reason:'Rollback fixture',operationKey:randomUUID()},actor),/Injected projection failure/);
  assert.equal(await db.payment.count({where:{invoiceId:inv.id}}),0);assert.equal(await db.invoiceAdjustment.count({where:{invoiceId:inv.id}}),0);
  const unchanged=await db.invoice.findUniqueOrThrow({where:{id:inv.id}});assert.equal(unchanged.amountPaid.toFixed(2),'0.00');assert.equal(unchanged.amountDue.toFixed(2),'1000.00');
});
test('K stale workstation payment/report state cannot bypass live eligibility, including refund during rendering',async()=>{
  const booking=await db.booking.create({data:{tenantId,branchId,patientId:patient.id,bookingCode:randomUUID(),status:'CONFIRMED'}});
  const inv=await billing.createInvoice(tenantId,branchId,{bookingId:booking.id,lines:[{testId:catalog.id}]});
  const lab=new LaboratoryService(db,{sendTemplatedSms:async()=>{}},{notifySampleChanged:()=>{}}),reporting=new ReportingService(db);
  const order=inv.visit.orderedTests[0],sample=await lab.collectSample(tenantId,branchId,{invoiceId:inv.id,orderedTestIds:[order.id],sampleType:'Blood'},actor);
  await lab.receiveSample(tenantId,sample.id,actor);await lab.acceptSample(tenantId,sample.id,undefined,actor);
  await lab.enterResult(tenantId,{sampleId:sample.id,orderedTestId:order.id,values:[{versionParameterId:order.testVersion.versionParameters[0].id,valueNumeric:5}],releaseImmediately:true},actor);
  const stalePending=await reporting.findById(tenantId,inv.report.id);
  const receipt=(await pay(inv,1000,otherActor)).payment;
  await assert.rejects(()=>pay(stalePending.invoice,1000,actor)); // Operator A's pending screen cannot double-pay.
  const paid=await reporting.findById(tenantId,inv.report.id);assert.equal(canPrintReport(paid,paid.invoice),true);
  const root=await mkdtemp(join(tmpdir(),'labflow-c-artifacts-'));roots.push(root);
  let renderStarted;const started=new Promise(r=>renderStarted=r);let finish;const rendered=new Promise(r=>finish=r);
  const artifact=new ReportArtifactService(db,{renderPdf:async()=>{renderStarted();await rendered;return Buffer.from('%PDF-1.4\nImmutable clinical bytes\n%%EOF');}});
  artifact.store=new ReportArtifactStore(root);
  const settings={labName:'Fixture',printMode:'PLAIN',marginTopMm:10,marginBottomMm:10,reportPagination:'CONTINUOUS'};
  const controller=new PrintingController({},billing,reporting,{getPrintLayout:async()=>settings,getBranding:async()=>({})},{},artifact);
  let sent=false;const response={set:()=>{},send:()=>{sent=true;}};
  const request=controller.reportPdf({tenantId,userId:actor},inv.report.id,response);
  const rejection=assert.rejects(()=>request,/Pending Payment/);
  await started;await refund(inv,receipt,100,otherActor);finish();await rejection;
  assert.equal(sent,false);assert.equal((await db.report.findUniqueOrThrow({where:{id:inv.report.id}})).printCount,0);
  assert.equal(canPrintReport(paid,paid.invoice),true,'The stale client still thinks it can print');
  const preview=await new ReportingController(reporting).findOne({tenantId,userId:actor},inv.report.id);
  assert.equal(preview.deliverable,false);assert.equal(preview.selectedVersion.memberships.length,0);
  const tracking=await new ReportingController(reporting).findByTrackingId({tenantId,userId:actor},inv.report.trackingId);
  assert.equal(tracking.deliverable,false);assert.equal(tracking.invoice.samples.flatMap(s=>s.results).length,0);
  const metadata=await db.reportVersion.findUniqueOrThrow({where:{id:paid.currentVersionId}}),bytes=await readFile(join(root,metadata.pdfPath));
  await pay(inv,100,actor);
  await controller.reportPdf({tenantId,userId:actor},inv.report.id,response);assert.equal(sent,true);
  assert.deepEqual(await readFile(join(root,metadata.pdfPath)),bytes);
  assert.equal((await db.reportVersion.findUniqueOrThrow({where:{id:metadata.id}})).pdfSha256,metadata.pdfSha256);
});

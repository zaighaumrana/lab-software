import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { types } from 'pg';
import { createDatabaseClient, Prisma, CaptureProvenance, allocateVisitAccession, captureCurrentTestVersion,
  captureCurrentPackageVersion, materializeInvoiceClinicalWork, assignSampleToOrderedTest, appendSampleEvent } from '@lms/database';

const url = process.env.DATABASE_TEST_URL;
if (!url || !/^\/labflow_phase_a_populated_[a-f0-9]{16}$/.test(new URL(url).pathname)) throw Error('Disposable populated fixture required');
const nativeInstantParser = types.getTypeParser(1184);
const db = createDatabaseClient({ connectionString:url });
after(async()=>{ await db.$disconnect(); });
const tenantId='phase-a-tenant', branchId='phase-a-branch';
const txOptions={maxWait:20_000,timeout:30_000};
const transaction = <T>(fn:(tx:Prisma.TransactionClient)=>Promise<T>) => db.$transaction(fn,txOptions);
const uniqueFailure = (e:unknown) => e instanceof Prisma.PrismaClientKnownRequestError && e.code==='P2002';

async function invoice(tx:Prisma.TransactionClient, key:string, lines: {testId?:string;packageId?:string;quantity?:number}[]=[{testId:'legacy-test-cbc'}]) {
  const booking=await tx.booking.create({data:{tenantId,branchId,patientId:'legacy-patient',bookingCode:key}});
  return tx.invoice.create({data:{tenantId,branchId,bookingId:booking.id,invoiceNumber:key,
    subtotal:'100.10',grandTotal:'100.10',amountDue:'100.10',
    lines:{create:lines.map((l,i)=>({...l,description:'Synthetic work',unitPrice:'100.10',basePrice:'100.10',lineTotal:'100.10',sortOrder:i}))}},include:{lines:true}});
}
async function work(key:string) {
  return transaction(async tx=>{
    const inv=await invoice(tx,key);
    const visitId=await materializeInvoiceClinicalWork(tx,inv.id);
    const order=await tx.orderedTest.findFirstOrThrow({where:{visitId}});
    const sample=await tx.sample.create({data:{tenantId,branchId,invoiceId:inv.id,visitId,sampleCode:key,status:'COLLECTED'}});
    return {inv,visitId,order,sample};
  });
}

test('legacy backfill creates five Visits and seven distinct funded direct occurrences, not guessed package work',async()=>{
  assert.equal(await db.visit.count(),5);
  assert.equal(await db.orderedTest.count(),7);
  assert.equal(await db.testVersion.count(),2);
  assert.equal(await db.packageVersion.count(),1);
  assert.equal(await db.sampleTest.count(),3);
  assert.equal(await db.sampleEvent.count(),7);
  assert.equal(await db.orderedTest.count({where:{invoiceLineId:'legacy-line-package'}}),0);
  const repeat=await db.orderedTest.findMany({where:{invoiceLineId:{in:['legacy-line-repeat-1','legacy-line-repeat-2']}},orderBy:{occurrenceNo:'asc'}});
  assert.equal(repeat.length,2); assert.notEqual(repeat[0].id,repeat[1].id); assert.equal(repeat[0].testVersionId,repeat[1].testVersionId);
  assert.deepEqual((await db.orderedTest.findMany({where:{invoiceLineId:'legacy-line-quantity'},orderBy:{sourceUnitNo:'asc'}})).map(x=>x.sourceUnitNo),[1,2,3]);
  assert((await db.invoiceLine.findUniqueOrThrow({where:{id:'legacy-line-package'}})).phaseAReviewReason?.includes('UNSNAPSHOTTED'));
  assert.equal((await db.invoice.findUniqueOrThrow({where:{id:'legacy-invoice-mismatch'}})).visitId,null);
  assert.equal((await db.invoiceLine.findUniqueOrThrow({where:{id:'legacy-line-no-target'}})).phaseAReviewReason,'AMBIGUOUS_CATALOG_TARGET');
  assert.equal((await db.invoiceLine.findUniqueOrThrow({where:{id:'legacy-line-both-targets'}})).phaseAReviewReason,'INVALID_OR_UNBOUNDED_QUANTITY');
});

test('legacy identifiers, money, result precision, parameter FKs and printed report stay exact',async()=>{
  const inv=await db.invoice.findUniqueOrThrow({where:{id:'legacy-invoice-direct'},include:{payments:true,shares:true,report:true}});
  assert.equal(inv.grandTotal.toFixed(2),'300.00');assert.equal(inv.amountPaid.toFixed(2),'100.10');assert.equal(inv.amountDue.toFixed(2),'199.90');
  assert.equal(inv.payments[0].amount.toFixed(2),'100.10');assert.equal(inv.shares[0].calculatedAmount.toFixed(2),'37.50');
  assert.equal(inv.report!.id,'legacy-report');assert.equal(inv.report!.printCount,2);assert.equal(inv.report!.status,'PARTIAL_READY');
  const value=await db.resultValue.findUniqueOrThrow({where:{id:'legacy-value-cbc'},include:{parameter:true}});
  assert(value.parameter, 'Legacy value retains its catalog parameter');
  assert.equal(value.valueNumeric!.toFixed(6),'0.123399');assert.equal(value.parameter.id,'legacy-param-wbc');assert.equal(value.flag,'LOW');
  const patient=await db.patient.findUniqueOrThrow({where:{id:'legacy-patient'}});
  assert.equal(patient.labNumber,'LAB-PRESERVE');assert.equal(patient.mrcNumber,'MRC-PRESERVE');
});

test('initial definitions preserve Decimal range strings/choices and do not fabricate approval or historical instants',async()=>{
  const v=await db.testVersion.findFirstOrThrow({where:{testId:'legacy-test-cbc',revisionNo:1}});
  const snapshot=v.definitionSnapshot as {parameters:{id:string;ranges:{lowNormal:string;highNormal:string}[]}[]};
  assert.equal(snapshot.parameters[0].id,'legacy-param-wbc');assert.equal(snapshot.parameters[0].ranges[0].lowNormal,'0.1234');
  assert.equal(snapshot.parameters[0].ranges[0].highNormal,'99.9999');assert.equal(v.captureProvenance,'LEGACY_CURRENT');assert.equal(v.approvedAt,null);assert.equal(v.effectiveAt,null);
  assert.equal((await db.testParameter.findUniqueOrThrow({where:{id:'legacy-param-wbc'}})).testVersionId,v.id);
  const hba=await db.testVersion.findFirstOrThrow({where:{testId:'legacy-test-hba1c'}});
  assert.equal((hba.definitionSnapshot as {parameters:{choices:unknown[]}[]}).parameters[0].choices.length,1);
  const visit=await db.visit.findFirstOrThrow({where:{bookingId:'legacy-booking-direct'}});
  assert.equal(visit.occurredAt,null);assert.equal(visit.legacyOccurredAtRaw,'2026-10-01 10:00:00');
  assert.equal(await db.sample.count({where:{previousSampleId:{not:null}}}),0);
  const events=await db.sampleEvent.findMany({where:{sampleId:'legacy-sample-direct'}});
  assert(events.every(e=>e.occurredAt===null && e.fromStatus===null && e.legacyOccurredAtRaw));
  assert.equal(await db.sampleTest.count({where:{sampleId:'legacy-sample-quantity'}}),0);
  assert.equal((await db.sample.findUniqueOrThrow({where:{id:'legacy-sample-quantity'}})).phaseAReviewReason,'NO_UNAMBIGUOUS_RESULT_ASSIGNMENT');
});

test('fifty parallel atomic allocations have no duplicate or lost increment and use Karachi midnight',async()=>{
  const instant=new Date('2030-01-01T19:00:00.000Z');
  const accessions=await Promise.all(Array.from({length:50},()=>transaction(tx=>allocateVisitAccession(tx,tenantId,branchId,instant))));
  assert.equal(new Set(accessions).size,50);assert(accessions.every(n=>n.startsWith('V-A-20300102-')));
  const counter=await db.identifierCounter.findUniqueOrThrow({where:{tenantId_namespace_scopeKey_periodKey:{tenantId,namespace:'VISIT',scopeKey:'branch:'+branchId,periodKey:'20300102'}}});
  assert.equal(counter.nextValue,51n);
  assert.deepEqual(accessions.map(n=>Number(n.split('-').at(-1))).sort((a,b)=>a-b),Array.from({length:50},(_,i)=>i+1));
});

test('concurrent same-invoice retries materialize exactly one Visit with one accession and UUID identity',async()=>{
  const inv=await transaction(tx=>invoice(tx,'concurrent-visit'));
  const before=await db.identifierCounter.findMany({where:{tenantId,namespace:'VISIT'}});
  const ids=await Promise.all(Array.from({length:12},()=>transaction(tx=>materializeInvoiceClinicalWork(tx,inv.id))));
  assert.equal(new Set(ids).size,1);assert.match(ids[0],/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.equal(await db.visit.count({where:{bookingId:inv.bookingId}}),1);assert.equal(await db.orderedTest.count({where:{visitId:ids[0]}}),1);
  const afterCounters=await db.identifierCounter.findMany({where:{tenantId,namespace:'VISIT'}});
  assert.equal(afterCounters.reduce((s,c)=>s+c.nextValue,0n)-before.reduce((s,c)=>s+c.nextValue,0n),1n);
});

test('duplicate occurrence and duplicate source expansion tuples are rejected',async()=>{
  const order=await db.orderedTest.findFirstOrThrow();
  const {id,createdAt,updatedAt,...data}=order;
  await assert.rejects(db.orderedTest.create({data}),uniqueFailure);
  await assert.rejects(db.orderedTest.create({data:{...data,occurrenceNo:100}}),uniqueFailure);
  await assert.rejects(db.orderedTest.create({data:{...data,invoiceLineId:null,sourceUnitNo:null,sourceMemberNo:null,occurrenceNo:0}}));
});

test('TestVersion concurrent revision claims cannot collide',async()=>{
  const version=await db.testVersion.findFirstOrThrow({where:{testId:'legacy-test-cbc'},orderBy:{revisionNo:'desc'}});
  const {id,createdAt,...data}=version;
  const claim={...data,definitionSnapshot:version.definitionSnapshot as Prisma.InputJsonValue,revisionNo:version.revisionNo+1};
  const outcomes=await Promise.allSettled([db.testVersion.create({data:claim}),db.testVersion.create({data:claim})]);
  assert.equal(outcomes.filter(x=>x.status==='fulfilled').length,1);
  assert(outcomes.some(x=>x.status==='rejected' && uniqueFailure(x.reason)));
});

test('PackageVersion concurrent revision claims cannot collide',async()=>{
  const version=await db.packageVersion.findFirstOrThrow({where:{packageId:'legacy-package'},orderBy:{revisionNo:'desc'}});
  const {id,createdAt,...data}=version;
  const claim={...data,compositionSnapshot:version.compositionSnapshot as Prisma.InputJsonValue,revisionNo:version.revisionNo+1};
  const outcomes=await Promise.allSettled([db.packageVersion.create({data:claim}),db.packageVersion.create({data:claim})]);
  assert.equal(outcomes.filter(x=>x.status==='fulfilled').length,1);
  assert(outcomes.some(x=>x.status==='rejected' && uniqueFailure(x.reason)));
});

test('captured definitions survive legacy edits and capture retries are idempotent',async()=>{
  const old=await db.testVersion.findFirstOrThrow({where:{testId:'legacy-test-cbc',revisionNo:1}});
  await db.testReferenceRange.update({where:{id:'legacy-range-wbc'},data:{lowNormal:'0.2345'}});
  const captured=await transaction(tx=>captureCurrentTestVersion(tx,'legacy-test-cbc'));
  const retry=await transaction(tx=>captureCurrentTestVersion(tx,'legacy-test-cbc')); assert.equal(captured,retry);assert.notEqual(captured,old.id);
  assert.deepEqual((await db.testVersion.findUniqueOrThrow({where:{id:old.id}})).definitionSnapshot,old.definitionSnapshot);
  await assert.rejects(db.testVersion.update({where:{id:old.id},data:{nameSnapshot:'overwrite'}}),/retained immutable history/);
  await assert.rejects(db.testVersion.delete({where:{id:old.id}}),/retained immutable history/);
});

test('prospective package factory freezes member versions and quantity creates actual occurrences',async()=>{
  const result=await transaction(async tx=>{
    const inv=await invoice(tx,'prospective-package',[{packageId:'legacy-package',quantity:2}]);
    const started=performance.now();
    const visitId=await materializeInvoiceClinicalWork(tx,inv.id);
    console.log('Measured package Visit/four-occurrence factory:',JSON.stringify({ms:+(performance.now()-started).toFixed(2),clientSqlRoundtrips:1,internalStatements:'not counted'}));
    return {inv,visitId,orders:await tx.orderedTest.findMany({where:{visitId},orderBy:{occurrenceNo:'asc'}})};
  });
  assert.equal(result.orders.length,4);assert.deepEqual(result.orders.map(o=>o.occurrenceNo),[1,2,3,4]);
  assert.deepEqual(result.orders.map(o=>o.sourceUnitNo),[1,1,2,2]);assert.deepEqual(result.orders.map(o=>o.sourceMemberNo),[1,2,1,2]);
  assert(result.orders.every(o=>o.invoiceLineId===result.inv.lines[0].id && o.packageVersionId));
  const pv=await db.packageVersion.findUniqueOrThrow({where:{id:result.orders[0].packageVersionId!}});
  const members=(pv.compositionSnapshot as {members:{testVersionId:string}[]}).members;
  assert.equal(members.length,2);assert(members.every(m=>result.orders.some(o=>o.testVersionId===m.testVersionId)));
  assert.equal(await transaction(tx=>captureCurrentPackageVersion(tx,'legacy-package')),pv.id);
  await assert.rejects(db.packageVersion.update({where:{id:pv.id},data:{nameSnapshot:'overwrite'}}),/retained immutable history/);
});

test('same-Visit specimen assignment works; cross-Visit and duplicate assignment fail in database',async()=>{
  const a=await work('sample-assignment-a'),b=await work('sample-assignment-b');
  const linked=await transaction(tx=>assignSampleToOrderedTest(tx,a.sample.id,a.order.id));assert.equal(linked.visitId,a.visitId);
  await assert.rejects(transaction(tx=>assignSampleToOrderedTest(tx,a.sample.id,b.order.id)));
  await assert.rejects(transaction(tx=>assignSampleToOrderedTest(tx,a.sample.id,a.order.id)),uniqueFailure);
  await assert.rejects(db.sampleTest.delete({where:{id:linked.id}}),/retained immutable history/);
  // Direct SQL bypasses all factories and must still fail.
  await assert.rejects(db.$executeRaw`INSERT INTO sample_tests ("tenantId","branchId","visitId","sampleId","orderedTestId",source)
    VALUES (${tenantId},${branchId},${b.visitId},${a.sample.id},${b.order.id},'PROSPECTIVE_CURRENT')`);
});

test('specimen events are append-only, scoped to a retained actor and enforce meaningful targets',async()=>{
  const fixture=await work('event-fixture');
  const occurredAt=new Date('2030-01-01T19:00:00.123Z');
  const event=await transaction(tx=>appendSampleEvent(tx,{tenantId,sampleId:fixture.sample.id,actorId:'legacy-user',eventType:'COLLECTED',toStatus:'COLLECTED',sourceKey:'once',occurredAt}));
  assert.equal(event.actorId,'legacy-user');assert(event.occurredAt instanceof Date);
  assert.equal(event.occurredAt!.toISOString(),occurredAt.toISOString());
  const [native]=await db.$queryRaw<{instant:string}[]>`SELECT to_char("occurredAt" AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS instant FROM sample_events WHERE id=${event.id}`;
  assert.equal(native.instant,occurredAt.toISOString());
  await assert.rejects(transaction(tx=>appendSampleEvent(tx,{tenantId,sampleId:fixture.sample.id,eventType:'COLLECTED',toStatus:'COLLECTED',sourceKey:'once'})),uniqueFailure);
  await assert.rejects(db.sampleEvent.update({where:{id:event.id},data:{reason:'rewrite'}}),/retained immutable history/);
  await assert.rejects(db.sampleEvent.delete({where:{id:event.id}}),/retained immutable history/);
  await assert.rejects(transaction(tx=>appendSampleEvent(tx,{tenantId,sampleId:fixture.sample.id,eventType:'RECEIVED',toStatus:'ACCEPTED'})));
  await assert.rejects(transaction(tx=>appendSampleEvent(tx,{tenantId:'phase-a-other-tenant',sampleId:fixture.sample.id,eventType:'COLLECTED',toStatus:'COLLECTED'})));
});

test('recollection retains predecessor identity and rejects cross-Visit, missing Visit and self links',async()=>{
  const a=await work('recollection-a'),b=await work('recollection-b');
  await db.sample.update({where:{id:a.sample.id},data:{status:'REJECTED'}});
  const data={tenantId,branchId,visitId:a.visitId,invoiceId:a.inv.id,sampleCode:'replacement',previousSampleId:a.sample.id};
  const replacement=await db.sample.create({data});assert.equal(replacement.previousSampleId,a.sample.id);
  assert.equal((await db.sample.findUniqueOrThrow({where:{id:a.sample.id}})).status,'REJECTED');
  await assert.rejects(db.sample.create({data:{...data,sampleCode:'bad-replacement',previousSampleId:b.sample.id}}));
  await assert.rejects(db.sample.create({data:{...data,sampleCode:'null-visit',visitId:null}}));
  const id=randomUUID();await assert.rejects(db.sample.create({data:{...data,id,sampleCode:'self',previousSampleId:id}}));
});

test('native source guards reject crossed invoice lines and freeze issued occurrence provenance',async()=>{
  const a=await work('provenance-a'),b=await work('provenance-b');
  await assert.rejects(db.orderedTest.create({data:{tenantId,branchId,visitId:a.visitId,testVersionId:a.order.testVersionId,
    invoiceLineId:b.inv.lines[0].id,sourceUnitNo:2,sourceMemberNo:0,occurrenceNo:2,captureProvenance:'PROSPECTIVE_CURRENT'}}),/another Visit/);
  await assert.rejects(db.orderedTest.update({where:{id:a.order.id},data:{testVersionId:b.order.testVersionId,occurrenceNo:99}}),/identity\/provenance is frozen/);
  await assert.rejects(db.invoice.update({where:{id:a.inv.id},data:{visitId:b.visitId}}),/cannot be reassigned/);
  await assert.rejects(db.invoiceLine.update({where:{id:a.inv.lines[0].id},data:{testId:'legacy-test-hba1c'}}),/cannot be reassigned/);
});

test('Visit creation failure rolls back Visit, legacy writes and counter increment',async()=>{
  const count=await db.visit.count(),counters=await db.identifierCounter.findMany({orderBy:{periodKey:'asc'}});
  await assert.rejects(transaction(async tx=>{const inv=await invoice(tx,'rollback-visit');await materializeInvoiceClinicalWork(tx,inv.id);throw Error('forced Visit rollback');}),/forced Visit rollback/);
  assert.equal(await db.visit.count(),count);assert.equal(await db.booking.count({where:{bookingCode:'rollback-visit'}}),0);
  assert.deepEqual(await db.identifierCounter.findMany({orderBy:{periodKey:'asc'}}),counters);
});

test('failure midway through direct expansion leaves no partial work or orphan Visit',async()=>{
  const visits=await db.visit.count(),orders=await db.orderedTest.count();
  await assert.rejects(transaction(async tx=>{const inv=await invoice(tx,'rollback-orders',[{testId:'legacy-test-cbc'},{testId:'legacy-test-cbc',packageId:'legacy-package'}]);await materializeInvoiceClinicalWork(tx,inv.id);}),/Cannot expand clinical work/);
  assert.equal(await db.visit.count(),visits);assert.equal(await db.orderedTest.count(),orders);assert.equal(await db.invoice.count({where:{invoiceNumber:'rollback-orders'}}),0);
});

test('package expansion rolls back its four occurrences and compatibility links on failure',async()=>{
  const visits=await db.visit.count(),orders=await db.orderedTest.count(),versions=await db.packageVersion.count();
  await assert.rejects(transaction(async tx=>{const inv=await invoice(tx,'rollback-package',[{packageId:'legacy-package',quantity:2}]);
    const visitId=await materializeInvoiceClinicalWork(tx,inv.id);assert.equal(await tx.orderedTest.count({where:{visitId}}),4);throw Error('forced package rollback');}),/forced package rollback/);
  assert.equal(await db.visit.count(),visits);assert.equal(await db.orderedTest.count(),orders);assert.equal(await db.packageVersion.count(),versions);
});

test('failed specimen assignment rolls back valid assignment and its event together',async()=>{
  const a=await work('rollback-assignment-a'),b=await work('rollback-assignment-b');
  await assert.rejects(transaction(async tx=>{await assignSampleToOrderedTest(tx,a.sample.id,a.order.id);
    await appendSampleEvent(tx,{tenantId,sampleId:a.sample.id,eventType:'COLLECTED',toStatus:'COLLECTED'});
    await assignSampleToOrderedTest(tx,a.sample.id,b.order.id);}));
  assert.equal(await db.sampleTest.count({where:{sampleId:a.sample.id}}),0);assert.equal(await db.sampleEvent.count({where:{sampleId:a.sample.id}}),0);
});

test('native CHECK/trigger protections and restrictive scoped foreign keys remain in PostgreSQL catalog',async()=>{
  const checks=await db.$queryRaw<{name:string;valid:boolean}[]>`SELECT conname AS name,convalidated AS valid FROM pg_constraint
    WHERE contype='c' AND connamespace='public'::regnamespace ORDER BY conname`;
  assert.equal(checks.length,12);assert(checks.every(c=>c.valid));
  const triggers=await db.$queryRaw<{name:string}[]>`SELECT tgname AS name FROM pg_trigger WHERE NOT tgisinternal ORDER BY tgname`;
  assert.equal(triggers.length,11);
  const fks=await db.$queryRaw<{name:string;definition:string}[]>`SELECT conname AS name,pg_get_constraintdef(oid) AS definition FROM pg_constraint
    WHERE conname IN ('sample_tests_tenantId_branchId_visitId_sampleId_fkey','sample_tests_tenantId_branchId_visitId_orderedTestId_fkey')`;
  assert.equal(fks.length,2);assert(fks.every(f=>f.definition.includes('ON DELETE RESTRICT') && f.definition.includes('visitId')));
  const indexes=await db.$queryRaw<{definition:string}[]>`SELECT indexdef AS definition FROM pg_indexes WHERE schemaname='public' AND indexname='sample_tests_orderedTestId_idx'`;
  assert.equal(indexes.length,1);assert(indexes[0].definition.includes('("orderedTestId")'));
  await assert.rejects(db.$executeRaw`INSERT INTO identifier_counters ("tenantId",namespace,"scopeKey","periodKey","nextValue") VALUES (${tenantId},'VISIT','bad','bad',0)`);
  await assert.rejects(db.identifierCounter.updateMany({where:{tenantId,namespace:'VISIT'},data:{nextValue:1n}}),/cannot change or decrement/);
});

test('mapped provenance and native/generated instants agree in UTC/Karachi without changing legacy or global pg parsing',async()=>{
  const at=new Date('2030-01-01T19:00:00.123Z');
  for (const zone of ['UTC','Asia/Karachi']) {
  await transaction(async tx=>{
    await tx.$queryRaw`SELECT set_config('TimeZone',${zone},true)`;
    const [clock]=await tx.$queryRaw<{zone:string;instant:Date;legacy:Date}[]>`SELECT current_setting('TimeZone') AS zone,${at}::timestamptz AS instant,${at}::timestamp AS legacy`;
    assert.equal(clock.zone,zone);assert.equal(clock.instant.toISOString(),at.toISOString());assert.equal(clock.legacy.toISOString(),at.toISOString());
    const inv=await invoice(tx,'timezone-compatibility-'+zone);const visitId=await materializeInvoiceClinicalWork(tx,inv.id);
    const visit=await tx.visit.findUniqueOrThrow({where:{id:visitId}});
    assert(Math.abs(Date.now()-visit.createdAt.getTime())<10_000);
    assert.equal(visit.source,'BOOKING');
    assert.equal(visit.demographicCaptureProvenance,CaptureProvenance.PROSPECTIVE_CURRENT);
    const sample=await tx.sample.create({data:{tenantId,branchId,visitId,invoiceId:inv.id,sampleCode:'timezone-compatibility-'+zone,collectedAt:at}});
    assert.equal(sample.collectedAt!.toISOString(),at.toISOString());
    const [old]=await tx.$queryRaw<{value:string}[]>`SELECT to_char("collectedAt",'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS value FROM samples WHERE id=${sample.id}`;
    assert.equal(old.value,at.toISOString());
    const event=await appendSampleEvent(tx,{tenantId,sampleId:sample.id,eventType:'COLLECTED',toStatus:'COLLECTED',occurredAt:at});
    assert.equal(event.occurredAt!.toISOString(),at.toISOString());assert(Math.abs(Date.now()-event.recordedAt.getTime())<10_000);
    assert.equal(event.captureProvenance,CaptureProvenance.PROSPECTIVE_CURRENT);
    const [native]=await tx.$queryRaw<{instant:string;recorded:string;created:string;provenance:string}[]>`
      SELECT to_char(e."occurredAt" AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS instant,
      to_char(e."recordedAt" AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS recorded,
      to_char(v."createdAt" AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS created,
      e.source::text AS provenance FROM sample_events e JOIN visits v ON v.id=${visitId} WHERE e.id=${event.id}`;
    assert.equal(native.instant,at.toISOString());assert.equal(native.recorded,event.recordedAt.toISOString());
    assert.equal(native.created,visit.createdAt.toISOString());assert.equal(native.provenance,event.captureProvenance);
    assert.equal(types.getTypeParser(1184),nativeInstantParser,'Owned-pool workaround must not mutate global pg types');
  });
  }
});

test('direct SQL/model writes cannot insert a package snapshot with foreign definition references',async()=>{
  const version=await db.packageVersion.findFirstOrThrow({where:{packageId:'legacy-package'},orderBy:{revisionNo:'desc'}});
  const payload={schemaVersion:1,members:[{ordinal:1,quantity:1,testId:'legacy-test-cbc',testVersionId:randomUUID(),nestedPackageId:null}]};
  const json=JSON.stringify(payload);
  const [fingerprint]=await db.$queryRaw<{hash:string}[]>`SELECT encode(sha256(convert_to(${json}::jsonb::text,'UTF8')),'hex') AS hash`;
  await assert.rejects(db.packageVersion.create({data:{tenantId,packageId:'legacy-package',revisionNo:version.revisionNo+1,
    codeSnapshot:'BUNDLE',nameSnapshot:'Bad member',captureProvenance:'PROSPECTIVE_CURRENT',compositionSnapshot:payload,compositionHash:fingerprint.hash}}),/definition\/tenant mismatch/);
});

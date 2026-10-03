import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Decimal, Gender, Prisma, ResultFlag, ResultStatus, SampleStatus, appendSampleEvent } from '@lms/database';
import { EnterResultDto } from './dto/enter-result.dto';

export const clinicalResultInclude = {
  test: true, orderedTest: { include: { testVersion: true } },
  values: { include: { parameter: true, versionParameter: true, selectedRange: true },
    orderBy: [{ versionParameter: { sortOrder:'asc' } }, { parameter: { sortOrder:'asc' } }] },
} satisfies Prisma.ResultInclude;

export function projectClinicalResult<T extends {
  test: { code: string; name: string };
  orderedTest?: { testVersion: { codeSnapshot: string; nameSnapshot: string } } | null;
  values: { parameter: unknown; versionParameter?: unknown }[];
}>(result: T) {
  const version = result.orderedTest?.testVersion;
  return { ...result, test: version ? { ...result.test, code: version.codeSnapshot, name: version.nameSnapshot } : result.test,
    values: result.values.map(v => ({ ...v, parameter: v.versionParameter ?? v.parameter })) };
}

type Range = { id?: string; gender: Gender | null; ageMinMonths: number | null; ageMaxMonths: number | null;
  lowNormal: Decimal | null; highNormal: Decimal | null; criticalLow: Decimal | null; criticalHigh: Decimal | null;
  unit: string | null; interpretation: string | null };

export function pickCompatibleRange<R extends Range>(ranges: R[], gender: Gender | null, age: number | null): R | null {
  const knownGender = gender !== null && gender !== Gender.UNKNOWN;
  return ranges.filter(r => (r.gender === null || (knownGender && r.gender === gender)) &&
    ((r.ageMinMonths === null && r.ageMaxMonths === null) || (age !== null &&
      (r.ageMinMonths === null || age >= r.ageMinMonths) && (r.ageMaxMonths === null || age <= r.ageMaxMonths))))
    .sort((a,b) => Number(b.gender !== null)-Number(a.gender !== null) ||
      Number(b.ageMinMonths !== null || b.ageMaxMonths !== null)-Number(a.ageMinMonths !== null || a.ageMaxMonths !== null) ||
      (a.id ?? '').localeCompare(b.id ?? ''))[0] ?? null;
}

export function ageAtCollection(dob: Date | null, at: Date | null): number | null {
  if (!dob || !at || dob > at) return null;
  // DOB is still a legacy wall date. Use its lexical UTC components; collection day is Karachi business day.
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Karachi', year:'numeric',month:'numeric',day:'numeric' }).formatToParts(at);
  const get = (key:string) => Number(parts.find(p=>p.type===key)!.value);
  return (get('year')-dob.getUTCFullYear())*12+get('month')-1-dob.getUTCMonth()-(get('day')<dob.getUTCDate()?1:0);
}

async function lockResult(tx: Prisma.TransactionClient, tenantId: string, id: string) {
  const found = await tx.result.findFirst({ where: { id, tenantId }, include: { sample: true } });
  if (!found?.orderedTestId) throw new NotFoundException('Occurrence result not found');
  await tx.$queryRaw`SELECT id FROM invoices WHERE id=${found.sample.invoiceId} AND "tenantId"=${tenantId} FOR UPDATE`;
  await tx.$queryRaw`SELECT id FROM ordered_tests WHERE id=${found.orderedTestId} AND "tenantId"=${tenantId} FOR UPDATE`;
  return tx.result.findUniqueOrThrow({ where: { id }, include: { ...clinicalResultInclude, sample: true } });
}

export async function releaseOccurrenceResult(tx: Prisma.TransactionClient, tenantId: string, id: string, actor?: string) {
  const draft = await lockResult(tx,tenantId,id);
  if (draft.status !== ResultStatus.ENTERED) throw new BadRequestException('Only an entered draft can be finalized');
  const parameters = await tx.testVersionParameter.findMany({ where: { testVersionId: draft.testVersionId! } });
  if (parameters.some(p=>p.isRequired && !draft.values.some(v=>v.versionParameterId===p.id))) {
    throw new BadRequestException('All required frozen parameters must be entered before finalizing');
  }
  if (draft.amendedFromResultId) {
    await tx.result.update({ where: { id: draft.amendedFromResultId }, data: { status: ResultStatus.SUPERSEDED } });
  }
  return tx.result.update({ where: { id }, data: { status: ResultStatus.RELEASED, releasedAt: new Date(), releasedById: actor ?? null }, include: clinicalResultInclude });
}

export async function reopenOccurrenceResult(tx: Prisma.TransactionClient, tenantId: string, id: string, reason: string, actor?: string) {
  if (!reason?.trim() || !actor) throw new BadRequestException('Correction reason and actor are required');
  const original = await lockResult(tx,tenantId,id);
  if (original.status !== ResultStatus.RELEASED) throw new BadRequestException('Only the current released result can be corrected');
  const existing = await tx.result.findFirst({ where: { orderedTestId: original.orderedTestId, status: ResultStatus.ENTERED } });
  if (existing) throw new BadRequestException('This occurrence already has an open correction draft');
  return tx.result.create({ data: {
    tenantId, sampleId: original.sampleId, invoiceLineId: original.invoiceLineId, testId: original.testId,
    orderedTestId: original.orderedTestId, testVersionId: original.testVersionId, revisionNo: original.revisionNo!+1,
    amendedFromResultId: original.id, amendmentReason: reason.trim(), amendmentActorId: actor,
    enteredById: actor, isCritical: original.isCritical, notes: original.notes,
    values: { create: original.values.map(v=>({ versionParameterId:v.versionParameterId, testVersionId:v.testVersionId,
      selectedRangeId:v.selectedRangeId, evaluationGender:v.evaluationGender, evaluationAgeMonths:v.evaluationAgeMonths,
      evaluatedAt:v.evaluatedAt, valueNumeric:v.valueNumeric, valueText:v.valueText, unit:v.unit,
      flag:v.flag, isCritical:v.isCritical, interpretation:v.interpretation })) },
  }, include: clinicalResultInclude });
}

export async function enterOccurrenceResult(tx: Prisma.TransactionClient, tenantId: string, dto: EnterResultDto, actor?: string) {
  if (!dto.orderedTestId) throw new BadRequestException('orderedTestId is required for Visit-based work');
  const first = await tx.sample.findFirst({ where: { id:dto.sampleId,tenantId } });
  if (!first) throw new NotFoundException('Sample not found');
  await tx.$queryRaw`SELECT id FROM invoices WHERE id=${first.invoiceId} AND "tenantId"=${tenantId} FOR UPDATE`;
  await tx.$queryRaw`SELECT id FROM ordered_tests WHERE id=${dto.orderedTestId} AND "tenantId"=${tenantId} FOR UPDATE`;
  await tx.$queryRaw`SELECT id FROM samples WHERE id=${first.id} FOR UPDATE`;
  const sample = await tx.sample.findUniqueOrThrow({ where: { id:first.id }, include: {
    invoice: { include: { booking: { include: { patient:true } } } },
    events: { where: { eventType:'COLLECTED', captureProvenance:'PROSPECTIVE_CURRENT' }, orderBy:{recordedAt:'asc'}, take:1 },
  } });
  if (![SampleStatus.ACCEPTED,SampleStatus.IN_TESTING].includes(sample.status as 'ACCEPTED'|'IN_TESTING')) throw new BadRequestException('Sample must be accepted for result entry');
  const order = await tx.orderedTest.findFirst({ where: { id:dto.orderedTestId,tenantId,branchId:sample.branchId,
    visitId:sample.visitId ?? '', assignments:{some:{sampleId:sample.id}} }, include: { testVersion: {
      include:{ versionParameters:{include:{referenceRanges:true,choices:true}} } } } });
  if (!order?.invoiceLineId || sample.invoice.visitId !== order.visitId) throw new BadRequestException('OrderedTest must be explicitly assigned to this Sample and Visit');
  if ((dto.testId && dto.testId!==order.testVersion.testId) || (dto.invoiceLineId && dto.invoiceLineId!==order.invoiceLineId)) throw new BadRequestException('Client catalog/source identity does not match the occurrence');
  const existing = await tx.result.findFirst({ where:{orderedTestId:order.id,status:ResultStatus.ENTERED} });
  if (existing && existing.sampleId!==sample.id) throw new BadRequestException('The open draft belongs to another specimen');
  if (!existing && await tx.result.count({where:{orderedTestId:order.id,status:ResultStatus.RELEASED}})) throw new BadRequestException('Reopen the released occurrence before editing');
  if (!dto.values?.length) throw new BadRequestException('At least one parameter value is required');
  const parameters = order.testVersion.versionParameters;
  const patient = sample.invoice.booking.patient;
  const evaluatedAt = sample.events[0]?.occurredAt ?? null;
  const age = ageAtCollection(patient.dateOfBirth,evaluatedAt);
  const gender = patient.gender;
  const seen = new Set<string>();
  const values = dto.values.map(v=>{
    const p = parameters.find(p=>p.id===v.versionParameterId);
    if (!p || seen.has(p.id) || v.testParameterId) throw new BadRequestException('Use distinct immutable versionParameterId values for this TestVersion');
    seen.add(p.id);
    const numeric = v.valueNumeric !== undefined && v.valueNumeric !== null;
    if (p.valueType==='NUMERIC' ? (!numeric || v.valueText!==undefined) : (numeric || !v.valueText?.trim())) throw new BadRequestException('Value type does not match frozen parameter');
    if (p.valueType==='CHOICE' && !p.choices.some(c=>c.value===v.valueText)) throw new BadRequestException('Value is not a frozen choice');
    if (p.valueType==='BOOLEAN' && !['true','false'].includes(v.valueText!)) throw new BadRequestException('Boolean value must be true or false');
    const range = numeric ? pickCompatibleRange(p.referenceRanges,gender,age) : null;
    const unit = range?.unit ?? p.unit;
    if (v.unit !== undefined && v.unit!==unit) throw new BadRequestException('Unit does not match frozen definition/range');
    const value = numeric ? new Decimal(v.valueNumeric!) : null;
    let flag: ResultFlag|null=null;
    if (value && range && [range.lowNormal,range.highNormal,range.criticalLow,range.criticalHigh].some(bound=>bound!==null)) {
      flag = range.criticalLow!==null && value.lessThan(range.criticalLow) ? ResultFlag.CRITICAL_LOW :
        range.criticalHigh!==null && value.greaterThan(range.criticalHigh) ? ResultFlag.CRITICAL_HIGH :
        range.lowNormal!==null && value.lessThan(range.lowNormal) ? ResultFlag.LOW :
        range.highNormal!==null && value.greaterThan(range.highNormal) ? ResultFlag.HIGH : ResultFlag.NORMAL;
    }
    return { versionParameterId:p.id,testVersionId:order.testVersionId,selectedRangeId:range?.id ?? null,
      evaluatedAt,evaluationGender:gender,evaluationAgeMonths:age,valueNumeric:value,valueText:v.valueText ?? null,
      unit,flag,isCritical:flag===ResultFlag.CRITICAL_LOW || flag===ResultFlag.CRITICAL_HIGH,
      interpretation:v.interpretation ?? range?.interpretation ?? null };
  });
  if (sample.status===SampleStatus.ACCEPTED) {
    await tx.sample.update({where:{id:sample.id},data:{status:SampleStatus.IN_TESTING}});
    await appendSampleEvent(tx,{tenantId,sampleId:sample.id,actorId:actor,eventType:'TESTING_STARTED',fromStatus:'ACCEPTED',toStatus:'IN_TESTING'});
  }
  const data = { isCritical:values.some(v=>v.isCritical),enteredById:actor ?? null,enteredAt:new Date(),notes:dto.notes,
    values:{create:values} };
  const result = existing ? await tx.result.update({where:{id:existing.id},data:{...data,values:{deleteMany:{},create:values}},include:clinicalResultInclude}) :
    await tx.result.create({data:{...data,tenantId,sampleId:sample.id,invoiceLineId:order.invoiceLineId,testId:order.testVersion.testId,
      orderedTestId:order.id,testVersionId:order.testVersionId,revisionNo:1},include:clinicalResultInclude});
  return dto.releaseImmediately ? releaseOccurrenceResult(tx,tenantId,result.id,actor) : result;
}

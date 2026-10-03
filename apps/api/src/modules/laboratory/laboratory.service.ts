import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CollectSampleDto } from './dto/collect-sample.dto';
import { EnterResultDto, ResultValueInputDto } from './dto/enter-result.dto';
import { AmendResultDto } from './dto/amend-result.dto';
import {
  SampleStatus,
  ResultStatus,
  ResultFlag,
  ReportStatus,
  Gender,
  Prisma,
  Decimal,
  SampleEventType,
  appendSampleEvent,
  assignSampleToOrderedTest,
} from '@lms/database';
import { NotificationsService } from '../notifications/notifications.service';
import { LaboratoryGateway } from './laboratory.gateway';
import { generateReportNumber, generateTrackingId } from '../../common/id-generators.util';
import { clinicalResultInclude, projectClinicalResult, enterOccurrenceResult, releaseOccurrenceResult,
  reopenOccurrenceResult, pickCompatibleRange, ageAtCollection } from './clinical-results';

type LegacyEntry = Omit<EnterResultDto,'testId'|'invoiceLineId'|'values'> & { testId:string;invoiceLineId:string;values:(ResultValueInputDto & {testParameterId:string})[] };

function generateSampleCode(): string {
  const now = new Date();
  const datePart = now.toISOString().slice(0, 10).replace(/-/g, '');
  const random = Math.floor(10000 + Math.random() * 90000);
  return `SP-${datePart}-${random}`;
}

@Injectable()
export class LaboratoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly gateway: LaboratoryGateway,
  ) {}

  // ---------------------------------------------------------------------------
  // SAMPLE
  // ---------------------------------------------------------------------------

  async collectSample(
    tenantId: string,
    branchId: string,
    dto: CollectSampleDto,
    collectedById?: string,
  ) {
    const invoice = await this.prisma.invoice.findFirst({
      where: { id: dto.invoiceId, tenantId },
      include: { booking: { include: { patient: true } } },
    });
    if (!invoice) throw new NotFoundException('Invoice not found');
    if (invoice.branchId!==branchId) throw new BadRequestException('Invoice belongs to another branch');
    if (invoice.visitId && !dto.orderedTestIds?.length) throw new BadRequestException('Select the OrderedTests assigned to this specimen');
    if (!invoice.visitId && dto.orderedTestIds?.length) throw new BadRequestException('Legacy invoice has no occurrence assignments');

    const sample = await this.prisma.$transaction(async (tx) => {
      // Scope is checked before creation so assignment failures roll back sample and event.
      const ids = dto.orderedTestIds ?? [];
      const assigned = await tx.orderedTest.count({where:{id:{in:ids},tenantId,branchId,visitId:invoice.visitId ?? ''}});
      if (new Set(ids).size!==ids.length || assigned!==ids.length) throw new BadRequestException('Invalid specimen occurrence scope');
      const created = await tx.sample.create({
      data: {
        tenantId,
        branchId,
        invoiceId: dto.invoiceId,
        visitId: invoice.visitId,
        sampleCode: generateSampleCode(),
        status: SampleStatus.COLLECTED,
        sampleType: dto.sampleType,
        collectedAt: dto.collectedAt ? new Date(dto.collectedAt) : new Date(),
        collectedById: collectedById ?? null,
        notes: dto.notes,
      },
      });
      for (const id of [...ids].sort()) await assignSampleToOrderedTest(tx,created.id,id);
      await appendSampleEvent(tx, { tenantId, sampleId: created.id, actorId: collectedById,
        eventType: SampleEventType.COLLECTED, toStatus: SampleStatus.COLLECTED,
        occurredAt: created.collectedAt ?? new Date() });
      return created;
    });

    // Fire-and-forget-ish, but never inside the write above: sample
    // collection must succeed and commit regardless of SMS/network state.
    // See notes in NotificationsService for the offline-first rationale.
    const booking = invoice.booking;
    const patient = booking?.patient;
    if (booking && patient?.smsConsent && patient.phone) {
      const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
      await this.notifications.sendTemplatedSms(
        tenantId,
        'SAMPLE_COLLECTED',
        patient.phone,
        {
          patientName: patient.fullName,
          bookingId: booking.bookingCode,
          labName: tenant?.name ?? '',
        },
        { relatedType: 'Booking', relatedId: booking.id },
      );
    }

    return sample;
  }

  async markOutsourced(
    tenantId: string,
    sampleId: string,
    externalLabName: string,
    outsourcingCost?: number,
  ) {
    const sample = await this.prisma.sample.findFirst({
      where: { id: sampleId, tenantId },
    });
    if (!sample) throw new NotFoundException('Sample not found');

    return this.prisma.sample.update({
      where: { id: sampleId },
      data: {
        isOutsourced: true,
        externalLabName,
        outsourcingCost: outsourcingCost != null ? new Decimal(outsourcingCost) : null,
      },
    });
  }

  async unmarkOutsourced(tenantId: string, sampleId: string) {
    const sample = await this.prisma.sample.findFirst({
      where: { id: sampleId, tenantId },
    });
    if (!sample) throw new NotFoundException('Sample not found');

    return this.prisma.sample.update({
      where: { id: sampleId },
      data: { isOutsourced: false, externalLabName: null, outsourcingCost: null },
    });
  }

  async receiveSample(tenantId: string, sampleId: string, actorId?: string) {
    return this.transitionSample(tenantId, sampleId, [SampleStatus.COLLECTED, SampleStatus.IN_TRANSIT],
      SampleStatus.RECEIVED_AT_LAB, SampleEventType.RECEIVED, { receivedAt: new Date() }, actorId);
  }

  async acceptSample(tenantId: string, sampleId: string, notes?: string, actorId?: string) {
    return this.transitionSample(tenantId, sampleId, [SampleStatus.RECEIVED_AT_LAB], SampleStatus.ACCEPTED,
      SampleEventType.ACCEPTED, { acceptedAt: new Date(), ...(notes != null ? { notes } : {}) }, actorId);
  }

  async rejectSample(tenantId: string, sampleId: string, rejectionReason: string, actorId?: string) {
    return this.transitionSample(tenantId, sampleId, [SampleStatus.RECEIVED_AT_LAB], SampleStatus.REJECTED,
      SampleEventType.REJECTED, { rejectedAt: new Date(), rejectionReason }, actorId, rejectionReason);
  }

  async startTesting(tenantId: string, sampleId: string, actorId?: string) {
    return this.transitionSample(tenantId, sampleId, [SampleStatus.ACCEPTED], SampleStatus.IN_TESTING,
      SampleEventType.TESTING_STARTED, {}, actorId);
  }

  private transitionSample(tenantId: string, sampleId: string, allowed: SampleStatus[], toStatus: SampleStatus,
    eventType: SampleEventType, data: Prisma.SampleUpdateInput, actorId?: string, reason?: string) {
    return this.prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM samples WHERE id=${sampleId} AND "tenantId"=${tenantId} FOR UPDATE`;
      const sample = await tx.sample.findFirst({ where: { id: sampleId, tenantId } });
      if (!sample) throw new NotFoundException('Sample not found');
      if (!allowed.includes(sample.status)) throw new BadRequestException(`Cannot ${eventType.toLowerCase()} sample in status ${sample.status}`);
      const updated = await tx.sample.update({ where: { id: sampleId }, data: { ...data, status: toStatus } });
      await appendSampleEvent(tx, { tenantId, sampleId, actorId, eventType, fromStatus: sample.status, toStatus, reason });
      return updated;
    });
  }

  async getSample(tenantId: string, id: string) {
    const sample = await this.prisma.sample.findFirst({
      where: { id, tenantId },
      include: {
        assignments: { include: { orderedTest: { include: { testVersion: { include: { versionParameters: { include: { choices:true,referenceRanges:true } } } } } } } },
        results: {
          where:{status:{in:[ResultStatus.ENTERED,ResultStatus.RELEASED]}},
          include: clinicalResultInclude,
        },
        invoice: {
          include: {
            booking: { include: { patient: true } },
            lines: { include: { test: true, package: true } },
            visit:{include:{orderedTests:{include:{testVersion:true},orderBy:{occurrenceNo:'asc'}}}},
            // Needed to judge collection-readiness across the WHOLE
            // patient invoice, not just this one sample — an invoice can
            // have multiple samples (e.g. blood + urine) and the report
            // isn't ready until every test on every sample is in. Also
            // carries actual values (not just status) so the "Ready for
            // Collection" preview can show what's about to be sent out,
            // not just a count.
            samples: {
              include: {
                results: {
                  include: clinicalResultInclude,
                },
              },
            },
          },
        },
      },
    });
    if (!sample) throw new NotFoundException('Sample not found');

    const invoiceReadiness = sample.invoice
      ? this.computeInvoiceReadiness(sample.invoice)
      : null;
    const invoiceResultsPreview = sample.invoice
      ? this.buildInvoiceResultsPreview(sample.invoice)
      : [];

    return { ...sample, results:sample.results.map(projectClinicalResult), invoiceReadiness, invoiceResultsPreview };
  }

  /**
   * Summarizes, across every sample on the invoice, whether every test
   * line has a result entered (allEntered) and whether every one has been
   * finalized/released (allReleased). Backs the "Ready for Collection"
   * button — the frontend uses this instead of judging from a single
   * sample's results, and markInvoiceReady() re-derives the same missing
   * list server-side so the check can't be bypassed by calling the API
   * directly.
   */
  private computeInvoiceReadiness(invoice: {
    visitId?:string|null;
    visit?:{orderedTests:{id:string}[]}|null;
    lines: { testId: string | null }[];
    samples: { results: { testId: string; status: string;orderedTestId?:string|null }[] }[];
  }) {
    if (invoice.visitId) {
      const work=invoice.visit?.orderedTests ?? [];
      const results=invoice.samples.flatMap(s=>s.results);
      const covered=work.map(o=>{
        const current=results.filter(r=>r.orderedTestId===o.id);
        return current.find(r=>r.status===ResultStatus.ENTERED) ?? current.find(r=>r.status===ResultStatus.RELEASED);
      });
      return {testLineCount:work.length,enteredCount:covered.filter(Boolean).length,
        allEntered:work.length>0 && covered.every(Boolean),allReleased:work.length>0 && covered.every(r=>r?.status===ResultStatus.RELEASED)};
    }
    const testIds = invoice.lines.filter((l) => l.testId).map((l) => l.testId as string);
    const entered = new Set<string>();
    const released = new Set<string>();
    for (const s of invoice.samples) {
      for (const r of s.results) {
        if (r.status === ResultStatus.RELEASED) {
          released.add(r.testId);
          entered.add(r.testId);
        } else if (r.status === ResultStatus.ENTERED) {
          entered.add(r.testId);
        }
      }
    }
    return {
      testLineCount: testIds.length,
      enteredCount: testIds.filter((t) => entered.has(t)).length,
      allEntered: testIds.length > 0 && testIds.every((t) => entered.has(t)),
      allReleased: testIds.length > 0 && testIds.every((t) => released.has(t)),
    };
  }

  /**
   * Builds a per-test preview of whatever's currently entered/released
   * across every sample on the invoice — this is what the "Ready for
   * Collection" confirmation dialog shows before a technician commits to
   * sending a report out. One entry per test line that has a result yet;
   * tests with nothing entered are simply absent (the readiness check in
   * §computeInvoiceReadiness is what tells the frontend those are still
   * missing).
   */
  private buildInvoiceResultsPreview(invoice: {
    visitId?:string|null;
    visit?:{orderedTests:{id:string;occurrenceNo:number;testVersion:{testId:string;codeSnapshot:string;nameSnapshot:string}}[]}|null;
    lines: { testId: string | null }[];
    samples: {
      results: {
        testId: string;
        status: string;
        orderedTestId?:string|null;
        test: { code: string; name: string };
        values: {
          valueNumeric: unknown;
          valueText: string | null;
          unit: string | null;
          parameter: { name: string; unit: string | null; sortOrder: number }|null;
          versionParameter?:{name:string;unit:string|null;sortOrder:number}|null;
        }[];
      }[];
    }[];
  }) {
    if (invoice.visitId) {
      return (invoice.visit?.orderedTests ?? []).flatMap(o=>{
        const matches=invoice.samples.flatMap(s=>s.results).filter(r=>r.orderedTestId===o.id);
        const r=matches.find(r=>r.status===ResultStatus.ENTERED) ?? matches.find(r=>r.status===ResultStatus.RELEASED);
        if (!r) return [];
        return [{orderedTestId:o.id,occurrenceNo:o.occurrenceNo,testId:o.testVersion.testId,testCode:o.testVersion.codeSnapshot,
          testName:o.testVersion.nameSnapshot,status:r.status,values:r.values.map(v=>{
            const p=v.versionParameter ?? v.parameter;
            return {label:p?.name ?? 'Unresolved parameter',unit:v.unit ?? p?.unit ?? null,value:v.valueText ?? (v.valueNumeric!=null?String(v.valueNumeric):'')};
          })}];
      });
    }
    const testIds = invoice.lines.filter((l) => l.testId).map((l) => l.testId as string);
    // A test could theoretically have results on more than one sample
    // (shouldn't normally happen, but don't silently drop data if it
    // does) — prefer a RELEASED result over an ENTERED one for the
    // preview, and otherwise take the most recently seen.
    const byTestId = new Map<
      string,
      (typeof invoice.samples)[number]['results'][number]
    >();
    for (const s of invoice.samples) {
      for (const r of s.results) {
        const existing = byTestId.get(r.testId);
        if (!existing || (r.status === ResultStatus.RELEASED && existing.status !== ResultStatus.RELEASED)) {
          byTestId.set(r.testId, r);
        }
      }
    }
    return testIds
      .filter((testId) => byTestId.has(testId))
      .map((testId) => {
        const r = byTestId.get(testId)!;
        return {
          testId,
          testCode: r.test.code,
          testName: r.test.name,
          status: r.status,
          values: [...r.values]
            .sort((a, b) => (a.parameter?.sortOrder ?? 0) - (b.parameter?.sortOrder ?? 0))
            .map((v) => ({
              label: v.parameter?.name ?? 'Unresolved parameter',
              unit: v.unit ?? v.parameter?.unit ?? null,
              value: v.valueText ?? (v.valueNumeric != null ? String(v.valueNumeric) : ''),
            })),
        };
      });
  }

  async listPendingSamples(tenantId: string, branchId?: string) {
    return this.prisma.sample.findMany({
      where: {
        tenantId,
        ...(branchId ? { branchId } : {}),
        status: {
          in: [
            SampleStatus.PENDING_COLLECTION,
            SampleStatus.COLLECTED,
            SampleStatus.IN_TRANSIT,
            SampleStatus.RECEIVED_AT_LAB,
            SampleStatus.ACCEPTED,
            SampleStatus.IN_TESTING,
          ],
        },
      },
      orderBy: { createdAt: 'asc' },
      include: {
        invoice: {
          include: { booking: { include: { patient: true } } },
        },
      },
    });
  }

  // ---------------------------------------------------------------------------
  // RESULT (multi-parameter)
  // ---------------------------------------------------------------------------

  async enterResult(tenantId: string, dto: EnterResultDto, enteredById?: string) {
    const sample=await this.prisma.sample.findFirst({where:{id:dto.sampleId,tenantId},include:{invoice:true}});
    if (!sample) throw new NotFoundException('Sample not found');
    if (sample.invoice.visitId) {
      const outcome=await this.prisma.$transaction(async tx=>{
        const result=await enterOccurrenceResult(tx,tenantId,dto,enteredById);
        const report=await this.recomputeReportStatus(tx,tenantId,sample.invoiceId);
        return {result,report};
      });
      if(outcome.report.justCompleted) await this.notifyReportReady(tenantId,sample.invoiceId,outcome.report.trackingId);
      this.gateway.notifySampleChanged(tenantId,sample.id);
      return projectClinicalResult(outcome.result);
    }
    if(dto.orderedTestId || !dto.testId || !dto.invoiceLineId || dto.values?.some(v=>!v.testParameterId || v.versionParameterId)) {
      throw new BadRequestException('Legacy work requires its catalog/source parameter identifiers');
    }
    return this.enterLegacyResult(tenantId,dto as LegacyEntry,enteredById);
  }

  private async enterLegacyResult(tenantId: string, dto: LegacyEntry, enteredById?: string) {
    const sample = await this.getSample(tenantId, dto.sampleId);

    if (
      sample.status !== SampleStatus.ACCEPTED &&
      sample.status !== SampleStatus.IN_TESTING
    ) {
      throw new BadRequestException(
        `Cannot enter result for sample in status ${sample.status}`,
      );
    }

    if (!dto.values?.length) {
      throw new BadRequestException('At least one parameter value is required');
    }

    // An existing RELEASED (finalized) result can't be silently overwritten
    // by re-submitting the entry form — that's what reopenResult is for.
    // An existing ENTERED result, though, should be edited in place: the
    // technician corrected a typo, not created a second result for the
    // same test.
    const existing = await this.prisma.result.findFirst({
      where: {
        tenantId,
        sampleId: dto.sampleId,
        testId: dto.testId,
        status: { in: [ResultStatus.ENTERED, ResultStatus.RELEASED] },
      },
      orderBy: { createdAt: 'desc' },
    });
    if (existing?.status === ResultStatus.RELEASED) {
      throw new BadRequestException(
        'This result is already finalized. Reopen it before editing.',
      );
    }

    const test = await this.prisma.test.findFirst({
      where: { id: dto.testId, tenantId },
      include: {
        parameters: { include: { referenceRanges: true } },
      },
    });
    if (!test) throw new NotFoundException('Test not found');

    const paramMap = new Map(test.parameters.map((p) => [p.id, p]));
    for (const v of dto.values) {
      if (!paramMap.has(v.testParameterId)) {
        throw new BadRequestException(
          `Parameter ${v.testParameterId} does not belong to test ${test.code}`,
        );
      }
    }

    const patient = sample.invoice.booking?.patient;
    const collection = await this.prisma.sampleEvent.findFirst({where:{sampleId:dto.sampleId,tenantId,eventType:SampleEventType.COLLECTED},orderBy:{recordedAt:'asc'}});
    const ageMonths = ageAtCollection(patient?.dateOfBirth ?? null,collection?.occurredAt ?? null);
    const gender = patient?.gender ?? null;

    // Evaluate each value against its parameter's reference ranges
    const evaluated = dto.values.map((v) => {
      const param = paramMap.get(v.testParameterId)!;
      let flag: ResultFlag | null = null;
      let isCritical = false;
      let autoInterpretation: string | null = null;

      if (v.valueNumeric !== undefined && v.valueNumeric !== null) {
        const range = this.pickReferenceRange(param.referenceRanges, gender, ageMonths);
        if (range) {
          const result = this.evaluateAgainstRange(new Decimal(v.valueNumeric), range);
          flag = result.flag;
          isCritical = result.isCritical;
          autoInterpretation = result.interpretation;
        }
      }

      return {
        testParameterId: v.testParameterId,
        valueNumeric: v.valueNumeric !== undefined ? new Decimal(v.valueNumeric) : null,
        valueText: v.valueText ?? null,
        unit: v.unit ?? param.unit,
        flag,
        isCritical,
        interpretation: v.interpretation ?? autoInterpretation,
      };
    });

    const anyCritical = evaluated.some((e) => e.isCritical);
    // Saving now only finalizes when explicitly asked to — entering a
    // value is no longer treated as equivalent to finalizing the report.
    const shouldRelease = dto.releaseImmediately === true;

    const result = await this.prisma.$transaction(async (tx) => {
      if (sample.status === SampleStatus.ACCEPTED) {
        const changed = await tx.sample.updateMany({
          where: { id: sample.id, status: SampleStatus.ACCEPTED },
          data: { status: SampleStatus.IN_TESTING },
        });
        if (changed.count) await appendSampleEvent(tx, { tenantId, sampleId: sample.id, actorId: enteredById,
          eventType: SampleEventType.TESTING_STARTED, fromStatus: SampleStatus.ACCEPTED, toStatus: SampleStatus.IN_TESTING });
      }

      const resultData = {
        status: shouldRelease ? ResultStatus.RELEASED : ResultStatus.ENTERED,
        isCritical: anyCritical,
        enteredById: enteredById ?? null,
        enteredAt: new Date(),
        releasedById: shouldRelease ? enteredById ?? null : null,
        releasedAt: shouldRelease ? new Date() : null,
        notes: dto.notes,
      };

      const created = existing
        ? await tx.result.update({
            where: { id: existing.id },
            data: {
              ...resultData,
              values: {
                deleteMany: {},
                create: evaluated.map((e) => ({
                  testParameterId: e.testParameterId,
                  valueNumeric: e.valueNumeric,
                  valueText: e.valueText,
                  unit: e.unit,
                  flag: e.flag,
                  isCritical: e.isCritical,
                  interpretation: e.interpretation,
                })),
              },
            },
            include: { test: true, values: { include: { parameter: true } } },
          })
        : await tx.result.create({
            data: {
              tenantId,
              sampleId: dto.sampleId,
              invoiceLineId: dto.invoiceLineId,
              testId: dto.testId,
              ...resultData,
              values: {
                create: evaluated.map((e) => ({
                  testParameterId: e.testParameterId,
                  valueNumeric: e.valueNumeric,
                  valueText: e.valueText,
                  unit: e.unit,
                  flag: e.flag,
                  isCritical: e.isCritical,
                  interpretation: e.interpretation,
                })),
              },
            },
            include: {
              test: true,
              values: { include: { parameter: true } },
            },
          });

      let reportOutcome: { justCompleted: boolean; trackingId?: string } = {
        justCompleted: false,
      };
      if (shouldRelease) {
        reportOutcome = await this.recomputeReportStatus(
          tx,
          tenantId,
          sample.invoiceId,
        );
      }

      return { created, reportOutcome };
    });

    // SMS sent AFTER the transaction commits — an SMS gateway call has no
    // place holding a DB transaction open (see notes in NotificationsService).
    // TODO: raise ResultReleased / ReportGenerated domain events (this direct
    // call is the v1 stand-in — fine at this scale, revisit if more than
    // notifications ever needs to react to a report completing).
    if (result.reportOutcome.justCompleted) {
      await this.notifyReportReady(tenantId, sample.invoiceId, result.reportOutcome.trackingId);
    }

    this.gateway.notifySampleChanged(tenantId, sample.id);

    return result.created;
  }

  /**
   * Explicit finalization step: ENTERED → RELEASED. Entering a value no
   * longer does this automatically (see enterResult) — the lab must take
   * this separate, intentional action once it has confirmed the result is
   * correct and ready to count toward report readiness.
   */
  async finalizeResult(tenantId: string, resultId: string, actorId?: string) {
    const existing = await this.prisma.result.findFirst({
      where: { id: resultId, tenantId },
    });
    if (!existing) throw new NotFoundException('Result not found');
    if(existing.orderedTestId) {
      const outcome=await this.prisma.$transaction(async tx=>{
        const result=await releaseOccurrenceResult(tx,tenantId,resultId,actorId);
        const sample=await tx.sample.findUniqueOrThrow({where:{id:result.sampleId}});
        const report=await this.recomputeReportStatus(tx,tenantId,sample.invoiceId);
        return {result,sample,report};
      });
      if(outcome.report.justCompleted) await this.notifyReportReady(tenantId,outcome.sample.invoiceId,outcome.report.trackingId);
      this.gateway.notifySampleChanged(tenantId,outcome.sample.id);
      return projectClinicalResult(outcome.result);
    }
    if (existing.status !== ResultStatus.ENTERED) {
      throw new BadRequestException(
        `Cannot finalize a result in status ${existing.status}`,
      );
    }

    const sampleForResult = await this.prisma.sample.findUnique({
      where: { id: existing.sampleId },
    });
    if (!sampleForResult) throw new NotFoundException('Sample not found for this result');

    const outcome = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.result.update({
        where: { id: resultId },
        data: {
          status: ResultStatus.RELEASED,
          releasedById: actorId ?? null,
          releasedAt: new Date(),
        },
        include: { test: true, values: { include: { parameter: true } } },
      });
      const reportOutcome = await this.recomputeReportStatus(
        tx,
        tenantId,
        sampleForResult.invoiceId,
      );
      return { updated, reportOutcome };
    });

    if (outcome.reportOutcome.justCompleted) {
      await this.notifyReportReady(
        tenantId,
        sampleForResult.invoiceId,
        outcome.reportOutcome.trackingId,
      );
    }

    this.gateway.notifySampleChanged(tenantId, sampleForResult.id);

    return outcome.updated;
  }

  /**
   * Invoice-level "Mark Ready for Collection" action — this is the button
   * that finalizes a patient's whole report, not just one sample. It
   * releases every still-ENTERED result across ALL samples on the
   * invoice in one go, then recomputes the invoice's overall Report
   * status so it flows into the Reports section / public tracking.
   *
   * Rejects (400) if any test on the invoice — on any of its samples —
   * has no result at all yet. This mirrors computeInvoiceReadiness() so
   * the frontend's greyed-out button state and this server-side check
   * can never disagree.
   */
  async markInvoiceReady(tenantId: string, invoiceId: string, actorId?: string) {
    const clinical=await this.prisma.invoice.findFirst({where:{id:invoiceId,tenantId},select:{visitId:true}});
    if (clinical?.visitId) {
      const outcome=await this.prisma.$transaction(async tx=>{
        await tx.$queryRaw`SELECT id FROM invoices WHERE id=${invoiceId} AND "tenantId"=${tenantId} FOR UPDATE`;
        const invoice=await tx.invoice.findUniqueOrThrow({where:{id:invoiceId},include:{lines:true,visit:{include:{orderedTests:true}},samples:{include:{results:true}}}});
        if(!this.computeInvoiceReadiness(invoice).allEntered) throw new BadRequestException('Each OrderedTest occurrence needs a result');
        const drafts=invoice.samples.flatMap(s=>s.results).filter(r=>r.orderedTestId && r.status===ResultStatus.ENTERED).sort((a,b)=>a.orderedTestId!.localeCompare(b.orderedTestId!));
        for(const draft of drafts) await releaseOccurrenceResult(tx,tenantId,draft.id,actorId);
        return {released:drafts.length,samples:invoice.samples,report:await this.recomputeReportStatus(tx,tenantId,invoiceId)};
      });
      if(outcome.report.justCompleted) await this.notifyReportReady(tenantId,invoiceId,outcome.report.trackingId);
      for(const s of outcome.samples) this.gateway.notifySampleChanged(tenantId,s.id);
      return {invoiceId,released:outcome.released};
    }
    const invoice = await this.prisma.invoice.findFirst({
      where: { id: invoiceId, tenantId },
      include: { lines: true, samples: { include: { results: true } } },
    });
    if (!invoice) throw new NotFoundException('Invoice not found');

    const testIds = invoice.lines.filter((l) => l.testId).map((l) => l.testId as string);
    if (testIds.length === 0) {
      throw new BadRequestException('This invoice has no tests to release.');
    }

    const enteredTestIds = new Set<string>();
    const resultIdsToRelease: string[] = [];
    for (const sample of invoice.samples) {
      for (const r of sample.results) {
        if (r.status === ResultStatus.RELEASED) {
          enteredTestIds.add(r.testId);
        } else if (r.status === ResultStatus.ENTERED) {
          enteredTestIds.add(r.testId);
          resultIdsToRelease.push(r.id);
        }
      }
    }

    const missing = testIds.filter((t) => !enteredTestIds.has(t));
    if (missing.length > 0) {
      throw new BadRequestException(
        `Cannot mark ready — ${missing.length} of ${testIds.length} test(s) on this report still need a result entered.`,
      );
    }

    const reportOutcome = await this.prisma.$transaction(async (tx) => {
      for (const resultId of resultIdsToRelease) {
        await tx.result.update({
          where: { id: resultId },
          data: {
            status: ResultStatus.RELEASED,
            releasedById: actorId ?? null,
            releasedAt: new Date(),
          },
        });
      }
      return this.recomputeReportStatus(tx, tenantId, invoiceId);
    });

    if (reportOutcome.justCompleted) {
      await this.notifyReportReady(tenantId, invoiceId, reportOutcome.trackingId);
    }

    // Every sample on this invoice may be open on someone else's screen —
    // notify for each so all of them refresh live.
    for (const sample of invoice.samples) {
      this.gateway.notifySampleChanged(tenantId, sample.id);
    }

    return { invoiceId, released: resultIdsToRelease.length };
  }

  /**
   * Explicit, authorized "un-finalize": RELEASED → ENTERED. Intentionally a
   * separate action from editing — a technician can't silently overwrite a
   * finalized result by resubmitting the entry form (enterResult rejects
   * that); they have to reopen it first, which is auditable (reason
   * required) and walks the report status back down if it had already
   * reached COMPLETE.
   */
  async reopenResult(tenantId: string, resultId: string, reason: string, actorId?: string) {
    if (!reason?.trim()) {
      throw new BadRequestException('A reason is required to reopen a finalized result');
    }
    const existing = await this.prisma.result.findFirst({
      where: { id: resultId, tenantId },
    });
    if (!existing) throw new NotFoundException('Result not found');
    if(existing.orderedTestId) {
      const draft=await this.prisma.$transaction(async tx=>{
        const result=await reopenOccurrenceResult(tx,tenantId,resultId,reason,actorId);
        const sample=await tx.sample.findUniqueOrThrow({where:{id:result.sampleId}});
        await this.recomputeReportStatus(tx,tenantId,sample.invoiceId);
        return result;
      });
      this.gateway.notifySampleChanged(tenantId,draft.sampleId);
      return projectClinicalResult(draft);
    }
    if (existing.status !== ResultStatus.RELEASED) {
      throw new BadRequestException(
        `Cannot reopen a result in status ${existing.status}`,
      );
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.result.update({
        where: { id: resultId },
        data: {
          status: ResultStatus.ENTERED,
          releasedById: null,
          releasedAt: null,
          notes: existing.notes
            ? `${existing.notes}\n[Reopened by ${actorId ?? 'unknown'}: ${reason.trim()}]`
            : `[Reopened by ${actorId ?? 'unknown'}: ${reason.trim()}]`,
        },
        include: { test: true, values: { include: { parameter: true } } },
      });
      const sample = await tx.sample.findUnique({ where: { id: existing.sampleId } });
      if (sample) {
        await this.recomputeReportStatus(tx, tenantId, sample.invoiceId);
      }
      return result;
    });

    this.gateway.notifySampleChanged(tenantId, existing.sampleId);

    return updated;
  }

  private async notifyReportReady(
    tenantId: string,
    invoiceId: string,
    trackingId?: string,
  ) {
    const invoice = await this.prisma.invoice.findFirst({
      where: { id: invoiceId },
      include: { booking: { include: { patient: true } } },
    });
    const patient = invoice?.booking?.patient;
    if (!patient?.smsConsent || !patient.phone) return;

    // Wording (including whether/how tracking ID or payment status is
    // mentioned) is entirely administrator-owned via Settings → SMS; this
    // service only supplies the values. Tracking ID is safe to include
    // regardless of payment status — it's already printed on the patient's
    // receipt, and the online report-lookup page itself still withholds the
    // actual report for a partially-paid invoice.
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
    await this.notifications.sendTemplatedSms(
      tenantId,
      'REPORT_READY',
      patient.phone,
      {
        patientName: patient.fullName,
        bookingId: invoice?.booking?.bookingCode ?? '',
        labName: tenant?.name ?? '',
        trackingId: trackingId ?? '',
      },
      { relatedType: 'Report', relatedId: invoiceId },
    );
  }

  async amendResult(
    tenantId: string,
    resultId: string,
    dto: AmendResultDto,
    amendedById?: string,
  ) {
    const original = await this.prisma.result.findFirst({
      where: { id: resultId, tenantId },
      include: {
        sample: true,
        test: { include: { parameters: { include: { referenceRanges: true } } } },
        values: true,
      },
    });

    if (!original) throw new NotFoundException('Result not found');
    if(original.orderedTestId) {
      const result=await this.prisma.$transaction(async tx=>{
        await reopenOccurrenceResult(tx,tenantId,resultId,dto.amendmentReason,amendedById);
        const replacement=await enterOccurrenceResult(tx,tenantId,{sampleId:original.sampleId,orderedTestId:original.orderedTestId!,values:dto.values,releaseImmediately:true},amendedById);
        await this.recomputeReportStatus(tx,tenantId,original.sample.invoiceId);
        return replacement;
      });
      this.gateway.notifySampleChanged(tenantId,original.sampleId);
      return projectClinicalResult(result);
    }
    if (original.status !== ResultStatus.RELEASED) {
      throw new BadRequestException(
        `Only RELEASED results can be amended. Current status: ${original.status}`,
      );
    }
    if (!dto.values?.length) {
      throw new BadRequestException('At least one parameter value is required');
    }

    const paramMap = new Map(original.test.parameters.map((p) => [p.id, p]));
    const patient = (
      await this.prisma.sample.findFirst({
        where: { id: original.sampleId },
        include: { invoice: { include: { booking: { include: { patient: true } } } } },
      })
    )?.invoice?.booking?.patient;

    const collection = await this.prisma.sampleEvent.findFirst({where:{sampleId:original.sampleId,tenantId,eventType:SampleEventType.COLLECTED},orderBy:{recordedAt:'asc'}});
    const ageMonths = ageAtCollection(patient?.dateOfBirth ?? null,collection?.occurredAt ?? null);
    const gender = patient?.gender ?? null;

    const evaluated = dto.values.map((v) => {
      const param = v.testParameterId ? paramMap.get(v.testParameterId) : undefined;
      if (!param) {
        throw new BadRequestException(`Parameter ${v.testParameterId} invalid for this test`);
      }
      let flag: ResultFlag | null = null;
      let isCritical = false;
      let autoInterpretation: string | null = null;

      if (v.valueNumeric !== undefined && v.valueNumeric !== null) {
        const range = this.pickReferenceRange(param.referenceRanges, gender, ageMonths);
        if (range) {
          const result = this.evaluateAgainstRange(new Decimal(v.valueNumeric), range);
          flag = result.flag;
          isCritical = result.isCritical;
          autoInterpretation = result.interpretation;
        }
      }

      return {
        testParameterId: param.id,
        valueNumeric: v.valueNumeric !== undefined ? new Decimal(v.valueNumeric) : null,
        valueText: v.valueText ?? null,
        unit: v.unit ?? param.unit,
        flag,
        isCritical,
        interpretation: v.interpretation ?? autoInterpretation,
      };
    });

    const anyCritical = evaluated.some((e) => e.isCritical);

    return this.prisma.$transaction(async (tx) => {
      await tx.result.update({
        where: { id: resultId },
        data: { status: ResultStatus.SUPERSEDED },
      });

      const newResult = await tx.result.create({
        data: {
          tenantId,
          sampleId: original.sampleId,
          invoiceLineId: original.invoiceLineId,
          testId: original.testId,
          status: ResultStatus.RELEASED,
          isCritical: anyCritical,
          enteredById: amendedById ?? null,
          enteredAt: new Date(),
          releasedById: amendedById ?? null,
          releasedAt: new Date(),
          amendedFromResultId: original.id,
          notes: `Amendment: ${dto.amendmentReason}`,
          values: {
            create: evaluated.map((e) => ({
              testParameterId: e.testParameterId,
              valueNumeric: e.valueNumeric,
              valueText: e.valueText,
              unit: e.unit,
              flag: e.flag,
              isCritical: e.isCritical,
              interpretation: e.interpretation,
            })),
          },
        },
        include: {
          test: true,
          values: { include: { parameter: true } },
        },
      });

      const report = await tx.report.findFirst({
        where: { invoiceId: original.sample.invoiceId },
      });
      if (report && report.status === ReportStatus.COMPLETE) {
        await tx.report.update({
          where: { id: report.id },
          data: { status: ReportStatus.AMENDED, amendedAt: new Date() },
        });
      }

      return newResult;
    });
  }

  // ---------------------------------------------------------------------------
  // REPORT helper
  // ---------------------------------------------------------------------------

  /**
   * Recomputes Report.status from the actual state of its samples' results
   * — used after both releasing and reopening a result, so the report
   * status is always derived fresh rather than incrementally patched (which
   * is how "reopen" can correctly walk COMPLETE back down to PARTIAL_READY
   * without a separate, easy-to-drift code path).
   */
  private async recomputeReportStatus(
    tx: Prisma.TransactionClient,
    tenantId: string,
    invoiceId: string,
  ): Promise<{ justCompleted: boolean; trackingId?: string }> {
    const invoice = await tx.invoice.findFirst({
      where: { id: invoiceId,tenantId },
      include: {
        lines: true,
        visit:{include:{orderedTests:true}},
        report: true,
        samples: { include: { results: true } },
      },
    });
    if (!invoice) return { justCompleted: false };

    const readiness=this.computeInvoiceReadiness(invoice);
    const allReleased = readiness.allReleased;
    const anyProgress = readiness.enteredCount>0;
    const targetStatus = allReleased
      ? ReportStatus.COMPLETE
      : anyProgress
        ? ReportStatus.PARTIAL_READY
        : ReportStatus.PENDING;

    if (!invoice.report) {
      if (!anyProgress) return { justCompleted: false };
      const created = await tx.report.create({
        data: {
          tenantId,
          branchId: invoice.branchId,
          invoiceId,
          visitId:invoice.visitId,
          status: targetStatus,
          reportNumber: generateReportNumber(),
          trackingId: generateTrackingId(),
          generatedAt: allReleased ? new Date() : null,
        },
      });
      return { justCompleted: allReleased, trackingId: created.trackingId };
    }

    const wasComplete = invoice.report.status === ReportStatus.COMPLETE;
    if (invoice.report.status !== targetStatus) {
      const updated = await tx.report.update({
        where: { id: invoice.report.id },
        data: {
          status: targetStatus,
          generatedAt: allReleased ? (invoice.report.generatedAt ?? new Date()) : null,
        },
      });
      // Only the PENDING/PARTIAL_READY → COMPLETE transition is a genuine
      // "just became ready" moment worth notifying about.
      return { justCompleted: allReleased && !wasComplete, trackingId: updated.trackingId };
    }

    return { justCompleted: false, trackingId: invoice.report.trackingId };
  }

  // ---------------------------------------------------------------------------
  // Reference range helpers
  // ---------------------------------------------------------------------------

  private pickReferenceRange(
    ranges: {
      gender: Gender | null;
      ageMinMonths: number | null;
      ageMaxMonths: number | null;
      lowNormal: Decimal | null;
      highNormal: Decimal | null;
      criticalLow: Decimal | null;
      criticalHigh: Decimal | null;
      unit: string | null;
      interpretation: string | null;
    }[],
    gender: Gender | null,
    ageMonths: number | null,
  ) {
    return pickCompatibleRange(ranges,gender,ageMonths);
  }

  private evaluateAgainstRange(
    value: Decimal,
    range: {
      lowNormal: Decimal | null;
      highNormal: Decimal | null;
      criticalLow: Decimal | null;
      criticalHigh: Decimal | null;
      interpretation: string | null;
    },
  ): { flag: ResultFlag; isCritical: boolean; interpretation: string | null } {
    if (range.criticalLow && value.lessThan(range.criticalLow)) {
      return { flag: ResultFlag.CRITICAL_LOW, isCritical: true, interpretation: range.interpretation };
    }
    if (range.criticalHigh && value.greaterThan(range.criticalHigh)) {
      return { flag: ResultFlag.CRITICAL_HIGH, isCritical: true, interpretation: range.interpretation };
    }
    if (range.lowNormal && value.lessThan(range.lowNormal)) {
      return { flag: ResultFlag.LOW, isCritical: false, interpretation: range.interpretation };
    }
    if (range.highNormal && value.greaterThan(range.highNormal)) {
      return { flag: ResultFlag.HIGH, isCritical: false, interpretation: range.interpretation };
    }
    return { flag: ResultFlag.NORMAL, isCritical: false, interpretation: range.interpretation };
  }
}

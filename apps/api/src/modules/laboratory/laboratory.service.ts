import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CollectSampleDto } from './dto/collect-sample.dto';
import { EnterResultDto } from './dto/enter-result.dto';
import { AmendResultDto } from './dto/amend-result.dto';
import {
  SampleStatus,
  ResultStatus,
  ResultFlag,
  ReportStatus,
  Gender,
  Prisma,
  Decimal,
} from '@lms/database';
import { NotificationsService } from '../notifications/notifications.service';
import { LaboratoryGateway } from './laboratory.gateway';
import { generateReportNumber, generateTrackingId } from '../../common/id-generators.util';

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
    });
    if (!invoice) throw new NotFoundException('Invoice not found');

    return this.prisma.sample.create({
      data: {
        tenantId,
        branchId,
        invoiceId: dto.invoiceId,
        sampleCode: generateSampleCode(),
        status: SampleStatus.COLLECTED,
        sampleType: dto.sampleType,
        collectedAt: dto.collectedAt ? new Date(dto.collectedAt) : new Date(),
        collectedById: collectedById ?? null,
        notes: dto.notes,
      },
    });
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

  async receiveSample(tenantId: string, sampleId: string) {
    const sample = await this.getSample(tenantId, sampleId);
    const allowed: SampleStatus[] = [SampleStatus.COLLECTED, SampleStatus.IN_TRANSIT];
    if (!allowed.includes(sample.status)) {
      throw new BadRequestException(`Cannot receive sample in status ${sample.status}`);
    }
    return this.prisma.sample.update({
      where: { id: sampleId },
      data: { status: SampleStatus.RECEIVED_AT_LAB, receivedAt: new Date() },
    });
  }

  async acceptSample(tenantId: string, sampleId: string, notes?: string) {
    const sample = await this.getSample(tenantId, sampleId);
    if (sample.status !== SampleStatus.RECEIVED_AT_LAB) {
      throw new BadRequestException(`Cannot accept sample in status ${sample.status}`);
    }
    return this.prisma.sample.update({
      where: { id: sampleId },
      data: { status: SampleStatus.ACCEPTED, acceptedAt: new Date(), notes: notes ?? sample.notes },
    });
  }

  async rejectSample(tenantId: string, sampleId: string, rejectionReason: string) {
    const sample = await this.getSample(tenantId, sampleId);
    if (sample.status !== SampleStatus.RECEIVED_AT_LAB) {
      throw new BadRequestException(`Cannot reject sample in status ${sample.status}`);
    }
    return this.prisma.sample.update({
      where: { id: sampleId },
      data: { status: SampleStatus.REJECTED, rejectedAt: new Date(), rejectionReason },
    });
  }

  async startTesting(tenantId: string, sampleId: string) {
    const sample = await this.getSample(tenantId, sampleId);
    if (sample.status !== SampleStatus.ACCEPTED) {
      throw new BadRequestException(`Cannot start testing on sample in status ${sample.status}`);
    }
    return this.prisma.sample.update({
      where: { id: sampleId },
      data: { status: SampleStatus.IN_TESTING },
    });
  }

  async getSample(tenantId: string, id: string) {
    const sample = await this.prisma.sample.findFirst({
      where: { id, tenantId },
      include: {
        results: {
          include: {
            test: true,
            values: { include: { parameter: true } },
          },
        },
        invoice: {
          include: {
            booking: { include: { patient: true } },
            lines: { include: { test: true, package: true } },
          },
        },
      },
    });
    if (!sample) throw new NotFoundException('Sample not found');
    return sample;
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
    const ageMonths = patient?.dateOfBirth
      ? this.ageInMonths(patient.dateOfBirth)
      : null;
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
        await tx.sample.update({
          where: { id: sample.id },
          data: { status: SampleStatus.IN_TESTING },
        });
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

    const fullyPaid = invoice
      ? Number(invoice.amountDue) <= 0
      : false;

    const message = fullyPaid
      ? `Hi ${patient.fullName}, your lab report is ready. View/download it online with tracking ID ${trackingId}.`
      : `Hi ${patient.fullName}, your lab report is ready for collection at the lab.`;

    await this.notifications.sendSms(tenantId, patient.phone, message, {
      templateKey: 'report_ready',
      relatedType: 'Report',
      relatedId: invoiceId,
    });
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

    const ageMonths = patient?.dateOfBirth
      ? this.ageInMonths(patient.dateOfBirth)
      : null;
    const gender = patient?.gender ?? null;

    const evaluated = dto.values.map((v) => {
      const param = paramMap.get(v.testParameterId);
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
      where: { id: invoiceId },
      include: {
        lines: true,
        report: true,
        samples: { include: { results: true } },
      },
    });
    if (!invoice) return { justCompleted: false };

    const releasedTestIds = new Set<string>();
    const enteredOrReleasedTestIds = new Set<string>();
    for (const sample of invoice.samples) {
      for (const result of sample.results) {
        if (result.status === ResultStatus.RELEASED) {
          releasedTestIds.add(result.testId);
          enteredOrReleasedTestIds.add(result.testId);
        } else if (result.status === ResultStatus.ENTERED) {
          enteredOrReleasedTestIds.add(result.testId);
        }
      }
    }

    const testLineCount = invoice.lines.filter((l) => l.testId).length;
    const allReleased = testLineCount > 0 && releasedTestIds.size >= testLineCount;
    const anyProgress = enteredOrReleasedTestIds.size > 0;
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

  private ageInMonths(dob: Date): number {
    const now = new Date();
    let months =
      (now.getFullYear() - dob.getFullYear()) * 12 +
      (now.getMonth() - dob.getMonth());
    if (now.getDate() < dob.getDate()) months -= 1;
    return Math.max(0, months);
  }

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
    const scored = ranges.map((r) => {
      let score = 0;
      if (r.gender && gender && r.gender === gender) score += 2;
      if (r.gender === null) score += 1;
      if (
        ageMonths !== null &&
        (r.ageMinMonths === null || ageMonths >= r.ageMinMonths) &&
        (r.ageMaxMonths === null || ageMonths <= r.ageMaxMonths)
      ) {
        score += 2;
      }
      return { range: r, score };
    });
    scored.sort((a, b) => b.score - a.score);
    return scored[0]?.range ?? null;
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

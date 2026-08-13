import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { PatientsService } from '../patients/patients.service';
import {
  isReportFinalized,
  canDeliverReport,
  REPORT_NOT_FINALIZED_MESSAGE,
} from '../../common/report-eligibility.util';
import { ReportingService } from '../reporting/reporting.service';
import { SettingsService } from '../settings/settings.service';
import { PrintingService } from '../printing/printing.service';
import { buildReportHtml } from '../printing/templates/report.template';
import { BookingStatus, BookingSource } from '@lms/database';

function generateBookingCode(): string {
  const now = new Date();
  const datePart = now.toISOString().slice(0, 10).replace(/-/g, '');
  const random = Math.floor(1000 + Math.random() * 9000);
  return `BK-${datePart}-${random}`;
}

@Injectable()
export class PublicService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly patientsService: PatientsService,
    private readonly reportingService: ReportingService,
    private readonly settingsService: SettingsService,
    private readonly printingService: PrintingService,
  ) {}

  /** Public rate list — active tests only */
  async listRates(tenantId: string) {
    const tests = await this.prisma.test.findMany({
      where: { tenantId, isActive: true },
      orderBy: [{ category: 'asc' }, { name: 'asc' }],
      select: {
        id: true,
        code: true,
        name: true,
        category: true,
        sampleType: true,
        basePrice: true,
        turnaroundHours: true,
        isPanel: true,
      },
    });
    const packages = await this.prisma.package.findMany({
      where: { tenantId, isActive: true },
      orderBy: { name: 'asc' },
      select: {
        id: true,
        code: true,
        name: true,
        basePrice: true,
        description: true,
      },
    });
    return { tests, packages };
  }

  /**
   * Report lookup: tracking ID + secondary verification (phone last digits or full phone).
   * Result visibility follows the centralized eligibility rule (finalized + fully
   * paid) — a verified patient with an outstanding balance is told the report is
   * ready for collection at the lab, but never sees the actual result values.
   */
  private async verifyAndFindReport(tenantId: string, trackingId: string, verification: string) {
    const report = await this.prisma.report.findFirst({
      where: { tenantId, trackingId: trackingId.toUpperCase() },
      include: {
        invoice: {
          include: {
            booking: { include: { patient: true } },
            lines: { include: { test: true } },
            samples: {
              include: {
                results: {
                  where: { status: 'RELEASED' },
                  include: {
                    test: true,
                    values: {
                      include: { parameter: true },
                      orderBy: { parameter: { sortOrder: 'asc' } },
                    },
                  },
                },
              },
            },
            payments: true,
          },
        },
      },
    });

    if (!report) {
      throw new NotFoundException('Report not found. Check your tracking ID.');
    }

    const phone = report.invoice.booking?.patient?.phone ?? '';
    const cnic = report.invoice.booking?.patient?.cnic ?? '';
    const v = verification.replace(/\s/g, '');

    const phoneOk =
      phone.endsWith(v) || phone === v || (v.length >= 4 && phone.includes(v));
    const cnicOk = cnic && (cnic.replace(/-/g, '').endsWith(v.replace(/-/g, '')) || cnic.includes(v));

    if (!phoneOk && !cnicOk) {
      throw new ForbiddenException(
        'Verification failed. Use the phone number or last digits of CNIC used at registration.',
      );
    }

    return report;
  }

  async lookupReport(
    tenantId: string,
    trackingId: string,
    verification: string,
  ) {
    const report = await this.verifyAndFindReport(tenantId, trackingId, verification);

    const patientName = report.invoice.booking?.patient?.fullName ?? '';
    const finalized = isReportFinalized(report);
    const deliverable = canDeliverReport(report, report.invoice);

    // Case A — not finalized: no results, no payment detail, just "still preparing".
    if (!finalized) {
      return {
        trackingId: report.trackingId,
        patientName,
        state: 'NOT_READY' as const,
        message: REPORT_NOT_FINALIZED_MESSAGE,
      };
    }

    // Case B — finalized but not fully paid: confirm it's ready for collection,
    // but never include result values, even a "message" note bundled with them.
    if (!deliverable) {
      return {
        trackingId: report.trackingId,
        patientName,
        state: 'READY_FOR_COLLECTION' as const,
        message:
          'Your report is ready to be collected at the laboratory. Please clear any pending dues before receiving the report.',
      };
    }

    // Case C — finalized and fully paid: full results + PDF download available.
    const results = report.invoice.samples.flatMap((s) =>
      s.results.map((r) => ({
        testCode: r.test?.code,
        testName: r.test?.name,
        isCritical: r.isCritical,
        values: r.values.map((v) => ({
          parameter: v.parameter?.name ?? v.parameter?.code,
          code: v.parameter?.code,
          value: v.valueNumeric ?? v.valueText,
          unit: v.unit,
          flag: v.flag,
          isCritical: v.isCritical,
        })),
      })),
    );

    return {
      trackingId: report.trackingId,
      reportId: report.id,
      reportNumber: report.reportNumber,
      patientName,
      state: 'AVAILABLE' as const,
      generatedAt: report.generatedAt,
      results,
    };
  }

  /**
   * Public PDF download — reuses the exact same report template/Puppeteer
   * pipeline as the front-desk PDF route (see PrintingService), not a
   * separate implementation, so the physical report and the online PDF
   * are always identical. Verification + eligibility are re-checked here
   * independently of lookupReport; this is a separate HTTP request and
   * must enforce the rule itself, not trust that the caller already saw
   * the JSON lookup succeed.
   */
  async lookupReportPdf(
    tenantId: string,
    trackingId: string,
    verification: string,
  ): Promise<{ pdf: Buffer; filename: string }> {
    const report = await this.verifyAndFindReport(tenantId, trackingId, verification);

    if (!isReportFinalized(report)) {
      throw new ForbiddenException(REPORT_NOT_FINALIZED_MESSAGE);
    }
    if (!canDeliverReport(report, report.invoice)) {
      throw new ForbiddenException(
        'Report not yet available for download — outstanding balance must be cleared first.',
      );
    }

    // Re-fetch through reportingService.findById for the exact same shape
    // buildReportHtml expects (this endpoint's own query above is scoped
    // for the lightweight JSON lookup, not full template rendering).
    const fullReport = await this.reportingService.findById(tenantId, report.id);
    const settings = await this.settingsService.getPrintLayout(tenantId);
    const branding = await this.settingsService.getBranding(tenantId);
    const html = buildReportHtml(fullReport, { ...settings, logoDataUrl: branding.logoDataUrl });
    const pdf = await this.printingService.renderPdf(html, {
      marginTopMm: settings.marginTopMm,
      marginBottomMm: settings.marginBottomMm,
    });

    return { pdf, filename: `report-${report.trackingId}.pdf` };
  }

  /**
   * Online booking request → PENDING_REVIEW.
   * Creates or matches patient by phone, then creates booking.
   */
  async requestBooking(
    tenantId: string,
    branchId: string,
    dto: {
      fullName: string;
      phone: string;
      preferredAt?: string;
      notes?: string;
      testIds?: string[];
    },
  ) {
    if (!dto.fullName?.trim() || !dto.phone?.trim()) {
      throw new BadRequestException('Name and phone are required');
    }

    // Find or create patient
    let patient = await this.prisma.patient.findFirst({
      where: { tenantId, phone: dto.phone },
    });

    if (!patient) {
      const { labNumber, mrcNumber } =
        await this.patientsService.generatePatientIdentifiers(tenantId);
      patient = await this.prisma.patient.create({
        data: {
          tenantId,
          branchId,
          labNumber,
          mrcNumber,
          fullName: dto.fullName.trim(),
          phone: dto.phone.trim(),
          smsConsent: true,
        },
      });
    }

    const bookingCode = generateBookingCode();

    const booking = await this.prisma.booking.create({
      data: {
        tenantId,
        branchId,
        patientId: patient.id,
        status: BookingStatus.PENDING_REVIEW,
        source: BookingSource.ONLINE,
        bookingCode,
        preferredAt: dto.preferredAt ? new Date(dto.preferredAt) : null,
        notes: dto.notes
          ? `${dto.notes}${dto.testIds?.length ? ` | Tests: ${dto.testIds.join(',')}` : ''}`
          : dto.testIds?.length
            ? `Requested tests: ${dto.testIds.join(',')}`
            : null,
      },
    });

    return {
      bookingCode: booking.bookingCode,
      status: booking.status,
      message:
        'Your booking request has been received. You will get an SMS when it is confirmed. Present this booking code at the lab.',
    };
  }
}

import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { BookingStatus, BookingSource } from '@lms/database';

function generateBookingCode(): string {
  const now = new Date();
  const datePart = now.toISOString().slice(0, 10).replace(/-/g, '');
  const random = Math.floor(1000 + Math.random() * 9000);
  return `BK-${datePart}-${random}`;
}

@Injectable()
export class PublicService {
  constructor(private readonly prisma: PrismaService) {}

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
   * Verified patients always see released results — outstanding balance is shown as a
   * notice (settle at collection), it does not hide the report. This matches the
   * in-lab staff view, which never withheld results for an unpaid balance either.
   */
  async lookupReport(
    tenantId: string,
    trackingId: string,
    verification: string,
  ) {
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

    const patientName = report.invoice.booking?.patient?.fullName ?? '';
    const amountDue = Number(report.invoice.amountDue);
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
      status: report.status,
      reportNumber: report.reportNumber,
      patientName,
      access: 'FULL' as const,
      generatedAt: report.generatedAt,
      amountPaid: report.invoice.amountPaid,
      amountDue: report.invoice.amountDue,
      invoiceStatus: report.invoice.status,
      message:
        amountDue > 0
          ? 'Balance due — please settle the remaining amount at the laboratory when collecting your printed report.'
          : undefined,
      results,
    };
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
      patient = await this.prisma.patient.create({
        data: {
          tenantId,
          branchId,
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

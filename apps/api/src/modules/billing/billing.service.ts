import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { BookingsService } from '../bookings/bookings.service';
import { CreateInvoiceDto } from './dto/create-invoice.dto';
import { RecordPaymentDto } from './dto/record-payment.dto';
import {
  InvoiceStatus,
  PaymentStatus,
  PaymentMethod,
  BookingStatus,
  ShareType,
  ShareStatus,
  Prisma,
  Decimal,
} from '@lms/database';

function generateInvoiceNumber(): string {
  const now = new Date();
  const datePart = now.toISOString().slice(0, 10).replace(/-/g, '');
  const random = Math.floor(10000 + Math.random() * 90000);
  return `INV-${datePart}-${random}`;
}

@Injectable()
export class BillingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly bookingsService: BookingsService,
  ) {}

  async findInvoiceById(tenantId: string, id: string) {
    const invoice = await this.prisma.invoice.findFirst({
      where: { id, tenantId },
      include: {
        lines: { include: { test: true, package: true }, orderBy: { createdAt: 'asc' } },
        payments: { orderBy: { receivedAt: 'asc' } },
        booking: { include: { patient: true, doctor: true } },
        company: true,
        report: true,
        samples: { select: { id: true, sampleCode: true, status: true } },
      },
    });

    if (!invoice) {
      throw new NotFoundException('Invoice not found');
    }
    return invoice;
  }

  async listInvoices(
    tenantId: string,
    branchId?: string,
    q?: string,
    from?: string,
    to?: string,
    status?: string,
  ) {
    const createdAt =
      from || to
        ? {
            ...(from ? { gte: new Date(from) } : {}),
            ...(to
              ? { lte: (() => { const d = new Date(to); d.setHours(23, 59, 59, 999); return d; })() }
              : {}),
          }
        : undefined;

    return this.prisma.invoice.findMany({
      where: {
        tenantId,
        ...(branchId ? { branchId } : {}),
        ...(status ? { status: status as InvoiceStatus } : {}),
        ...(createdAt ? { createdAt } : {}),
        ...(q
          ? {
              OR: [
                { invoiceNumber: { contains: q, mode: 'insensitive' } },
                { booking: { patient: { fullName: { contains: q, mode: 'insensitive' } } } },
                { booking: { patient: { phone: { contains: q } } } },
                { report: { trackingId: { contains: q, mode: 'insensitive' } } },
              ],
            }
          : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: {
        booking: { include: { patient: true } },
        report: { select: { id: true, trackingId: true, status: true, reportNumber: true } },
        payments: true,
        lines: true,
      },
    });
  }

  /**
   * Create an invoice from a booking + selected tests/packages.
   * Pricing pipeline (v1 simplified):
   *   base price → manual discount (if any) → snapshot on line
   * Full pipeline (doctor/corporate/campaign) will be expanded later.
   */
  async createInvoice(tenantId: string, branchId: string, dto: CreateInvoiceDto) {
    const booking = await this.bookingsService.findById(tenantId, dto.bookingId);

    if (booking.invoice) {
      throw new BadRequestException('This booking already has an invoice');
    }

    if (
      booking.status !== BookingStatus.CONFIRMED &&
      booking.status !== BookingStatus.CHECKED_IN
    ) {
      throw new BadRequestException(
        `Cannot invoice booking in status ${booking.status}`,
      );
    }

    if (!dto.lines || dto.lines.length === 0) {
      throw new BadRequestException('At least one invoice line is required');
    }

    // Resolve prices for each line
    const resolvedLines: {
      testId: string | null;
      packageId: string | null;
      description: string;
      quantity: number;
      basePrice: Decimal;
      unitPrice: Decimal;
      discountAmount: Decimal;
      taxAmount: Decimal;
      lineTotal: Decimal;
      manualDiscount: Decimal | null;
      manualDiscountReason: string | null;
    }[] = [];

    let subtotal = new Decimal(0);
    let discountTotal = new Decimal(0);

    for (const line of dto.lines) {
      if (!line.testId && !line.packageId) {
        throw new BadRequestException('Each line must have testId or packageId');
      }

      let basePrice = new Decimal(0);
      let description = line.description ?? '';

      if (line.testId) {
        const test = await this.prisma.test.findFirst({
          where: { id: line.testId, tenantId, isActive: true },
        });
        if (!test) {
          throw new NotFoundException(`Test ${line.testId} not found or inactive`);
        }
        basePrice = test.basePrice;
        description = description || test.name;
      }

      if (line.packageId) {
        const pkg = await this.prisma.package.findFirst({
          where: { id: line.packageId, tenantId, isActive: true },
        });
        if (!pkg) {
          throw new NotFoundException(`Package ${line.packageId} not found or inactive`);
        }
        basePrice = pkg.basePrice;
        description = description || pkg.name;
      }

      const quantity = line.quantity ?? 1;
      const manualDiscount = line.manualDiscount
        ? new Decimal(line.manualDiscount)
        : new Decimal(0);

      if (manualDiscount.greaterThan(basePrice.mul(quantity))) {
        throw new BadRequestException('Manual discount cannot exceed line total');
      }

      const lineSubtotal = basePrice.mul(quantity);
      const unitPrice = basePrice; // after future pipeline this may differ
      const lineTotal = lineSubtotal.minus(manualDiscount);

      subtotal = subtotal.plus(lineSubtotal);
      discountTotal = discountTotal.plus(manualDiscount);

      resolvedLines.push({
        testId: line.testId ?? null,
        packageId: line.packageId ?? null,
        description,
        quantity,
        basePrice,
        unitPrice,
        discountAmount: manualDiscount,
        taxAmount: new Decimal(0),
        lineTotal,
        manualDiscount: manualDiscount.greaterThan(0) ? manualDiscount : null,
        manualDiscountReason: line.manualDiscountReason ?? null,
      });
    }

    const taxTotal = new Decimal(0); // Tax not required for v1
    const grandTotal = subtotal.minus(discountTotal).plus(taxTotal);
    const invoiceNumber = generateInvoiceNumber();

    const invoice = await this.prisma.$transaction(async (tx) => {
      const inv = await tx.invoice.create({
        data: {
          tenantId,
          branchId,
          bookingId: dto.bookingId,
          companyId: dto.companyId ?? booking.companyId,
          status: InvoiceStatus.ISSUED,
          invoiceNumber,
          subtotal,
          discountTotal,
          taxTotal,
          grandTotal,
          amountPaid: new Decimal(0),
          amountDue: grandTotal,
          notes: dto.notes,
          issuedAt: new Date(),
          lines: {
            create: resolvedLines.map((l, idx) => ({
              testId: l.testId,
              packageId: l.packageId,
              description: l.description,
              quantity: l.quantity,
              basePrice: l.basePrice,
              unitPrice: l.unitPrice,
              discountAmount: l.discountAmount,
              taxAmount: l.taxAmount,
              lineTotal: l.lineTotal,
              manualDiscount: l.manualDiscount,
              manualDiscountReason: l.manualDiscountReason,
              sortOrder: idx,
            })),
          },
        },
        include: {
          lines: true,
          booking: { include: { patient: true } },
        },
      });

      // Mark booking as CONVERTED
      await tx.booking.update({
        where: { id: dto.bookingId },
        data: { status: BookingStatus.CONVERTED },
      });

      // Doctor share — calculated once per invoice, snapshotting the
      // doctor's rate/model at the time of billing so later rate changes
      // don't retroactively alter historical shares.
      if (booking.doctorId && booking.doctor?.isActive) {
        const doctor = booking.doctor;
        const testLineCount = resolvedLines.filter((l) => l.testId).length;

        let calculatedAmount = new Decimal(0);
        if (doctor.shareType === ShareType.PERCENTAGE) {
          calculatedAmount = grandTotal.mul(doctor.shareValue).div(100);
        } else if (doctor.shareType === ShareType.FIXED_AMOUNT) {
          calculatedAmount = new Decimal(doctor.shareValue);
        } else if (doctor.shareType === ShareType.PER_TEST_FIXED) {
          calculatedAmount = new Decimal(doctor.shareValue).mul(
            testLineCount || 1,
          );
        }

        if (calculatedAmount.greaterThan(0)) {
          await tx.doctorShare.create({
            data: {
              tenantId,
              doctorId: doctor.id,
              invoiceId: inv.id,
              status: ShareStatus.CALCULATED,
              shareType: doctor.shareType,
              rateOrAmount: doctor.shareValue,
              calculatedAmount,
            },
          });
        }
      }

      return inv;
    });

    // TODO: raise InvoiceIssued domain event (doctor share calculation is done above)
    return invoice;
  }

  /**
   * Record a payment against an invoice.
   * Updates amountPaid / amountDue and closes invoice when fully paid.
   */
  async recordPayment(tenantId: string, invoiceId: string, dto: RecordPaymentDto) {
    const invoice = await this.findInvoiceById(tenantId, invoiceId);

    if (
      invoice.status === InvoiceStatus.VOIDED ||
      invoice.status === InvoiceStatus.REFUNDED
    ) {
      throw new BadRequestException(
        `Cannot record payment on invoice in status ${invoice.status}`,
      );
    }

    if (invoice.status === InvoiceStatus.DRAFT) {
      throw new BadRequestException('Invoice must be issued before payment');
    }

    const amount = new Decimal(dto.amount);
    if (amount.greaterThan(invoice.amountDue)) {
      throw new BadRequestException(
        `Payment amount ${amount} exceeds amount due ${invoice.amountDue}`,
      );
    }

    const newAmountPaid = new Decimal(invoice.amountPaid).plus(amount);
    const newAmountDue = new Decimal(invoice.grandTotal).minus(newAmountPaid);
    const isFullyPaid = newAmountDue.lessThanOrEqualTo(0);

    const paymentStatus = isFullyPaid
      ? PaymentStatus.FULLY_RECEIVED
      : PaymentStatus.PARTIALLY_RECEIVED;

    const result = await this.prisma.$transaction(async (tx) => {
      const payment = await tx.payment.create({
        data: {
          invoiceId,
          amount,
          method: dto.method as PaymentMethod,
          status: paymentStatus,
          reference: dto.reference,
          notes: dto.notes,
          receivedAt: new Date(),
        },
      });

      const updatedInvoice = await tx.invoice.update({
        where: { id: invoiceId },
        data: {
          amountPaid: newAmountPaid,
          amountDue: newAmountDue.lessThan(0) ? new Decimal(0) : newAmountDue,
          status: isFullyPaid ? InvoiceStatus.CLOSED : invoice.status,
          closedAt: isFullyPaid ? new Date() : invoice.closedAt,
        },
        include: {
          lines: true,
          payments: true,
          booking: { include: { patient: true } },
        },
      });

      return { payment, invoice: updatedInvoice };
    });

    // TODO: raise PaymentReceived domain event
    return result;
  }
}

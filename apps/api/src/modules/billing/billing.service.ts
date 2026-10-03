import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Optional,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { BookingsService } from '../bookings/bookings.service';
import { CreateInvoiceDto } from './dto/create-invoice.dto';
import { RecordPaymentDto } from './dto/record-payment.dto';
import { FinancialAdjustmentDto, FinancialOperationDto, RefundDto } from './dto/financial-adjustment.dto';
import { financialState, lockInvoice, lockCashBranch, moneyAmount, operationHash, postingInstant, reconcileInvoice, reverseDoctorShares, cashShiftForActor } from './financial-state';
import { LaboratoryGateway } from '../laboratory/laboratory.gateway';
import {
  InvoiceStatus,
  PaymentStatus,
  PaymentMethod,
  BookingStatus,
  ShareType,
  ShareStatus,
  ReportStatus,
  Prisma,
  Decimal,
  materializeInvoiceClinicalWork,
} from '@lms/database';
import { generateReportNumber, generateTrackingId } from '../../common/id-generators.util';

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
    @Optional() private readonly live?: LaboratoryGateway,
  ) {}

  async findInvoiceById(tenantId: string, id: string) {
    const invoice = await this.prisma.invoice.findFirst({
      where: { id, tenantId },
      include: {
        lines: { include: { test: true, package: true }, orderBy: { createdAt: 'asc' } },
        payments: { orderBy: { receivedAt: 'asc' } },
        adjustments: { orderBy: { createdAt: 'asc' } },
        booking: { include: { patient: true, doctor: true } },
        company: true,
        report: true,
        samples: { select: { id: true, sampleCode: true, status: true } },
        visit: { include: { orderedTests: { include: { testVersion: { include: { versionParameters: { include: { referenceRanges:true,choices:true } } } } }, orderBy:{occurrenceNo:'asc'} } } },
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
        adjustments: true,
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
      await tx.$queryRaw`SELECT id FROM bookings WHERE id=${dto.bookingId} AND "tenantId"=${tenantId} FOR UPDATE`;
      const currentBooking = await tx.booking.findFirst({where:{id:dto.bookingId,tenantId,branchId}});
      if (!currentBooking || ![BookingStatus.CONFIRMED,BookingStatus.CHECKED_IN].includes(currentBooking.status as 'CONFIRMED'|'CHECKED_IN')) {
        throw new BadRequestException('Booking is not available for conversion in this branch');
      }
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

      // A trackingId must exist the moment the invoice is printed —
      // otherwise a patient has no way to look up their results until the
      // lab happens to finalize a test, which can be days later. Create
      // the Report row now, in PENDING status; laboratory.service.ts's
      // recomputeReportStatus() updates this same row as results come in.
      const visitId = await materializeInvoiceClinicalWork(tx,inv.id);
      const occurrenceCount = await tx.orderedTest.count({where:{visitId}});
      if (occurrenceCount > 0) {
        await tx.report.create({
          data: {
            tenantId,
            branchId,
            invoiceId: inv.id,
            visitId,
            status: ReportStatus.PENDING,
            reportNumber: generateReportNumber(),
            trackingId: generateTrackingId(),
          },
        });
      }

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

      return tx.invoice.findUniqueOrThrow({where:{id:inv.id},include:{lines:true,booking:{include:{patient:true}},report:true,
        visit:{include:{orderedTests:{orderBy:{occurrenceNo:'asc'},include:{testVersion:{include:{versionParameters:{include:{choices:true,referenceRanges:true}}}}}}}}}});
    });

    // TODO: raise InvoiceIssued domain event (doctor share calculation is done above)
    return invoice;
  }

  /**
   * Record a payment against an invoice.
   * Updates amountPaid / amountDue and closes invoice when fully paid.
   */
  async recordPayment(tenantId: string, invoiceId: string, dto: RecordPaymentDto, actorId: string) {
    const amount = moneyAmount(dto.amount);
    const hash = operationHash(dto.operationKey,[invoiceId,actorId,amount.toFixed(2),dto.method,dto.reference ?? null,dto.notes ?? null]);
    const result = await this.prisma.$transaction(async tx => {
      const invoice = await lockInvoice(tx,tenantId,invoiceId);
      const prior = await tx.payment.findUnique({where:{tenantId_operationKey:{tenantId,operationKey:dto.operationKey}}});
      if (prior) {
        if (prior.requestHash!==hash) throw new BadRequestException('Operation key was already used for another request');
        return {payment:prior,invoice:await tx.invoice.findUniqueOrThrow({where:{id:invoiceId},include:{lines:true,payments:true,adjustments:true,booking:{include:{patient:true}}}})};
      }
      if (invoice.status!=='ISSUED') throw new BadRequestException(`Cannot record payment on invoice in status ${invoice.status}`);
      const state = await financialState(tx,invoice);
      if (amount.gt(state.due)) throw new BadRequestException(`Payment amount ${amount} exceeds amount due ${state.due}`);
      if (dto.method==='CASH') await lockCashBranch(tx,tenantId,invoice.branchId);
      const cashShiftId = dto.method==='CASH' ? await cashShiftForActor(tx,tenantId,invoice.branchId,actorId) : null;
      const at = await postingInstant(tx);
      const payment = await tx.payment.create({data:{invoiceId,tenantId,recordedById:actorId,
        operationKey:dto.operationKey,requestHash:hash,postedAt:at,cashShiftId,amount,method:dto.method as PaymentMethod,
        status:amount.eq(state.due) ? PaymentStatus.FULLY_RECEIVED : PaymentStatus.PARTIALLY_RECEIVED,
        reference:dto.reference,notes:dto.notes,receivedAt:at}});
      const updated = await reconcileInvoice(tx,invoice,at);
      return {payment,invoice:updated};
    });
    this.live?.notifyInvoiceChanged(tenantId,invoiceId);
    return result;
  }

  async refund(tenantId:string, invoiceId:string, dto:RefundDto, actorId:string) {
    return this.postAdjustment(tenantId,invoiceId,'REFUND',dto,actorId,dto.relatedPaymentId);
  }

  async adjust(tenantId:string, invoiceId:string, dto:FinancialAdjustmentDto, actorId:string) {
    if (!['CHARGE','DISCOUNT','WRITE_OFF'].includes(dto.type)) throw new BadRequestException('Unsupported balance adjustment');
    return this.postAdjustment(tenantId,invoiceId,dto.type,dto,actorId);
  }

  async voidInvoice(tenantId:string, invoiceId:string, dto:FinancialOperationDto, actorId:string) {
    return this.postAdjustment(tenantId,invoiceId,'VOID',dto,actorId);
  }

  private async postAdjustment(tenantId:string, invoiceId:string,
    type:'CHARGE'|'DISCOUNT'|'WRITE_OFF'|'REFUND'|'VOID', dto:FinancialOperationDto & {amount?:number}, actorId:string, paymentId?:string) {
    const reason = dto.reason?.trim();
    if (!reason || reason.length>1000) throw new BadRequestException('A concise reason is required');
    const amount = type==='VOID' ? null : moneyAmount(dto.amount!);
    const hash = operationHash(dto.operationKey,[invoiceId,actorId,type,amount?.toFixed(2) ?? null,reason,paymentId ?? null]);
    const result = await this.prisma.$transaction(async tx => {
      const invoice = await lockInvoice(tx,tenantId,invoiceId);
      const prior = await tx.invoiceAdjustment.findUnique({where:{tenantId_operationKey:{tenantId,operationKey:dto.operationKey}}});
      if (prior) {
        if (prior.requestHash!==hash) throw new BadRequestException('Operation key was already used for another request');
        return {adjustment:prior,invoice:await tx.invoice.findUniqueOrThrow({where:{id:invoiceId},include:{lines:true,payments:true,adjustments:true,booking:{include:{patient:true}}}})};
      }
      if (invoice.status==='VOIDED' || invoice.status==='DRAFT' || (invoice.status==='REFUNDED' && type!=='VOID')) {
        throw new BadRequestException(`Cannot adjust invoice in status ${invoice.status}`);
      }
      const state = await financialState(tx,invoice);
      if (type==='VOID' && state.paid.gt(0)) throw new BadRequestException('Refund received funds before voiding this invoice');
      let cashShiftId:string|null = null;
      if (type==='REFUND') {
        const original = await tx.payment.findFirst({where:{id:paymentId,invoiceId,status:{in:['FULLY_RECEIVED','PARTIALLY_RECEIVED']}}});
        if (!original) throw new BadRequestException('Refund requires a received payment from this invoice');
        const refunded = await tx.invoiceAdjustment.aggregate({where:{invoiceId,type:'REFUND',relatedPaymentId:original.id},_sum:{amount:true}});
        if (amount!.gt(original.amount.minus(refunded._sum.amount ?? 0))) throw new BadRequestException('Refund exceeds the remaining received amount');
        if (original.method==='CASH') {
          await lockCashBranch(tx,tenantId,invoice.branchId);
          cashShiftId = await cashShiftForActor(tx,tenantId,invoice.branchId,actorId);
        }
      }
      const at = await postingInstant(tx);
      const adjustment = await tx.invoiceAdjustment.create({data:{tenantId,invoiceId,type,
        amount:amount ?? state.total,reason,createdById:actorId,createdAt:at,relatedPaymentId:paymentId,cashShiftId,
        operationKey:dto.operationKey,requestHash:hash}});
      const updated = await reconcileInvoice(tx,invoice,at);
      if (type==='VOID') await tx.invoice.update({where:{id:invoiceId},data:{voidReason:reason}});
      if (['REFUND','VOID','DISCOUNT','WRITE_OFF'].includes(type)) await reverseDoctorShares(tx,tenantId,invoiceId,at);
      return {adjustment,invoice:type==='VOID' ? {...updated,voidReason:reason} : updated};
    });
    this.live?.notifyInvoiceChanged(tenantId,invoiceId);
    return result;
  }
}

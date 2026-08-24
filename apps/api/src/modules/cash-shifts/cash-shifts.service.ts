import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CashShiftStatus } from '@lms/database';
import { CloseCashShiftDto } from './dto/close-cash-shift.dto';

@Injectable()
export class CashShiftsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Sum of CASH-method payments received in [from, to] — deliberately
   * narrower than analytics' getCashReceived (which sums every payment
   * method, despite its name). A shift reconciles what's physically in
   * the drawer, so only PaymentMethod.CASH belongs here; bank transfers
   * and mobile wallets never touch it.
   */
  private async sumCashReceived(tenantId: string, from: Date, to: Date) {
    const result = await this.prisma.payment.aggregate({
      where: {
        invoice: { tenantId },
        method: 'CASH',
        status: { in: ['FULLY_RECEIVED', 'PARTIALLY_RECEIVED'] },
        receivedAt: { gte: from, lte: to },
      },
      _sum: { amount: true },
    });
    return Number(result._sum.amount ?? 0);
  }

  /** The currently open shift for this tenant/branch, if any — plus a
   * live (not-yet-snapshotted) running total of cash received so far,
   * so the UI can show "expected so far" while the shift is still open. */
  async getCurrent(tenantId: string, branchId?: string) {
    const shift = await this.prisma.cashShift.findFirst({
      where: { tenantId, ...(branchId ? { branchId } : {}), status: CashShiftStatus.OPEN },
      include: { openedBy: { select: { id: true, fullName: true } } },
      orderBy: { openedAt: 'desc' },
    });
    if (!shift) return null;

    const expectedSoFar = await this.sumCashReceived(tenantId, shift.openedAt, new Date());
    return { ...shift, expectedSoFar };
  }

  /**
   * Opens a new shift. Rejects if one is already open for this
   * tenant/branch — a POS-standard rule: exactly one active drawer at a
   * time, so cash can never be double-counted or double-owned between
   * two overlapping shifts.
   */
  async open(tenantId: string, branchId: string | undefined, userId: string) {
    const existing = await this.prisma.cashShift.findFirst({
      where: { tenantId, ...(branchId ? { branchId } : {}), status: CashShiftStatus.OPEN },
    });
    if (existing) {
      throw new BadRequestException(
        'A cash shift is already open. Close it before opening a new one.',
      );
    }
    return this.prisma.cashShift.create({
      data: { tenantId, branchId, openedById: userId, status: CashShiftStatus.OPEN },
    });
  }

  /**
   * Closes a shift: snapshots expectedCash (CASH payments within the
   * shift's window, computed once, here — not live-recomputed after
   * close, so a closed shift's numbers stay fixed even if data changes
   * later), records what the cashier counted, and derives variance.
   */
  async close(tenantId: string, shiftId: string, userId: string, dto: CloseCashShiftDto) {
    const shift = await this.prisma.cashShift.findFirst({
      where: { id: shiftId, tenantId, status: CashShiftStatus.OPEN },
    });
    if (!shift) {
      throw new NotFoundException('Open shift not found');
    }

    const closedAt = new Date();
    const expectedCash = await this.sumCashReceived(tenantId, shift.openedAt, closedAt);
    const variance = dto.countedCash - expectedCash;

    return this.prisma.cashShift.update({
      where: { id: shift.id },
      data: {
        status: CashShiftStatus.CLOSED,
        closedById: userId,
        closedAt,
        expectedCash,
        countedCash: dto.countedCash,
        variance,
        notes: dto.notes,
      },
    });
  }

  /** Recent shift history — for reviewing past reconciliations/variances. */
  async list(tenantId: string, branchId?: string, limit = 50) {
    return this.prisma.cashShift.findMany({
      where: { tenantId, ...(branchId ? { branchId } : {}) },
      include: {
        openedBy: { select: { id: true, fullName: true } },
        closedBy: { select: { id: true, fullName: true } },
      },
      orderBy: { openedAt: 'desc' },
      take: limit,
    });
  }
}

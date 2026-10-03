import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { Decimal, Prisma } from '@lms/database';
import { CloseCashShiftDto } from './dto/close-cash-shift.dto';
import { lockCashBranch, postingInstant } from '../billing/financial-state';

@Injectable()
export class CashShiftsService {
  constructor(private readonly prisma: PrismaService) {}

  private async sumCash(tx:Prisma.TransactionClient | PrismaService, shift:{id:string;tenantId:string;branchId:string|null;openedById:string}) {
    const receipts = await tx.payment.aggregate({where:{cashShiftId:shift.id,tenantId:shift.tenantId,
      recordedById:shift.openedById,invoice:{branchId:shift.branchId ?? undefined},method:'CASH',
      status:{in:['FULLY_RECEIVED','PARTIALLY_RECEIVED']}},_sum:{amount:true}});
    const refunds = await tx.invoiceAdjustment.aggregate({where:{cashShiftId:shift.id,tenantId:shift.tenantId,
      createdById:shift.openedById,type:'REFUND',relatedPayment:{method:'CASH'},
      invoice:{branchId:shift.branchId ?? undefined}},_sum:{amount:true}});
    return new Decimal(receipts._sum.amount ?? 0).minus(refunds._sum.amount ?? 0);
  }

  async getCurrent(tenantId:string, branchId?:string) {
    const shift = await this.prisma.cashShift.findFirst({where:{tenantId,...(branchId ? {branchId} : {}),status:'OPEN'},
      include:{openedBy:{select:{id:true,fullName:true}}},orderBy:{openedAt:'desc'}});
    if (!shift) return null;
    return {...shift,expectedSoFar:await this.sumCash(this.prisma,shift)};
  }

  async open(tenantId:string, branchId:string|undefined, userId:string) {
    if (!branchId) throw new BadRequestException('A branch is required to open a cash shift');
    return this.prisma.$transaction(async tx=>{
      await lockCashBranch(tx,tenantId,branchId);
      const actor = await tx.user.findFirst({where:{id:userId,tenantId}});
      const branch = await tx.branch.findFirst({where:{id:branchId,tenantId}});
      if (!actor || !branch) throw new BadRequestException('Invalid cashier or branch');
      if (await tx.cashShift.findFirst({where:{tenantId,branchId,status:'OPEN'}})) {
        throw new BadRequestException('A cash shift is already open. Close it before opening a new one.');
      }
      return tx.cashShift.create({data:{tenantId,branchId,openedById:userId,openedAt:await postingInstant(tx),status:'OPEN'}});
    });
  }

  async close(tenantId:string, shiftId:string, userId:string, dto:CloseCashShiftDto) {
    return this.prisma.$transaction(async tx=>{
      const identity = await tx.cashShift.findFirst({where:{id:shiftId,tenantId}});
      if (!identity) throw new NotFoundException('Open shift not found');
      await lockCashBranch(tx,tenantId,identity.branchId);
      await tx.$queryRaw`SELECT id FROM public.cash_shifts WHERE id=${shiftId} FOR UPDATE`;
      const shift = await tx.cashShift.findFirst({where:{id:shiftId,tenantId,status:'OPEN'}});
      if (!shift) throw new NotFoundException('Open shift not found');
      if (shift.openedById!==userId) throw new BadRequestException('Only the opening cashier can reconcile this shift');
      const closedAt = await postingInstant(tx);
      const unknownLegacy = await tx.payment.count({where:{invoice:{tenantId,...(shift.branchId ? {branchId:shift.branchId} : {})},
        method:'CASH',status:{in:['FULLY_RECEIVED','PARTIALLY_RECEIVED']},recordedById:null,cashShiftId:null,
        OR:[{receivedAt:{gte:shift.openedAt,lte:closedAt}},{receivedAt:null}]}});
      if (unknownLegacy) throw new BadRequestException('This shift contains legacy cash without cashier attribution; reviewed reconciliation is required before closing');
      const expectedCash = await this.sumCash(tx,shift);
      const countedCash = new Decimal(dto.countedCash);
      if (!countedCash.isFinite() || countedCash.lt(0) || countedCash.decimalPlaces()>2) throw new BadRequestException('Invalid counted cash');
      return tx.cashShift.update({where:{id:shift.id},data:{status:'CLOSED',closedById:userId,
        closedAt,expectedCash,countedCash,variance:countedCash.minus(expectedCash),notes:dto.notes}});
    });
  }

  async list(tenantId:string, branchId?:string, limit=50) {
    return this.prisma.cashShift.findMany({where:{tenantId,...(branchId ? {branchId} : {})},
      include:{openedBy:{select:{id:true,fullName:true}},closedBy:{select:{id:true,fullName:true}}},
      orderBy:{openedAt:'desc'},take:limit});
  }
}

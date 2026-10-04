import { BadRequestException, NotFoundException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { Decimal, Prisma } from '@lms/database';
import { enqueueInvoicePublicReport } from '../public-sync/public-projection';

export function moneyAmount(value: number | string): Decimal {
  let amount: Decimal;
  try { amount = new Decimal(value); } catch { throw new BadRequestException('Invalid monetary amount'); }
  if (!amount.isFinite() || amount.lte(0) || amount.decimalPlaces() > 2 || amount.gt('9999999999.99')) {
    throw new BadRequestException('Amount must be positive with at most two decimal places');
  }
  return amount;
}

export function operationHash(key: string, payload: unknown) {
  if (!/^[a-zA-Z0-9_-]{8,100}$/.test(key ?? '')) throw new BadRequestException('A valid operationKey is required');
  return createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

export async function lockInvoice(tx: Prisma.TransactionClient, tenantId: string, invoiceId: string) {
  const rows = await tx.$queryRaw<{id:string}[]>`SELECT id FROM public.invoices
    WHERE id=${invoiceId} AND "tenantId"=${tenantId} FOR UPDATE`;
  if (!rows.length) throw new NotFoundException('Invoice not found');
  return tx.invoice.findUniqueOrThrow({ where: { id: invoiceId } });
}

// Receipts/refunds and shift close share this branch lock, so a close cannot
// snapshot cash while a previously started posting is still uncommitted.
export async function lockCashBranch(tx: Prisma.TransactionClient, tenantId: string, branchId?: string | null) {
  const key = JSON.stringify(['cash',tenantId,branchId ?? null]);
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key},0))::text`;
}

export async function postingInstant(tx: Prisma.TransactionClient) {
  const rows = await tx.$queryRaw<{at:Date}[]>`SELECT clock_timestamp() AS at`;
  return new Date(rows[0].at);
}

export async function cashShiftForActor(tx:Prisma.TransactionClient, tenantId:string, branchId:string, actorId:string) {
  const shift = await tx.cashShift.findFirst({where:{tenantId,branchId,openedById:actorId,status:'OPEN'}});
  return shift?.id ?? null; // No cashier identity is guessed for unassigned cash.
}

/** One formula for every financial mutation; the caller holds the invoice lock. */
export async function financialState(tx: Prisma.TransactionClient, invoice: {id:string; grandTotal:Decimal}) {
  const payments = await tx.payment.findMany({ where: { invoiceId: invoice.id,
    status: { in: ['FULLY_RECEIVED','PARTIALLY_RECEIVED'] } } });
  const adjustments = await tx.invoiceAdjustment.findMany({ where: { invoiceId: invoice.id } });
  let total = new Decimal(invoice.grandTotal), paid = new Decimal(0), refunded = new Decimal(0);
  for (const p of payments) paid = paid.plus(p.amount);
  for (const a of adjustments) {
    if (a.type === 'CHARGE') total = total.plus(a.amount);
    if (['DISCOUNT','WRITE_OFF','VOID'].includes(a.type)) total = total.minus(a.amount);
    if (a.type === 'REFUND') refunded = refunded.plus(a.amount);
  }
  const netPaid = paid.minus(refunded), due = total.minus(netPaid);
  if (total.lt(0) || netPaid.lt(0) || due.lt(0)) throw new BadRequestException('Movement would create a negative balance or overpayment');
  return { total, paid: netPaid, refunded, due, voided: adjustments.some(a=>a.type==='VOID') };
}

export async function reconcileInvoice(tx: Prisma.TransactionClient, invoice: {id:string; grandTotal:Decimal; status:string; closedAt:Date|null}, at:Date) {
  const state = await financialState(tx,invoice);
  const status = state.voided || invoice.status==='VOIDED' ? 'VOIDED' : invoice.status==='DRAFT' ? 'DRAFT' :
    state.refunded.gt(0) && state.paid.eq(0) ? 'REFUNDED' : state.due.eq(0) ? 'CLOSED' : 'ISSUED';
  const updated = await tx.invoice.update({ where:{id:invoice.id}, data:{amountPaid:state.paid,amountDue:state.due,status,
    closedAt:status==='CLOSED' ? invoice.closedAt ?? at : null,
    ...(state.voided ? {voidedAt:at} : {})},
    include:{lines:true,payments:true,adjustments:{orderBy:{createdAt:'asc'}},booking:{include:{patient:true}}} });
  await enqueueInvoicePublicReport(tx, invoice.id);
  return updated;
}

export async function reverseDoctorShares(tx: Prisma.TransactionClient, tenantId:string, invoiceId:string, at:Date) {
  // Conservative: any refund/credit suspends the entire original liability;
  // original rate/amount/payout evidence is retained for later reviewed settlement.
  await tx.doctorShare.updateMany({where:{tenantId,invoiceId,status:{in:['CALCULATED','PAYABLE']}},data:{status:'REVERSED',reversedAt:at}});
  await tx.doctorShare.updateMany({where:{tenantId,invoiceId,status:{in:['PAID','SETTLED']}},data:{status:'CLAWBACK_PENDING',clawbackAt:at}});
}

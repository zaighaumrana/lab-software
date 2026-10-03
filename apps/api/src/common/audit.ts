import { AsyncLocalStorage } from 'node:async_hooks';
import { Prisma } from '@lms/database';

type Context = { actorId?: string; tenantId?: string; sessionRecordId?: string; ipAddress?: string; userAgent?: string };
export const auditContext = new AsyncLocalStorage<Context>();

// Only explicitly selected, bounded metadata reaches audit storage. Never pass a domain row/DTO.
export async function appendAudit(tx: Prisma.TransactionClient, input: {
  tenantId: string; actorId?: string | null; action: string; entityType: string; entityId: string;
  before?: Record<string, unknown>; after?: Record<string, unknown>;
}) {
  const context = auditContext.getStore();
  function metadata(value: Record<string, unknown> | undefined) {
    if (!value) return undefined;
    const sanitized: Record<string, string | number | boolean | null> = {};
    for (const [key, item] of Object.entries(value).slice(0, 20)) {
      if (/password|token|credential|secret|api.?key|logo|pdf|valueNumeric|valueText|body/i.test(key)) continue;
      if (item === null || typeof item === 'number' || typeof item === 'boolean') sanitized[key] = item;
      else if (typeof item === 'string') sanitized[key] = item.slice(0, 1000);
    }
    return sanitized as Prisma.InputJsonObject;
  }
  const actorId = input.actorId === undefined ? (context?.tenantId === input.tenantId ? context.actorId : null) : input.actorId;
  return tx.auditLog.create({ data: {
    tenantId: input.tenantId, actorId, action: input.action, entityType: input.entityType, entityId: input.entityId,
    before: metadata(input.before), after: metadata({ ...input.after, ...(actorId ? {} : { actorContext: 'SYSTEM_OR_UNAUTHENTICATED' }) }),
    ipAddress: context?.ipAddress?.slice(0, 64), userAgent: context?.userAgent?.slice(0, 256),
  } });
}

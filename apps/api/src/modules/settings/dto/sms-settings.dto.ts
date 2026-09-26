import { IsString, IsOptional, IsBoolean, MaxLength } from 'class-validator';

export class SaveSmsTemplateDto {
  @IsString()
  @MaxLength(500)
  body!: string;

  @IsBoolean()
  isActive!: boolean;

  /** Approved SENDPK template_id to map this event to, or null/omitted to unmap. */
  @IsOptional()
  @IsString()
  @MaxLength(100)
  sendpkTemplateId?: string | null;
}

/**
 * API-owned, portable mirror of the SmsTemplate row shape.
 *
 * saveSmsTemplate() returns this instead of letting the Prisma
 * `smsTemplate.upsert(...)` result flow out as an inferred return type.
 * Declaration emission (`declaration: true`) needs a type it can *name* in
 * the generated .d.ts; a plain interface here is always nameable, whereas
 * the Prisma Client's generated payload type lives in a location that
 * isn't (TS2742). Structurally, this is exactly the SmsTemplate model —
 * nothing is dropped or renamed, so no mapping/casting is needed at the
 * call sites, only this explicit return-type annotation.
 */
export interface SmsTemplateRecord {
  id: string;
  tenantId: string;
  key: string;
  name: string;
  body: string;
  isActive: boolean;
  sendpkTemplateId: string | null;
  sendpkTemplateName: string | null;
  sendpkApprovedBody: string | null;
  /** Snapshot of the SENDPK template's required variable keys — stored as JSON, shape not contractual here. */
  sendpkRequiredVariables: unknown;
  sendpkLastSyncedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

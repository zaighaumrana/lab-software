import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../common/prisma/prisma.service';
import { NotificationStatus, Prisma } from '@lms/database';
import { SMS_GATEWAY, SmsGateway } from './providers/sms-gateway.interface';
import { appendAudit } from '../../common/audit';
import { SmsEventKey, getSmsEventDefinition, validatePlaceholders, renderLocalTemplate, buildSendPkVariables,
  calculateSmsSegments, normalizePakistaniMobile } from '@lms/shared';

export const MAX_NOTIFICATION_ATTEMPTS = 4;
export type SendOutcome =
  | { skipped: true; reason: 'NOT_CONFIGURED' | 'DISABLED' | 'ALREADY_SENT' | 'NOT_READY'; message?: string }
  | { skipped: false; notificationId: string };

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService, @Inject(SMS_GATEWAY) private readonly gateway: SmsGateway) {}

  /** Freeze and insert the intent using the caller's business transaction. No provider I/O. */
  async queueTemplatedSms(tx: Prisma.TransactionClient, tenantId: string, eventKey: SmsEventKey,
    recipient: string, variables: Record<string,string>, opts: { relatedType: string; relatedId: string; patientId?: string }): Promise<SendOutcome> {
    const definition = getSmsEventDefinition(eventKey);
    if (!definition) return {skipped:true,reason:'NOT_CONFIGURED'};
    await tx.$queryRaw`SELECT id FROM tenants WHERE id=${tenantId} FOR SHARE`;
    if (opts.patientId) {
      await tx.$queryRaw`SELECT id FROM patients WHERE id=${opts.patientId} AND "tenantId"=${tenantId} FOR SHARE`;
      const patient=await tx.patient.findFirst({where:{id:opts.patientId,tenantId}});
      if (!patient?.smsConsent) return {skipped:true,reason:'DISABLED'};
      recipient=patient.phone;
      variables={...variables,patientName:patient.fullName};
    }
    const template=await tx.smsTemplate.findUnique({where:{tenantId_key:{tenantId,key:eventKey}}});
    if (!template) return {skipped:true,reason:'NOT_CONFIGURED'};
    if (!template.isActive) return {skipped:true,reason:'DISABLED'};
    const validation=validatePlaceholders(template.body);
    const body=renderLocalTemplate(template.body,variables),segments=calculateSmsSegments(body);
    const providerVariables=buildSendPkVariables(template.body,variables);
    const required=Array.isArray(template.sendpkRequiredVariables)?template.sendpkRequiredVariables.map(String):[];
    const mobile=normalizePakistaniMobile(recipient);
    const errorCode=!validation.valid || validation.used.some(v=>!definition.variables.includes(v)) ? 'UNSUPPORTED_VARIABLES' :
      !template.sendpkTemplateId ? 'MISSING_TEMPLATE' : required.some(v=>!(v in providerVariables)) ? 'UNSUPPORTED_VARIABLES' :
      !mobile ? 'INVALID_RECIPIENT' : null;
    const status=errorCode?'FAILED':'QUEUED';
    const id=randomUUID();
    // ON CONFLICT does not poison the surrounding transaction on a duplicate event.
    const inserted=await tx.$queryRaw<{id:string}[]>`INSERT INTO notifications
      (id,"tenantId",channel,status,recipient,body,"templateKey","relatedType","relatedId",provider,
       "providerTemplateId","providerVariables","messageType","smsParts","patientId","nextAttemptAt","lastErrorCode","lastError","updatedAt")
      VALUES (${id},${tenantId},'SMS',${status}::"NotificationStatus",${mobile??recipient},${body},${eventKey},${opts.relatedType},${opts.relatedId},'SENDPK',
       ${template.sendpkTemplateId},${JSON.stringify(providerVariables)}::jsonb,${segments.type},${segments.parts},${opts.patientId??null},
       CASE WHEN ${errorCode}::text IS NULL THEN clock_timestamp() ELSE NULL END,${errorCode},${errorCode},clock_timestamp())
      ON CONFLICT ("tenantId","relatedType","relatedId","templateKey") DO NOTHING RETURNING id`;
    if (!inserted.length) return {skipped:true,reason:'ALREADY_SENT'};
    await appendAudit(tx,{tenantId,action:errorCode?'NOTIFICATION_FAILED':'NOTIFICATION_QUEUED',entityType:'Notification',entityId:id,
      after:{eventKey,relatedType:opts.relatedType,relatedId:opts.relatedId,status,errorCode}});
    return errorCode?{skipped:true,reason:'NOT_READY',message:errorCode}:{skipped:false,notificationId:id};
  }

  /** Compatibility entry point: durably queues only. Automatic callers use queueTemplatedSms inside their own tx. */
  async sendTemplatedSms(tenantId:string,eventKey:SmsEventKey,recipient:string,variables:Record<string,string>,opts:{relatedType:string;relatedId:string;patientId?:string}) {
    return this.prisma.$transaction(tx=>this.queueTemplatedSms(tx,tenantId,eventKey,recipient,variables,opts));
  }
  async listAbandoned(tenantId:string) {
    return this.prisma.notification.findMany({where:{tenantId,status:{in:['FAILED','ABANDONED','RECONCILIATION_REQUIRED']}},orderBy:{createdAt:'desc'},take:100,
      include:{attemptsHistory:{orderBy:{attemptNo:'asc'}}}});
  }
  async retry(notificationId:string,tenantId:string) {
    return this.prisma.$transaction(async tx=>{
      await tx.$queryRaw`SELECT id FROM notifications WHERE id=${notificationId} AND "tenantId"=${tenantId} FOR UPDATE`;
      const row=await tx.notification.findFirst({where:{id:notificationId,tenantId}});
      if (!row) throw new NotFoundException('Notification not found');
      if (!['FAILED','RETRYING','ABANDONED'].includes(row.status) || row.attempts>=MAX_NOTIFICATION_ATTEMPTS) throw new BadRequestException('Notification is not eligible for retry');
      if (!row.providerTemplateId || !normalizePakistaniMobile(row.recipient) || row.lastErrorCode==='UNSUPPORTED_VARIABLES') throw new BadRequestException('Frozen notification payload is not sendable');
      if (!this.gateway.isConfigured()) throw new BadRequestException('SMS provider is not configured');
      const updated=await tx.notification.update({where:{id:row.id},data:{status:NotificationStatus.RETRYING,nextAttemptAt:new Date(),lastError:null,lastErrorCode:null}});
      await appendAudit(tx,{tenantId,action:'NOTIFICATION_RETRY_REQUESTED',entityType:'Notification',entityId:row.id,after:{attempts:row.attempts}});
      return updated;
    });
  }
}

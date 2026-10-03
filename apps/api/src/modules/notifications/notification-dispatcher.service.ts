import { Inject, Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Notification, Prisma } from '@lms/database';
import { normalizePakistaniMobile } from '@lms/shared';
import { PrismaService } from '../../common/prisma/prisma.service';
import { appendAudit } from '../../common/audit';
import { SMS_GATEWAY, SmsGateway, SmsSendResult } from './providers/sms-gateway.interface';
import { MAX_NOTIFICATION_ATTEMPTS } from './notifications.service';

const LEASE_SECONDS=120;
const BATCH_SIZE=10;
const BACKOFF=[60_000,300_000,900_000];
const ERROR_CODES=new Set(['NETWORK_UNREACHABLE','NETWORK_TIMEOUT','NETWORK_UNCERTAIN','PROVIDER_REJECTED','INVALID_RECIPIENT',
  'MISSING_TEMPLATE','UNSUPPORTED_VARIABLES','PROVIDER_NOT_CONFIGURED','INSUFFICIENT_CREDIT','HTTP_REJECTION','RATE_LIMITED','UNKNOWN_RESPONSE']);
const clearLease={claimedAt:null,claimExpiresAt:null,claimedBy:null,dispatchStartedAt:null};
const safeId=(id:string|undefined)=>id && /^[a-zA-Z0-9_-]{1,128}$/.test(id)?id:null;

@Injectable()
export class NotificationDispatcher implements OnModuleInit,OnModuleDestroy {
  private timer?:ReturnType<typeof setInterval>;
  private running:Promise<void>|null=null;
  private stopping=false;
  constructor(private readonly prisma:PrismaService,@Inject(SMS_GATEWAY) private readonly gateway:SmsGateway) {}
  onModuleInit() {
    this.timer=setInterval(()=>void this.runOnce().catch(()=>Logger.warn('Notification dispatch cycle failed; durable work is retained','NotificationDispatcher')),10_000);
    this.timer.unref();
    void this.runOnce().catch(()=>Logger.warn('Notification startup recovery failed; durable work is retained','NotificationDispatcher'));
  }
  async onModuleDestroy() {this.stopping=true;if(this.timer)clearInterval(this.timer);await this.running;}
  async runOnce() {
    if(this.stopping)return;
    if(this.running)return this.running;
    this.running=this.cycle();
    try{await this.running;}finally{this.running=null;}
  }
  private async cycle() {
    await this.recoverExpired();
    for(let i=0;i<BATCH_SIZE&&!this.stopping;i++) {
      const claim=await this.claimDue();if(!claim)break;
      await this.dispatchClaim(claim.id,claim.owner);
    }
    if(this.gateway.checkDelivery)for(let i=0;i<3&&!this.stopping;i++)if(!await this.pollDelivery())break;
  }
  /** Public for deterministic fixture checks; ownership is a DB lease, never a process mutex. */
  async claimDue():Promise<{id:string;owner:string}|null> {
    const owner=randomUUID();
    return this.prisma.$transaction(async tx=>{
      const rows=await tx.$queryRaw<{id:string}[]>`SELECT id FROM notifications WHERE channel='SMS'
        AND status IN ('QUEUED','RETRYING') AND ("nextAttemptAt" IS NULL OR "nextAttemptAt"<=clock_timestamp())
        ORDER BY "nextAttemptAt" NULLS FIRST,"createdAt",id LIMIT 1 FOR UPDATE SKIP LOCKED`;
      if(!rows.length)return null;
      await tx.$executeRaw`UPDATE notifications SET status='SENDING',"claimedBy"=${owner},"claimedAt"=clock_timestamp(),
        "claimExpiresAt"=clock_timestamp()+make_interval(secs=>${LEASE_SECONDS}),"dispatchStartedAt"=NULL,"updatedAt"=clock_timestamp() WHERE id=${rows[0].id}`;
      return {id:rows[0].id,owner};
    });
  }
  async recoverExpired() {
    await this.prisma.$transaction(async tx=>{
      const rows=await tx.$queryRaw<Notification[]>`SELECT * FROM notifications WHERE status='SENDING'
        AND ("claimExpiresAt" IS NULL OR "claimExpiresAt"<=clock_timestamp())
        ORDER BY "claimExpiresAt" NULLS FIRST,"createdAt" LIMIT ${BATCH_SIZE} FOR UPDATE SKIP LOCKED`;
      for(const row of rows) {
        const ambiguous=!!row.dispatchStartedAt || !row.claimExpiresAt;
        const [{now}]=await tx.$queryRaw<{now:Date}[]>`SELECT clock_timestamp() AS now`;
        if(row.dispatchStartedAt)await tx.notificationAttempt.create({data:{tenantId:row.tenantId,notificationId:row.id,attemptNo:row.attempts,
          startedAt:row.dispatchStartedAt,completedAt:now,outcome:'UNKNOWN',errorCode:'LEASE_EXPIRED',errorMessage:'Dispatch lease expired after sending may have begun',providerResponse:'{"status":"UNKNOWN"}'}});
        await tx.notification.update({where:{id:row.id},data:{...clearLease,status:ambiguous?'RECONCILIATION_REQUIRED':'QUEUED',
          nextAttemptAt:ambiguous?null:now,lastErrorCode:ambiguous?'LEASE_EXPIRED':null,lastError:ambiguous?'Provider outcome requires reconciliation':null}});
        if(ambiguous)await appendAudit(tx,{tenantId:row.tenantId,actorId:null,action:'NOTIFICATION_RECONCILIATION_REQUIRED',entityType:'Notification',entityId:row.id,after:{reason:'LEASE_EXPIRED',legacyUncertain:!row.dispatchStartedAt}});
      }
    });
  }
  private async currentPatient(tx:Prisma.TransactionClient,row:Notification) {
    let patientId=row.patientId;
    if(!patientId&&row.relatedType==='Booking'&&row.relatedId)patientId=(await tx.booking.findFirst({where:{id:row.relatedId,tenantId:row.tenantId},select:{patientId:true}}))?.patientId??null;
    if(!patientId&&row.relatedType==='Report'&&row.relatedId)patientId=(await tx.invoice.findFirst({where:{id:row.relatedId,tenantId:row.tenantId},include:{booking:{select:{patientId:true}}}}))?.booking.patientId??null;
    if(!patientId)return null;
    await tx.$queryRaw`SELECT id FROM patients WHERE id=${patientId} AND "tenantId"=${row.tenantId} FOR SHARE`;
    return tx.patient.findFirst({where:{id:patientId,tenantId:row.tenantId},select:{smsConsent:true}});
  }
  private async beginDispatch(id:string,owner:string) {
    return this.prisma.$transaction(async tx=>{
      const rows=await tx.$queryRaw<{id:string}[]>`SELECT id FROM notifications WHERE id=${id} AND "claimedBy"=${owner}
        AND status='SENDING' AND "dispatchStartedAt" IS NULL AND "claimExpiresAt">clock_timestamp() FOR UPDATE`;
      if(!rows.length)return null;
      const row=await tx.notification.findUniqueOrThrow({where:{id}});
      const patient=await this.currentPatient(tx,row);
      const variables=row.providerVariables;
      const errorCode=!patient?'NO_PATIENT_CONTEXT':!patient.smsConsent?'CONSENT_WITHDRAWN':
        !normalizePakistaniMobile(row.recipient)?'INVALID_RECIPIENT':!row.providerTemplateId?'MISSING_TEMPLATE':
        !variables || typeof variables!=='object'||Array.isArray(variables)||Object.values(variables).some(v=>typeof v!=='string')?'UNSUPPORTED_VARIABLES':
        !this.gateway.isConfigured()?'PROVIDER_NOT_CONFIGURED':row.attempts>=MAX_NOTIFICATION_ATTEMPTS?'ATTEMPT_LIMIT':null;
      if(errorCode) {
        const status=['CONSENT_WITHDRAWN','NO_PATIENT_CONTEXT','ATTEMPT_LIMIT'].includes(errorCode)?'ABANDONED':'FAILED';
        await tx.notification.update({where:{id},data:{...clearLease,status,nextAttemptAt:null,lastErrorCode:errorCode,lastError:errorCode}});
        await appendAudit(tx,{tenantId:row.tenantId,actorId:null,action:status==='FAILED'?'NOTIFICATION_FAILED':'NOTIFICATION_ABANDONED',entityType:'Notification',entityId:id,after:{reason:errorCode}});
        return null;
      }
      // Commit the dispatch-start marker before I/O. An expired marked lease is uncertain, never blindly resent.
      const [{now}]=await tx.$queryRaw<{now:Date}[]>`SELECT clock_timestamp() AS now`;
      return tx.notification.update({where:{id},data:{attempts:{increment:1},dispatchStartedAt:now}});
    });
  }
  async dispatchClaim(id:string,owner:string) {
    const row=await this.beginDispatch(id,owner);if(!row)return;
    let result:SmsSendResult;
    try{result=await this.gateway.send({mobile:normalizePakistaniMobile(row.recipient)!,templateId:row.providerTemplateId!,
      variables:row.providerVariables as Record<string,string>,unicode:row.messageType==='unicode'});}
    catch{result={success:false,failureKind:'AMBIGUOUS',errorCode:'NETWORK_UNCERTAIN',rawResponse:''};}
    await this.prisma.$transaction(async tx=>{
      const owned=await tx.$queryRaw<{id:string}[]>`SELECT id FROM notifications WHERE id=${id} AND "claimedBy"=${owner} AND status='SENDING' FOR UPDATE`;
      if(!owned.length)return; // A recovered lease fences late completions.
      const [{now}]=await tx.$queryRaw<{now:Date}[]>`SELECT clock_timestamp() AS now`;
      const kind=result.failureKind??'AMBIGUOUS';
      const errorCode=result.success?null:ERROR_CODES.has(result.errorCode??'')?result.errorCode!:'UNKNOWN_RESPONSE';
      const providerMessageId=safeId(result.providerMessageId);
      const status=result.success?'SENT':kind==='AMBIGUOUS'?'RECONCILIATION_REQUIRED':kind==='PERMANENT'?'FAILED':row.attempts>=MAX_NOTIFICATION_ATTEMPTS?'ABANDONED':'RETRYING';
      const outcome=result.success?'ACCEPTED':kind==='AMBIGUOUS'?'UNKNOWN':kind==='PERMANENT'?'PERMANENT_FAILURE':'TRANSIENT_FAILURE';
      // Whitelist summary fields instead of saving arbitrary provider text, headers or echoed credentials.
      const providerStatus=result.success?'ACCEPTED':kind==='AMBIGUOUS'?'UNKNOWN':'REJECTED';
      const response=JSON.stringify({status:providerStatus,errorCode,providerMessageId}).slice(0,500);
      await tx.notificationAttempt.create({data:{tenantId:row.tenantId,notificationId:id,attemptNo:row.attempts,startedAt:row.dispatchStartedAt!,completedAt:now,
        outcome,providerMessageId,providerStatus,errorCode,errorMessage:errorCode,providerResponse:response}});
      await tx.notification.update({where:{id},data:{...clearLease,status,providerStatus,providerMessageId,lastErrorCode:errorCode,lastError:errorCode,
        lastProviderResponse:response,nextAttemptAt:status==='RETRYING'?new Date(now.getTime()+BACKOFF[Math.min(row.attempts-1,2)]):null,
        ...(result.success?{sentAt:now,acceptedAt:now}:{}),nextDeliveryCheckAt:providerMessageId&&this.gateway.checkDelivery&&['SENT','RECONCILIATION_REQUIRED'].includes(status)?new Date(now.getTime()+60_000):null}});
      if(status!=='RETRYING')await appendAudit(tx,{tenantId:row.tenantId,actorId:null,action:status==='SENT'?'NOTIFICATION_SENT':status==='RECONCILIATION_REQUIRED'?'NOTIFICATION_RECONCILIATION_REQUIRED':status==='FAILED'?'NOTIFICATION_FAILED':'NOTIFICATION_ABANDONED',entityType:'Notification',entityId:id,after:{attemptNo:row.attempts,outcome,errorCode}});
    });
  }
  private async pollDelivery():Promise<boolean> {
    const owner=randomUUID();
    const row=await this.prisma.$transaction(async tx=>{
      const rows=await tx.$queryRaw<{id:string}[]>`SELECT id FROM notifications WHERE status IN ('SENT','RECONCILIATION_REQUIRED')
        AND "providerMessageId" IS NOT NULL AND "nextDeliveryCheckAt"<=clock_timestamp() AND "deliveryChecks"<3
        AND ("claimExpiresAt" IS NULL OR "claimExpiresAt"<=clock_timestamp()) ORDER BY "nextDeliveryCheckAt",id LIMIT 1 FOR UPDATE SKIP LOCKED`;
      if(!rows.length)return null;
      const [{now}]=await tx.$queryRaw<{now:Date}[]>`SELECT clock_timestamp() AS now`;
      return tx.notification.update({where:{id:rows[0].id},data:{claimedBy:owner,claimedAt:now,claimExpiresAt:new Date(now.getTime()+LEASE_SECONDS*1000),deliveryChecks:{increment:1}}});
    });
    if(!row)return false;
    let providerStatus='UNKNOWN';
    try{const result=await this.gateway.checkDelivery!(row.providerMessageId!);if(['DELIVERED','FAILED','PENDING'].includes(result))providerStatus=result;}catch{ /* Lookup failure never causes a resend. */ }
    await this.prisma.$transaction(async tx=>{
      const owned=await tx.$queryRaw<{id:string}[]>`SELECT id FROM notifications WHERE id=${row.id} AND "claimedBy"=${owner} FOR UPDATE`;
      if(!owned.length)return;
      const [{now}]=await tx.$queryRaw<{now:Date}[]>`SELECT clock_timestamp() AS now`;
      await tx.notification.update({where:{id:row.id},data:{...clearLease,providerStatus,
        ...(providerStatus==='DELIVERED'?{status:'SENT',deliveredAt:now,acceptedAt:row.acceptedAt??now,sentAt:row.sentAt??now}:{}),
        nextDeliveryCheckAt:!['DELIVERED','FAILED'].includes(providerStatus)&&row.deliveryChecks<3?new Date(now.getTime()+BACKOFF[row.deliveryChecks]):null}});
      if(providerStatus==='DELIVERED')await appendAudit(tx,{tenantId:row.tenantId,actorId:null,action:'NOTIFICATION_DELIVERED',entityType:'Notification',entityId:row.id});
    });
    return true;
  }
}

import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
  BadRequestException,
  Inject,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CreateUserDto, UpdateUserDto } from './dto/create-user.dto';
import { BrandingDto, PrintLayoutDto } from './dto/branding.dto';
import { SaveSmsTemplateDto, SmsTemplateRecord, SmsProviderConfigDto } from './dto/sms-settings.dto';
import { getSmsProviderConfig, selectSmsGateway, SMS_PROVIDER_KEY, IMPLEMENTED_SMS_PROVIDERS } from '../notifications/sms-provider-config';
import { Role } from '@lms/database';
import * as bcrypt from 'bcrypt';
import { appendAudit } from '../../common/audit';
import { DiscountModeDto } from './dto/discount-mode.dto';
import {
  SMS_EVENT_DEFINITIONS,
  getSmsEventDefinition,
  validatePlaceholders,
  type SmsEventKey,
} from '@lms/shared';
import { SMS_GATEWAY, SmsGateway } from '../notifications/providers/sms-gateway.interface';

const KEY_BRANDING = 'branding';
const KEY_PRINT = 'print_layout';

const DEFAULT_BRANDING = {
  labName: 'LabCare Diagnostic Laboratory',
  primaryColor: '#2563eb',
  secondaryColor: '#0f172a',
  logoDataUrl: null as string | null,
};

const DEFAULT_PRINT = {
  labName: 'LabCare Diagnostic Laboratory',
  labNumber: '',
  address: '',
  phone: '0300-1234567',
  email: '',
  footerText:
    'This document is computer generated. Keep your tracking ID for future reference.',
  printMode: 'PLAIN' as 'PLAIN' | 'LETTERHEAD',
  marginTopMm: 14,
  marginBottomMm: 14,
  reportPagination: 'CONTINUOUS' as 'CONTINUOUS' | 'ONE_TEST_PER_PAGE',
};

@Injectable()
export class SettingsService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(SMS_GATEWAY) private readonly smsGateway: SmsGateway,
  ) {}

  private assertAdmin(role: string) {
    if (role !== 'ADMIN') {
      throw new ForbiddenException('Only ADMIN can change settings');
    }
  }

  // ----- Users -----

  async listUsers(tenantId: string) {
    return this.prisma.user.findMany({
      where: { tenantId },
      orderBy: { fullName: 'asc' },
      select: {
        id: true,
        username: true,
        fullName: true,
        role: true,
        email: true,
        isActive: true,
        lastLoginAt: true,
        createdAt: true,
        branchId: true,
      },
    });
  }

  async createUser(tenantId: string, actorRole: string, dto: CreateUserDto) {
    this.assertAdmin(actorRole);

    const existing = await this.prisma.user.findFirst({
      where: { tenantId, username: dto.username },
    });
    if (existing) {
      throw new ConflictException('Username already exists');
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);

    return this.prisma.$transaction(async tx => {
      if (dto.branchId && !await tx.branch.findFirst({where:{id:dto.branchId,tenantId,isActive:true}})) throw new BadRequestException('Branch not found');
      const user = await tx.user.create({data:{tenantId,username:dto.username.trim(),passwordHash,fullName:dto.fullName.trim(),
        role:dto.role as Role,email:dto.email,branchId:dto.branchId || null,isActive:true},
        select:{id:true,username:true,fullName:true,role:true,email:true,isActive:true,createdAt:true,branchId:true}});
      await appendAudit(tx,{tenantId,action:'USER_CREATE',entityType:'User',entityId:user.id,after:{role:user.role,branchId:user.branchId,isActive:true}});
      return user;
    });
  }

  async updateUser(tenantId: string, actorRole: string, userId: string, dto: UpdateUserDto) {
    this.assertAdmin(actorRole);
    const passwordHash = dto.password ? await bcrypt.hash(dto.password,10) : undefined;
    return this.prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM users WHERE id=${userId} AND "tenantId"=${tenantId} FOR UPDATE`;
      const user = await tx.user.findFirst({where:{id:userId,tenantId}});
      if (!user) throw new NotFoundException('User not found');
      if (dto.branchId && !await tx.branch.findFirst({where:{id:dto.branchId,tenantId,isActive:true}})) throw new BadRequestException('Branch not found');
      const updated = await tx.user.update({where:{id:userId},data:{
        ...(dto.fullName!==undefined?{fullName:dto.fullName.trim()}:{}),...(dto.email!==undefined?{email:dto.email}:{}),
        ...(dto.role!==undefined?{role:dto.role as Role}:{}),...(dto.branchId!==undefined?{branchId:dto.branchId || null}:{}),
        ...(dto.isActive!==undefined?{isActive:dto.isActive}:{}),...(passwordHash?{passwordHash}:{})},
        select:{id:true,username:true,fullName:true,role:true,email:true,isActive:true,lastLoginAt:true,branchId:true}});
      if (!updated.isActive || passwordHash) await tx.authSession.updateMany({where:{tenantId,userId,revokedAt:null},
        data:{revokedAt:new Date(),revocationReason:passwordHash?'ADMIN_PASSWORD_RESET':'USER_DEACTIVATE'}});
      const changes = [
        ['isActive',updated.isActive?'USER_REACTIVATE':'USER_DEACTIVATE'],['role','ROLE_CHANGE'],['branchId','BRANCH_ASSIGNMENT_CHANGE'],
      ] as const;
      for (const [field,action] of changes) if (user[field]!==updated[field]) await appendAudit(tx,{tenantId,action,entityType:'User',entityId:userId,
        before:{[field]:user[field]},after:{[field]:updated[field]}});
      if (passwordHash) await appendAudit(tx,{tenantId,action:'PASSWORD_CHANGE',entityType:'User',entityId:userId,after:{administrativeReset:true,allSessionsRevoked:true}});
      if (dto.fullName!==undefined || dto.email!==undefined) await appendAudit(tx,{tenantId,action:'USER_PROFILE_CHANGE',entityType:'User',entityId:userId,after:{profileUpdated:true}});
      return updated;
    });
  }

  // ----- Branding & print (public read for prints; admin write) -----

  async getBranding(tenantId: string) {
    const row = await this.prisma.configuration.findUnique({
      where: { tenantId_key: { tenantId, key: KEY_BRANDING } },
    });
    return { ...DEFAULT_BRANDING, ...((row?.value as object) || {}) };
  }

  async saveBranding(tenantId: string, actorRole: string, dto: BrandingDto) {
    this.assertAdmin(actorRole);

    if (dto.logoDataUrl && dto.logoDataUrl.length > 800_000) {
      throw new BadRequestException('Logo is too large. Use a smaller image (under ~500KB).');
    }

    const value = {
      labName: dto.labName.trim(),
      primaryColor: dto.primaryColor || DEFAULT_BRANDING.primaryColor,
      secondaryColor: dto.secondaryColor || DEFAULT_BRANDING.secondaryColor,
      logoDataUrl: dto.logoDataUrl ?? null,
    };

    await this.saveConfiguration(tenantId,KEY_BRANDING,value,true);

    return value;
  }

  async getPrintLayout(tenantId: string) {
    const row = await this.prisma.configuration.findUnique({
      where: { tenantId_key: { tenantId, key: KEY_PRINT } },
    });
    const branding = await this.getBranding(tenantId);
    const stored = (row?.value as object) || {};
    return {
      ...DEFAULT_PRINT,
      labName: branding.labName,
      ...stored,
    };
  }

  async savePrintLayout(tenantId: string, actorRole: string, dto: PrintLayoutDto) {
    this.assertAdmin(actorRole);

    const value = {
      labName: dto.labName.trim(),
      labNumber: dto.labNumber?.trim() || '',
      address: dto.address?.trim() || '',
      phone: dto.phone?.trim() || '',
      email: dto.email?.trim() || '',
      footerText: dto.footerText?.trim() || DEFAULT_PRINT.footerText,
      printMode: dto.printMode || DEFAULT_PRINT.printMode,
      marginTopMm: dto.marginTopMm ?? DEFAULT_PRINT.marginTopMm,
      marginBottomMm: dto.marginBottomMm ?? DEFAULT_PRINT.marginBottomMm,
      reportPagination: dto.reportPagination || DEFAULT_PRINT.reportPagination,
    };

    await this.saveConfiguration(tenantId,KEY_PRINT,value);

    return value;
  }

  /** Combined settings for UI + print headers */
  async getPublicSettings(tenantId: string) {
    const [branding, printLayout, discountMode, smsProvider] = await Promise.all([
      this.getBranding(tenantId),
      this.getPrintLayout(tenantId),
      this.getDiscountMode(tenantId),
      getSmsProviderConfig(this.prisma,tenantId),
    ]);
    return { branding, printLayout, discountMode, smsProvider };
  }

  private async saveConfiguration(tenantId:string,key:string,value:Record<string,unknown>,branding=false) {
    return this.prisma.$transaction(async tx=>{
      // Tenant lock also serializes invoice-mode reads when no configuration row exists yet.
      await tx.$queryRaw`SELECT id FROM tenants WHERE id=${tenantId} FOR UPDATE`;
      const before=await tx.configuration.findUnique({where:{tenantId_key:{tenantId,key}}});
      await tx.configuration.upsert({where:{tenantId_key:{tenantId,key}},create:{tenantId,key,value:value as never},update:{value:value as never}});
      if (branding) await tx.tenant.update({where:{id:tenantId},data:{name:String(value.labName)}});
      const changed=Object.keys(value).filter(k=>JSON.stringify((before?.value as Record<string,unknown> | undefined)?.[k])!==JSON.stringify(value[k]));
      if (changed.length) await appendAudit(tx,{tenantId,action:'SETTINGS_CHANGE',entityType:'Configuration',entityId:key,
        before:{configured:!!before},after:{changedFields:changed.join(','),...(key==='invoice_discount_mode'?{mode:value.mode}: {})}});
    });
  }
  async getDiscountMode(tenantId:string):Promise<'PER_LINE'|'INVOICE_LEVEL'> {
    const row=await this.prisma.configuration.findUnique({where:{tenantId_key:{tenantId,key:'invoice_discount_mode'}}});
    return (row?.value as {mode?:string}|null)?.mode==='INVOICE_LEVEL'?'INVOICE_LEVEL':'PER_LINE';
  }
  async saveDiscountMode(tenantId:string,actorRole:string,dto:DiscountModeDto) {
    this.assertAdmin(actorRole);
    if (!['PER_LINE','INVOICE_LEVEL'].includes(dto.mode)) throw new BadRequestException('Invalid discount mode');
    await this.saveConfiguration(tenantId,'invoice_discount_mode',{mode:dto.mode});
    return {mode:dto.mode};
  }
  async listAudit(tenantId:string,role:string,query:Record<string,string|undefined>) {
    this.assertAdmin(role);
    const page=Number(query.page??1),limit=Number(query.limit??50);
    if (!Number.isInteger(page)||page<1||page>10000||!Number.isInteger(limit)||limit<1||limit>100) throw new BadRequestException('Invalid audit pagination');
    const from=query.from?new Date(query.from):undefined,to=query.to?new Date(query.to):undefined;
    if ((from&&!Number.isFinite(from.getTime()))||(to&&!Number.isFinite(to.getTime()))||(from&&to&&from>to)) throw new BadRequestException('Invalid audit date range');
    const where={tenantId,...(query.entityType?{entityType:query.entityType}:{}),...(query.entityId?{entityId:query.entityId}:{}),
      ...(query.actorId?{actorId:query.actorId}:{}),...(query.action?{action:query.action}:{}),
      ...(from||to?{createdAt:{...(from?{gte:from}:{}),...(to?{lte:to}:{})}}:{})};
    const [items,total]=await this.prisma.$transaction([this.prisma.auditLog.findMany({where,orderBy:[{createdAt:'desc'},{id:'desc'}],skip:(page-1)*limit,take:limit}),this.prisma.auditLog.count({where})]);
    return {items,total,page,limit};
  }

  // ----- SMS / Notifications -----

  async saveSmsProvider(tenantId:string,actorRole:string,dto:SmsProviderConfigDto) {
    this.assertAdmin(actorRole);
    if(typeof dto.enabled!=='boolean'||!IMPLEMENTED_SMS_PROVIDERS.includes(dto.provider as 'SENDPK')) throw new BadRequestException('Unsupported SMS provider configuration');
    return this.prisma.$transaction(async tx=>{
      await tx.$queryRaw`SELECT id FROM tenants WHERE id=${tenantId} FOR UPDATE`;
      const before=await getSmsProviderConfig(tx,tenantId);
      const value={enabled:dto.enabled,provider:dto.provider};
      await tx.configuration.upsert({where:{tenantId_key:{tenantId,key:SMS_PROVIDER_KEY}},create:{tenantId,key:SMS_PROVIDER_KEY,value},update:{value}});
      if(!value.enabled) {
        // Cancel only work known not to have started I/O. Frozen history is retained.
        const cancelled=await tx.$queryRaw<{id:string}[]>`UPDATE notifications SET status='ABANDONED',"lastErrorCode"='PROVIDER_DISABLED',
          "lastError"='PROVIDER_DISABLED',"nextAttemptAt"=NULL,"claimedBy"=NULL,"claimedAt"=NULL,"claimExpiresAt"=NULL,"updatedAt"=clock_timestamp()
          WHERE "tenantId"=${tenantId} AND channel='SMS' AND (status IN ('QUEUED','RETRYING') OR
            (status='SENDING' AND "dispatchStartedAt" IS NULL AND "claimedBy" IS NOT NULL)) RETURNING id`;
        for(const row of cancelled)await appendAudit(tx,{tenantId,action:'NOTIFICATION_ABANDONED',entityType:'Notification',entityId:row.id,after:{reason:'PROVIDER_DISABLED'}});
      }
      if(before.enabled!==value.enabled||before.provider!==value.provider)await appendAudit(tx,{tenantId,action:'SETTINGS_CHANGE',entityType:'Configuration',entityId:SMS_PROVIDER_KEY,before:{enabled:before.enabled,provider:before.provider},after:value});
      return value;
    });
  }

  private async requireSmsProvider(tenantId:string) {
    const config=await getSmsProviderConfig(this.prisma,tenantId);
    const gateway=selectSmsGateway(config.provider,this.smsGateway);
    if(!config.enabled||!gateway)throw new BadRequestException('SMS provider is disabled or unavailable');
    return gateway;
  }

  /**
   * Everything the Settings → SMS screen needs: provider connection status
   * (never the API key itself), and both events' current configuration
   * merged with their static definitions (label/variables/example) from
   * @lms/shared so the frontend never has to hardcode either.
   */
  async getSmsSettings(tenantId: string) {
    const config=await getSmsProviderConfig(this.prisma,tenantId);
    const gateway=config.enabled?selectSmsGateway(config.provider,this.smsGateway):undefined;
    if(!gateway)return {provider:{name:config.provider,enabled:config.enabled,configured:false,sender:null,balance:null},events:[]};
    const rows = await this.prisma.smsTemplate.findMany({
      where: { tenantId, key: { in: SMS_EVENT_DEFINITIONS.map((d) => d.key) } },
    });
    const byKey = new Map(rows.map((r) => [r.key, r]));

    const events = SMS_EVENT_DEFINITIONS.map((def) => {
      const row = byKey.get(def.key);
      return {
        key: def.key,
        label: def.label,
        variables: def.variables,
        exampleBody: def.exampleBody,
        exampleValues: def.exampleValues,
        body: row?.body ?? def.exampleBody,
        isActive: row?.isActive ?? false,
        sendpkTemplateId: row?.sendpkTemplateId ?? null,
        sendpkTemplateName: row?.sendpkTemplateName ?? null,
        sendpkApprovedBody: row?.sendpkApprovedBody ?? null,
        sendpkRequiredVariables: Array.isArray(row?.sendpkRequiredVariables)
          ? (row!.sendpkRequiredVariables as unknown[]).map(String)
          : [],
        sendpkLastSyncedAt: row?.sendpkLastSyncedAt ?? null,
      };
    });

    return {
      provider: {
        name: config.provider,
        enabled: config.enabled,
        configured: gateway.isConfigured(),
        sender: gateway.isConfigured() ? gateway.getSenderId() : null,
        balance: await this.tryGetBalance(tenantId),
      },
      events,
    };
  }

  async saveSmsTemplate(
    tenantId: string,
    actorRole: string,
    key: string,
    dto: SaveSmsTemplateDto,
  ): Promise<SmsTemplateRecord> {
    this.assertAdmin(actorRole);

    const def = getSmsEventDefinition(key);
    if (!def) {
      throw new BadRequestException(`Unknown SMS event key: ${key}`);
    }

    const body = dto.body.trim();
    const validation = validatePlaceholders(body);
    if (!validation.valid) {
      throw new BadRequestException(
        `Unknown SMS variable: ${validation.unknown.join(', ')}`,
      );
    }
    const disallowed = validation.used.filter((v) => !def.variables.includes(v));
    if (disallowed.length > 0) {
      throw new BadRequestException(
        `Variable(s) not available for this event: ${disallowed.join(', ')}`,
      );
    }

    return this.prisma.$transaction(async tx=>{
      await tx.$queryRaw`SELECT id FROM tenants WHERE id=${tenantId} FOR UPDATE`;
      const provider=await getSmsProviderConfig(tx,tenantId);
      if(!provider.enabled||!selectSmsGateway(provider.provider,this.smsGateway))throw new BadRequestException('SMS provider is disabled or unavailable');
      const existing=await tx.smsTemplate.findUnique({where:{tenantId_key:{tenantId,key:key as SmsEventKey}}});
    // A SENDPK mapping is only meaningful for the exact wording it was
    // approved against — if the admin changes the body without also
    // re-selecting a template, keep the existing mapping (they may be
    // re-approving the same wording) but the "Not ready" status will
    // recompute from the fresh snapshot on next sync if it no longer fits.
    const data = {
      name: def.label,
      body,
      isActive: dto.isActive,
      sendpkTemplateId:
        dto.sendpkTemplateId !== undefined ? dto.sendpkTemplateId : (existing?.sendpkTemplateId ?? null),
    };

      const saved=await tx.smsTemplate.upsert({where:{tenantId_key:{tenantId,key:key as SmsEventKey}},create:{tenantId,key:key as SmsEventKey,...data},update:data});
      if (!existing || existing.body!==saved.body || existing.isActive!==saved.isActive || existing.sendpkTemplateId!==saved.sendpkTemplateId) await appendAudit(tx,{tenantId,action:'SETTINGS_CHANGE',entityType:'SmsTemplate',entityId:saved.id,
        after:{isActive:saved.isActive,templateMappingChanged:existing?.sendpkTemplateId!==saved.sendpkTemplateId,wordingChanged:existing?.body!==saved.body}});
      return saved;
    });
  }

  /**
   * "Sync SENDPK Templates" — lists the account's approved templates and
   * refreshes the snapshot (name/wording/required variables) for any event
   * already mapped to one of them. Returns the full list so the frontend
   * can populate/refresh the mapping dropdown for both events.
   */
  async syncSendPkTemplates(tenantId: string, actorRole: string) {
    this.assertAdmin(actorRole);
    const gateway=await this.requireSmsProvider(tenantId);
    if (!gateway.listTemplates) {
      throw new BadRequestException(
        'The configured SMS gateway does not support listing templates',
      );
    }
    const templates = await gateway.listTemplates();

    await this.prisma.$transaction(async tx=>{
    await tx.$queryRaw`SELECT id FROM tenants WHERE id=${tenantId} FOR UPDATE`;
    const provider=await getSmsProviderConfig(tx,tenantId);
    if(!provider.enabled||!selectSmsGateway(provider.provider,this.smsGateway))throw new BadRequestException('SMS provider is disabled or unavailable');
    const mapped = await tx.smsTemplate.findMany({where:{tenantId,sendpkTemplateId:{not:null}}});
    for (const row of mapped) {
      const match = templates.find((t) => t.id === row.sendpkTemplateId);
      if (match) {
        await tx.smsTemplate.update({
          where: { id: row.id },
          data: {
            sendpkTemplateName: match.name,
            sendpkApprovedBody: match.message,
            sendpkRequiredVariables: match.variables,
            sendpkLastSyncedAt: new Date(),
          },
        });
      }
    }

    if (mapped.length) await appendAudit(tx,{tenantId,action:'SETTINGS_CHANGE',entityType:'SmsTemplate',entityId:'PROVIDER_SYNC',after:{mappedTemplates:mapped.length}});
    });
    return templates;
  }

  private async tryGetBalance(tenantId:string): Promise<number | null> {
    const config=await getSmsProviderConfig(this.prisma,tenantId);
    const gateway=config.enabled?selectSmsGateway(config.provider,this.smsGateway):undefined;
    if (!gateway?.isConfigured() || !gateway.checkBalance) return null;
    try {
      return await gateway.checkBalance();
    } catch {
      return null;
    }
  }
}

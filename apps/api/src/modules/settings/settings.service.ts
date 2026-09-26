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
import { SaveSmsTemplateDto } from './dto/sms-settings.dto';
import { Role } from '@lms/database';
import * as bcrypt from 'bcrypt';
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

    return this.prisma.user.create({
      data: {
        tenantId,
        username: dto.username.trim(),
        passwordHash,
        fullName: dto.fullName.trim(),
        role: dto.role as Role,
        email: dto.email,
        branchId: dto.branchId || null,
        isActive: true,
      },
      select: {
        id: true,
        username: true,
        fullName: true,
        role: true,
        email: true,
        isActive: true,
        createdAt: true,
      },
    });
  }

  async updateUser(
    tenantId: string,
    actorRole: string,
    userId: string,
    dto: UpdateUserDto,
  ) {
    this.assertAdmin(actorRole);

    const user = await this.prisma.user.findFirst({
      where: { id: userId, tenantId },
    });
    if (!user) throw new NotFoundException('User not found');

    const data: Record<string, unknown> = {};
    if (dto.fullName !== undefined) data.fullName = dto.fullName.trim();
    if (dto.role !== undefined) data.role = dto.role as Role;
    if (dto.email !== undefined) data.email = dto.email;
    if (dto.isActive !== undefined) data.isActive = dto.isActive;
    if (dto.password) {
      data.passwordHash = await bcrypt.hash(dto.password, 10);
    }

    return this.prisma.user.update({
      where: { id: userId },
      data,
      select: {
        id: true,
        username: true,
        fullName: true,
        role: true,
        email: true,
        isActive: true,
        lastLoginAt: true,
      },
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

    await this.prisma.configuration.upsert({
      where: { tenantId_key: { tenantId, key: KEY_BRANDING } },
      create: { tenantId, key: KEY_BRANDING, value },
      update: { value },
    });

    // Keep tenant display name in sync
    await this.prisma.tenant.update({
      where: { id: tenantId },
      data: { name: value.labName },
    });

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

    await this.prisma.configuration.upsert({
      where: { tenantId_key: { tenantId, key: KEY_PRINT } },
      create: { tenantId, key: KEY_PRINT, value },
      update: { value },
    });

    return value;
  }

  /** Combined settings for UI + print headers */
  async getPublicSettings(tenantId: string) {
    const [branding, printLayout] = await Promise.all([
      this.getBranding(tenantId),
      this.getPrintLayout(tenantId),
    ]);
    return { branding, printLayout };
  }

  // ----- SMS / Notifications -----

  /**
   * Everything the Settings → SMS screen needs: provider connection status
   * (never the API key itself), and both events' current configuration
   * merged with their static definitions (label/variables/example) from
   * @lms/shared so the frontend never has to hardcode either.
   */
  async getSmsSettings(tenantId: string) {
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
        name: 'SENDPK',
        configured: this.smsGateway.isConfigured(),
        sender: this.smsGateway.isConfigured() ? this.smsGateway.getSenderId() : null,
        balance: await this.tryGetBalance(),
      },
      events,
    };
  }

  async saveSmsTemplate(
    tenantId: string,
    actorRole: string,
    key: string,
    dto: SaveSmsTemplateDto,
  ) {
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

    const existing = await this.prisma.smsTemplate.findUnique({
      where: { tenantId_key: { tenantId, key: key as SmsEventKey } },
    });

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

    return this.prisma.smsTemplate.upsert({
      where: { tenantId_key: { tenantId, key: key as SmsEventKey } },
      create: { tenantId, key: key as SmsEventKey, ...data },
      update: data,
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

    if (!this.smsGateway.listTemplates) {
      throw new BadRequestException(
        'The configured SMS gateway does not support listing templates',
      );
    }
    const templates = await this.smsGateway.listTemplates();

    const mapped = await this.prisma.smsTemplate.findMany({
      where: { tenantId, sendpkTemplateId: { not: null } },
    });
    for (const row of mapped) {
      const match = templates.find((t) => t.id === row.sendpkTemplateId);
      if (match) {
        await this.prisma.smsTemplate.update({
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

    return templates;
  }

  private async tryGetBalance(): Promise<number | null> {
    if (!this.smsGateway.isConfigured() || !this.smsGateway.checkBalance) return null;
    try {
      return await this.smsGateway.checkBalance();
    } catch {
      return null;
    }
  }
}

import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CreateUserDto, UpdateUserDto } from './dto/create-user.dto';
import { BrandingDto, PrintLayoutDto } from './dto/branding.dto';
import { Role } from '@lms/database';
import * as bcrypt from 'bcrypt';

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
};

@Injectable()
export class SettingsService {
  constructor(private readonly prisma: PrismaService) {}

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
}

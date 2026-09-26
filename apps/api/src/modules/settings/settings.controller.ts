import {
  Controller,
  Get,
  Post,
  Patch,
  Put,
  Body,
  Param,
  Headers,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import { SettingsService } from './settings.service';
import { CreateUserDto, UpdateUserDto } from './dto/create-user.dto';
import { BrandingDto, PrintLayoutDto } from './dto/branding.dto';
import { SaveSmsTemplateDto } from './dto/sms-settings.dto';
import { SessionGuard } from '../../common/guards/session.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { Permission } from '../../common/auth/permissions';
import { CurrentUser, AuthUser } from '../../common/decorators/current-user.decorator';

function resolveTenantId(header?: string): string {
  return header || process.env.DEFAULT_TENANT_ID || 'default-tenant';
}

/**
 * Unlike the other controllers fixed alongside this one, this file
 * wasn't a real vulnerability — every route except getSettings already
 * had its own hand-rolled requireSession() check, equivalent in effect
 * to SessionGuard (both ultimately call AuthService's session
 * validation). Replaced here for consistency with the rest of the
 * codebase's pattern (see catalog.controller.ts), not because it was
 * unprotected. Now additionally carries explicit permissions
 * (USER_MANAGE / SETTINGS_MANAGE — both ADMIN-only; LAB_OPERATOR has
 * neither) rather than just "any authenticated user," per
 * docs/12_RBAC_and_Operator_Dashboard.md.
 *
 * `getSettings` is deliberately left unguarded and unchanged — the app
 * loads it before login (SettingsContext wraps the whole app, including
 * the login screen, to show the lab's branding/logo pre-authentication),
 * so it can't require a session. It only ever returns non-sensitive
 * branding/print-layout display config, never patient or business data.
 */
@Controller('settings')
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  /** GET /settings — branding + print layout. Intentionally public — see class comment. */
  @Get()
  async getSettings(@Headers('x-tenant-id') tenantHeader?: string) {
    const tenantId = resolveTenantId(tenantHeader);
    return this.settingsService.getPublicSettings(tenantId);
  }

  @Get('users')
  @UseGuards(SessionGuard, PermissionGuard)
  @RequirePermissions(Permission.USER_MANAGE)
  async listUsers(@CurrentUser() user: AuthUser) {
    return this.settingsService.listUsers(user.tenantId);
  }

  @Post('users')
  @UseGuards(SessionGuard, PermissionGuard)
  @RequirePermissions(Permission.USER_MANAGE)
  @HttpCode(HttpStatus.CREATED)
  async createUser(@CurrentUser() user: AuthUser, @Body() dto: CreateUserDto) {
    return this.settingsService.createUser(user.tenantId, user.role, dto);
  }

  @Patch('users/:id')
  @UseGuards(SessionGuard, PermissionGuard)
  @RequirePermissions(Permission.USER_MANAGE)
  async updateUser(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateUserDto,
  ) {
    return this.settingsService.updateUser(user.tenantId, user.role, id, dto);
  }

  @Put('branding')
  @UseGuards(SessionGuard, PermissionGuard)
  @RequirePermissions(Permission.SETTINGS_MANAGE)
  async saveBranding(@CurrentUser() user: AuthUser, @Body() dto: BrandingDto) {
    return this.settingsService.saveBranding(user.tenantId, user.role, dto);
  }

  @Put('print-layout')
  @UseGuards(SessionGuard, PermissionGuard)
  @RequirePermissions(Permission.SETTINGS_MANAGE)
  async savePrintLayout(@CurrentUser() user: AuthUser, @Body() dto: PrintLayoutDto) {
    return this.settingsService.savePrintLayout(user.tenantId, user.role, dto);
  }

  @Get('sms')
  @UseGuards(SessionGuard, PermissionGuard)
  @RequirePermissions(Permission.SETTINGS_MANAGE)
  async getSmsSettings(@CurrentUser() user: AuthUser) {
    return this.settingsService.getSmsSettings(user.tenantId);
  }

  @Put('sms/:key')
  @UseGuards(SessionGuard, PermissionGuard)
  @RequirePermissions(Permission.SETTINGS_MANAGE)
  async saveSmsTemplate(
    @CurrentUser() user: AuthUser,
    @Param('key') key: string,
    @Body() dto: SaveSmsTemplateDto,
  ) {
    return this.settingsService.saveSmsTemplate(user.tenantId, user.role, key, dto);
  }

  @Post('sms/sync')
  @UseGuards(SessionGuard, PermissionGuard)
  @RequirePermissions(Permission.SETTINGS_MANAGE)
  async syncSmsTemplates(@CurrentUser() user: AuthUser) {
    return this.settingsService.syncSendPkTemplates(user.tenantId, user.role);
  }
}

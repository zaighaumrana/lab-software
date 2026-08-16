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
import { SessionGuard } from '../../common/guards/session.guard';
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
 * unprotected.
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
  @UseGuards(SessionGuard)
  async listUsers(@CurrentUser() user: AuthUser) {
    return this.settingsService.listUsers(user.tenantId);
  }

  @Post('users')
  @UseGuards(SessionGuard)
  @HttpCode(HttpStatus.CREATED)
  async createUser(@CurrentUser() user: AuthUser, @Body() dto: CreateUserDto) {
    return this.settingsService.createUser(user.tenantId, user.role, dto);
  }

  @Patch('users/:id')
  @UseGuards(SessionGuard)
  async updateUser(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateUserDto,
  ) {
    return this.settingsService.updateUser(user.tenantId, user.role, id, dto);
  }

  @Put('branding')
  @UseGuards(SessionGuard)
  async saveBranding(@CurrentUser() user: AuthUser, @Body() dto: BrandingDto) {
    return this.settingsService.saveBranding(user.tenantId, user.role, dto);
  }

  @Put('print-layout')
  @UseGuards(SessionGuard)
  async savePrintLayout(@CurrentUser() user: AuthUser, @Body() dto: PrintLayoutDto) {
    return this.settingsService.savePrintLayout(user.tenantId, user.role, dto);
  }
}

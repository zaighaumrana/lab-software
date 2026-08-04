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
  UnauthorizedException,
} from '@nestjs/common';
import { SettingsService } from './settings.service';
import { CreateUserDto, UpdateUserDto } from './dto/create-user.dto';
import { BrandingDto, PrintLayoutDto } from './dto/branding.dto';
import { AuthService } from '../auth/auth.service';

function resolveTenantId(header?: string): string {
  return header || process.env.DEFAULT_TENANT_ID || 'default-tenant';
}

@Controller('settings')
export class SettingsController {
  constructor(
    private readonly settingsService: SettingsService,
    private readonly authService: AuthService,
  ) {}

  private requireSession(authHeader?: string) {
    if (!authHeader?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing session');
    }
    return this.authService.getSession(authHeader.slice(7));
  }

  /** GET /settings — branding + print layout */
  @Get()
  async getSettings(@Headers('x-tenant-id') tenantHeader?: string) {
    const tenantId = resolveTenantId(tenantHeader);
    return this.settingsService.getPublicSettings(tenantId);
  }

  @Get('users')
  async listUsers(@Headers('authorization') auth?: string) {
    const session = this.requireSession(auth);
    return this.settingsService.listUsers(session.tenantId);
  }

  @Post('users')
  @HttpCode(HttpStatus.CREATED)
  async createUser(
    @Body() dto: CreateUserDto,
    @Headers('authorization') auth?: string,
  ) {
    const session = this.requireSession(auth);
    return this.settingsService.createUser(session.tenantId, session.role, dto);
  }

  @Patch('users/:id')
  async updateUser(
    @Param('id') id: string,
    @Body() dto: UpdateUserDto,
    @Headers('authorization') auth?: string,
  ) {
    const session = this.requireSession(auth);
    return this.settingsService.updateUser(session.tenantId, session.role, id, dto);
  }

  @Put('branding')
  async saveBranding(
    @Body() dto: BrandingDto,
    @Headers('authorization') auth?: string,
  ) {
    const session = this.requireSession(auth);
    return this.settingsService.saveBranding(session.tenantId, session.role, dto);
  }

  @Put('print-layout')
  async savePrintLayout(
    @Body() dto: PrintLayoutDto,
    @Headers('authorization') auth?: string,
  ) {
    const session = this.requireSession(auth);
    return this.settingsService.savePrintLayout(session.tenantId, session.role, dto);
  }
}

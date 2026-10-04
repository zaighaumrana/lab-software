import { Body, Controller, Get, Post, Put, UseGuards } from '@nestjs/common';
import { IsBoolean, IsInt, IsOptional, IsString, Matches, Max, Min } from 'class-validator';
import { SessionGuard } from '../../common/guards/session.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { CurrentUser, AuthUser } from '../../common/decorators/current-user.decorator';
import { Permission } from '../../common/auth/permissions';
import { PublicSyncService } from './public-sync.service';

class EnablePublicSyncDto { @IsBoolean() enabled!: boolean; }
class BootstrapPublicSyncDto {
  @IsOptional() @IsInt() @Min(1) @Max(50) limit?: number;
  @IsOptional() @IsString() @Matches(/^[A-Za-z0-9_-]{1,128}$/) afterId?: string;
}
@Controller('public-sync')
@UseGuards(SessionGuard, PermissionGuard)
@RequirePermissions(Permission.SETTINGS_MANAGE)
export class PublicSyncController {
  constructor(private readonly service: PublicSyncService) {}
  @Get('status') status(@CurrentUser() user: AuthUser) { return this.service.status(user.tenantId, user.role); }
  @Put('configuration') configure(@CurrentUser() user: AuthUser, @Body() body: EnablePublicSyncDto) {
    return this.service.configure(user.tenantId, user.role, user.userId, body.enabled);
  }
  @Post('bootstrap') bootstrap(@CurrentUser() user: AuthUser, @Body() body: BootstrapPublicSyncDto) {
    return this.service.bootstrap(user.tenantId, user.role, user.userId, body.limit, body.afterId);
  }
}

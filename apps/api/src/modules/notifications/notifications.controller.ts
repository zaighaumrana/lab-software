import { Controller, Get, Post, Param, UseGuards } from '@nestjs/common';
import { SessionGuard } from '../../common/guards/session.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { Permission } from '../../common/auth/permissions';
import { CurrentUser, AuthUser } from '../../common/decorators/current-user.decorator';
import { NotificationsService } from './notifications.service';

@Controller('notifications')
@UseGuards(SessionGuard, PermissionGuard)
@RequirePermissions(Permission.SETTINGS_MANAGE)
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}
  @Get('abandoned')
  list(@CurrentUser() user: AuthUser) { return this.notifications.listAbandoned(user.tenantId); }
  @Post(':id/retry')
  retry(@CurrentUser() user: AuthUser, @Param('id') id: string) { return this.notifications.retry(id, user.tenantId); }
}

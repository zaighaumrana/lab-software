import { Controller, Get, Post, Patch, Body, Param, UseGuards } from '@nestjs/common';
import { CashShiftsService } from './cash-shifts.service';
import { CloseCashShiftDto } from './dto/close-cash-shift.dto';
import { SessionGuard } from '../../common/guards/session.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { Permission } from '../../common/auth/permissions';
import { CurrentUser, AuthUser } from '../../common/decorators/current-user.decorator';

function resolveBranchId(user: AuthUser): string | undefined {
  return user.branchId ?? undefined;
}

@Controller('cash-shifts')
@UseGuards(SessionGuard, PermissionGuard)
@RequirePermissions(Permission.CASH_SHIFT_MANAGE)
export class CashShiftsController {
  constructor(private readonly cashShiftsService: CashShiftsService) {}

  @Get('current')
  async getCurrent(@CurrentUser() user: AuthUser) {
    return this.cashShiftsService.getCurrent(user.tenantId, resolveBranchId(user));
  }

  @Get()
  async list(@CurrentUser() user: AuthUser) {
    return this.cashShiftsService.list(user.tenantId, resolveBranchId(user));
  }

  @Post('open')
  async open(@CurrentUser() user: AuthUser) {
    return this.cashShiftsService.open(user.tenantId, resolveBranchId(user), user.userId);
  }

  @Patch(':id/close')
  async close(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: CloseCashShiftDto,
  ) {
    return this.cashShiftsService.close(user.tenantId, id, user.userId, dto);
  }
}

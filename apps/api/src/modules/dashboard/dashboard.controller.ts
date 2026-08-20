import { Controller, Get, UseGuards } from '@nestjs/common';
import { DashboardService } from './dashboard.service';
import { SessionGuard } from '../../common/guards/session.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { Permission } from '../../common/auth/permissions';
import { CurrentUser, AuthUser } from '../../common/decorators/current-user.decorator';

/**
 * A dedicated, new endpoint for the operator dashboard — deliberately
 * not a route on AnalyticsController (see analytics.controller.ts and
 * dashboard.service.ts for why). DASHBOARD_OPERATOR_VIEW is granted to
 * both ADMIN (via the superuser bypass) and LAB_OPERATOR, so either role
 * can load this if the frontend routes them here, but the existing
 * Admin Dashboard (backed by /analytics/dashboard/*) remains the
 * primary surface for ADMIN — see docs/12_RBAC_and_Operator_Dashboard.md.
 */
@Controller('dashboard')
@UseGuards(SessionGuard, PermissionGuard)
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('operator')
  @RequirePermissions(Permission.DASHBOARD_OPERATOR_VIEW)
  async getOperatorDashboard(@CurrentUser() user: AuthUser) {
    return this.dashboardService.getOperatorDashboard(user.tenantId);
  }
}

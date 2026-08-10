import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { AnalyticsService } from './analytics.service';
import { SessionGuard } from '../../common/guards/session.guard';
import { CurrentUser, AuthUser } from '../../common/decorators/current-user.decorator';

function parseRange(from?: string, to?: string) {
  const range: { from?: Date; to?: Date } = {};
  if (from) range.from = new Date(from);
  if (to) {
    const toDate = new Date(to);
    toDate.setHours(23, 59, 59, 999); // inclusive end-of-day
    range.to = toDate;
  }
  return range;
}

@Controller('analytics')
@UseGuards(SessionGuard)
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  /** Registry — lets the frontend discover available widgets without a
   * hardcoded list, and lets future dashboards reuse the same metrics. */
  @Get('widgets')
  listWidgets() {
    return this.analyticsService.listWidgets();
  }

  /** Single-metric lookup — the general-purpose route every future widget
   * (and any future report/export) should go through. */
  @Get('widgets/:widgetId')
  async getWidget(
    @CurrentUser() user: AuthUser,
    @Param('widgetId') widgetId: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.analyticsService.getWidget(widgetId, user.tenantId, parseRange(from, to));
  }

  /** Bulk endpoints so a dashboard page loads in one round trip instead of
   * one request per card. */
  @Get('dashboard/financial-overview')
  async financialOverview(
    @CurrentUser() user: AuthUser,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.analyticsService.getFinancialOverview(user.tenantId, parseRange(from, to));
  }

  @Get('dashboard/operational')
  async operational(
    @CurrentUser() user: AuthUser,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.analyticsService.getOperationalOverview(user.tenantId, parseRange(from, to));
  }

  @Get('dashboard/doctor-share')
  async doctorShare(
    @CurrentUser() user: AuthUser,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.analyticsService.getDoctorShareOverview(user.tenantId, parseRange(from, to));
  }

  @Get('dashboard/test-analytics')
  async testAnalytics(
    @CurrentUser() user: AuthUser,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.analyticsService.getTestAnalyticsOverview(user.tenantId, parseRange(from, to));
  }

  @Get('dashboard/business-insights')
  async businessInsights(
    @CurrentUser() user: AuthUser,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.analyticsService.getBusinessInsightsOverview(user.tenantId, parseRange(from, to));
  }

  @Get('dashboard/outsourcing')
  async outsourcing(
    @CurrentUser() user: AuthUser,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.analyticsService.getOutsourcingOverview(user.tenantId, parseRange(from, to));
  }
}

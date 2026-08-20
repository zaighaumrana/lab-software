import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ReportingService } from './reporting.service';
import { canDeliverReport, isReportFinalized } from '../../common/report-eligibility.util';
import { SessionGuard } from '../../common/guards/session.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { Permission } from '../../common/auth/permissions';
import { CurrentUser, AuthUser } from '../../common/decorators/current-user.decorator';

function resolveBranchId(user: AuthUser): string {
  return user.branchId || process.env.DEFAULT_BRANCH_ID || 'default-branch';
}

/**
 * Staff-facing report listing/preview — only called from apps/web
 * (verified: not referenced from apps/website, which has its own
 * separate, intentionally-public `/public/reports/*` routes in
 * public.controller.ts). Requires a valid session, and every route
 * declares the exact permission it needs (PermissionGuard denies by
 * default if a route has no @RequirePermissions). LAB_OPERATOR has full
 * REPORT_VIEW — finding/checking a report's status to complete the
 * delivery workflow is core operational work.
 */
@Controller('reports')
@UseGuards(SessionGuard, PermissionGuard)
export class ReportingController {
  constructor(private readonly reportingService: ReportingService) {}

  /**
   * GET /reports?q=&status=
   * Must be declared before :id routes.
   */
  @Get()
  @RequirePermissions(Permission.REPORT_VIEW)
  async list(
    @CurrentUser() user: AuthUser,
    @Query('q') q?: string,
    @Query('status') status?: string,
  ) {
    return this.reportingService.list(user.tenantId, resolveBranchId(user), q, status);
  }

  /**
   * GET /reports/tracking/:trackingId
   */
  @Get('tracking/:trackingId')
  @RequirePermissions(Permission.REPORT_VIEW)
  async findByTrackingId(@CurrentUser() user: AuthUser, @Param('trackingId') trackingId: string) {
    return this.reportingService.findByTrackingId(user.tenantId, trackingId);
  }

  /**
   * GET /reports/:id
   *
   * Front-desk report preview. Per the delivery rule, actual result values
   * are only included once the report is finalized AND the invoice is
   * fully paid — this is the server enforcing that, not just the frontend
   * choosing not to render a button. When not deliverable, the caller
   * still gets patient/status context (so front desk can say "ready,
   * payment pending") but never the values themselves.
   */
  @Get(':id')
  @RequirePermissions(Permission.REPORT_VIEW)
  async findOne(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    const report = await this.reportingService.findById(user.tenantId, id);
    const finalized = isReportFinalized(report);
    const deliverable = canDeliverReport(report, report.invoice);

    if (deliverable) {
      return { ...report, finalized, deliverable };
    }

    // Strip actual result values — only status/payment context goes out.
    return {
      ...report,
      finalized,
      deliverable,
      invoice: {
        ...report.invoice,
        samples: (report.invoice.samples ?? []).map((s) => ({
          ...s,
          results: [],
        })),
      },
    };
  }
}

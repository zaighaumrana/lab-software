import { Controller, Get, Param, ParseIntPipe, Query, UseGuards } from '@nestjs/common';
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
 * Internal LabFlow report listing/preview for the staff application.
 * Requires a valid session, and every route
 * declares the exact permission it needs (PermissionGuard denies by
 * default if a route has no @RequirePermissions). LAB_OPERATOR has full
 * REPORT_VIEW - finding/checking a report's status to complete the
 * delivery workflow is core operational work.
 */
@Controller('reports')
@UseGuards(SessionGuard, PermissionGuard)
export class ReportingController {
  constructor(private readonly reportingService: ReportingService) {}

  /**
   * GET /reports?q=&status=&unprinted=true
   * Must be declared before :id routes. `unprinted=true` is what backs
   * the operator's default "today's active queue" view (see
   * ReportsPage.tsx) - deliberately ignored server-side whenever `q` is
   * also present, so a search always searches everything, print status
   * included, for the "need to reprint an old one" case.
   */
  @Get()
  @RequirePermissions(Permission.REPORT_VIEW)
  async list(
    @CurrentUser() user: AuthUser,
    @Query('q') q?: string,
    @Query('status') status?: string,
    @Query('unprinted') unprinted?: string,
  ) {
    return this.reportingService.list(
      user.tenantId,
      resolveBranchId(user),
      q,
      status,
      unprinted === 'true',
    );
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
   * fully paid - this is the server enforcing that, not just the frontend
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

    // Strip actual result values - only status/payment context goes out.
    return {
      ...report,
      currentVersion: report.currentVersion ? { ...report.currentVersion, memberships: [] } : null,
      selectedVersion: report.selectedVersion ? { ...report.selectedVersion, memberships: [] } : null,
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

  @Get(':id/versions')
  @RequirePermissions(Permission.REPORT_VIEW)
  async versions(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.reportingService.listVersions(user.tenantId, id);
  }

  @Get(':id/versions/:versionNo')
  @RequirePermissions(Permission.REPORT_VIEW)
  async version(@CurrentUser() user: AuthUser, @Param('id') id: string,
    @Param('versionNo', ParseIntPipe) versionNo: number) {
    const report = await this.reportingService.findVersion(user.tenantId, id, versionNo);
    const deliverable = canDeliverReport(report, report.invoice);
    return deliverable ? { ...report, finalized: true, deliverable } : {
      ...report, finalized: true, deliverable,
      currentVersion: report.currentVersion ? { ...report.currentVersion, memberships: [] } : null,
      selectedVersion: { ...report.selectedVersion, memberships: [] },
      invoice: { ...report.invoice, samples: report.invoice.samples.map(s => ({ ...s, results: [] })) },
    };
  }
}

import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ReportingService } from './reporting.service';
import { canDeliverReport, isReportFinalized } from '../../common/report-eligibility.util';
import { SessionGuard } from '../../common/guards/session.guard';
import { CurrentUser, AuthUser } from '../../common/decorators/current-user.decorator';

function resolveBranchId(user: AuthUser): string {
  return user.branchId || process.env.DEFAULT_BRANCH_ID || 'default-branch';
}

/**
 * Staff-facing report listing/preview — only called from apps/web
 * (verified: not referenced from apps/website, which has its own
 * separate, intentionally-public `/public/reports/*` routes in
 * public.controller.ts). This one requires a valid session (see
 * catalog.controller.ts for the same pattern) since it's staff tooling,
 * not the public lookup surface. Previously unguarded: tenantId came
 * from a client-supplied `x-tenant-id` header, meaning any request that
 * could reach the API could list or view any patient's report with no
 * login at all. tenantId now comes from the verified session
 * (@CurrentUser()) instead of trusting whatever the client claims.
 */
@Controller('reports')
@UseGuards(SessionGuard)
export class ReportingController {
  constructor(private readonly reportingService: ReportingService) {}

  /**
   * GET /reports?q=&status=
   * Must be declared before :id routes.
   */
  @Get()
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

import { Controller, Get, Param, Query, Headers } from '@nestjs/common';
import { ReportingService } from './reporting.service';
import { canDeliverReport, isReportFinalized } from '../../common/report-eligibility.util';

function resolveTenantId(header?: string): string {
  return header || process.env.DEFAULT_TENANT_ID || 'default-tenant';
}

function resolveBranchId(header?: string): string {
  return header || process.env.DEFAULT_BRANCH_ID || 'default-branch';
}

@Controller('reports')
export class ReportingController {
  constructor(private readonly reportingService: ReportingService) {}

  /**
   * GET /reports?q=&status=
   * Must be declared before :id routes.
   */
  @Get()
  async list(
    @Query('q') q?: string,
    @Query('status') status?: string,
    @Headers('x-tenant-id') tenantHeader?: string,
    @Headers('x-branch-id') branchHeader?: string,
  ) {
    const tenantId = resolveTenantId(tenantHeader);
    const branchId = resolveBranchId(branchHeader);
    return this.reportingService.list(tenantId, branchId, q, status);
  }

  /**
   * GET /reports/tracking/:trackingId
   */
  @Get('tracking/:trackingId')
  async findByTrackingId(
    @Param('trackingId') trackingId: string,
    @Headers('x-tenant-id') tenantHeader?: string,
  ) {
    const tenantId = resolveTenantId(tenantHeader);
    return this.reportingService.findByTrackingId(tenantId, trackingId);
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
  async findOne(
    @Param('id') id: string,
    @Headers('x-tenant-id') tenantHeader?: string,
  ) {
    const tenantId = resolveTenantId(tenantHeader);
    const report = await this.reportingService.findById(tenantId, id);
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

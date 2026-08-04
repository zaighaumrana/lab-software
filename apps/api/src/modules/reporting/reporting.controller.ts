import { Controller, Get, Param, Query, Headers } from '@nestjs/common';
import { ReportingService } from './reporting.service';

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
   * GET /reports?q=
   * Must be declared before :id routes.
   */
  @Get()
  async list(
    @Query('q') q?: string,
    @Headers('x-tenant-id') tenantHeader?: string,
    @Headers('x-branch-id') branchHeader?: string,
  ) {
    const tenantId = resolveTenantId(tenantHeader);
    const branchId = resolveBranchId(branchHeader);
    return this.reportingService.list(tenantId, branchId, q);
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
   */
  @Get(':id')
  async findOne(
    @Param('id') id: string,
    @Headers('x-tenant-id') tenantHeader?: string,
  ) {
    const tenantId = resolveTenantId(tenantHeader);
    return this.reportingService.findById(tenantId, id);
  }
}

import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Headers,
  Query,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { LaboratoryService } from './laboratory.service';
import { CollectSampleDto } from './dto/collect-sample.dto';
import { AcceptSampleDto, RejectSampleDto } from './dto/sample-action.dto';
import { OutsourceSampleDto } from './dto/outsource-sample.dto';
import { EnterResultDto } from './dto/enter-result.dto';
import { AmendResultDto } from './dto/amend-result.dto';

function resolveTenantId(header?: string): string {
  return header || process.env.DEFAULT_TENANT_ID || 'default-tenant';
}

function resolveBranchId(header?: string): string {
  return header || process.env.DEFAULT_BRANCH_ID || 'default-branch';
}

@Controller('laboratory')
export class LaboratoryController {
  constructor(private readonly laboratoryService: LaboratoryService) {}

  // ----- Samples -----

  /**
   * GET /laboratory/samples/pending
   */
  @Get('samples/pending')
  async listPending(
    @Headers('x-tenant-id') tenantHeader?: string,
    @Headers('x-branch-id') branchHeader?: string,
  ) {
    const tenantId = resolveTenantId(tenantHeader);
    const branchId = resolveBranchId(branchHeader);
    return this.laboratoryService.listPendingSamples(tenantId, branchId);
  }

  /**
   * GET /laboratory/samples/:id
   */
  @Get('samples/:id')
  async getSample(
    @Param('id') id: string,
    @Headers('x-tenant-id') tenantHeader?: string,
  ) {
    const tenantId = resolveTenantId(tenantHeader);
    return this.laboratoryService.getSample(tenantId, id);
  }

  /**
   * POST /laboratory/samples
   * Collect a sample against an invoice.
   */
  @Post('samples')
  @HttpCode(HttpStatus.CREATED)
  async collectSample(
    @Body() dto: CollectSampleDto,
    @Headers('x-tenant-id') tenantHeader?: string,
    @Headers('x-branch-id') branchHeader?: string,
  ) {
    const tenantId = resolveTenantId(tenantHeader);
    const branchId = resolveBranchId(branchHeader);
    return this.laboratoryService.collectSample(tenantId, branchId, dto);
  }

  /**
   * PATCH /laboratory/samples/:id/receive
   */
  @Patch('samples/:id/receive')
  async receiveSample(
    @Param('id') id: string,
    @Headers('x-tenant-id') tenantHeader?: string,
  ) {
    const tenantId = resolveTenantId(tenantHeader);
    return this.laboratoryService.receiveSample(tenantId, id);
  }

  /**
   * PATCH /laboratory/samples/:id/accept
   */
  @Patch('samples/:id/accept')
  async acceptSample(
    @Param('id') id: string,
    @Body() dto: AcceptSampleDto,
    @Headers('x-tenant-id') tenantHeader?: string,
  ) {
    const tenantId = resolveTenantId(tenantHeader);
    return this.laboratoryService.acceptSample(tenantId, id, dto.notes);
  }

  /**
   * PATCH /laboratory/samples/:id/reject
   */
  @Patch('samples/:id/reject')
  async rejectSample(
    @Param('id') id: string,
    @Body() dto: RejectSampleDto,
    @Headers('x-tenant-id') tenantHeader?: string,
  ) {
    const tenantId = resolveTenantId(tenantHeader);
    return this.laboratoryService.rejectSample(tenantId, id, dto.rejectionReason);
  }

  /**
   * PATCH /laboratory/samples/:id/start-testing
   */
  @Patch('samples/:id/start-testing')
  async startTesting(
    @Param('id') id: string,
    @Headers('x-tenant-id') tenantHeader?: string,
  ) {
    const tenantId = resolveTenantId(tenantHeader);
    return this.laboratoryService.startTesting(tenantId, id);
  }

  /**
   * PATCH /laboratory/samples/:id/outsource
   */
  @Patch('samples/:id/outsource')
  async outsourceSample(
    @Param('id') id: string,
    @Body() dto: OutsourceSampleDto,
    @Headers('x-tenant-id') tenantHeader?: string,
  ) {
    const tenantId = resolveTenantId(tenantHeader);
    return this.laboratoryService.markOutsourced(
      tenantId,
      id,
      dto.externalLabName,
      dto.outsourcingCost,
    );
  }

  /**
   * PATCH /laboratory/samples/:id/un-outsource
   */
  @Patch('samples/:id/un-outsource')
  async unOutsourceSample(
    @Param('id') id: string,
    @Headers('x-tenant-id') tenantHeader?: string,
  ) {
    const tenantId = resolveTenantId(tenantHeader);
    return this.laboratoryService.unmarkOutsourced(tenantId, id);
  }

  // ----- Results -----

  /**
   * POST /laboratory/results
   * Enter (and optionally release) a result.
   */
  @Post('results')
  @HttpCode(HttpStatus.CREATED)
  async enterResult(
    @Body() dto: EnterResultDto,
    @Headers('x-tenant-id') tenantHeader?: string,
  ) {
    const tenantId = resolveTenantId(tenantHeader);
    return this.laboratoryService.enterResult(tenantId, dto);
  }

  /**
   * PATCH /laboratory/results/:id/finalize
   * Explicit finalization: ENTERED → RELEASED.
   */
  @Patch('results/:id/finalize')
  async finalizeResult(
    @Param('id') id: string,
    @Headers('x-tenant-id') tenantHeader?: string,
    @Headers('x-user-id') userHeader?: string,
  ) {
    const tenantId = resolveTenantId(tenantHeader);
    return this.laboratoryService.finalizeResult(tenantId, id, userHeader);
  }

  /**
   * PATCH /laboratory/results/:id/reopen
   * Explicit, authorized un-finalize: RELEASED → ENTERED. Requires a reason.
   */
  @Patch('results/:id/reopen')
  async reopenResult(
    @Param('id') id: string,
    @Body() dto: { reason: string },
    @Headers('x-tenant-id') tenantHeader?: string,
    @Headers('x-user-id') userHeader?: string,
  ) {
    const tenantId = resolveTenantId(tenantHeader);
    return this.laboratoryService.reopenResult(tenantId, id, dto?.reason, userHeader);
  }

  /**
   * POST /laboratory/results/:id/amend
   * Create a new versioned result; original becomes SUPERSEDED.
   */
  @Post('results/:id/amend')
  @HttpCode(HttpStatus.CREATED)
  async amendResult(
    @Param('id') id: string,
    @Body() dto: AmendResultDto,
    @Headers('x-tenant-id') tenantHeader?: string,
  ) {
    const tenantId = resolveTenantId(tenantHeader);
    return this.laboratoryService.amendResult(tenantId, id, dto);
  }
}

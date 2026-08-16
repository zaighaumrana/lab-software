import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import { LaboratoryService } from './laboratory.service';
import { CollectSampleDto } from './dto/collect-sample.dto';
import { AcceptSampleDto, RejectSampleDto } from './dto/sample-action.dto';
import { OutsourceSampleDto } from './dto/outsource-sample.dto';
import { EnterResultDto } from './dto/enter-result.dto';
import { AmendResultDto } from './dto/amend-result.dto';
import { SessionGuard } from '../../common/guards/session.guard';
import { CurrentUser, AuthUser } from '../../common/decorators/current-user.decorator';

function resolveBranchId(user: AuthUser): string {
  return user.branchId || process.env.DEFAULT_BRANCH_ID || 'default-branch';
}

/**
 * Every route here mutates or reads actual clinical/result data, so this
 * whole controller requires a valid session (see catalog.controller.ts
 * for the same pattern). Previously this controller had no guard at
 * all — tenantId came from a client-supplied `x-tenant-id` header with a
 * hardcoded fallback, meaning any request that could reach the API could
 * enter, finalize, or reopen results with no login whatsoever. tenantId
 * and the acting user's identity now come from the verified session
 * (@CurrentUser()) instead of trusting whatever the client claims.
 */
@Controller('laboratory')
@UseGuards(SessionGuard)
export class LaboratoryController {
  constructor(private readonly laboratoryService: LaboratoryService) {}

  // ----- Samples -----

  /**
   * GET /laboratory/samples/pending
   */
  @Get('samples/pending')
  async listPending(@CurrentUser() user: AuthUser) {
    return this.laboratoryService.listPendingSamples(user.tenantId, resolveBranchId(user));
  }

  /**
   * GET /laboratory/samples/:id
   */
  @Get('samples/:id')
  async getSample(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.laboratoryService.getSample(user.tenantId, id);
  }

  /**
   * POST /laboratory/samples
   * Collect a sample against an invoice.
   */
  @Post('samples')
  @HttpCode(HttpStatus.CREATED)
  async collectSample(@CurrentUser() user: AuthUser, @Body() dto: CollectSampleDto) {
    return this.laboratoryService.collectSample(user.tenantId, resolveBranchId(user), dto);
  }

  /**
   * PATCH /laboratory/samples/:id/receive
   */
  @Patch('samples/:id/receive')
  async receiveSample(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.laboratoryService.receiveSample(user.tenantId, id);
  }

  /**
   * PATCH /laboratory/samples/:id/accept
   */
  @Patch('samples/:id/accept')
  async acceptSample(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: AcceptSampleDto,
  ) {
    return this.laboratoryService.acceptSample(user.tenantId, id, dto.notes);
  }

  /**
   * PATCH /laboratory/samples/:id/reject
   */
  @Patch('samples/:id/reject')
  async rejectSample(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: RejectSampleDto,
  ) {
    return this.laboratoryService.rejectSample(user.tenantId, id, dto.rejectionReason);
  }

  /**
   * PATCH /laboratory/samples/:id/start-testing
   */
  @Patch('samples/:id/start-testing')
  async startTesting(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.laboratoryService.startTesting(user.tenantId, id);
  }

  /**
   * PATCH /laboratory/samples/:id/outsource
   */
  @Patch('samples/:id/outsource')
  async outsourceSample(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: OutsourceSampleDto,
  ) {
    return this.laboratoryService.markOutsourced(
      user.tenantId,
      id,
      dto.externalLabName,
      dto.outsourcingCost,
    );
  }

  /**
   * PATCH /laboratory/samples/:id/un-outsource
   */
  @Patch('samples/:id/un-outsource')
  async unOutsourceSample(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.laboratoryService.unmarkOutsourced(user.tenantId, id);
  }

  /**
   * PATCH /laboratory/invoices/:invoiceId/ready-for-collection
   * Invoice-level (whole patient report) action — releases every
   * entered-but-not-finalized result across ALL samples on the invoice
   * in one action, then recomputes the invoice's overall report status.
   * Rejects (400) if any test anywhere on the invoice is still missing
   * a result.
   */
  @Patch('invoices/:invoiceId/ready-for-collection')
  async markInvoiceReady(@CurrentUser() user: AuthUser, @Param('invoiceId') invoiceId: string) {
    return this.laboratoryService.markInvoiceReady(user.tenantId, invoiceId, user.userId);
  }

  // ----- Results -----

  /**
   * POST /laboratory/results
   * Enter (and optionally release) a result.
   */
  @Post('results')
  @HttpCode(HttpStatus.CREATED)
  async enterResult(@CurrentUser() user: AuthUser, @Body() dto: EnterResultDto) {
    return this.laboratoryService.enterResult(user.tenantId, dto, user.userId);
  }

  /**
   * PATCH /laboratory/results/:id/finalize
   * Explicit finalization: ENTERED → RELEASED.
   */
  @Patch('results/:id/finalize')
  async finalizeResult(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.laboratoryService.finalizeResult(user.tenantId, id, user.userId);
  }

  /**
   * PATCH /laboratory/results/:id/reopen
   * Explicit, authorized un-finalize: RELEASED → ENTERED. Requires a reason.
   */
  @Patch('results/:id/reopen')
  async reopenResult(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: { reason: string },
  ) {
    return this.laboratoryService.reopenResult(user.tenantId, id, dto?.reason, user.userId);
  }

  /**
   * POST /laboratory/results/:id/amend
   * Create a new versioned result; original becomes SUPERSEDED.
   */
  @Post('results/:id/amend')
  @HttpCode(HttpStatus.CREATED)
  async amendResult(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: AmendResultDto,
  ) {
    return this.laboratoryService.amendResult(user.tenantId, id, dto);
  }
}

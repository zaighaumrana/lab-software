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
import { PermissionGuard } from '../../common/guards/permission.guard';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { Permission } from '../../common/auth/permissions';
import { CurrentUser, AuthUser } from '../../common/decorators/current-user.decorator';

function resolveBranchId(user: AuthUser): string {
  return user.branchId || process.env.DEFAULT_BRANCH_ID || 'default-branch';
}

/**
 * Every route here mutates or reads actual clinical/result data, so this
 * whole controller requires a valid session (see catalog.controller.ts
 * for the same pattern), and every individual route additionally
 * declares the exact permission it needs (PermissionGuard denies by
 * default if a route has no @RequirePermissions — see that guard's
 * comment). LAB_OPERATOR has the full operational set (view/manage
 * samples, enter/finalize results) per docs/12_RBAC_and_Operator_Dashboard.md;
 * ADMIN has everything via superuser bypass.
 */
@Controller('laboratory')
@UseGuards(SessionGuard, PermissionGuard)
export class LaboratoryController {
  constructor(private readonly laboratoryService: LaboratoryService) {}

  // ----- Samples -----

  /**
   * GET /laboratory/samples/pending
   */
  @Get('samples/pending')
  @RequirePermissions(Permission.LAB_SAMPLE_VIEW)
  async listPending(@CurrentUser() user: AuthUser) {
    return this.laboratoryService.listPendingSamples(user.tenantId, resolveBranchId(user));
  }

  /**
   * GET /laboratory/samples/:id
   */
  @Get('samples/:id')
  @RequirePermissions(Permission.LAB_SAMPLE_VIEW)
  async getSample(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.laboratoryService.getSample(user.tenantId, id);
  }

  /**
   * POST /laboratory/samples
   * Collect a sample against an invoice.
   */
  @Post('samples')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions(Permission.LAB_SAMPLE_MANAGE)
  async collectSample(@CurrentUser() user: AuthUser, @Body() dto: CollectSampleDto) {
    return this.laboratoryService.collectSample(user.tenantId, resolveBranchId(user), dto, user.userId);
  }

  /**
   * PATCH /laboratory/samples/:id/receive
   */
  @Patch('samples/:id/receive')
  @RequirePermissions(Permission.LAB_SAMPLE_MANAGE)
  async receiveSample(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.laboratoryService.receiveSample(user.tenantId, id, user.userId);
  }

  /**
   * PATCH /laboratory/samples/:id/accept
   */
  @Patch('samples/:id/accept')
  @RequirePermissions(Permission.LAB_SAMPLE_MANAGE)
  async acceptSample(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: AcceptSampleDto,
  ) {
    return this.laboratoryService.acceptSample(user.tenantId, id, dto.notes, user.userId);
  }

  /**
   * PATCH /laboratory/samples/:id/reject
   */
  @Patch('samples/:id/reject')
  @RequirePermissions(Permission.LAB_SAMPLE_MANAGE)
  async rejectSample(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: RejectSampleDto,
  ) {
    return this.laboratoryService.rejectSample(user.tenantId, id, dto.rejectionReason, user.userId);
  }

  /**
   * PATCH /laboratory/samples/:id/start-testing
   */
  @Patch('samples/:id/start-testing')
  @RequirePermissions(Permission.LAB_SAMPLE_MANAGE)
  async startTesting(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.laboratoryService.startTesting(user.tenantId, id, user.userId);
  }

  /**
   * PATCH /laboratory/samples/:id/outsource
   * Marking a sample as sent to an external lab is routine day-to-day
   * lab work when a test can't be run in-house — operational, not
   * business analytics (that distinction is "outsourcing analytics" —
   * see ANALYTICS_VIEW — which this is not).
   */
  @Patch('samples/:id/outsource')
  @RequirePermissions(Permission.LAB_SAMPLE_MANAGE)
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
  @RequirePermissions(Permission.LAB_SAMPLE_MANAGE)
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
  @RequirePermissions(Permission.LAB_SAMPLE_MANAGE)
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
  @RequirePermissions(Permission.RESULT_ENTER)
  async enterResult(@CurrentUser() user: AuthUser, @Body() dto: EnterResultDto) {
    return this.laboratoryService.enterResult(user.tenantId, dto, user.userId);
  }

  /**
   * PATCH /laboratory/results/:id/finalize
   * Explicit finalization: ENTERED → RELEASED.
   */
  @Patch('results/:id/finalize')
  @RequirePermissions(Permission.RESULT_FINALIZE)
  async finalizeResult(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.laboratoryService.finalizeResult(user.tenantId, id, user.userId);
  }

  /**
   * PATCH /laboratory/results/:id/reopen
   * Create a V2 correction draft while retaining the release; legacy reopening is isolated.
   */
  @Patch('results/:id/reopen')
  @RequirePermissions(Permission.RESULT_FINALIZE)
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
  @RequirePermissions(Permission.RESULT_FINALIZE)
  async amendResult(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: AmendResultDto,
  ) {
    return this.laboratoryService.amendResult(user.tenantId, id, dto, user.userId);
  }
}

import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import { BillingService } from './billing.service';
import { CreateInvoiceDto } from './dto/create-invoice.dto';
import { RecordPaymentDto } from './dto/record-payment.dto';
import { SessionGuard } from '../../common/guards/session.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { Permission } from '../../common/auth/permissions';
import { CurrentUser, AuthUser } from '../../common/decorators/current-user.decorator';

function resolveBranchId(user: AuthUser): string {
  return user.branchId || process.env.DEFAULT_BRANCH_ID || 'default-branch';
}

/**
 * Handles invoices and payments. Requires a valid session, and every
 * route declares the exact permission it needs (PermissionGuard denies
 * by default if a route has no @RequirePermissions).
 *
 * Important distinction (see docs/12_RBAC_and_Operator_Dashboard.md):
 * everything in this controller is a single patient's invoice/payment —
 * "this patient owes Rs. X" — which is operational, not owner-level
 * financial reporting. LAB_OPERATOR has full access here. Aggregate
 * business financials ("lab revenue this month") live under
 * ANALYTICS_VIEW instead, which LAB_OPERATOR does not have.
 */
@Controller('billing')
@UseGuards(SessionGuard, PermissionGuard)
export class BillingController {
  constructor(private readonly billingService: BillingService) {}

  /**
   * GET /billing/invoices?q=&from=&to=&status=
   */
  @Get('invoices')
  @RequirePermissions(Permission.BILLING_VIEW)
  async listInvoices(
    @CurrentUser() user: AuthUser,
    @Query('q') q?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('status') status?: string,
  ) {
    return this.billingService.listInvoices(
      user.tenantId,
      resolveBranchId(user),
      q,
      from,
      to,
      status,
    );
  }

  /**
   * GET /billing/invoices/:id
   */
  @Get('invoices/:id')
  @RequirePermissions(Permission.BILLING_VIEW)
  async getInvoice(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.billingService.findInvoiceById(user.tenantId, id);
  }

  /**
   * POST /billing/invoices
   * Create invoice from a booking + test/package lines.
   */
  @Post('invoices')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions(Permission.BILLING_CREATE_INVOICE)
  async createInvoice(@CurrentUser() user: AuthUser, @Body() dto: CreateInvoiceDto) {
    return this.billingService.createInvoice(user.tenantId, resolveBranchId(user), dto);
  }

  /**
   * POST /billing/invoices/:id/payments
   * Record a payment (full or partial).
   */
  @Post('invoices/:id/payments')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions(Permission.PAYMENT_RECORD)
  async recordPayment(
    @CurrentUser() user: AuthUser,
    @Param('id') invoiceId: string,
    @Body() dto: RecordPaymentDto,
  ) {
    return this.billingService.recordPayment(user.tenantId, invoiceId, dto);
  }
}

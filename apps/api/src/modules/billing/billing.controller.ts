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
import { CurrentUser, AuthUser } from '../../common/decorators/current-user.decorator';

function resolveBranchId(user: AuthUser): string {
  return user.branchId || process.env.DEFAULT_BRANCH_ID || 'default-branch';
}

/**
 * Handles invoices and payments — real financial data — so this
 * controller requires a valid session (see catalog.controller.ts for the
 * same pattern). Previously unguarded: tenantId came from a
 * client-supplied `x-tenant-id` header, meaning any request that could
 * reach the API could list, create, or pay invoices with no login at
 * all. tenantId now comes from the verified session (@CurrentUser())
 * instead of trusting whatever the client claims.
 */
@Controller('billing')
@UseGuards(SessionGuard)
export class BillingController {
  constructor(private readonly billingService: BillingService) {}

  /**
   * GET /billing/invoices?q=&from=&to=&status=
   */
  @Get('invoices')
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
  async getInvoice(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.billingService.findInvoiceById(user.tenantId, id);
  }

  /**
   * POST /billing/invoices
   * Create invoice from a booking + test/package lines.
   */
  @Post('invoices')
  @HttpCode(HttpStatus.CREATED)
  async createInvoice(@CurrentUser() user: AuthUser, @Body() dto: CreateInvoiceDto) {
    return this.billingService.createInvoice(user.tenantId, resolveBranchId(user), dto);
  }

  /**
   * POST /billing/invoices/:id/payments
   * Record a payment (full or partial).
   */
  @Post('invoices/:id/payments')
  @HttpCode(HttpStatus.CREATED)
  async recordPayment(
    @CurrentUser() user: AuthUser,
    @Param('id') invoiceId: string,
    @Body() dto: RecordPaymentDto,
  ) {
    return this.billingService.recordPayment(user.tenantId, invoiceId, dto);
  }
}

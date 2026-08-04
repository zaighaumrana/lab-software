import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  Headers,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { BillingService } from './billing.service';
import { CreateInvoiceDto } from './dto/create-invoice.dto';
import { RecordPaymentDto } from './dto/record-payment.dto';

function resolveTenantId(header?: string): string {
  return header || process.env.DEFAULT_TENANT_ID || 'default-tenant';
}

function resolveBranchId(header?: string): string {
  return header || process.env.DEFAULT_BRANCH_ID || 'default-branch';
}

@Controller('billing')
export class BillingController {
  constructor(private readonly billingService: BillingService) {}


  /**
   * GET /billing/invoices?q=
   */
  @Get('invoices')
  async listInvoices(
    @Query('q') q?: string,
    @Headers('x-tenant-id') tenantHeader?: string,
    @Headers('x-branch-id') branchHeader?: string,
  ) {
    const tenantId = resolveTenantId(tenantHeader);
    const branchId = resolveBranchId(branchHeader);
    return this.billingService.listInvoices(tenantId, branchId, q);
  }

  /**
   * GET /billing/invoices/:id
   */
  @Get('invoices/:id')
  async getInvoice(
    @Param('id') id: string,
    @Headers('x-tenant-id') tenantHeader?: string,
  ) {
    const tenantId = resolveTenantId(tenantHeader);
    return this.billingService.findInvoiceById(tenantId, id);
  }

  /**
   * POST /billing/invoices
   * Create invoice from a booking + test/package lines.
   */
  @Post('invoices')
  @HttpCode(HttpStatus.CREATED)
  async createInvoice(
    @Body() dto: CreateInvoiceDto,
    @Headers('x-tenant-id') tenantHeader?: string,
    @Headers('x-branch-id') branchHeader?: string,
  ) {
    const tenantId = resolveTenantId(tenantHeader);
    const branchId = resolveBranchId(branchHeader);
    return this.billingService.createInvoice(tenantId, branchId, dto);
  }

  /**
   * POST /billing/invoices/:id/payments
   * Record a payment (full or partial).
   */
  @Post('invoices/:id/payments')
  @HttpCode(HttpStatus.CREATED)
  async recordPayment(
    @Param('id') invoiceId: string,
    @Body() dto: RecordPaymentDto,
    @Headers('x-tenant-id') tenantHeader?: string,
  ) {
    const tenantId = resolveTenantId(tenantHeader);
    return this.billingService.recordPayment(tenantId, invoiceId, dto);
  }
}

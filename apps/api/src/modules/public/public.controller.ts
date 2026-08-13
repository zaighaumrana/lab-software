import {
  Controller,
  Get,
  Post,
  Query,
  Body,
  Headers,
  Res,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import type { Response } from 'express';
import { PublicService } from './public.service';

function resolveTenantId(header?: string): string {
  return header || process.env.DEFAULT_TENANT_ID || 'default-tenant';
}

function resolveBranchId(header?: string): string {
  return header || process.env.DEFAULT_BRANCH_ID || 'default-branch';
}

/**
 * Public endpoints — no session required.
 * Used by the public website only.
 */
@Controller('public')
export class PublicController {
  constructor(private readonly publicService: PublicService) {}

  /**
   * GET /public/rates
   */
  @Get('rates')
  async rates(@Headers('x-tenant-id') tenantHeader?: string) {
    return this.publicService.listRates(resolveTenantId(tenantHeader));
  }

  /**
   * GET /public/reports/lookup?trackingId=XXX&verification=0300...
   */
  @Get('reports/lookup')
  async lookupReport(
    @Query('trackingId') trackingId: string,
    @Query('verification') verification: string,
    @Headers('x-tenant-id') tenantHeader?: string,
  ) {
    if (!trackingId || !verification) {
      return {
        error: 'trackingId and verification (phone or CNIC) are required',
      };
    }
    return this.publicService.lookupReport(
      resolveTenantId(tenantHeader),
      trackingId,
      verification,
    );
  }

  /**
   * GET /public/reports/lookup/pdf?trackingId=XXX&verification=0300...
   * Same eligibility rule as the JSON lookup — only serves the PDF once
   * finalized + fully paid, re-checked independently server-side.
   */
  @Get('reports/lookup/pdf')
  async lookupReportPdf(
    @Query('trackingId') trackingId: string,
    @Query('verification') verification: string,
    @Res() res: Response,
    @Headers('x-tenant-id') tenantHeader?: string,
  ) {
    const { pdf, filename } = await this.publicService.lookupReportPdf(
      resolveTenantId(tenantHeader),
      trackingId,
      verification,
    );
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${filename}"`,
    });
    res.send(pdf);
  }

  /**
   * POST /public/bookings
   * Online booking → staff review queue
   */
  @Post('bookings')
  @HttpCode(HttpStatus.CREATED)
  async requestBooking(
    @Body()
    body: {
      fullName: string;
      phone: string;
      preferredAt?: string;
      notes?: string;
      testIds?: string[];
    },
    @Headers('x-tenant-id') tenantHeader?: string,
    @Headers('x-branch-id') branchHeader?: string,
  ) {
    return this.publicService.requestBooking(
      resolveTenantId(tenantHeader),
      resolveBranchId(branchHeader),
      body,
    );
  }
}

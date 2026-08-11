import { Controller, Get, Param, Query, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { PrintingService } from './printing.service';
import { BillingService } from '../billing/billing.service';
import { ReportingService } from '../reporting/reporting.service';
import { SettingsService } from '../settings/settings.service';
import { DoctorsService } from '../doctors/doctors.service';
import { SessionGuard } from '../../common/guards/session.guard';
import { CurrentUser, AuthUser } from '../../common/decorators/current-user.decorator';
import { buildInvoiceHtml } from './templates/invoice.template';
import { buildReportHtml } from './templates/report.template';
import { buildDoctorStatementHtml } from './templates/doctor-statement.template';
import type { PrintSettings } from './templates/shared';

@Controller('printing')
@UseGuards(SessionGuard)
export class PrintingController {
  constructor(
    private readonly printingService: PrintingService,
    private readonly billingService: BillingService,
    private readonly reportingService: ReportingService,
    private readonly settingsService: SettingsService,
    private readonly doctorsService: DoctorsService,
  ) {}

  private async resolvePrintSettings(tenantId: string): Promise<PrintSettings> {
    const [printLayout, branding] = await Promise.all([
      this.settingsService.getPrintLayout(tenantId),
      this.settingsService.getBranding(tenantId),
    ]);
    return { ...printLayout, logoDataUrl: branding.logoDataUrl };
  }

  @Get('invoices/:id')
  async invoicePdf(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Res() res: Response,
  ) {
    const [invoice, settings] = await Promise.all([
      this.billingService.findInvoiceById(user.tenantId, id),
      this.resolvePrintSettings(user.tenantId),
    ]);
    const html = buildInvoiceHtml(invoice, settings);
    const pdf = await this.printingService.renderPdf(html, {
      marginTopMm: settings.marginTopMm,
      marginBottomMm: settings.marginBottomMm,
    });
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="invoice-${invoice.invoiceNumber}.pdf"`,
    });
    res.send(pdf);
  }

  @Get('reports/:id')
  async reportPdf(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Res() res: Response,
  ) {
    const [report, settings] = await Promise.all([
      this.reportingService.findById(user.tenantId, id),
      this.resolvePrintSettings(user.tenantId),
    ]);
    const html = buildReportHtml(report, settings);
    const pdf = await this.printingService.renderPdf(html, {
      marginTopMm: settings.marginTopMm,
      marginBottomMm: settings.marginBottomMm,
    });
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="report-${report.trackingId}.pdf"`,
    });
    res.send(pdf);
  }

  @Get('doctors/:id/statement')
  async doctorStatementPdf(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Query('from') from: string | undefined,
    @Query('to') to: string | undefined,
    @Res() res: Response,
  ) {
    const [dashboard, settings] = await Promise.all([
      this.doctorsService.dashboard(user.tenantId, id, {
        from,
        to,
        sortBy: 'date',
        sortDir: 'asc',
        page: 1,
        pageSize: 1000,
      }),
      this.resolvePrintSettings(user.tenantId),
    ]);
    const html = buildDoctorStatementHtml(dashboard, settings);
    const pdf = await this.printingService.renderPdf(html, {
      marginTopMm: settings.marginTopMm,
      marginBottomMm: settings.marginBottomMm,
    });
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="doctor-statement-${dashboard.doctor.fullName.replace(/\s+/g, '-')}.pdf"`,
    });
    res.send(pdf);
  }
}

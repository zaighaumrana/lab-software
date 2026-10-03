import { Controller, ForbiddenException, Get, Param, ParseIntPipe, Query, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { PrintingService } from './printing.service';
import { ReportArtifactService } from './report-artifact.service';
import { BillingService } from '../billing/billing.service';
import { ReportingService } from '../reporting/reporting.service';
import { SettingsService } from '../settings/settings.service';
import { DoctorsService } from '../doctors/doctors.service';
import { SessionGuard } from '../../common/guards/session.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { Permission } from '../../common/auth/permissions';
import { CurrentUser, AuthUser } from '../../common/decorators/current-user.decorator';
import { canPrintReport, PENDING_PAYMENT_MESSAGE, REPORT_NOT_FINALIZED_MESSAGE, isReportFinalized } from '../../common/report-eligibility.util';
import { buildInvoiceHtml } from './templates/invoice.template';
import { buildReportHtml } from './templates/report.template';
import { buildDoctorStatementHtml } from './templates/doctor-statement.template';
import type { PrintSettings } from './templates/shared';

/**
 * Requires a valid session, and every route declares the exact
 * permission it needs (PermissionGuard denies by default if a route has
 * no @RequirePermissions). Invoice/report printing is the tail end of
 * the normal patient workflow (BILLING_VIEW / REPORT_PRINT — LAB_OPERATOR
 * has both); the doctor statement is owner-level financial data
 * (DOCTOR_MANAGE — ADMIN only), same boundary as doctors.controller.ts.
 */
@Controller('printing')
@UseGuards(SessionGuard, PermissionGuard)
export class PrintingController {
  constructor(
    private readonly printingService: PrintingService,
    private readonly billingService: BillingService,
    private readonly reportingService: ReportingService,
    private readonly settingsService: SettingsService,
    private readonly doctorsService: DoctorsService,
    private readonly reportArtifacts: ReportArtifactService,
  ) {}

  private async resolvePrintSettings(tenantId: string): Promise<PrintSettings> {
    const [printLayout, branding] = await Promise.all([
      this.settingsService.getPrintLayout(tenantId),
      this.settingsService.getBranding(tenantId),
    ]);
    return { ...printLayout, logoDataUrl: branding.logoDataUrl };
  }

  @Get('invoices/:id')
  @RequirePermissions(Permission.BILLING_VIEW)
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
  @RequirePermissions(Permission.REPORT_PRINT)
  async reportPdf(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Res() res: Response,
  ) {
    const report = await this.reportingService.findById(user.tenantId, id);
    return this.sendReportPdf(user, report, res);
  }

  @Get('reports/:id/versions/:versionNo')
  @RequirePermissions(Permission.REPORT_PRINT)
  async reportVersionPdf(@CurrentUser() user: AuthUser, @Param('id') id: string,
    @Param('versionNo', ParseIntPipe) versionNo: number, @Res() res: Response) {
    const report = await this.reportingService.findVersion(user.tenantId, id, versionNo);
    return this.sendReportPdf(user, report, res);
  }

  private async sendReportPdf(user: AuthUser,
    report: Awaited<ReturnType<ReportingService['findById']>>, res: Response) {
    if (!isReportFinalized(report)) {
      throw new ForbiddenException(REPORT_NOT_FINALIZED_MESSAGE);
    }
    if (!canPrintReport(report, report.invoice)) {
      throw new ForbiddenException(PENDING_PAYMENT_MESSAGE);
    }
    let pdf: Buffer;
    if (report.selectedVersion) {
      pdf = await this.reportArtifacts.pdf(report as Awaited<ReturnType<ReportingService['findVersion']>>,
        () => this.resolvePrintSettings(user.tenantId));
    } else {
      // Unversioned legacy output retains its existing dynamic rendering behavior.
      const settings = await this.resolvePrintSettings(user.tenantId);
      pdf = await this.printingService.renderPdf(buildReportHtml(report, settings), {
        marginTopMm: settings.marginTopMm, marginBottomMm: settings.marginBottomMm,
      });
    }
    // Fire-and-forget-ish, but awaited: this is what "printed" means in
    // this app (see reporting.service.ts's markPrinted comment) — do it
    // after the PDF renders successfully, not before, so a failed render
    // never falsely marks a report as printed.
    await this.reportingService.markPrinted(user.tenantId, report.id, report.selectedVersion?.id);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="report-${report.trackingId}${report.selectedVersion ? `-v${report.selectedVersion.versionNo}` : ''}.pdf"`,
    });
    res.send(pdf);
  }

  @Get('doctors/:id/statement')
  @RequirePermissions(Permission.DOCTOR_MANAGE)
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

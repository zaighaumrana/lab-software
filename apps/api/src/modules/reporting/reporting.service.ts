import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { ReportStatus } from '@lms/database';
import { clinicalResultInclude, projectClinicalResult } from '../laboratory/clinical-results';
import { reportBaseInclude, reportVersionInclude, projectReportVersion } from './report-version.projection';
import { lockInvoice } from '../billing/financial-state';
import { canPrintReport, PENDING_PAYMENT_MESSAGE, REPORT_NOT_FINALIZED_MESSAGE, isReportFinalized } from '../../common/report-eligibility.util';

@Injectable()
export class ReportingService {
  constructor(private readonly prisma: PrismaService) {}

  async findById(tenantId: string, id: string) {
    return this.readCurrent({ id, tenantId });
  }

  async findByTrackingId(tenantId: string, trackingId: string) {
    return this.readCurrent({ tenantId, trackingId });
  }

  private async readCurrent(where: { tenantId: string; id?: string; trackingId?: string }) {
    const report = await this.prisma.report.findFirst({
      where, include: reportBaseInclude,
    });
    if (!report) throw new NotFoundException('Report not found');
    if (report.currentVersion) return projectReportVersion(report, report.currentVersion);

    // Explicit compatibility path: no version exists, so only here scan current legacy releases.
    const samples = await this.prisma.sample.findMany({
      where: { tenantId: where.tenantId, invoiceId: report.invoiceId },
      include: { results: { where: { status: 'RELEASED' }, include: clinicalResultInclude, orderBy: { createdAt: 'asc' } } },
    });
    return { ...report, currentVersion: null, selectedVersion: null,
      invoice: { ...report.invoice, samples: samples.map(s => ({ ...s, results: s.results.map(projectClinicalResult) })) } };
  }

  async listVersions(tenantId: string, reportId: string) {
    if (!await this.prisma.report.findFirst({ where: { id: reportId, tenantId }, select: { id: true } })) {
      throw new NotFoundException('Report not found');
    }
    return this.prisma.reportVersion.findMany({ where: { tenantId, reportId }, orderBy: { versionNo: 'asc' } });
  }

  async currentFinancialState(tenantId:string, invoiceId:string) {
    const invoice = await this.prisma.invoice.findFirst({where:{id:invoiceId,tenantId}});
    if (!invoice) throw new NotFoundException('Invoice not found');
    return invoice;
  }

  async findVersion(tenantId: string, reportId: string, versionNo: number) {
    const report = await this.prisma.report.findFirst({ where: { id: reportId, tenantId }, include: reportBaseInclude });
    if (!report) throw new NotFoundException('Report not found');
    const version = await this.prisma.reportVersion.findFirst({
      where: { tenantId, reportId, versionNo }, include: reportVersionInclude,
    });
    if (!version) throw new NotFoundException('Report version not found');
    return projectReportVersion(report, version);
  }

  async listByInvoice(tenantId: string, invoiceId: string) {
    return this.prisma.report.findMany({
      where: { tenantId, invoiceId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async list(
    tenantId: string,
    branchId?: string,
    q?: string,
    status?: string,
    unprintedOnly?: boolean,
  ) {
    return this.prisma.report.findMany({
      where: {
        tenantId,
        ...(branchId ? { branchId } : {}),
        ...(status ? { status: status as ReportStatus } : {}),
        // Only applied when the caller didn't also search — see
        // reporting.controller.ts's comment on why a search query always
        // overrides this, regardless of who's asking.
        ...(unprintedOnly && !q ? { printedAt: null } : {}),
        ...(q
          ? {
              OR: [
                { trackingId: { contains: q, mode: 'insensitive' } },
                { reportNumber: { contains: q, mode: 'insensitive' } },
                {
                  invoice: {
                    booking: {
                      patient: {
                        fullName: { contains: q, mode: 'insensitive' },
                      },
                    },
                  },
                },
                {
                  invoice: {
                    booking: { patient: { phone: { contains: q } } },
                  },
                },
              ],
            }
          : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: {
        invoice: {
          include: {
            booking: { include: { patient: true } },
            lines: true,
            payments: true,
          },
        },
      },
    });
  }

  /**
   * Called by printing.controller.ts every time a report's PDF is
   * actually generated/downloaded — this is what "printed" means in
   * this app (there's no separate physical-printer signal to hook into,
   * so PDF generation is the honest proxy). First call sets printedAt;
   * every call (first or a later reprint) increments printCount, which
   * is what lets a reprint be told apart from an original print if that
   * distinction is ever needed later.
   */
  async markPrinted(tenantId: string, id: string, versionId?: string) {
    await this.prisma.$transaction(async tx => {
      const identity = await tx.report.findFirst({where:{id,tenantId},select:{invoiceId:true}});
      if (!identity) throw new NotFoundException('Report not found');
      // Final print authorization is serialized with financial mutations, after
      // rendering. The committed print counter is the authorization's ordering point.
      const invoice = await lockInvoice(tx,tenantId,identity.invoiceId);
      const rows = await tx.$queryRaw<{id:string}[]>`SELECT id FROM reports WHERE id=${id} AND "tenantId"=${tenantId} FOR UPDATE`;
      if (!rows.length) throw new NotFoundException('Report not found');
      const report = await tx.report.findUniqueOrThrow({where:{id}});
      if (!isReportFinalized(report)) throw new ForbiddenException(REPORT_NOT_FINALIZED_MESSAGE);
      if (!canPrintReport(report,invoice)) throw new ForbiddenException(PENDING_PAYMENT_MESSAGE);
      if (versionId) {
        const version = await tx.reportVersion.findFirst({ where: { id: versionId, tenantId, reportId: id, pdfPath: { not: null } } });
        if (!version) throw new NotFoundException('Generated report artifact not found');
        await tx.$executeRaw`WITH stamp AS MATERIALIZED (SELECT clock_timestamp() AS at)
          UPDATE report_versions SET "firstPrintedAt"=coalesce("firstPrintedAt",stamp.at),
          "lastPrintedAt"=stamp.at,"printCount"="printCount"+1 FROM stamp WHERE id=${versionId}`;
      }
      await tx.$executeRaw`UPDATE reports SET "printedAt"=coalesce("printedAt",CURRENT_TIMESTAMP AT TIME ZONE 'UTC'),
        "printCount"="printCount"+1,"updatedAt"=CURRENT_TIMESTAMP AT TIME ZONE 'UTC' WHERE id=${id}`;
    });
  }
}

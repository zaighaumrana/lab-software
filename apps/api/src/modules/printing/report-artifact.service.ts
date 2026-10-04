import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { Prisma, ReportVersion } from '@lms/database';
import { PrismaService } from '../../common/prisma/prisma.service';
import { PrintingService } from './printing.service';
import { ReportArtifactStore, persistentReportRoot, pdfHash } from './report-artifact.store';
import { buildReportHtml } from './templates/report.template';
import type { PrintSettings } from './templates/shared';
import { ReportingService } from '../reporting/reporting.service';
import { enqueuePublicReport, lockPublicReport } from '../public-sync/public-projection';

type VersionProjection = Awaited<ReturnType<ReportingService['findVersion']>>;

@Injectable()
export class ReportArtifactService {
  private store?: ReportArtifactStore;
  constructor(private readonly prisma: PrismaService, private readonly printing: PrintingService) {}

  private storage() {
    return this.store ??= new ReportArtifactStore(persistentReportRoot());
  }

  private async read(version: ReportVersion) {
    try {
      return await this.storage().read(version.tenantId, version.reportId, version.versionNo, {
        pdfPath: version.pdfPath!, pdfSha256: version.pdfSha256!, pdfByteSize: version.pdfByteSize!,
      });
    } catch {
      throw new ServiceUnavailableException('Canonical report PDF is missing or corrupt. Restore the recorded artifact; it will not be regenerated.');
    }
  }

  async pdf(report: VersionProjection, settings: () => Promise<PrintSettings>) {
    const selected = report.selectedVersion;
    let version = await this.prisma.reportVersion.findFirstOrThrow({
      where: { id: selected.id, tenantId: report.tenantId, reportId: report.id },
    });
    if (version.pdfPath) return this.read(version);

    // Rendering and disk publication happen after the clinical transaction, with no DB lock held.
    const printSettings = await settings();
    const html = buildReportHtml(report, printSettings);
    const bytes = await this.printing.renderPdf(html, {
      marginTopMm: printSettings.marginTopMm, marginBottomMm: printSettings.marginBottomMm,
    });
    const candidate = await this.storage().publish(report.tenantId, report.id, version.versionNo, bytes);
    try {
      version = await this.prisma.$transaction(async tx => {
        await lockPublicReport(tx, report.tenantId, report.id);
        const changed = await tx.reportVersion.updateMany({
          where: { id: version.id, tenantId: report.tenantId, reportId: report.id, pdfPath: null },
          data: { ...candidate, pdfGeneratedAt: new Date(), renderSettingsSnapshot: {
            template: 'report-b2-v1', htmlSha256: pdfHash(Buffer.from(html)), settings: printSettings,
            financialDisplay: { status: report.invoice.status,
              amountPaid: String(report.invoice.amountPaid), amountDue: String(report.invoice.amountDue) },
          } as unknown as Prisma.InputJsonValue },
        });
        if (changed.count) await enqueuePublicReport(tx, report.tenantId, report.id);
        return tx.reportVersion.findUniqueOrThrow({ where: { id: version.id } });
      });
      if (version.pdfPath !== candidate.pdfPath) {
        await this.storage().removeCandidate(report.tenantId, report.id, version.versionNo, candidate.pdfPath);
      }
    } catch (error) {
      // A failed/ambiguous DB acknowledgement must never remove a potentially recorded artifact.
      // An unreferenced unique candidate can remain for controlled housekeeping; retry uses a fresh path.
      throw error;
    }
    return this.read(version);
  }
}

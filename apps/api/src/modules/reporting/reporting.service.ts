import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { ReportStatus } from '@lms/database';
import { clinicalResultInclude, projectClinicalResult } from '../laboratory/clinical-results';

@Injectable()
export class ReportingService {
  constructor(private readonly prisma: PrismaService) {}

  async findById(tenantId: string, id: string) {
    const report = await this.prisma.report.findFirst({
      where: { id, tenantId },
      include: {
        invoice: {
          include: {
            booking: { include: { patient: true, doctor: true } },
            lines: { include: { test: true, package: true } },
            samples: {
              include: {
                results: {
                  where: { status: 'RELEASED' },
                  include: clinicalResultInclude,
                  orderBy: { createdAt: 'asc' },
                },
              },
            },
            payments: { orderBy: { receivedAt: 'asc' } },
          },
        },
      },
    });

    if (!report) throw new NotFoundException('Report not found');
    return { ...report, invoice: { ...report.invoice, samples: report.invoice.samples.map(s=>({ ...s, results:s.results.map(projectClinicalResult) })) } };
  }

  async findByTrackingId(tenantId: string, trackingId: string) {
    const report = await this.prisma.report.findFirst({
      where: { tenantId, trackingId },
      include: {
        invoice: {
          include: {
            booking: { include: { patient: true } },
            lines: { include: { test: true } },
            samples: {
              include: {
                results: {
                  where: { status: 'RELEASED' },
                  include: clinicalResultInclude,
                },
              },
            },
            payments: true,
          },
        },
      },
    });

    if (!report) throw new NotFoundException('Report not found');
    return { ...report, invoice: { ...report.invoice, samples: report.invoice.samples.map(s=>({ ...s, results:s.results.map(projectClinicalResult) })) } };
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
  async markPrinted(tenantId: string, id: string) {
    await this.prisma.report.updateMany({
      where: { id, tenantId },
      data: {
        printedAt: new Date(),
        printCount: { increment: 1 },
      },
    });
  }
}

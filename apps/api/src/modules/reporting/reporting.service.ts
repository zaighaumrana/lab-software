import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { ReportStatus } from '@lms/database';

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
                  where: { status: { in: ['RELEASED', 'SUPERSEDED'] } },
                  include: {
                    test: true,
                    values: {
                      include: { parameter: true },
                      orderBy: { parameter: { sortOrder: 'asc' } },
                    },
                  },
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
    return report;
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
                  include: {
                    test: true,
                    values: {
                      include: { parameter: true },
                      orderBy: { parameter: { sortOrder: 'asc' } },
                    },
                  },
                },
              },
            },
            payments: true,
          },
        },
      },
    });

    if (!report) throw new NotFoundException('Report not found');
    return report;
  }

  async listByInvoice(tenantId: string, invoiceId: string) {
    return this.prisma.report.findMany({
      where: { tenantId, invoiceId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async list(tenantId: string, branchId?: string, q?: string, status?: string) {
    return this.prisma.report.findMany({
      where: {
        tenantId,
        ...(branchId ? { branchId } : {}),
        ...(status ? { status: status as ReportStatus } : {}),
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
}

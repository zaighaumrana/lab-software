import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { InvoiceStatus, ResultStatus } from '@lms/database';
import { getOperationalOverview } from '../analytics/queries/operational.queries';

/**
 * Backs GET /dashboard/operator. Deliberately does NOT go through
 * AnalyticsService/AnalyticsController — that controller is entirely
 * ANALYTICS_VIEW/ADMIN-gated (see analytics.controller.ts's class
 * comment), and LAB_OPERATOR should get operational data without
 * gaining access to /analytics/* itself. Instead this imports the same
 * underlying query function directly, so the metric is computed
 * identically either way — one implementation, two entry points with
 * different authorization.
 *
 * Every number here is a real query against real data. Nothing is
 * mocked or hardcoded — see docs/12_RBAC_and_Operator_Dashboard.md.
 * "Reports printed today" and "cash collected today" are now real
 * metrics (see operational.queries.ts's getReportsPrintedToday /
 * getCashReceived) — reports.printedAt was added specifically for this,
 * see the migration and reporting.service.ts's markPrinted().
 */
@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async getOperatorDashboard(tenantId: string) {
    const [overview, pendingPayments, recentActivity] = await Promise.all([
      getOperationalOverview(this.prisma, tenantId),
      this.getPendingPaymentsCount(tenantId),
      this.getRecentActivity(tenantId),
    ]);

    return {
      ...overview,
      pendingPayments,
      recentActivity,
    };
  }

  /** Invoices with a real amount still outstanding — "this patient still
   * owes Rs. X," the operational framing, not a revenue figure. */
  private async getPendingPaymentsCount(tenantId: string) {
    return this.prisma.invoice.count({
      where: {
        tenantId,
        status: { not: InvoiceStatus.VOIDED },
        amountDue: { gt: 0 },
      },
    });
  }

  /**
   * Merges the last few result-entry/finalization events, sample
   * collections, and completed reports into one timeline, most-recent
   * first. Deliberately sourced from real event timestamps already on
   * these records (enteredAt/releasedAt, collectedAt, generatedAt) —
   * no separate activity-log table exists, so this reconstructs a
   * reasonable approximation of one rather than adding new schema for
   * something this task didn't require (see
   * docs/12_RBAC_and_Operator_Dashboard.md — no unrelated schema
   * changes).
   */
  private async getRecentActivity(tenantId: string, limit = 15) {
    const [results, samples, reports] = await Promise.all([
      this.prisma.result.findMany({
        where: { tenantId },
        orderBy: { updatedAt: 'desc' },
        take: limit,
        include: {
          test: { select: { name: true } },
          sample: {
            include: {
              invoice: { include: { booking: { include: { patient: true } } } },
            },
          },
        },
      }),
      this.prisma.sample.findMany({
        where: { tenantId, collectedAt: { not: null } },
        orderBy: { collectedAt: 'desc' },
        take: limit,
        include: {
          invoice: { include: { booking: { include: { patient: true } } } },
        },
      }),
      this.prisma.report.findMany({
        where: { tenantId, generatedAt: { not: null } },
        orderBy: { generatedAt: 'desc' },
        take: limit,
        include: {
          invoice: { include: { booking: { include: { patient: true } } } },
        },
      }),
    ]);

    type Activity = { patientName: string; label: string; at: Date };
    const activity: Activity[] = [];

    for (const r of results) {
      const patientName = r.sample?.invoice?.booking?.patient?.fullName ?? 'Unknown patient';
      if (r.status === ResultStatus.RELEASED && r.releasedAt) {
        activity.push({ patientName, label: `${r.test.name} — Result finalized`, at: r.releasedAt });
      } else if (r.enteredAt) {
        activity.push({ patientName, label: `${r.test.name} — Result entered`, at: r.enteredAt });
      }
    }
    for (const s of samples) {
      if (!s.collectedAt) continue;
      const patientName = s.invoice?.booking?.patient?.fullName ?? 'Unknown patient';
      activity.push({ patientName, label: `Sample collected (${s.sampleCode})`, at: s.collectedAt });
    }
    for (const r of reports) {
      if (!r.generatedAt) continue;
      const patientName = r.invoice?.booking?.patient?.fullName ?? 'Unknown patient';
      activity.push({ patientName, label: 'Report ready', at: r.generatedAt });
    }

    return activity
      .sort((a, b) => b.at.getTime() - a.at.getTime())
      .slice(0, limit)
      .map((a) => ({ patientName: a.patientName, label: a.label, at: a.at.toISOString() }));
  }
}

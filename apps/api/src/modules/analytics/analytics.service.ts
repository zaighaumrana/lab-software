import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import * as financial from './queries/financial.queries';
import * as operational from './queries/operational.queries';
import type { DateRange } from './queries/financial.queries';

/**
 * Every individual metric this API can serve, keyed by widgetId. This is
 * the "no duplication" piece from the architecture doc: the controller and
 * the frontend widget grid both work off this registry, so adding a new
 * metric later is one entry here — nothing else has to change.
 */
type WidgetFn = (prisma: PrismaService, tenantId: string, range: DateRange) => Promise<unknown>;

const WIDGETS: Record<string, WidgetFn> = {
  'financial.invoicedRevenue': (p, t, r) => financial.getInvoicedRevenue(p, t, r),
  'financial.cashReceived': (p, t, r) => financial.getCashReceived(p, t, r),
  'financial.outstanding': (p, t) => financial.getOutstanding(p, t),
  'financial.discountGiven': (p, t, r) => financial.getDiscountGiven(p, t, r),
  'financial.refunds': (p, t, r) => financial.getRefunds(p, t, r),
  'financial.netRevenue': (p, t, r) => financial.getNetRevenue(p, t, r),

  'ops.todayPatients': (p, t, r) => operational.getPatientCount(p, t, r),
  'ops.samplesCollected': (p, t, r) => operational.getSamplesCollected(p, t, r),
  'ops.testsInProgress': (p, t) => operational.getTestsInProgress(p, t),
  'ops.pendingVerification': (p, t) => operational.getPendingVerification(p, t),
  'ops.reportsReady': (p, t) => operational.getReportsReady(p, t),
  'ops.criticalAwaitingReview': (p, t) => operational.getCriticalAwaitingReview(p, t),
  'ops.avgTurnaroundTimeHours': (p, t, r) => operational.getAvgTurnaroundTimeHours(p, t, r),
};

@Injectable()
export class AnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  listWidgets() {
    return Object.keys(WIDGETS);
  }

  async getWidget(widgetId: string, tenantId: string, range: DateRange) {
    const fn = WIDGETS[widgetId];
    if (!fn) throw new NotFoundException(`Unknown widget: ${widgetId}`);
    const value = await fn(this.prisma, tenantId, range);
    return { widgetId, range, value };
  }

  async getFinancialOverview(tenantId: string, range: DateRange) {
    return financial.getFinancialOverview(this.prisma, tenantId, range);
  }

  async getOperationalOverview(tenantId: string, range: DateRange) {
    return operational.getOperationalOverview(this.prisma, tenantId, range);
  }
}

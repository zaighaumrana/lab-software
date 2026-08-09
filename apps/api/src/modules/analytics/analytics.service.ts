import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import * as financial from './queries/financial.queries';
import * as operational from './queries/operational.queries';
import * as doctorShare from './queries/doctor-share.queries';
import * as testAnalytics from './queries/test-analytics.queries';
import * as businessInsights from './queries/business-insights.queries';
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
  'financial.paymentStatusBreakdown': (p, t) => financial.getPaymentStatusBreakdown(p, t),
  'financial.monthlyRevenueComparison': (p, t, r) =>
    financial.getMonthlyRevenueComparison(p, t, r),

  'ops.todayPatients': (p, t, r) => operational.getPatientCount(p, t, r),
  'ops.samplesCollected': (p, t, r) => operational.getSamplesCollected(p, t, r),
  'ops.testsInProgress': (p, t) => operational.getTestsInProgress(p, t),
  'ops.pendingVerification': (p, t) => operational.getPendingVerification(p, t),
  'ops.reportsReady': (p, t) => operational.getReportsReady(p, t),
  'ops.criticalAwaitingReview': (p, t) => operational.getCriticalAwaitingReview(p, t),
  'ops.avgTurnaroundTimeHours': (p, t, r) => operational.getAvgTurnaroundTimeHours(p, t, r),

  'doctorShare.totalPayable': (p, t, r) => doctorShare.getTotalSharePayable(p, t, r),
  'doctorShare.totalPaid': (p, t, r) => doctorShare.getTotalSharePaid(p, t, r),
  'doctorShare.pending': (p, t) => doctorShare.getPendingShare(p, t),
  'doctorShare.topReferring': (p, t, r) => doctorShare.getTopReferringDoctors(p, t, r),
  'doctorShare.trend': (p, t, r) => doctorShare.getDoctorShareTrend(p, t, r),

  'tests.mostPerformed': (p, t, r) => testAnalytics.getMostPerformedTests(p, t, r),
  'tests.leastPerformed': (p, t, r) => testAnalytics.getLeastPerformedTests(p, t, r),
  'tests.highestRevenue': (p, t, r) => testAnalytics.getHighestRevenueTests(p, t, r),
  'tests.averagePrice': (p, t, r) => testAnalytics.getAverageTestPrice(p, t, r),
  'tests.averageDailyTests': (p, t, r) => testAnalytics.getAverageDailyTests(p, t, r),
  'tests.averagePatientsPerDay': (p, t, r) => testAnalytics.getAveragePatientsPerDay(p, t, r),
  'tests.newVsRepeat': (p, t, r) => testAnalytics.getNewVsRepeatPatients(p, t, r),
  'tests.categoryDistribution': (p, t, r) => testAnalytics.getTestCategoryDistribution(p, t, r),

  'insights.highestRevenuePatients': (p, t, r) =>
    businessInsights.getHighestRevenuePatients(p, t, r),
  'insights.mostPopularPackages': (p, t, r) => businessInsights.getMostPopularPackages(p, t, r),
  'insights.peakVisitHours': (p, t, r) => businessInsights.getPeakVisitHours(p, t, r),
  'insights.weeklyTrend': (p, t, r) => businessInsights.getBookingTrend(p, t, r, 'week'),
  'insights.dailyTrend': (p, t, r) => businessInsights.getBookingTrend(p, t, r, 'day'),
  'insights.monthlyTrend': (p, t, r) => businessInsights.getBookingTrend(p, t, r, 'month'),
  'insights.seasonalTrend': (p, t, r) => businessInsights.getBookingTrend(p, t, r, 'quarter'),
  'insights.growthRate': (p, t, r) => businessInsights.getGrowthRate(p, t, r),
  'insights.cancellationRate': (p, t, r) => testAnalytics.getCancellationRate(p, t, r),
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

  async getDoctorShareOverview(tenantId: string, range: DateRange) {
    return doctorShare.getDoctorShareOverview(this.prisma, tenantId, range);
  }

  async getTestAnalyticsOverview(tenantId: string, range: DateRange) {
    return testAnalytics.getTestAnalyticsOverview(this.prisma, tenantId, range);
  }

  async getBusinessInsightsOverview(tenantId: string, range: DateRange) {
    return businessInsights.getBusinessInsightsOverview(this.prisma, tenantId, range);
  }
}

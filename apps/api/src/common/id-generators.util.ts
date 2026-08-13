/**
 * Shared ID generators. Pulled out of laboratory.service.ts so that
 * billing.service.ts can also use them — billing creates the Report row
 * (and its trackingId) up front at invoice time, and laboratory later
 * fills in / updates that same row as results come in. Keeping one
 * implementation avoids the two drifting apart.
 */

export function generateReportNumber(): string {
  const now = new Date();
  const datePart = now.toISOString().slice(0, 10).replace(/-/g, '');
  const random = Math.floor(10000 + Math.random() * 90000);
  return `RPT-${datePart}-${random}`;
}

export function generateTrackingId(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let id = '';
  for (let i = 0; i < 10; i++) {
    id += chars[Math.floor(Math.random() * chars.length)];
  }
  return id;
}

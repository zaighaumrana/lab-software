import clsx from 'clsx';

const COLORS: Record<string, string> = {
  // Payment / invoice
  CLOSED: 'bg-green-100 text-green-800',
  FULLY_RECEIVED: 'bg-green-100 text-green-800',
  PARTIALLY_RECEIVED: 'bg-amber-100 text-amber-800',
  ISSUED: 'bg-blue-100 text-blue-800',
  DRAFT: 'bg-slate-100 text-slate-700',
  VOIDED: 'bg-red-100 text-red-800',
  REFUNDED: 'bg-red-100 text-red-800',
  // Booking
  CONFIRMED: 'bg-blue-100 text-blue-800',
  CHECKED_IN: 'bg-indigo-100 text-indigo-800',
  CONVERTED: 'bg-green-100 text-green-800',
  PENDING_REVIEW: 'bg-amber-100 text-amber-800',
  CANCELLED: 'bg-red-100 text-red-800',
  EXPIRED: 'bg-slate-100 text-slate-600',
  // Sample
  COLLECTED: 'bg-blue-100 text-blue-800',
  RECEIVED_AT_LAB: 'bg-indigo-100 text-indigo-800',
  ACCEPTED: 'bg-green-100 text-green-800',
  REJECTED: 'bg-red-100 text-red-800',
  IN_TESTING: 'bg-purple-100 text-purple-800',
  COMPLETED: 'bg-green-100 text-green-800',
  // Result / report
  RELEASED: 'bg-green-100 text-green-800',
  ENTERED: 'bg-blue-100 text-blue-800',
  COMPLETE: 'bg-green-100 text-green-800',
  PENDING: 'bg-amber-100 text-amber-800',
  AMENDED: 'bg-orange-100 text-orange-800',
  // Flags
  NORMAL: 'bg-green-100 text-green-800',
  LOW: 'bg-amber-100 text-amber-800',
  HIGH: 'bg-amber-100 text-amber-800',
  CRITICAL_LOW: 'bg-red-100 text-red-800',
  CRITICAL_HIGH: 'bg-red-100 text-red-800',
  ABNORMAL: 'bg-orange-100 text-orange-800',
};

export function StatusBadge({ status }: { status: string }) {
  const color = COLORS[status] ?? 'bg-slate-100 text-slate-700';
  return (
    <span className={clsx('badge', color)}>
      {status.replace(/_/g, ' ')}
    </span>
  );
}

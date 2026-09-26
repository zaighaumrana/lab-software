// Shared domain constants and types
// Keep in sync with Prisma enums and 03_Core_Domain_Design.md

export const ROLES = {
  ADMIN: 'ADMIN',
  RECEPTION: 'RECEPTION',
  SAMPLE_COLLECTOR: 'SAMPLE_COLLECTOR',
  LAB_TECH: 'LAB_TECH',
  LAB_OPERATOR: 'LAB_OPERATOR',
  CASHIER: 'CASHIER',
  PATHOLOGIST: 'PATHOLOGIST',
  ACCOUNTANT: 'ACCOUNTANT',
  DOCTOR_PORTAL: 'DOCTOR_PORTAL',
  CORPORATE_MANAGER: 'CORPORATE_MANAGER',
  WEBSITE_CONTENT_MANAGER: 'WEBSITE_CONTENT_MANAGER',
} as const;

export type Role = (typeof ROLES)[keyof typeof ROLES];

/** Roles enabled for this client's v1 deployment */
export const V1_ACTIVE_ROLES: Role[] = [ROLES.ADMIN, ROLES.LAB_OPERATOR];

export const BOOKING_STATUS = {
  PENDING_REVIEW: 'PENDING_REVIEW',
  CONFIRMED: 'CONFIRMED',
  CHECKED_IN: 'CHECKED_IN',
  CONVERTED: 'CONVERTED',
  EXPIRED: 'EXPIRED',
  CANCELLED: 'CANCELLED',
} as const;

export const INVOICE_STATUS = {
  DRAFT: 'DRAFT',
  ISSUED: 'ISSUED',
  VOIDED: 'VOIDED',
  CLOSED: 'CLOSED',
  REFUNDED: 'REFUNDED',
} as const;

export const SAMPLE_STATUS = {
  PENDING_COLLECTION: 'PENDING_COLLECTION',
  COLLECTED: 'COLLECTED',
  IN_TRANSIT: 'IN_TRANSIT',
  RECEIVED_AT_LAB: 'RECEIVED_AT_LAB',
  ACCEPTED: 'ACCEPTED',
  REJECTED: 'REJECTED',
  RECOLLECTED: 'RECOLLECTED',
  IN_TESTING: 'IN_TESTING',
  COMPLETED: 'COMPLETED',
  DISCARDED: 'DISCARDED',
} as const;

export const RESULT_STATUS = {
  ENTERED: 'ENTERED',
  RELEASED: 'RELEASED',
  SUPERSEDED: 'SUPERSEDED',
  VOIDED: 'VOIDED',
} as const;

export const REPORT_STATUS = {
  PENDING: 'PENDING',
  PARTIAL_READY: 'PARTIAL_READY',
  COMPLETE: 'COMPLETE',
  AMENDED: 'AMENDED',
  ARCHIVED: 'ARCHIVED',
} as const;

export const PAYMENT_METHODS = {
  CASH: 'CASH',
  BANK_TRANSFER: 'BANK_TRANSFER',
  EASYPAISA: 'EASYPAISA',
  JAZZCASH: 'JAZZCASH',
  CARD: 'CARD',
  OTHER: 'OTHER',
} as const;

/** Payment methods enabled at launch for this client */
export const V1_ENABLED_PAYMENT_METHODS = [
  PAYMENT_METHODS.CASH,
  PAYMENT_METHODS.BANK_TRANSFER,
  PAYMENT_METHODS.EASYPAISA,
  PAYMENT_METHODS.JAZZCASH,
] as const;

export * from './sms-segmentation';
export * from './sms-placeholders';
export * from './sms-events';
export * from './phone';

export const FEATURE_FLAGS = {
  INVENTORY: 'inventory',
  ANALYZER_INTEGRATION: 'analyzer_integration',
  WHATSAPP: 'whatsapp',
  DOCTOR_PORTAL: 'doctor_portal',
  MULTI_BRANCH: 'multi_branch',
  ANALYTICS_AI: 'analytics_ai',
} as const;

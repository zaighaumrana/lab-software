export interface AuthUser {
  userId: string;
  tenantId: string;
  branchId: string | null;
  role: string;
  fullName: string;
  username: string;
}

export interface Patient {
  id: string;
  labNumber: string;
  mrcNumber: string;
  fullName: string;
  phone: string;
  phoneAlt?: string | null;
  cnic?: string | null;
  dateOfBirth?: string | null;
  gender?: string | null;
  address?: string | null;
  email?: string | null;
  bloodGroup?: string | null;
  notes?: string | null;
  smsConsent: boolean;
  createdAt: string;
}

export interface TestParameter {
  id: string;
  code: string;
  name: string;
  valueType: string;
  unit?: string | null;
  sortOrder: number;
  isRequired: boolean;
  decimalPlaces?: number | null;
  referenceRanges: ReferenceRange[];
  choices: { id: string; value: string; label: string }[];
}

export interface ReferenceRange {
  id: string;
  gender?: string | null;
  ageMinMonths?: number | null;
  ageMaxMonths?: number | null;
  lowNormal?: number | string | null;
  highNormal?: number | string | null;
  criticalLow?: number | string | null;
  criticalHigh?: number | string | null;
  unit?: string | null;
}

export interface Test {
  id: string;
  code: string;
  name: string;
  category?: string | null;
  sampleType?: string | null;
  basePrice: number | string;
  turnaroundHours?: number | null;
  isActive: boolean;
  isPanel: boolean;
  parameters: TestParameter[];
}

export interface Package {
  id: string;
  code: string;
  name: string;
  basePrice: number | string;
  description?: string | null;
  isActive: boolean;
  items: { id: string; testId: string | null; test?: Test | null }[];
}

export interface Doctor {
  id: string;
  fullName: string;
  phone?: string | null;
  email?: string | null;
  specialty?: string | null;
  clinicName?: string | null;
  shareType: string;
  shareValue: number | string;
  notes?: string | null;
  isActive: boolean;
}

export interface Booking {
  id: string;
  bookingCode: string;
  status: string;
  source: string;
  patientId: string;
  doctorId?: string | null;
  patient?: Patient;
  doctor?: Doctor | null;
  invoice?: Invoice | null;
  createdAt: string;
}

export interface InvoiceLine {
  id: string;
  testId?: string | null;
  packageId?: string | null;
  description: string;
  quantity: number;
  basePrice?: number | string;
  unitPrice: number | string;
  discountAmount?: number | string;
  manualDiscountReason?: string | null;
  lineTotal: number | string;
  test?: Test | null;
}

export interface Payment {
  id: string;
  amount: number | string;
  method: string;
  status: string;
  reference?: string | null;
  receivedAt?: string | null;
}

export interface Invoice {
  visitId?: string | null;
  visit?: { orderedTests: OrderedTest[] } | null;
  id: string;
  invoiceNumber: string;
  status: string;
  subtotal: number | string;
  discountTotal: number | string;
  grandTotal: number | string;
  amountPaid: number | string;
  amountDue: number | string;
  createdAt?: string;
  lines: InvoiceLine[];
  payments: Payment[];
  booking?: Booking;
  report?: {
    id: string;
    trackingId: string;
    reportNumber: string;
    status: string;
  } | null;
  samples?: { id: string; sampleCode: string; status: string }[];
}

export interface InvoiceReadiness {
  testLineCount: number;
  enteredCount: number;
  allEntered: boolean;
  allReleased: boolean;
}

export interface InvoiceResultPreviewValue {
  label: string;
  unit: string | null;
  value: string;
}

export interface InvoiceResultPreview {
  orderedTestId?: string;
  occurrenceNo?: number;
  testId: string;
  testCode: string;
  testName: string;
  status: string;
  values: InvoiceResultPreviewValue[];
}

export interface Sample {
  visitId?: string | null;
  assignments?: { orderedTest: OrderedTest }[];
  id: string;
  sampleCode: string;
  status: string;
  sampleType?: string | null;
  collectedAt?: string | null;
  isOutsourced?: boolean;
  externalLabName?: string | null;
  outsourcingCost?: number | string | null;
  results?: Result[];
  invoice?: Invoice & {
    booking?: Booking & { patient?: Patient };
    lines?: InvoiceLine[];
  };
  // Present on getSample() responses — readiness computed across ALL
  // samples on this sample's invoice (not just this one), backing the
  // "Ready for Collection" action. Absent on list responses.
  invoiceReadiness?: InvoiceReadiness | null;
  // Present on getSample() responses — one entry per test that has a
  // result entered anywhere on the invoice, used to render the
  // confirmation preview before sending a report out for collection.
  invoiceResultsPreview?: InvoiceResultPreview[];
}

export interface ResultValue {
  id: string;
  testParameterId?: string | null;
  versionParameterId?: string | null;
  valueNumeric?: number | string | null;
  valueText?: string | null;
  unit?: string | null;
  flag?: string | null;
  isCritical: boolean;
  parameter?: TestParameter;
}

export interface Result {
  orderedTestId?: string | null;
  testVersionId?: string | null;
  revisionNo?: number | null;
  id: string;
  status: string;
  isCritical: boolean;
  testId?: string;
  test?: Test;
  values: ResultValue[];
  enteredAt: string;
  releasedAt?: string | null;
  notes?: string | null;
}

export interface OrderedTest {
  id: string;
  occurrenceNo: number;
  invoiceLineId?: string | null;
  testVersion: { testId: string; codeSnapshot: string; nameSnapshot: string; versionParameters: TestParameter[] };
}

export interface Report {
  id: string;
  reportNumber: string;
  trackingId: string;
  status: string;
  finalized?: boolean;
  deliverable?: boolean;
  generatedAt?: string | null;
  printedAt?: string | null;
  printCount?: number;
  createdAt?: string;
  invoice?: ReportInvoice;
}

/**
 * Sample shape as returned alongside a Report — richer than the base
 * `Invoice.samples` entry (which the invoice list/detail views use and
 * don't need `results` for): it always includes each sample's released
 * results, since that's exactly what the report document/print pages need.
 */
export interface ReportSample {
  id: string;
  sampleCode: string;
  status: string;
  results?: Result[];
}

/**
 * `Invoice`, as seen through a `Report`: deeper `booking`/`lines`/`payments`
 * includes, and `samples` replaced by the richer `ReportSample` shape
 * above. Built with `Omit<Invoice, 'samples'>` rather than a plain
 * intersection — intersecting two conflicting `samples` array types
 * doesn't override the property, it requires values to satisfy both at
 * once, which silently hid `results` from the merged type. This still uses
 * `&` (not `interface ... extends`) for the outer merge: `extends` would
 * reject narrowing `Invoice`'s required `lines`/`payments` to optional here,
 * whereas intersecting with the same (compatible) optional shape is fine —
 * the two sides simply don't conflict once `samples` is removed.
 */
export type ReportInvoice = Omit<Invoice, 'samples'> & {
  booking?: Booking & { patient?: Patient; doctor?: Doctor | null };
  lines?: InvoiceLine[];
  payments?: Payment[];
  samples?: ReportSample[];
};

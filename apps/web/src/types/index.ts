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

export interface Sample {
  id: string;
  sampleCode: string;
  status: string;
  sampleType?: string | null;
  collectedAt?: string | null;
  invoice?: Invoice & {
    booking?: Booking & { patient?: Patient };
    lines?: InvoiceLine[];
  };
}

export interface ResultValue {
  id: string;
  testParameterId: string;
  valueNumeric?: number | string | null;
  valueText?: string | null;
  unit?: string | null;
  flag?: string | null;
  isCritical: boolean;
  parameter?: TestParameter;
}

export interface Result {
  id: string;
  status: string;
  isCritical: boolean;
  test?: Test;
  values: ResultValue[];
  enteredAt: string;
  releasedAt?: string | null;
}

export interface Report {
  id: string;
  reportNumber: string;
  trackingId: string;
  status: string;
  generatedAt?: string | null;
  createdAt?: string;
  invoice?: Invoice & {
    booking?: Booking & { patient?: Patient; doctor?: Doctor | null };
    lines?: InvoiceLine[];
    payments?: Payment[];
    samples?: {
      id: string;
      results?: Result[];
    }[];
  };
}

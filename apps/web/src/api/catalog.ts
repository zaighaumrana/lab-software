import { api } from './client';
import type { Test, Package } from '../types';

export async function listTests(all = false) {
  const { data } = await api.get<Test[]>('/catalog/tests', {
    params: all ? { all: 'true' } : undefined,
  });
  return data;
}

export async function getTest(id: string) {
  const { data } = await api.get<Test>(`/catalog/tests/${id}`);
  return data;
}

export interface ReferenceRangePayload {
  gender?: 'MALE' | 'FEMALE' | 'OTHER' | 'UNKNOWN';
  ageMinMonths?: number;
  ageMaxMonths?: number;
  lowNormal?: number;
  highNormal?: number;
  criticalLow?: number;
  criticalHigh?: number;
  unit?: string;
  interpretation?: string;
}

export interface ParameterChoicePayload {
  value: string;
  label: string;
  sortOrder?: number;
}

export interface TestParameterPayload {
  code: string;
  name: string;
  valueType?: 'NUMERIC' | 'TEXT' | 'BOOLEAN' | 'CHOICE';
  unit?: string;
  sortOrder?: number;
  isRequired?: boolean;
  decimalPlaces?: number;
  referenceRanges?: ReferenceRangePayload[];
  choices?: ParameterChoicePayload[];
}

export interface TestPayload {
  code: string;
  name: string;
  category?: string;
  sampleType?: string;
  basePrice: number;
  turnaroundHours?: number;
  description?: string;
  isActive?: boolean;
  isPanel?: boolean;
  parameters?: TestParameterPayload[];
}

export async function createTest(payload: TestPayload) {
  const { data } = await api.post<Test>('/catalog/tests', payload);
  return data;
}

export async function updateTest(id: string, payload: Partial<TestPayload>) {
  const { data } = await api.patch<Test>(`/catalog/tests/${id}`, payload);
  return data;
}

export async function replaceTestParameters(
  id: string,
  parameters: TestParameterPayload[],
) {
  const { data } = await api.patch<Test>(`/catalog/tests/${id}/parameters`, {
    parameters,
  });
  return data;
}

export async function listPackages(all = false) {
  const { data } = await api.get<Package[]>('/catalog/packages', {
    params: all ? { all: 'true' } : undefined,
  });
  return data;
}

export interface PackagePayload {
  code: string;
  name: string;
  basePrice: number;
  description?: string;
  isActive?: boolean;
  testIds: string[];
}

export async function createPackage(payload: PackagePayload) {
  const { data } = await api.post<Package>('/catalog/packages', payload);
  return data;
}

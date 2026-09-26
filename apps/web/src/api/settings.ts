import { api } from './client';
import type { SmsEventKey } from '@lms/shared';

export interface Branding {
  labName: string;
  primaryColor: string;
  secondaryColor: string;
  logoDataUrl: string | null;
}

export interface PrintLayout {
  labName: string;
  labNumber: string;
  address: string;
  phone: string;
  email: string;
  footerText: string;
  printMode: 'PLAIN' | 'LETTERHEAD';
  marginTopMm: number;
  marginBottomMm: number;
  reportPagination: 'CONTINUOUS' | 'ONE_TEST_PER_PAGE';
}

export interface StaffUser {
  id: string;
  username: string;
  fullName: string;
  role: string;
  email?: string | null;
  isActive: boolean;
  lastLoginAt?: string | null;
  createdAt?: string;
}

export async function getSettings() {
  const { data } = await api.get<{ branding: Branding; printLayout: PrintLayout }>(
    '/settings',
  );
  return data;
}

export async function saveBranding(payload: Branding) {
  const { data } = await api.put<Branding>('/settings/branding', payload);
  return data;
}

export async function savePrintLayout(payload: PrintLayout) {
  const { data } = await api.put<PrintLayout>('/settings/print-layout', payload);
  return data;
}

export async function listUsers() {
  const { data } = await api.get<StaffUser[]>('/settings/users');
  return data;
}

export async function createUser(payload: {
  username: string;
  password: string;
  fullName: string;
  role: string;
  email?: string;
}) {
  const { data } = await api.post<StaffUser>('/settings/users', payload);
  return data;
}

export async function updateUser(
  id: string,
  payload: {
    fullName?: string;
    role?: string;
    email?: string;
    isActive?: boolean;
    password?: string;
  },
) {
  const { data } = await api.patch<StaffUser>(`/settings/users/${id}`, payload);
  return data;
}

// ----- SMS / Notifications -----

export interface SmsProviderStatus {
  name: string;
  configured: boolean;
  sender: string | null;
  balance: number | null;
}

export interface SmsEventSettings {
  key: SmsEventKey;
  label: string;
  variables: string[];
  exampleBody: string;
  exampleValues: Record<string, string>;
  body: string;
  isActive: boolean;
  sendpkTemplateId: string | null;
  sendpkTemplateName: string | null;
  sendpkApprovedBody: string | null;
  sendpkRequiredVariables: string[];
  sendpkLastSyncedAt: string | null;
}

export interface SmsSettings {
  provider: SmsProviderStatus;
  events: SmsEventSettings[];
}

export interface SendPkTemplateOption {
  id: string;
  name: string;
  message: string;
  variables: string[];
}

export async function getSmsSettings() {
  const { data } = await api.get<SmsSettings>('/settings/sms');
  return data;
}

export async function saveSmsTemplate(
  key: SmsEventKey,
  payload: { body: string; isActive: boolean; sendpkTemplateId?: string | null },
) {
  const { data } = await api.put(`/settings/sms/${key}`, payload);
  return data;
}

export async function syncSendPkTemplates() {
  const { data } = await api.post<SendPkTemplateOption[]>('/settings/sms/sync');
  return data;
}

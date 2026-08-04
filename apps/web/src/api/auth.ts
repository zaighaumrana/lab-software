import { api, setSession, clearSession } from './client';
import type { AuthUser } from '../types';

export async function login(username: string, password: string) {
  const { data } = await api.post<{
    sessionId: string;
    user: {
      id: string;
      username: string;
      fullName: string;
      role: string;
      tenantId: string;
      branchId: string | null;
    };
  }>('/auth/login', { username, password });

  setSession(data.sessionId);

  const user: AuthUser = {
    userId: data.user.id,
    tenantId: data.user.tenantId,
    branchId: data.user.branchId,
    role: data.user.role,
    fullName: data.user.fullName,
    username: data.user.username,
  };
  localStorage.setItem('lms_user', JSON.stringify(user));
  return user;
}

export async function logout() {
  try {
    await api.post('/auth/logout');
  } finally {
    clearSession();
  }
}

export async function me(): Promise<AuthUser> {
  const { data } = await api.get<AuthUser>('/auth/me');
  localStorage.setItem('lms_user', JSON.stringify(data));
  return data;
}

export function getStoredUser(): AuthUser | null {
  const raw = localStorage.getItem('lms_user');
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AuthUser;
  } catch {
    return null;
  }
}

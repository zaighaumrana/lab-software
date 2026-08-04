import axios from 'axios';

const SESSION_KEY = 'lms_session_id';

export const api = axios.create({
  baseURL: '/api',
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use((config) => {
  const sessionId = localStorage.getItem(SESSION_KEY);
  if (sessionId) {
    config.headers.Authorization = `Bearer ${sessionId}`;
  }
  // Single-tenant defaults for early testing; session provides real tenant after login
  if (!config.headers['x-tenant-id']) {
    config.headers['x-tenant-id'] = 'default-tenant';
  }
  if (!config.headers['x-branch-id']) {
    config.headers['x-branch-id'] = 'default-branch';
  }
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem(SESSION_KEY);
      localStorage.removeItem('lms_user');
      if (window.location.pathname !== '/login') {
        window.location.href = '/login';
      }
    }
    return Promise.reject(err);
  },
);

export function setSession(sessionId: string) {
  localStorage.setItem(SESSION_KEY, sessionId);
}

export function clearSession() {
  localStorage.removeItem(SESSION_KEY);
  localStorage.removeItem('lms_user');
}

export function getSessionId() {
  return localStorage.getItem(SESSION_KEY);
}

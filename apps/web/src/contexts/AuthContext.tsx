import {
  createContext,
  useContext,
  useState,
  useEffect,
  type ReactNode,
} from 'react';
import type { AuthUser } from '../types';
import * as authApi from '../api/auth';
import { getSessionId } from '../api/client';

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  /** Re-fetches the current user (e.g. after a profile edit) so header/
   * nav reflect the change immediately, without needing a re-login. */
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(authApi.getStoredUser());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const sessionId = getSessionId();
    if (!sessionId) {
      setLoading(false);
      return;
    }
    authApi
      .me()
      .then(setUser)
      .catch(() => {
        setUser(null);
        authApi.logout();
      })
      .finally(() => setLoading(false));
  }, []);

  async function login(username: string, password: string) {
    const u = await authApi.login(username, password);
    setUser(u);
  }

  async function logout() {
    await authApi.logout();
    setUser(null);
  }

  async function refreshUser() {
    const u = await authApi.me();
    setUser(u);
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

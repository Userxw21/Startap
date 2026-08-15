import { createContext, useContext, useEffect, useState } from 'react';
import type { SafeUser } from '@courier/shared-types';
import { apiFetch, login as apiLogin, logout as apiLogout, AuthExpiredError } from '../lib/api';
import { getAccessToken } from '../lib/auth-storage';

interface AuthContextValue {
  status: 'loading' | 'signedIn' | 'signedOut';
  user: SafeUser | null;
  error: string | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/**
 * On mount, tries GET /auth/me with whatever token is already in
 * SecureStore (from a previous session) rather than asking the user to log
 * in every app launch. apiFetch's own refresh-on-401 handles an expired
 * access token transparently; only a truly dead refresh token (or no
 * stored session at all) lands here as signedOut.
 */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<AuthContextValue['status']>('loading');
  const [user, setUser] = useState<SafeUser | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const token = await getAccessToken();
      if (!token) {
        setStatus('signedOut');
        return;
      }
      try {
        const me = await apiFetch<SafeUser>('/auth/me');
        setUser(me);
        setStatus('signedIn');
      } catch {
        setStatus('signedOut');
      }
    })();
  }, []);

  async function login(email: string, password: string) {
    setError(null);
    try {
      const result = await apiLogin(email, password);
      setUser(result.user);
      setStatus('signedIn');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
      throw err;
    }
  }

  async function logout() {
    await apiLogout();
    setUser(null);
    setStatus('signedOut');
  }

  return (
    <AuthContext.Provider value={{ status, user, error, login, logout }}>{children}</AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

export { AuthExpiredError };

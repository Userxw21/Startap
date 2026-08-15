import type { LoginResponse, TokenPair } from '@courier/shared-types';
import { BACKEND_API_URL } from './config';
import { clearTokens, getAccessToken, getRefreshToken, saveTokens } from './auth-storage';

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

/** Thrown when both the access token and a refresh attempt fail — callers should treat this as "log the user out", not a generic error to display. */
export class AuthExpiredError extends Error {}

async function rawFetch(path: string, options: { method?: string; body?: unknown; token?: string | null }) {
  return fetch(`${BACKEND_API_URL}${path}`, {
    method: options.method ?? 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
    },
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });
}

async function tryRefresh(): Promise<string | null> {
  const refreshToken = await getRefreshToken();
  if (!refreshToken) return null;

  const res = await rawFetch('/auth/refresh', { method: 'POST', body: { refreshToken } });
  if (!res.ok) return null;

  const data = (await res.json()) as TokenPair;
  await saveTokens(data);
  return data.accessToken;
}

/**
 * Unlike the dashboard's apiFetch (server-side only, redirects to /login on
 * 401 via Next's router), this runs on-device and has no router to redirect
 * through — a 401 here means "try to refresh once, and if that also fails,
 * throw AuthExpiredError" so the caller (AuthContext) can clear state and
 * let the navigator's auth check naturally show the login screen.
 */
export async function apiFetch<T>(
  path: string,
  options: { method?: string; body?: unknown; skipAuth?: boolean } = {},
): Promise<T> {
  const token = options.skipAuth ? null : await getAccessToken();
  let res = await rawFetch(path, { method: options.method, body: options.body, token });

  if (res.status === 401 && !options.skipAuth) {
    const newToken = await tryRefresh();
    if (!newToken) {
      await clearTokens();
      throw new AuthExpiredError();
    }
    res = await rawFetch(path, { method: options.method, body: options.body, token: newToken });
  }

  if (res.status === 204) {
    return undefined as T;
  }

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    const message = typeof data.message === 'string' ? data.message : `Request failed with status ${res.status}`;
    throw new ApiError(res.status, message);
  }

  return data as T;
}

export async function login(email: string, password: string): Promise<LoginResponse> {
  const data = await apiFetch<LoginResponse>('/auth/login', {
    method: 'POST',
    body: { email, password },
    skipAuth: true,
  });
  await saveTokens(data);
  return data;
}

export async function logout(): Promise<void> {
  // /auth/logout requires a valid access token (it's not @Public()), so this
  // has to run before clearTokens() — otherwise there'd be nothing to send.
  const [accessToken, refreshToken] = await Promise.all([getAccessToken(), getRefreshToken()]);
  if (refreshToken) {
    // Best-effort — the device is logging out regardless, so a network failure here shouldn't block it.
    await rawFetch('/auth/logout', { method: 'POST', body: { refreshToken }, token: accessToken }).catch(
      () => undefined,
    );
  }
  await clearTokens();
}

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { ACCESS_COOKIE } from './auth-cookies';

const BACKEND_API_URL = process.env.BACKEND_API_URL ?? 'http://localhost:3000/api/v1';

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

/**
 * Server-side only (Server Components / Server Actions / Route Handlers) —
 * reads the access token from the httpOnly cookie, never passes through
 * client-side JS. On a 401, the access token is missing/expired/invalid;
 * rather than have every call site handle that, we redirect straight to
 * login here — middleware already tried a refresh before the request
 * reached this far (see middleware.ts), so a 401 at this point means the
 * refresh token is also gone/invalid, not just a stale access token.
 */
export async function apiFetch<T>(
  path: string,
  options: { method?: string; body?: unknown; cache?: RequestCache } = {},
): Promise<T> {
  const token = cookies().get(ACCESS_COOKIE)?.value;

  const res = await fetch(`${BACKEND_API_URL}${path}`, {
    method: options.method ?? 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    cache: options.cache ?? 'no-store',
  });

  if (res.status === 401) {
    redirect('/login');
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

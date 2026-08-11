import { NextRequest, NextResponse } from 'next/server';
import { ACCESS_COOKIE, REFRESH_COOKIE, accessCookieOptions, refreshCookieOptions } from '@/lib/auth-cookies';

const BACKEND_API_URL = process.env.BACKEND_API_URL ?? 'http://localhost:3000/api/v1';

/**
 * Protects everything except /login, /accept-invite (public — the invitee
 * has no account yet, that's the whole point of the page) and framework
 * internals. Access tokens
 * are short-lived (15m, matching the backend) on purpose, so a courier-
 * company admin leaving the dashboard open all day would otherwise get
 * logged out constantly — this middleware silently refreshes using the
 * long-lived refresh cookie before that happens, so the only time a user
 * actually sees /login again is when the refresh token itself is gone
 * (30 days idle, or an explicit logout).
 */
export async function middleware(request: NextRequest) {
  const accessToken = request.cookies.get(ACCESS_COOKIE)?.value;
  if (accessToken) {
    return NextResponse.next();
  }

  const refreshToken = request.cookies.get(REFRESH_COOKIE)?.value;
  if (!refreshToken) {
    return redirectToLogin(request);
  }

  try {
    const res = await fetch(`${BACKEND_API_URL}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
      cache: 'no-store',
    });

    if (!res.ok) {
      return redirectToLogin(request);
    }

    const data = await res.json();
    const response = NextResponse.next();
    response.cookies.set(ACCESS_COOKIE, data.accessToken, accessCookieOptions());
    response.cookies.set(REFRESH_COOKIE, data.refreshToken, refreshCookieOptions());
    return response;
  } catch {
    return redirectToLogin(request);
  }
}

function redirectToLogin(request: NextRequest): NextResponse {
  const loginUrl = new URL('/login', request.url);
  const response = NextResponse.redirect(loginUrl);
  response.cookies.delete(ACCESS_COOKIE);
  response.cookies.delete(REFRESH_COOKIE);
  return response;
}

export const config = {
  matcher: ['/((?!login|accept-invite|api|_next/static|_next/image|favicon.ico).*)'],
};

export const ACCESS_COOKIE = 'cp_access';
export const REFRESH_COOKIE = 'cp_refresh';
export const LOCALE_COOKIE = 'cp_locale';

const FIFTEEN_MINUTES = 60 * 15;
const THIRTY_DAYS = 60 * 60 * 24 * 30;

/**
 * Shared shape for both `next/headers` cookies().set() (Server Actions /
 * Route Handlers) and NextResponse.cookies.set() (middleware) — both accept
 * this same options object, which is why this lives in one place instead of
 * being duplicated at every call site.
 */
export function accessCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
    maxAge: FIFTEEN_MINUTES,
  };
}

export function refreshCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
    maxAge: THIRTY_DAYS,
  };
}

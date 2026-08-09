import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { ACCESS_COOKIE, REFRESH_COOKIE } from '@/lib/auth-cookies';

const BACKEND_API_URL = process.env.BACKEND_API_URL ?? 'http://localhost:3000/api/v1';

export async function POST(request: Request) {
  const refreshToken = cookies().get(REFRESH_COOKIE)?.value;

  if (refreshToken) {
    // Best-effort — even if this fails, clearing the local cookies below is
    // what actually logs the browser out. The backend token still expires
    // on its own TTL either way.
    await fetch(`${BACKEND_API_URL}/auth/logout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    }).catch(() => undefined);
  }

  const response = NextResponse.redirect(new URL('/login', request.url));
  response.cookies.delete(ACCESS_COOKIE);
  response.cookies.delete(REFRESH_COOKIE);
  return response;
}

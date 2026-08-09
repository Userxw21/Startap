'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { ACCESS_COOKIE, REFRESH_COOKIE, accessCookieOptions, refreshCookieOptions } from '@/lib/auth-cookies';

const BACKEND_API_URL = process.env.BACKEND_API_URL ?? 'http://localhost:3000/api/v1';

export interface LoginState {
  error?: string;
}

export async function loginAction(_prevState: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get('email') ?? '').trim();
  const password = String(formData.get('password') ?? '');

  if (!email || !password) {
    return { error: 'missing' };
  }

  const res = await fetch(`${BACKEND_API_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
    cache: 'no-store',
  });

  if (!res.ok) {
    return { error: 'invalid' };
  }

  const data = await res.json();
  cookies().set(ACCESS_COOKIE, data.accessToken, accessCookieOptions());
  cookies().set(REFRESH_COOKIE, data.refreshToken, refreshCookieOptions());

  redirect('/overview');
}

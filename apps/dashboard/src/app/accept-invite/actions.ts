'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { ACCESS_COOKIE, REFRESH_COOKIE, accessCookieOptions, refreshCookieOptions } from '@/lib/auth-cookies';

const BACKEND_API_URL = process.env.BACKEND_API_URL ?? 'http://localhost:3000/api/v1';

export interface AcceptInviteState {
  error?: 'tooShort' | 'mismatch' | 'failed';
}

export async function acceptInviteAction(
  token: string,
  _prevState: AcceptInviteState,
  formData: FormData,
): Promise<AcceptInviteState> {
  const password = String(formData.get('password') ?? '');
  const confirmPassword = String(formData.get('confirmPassword') ?? '');

  if (password.length < 12) {
    return { error: 'tooShort' };
  }
  if (password !== confirmPassword) {
    return { error: 'mismatch' };
  }

  const res = await fetch(`${BACKEND_API_URL}/invites/accept`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token, password }),
    cache: 'no-store',
  });

  if (!res.ok) {
    return { error: 'failed' };
  }

  const data = await res.json();
  cookies().set(ACCESS_COOKIE, data.accessToken, accessCookieOptions());
  cookies().set(REFRESH_COOKIE, data.refreshToken, refreshCookieOptions());

  redirect('/overview');
}

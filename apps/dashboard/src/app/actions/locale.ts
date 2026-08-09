'use server';

import { cookies } from 'next/headers';
import { LOCALE_COOKIE } from '@/lib/auth-cookies';
import { isSupportedLocale } from '@/lib/i18n';

export async function setLocaleAction(locale: string): Promise<void> {
  if (!isSupportedLocale(locale)) return;
  cookies().set(LOCALE_COOKIE, locale, { path: '/', maxAge: 60 * 60 * 24 * 365 });
}

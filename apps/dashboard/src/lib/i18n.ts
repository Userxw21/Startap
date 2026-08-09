import { createTranslator } from 'next-intl';
import { cookies } from 'next/headers';
import { LOCALE_COOKIE } from './auth-cookies';
import uz from '../messages/uz.json';
import ru from '../messages/ru.json';
import en from '../messages/en.json';

export type Locale = 'uz' | 'ru' | 'en';
export const SUPPORTED_LOCALES: Locale[] = ['uz', 'ru', 'en'];
export const DEFAULT_LOCALE: Locale = 'uz';

const MESSAGES: Record<Locale, typeof uz> = { uz, ru, en };

export function isSupportedLocale(value: string | undefined): value is Locale {
  return !!value && (SUPPORTED_LOCALES as string[]).includes(value);
}

export function getMessages(locale: Locale) {
  return MESSAGES[locale] ?? MESSAGES[DEFAULT_LOCALE];
}

/**
 * For Server Components — deliberately NOT using next-intl's request-config
 * machinery (the `i18n/request.ts` + plugin wiring next-intl's docs show for
 * the App Router), which needs a live Next.js build to fully verify wiring
 * end-to-end and wasn't something I could test here. `createTranslator` is
 * next-intl's plain, config-free function: give it a locale and messages,
 * get a `t()` back. Client Components use `useTranslations()` instead, fed
 * by <NextIntlClientProvider> in the root layout — see app/layout.tsx.
 */
export function getTranslator(locale: Locale) {
  return createTranslator({ locale, messages: getMessages(locale) });
}

/** Server Components only — reads the locale cookie set by the language switcher. */
export function getRequestLocale(): Locale {
  const value = cookies().get(LOCALE_COOKIE)?.value;
  return isSupportedLocale(value) ? value : DEFAULT_LOCALE;
}

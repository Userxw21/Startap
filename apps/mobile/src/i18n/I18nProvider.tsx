import { createContext, useContext, useMemo, useState } from 'react';
import * as Localization from 'expo-localization';
import { DEFAULT_LOCALE, Locale, SUPPORTED_LOCALES, translations } from './translations';

function detectDeviceLocale(): Locale {
  const tag = Localization.getLocales()[0]?.languageCode;
  return (SUPPORTED_LOCALES as string[]).includes(tag ?? '') ? (tag as Locale) : DEFAULT_LOCALE;
}

interface I18nContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (path: string, vars?: Record<string, string>) => string;
}

const I18nContext = createContext<I18nContextValue | null>(null);

/** Reads a dot-path like "auth.title" out of the nested translations object. */
function resolve(dict: Record<string, unknown>, path: string): string {
  const value = path.split('.').reduce<unknown>((node, key) => {
    if (node && typeof node === 'object' && key in node) {
      return (node as Record<string, unknown>)[key];
    }
    return undefined;
  }, dict);
  return typeof value === 'string' ? value : path;
}

/** "{phone}" -> vars.phone — same {placeholder} syntax the dashboard's next-intl messages use, for consistency. */
function interpolate(text: string, vars?: Record<string, string>): string {
  if (!vars) return text;
  return text.replace(/\{(\w+)\}/g, (match, key) => vars[key] ?? match);
}

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocale] = useState<Locale>(detectDeviceLocale);

  const value = useMemo<I18nContextValue>(
    () => ({
      locale,
      setLocale,
      t: (path: string, vars?: Record<string, string>) => interpolate(resolve(translations[locale], path), vars),
    }),
    [locale],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useTranslation() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useTranslation must be used within I18nProvider');
  return ctx;
}

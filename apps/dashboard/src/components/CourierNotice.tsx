import { LanguageSwitcher } from './LanguageSwitcher';
import type { Locale } from '@/lib/i18n';

/**
 * Every backend endpoint the dashboard's pages call (couriers/orders/
 * analytics list/detail) is COMPANY_ADMIN/DISPATCHER-only — a COURIER
 * account has no real use for this dashboard (couriers work from the
 * mobile app, per the original architecture). Shown by (dashboard)/layout.tsx
 * instead of the normal Sidebar+content for any COURIER-role session, so
 * they get one clear message here instead of an uncaught 403 on whichever
 * page they happened to land on.
 */
export function CourierNotice({
  locale,
  title,
  message,
  logoutLabel,
}: {
  locale: Locale;
  title: string;
  message: string;
  logoutLabel: string;
}) {
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-lg border border-ink-200 bg-white p-8 text-center shadow-sm">
        <h1 className="text-lg font-semibold text-ink-900">{title}</h1>
        <p className="mt-2 text-sm text-ink-500">{message}</p>
        <div className="mt-6 flex items-center justify-center gap-4">
          <LanguageSwitcher current={locale} />
          <form action="/api/auth/logout" method="POST">
            <button type="submit" className="text-sm font-medium text-ink-500 transition hover:text-bad">
              {logoutLabel}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

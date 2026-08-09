import { LanguageSwitcher } from './LanguageSwitcher';
import { LiveIndicator } from './LiveIndicator';
import type { Locale } from '@/lib/i18n';
import type { SafeUser } from '@/lib/types';

export function Topbar({ user, locale, logoutLabel }: { user: SafeUser; locale: Locale; logoutLabel: string }) {
  return (
    <header className="flex items-center justify-between border-b border-ink-200 bg-white px-6 py-3">
      <LiveIndicator />
      <div className="flex items-center gap-4">
        <LanguageSwitcher current={locale} />
        <span className="text-sm text-ink-700">{user.fullName}</span>
        <form action="/api/auth/logout" method="POST">
          <button type="submit" className="text-sm font-medium text-ink-500 transition hover:text-bad">
            {logoutLabel}
          </button>
        </form>
      </div>
    </header>
  );
}

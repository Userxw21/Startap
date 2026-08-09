'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { setLocaleAction } from '@/app/actions/locale';
import type { Locale } from '@/lib/i18n';

const LABELS: Record<Locale, string> = {
  uz: "O'zbekcha",
  ru: 'Русский',
  en: 'English',
};

export function LanguageSwitcher({ current }: { current: Locale }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  return (
    <select
      aria-label="Language"
      value={current}
      disabled={isPending}
      onChange={(e) => {
        const next = e.target.value;
        startTransition(async () => {
          await setLocaleAction(next);
          router.refresh();
        });
      }}
      className="rounded-sm border border-ink-200 bg-white px-2 py-1 text-sm text-ink-700"
    >
      {(Object.keys(LABELS) as Locale[]).map((code) => (
        <option key={code} value={code}>
          {LABELS[code]}
        </option>
      ))}
    </select>
  );
}

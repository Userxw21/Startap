'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';

const LINKS = [
  { href: '/overview', key: 'overview' as const },
  { href: '/couriers', key: 'couriers' as const },
  { href: '/orders', key: 'orders' as const },
  { href: '/analytics', key: 'analytics' as const },
];

export function Sidebar() {
  const pathname = usePathname();
  const t = useTranslations('nav');

  return (
    <nav className="w-56 shrink-0 border-r border-ink-200 bg-white p-4">
      <div className="mb-6 px-2 text-lg font-semibold text-ink-900">Courier Platform</div>
      <ul className="space-y-1">
        {LINKS.map((link) => {
          const active = pathname.startsWith(link.href);
          return (
            <li key={link.href}>
              <Link
                href={link.href}
                className={`block rounded-md px-3 py-2 text-sm font-medium transition ${
                  active ? 'bg-accent-500 text-white' : 'text-ink-700 hover:bg-ink-100'
                }`}
              >
                {t(link.key)}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

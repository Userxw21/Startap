import { Sidebar } from '@/components/Sidebar';
import { Topbar } from '@/components/Topbar';
import { CourierNotice } from '@/components/CourierNotice';
import { RealtimeProvider } from '@/components/RealtimeProvider';
import { getSession } from '@/lib/session';
import { getRequestLocale, getTranslator } from '@/lib/i18n';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await getSession();
  const locale = getRequestLocale();
  const t = getTranslator(locale);

  // Every page under this layout calls COMPANY_ADMIN/DISPATCHER-only
  // endpoints — a COURIER account gets one clear message here instead of
  // an uncaught 403 on whichever page they happened to land on. See
  // CourierNotice's docstring.
  if (user.role === 'COURIER') {
    return (
      <CourierNotice
        locale={locale}
        title={t('courierNotice.title')}
        message={t('courierNotice.message')}
        logoutLabel={t('nav.logout')}
      />
    );
  }

  return (
    <RealtimeProvider>
      <div className="flex min-h-screen">
        <Sidebar />
        <div className="flex flex-1 flex-col">
          <Topbar user={user} locale={locale} logoutLabel={t('nav.logout')} />
          <main className="flex-1 bg-ink-50 p-6">{children}</main>
        </div>
      </div>
    </RealtimeProvider>
  );
}

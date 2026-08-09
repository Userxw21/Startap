import { apiFetch } from '@/lib/api';
import { getRequestLocale, getTranslator } from '@/lib/i18n';
import { StatusPill } from '@/components/StatusPill';
import { RealtimeRefresher } from '@/components/RealtimeRefresher';
import type { Courier } from '@/lib/types';

export default async function CouriersPage() {
  const locale = getRequestLocale();
  const t = getTranslator(locale);
  const couriers = await apiFetch<Courier[]>('/couriers');

  return (
    <div>
      <RealtimeRefresher />
      <h1 className="text-2xl font-semibold text-ink-900">{t('couriers.title')}</h1>

      <div className="mt-6 overflow-x-auto rounded-lg border border-ink-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-ink-200 text-ink-500">
            <tr>
              <th className="px-4 py-3 font-medium">{t('couriers.name')}</th>
              <th className="px-4 py-3 font-medium">{t('couriers.email')}</th>
              <th className="px-4 py-3 font-medium">{t('couriers.vehicle')}</th>
              <th className="px-4 py-3 font-medium">{t('couriers.status')}</th>
            </tr>
          </thead>
          <tbody>
            {couriers.map((courier) => (
              <tr key={courier.id} className="border-b border-ink-100 last:border-0">
                <td className="px-4 py-3 text-ink-900">{courier.user.fullName}</td>
                <td className="px-4 py-3 text-ink-700">{courier.user.email}</td>
                <td className="px-4 py-3 text-ink-700">{courier.vehicle.type}</td>
                <td className="px-4 py-3">
                  <StatusPill status={courier.status} label={t(`status.${courier.status}`)} />
                </td>
              </tr>
            ))}
            {couriers.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-ink-500">
                  {t('couriers.empty')}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

import { apiFetch } from '@/lib/api';
import { getRequestLocale, getTranslator } from '@/lib/i18n';
import { StatCard } from '@/components/StatCard';
import { RealtimeRefresher } from '@/components/RealtimeRefresher';
import { formatDuration, formatDistance } from '@/lib/format';
import type { AnalyticsSummary } from '@/lib/types';

export default async function AnalyticsPage() {
  const locale = getRequestLocale();
  const t = getTranslator(locale);

  const summary = await apiFetch<AnalyticsSummary>('/analytics/summary');
  const delivered = summary.orders.byStatus.DELIVERED ?? 0;
  const failed = summary.orders.byStatus.FAILED ?? 0;
  const cancelled = summary.orders.byStatus.CANCELLED ?? 0;

  return (
    <div>
      <RealtimeRefresher />
      <h1 className="text-2xl font-semibold text-ink-900">{t('analytics.title')}</h1>
      <p className="mt-1 text-sm text-ink-500">{t('analytics.subtitle')}</p>

      <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard label={t('analytics.totalOrders')} value={summary.orders.total} />
        <StatCard label={t('analytics.delivered')} value={delivered} />
        <StatCard label={t('analytics.failed')} value={failed} />
        <StatCard label={t('analytics.cancelled')} value={cancelled} />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-lg border border-ink-200 bg-white p-5">
          <p className="text-sm text-ink-500">{t('analytics.avgDeliveryTime')}</p>
          <p className="mt-2 text-3xl font-semibold text-ink-900">{formatDuration(summary.avgDeliveryTimeSeconds)}</p>
          <p className="mt-1 text-xs text-ink-500">{t('analytics.avgDeliveryTimeHint')}</p>
        </div>
        <div className="rounded-lg border border-ink-200 bg-white p-5">
          <p className="text-sm text-ink-500">{t('analytics.avgDispatchTime')}</p>
          <p className="mt-2 text-3xl font-semibold text-ink-900">{formatDuration(summary.avgDispatchTimeSeconds)}</p>
          <p className="mt-1 text-xs text-ink-500">{t('analytics.avgDispatchTimeHint')}</p>
        </div>
        <div className="rounded-lg border border-ink-200 bg-white p-5">
          <p className="text-sm text-ink-500">{t('analytics.avgDistance')}</p>
          <p className="mt-2 text-3xl font-semibold text-ink-900">
            {formatDistance(summary.avgDeliveryDistanceMeters)}
          </p>
          <p className="mt-1 text-xs text-ink-500">{t('analytics.avgDistanceHint')}</p>
        </div>
      </div>

      <h2 className="mt-8 text-sm font-medium uppercase tracking-wide text-ink-500">{t('analytics.topCouriers')}</h2>
      <div className="mt-3 overflow-x-auto rounded-lg border border-ink-200 bg-white">
        <table className="w-full text-left text-sm">
          <tbody>
            {summary.topCouriers.map((entry, index) => (
              <tr key={entry.courierId} className="border-b border-ink-100 last:border-0">
                <td className="w-10 px-4 py-3 text-ink-500">{index + 1}</td>
                <td className="px-4 py-3 text-ink-900">{entry.courierName}</td>
                <td className="px-4 py-3 text-right text-ink-700">
                  {entry.deliveredCount} {t('analytics.deliveries')}
                </td>
              </tr>
            ))}
            {summary.topCouriers.length === 0 && (
              <tr>
                <td colSpan={3} className="px-4 py-8 text-center text-ink-500">
                  {t('analytics.noData')}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

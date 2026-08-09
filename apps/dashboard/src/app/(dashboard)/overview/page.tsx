import { apiFetch } from '@/lib/api';
import { getRequestLocale, getTranslator } from '@/lib/i18n';
import { StatCard } from '@/components/StatCard';
import { RealtimeRefresher } from '@/components/RealtimeRefresher';
import type { Courier, Order } from '@/lib/types';

const ACTIVE_ORDER_STATUSES = ['ASSIGNED', 'ACCEPTED', 'PICKUP', 'PICKED_UP', 'DELIVERING'];

export default async function OverviewPage() {
  const locale = getRequestLocale();
  const t = getTranslator(locale);

  // NOTE: computed here from the raw list endpoints rather than a dedicated
  // backend analytics endpoint — fine at MVP courier-count volume, but move
  // this aggregation server-side (see original architecture §11 Analytics)
  // once a company has enough couriers/orders that fetching full lists on
  // every dashboard load stops being cheap.
  const [couriers, orders] = await Promise.all([apiFetch<Courier[]>('/couriers'), apiFetch<Order[]>('/orders')]);

  const courierCounts = countBy(couriers, (c) => c.status);
  const orderBuckets = {
    created: orders.filter((o) => o.status === 'CREATED').length,
    active: orders.filter((o) => ACTIVE_ORDER_STATUSES.includes(o.status)).length,
    delivered: orders.filter((o) => o.status === 'DELIVERED').length,
  };

  return (
    <div>
      <RealtimeRefresher />
      <h1 className="text-2xl font-semibold text-ink-900">{t('overview.title')}</h1>

      <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard label={t('overview.activeCouriers')} value={couriers.length} />
        <StatCard label={t('overview.delivering')} value={courierCounts.DELIVERING ?? 0} />
        <StatCard label={t('overview.available')} value={courierCounts.AVAILABLE ?? 0} />
        <StatCard label={t('overview.offline')} value={courierCounts.OFFLINE ?? 0} />
      </div>

      <h2 className="mt-8 text-sm font-medium uppercase tracking-wide text-ink-500">{t('overview.totalOrders')}</h2>
      <div className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-3">
        <StatCard label={t('overview.createdOrders')} value={orderBuckets.created} />
        <StatCard label={t('overview.activeOrders')} value={orderBuckets.active} />
        <StatCard label={t('overview.deliveredOrders')} value={orderBuckets.delivered} />
      </div>
    </div>
  );
}

function countBy<T>(items: T[], key: (item: T) => string): Record<string, number> {
  return items.reduce<Record<string, number>>((acc, item) => {
    const k = key(item);
    acc[k] = (acc[k] ?? 0) + 1;
    return acc;
  }, {});
}

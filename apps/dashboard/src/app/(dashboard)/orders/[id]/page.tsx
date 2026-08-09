import { apiFetch } from '@/lib/api';
import { getRequestLocale, getTranslator } from '@/lib/i18n';
import { StatusPill } from '@/components/StatusPill';
import { RealtimeRefresher } from '@/components/RealtimeRefresher';
import type { Courier, Order } from '@/lib/types';
import { assignOrderAction, cancelOrderAction } from '../actions';

const CANCELLABLE_STATUSES = ['CREATED', 'ASSIGNED', 'ACCEPTED'];

export default async function OrderDetailPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { error?: string };
}) {
  const locale = getRequestLocale();
  const t = getTranslator(locale);

  const order = await apiFetch<Order>(`/orders/${params.id}`);
  const couriers = order.status === 'CREATED' ? await apiFetch<Courier[]>('/couriers') : [];

  return (
    <div className="max-w-2xl">
      <RealtimeRefresher />
      <h1 className="text-2xl font-semibold text-ink-900">{t('orders.detail')}</h1>

      {searchParams.error && (
        <p role="alert" className="mt-4 rounded-sm bg-red-50 px-3 py-2 text-sm text-bad">
          {searchParams.error}
        </p>
      )}

      <div className="mt-6 rounded-lg border border-ink-200 bg-white p-6">
        <div className="flex items-center justify-between">
          <StatusPill status={order.status} label={t(`status.${order.status}`)} />
          <span className="text-sm text-ink-500">{order.priority}</span>
        </div>

        <dl className="mt-6 space-y-4 text-sm">
          <Row
            label={t('orders.pickup')}
            value={`${order.pickupAddress}  (${order.pickup.lat.toFixed(5)}, ${order.pickup.lng.toFixed(5)})`}
          />
          <Row
            label={t('orders.delivery')}
            value={`${order.deliveryAddress}  (${order.delivery.lat.toFixed(5)}, ${order.delivery.lng.toFixed(5)})`}
          />
          {order.customerName && (
            <Row
              label={t('orders.customer')}
              value={order.customerPhone ? `${order.customerName} — ${order.customerPhone}` : order.customerName}
            />
          )}
        </dl>
      </div>

      {order.status === 'CREATED' && couriers.length > 0 && (
        <form
          action={assignOrderAction.bind(null, order.id)}
          className="mt-6 rounded-lg border border-ink-200 bg-white p-6"
        >
          <h2 className="text-sm font-medium text-ink-700">{t('orders.assign')}</h2>
          <div className="mt-3 flex gap-3">
            <select name="courierId" required className="flex-1 rounded-sm border border-ink-200 px-3 py-2 text-sm">
              {couriers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.user.fullName} — {t(`status.${c.status}`)}
                </option>
              ))}
            </select>
            <button
              type="submit"
              className="rounded-sm bg-accent-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-accent-600"
            >
              {t('orders.assignAction')}
            </button>
          </div>
        </form>
      )}

      {CANCELLABLE_STATUSES.includes(order.status) && (
        <form action={cancelOrderAction.bind(null, order.id)} className="mt-4">
          <button type="submit" className="text-sm font-medium text-bad hover:underline">
            {t('orders.cancel')}
          </button>
        </form>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 border-b border-ink-100 pb-3 text-right last:border-0 last:pb-0">
      <dt className="text-left text-ink-500">{label}</dt>
      <dd className="text-ink-900">{value}</dd>
    </div>
  );
}

import Link from 'next/link';
import { apiFetch } from '@/lib/api';
import { getRequestLocale, getTranslator } from '@/lib/i18n';
import { StatusPill } from '@/components/StatusPill';
import { RealtimeRefresher } from '@/components/RealtimeRefresher';
import type { Order } from '@/lib/types';

export default async function OrdersPage() {
  const locale = getRequestLocale();
  const t = getTranslator(locale);
  const orders = await apiFetch<Order[]>('/orders');

  return (
    <div>
      <RealtimeRefresher />
      <h1 className="text-2xl font-semibold text-ink-900">{t('orders.title')}</h1>

      <div className="mt-6 overflow-x-auto rounded-lg border border-ink-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-ink-200 text-ink-500">
            <tr>
              <th className="px-4 py-3 font-medium">{t('orders.pickup')}</th>
              <th className="px-4 py-3 font-medium">{t('orders.delivery')}</th>
              <th className="px-4 py-3 font-medium">{t('orders.status')}</th>
              <th className="px-4 py-3 font-medium">{t('orders.priority')}</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((order) => (
              <tr key={order.id} className="border-b border-ink-100 last:border-0 hover:bg-ink-50">
                <td className="px-4 py-3">
                  <Link href={`/orders/${order.id}`} className="text-accent-500 hover:underline">
                    {order.pickupAddress}
                  </Link>
                </td>
                <td className="px-4 py-3 text-ink-700">{order.deliveryAddress}</td>
                <td className="px-4 py-3">
                  <StatusPill status={order.status} label={t(`status.${order.status}`)} />
                </td>
                <td className="px-4 py-3 text-ink-700">{order.priority}</td>
              </tr>
            ))}
            {orders.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-ink-500">
                  {t('orders.empty')}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

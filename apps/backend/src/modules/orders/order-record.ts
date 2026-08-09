import type { Order } from '@courier/shared-types';

/**
 * Re-exported under this module's existing name (OrdersService/OrdersController
 * use `OrderRecord` throughout) rather than renaming every call site to `Order`.
 * The canonical shape now lives in packages/shared-types so the dashboard
 * doesn't hand-duplicate it — see that package's src/orders.ts.
 */
export type OrderRecord = Order;

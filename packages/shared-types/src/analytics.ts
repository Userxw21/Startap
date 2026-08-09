import { OrderStatus } from './enums';

export interface CourierLeaderboardEntry {
  courierId: string;
  courierName: string;
  deliveredCount: number;
}

export interface AnalyticsSummary {
  range: { from: string; to: string };
  orders: {
    total: number;
    byStatus: Partial<Record<OrderStatus, number>>;
  };
  /** ACCEPTED → DELIVERED. */
  avgDeliveryTimeSeconds: number | null;
  /** CREATED → ASSIGNED. */
  avgDispatchTimeSeconds: number | null;
  /** Straight-line, not route distance — see AnalyticsService's docstring. */
  avgDeliveryDistanceMeters: number | null;
  topCouriers: CourierLeaderboardEntry[];
}

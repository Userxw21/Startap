import { Injectable } from '@nestjs/common';
import { TenantContextService } from '../../common/tenant/tenant-context.service';
import { AnalyticsSummary, CourierLeaderboardEntry } from './analytics-summary';

/**
 * All raw parameterized SQL, same reasoning as OrdersService/LocationsService:
 * these are aggregate queries (GROUP BY, AVG, window-ish CTEs) that would be
 * awkward and less reviewable through the ORM's query builder, and the one
 * query touching PostGIS (ST_Distance) falls under the same "verify against
 * a live PostGIS instance first" caveat as the rest of this codebase's
 * geography-column code — see README.
 */
@Injectable()
export class AnalyticsService {
  constructor(private readonly tenantContext: TenantContextService) {}

  async getSummary(companyId: string, from: Date, to: Date): Promise<AnalyticsSummary> {
    const manager = this.tenantContext.getManager();

    const statusRows: { status: string; count: string }[] = await manager.query(
      `SELECT status, COUNT(*)::int AS count
       FROM orders
       WHERE "companyId" = $1 AND "createdAt" BETWEEN $2 AND $3
       GROUP BY status`,
      [companyId, from, to],
    );
    const byStatus: Record<string, number> = {};
    let total = 0;
    for (const row of statusRows) {
      const count = Number(row.count);
      byStatus[row.status] = count;
      total += count;
    }

    const [deliveryTimeRow] = await manager.query(
      `WITH accepted AS (
         SELECT osh."orderId", osh."createdAt" AS accepted_at
         FROM order_status_history osh
         JOIN orders o ON o.id = osh."orderId"
         WHERE osh."toStatus" = 'ACCEPTED' AND o."companyId" = $1
       ),
       delivered AS (
         SELECT osh."orderId", osh."createdAt" AS delivered_at
         FROM order_status_history osh
         JOIN orders o ON o.id = osh."orderId"
         WHERE osh."toStatus" = 'DELIVERED' AND o."companyId" = $1 AND osh."createdAt" BETWEEN $2 AND $3
       )
       SELECT AVG(EXTRACT(EPOCH FROM (d.delivered_at - a.accepted_at))) AS avg_seconds
       FROM delivered d
       JOIN accepted a ON a."orderId" = d."orderId"`,
      [companyId, from, to],
    );

    const [dispatchTimeRow] = await manager.query(
      `WITH created AS (
         SELECT osh."orderId", osh."createdAt" AS created_at
         FROM order_status_history osh
         JOIN orders o ON o.id = osh."orderId"
         WHERE osh."toStatus" = 'CREATED' AND o."companyId" = $1
       ),
       assigned AS (
         SELECT osh."orderId", osh."createdAt" AS assigned_at
         FROM order_status_history osh
         JOIN orders o ON o.id = osh."orderId"
         WHERE osh."toStatus" = 'ASSIGNED' AND o."companyId" = $1 AND osh."createdAt" BETWEEN $2 AND $3
       )
       SELECT AVG(EXTRACT(EPOCH FROM (a.assigned_at - c.created_at))) AS avg_seconds
       FROM assigned a
       JOIN created c ON c."orderId" = a."orderId"`,
      [companyId, from, to],
    );

    const [distanceRow] = await manager.query(
      `SELECT AVG(ST_Distance("pickupLocation", "deliveryLocation")) AS avg_meters
       FROM orders
       WHERE "companyId" = $1 AND status = 'DELIVERED' AND "updatedAt" BETWEEN $2 AND $3`,
      [companyId, from, to],
    );

    const topCouriersRows: { courierId: string; courierName: string; deliveredCount: string }[] = await manager.query(
      `SELECT c.id AS "courierId", u."fullName" AS "courierName", COUNT(d.id)::int AS "deliveredCount"
       FROM deliveries d
       JOIN couriers c ON c.id = d."courierId"
       JOIN users u ON u.id = c."userId"
       WHERE c."companyId" = $1 AND d."deliveredAt" BETWEEN $2 AND $3
       GROUP BY c.id, u."fullName"
       ORDER BY "deliveredCount" DESC
       LIMIT 10`,
      [companyId, from, to],
    );

    const topCouriers: CourierLeaderboardEntry[] = topCouriersRows.map((row) => ({
      courierId: row.courierId,
      courierName: row.courierName,
      deliveredCount: Number(row.deliveredCount),
    }));

    return {
      range: { from: from.toISOString(), to: to.toISOString() },
      orders: { total, byStatus },
      avgDeliveryTimeSeconds: numberOrNull(deliveryTimeRow?.avg_seconds),
      avgDispatchTimeSeconds: numberOrNull(dispatchTimeRow?.avg_seconds),
      avgDeliveryDistanceMeters: numberOrNull(distanceRow?.avg_meters),
      topCouriers,
    };
  }
}

function numberOrNull(value: unknown): number | null {
  return value === null || value === undefined ? null : Number(value);
}

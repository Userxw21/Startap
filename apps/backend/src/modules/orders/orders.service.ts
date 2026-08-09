import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { EntityManager } from 'typeorm';
import {
  AuditLog,
  Courier,
  CourierStatus,
  OrderPriority,
  OrderStatus,
  UserRole,
} from '../../database/entities';
import { TenantContextService } from '../../common/tenant/tenant-context.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { OrderRecord } from './order-record';
import { CourierStatusChangedPayload, OrderStatusChangedPayload, RealtimeEvent } from '../../realtime/events';

interface TransitionRule {
  to: OrderStatus;
  allowedRoles: UserRole[];
}

/**
 * `orders.pickupLocation` / `orders.deliveryLocation` are PostGIS
 * geography(Point,4326) columns. This service deliberately uses raw
 * parameterized SQL (manager.query) instead of manager.save()/find() for
 * every read or write that touches those columns: TypeORM does have some
 * built-in geometry/geography handling, but I have no live Postgres+PostGIS
 * instance available to actually verify its exact behavior in this TypeORM
 * version, and shipping unverified ORM "magic" on the one part of the
 * schema I can't test would be worse than being explicit. Raw
 * ST_MakePoint/ST_AsGeoJSON-equivalent SQL here is something I can reason
 * about by hand with confidence. Everything else (Courier, AuditLog,
 * OrderStatusHistory without coordinates) still goes through the ORM as
 * normal. Recommend this module gets a real integration-test pass first,
 * once a live DB is available — see README.
 *
 * All queries run through TenantContextService's manager, i.e. the same
 * per-request transaction/connection the RLS session variables were set on
 * (see TenantScopeInterceptor) — raw SQL is just as RLS-protected as ORM
 * calls, because Postgres enforces RLS at the table/session level
 * regardless of how the SQL was generated. The explicit "companyId" = $1
 * filters below are the layer-1 (application) half of that same
 * defense-in-depth pattern used everywhere else in this codebase.
 */
@Injectable()
export class OrdersService {
  private readonly transitions: Record<OrderStatus, TransitionRule[]> = {
    [OrderStatus.CREATED]: [{ to: OrderStatus.CANCELLED, allowedRoles: [UserRole.COMPANY_ADMIN, UserRole.DISPATCHER] }],
    [OrderStatus.ASSIGNED]: [
      { to: OrderStatus.ACCEPTED, allowedRoles: [UserRole.COURIER] },
      { to: OrderStatus.CANCELLED, allowedRoles: [UserRole.COMPANY_ADMIN, UserRole.DISPATCHER] },
    ],
    [OrderStatus.ACCEPTED]: [
      { to: OrderStatus.PICKUP, allowedRoles: [UserRole.COURIER] },
      { to: OrderStatus.CANCELLED, allowedRoles: [UserRole.COMPANY_ADMIN, UserRole.DISPATCHER] },
    ],
    [OrderStatus.PICKUP]: [
      { to: OrderStatus.PICKED_UP, allowedRoles: [UserRole.COURIER] },
      { to: OrderStatus.FAILED, allowedRoles: [UserRole.COURIER, UserRole.COMPANY_ADMIN, UserRole.DISPATCHER] },
    ],
    [OrderStatus.PICKED_UP]: [
      { to: OrderStatus.DELIVERING, allowedRoles: [UserRole.COURIER] },
      { to: OrderStatus.FAILED, allowedRoles: [UserRole.COURIER, UserRole.COMPANY_ADMIN, UserRole.DISPATCHER] },
    ],
    [OrderStatus.DELIVERING]: [
      { to: OrderStatus.DELIVERED, allowedRoles: [UserRole.COURIER] },
      { to: OrderStatus.FAILED, allowedRoles: [UserRole.COURIER, UserRole.COMPANY_ADMIN, UserRole.DISPATCHER] },
    ],
    [OrderStatus.DELIVERED]: [],
    [OrderStatus.CANCELLED]: [],
    [OrderStatus.FAILED]: [],
  };

  constructor(
    private readonly tenantContext: TenantContextService,
    private readonly events: EventEmitter2,
  ) {}

  async create(companyId: string, actorUserId: string, dto: CreateOrderDto): Promise<OrderRecord> {
    const manager = this.tenantContext.getManager();

    const rows = await manager.query(
      `INSERT INTO orders
        ("companyId","status","priority","pickupAddress","pickupLocation","deliveryAddress","deliveryLocation",
         "customerName","customerPhone","pickupDeadlineAt","deliveryDeadlineAt","notes")
       VALUES
        ($1,'CREATED',$2,$3, ST_SetSRID(ST_MakePoint($4,$5),4326)::geography,
             $6, ST_SetSRID(ST_MakePoint($7,$8),4326)::geography, $9,$10,$11,$12,$13)
       RETURNING id`,
      [
        companyId,
        dto.priority ?? OrderPriority.NORMAL,
        dto.pickupAddress,
        dto.pickup.lng,
        dto.pickup.lat,
        dto.deliveryAddress,
        dto.delivery.lng,
        dto.delivery.lat,
        dto.customerName ?? null,
        dto.customerPhone ?? null,
        dto.pickupDeadlineAt ?? null,
        dto.deliveryDeadlineAt ?? null,
        dto.notes ?? null,
      ],
    );
    const orderId: string = rows[0].id;

    await this.recordHistory(orderId, null, OrderStatus.CREATED, actorUserId);
    await this.writeAudit(companyId, actorUserId, 'order.created', orderId);

    return this.getByIdOrThrow(companyId, orderId);
  }

  async listForCompany(companyId: string, assignedCourierId?: string): Promise<OrderRecord[]> {
    const manager = this.tenantContext.getManager();
    const params: unknown[] = [companyId];
    let where = `o."companyId" = $1`;
    if (assignedCourierId) {
      params.push(assignedCourierId);
      where += ` AND o."assignedCourierId" = $${params.length}`;
    }

    const rows = await manager.query(`${this.selectClause()} WHERE ${where} ORDER BY o."createdAt" DESC`, params);
    return rows.map((row: Record<string, unknown>) => this.mapRow(row));
  }

  async getByIdOrThrow(companyId: string, orderId: string): Promise<OrderRecord> {
    const manager = this.tenantContext.getManager();
    const rows = await manager.query(`${this.selectClause()} WHERE o."companyId" = $1 AND o.id = $2`, [
      companyId,
      orderId,
    ]);
    if (rows.length === 0) {
      throw new NotFoundException('Order not found');
    }
    return this.mapRow(rows[0]);
  }

  async assign(companyId: string, actorUserId: string, orderId: string, courierId: string): Promise<OrderRecord> {
    const manager = this.tenantContext.getManager();
    const order = await this.getByIdOrThrow(companyId, orderId);

    if (order.status !== OrderStatus.CREATED) {
      throw new ConflictException(`Cannot assign an order in status ${order.status}`);
    }

    const courier = await manager.findOne(Courier, { where: { id: courierId, companyId } });
    if (!courier) {
      throw new NotFoundException('Courier not found');
    }

    await manager.query(`UPDATE orders SET status = 'ASSIGNED', "assignedCourierId" = $1 WHERE id = $2`, [
      courierId,
      orderId,
    ]);

    await this.recordHistory(orderId, OrderStatus.CREATED, OrderStatus.ASSIGNED, actorUserId);
    await this.writeAudit(companyId, actorUserId, 'order.assigned', orderId, { courierId });
    this.emitOrderStatusChanged(companyId, orderId, OrderStatus.ASSIGNED, courierId);

    return this.getByIdOrThrow(companyId, orderId);
  }

  async transition(
    companyId: string,
    actor: { userId: string; role: UserRole },
    orderId: string,
    toStatus: OrderStatus,
  ): Promise<OrderRecord> {
    const manager = this.tenantContext.getManager();
    const order = await this.getByIdOrThrow(companyId, orderId);

    // order.status comes back typed as OrderRecord's (shared-types) plain
    // string union, not this file's own OrderStatus enum — a backend enum
    // member widens to that union with no cast (see shared-types/enums.ts),
    // but not the reverse, so an explicit cast is needed at this boundary.
    // Safe: the value is always one of these exact strings, guaranteed by
    // the Postgres enum column this was read from.
    const rule = this.transitions[order.status as OrderStatus].find((t) => t.to === toStatus);
    if (!rule) {
      throw new BadRequestException(`Cannot move an order from ${order.status} to ${toStatus}`);
    }
    if (actor.role !== UserRole.SUPER_ADMIN && !rule.allowedRoles.includes(actor.role)) {
      throw new ForbiddenException(`Role ${actor.role} cannot perform this transition`);
    }

    let actingCourier: Courier | null = null;
    if (actor.role === UserRole.COURIER) {
      actingCourier = await manager.findOne(Courier, { where: { userId: actor.userId, companyId } });
      if (!actingCourier || order.assignedCourierId !== actingCourier.id) {
        throw new ForbiddenException('This order is not assigned to you');
      }
    }

    await manager.query(`UPDATE orders SET status = $1 WHERE id = $2`, [toStatus, orderId]);
    await this.recordHistory(orderId, order.status as OrderStatus, toStatus, actor.userId);
    await this.writeAudit(companyId, actor.userId, `order.status.${toStatus.toLowerCase()}`, orderId);

    await this.applyCourierStatusSideEffect(manager, order, toStatus);
    this.emitOrderStatusChanged(companyId, orderId, toStatus, order.assignedCourierId);

    if (toStatus === OrderStatus.DELIVERED) {
      // MOCK: reuses the order's planned delivery coordinate as the delivery
      // location. A real implementation records the courier's actual
      // reported GPS position at the moment of confirmation (once the
      // mobile app's live tracking exists) — see original architecture §5/§9.
      await manager.query(
        `INSERT INTO deliveries ("orderId","courierId","deliveredAt","deliveryLocation")
         SELECT $1, "assignedCourierId", now(), "deliveryLocation" FROM orders WHERE id = $1`,
        [orderId],
      );
    }

    return this.getByIdOrThrow(companyId, orderId);
  }

  private async applyCourierStatusSideEffect(
    manager: EntityManager,
    order: OrderRecord,
    toStatus: OrderStatus,
  ): Promise<void> {
    if (!order.assignedCourierId) return;

    if (toStatus === OrderStatus.ACCEPTED) {
      await manager.update(Courier, { id: order.assignedCourierId }, { status: CourierStatus.DELIVERING });
      this.emitCourierStatusChanged(order.companyId, order.assignedCourierId, CourierStatus.DELIVERING);
      return;
    }

    if (toStatus === OrderStatus.DELIVERED || toStatus === OrderStatus.CANCELLED || toStatus === OrderStatus.FAILED) {
      await manager.update(
        Courier,
        { id: order.assignedCourierId, status: CourierStatus.DELIVERING },
        { status: CourierStatus.AVAILABLE },
      );
      this.emitCourierStatusChanged(order.companyId, order.assignedCourierId, CourierStatus.AVAILABLE);
    }
  }

  private emitOrderStatusChanged(
    companyId: string,
    orderId: string,
    status: OrderStatus,
    assignedCourierId: string | null,
  ): void {
    const payload: OrderStatusChangedPayload = { companyId, orderId, status, assignedCourierId };
    this.events.emit(RealtimeEvent.OrderStatusChanged, payload);
  }

  private emitCourierStatusChanged(companyId: string, courierId: string, status: CourierStatus): void {
    const payload: CourierStatusChangedPayload = { companyId, courierId, status };
    this.events.emit(RealtimeEvent.CourierStatusChanged, payload);
  }

  private async recordHistory(
    orderId: string,
    fromStatus: OrderStatus | null,
    toStatus: OrderStatus,
    actorUserId: string,
  ): Promise<void> {
    const manager = this.tenantContext.getManager();
    await manager.query(
      `INSERT INTO order_status_history ("orderId","fromStatus","toStatus","actorUserId") VALUES ($1,$2,$3,$4)`,
      [orderId, fromStatus, toStatus, actorUserId],
    );
  }

  private async writeAudit(
    companyId: string,
    actorUserId: string,
    action: string,
    entityId: string,
    metadata?: Record<string, unknown>,
  ): Promise<void> {
    const manager = this.tenantContext.getManager();
    await manager.save(
      manager.create(AuditLog, {
        companyId,
        actorUserId,
        action,
        entity: 'Order',
        entityId,
        metadata: metadata ?? null,
      }),
    );
  }

  private selectClause(): string {
    return `
      SELECT
        o.id, o."companyId", o.status, o.priority,
        o."pickupAddress",
        ST_Y(o."pickupLocation"::geometry) AS "pickupLat",
        ST_X(o."pickupLocation"::geometry) AS "pickupLng",
        o."deliveryAddress",
        ST_Y(o."deliveryLocation"::geometry) AS "deliveryLat",
        ST_X(o."deliveryLocation"::geometry) AS "deliveryLng",
        o."customerName", o."customerPhone", o."assignedCourierId",
        o."pickupDeadlineAt", o."deliveryDeadlineAt", o.notes,
        o."createdAt", o."updatedAt"
      FROM orders o
    `;
  }

  private mapRow(row: Record<string, any>): OrderRecord {
    return {
      id: row.id,
      companyId: row.companyId,
      status: row.status,
      priority: row.priority,
      pickupAddress: row.pickupAddress,
      pickup: { lat: Number(row.pickupLat), lng: Number(row.pickupLng) },
      deliveryAddress: row.deliveryAddress,
      delivery: { lat: Number(row.deliveryLat), lng: Number(row.deliveryLng) },
      customerName: row.customerName,
      customerPhone: row.customerPhone,
      assignedCourierId: row.assignedCourierId,
      // OrderRecord (= shared-types' Order) uses ISO strings throughout, to
      // match exactly what actually reaches the dashboard over the wire —
      // the pg driver hands back real Date objects for timestamptz columns,
      // converted here rather than leaving the mismatch for JSON.stringify
      // to paper over implicitly.
      pickupDeadlineAt: toIso(row.pickupDeadlineAt),
      deliveryDeadlineAt: toIso(row.deliveryDeadlineAt),
      notes: row.notes,
      createdAt: toIso(row.createdAt) as string,
      updatedAt: toIso(row.updatedAt) as string,
    };
  }
}

function toIso(value: Date | string | null): string | null {
  if (value === null) return null;
  return value instanceof Date ? value.toISOString() : value;
}

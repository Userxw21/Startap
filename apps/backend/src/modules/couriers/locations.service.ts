import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { randomUUID } from 'crypto';
import { TenantContextService } from '../../common/tenant/tenant-context.service';
import { CouriersService } from './couriers.service';
import { LocationCacheService } from '../../realtime/location-cache.service';
import { RealtimeEvent, CourierLocationUpdatedPayload } from '../../realtime/events';
import { RecordLocationDto } from './dto/record-location.dto';

/**
 * Minimum time between LocationPoint DB inserts for the same courier — the
 * live position itself updates on every call via Redis (no throttle there),
 * this only throttles the historical-trail write to Postgres, matching the
 * sampling policy from the original architecture (§4/§15: "do not store GPS
 * points unnecessarily at extremely high frequency").
 *
 * Like OrdersService, the INSERT here uses raw parameterized SQL
 * (ST_MakePoint) rather than TypeORM's entity save() for the same reason:
 * no live PostGIS instance was available to verify TypeORM's automatic
 * geography handling, and raw SQL for a Point insert is something I can
 * reason about correctly by hand.
 */
const MIN_PERSIST_INTERVAL_MS = 10_000;

@Injectable()
export class LocationsService {
  // Single-instance-only: lives in process memory, not Redis. A
  // multi-instance deployment would need this moved to Redis too, since a
  // courier's messages could land on a different instance each time — not a
  // concern at MVP/pilot scale (see original architecture's infra-cost
  // section), flagged here so it isn't forgotten if that changes.
  private readonly lastPersistedAt = new Map<string, number>();

  constructor(
    private readonly tenantContext: TenantContextService,
    private readonly couriersService: CouriersService,
    private readonly locationCache: LocationCacheService,
    private readonly events: EventEmitter2,
  ) {}

  async record(actor: { userId: string; companyId: string }, dto: RecordLocationDto): Promise<void> {
    const courier = await this.couriersService.getByUserId(actor.userId);
    const recordedAt = new Date();

    await this.locationCache.set({
      courierId: courier.id,
      companyId: actor.companyId,
      lat: dto.lat,
      lng: dto.lng,
      speedMps: dto.speedMps ?? null,
      headingDegrees: dto.headingDegrees ?? null,
      recordedAt: recordedAt.toISOString(),
    });

    const lastPersisted = this.lastPersistedAt.get(courier.id) ?? 0;
    if (Date.now() - lastPersisted >= MIN_PERSIST_INTERVAL_MS) {
      const manager = this.tenantContext.getManager();
      await manager.query(
        `INSERT INTO location_points ("courierId","location","speedMps","headingDegrees","recordedAt","clientId")
         VALUES ($1, ST_SetSRID(ST_MakePoint($2,$3),4326)::geography, $4, $5, $6, $7)`,
        [courier.id, dto.lng, dto.lat, dto.speedMps ?? null, dto.headingDegrees ?? null, recordedAt, randomUUID()],
      );
      this.lastPersistedAt.set(courier.id, Date.now());
    }

    const payload: CourierLocationUpdatedPayload = {
      companyId: actor.companyId,
      courierId: courier.id,
      lat: dto.lat,
      lng: dto.lng,
      speedMps: dto.speedMps ?? null,
      headingDegrees: dto.headingDegrees ?? null,
      recordedAt: recordedAt.toISOString(),
    };
    this.events.emit(RealtimeEvent.CourierLocationUpdated, payload);
  }
}

import { Inject, Injectable, Logger } from '@nestjs/common';
import type Redis from 'ioredis';
import { REDIS_CLIENT } from './redis.provider';

export interface CachedLocation {
  courierId: string;
  companyId: string;
  lat: number;
  lng: number;
  speedMps: number | null;
  headingDegrees: number | null;
  recordedAt: string;
}

/**
 * "Where is this courier right now" is a cache-and-pub/sub problem, not a
 * database-write problem (original architecture §4/§12) — Postgres holds the
 * historical trail (LocationPoint, throttled — see LocationsService), Redis
 * holds only the latest position, expiring on its own if a courier goes
 * quiet instead of needing an explicit "offline" write anywhere.
 *
 * Fails soft on both methods: a Redis outage means the *live* position is
 * briefly unavailable, not that location updates should stop working
 * entirely — LocationsService.record() still persists to Postgres and emits
 * the realtime event either way. Confirmed by actually killing Redis locally:
 * without this, LocationsService.record() (shared by the REST endpoint and
 * the WebSocket gateway) hung the caller indefinitely instead of degrading.
 */
@Injectable()
export class LocationCacheService {
  private static readonly TTL_SECONDS = 90;
  private readonly logger = new Logger(LocationCacheService.name);

  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  async set(location: CachedLocation): Promise<void> {
    try {
      await this.redis.set(this.key(location.courierId), JSON.stringify(location), 'EX', LocationCacheService.TTL_SECONDS);
    } catch (err) {
      this.logger.warn(`Failed to cache location for courier ${location.courierId}: ${(err as Error).message}`);
    }
  }

  async get(courierId: string): Promise<CachedLocation | null> {
    try {
      const raw = await this.redis.get(this.key(courierId));
      return raw ? (JSON.parse(raw) as CachedLocation) : null;
    } catch (err) {
      this.logger.warn(`Failed to read cached location for courier ${courierId}: ${(err as Error).message}`);
      return null;
    }
  }

  private key(courierId: string): string {
    return `courier:location:${courierId}`;
  }
}

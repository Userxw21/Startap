import { Inject, Injectable } from '@nestjs/common';
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
 */
@Injectable()
export class LocationCacheService {
  private static readonly TTL_SECONDS = 90;

  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  async set(location: CachedLocation): Promise<void> {
    await this.redis.set(this.key(location.courierId), JSON.stringify(location), 'EX', LocationCacheService.TTL_SECONDS);
  }

  async get(courierId: string): Promise<CachedLocation | null> {
    const raw = await this.redis.get(this.key(courierId));
    return raw ? (JSON.parse(raw) as CachedLocation) : null;
  }

  private key(courierId: string): string {
    return `courier:location:${courierId}`;
  }
}

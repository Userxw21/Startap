import { Logger, Provider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

export const REDIS_CLIENT = 'REDIS_CLIENT';

const logger = new Logger('RedisClient');

/**
 * One general-purpose connection for cache reads/writes (LocationCacheService).
 * The Socket.IO Redis adapter (see realtime.gateway bootstrap in main.ts)
 * intentionally does NOT reuse this client — pub/sub connections are
 * long-lived and single-purpose, so the adapter creates and owns its own
 * pair (see RedisIoAdapter) rather than sharing this one.
 *
 * `maxRetriesPerRequest: 1` + a short `commandTimeout` matter more here than
 * they might look: without them, a queued command (e.g. LocationCacheService's
 * SET on every courier location ping) waits on ioredis's default
 * reconnect-forever retryStrategy instead of failing fast — which, found by
 * actually killing Redis locally, hangs the request indefinitely rather than
 * timing out, on both the REST location endpoint and the WebSocket gateway
 * (LocationsService.record() is shared by both). Location caching is a
 * nice-to-have (see LocationCacheService's docstring — TTL-expiring, not the
 * source of truth), so callers should see a fast rejection they can catch,
 * not an unbounded hang.
 */
export const redisClientProvider: Provider = {
  provide: REDIS_CLIENT,
  inject: [ConfigService],
  useFactory: (config: ConfigService) => {
    const client = new Redis({
      host: config.get<string>('redis.host'),
      port: config.get<number>('redis.port'),
      lazyConnect: false,
      maxRetriesPerRequest: 1,
      commandTimeout: 2000,
      retryStrategy: (times) => Math.min(times * 500, 5000),
    });
    client.on('error', (err) => logger.warn(`Redis client error: ${err.message}`));
    return client;
  },
};

import { Provider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

export const REDIS_CLIENT = 'REDIS_CLIENT';

/**
 * One general-purpose connection for cache reads/writes (LocationCacheService).
 * The Socket.IO Redis adapter (see realtime.gateway bootstrap in main.ts)
 * intentionally does NOT reuse this client — pub/sub connections are
 * long-lived and single-purpose, so the adapter creates and owns its own
 * pair (see RedisIoAdapter) rather than sharing this one.
 */
export const redisClientProvider: Provider = {
  provide: REDIS_CLIENT,
  inject: [ConfigService],
  useFactory: (config: ConfigService) => {
    return new Redis({
      host: config.get<string>('redis.host'),
      port: config.get<number>('redis.port'),
      lazyConnect: false,
    });
  },
};

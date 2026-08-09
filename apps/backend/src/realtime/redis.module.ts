import { Module } from '@nestjs/common';
import { redisClientProvider } from './redis.provider';
import { LocationCacheService } from './location-cache.service';

/** Pure infra, no dependency on any feature module — see RealtimeModule/CouriersModule for why this stays a leaf. */
@Module({
  providers: [redisClientProvider, LocationCacheService],
  exports: [redisClientProvider, LocationCacheService],
})
export class RedisModule {}

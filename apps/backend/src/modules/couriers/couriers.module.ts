import { Module } from '@nestjs/common';
import { CouriersService } from './couriers.service';
import { CouriersController } from './couriers.controller';
import { LocationsService } from './locations.service';
import { TenantModule } from '../../common/tenant/tenant.module';
import { RedisModule } from '../../realtime/redis.module';

@Module({
  imports: [TenantModule, RedisModule],
  controllers: [CouriersController],
  providers: [CouriersService, LocationsService],
  exports: [CouriersService, LocationsService],
})
export class CouriersModule {}

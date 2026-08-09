import { Module } from '@nestjs/common';
import { OrdersService } from './orders.service';
import { OrdersController } from './orders.controller';
import { TenantModule } from '../../common/tenant/tenant.module';
import { CouriersModule } from '../couriers/couriers.module';

@Module({
  imports: [TenantModule, CouriersModule],
  controllers: [OrdersController],
  providers: [OrdersService],
})
export class OrdersModule {}

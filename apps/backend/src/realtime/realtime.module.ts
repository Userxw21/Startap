import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { RealtimeGateway } from './realtime.gateway';
import { CouriersModule } from '../modules/couriers/couriers.module';

@Module({
  imports: [JwtModule.register({}), CouriersModule],
  providers: [RealtimeGateway],
})
export class RealtimeModule {}

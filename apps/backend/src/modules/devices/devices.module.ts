import { Module } from '@nestjs/common';
import { DevicesService } from './devices.service';
import { DevicesController } from './devices.controller';
import { TenantModule } from '../../common/tenant/tenant.module';

@Module({
  imports: [TenantModule],
  controllers: [DevicesController],
  providers: [DevicesService],
})
export class DevicesModule {}

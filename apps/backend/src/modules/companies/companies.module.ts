import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Company } from '../../database/entities';
import { CompaniesService } from './companies.service';
import { CompaniesController } from './companies.controller';
import { TenantModule } from '../../common/tenant/tenant.module';

@Module({
  imports: [TypeOrmModule.forFeature([Company]), TenantModule],
  controllers: [CompaniesController],
  providers: [CompaniesService],
})
export class CompaniesModule {}

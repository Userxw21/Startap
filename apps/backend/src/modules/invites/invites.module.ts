import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Invite, User } from '../../database/entities';
import { InvitesService } from './invites.service';
import { InvitesController } from './invites.controller';
import { TenantModule } from '../../common/tenant/tenant.module';
import { CouriersModule } from '../couriers/couriers.module';
import { UsersModule } from '../users/users.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [TypeOrmModule.forFeature([Invite, User]), TenantModule, CouriersModule, UsersModule, AuthModule],
  controllers: [InvitesController],
  providers: [InvitesService],
})
export class InvitesModule {}

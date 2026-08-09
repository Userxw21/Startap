import { Body, Controller, ForbiddenException, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { DevicesService } from './devices.service';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { UserRole } from '../../database/entities';
import { RegisterDeviceDto } from './dto/register-device.dto';
import { PairDeviceDto } from './dto/pair-device.dto';

@Roles(UserRole.COMPANY_ADMIN, UserRole.DISPATCHER)
@Controller('devices')
export class DevicesController {
  constructor(private readonly devicesService: DevicesService) {}

  @Post()
  register(@CurrentUser() user: AuthenticatedUser, @Body() dto: RegisterDeviceDto) {
    if (!user.companyId) {
      throw new ForbiddenException('This account is not attached to a company');
    }
    return this.devicesService.register(user.companyId, user.userId, dto.hardwareId);
  }

  @Get()
  list(@CurrentUser() user: AuthenticatedUser) {
    if (!user.companyId) {
      throw new ForbiddenException('This account is not attached to a company');
    }
    return this.devicesService.listForCompany(user.companyId);
  }

  @Post(':id/pair')
  pair(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) deviceId: string,
    @Body() dto: PairDeviceDto,
  ) {
    if (!user.companyId) {
      throw new ForbiddenException('This account is not attached to a company');
    }
    return this.devicesService.pair(user.companyId, user.userId, deviceId, dto.courierId);
  }

  @Post(':id/revoke')
  revoke(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) deviceId: string) {
    if (!user.companyId) {
      throw new ForbiddenException('This account is not attached to a company');
    }
    return this.devicesService.revoke(user.companyId, user.userId, deviceId);
  }
}

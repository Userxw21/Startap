import { Body, Controller, ForbiddenException, Get, HttpCode, HttpStatus, Patch, Post } from '@nestjs/common';
import { CouriersService } from './couriers.service';
import { LocationsService } from './locations.service';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { UserRole } from '../../database/entities';
import { UpdateCourierStatusDto } from './dto/update-courier-status.dto';
import { RecordLocationDto } from './dto/record-location.dto';

/** Onboarding (creating a courier account) now happens via InvitesModule — see that module. */
@Controller('couriers')
export class CouriersController {
  constructor(
    private readonly couriersService: CouriersService,
    private readonly locationsService: LocationsService,
  ) {}

  @Roles(UserRole.COMPANY_ADMIN, UserRole.DISPATCHER)
  @Get()
  list(@CurrentUser() user: AuthenticatedUser) {
    if (!user.companyId) {
      throw new ForbiddenException('This account is not attached to a company');
    }
    return this.couriersService.listForCompany(user.companyId);
  }

  @Roles(UserRole.COURIER)
  @Get('me')
  getMyProfile(@CurrentUser() user: AuthenticatedUser) {
    return this.couriersService.getByUserId(user.userId);
  }

  @Roles(UserRole.COURIER)
  @Patch('me/status')
  updateMyStatus(@CurrentUser() user: AuthenticatedUser, @Body() dto: UpdateCourierStatusDto) {
    return this.couriersService.updateOwnStatus(user.userId, dto.status);
  }

  /**
   * REST fallback for the same thing the WebSocket `courier:location`
   * message does (see RealtimeGateway) — kept mainly so the whole realtime
   * flow can be exercised from requests.http / curl without a WebSocket
   * client. The mobile app (once built) will use the WS path, since it's
   * already holding an open connection anyway.
   */
  @Roles(UserRole.COURIER)
  @HttpCode(HttpStatus.NO_CONTENT)
  @Post('me/location')
  async recordMyLocation(@CurrentUser() user: AuthenticatedUser, @Body() dto: RecordLocationDto) {
    if (!user.companyId) {
      throw new ForbiddenException('This account is not attached to a company');
    }
    await this.locationsService.record({ userId: user.userId, companyId: user.companyId }, dto);
  }
}

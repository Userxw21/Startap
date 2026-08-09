import { Body, Controller, ForbiddenException, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { OrdersService } from './orders.service';
import { CouriersService } from '../couriers/couriers.service';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { UserRole } from '../../database/entities';
import { CreateOrderDto } from './dto/create-order.dto';
import { AssignOrderDto } from './dto/assign-order.dto';
import { TransitionOrderDto } from './dto/transition-order.dto';

@Controller('orders')
export class OrdersController {
  constructor(
    private readonly ordersService: OrdersService,
    private readonly couriersService: CouriersService,
  ) {}

  @Roles(UserRole.COMPANY_ADMIN, UserRole.DISPATCHER)
  @Post()
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateOrderDto) {
    this.assertHasCompany(user);
    return this.ordersService.create(user.companyId as string, user.userId, dto);
  }

  @Roles(UserRole.COMPANY_ADMIN, UserRole.DISPATCHER, UserRole.COURIER)
  @Get()
  async list(@CurrentUser() user: AuthenticatedUser) {
    this.assertHasCompany(user);
    if (user.role === UserRole.COURIER) {
      const courier = await this.couriersService.getByUserId(user.userId);
      return this.ordersService.listForCompany(user.companyId as string, courier.id);
    }
    return this.ordersService.listForCompany(user.companyId as string);
  }

  @Roles(UserRole.COMPANY_ADMIN, UserRole.DISPATCHER, UserRole.COURIER)
  @Get(':id')
  async getOne(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    this.assertHasCompany(user);
    const order = await this.ordersService.getByIdOrThrow(user.companyId as string, id);

    if (user.role === UserRole.COURIER) {
      const courier = await this.couriersService.getByUserId(user.userId);
      if (order.assignedCourierId !== courier.id) {
        throw new ForbiddenException('This order is not assigned to you');
      }
    }
    return order;
  }

  @Roles(UserRole.COMPANY_ADMIN, UserRole.DISPATCHER)
  @Post(':id/assign')
  assign(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: AssignOrderDto) {
    this.assertHasCompany(user);
    return this.ordersService.assign(user.companyId as string, user.userId, id, dto.courierId);
  }

  @Roles(UserRole.COMPANY_ADMIN, UserRole.DISPATCHER, UserRole.COURIER)
  @Post(':id/transition')
  transition(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: TransitionOrderDto,
  ) {
    this.assertHasCompany(user);
    return this.ordersService.transition(user.companyId as string, { userId: user.userId, role: user.role }, id, dto.toStatus);
  }

  private assertHasCompany(user: AuthenticatedUser): void {
    if (!user.companyId) {
      throw new ForbiddenException('This account is not attached to a company');
    }
  }
}

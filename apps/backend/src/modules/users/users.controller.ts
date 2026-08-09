import { Body, Controller, ForbiddenException, Get, Post } from '@nestjs/common';
import { UsersService } from './users.service';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { UserRole } from '../../database/entities';
import { CreateDispatcherDto } from './dto/create-dispatcher.dto';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Roles(UserRole.COMPANY_ADMIN, UserRole.DISPATCHER)
  @Get()
  list(@CurrentUser() user: AuthenticatedUser) {
    if (!user.companyId) {
      throw new ForbiddenException('This account is not attached to a company');
    }
    return this.usersService.listForCompany(user.companyId);
  }

  /** Only COMPANY_ADMIN can create dispatchers — a dispatcher creating another dispatcher is a privilege-escalation path we don't want. */
  @Roles(UserRole.COMPANY_ADMIN)
  @Post('dispatchers')
  createDispatcher(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateDispatcherDto) {
    if (!user.companyId) {
      throw new ForbiddenException('This account is not attached to a company');
    }
    return this.usersService.createDispatcher({
      companyId: user.companyId,
      actorUserId: user.userId,
      ...dto,
    });
  }
}

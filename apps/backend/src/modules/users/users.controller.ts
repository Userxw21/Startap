import { Controller, ForbiddenException, Get } from '@nestjs/common';
import { UsersService } from './users.service';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { UserRole } from '../../database/entities';

/** Creating dispatcher accounts now happens via InvitesModule — see that module. */
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
}

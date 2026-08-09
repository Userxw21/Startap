import { Body, Controller, ForbiddenException, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { InvitesService } from './invites.service';
import { Public, Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { UserRole } from '../../database/entities';
import { CreateInviteDto } from './dto/create-invite.dto';
import { AcceptInviteDto } from './dto/accept-invite.dto';

@Controller('invites')
export class InvitesController {
  constructor(private readonly invitesService: InvitesService) {}

  @Roles(UserRole.COMPANY_ADMIN, UserRole.DISPATCHER)
  @Post()
  async create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateInviteDto) {
    this.assertHasCompany(user);
    const { invite, token } = await this.invitesService.create({
      companyId: user.companyId as string,
      actorUserId: user.userId,
      actorRole: user.role,
      ...dto,
    });
    return {
      id: invite.id,
      email: invite.email,
      role: invite.role,
      expiresAt: invite.expiresAt,
      // Plaintext, once — there's no email/SMS delivery wired up yet (see
      // README), so whoever calls this endpoint is responsible for getting
      // this token to the invitee some other way for now.
      token,
    };
  }

  @Roles(UserRole.COMPANY_ADMIN, UserRole.DISPATCHER)
  @Get()
  list(@CurrentUser() user: AuthenticatedUser) {
    this.assertHasCompany(user);
    return this.invitesService.listForCompany(user.companyId as string);
  }

  @Roles(UserRole.COMPANY_ADMIN, UserRole.DISPATCHER)
  @Post(':id/revoke')
  revoke(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    this.assertHasCompany(user);
    return this.invitesService.revoke(user.companyId as string, user.userId, id);
  }

  @Public()
  @Get('preview/:token')
  preview(@Param('token') token: string) {
    return this.invitesService.preview(token);
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @HttpCode(HttpStatus.CREATED)
  @Post('accept')
  accept(@Body() dto: AcceptInviteDto) {
    return this.invitesService.accept(dto.token, dto.password);
  }

  private assertHasCompany(user: AuthenticatedUser): void {
    if (!user.companyId) {
      throw new ForbiddenException('This account is not attached to a company');
    }
  }
}

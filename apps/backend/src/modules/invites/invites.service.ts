import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash, randomBytes } from 'crypto';
import { IsNull, Repository } from 'typeorm';
import { AuditLog, Invite, User, UserRole, VehicleType } from '../../database/entities';
import { TenantContextService } from '../../common/tenant/tenant-context.service';
import { CouriersService } from '../couriers/couriers.service';
import { UsersService } from '../users/users.service';
import { AuthService, TokenPair } from '../auth/auth.service';

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

/**
 * How dispatchers and couriers get an account now — see Invite entity's
 * docstring for the "why no admin-set passwords" reasoning.
 *
 * create/list/revoke run inside an authenticated request, so they use
 * TenantContextService.getManager() like every other company-scoped
 * service. preview/accept are necessarily public (the invitee has no
 * account, hence no JWT, yet) and use the directly-injected repository
 * instead — same reason AuthService does for login. accept() still needs
 * to write to RLS-protected tables (couriers, vehicles) though, so it opens
 * its own scope via TenantContextService.runForActor() using the invite's
 * own companyId as the trusted tenant context — the same pattern
 * RealtimeGateway uses for WS messages, which also arrive outside the HTTP
 * request/interceptor cycle.
 */
@Injectable()
export class InvitesService {
  constructor(
    @InjectRepository(Invite) private readonly invites: Repository<Invite>,
    @InjectRepository(User) private readonly users: Repository<User>,
    private readonly tenantContext: TenantContextService,
    private readonly couriersService: CouriersService,
    private readonly usersService: UsersService,
    private readonly authService: AuthService,
  ) {}

  async create(params: {
    companyId: string;
    actorUserId: string;
    actorRole: UserRole;
    email: string;
    fullName: string;
    role: UserRole;
    vehicleType?: VehicleType;
    vehicleModel?: string;
    plateNumber?: string;
  }): Promise<{ invite: Invite; token: string }> {
    if (params.role === UserRole.DISPATCHER && params.actorRole !== UserRole.COMPANY_ADMIN) {
      // Same privilege-escalation concern as the old direct-creation endpoint:
      // a dispatcher inviting another dispatcher is not allowed.
      throw new ForbiddenException('Only a company admin can invite a dispatcher');
    }
    if (params.role === UserRole.COURIER && !params.vehicleType) {
      throw new BadRequestException('vehicleType is required when inviting a courier');
    }

    const manager = this.tenantContext.getManager();

    const existingUser = await manager.findOne(User, { where: { email: params.email } });
    if (existingUser) {
      throw new ConflictException('An account with this email already exists');
    }

    const existingInvite = await manager.findOne(Invite, {
      where: { email: params.email, companyId: params.companyId, acceptedAt: IsNull(), revokedAt: IsNull() },
    });
    if (existingInvite && existingInvite.expiresAt > new Date()) {
      throw new ConflictException('An active invite already exists for this email');
    }

    const token = randomBytes(32).toString('hex');

    const invite = await manager.save(
      manager.create(Invite, {
        companyId: params.companyId,
        email: params.email,
        fullName: params.fullName,
        role: params.role,
        vehicleType: params.role === UserRole.COURIER ? (params.vehicleType as VehicleType) : null,
        vehicleModel: params.vehicleModel ?? null,
        plateNumber: params.plateNumber ?? null,
        tokenHash: this.hashToken(token),
        expiresAt: new Date(Date.now() + INVITE_TTL_MS),
        invitedByUserId: params.actorUserId,
      }),
    );

    await manager.save(
      manager.create(AuditLog, {
        companyId: params.companyId,
        actorUserId: params.actorUserId,
        action: 'invite.created',
        entity: 'Invite',
        entityId: invite.id,
        metadata: { email: params.email, role: params.role },
      }),
    );

    return { invite, token };
  }

  async listForCompany(companyId: string): Promise<Invite[]> {
    const manager = this.tenantContext.getManager();
    return manager.find(Invite, { where: { companyId }, order: { createdAt: 'DESC' } });
  }

  async revoke(companyId: string, actorUserId: string, inviteId: string): Promise<Invite> {
    const manager = this.tenantContext.getManager();
    const invite = await manager.findOne(Invite, { where: { id: inviteId, companyId } });
    if (!invite) {
      throw new NotFoundException('Invite not found');
    }
    if (invite.acceptedAt) {
      throw new ConflictException('This invite has already been accepted');
    }

    invite.revokedAt = new Date();
    await manager.save(invite);

    await manager.save(
      manager.create(AuditLog, {
        companyId,
        actorUserId,
        action: 'invite.revoked',
        entity: 'Invite',
        entityId: invite.id,
      }),
    );

    return invite;
  }

  /** Public — lets an accept-invite page show "you're joining {company} as a {role}" before asking for a password. */
  async preview(token: string): Promise<{ email: string; fullName: string; role: UserRole; companyName: string; valid: boolean }> {
    const invite = await this.invites.findOne({
      where: { tokenHash: this.hashToken(token) },
      relations: { company: true },
    });
    if (!invite) {
      throw new NotFoundException('Invite not found');
    }

    const valid = !invite.acceptedAt && !invite.revokedAt && invite.expiresAt > new Date();
    return { email: invite.email, fullName: invite.fullName, role: invite.role, companyName: invite.company.name, valid };
  }

  /**
   * Public — creates the account and logs the new user in immediately.
   * `phone` is required for courier invites specifically (not dispatchers):
   * it's how the mobile app's SMS-based forgot-password flow identifies an
   * account, so a courier who never provides one could never recover a lost
   * password. Validated here rather than in the DTO because the DTO alone
   * doesn't know the invite's role yet.
   */
  async accept(
    token: string,
    password: string,
    phone?: string,
  ): Promise<TokenPair & { user: Omit<User, 'passwordHash'> }> {
    const invite = await this.invites.findOne({ where: { tokenHash: this.hashToken(token) } });
    if (!invite) {
      throw new NotFoundException('Invite not found');
    }
    if (invite.revokedAt) {
      throw new ConflictException('This invite has been revoked');
    }
    if (invite.acceptedAt) {
      throw new ConflictException('This invite has already been accepted');
    }
    if (invite.expiresAt < new Date()) {
      throw new ConflictException('This invite has expired');
    }
    if (invite.role === UserRole.COURIER && !phone) {
      throw new BadRequestException('Phone number is required for courier accounts');
    }

    const existingUser = await this.users.findOne({ where: { email: invite.email } });
    if (existingUser) {
      throw new ConflictException('An account with this email already exists');
    }

    // No tenant context exists yet (this request has no JWT) — open one
    // manually using the invite's own companyId, the same way
    // RealtimeGateway does for inbound WS messages.
    await this.tenantContext.runForActor({ companyId: invite.companyId, role: UserRole.COMPANY_ADMIN }, async () => {
      if (invite.role === UserRole.COURIER) {
        await this.couriersService.onboard({
          companyId: invite.companyId,
          actorUserId: invite.invitedByUserId,
          email: invite.email,
          fullName: invite.fullName,
          password,
          // Non-null: validated above (courier invites require it).
          phone: phone as string,
          vehicleType: invite.vehicleType as VehicleType,
          vehicleModel: invite.vehicleModel ?? undefined,
          plateNumber: invite.plateNumber ?? undefined,
        });
      } else {
        await this.usersService.createDispatcher({
          companyId: invite.companyId,
          actorUserId: invite.invitedByUserId,
          email: invite.email,
          fullName: invite.fullName,
          password,
        });
      }
    });

    invite.acceptedAt = new Date();
    await this.invites.save(invite);

    // Reuses the real, already-tested login path rather than re-deriving
    // token issuance here.
    return this.authService.login({ email: invite.email, password });
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }
}

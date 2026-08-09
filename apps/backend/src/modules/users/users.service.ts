import { ConflictException, Injectable } from '@nestjs/common';
import * as argon2 from 'argon2';
import { AuditLog, SupportedLocale, User, UserRole } from '../../database/entities';
import { TenantContextService } from '../../common/tenant/tenant-context.service';

@Injectable()
export class UsersService {
  constructor(private readonly tenantContext: TenantContextService) {}

  /**
   * `users` deliberately has no RLS policy (see EnableRowLevelSecurity
   * migration's docstring — login needs a pre-auth, cross-tenant lookup by
   * email, which an RLS policy keyed on the caller's companyId can't allow).
   * That makes this explicit companyId filter the ONLY tenant boundary for
   * this table — there is no database-level backstop here. Do not remove it.
   */
  async listForCompany(companyId: string): Promise<Omit<User, 'passwordHash'>[]> {
    const manager = this.tenantContext.getManager();
    const users = await manager.find(User, { where: { companyId } });
    return users.map(({ passwordHash: _passwordHash, ...safe }) => safe);
  }

  /**
   * Called by InvitesService once a dispatcher invite is accepted — never
   * directly from a controller. companyId/actorUserId trace back to the
   * Invite record (itself created by an authenticated COMPANY_ADMIN), not
   * request input, so a dispatcher can't specify an arbitrary companyId and
   * create a user in someone else's tenant.
   */
  async createDispatcher(params: {
    companyId: string;
    actorUserId: string | null;
    email: string;
    fullName: string;
    password: string;
    preferredLanguage?: SupportedLocale;
  }): Promise<Omit<User, 'passwordHash'>> {
    const manager = this.tenantContext.getManager();

    const existing = await manager.findOne(User, { where: { email: params.email } });
    if (existing) {
      throw new ConflictException('An account with this email already exists');
    }

    const passwordHash = await argon2.hash(params.password, { type: argon2.argon2id });

    const user = await manager.save(
      manager.create(User, {
        companyId: params.companyId,
        email: params.email,
        fullName: params.fullName,
        passwordHash,
        role: UserRole.DISPATCHER,
        preferredLanguage: params.preferredLanguage ?? SupportedLocale.UZ,
      }),
    );

    await manager.save(
      manager.create(AuditLog, {
        companyId: params.companyId,
        actorUserId: params.actorUserId,
        action: 'user.dispatcher_created',
        entity: 'User',
        entityId: user.id,
      }),
    );

    const { passwordHash: _passwordHash, ...safe } = user;
    return safe;
  }
}

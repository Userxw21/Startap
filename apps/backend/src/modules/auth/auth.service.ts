import { ConflictException, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import * as argon2 from 'argon2';
import { randomBytes, randomUUID, createHash } from 'crypto';
import { DataSource, IsNull, Repository } from 'typeorm';
import { AuditLog, Company, CompanyPlan, CompanyStatus, RefreshToken, User, UserRole } from '../../database/entities';
import { RegisterCompanyDto } from './dto/register-company.dto';
import { LoginDto } from './dto/login.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { OtpService } from './otp.service';
import { SMS_SENDER, SmsSender } from '../../sms/sms.service';

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: string;
}

/**
 * Login/register/refresh are pre-authentication operations — there is no
 * companyId to scope by yet, so this service intentionally uses the default
 * (non tenant-scoped) repositories rather than TenantContextService.
 *
 * Once Phase 12 hardens the DB connection to a non-owner role for RLS to
 * actually bite (see EnableRowLevelSecurity migration), the connection this
 * service uses for the email lookup in login() must be granted BYPASSRLS
 * (or use SET ROLE) — login is inherently cross-tenant by necessity, since
 * a user doesn't know their companyId until after they're authenticated.
 */
@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(Company) private readonly companies: Repository<Company>,
    @InjectRepository(RefreshToken) private readonly refreshTokens: Repository<RefreshToken>,
    @InjectRepository(AuditLog) private readonly auditLogs: Repository<AuditLog>,
    private readonly dataSource: DataSource,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly otp: OtpService,
    @Inject(SMS_SENDER) private readonly sms: SmsSender,
  ) {}

  async registerCompany(dto: RegisterCompanyDto): Promise<{ company: Company; admin: User }> {
    const existing = await this.users.findOne({ where: { email: dto.adminEmail } });
    if (existing) {
      throw new ConflictException('An account with this email already exists');
    }

    const passwordHash = await argon2.hash(dto.password, { type: argon2.argon2id });

    return this.dataSource.transaction(async (manager) => {
      const company = await manager.save(
        manager.create(Company, {
          name: dto.companyName,
          plan: CompanyPlan.TRIAL,
          status: CompanyStatus.ACTIVE,
        }),
      );

      const admin = await manager.save(
        manager.create(User, {
          companyId: company.id,
          email: dto.adminEmail,
          fullName: dto.adminFullName,
          passwordHash,
          role: UserRole.COMPANY_ADMIN,
          preferredLanguage: dto.preferredLanguage,
        }),
      );

      await manager.save(
        manager.create(AuditLog, {
          companyId: company.id,
          actorUserId: admin.id,
          action: 'company.registered',
          entity: 'Company',
          entityId: company.id,
        }),
      );

      return { company, admin };
    });
  }

  async getProfile(userId: string): Promise<Omit<User, 'passwordHash'>> {
    const user = await this.users.findOne({ where: { id: userId } });
    if (!user || !user.isActive) {
      throw new UnauthorizedException('Account no longer active');
    }
    const { passwordHash: _passwordHash, ...safe } = user;
    return safe;
  }

  async login(dto: LoginDto): Promise<TokenPair & { user: Omit<User, 'passwordHash'> }> {
    const user = await this.users.findOne({ where: { email: dto.email } });
    if (!user || !user.isActive) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const passwordValid = await argon2.verify(user.passwordHash, dto.password);
    if (!passwordValid) {
      throw new UnauthorizedException('Invalid email or password');
    }

    user.lastLoginAt = new Date();
    await this.users.save(user);

    const tokens = await this.issueTokenPair(user, randomUUID());
    const { passwordHash: _passwordHash, ...safeUser } = user;
    return { ...tokens, user: safeUser };
  }

  async refresh(refreshToken: string): Promise<TokenPair> {
    const tokenHash = this.hashToken(refreshToken);
    const stored = await this.refreshTokens.findOne({ where: { tokenHash } });

    if (!stored) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    if (stored.revokedAt) {
      // A previously-rotated token was replayed — treat as token theft and
      // kill every token in the family, forcing a fresh login everywhere.
      await this.refreshTokens.update({ familyId: stored.familyId }, { revokedAt: new Date() });
      throw new UnauthorizedException('Refresh token has already been used; all sessions revoked');
    }

    if (stored.expiresAt < new Date()) {
      throw new UnauthorizedException('Refresh token expired');
    }

    const user = await this.users.findOne({ where: { id: stored.userId } });
    if (!user || !user.isActive) {
      throw new UnauthorizedException('Account no longer active');
    }

    const tokens = await this.issueTokenPair(user, stored.familyId);

    stored.revokedAt = new Date();
    stored.replacedByTokenHash = this.hashToken(tokens.refreshToken);
    await this.refreshTokens.save(stored);

    return tokens;
  }

  async logout(refreshToken: string): Promise<void> {
    const tokenHash = this.hashToken(refreshToken);
    const stored = await this.refreshTokens.findOne({ where: { tokenHash } });
    if (stored) {
      await this.refreshTokens.update({ familyId: stored.familyId }, { revokedAt: new Date() });
    }
  }

  /**
   * Courier-only (see AcceptInviteDto/InvitesService — dispatchers never
   * provide a phone, so they can't use this path; that's an accepted scope
   * limit, not an oversight). Deliberately resolves the same way whether or
   * not the phone matches an account, or is on OtpService's cooldown — same
   * "don't reveal whether the account exists" reasoning as login(), applied
   * to phone numbers instead of email.
   */
  async forgotPassword(phone: string): Promise<void> {
    const user = await this.users.findOne({ where: { phone, role: UserRole.COURIER } });
    if (!user || !user.isActive) return;

    const code = await this.otp.issue(phone);
    if (!code) return; // on cooldown — a real code was already sent recently

    await this.sms.send(phone, `Kuryer platformasi: parolni tiklash kodi — ${code}. Kod 5 daqiqa amal qiladi.`);
  }

  /**
   * One error message for both "wrong/expired code" and "no account with
   * this phone" — same enumeration-avoidance reasoning as forgotPassword().
   * Revokes every existing refresh token for the account afterward: a
   * password reset should force re-login everywhere, the same posture
   * already taken for detected refresh-token theft in refresh() above.
   */
  async resetPassword(dto: ResetPasswordDto): Promise<void> {
    const codeValid = await this.otp.verify(dto.phone, dto.code);
    const user = codeValid ? await this.users.findOne({ where: { phone: dto.phone, role: UserRole.COURIER } }) : null;
    if (!user) {
      throw new UnauthorizedException('Invalid or expired code');
    }

    user.passwordHash = await argon2.hash(dto.newPassword, { type: argon2.argon2id });
    await this.users.save(user);
    await this.refreshTokens.update({ userId: user.id, revokedAt: IsNull() }, { revokedAt: new Date() });
  }

  private async issueTokenPair(user: User, familyId: string): Promise<TokenPair> {
    const accessTtl = this.config.get<string>('auth.accessTtl');
    const accessToken = await this.jwt.signAsync(
      { sub: user.id, companyId: user.companyId, role: user.role, email: user.email },
      { secret: this.config.get<string>('auth.accessSecret'), expiresIn: accessTtl },
    );

    const refreshToken = randomBytes(48).toString('hex');
    const refreshTtlMs = this.parseTtlToMs(this.config.get<string>('auth.refreshTtl'));

    await this.refreshTokens.save(
      this.refreshTokens.create({
        userId: user.id,
        tokenHash: this.hashToken(refreshToken),
        familyId,
        expiresAt: new Date(Date.now() + refreshTtlMs),
      }),
    );

    return { accessToken, refreshToken, expiresIn: accessTtl ?? '15m' };
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private parseTtlToMs(ttl: string | undefined): number {
    const match = /^(\d+)([smhd])$/.exec(ttl ?? '30d');
    if (!match) return 30 * 24 * 60 * 60 * 1000;
    const value = parseInt(match[1], 10);
    const unitMs = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 }[match[2]] ?? 86_400_000;
    return value * unitMs;
  }
}

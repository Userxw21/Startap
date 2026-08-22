import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as argon2 from 'argon2';
import { AuthService } from './auth.service';
import { CompanyPlan, CompanyStatus, SupportedLocale, UserRole } from '../../database/entities';

type MockRepo<T = any> = {
  findOne: jest.Mock;
  save: jest.Mock;
  create: jest.Mock;
  update: jest.Mock;
};

function mockRepo(): MockRepo {
  return {
    findOne: jest.fn(),
    save: jest.fn((entity) => Promise.resolve(entity)),
    create: jest.fn((entity) => entity),
    update: jest.fn(),
  };
}

describe('AuthService', () => {
  let service: AuthService;
  let users: MockRepo;
  let companies: MockRepo;
  let refreshTokens: MockRepo;
  let auditLogs: MockRepo;
  let dataSource: { transaction: jest.Mock };
  let jwt: { signAsync: jest.Mock };
  let config: ConfigService;
  let otp: { issue: jest.Mock; verify: jest.Mock };
  let sms: { send: jest.Mock };

  const FIXED_PASSWORD = 'super-secret-passw0rd';
  let passwordHash: string;

  beforeAll(async () => {
    passwordHash = await argon2.hash(FIXED_PASSWORD, { type: argon2.argon2id });
  });

  beforeEach(() => {
    users = mockRepo();
    companies = mockRepo();
    refreshTokens = mockRepo();
    auditLogs = mockRepo();
    dataSource = { transaction: jest.fn() };
    jwt = { signAsync: jest.fn().mockResolvedValue('signed.jwt.token') };
    config = {
      get: (key: string) =>
        ({
          'auth.accessSecret': 'test-access-secret',
          'auth.accessTtl': '15m',
          'auth.refreshSecret': 'test-refresh-secret',
          'auth.refreshTtl': '30d',
        })[key],
    } as unknown as ConfigService;

    otp = { issue: jest.fn(), verify: jest.fn() };
    sms = { send: jest.fn().mockResolvedValue(undefined) };

    service = new AuthService(
      users as any,
      companies as any,
      refreshTokens as any,
      auditLogs as any,
      dataSource as any,
      jwt as unknown as JwtService,
      config,
      otp as any,
      sms as any,
    );
  });

  describe('login', () => {
    const activeUser = {
      id: 'user-1',
      companyId: 'company-1',
      email: 'courier@example.com',
      passwordHash: '',
      isActive: true,
      role: UserRole.COURIER,
      preferredLanguage: SupportedLocale.UZ,
    };

    it('issues a token pair and never returns the password hash on success', async () => {
      users.findOne.mockResolvedValue({ ...activeUser, passwordHash });

      const result = await service.login({ email: activeUser.email, password: FIXED_PASSWORD });

      expect(result.accessToken).toBe('signed.jwt.token');
      expect(result.refreshToken).toEqual(expect.any(String));
      expect(result.user).not.toHaveProperty('passwordHash');
      expect(refreshTokens.save).toHaveBeenCalled();
    });

    it('rejects an unknown email without revealing whether the account exists', async () => {
      users.findOne.mockResolvedValue(null);
      await expect(service.login({ email: 'nobody@example.com', password: 'x' })).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('rejects a wrong password', async () => {
      users.findOne.mockResolvedValue({ ...activeUser, passwordHash });
      await expect(service.login({ email: activeUser.email, password: 'wrong-password' })).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('rejects a deactivated account even with the correct password', async () => {
      users.findOne.mockResolvedValue({ ...activeUser, passwordHash, isActive: false });
      await expect(service.login({ email: activeUser.email, password: FIXED_PASSWORD })).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  describe('refresh', () => {
    it('rejects a token that does not exist', async () => {
      refreshTokens.findOne.mockResolvedValue(null);
      await expect(service.refresh('unknown-token')).rejects.toThrow(UnauthorizedException);
    });

    it('rejects an expired token', async () => {
      refreshTokens.findOne.mockResolvedValue({
        familyId: 'family-1',
        userId: 'user-1',
        revokedAt: null,
        expiresAt: new Date(Date.now() - 1000),
      });
      await expect(service.refresh('expired-token')).rejects.toThrow(UnauthorizedException);
    });

    it('treats a replayed (already-rotated) token as theft and revokes the whole family', async () => {
      refreshTokens.findOne.mockResolvedValue({
        familyId: 'family-1',
        userId: 'user-1',
        revokedAt: new Date(),
        expiresAt: new Date(Date.now() + 1000),
      });

      await expect(service.refresh('already-used-token')).rejects.toThrow(UnauthorizedException);
      expect(refreshTokens.update).toHaveBeenCalledWith(
        { familyId: 'family-1' },
        expect.objectContaining({ revokedAt: expect.any(Date) }),
      );
    });

    it('rotates a valid token: issues a new pair and marks the old one revoked', async () => {
      const stored = {
        familyId: 'family-1',
        userId: 'user-1',
        revokedAt: null,
        expiresAt: new Date(Date.now() + 1000 * 60 * 60),
      };
      refreshTokens.findOne.mockResolvedValue(stored);
      users.findOne.mockResolvedValue({
        id: 'user-1',
        isActive: true,
        companyId: 'company-1',
        role: UserRole.COURIER,
      });

      const result = await service.refresh('valid-token');

      expect(result.accessToken).toBe('signed.jwt.token');
      expect(stored.revokedAt).not.toBeNull();
      expect(refreshTokens.save).toHaveBeenCalledWith(expect.objectContaining({ familyId: 'family-1' }));
    });
  });

  describe('registerCompany', () => {
    it('rejects registration when the admin email is already taken', async () => {
      users.findOne.mockResolvedValue({ id: 'existing-user' });
      await expect(
        service.registerCompany({
          companyName: 'Test LLC',
          adminEmail: 'taken@example.com',
          adminFullName: 'Admin Name',
          password: 'a-strong-enough-password',
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('creates a company and a COMPANY_ADMIN user in one transaction', async () => {
      users.findOne.mockResolvedValue(null);
      const created: any[] = [];
      dataSource.transaction.mockImplementation(async (cb) => {
        const manager = {
          create: (_entity: any, data: any) => data,
          save: async (data: any) => {
            const saved = { id: `id-${created.length}`, ...data };
            created.push(saved);
            return saved;
          },
        };
        return cb(manager);
      });

      const result = await service.registerCompany({
        companyName: 'Test LLC',
        adminEmail: 'admin@example.com',
        adminFullName: 'Admin Name',
        password: 'a-strong-enough-password',
      });

      expect(result.company.name).toBe('Test LLC');
      expect(result.admin.role).toBe(UserRole.COMPANY_ADMIN);
      expect(result.company.status).toBe(CompanyStatus.ACTIVE);
      expect(result.company.plan).toBe(CompanyPlan.TRIAL);
    });
  });

  describe('forgotPassword', () => {
    const courierPhone = '998911234567';

    it('sends an SMS when the phone matches an active courier account', async () => {
      users.findOne.mockResolvedValue({ id: 'courier-1', phone: courierPhone, role: UserRole.COURIER, isActive: true });
      otp.issue.mockResolvedValue('123456');

      await service.forgotPassword(courierPhone);

      expect(sms.send).toHaveBeenCalledWith(courierPhone, expect.stringContaining('123456'));
    });

    it('does nothing when the phone matches no account — same "do not reveal" posture as login()', async () => {
      users.findOne.mockResolvedValue(null);

      await service.forgotPassword(courierPhone);

      expect(otp.issue).not.toHaveBeenCalled();
      expect(sms.send).not.toHaveBeenCalled();
    });

    it('does nothing when a code was already issued too recently (OtpService cooldown)', async () => {
      users.findOne.mockResolvedValue({ id: 'courier-1', phone: courierPhone, role: UserRole.COURIER, isActive: true });
      otp.issue.mockResolvedValue(null);

      await service.forgotPassword(courierPhone);

      expect(sms.send).not.toHaveBeenCalled();
    });
  });

  describe('resetPassword', () => {
    const courierPhone = '998911234567';

    it('rejects a wrong/expired code without saying whether the phone is registered', async () => {
      otp.verify.mockResolvedValue(false);

      await expect(
        service.resetPassword({ phone: courierPhone, code: '000000', newPassword: 'a-new-strong-password' }),
      ).rejects.toThrow(UnauthorizedException);
      expect(users.save).not.toHaveBeenCalled();
    });

    it('rejects a correct code if no account matches the phone (defense in depth)', async () => {
      otp.verify.mockResolvedValue(true);
      users.findOne.mockResolvedValue(null);

      await expect(
        service.resetPassword({ phone: courierPhone, code: '123456', newPassword: 'a-new-strong-password' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('updates the password and revokes every existing refresh token for the account', async () => {
      otp.verify.mockResolvedValue(true);
      const user = { id: 'courier-1', phone: courierPhone, role: UserRole.COURIER, passwordHash: 'old-hash' };
      users.findOne.mockResolvedValue(user);

      await service.resetPassword({ phone: courierPhone, code: '123456', newPassword: 'a-new-strong-password' });

      expect(users.save).toHaveBeenCalledWith(expect.objectContaining({ id: 'courier-1' }));
      expect(users.save.mock.calls[0][0].passwordHash).not.toBe('old-hash');
      expect(refreshTokens.update).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 'courier-1' }),
        expect.objectContaining({ revokedAt: expect.any(Date) }),
      );
    });
  });
});

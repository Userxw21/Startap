import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { randomUUID } from 'crypto';
import { AppModule } from '../src/app.module';

/**
 * Exercises the real HTTP surface (register → login → protected route) and,
 * separately from the RLS test, proves layer-1 (application-level) tenant
 * scoping: a dispatcher from Company A never sees Company B's users, even
 * though this endpoint's underlying table has no RLS policy (see
 * UsersService's docstring on why). Requires a live Postgres — see README.
 */
describe('Auth + tenant scoping (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    app.setGlobalPrefix('api/v1');
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  function registerCompany(suffix: string) {
    return request(app.getHttpServer())
      .post('/api/v1/auth/register-company')
      .send({
        companyName: `Test Co ${suffix}`,
        adminEmail: `admin-${suffix}@example.com`,
        adminFullName: 'Test Admin',
        password: 'a-strong-enough-password-123',
      });
  }

  it('rejects protected routes with no token', async () => {
    await request(app.getHttpServer()).get('/api/v1/users').expect(401);
  });

  it('registers a company, logs in, and lists only that company\'s own users', async () => {
    const suffixA = randomUUID().slice(0, 8);
    const suffixB = randomUUID().slice(0, 8);

    const regA = await registerCompany(suffixA).expect(201);
    await registerCompany(suffixB).expect(201);

    const loginA = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: `admin-${suffixA}@example.com`, password: 'a-strong-enough-password-123' })
      .expect(200);

    expect(loginA.body.accessToken).toEqual(expect.any(String));
    expect(loginA.body.user).not.toHaveProperty('passwordHash');

    const usersA = await request(app.getHttpServer())
      .get('/api/v1/users')
      .set('Authorization', `Bearer ${loginA.body.accessToken}`)
      .expect(200);

    expect(usersA.body).toHaveLength(1);
    expect(usersA.body[0].email).toBe(`admin-${suffixA}@example.com`);
    expect(regA.body.company.name).toBe(`Test Co ${suffixA}`);
  });

  it('rejects login with a wrong password without revealing which part was wrong', async () => {
    const suffix = randomUUID().slice(0, 8);
    await registerCompany(suffix).expect(201);

    await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: `admin-${suffix}@example.com`, password: 'totally-wrong-password' })
      .expect(401);
  });

  it('rotates refresh tokens and rejects reuse of an already-rotated token', async () => {
    const suffix = randomUUID().slice(0, 8);
    await registerCompany(suffix).expect(201);

    const login = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: `admin-${suffix}@example.com`, password: 'a-strong-enough-password-123' })
      .expect(200);

    const firstRefreshToken = login.body.refreshToken;

    const rotated = await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: firstRefreshToken })
      .expect(200);

    expect(rotated.body.refreshToken).not.toBe(firstRefreshToken);

    // Replaying the now-rotated-away token must fail, not silently succeed.
    await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: firstRefreshToken })
      .expect(401);
  });
});

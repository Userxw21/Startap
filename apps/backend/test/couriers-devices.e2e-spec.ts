import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe, ClassSerializerInterceptor } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import request from 'supertest';
import { randomUUID } from 'crypto';
import { AppModule } from '../src/app.module';

describe('Couriers + Devices (e2e)', () => {
  let app: INestApplication;
  let adminToken: string;
  let courierId: string;
  let courierToken: string;
  let inviteToken: string;
  const suffix = randomUUID().slice(0, 8);
  const courierEmail = `courier-${suffix}@example.com`;
  const courierPassword = 'a-strong-enough-password-123';

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    app.useGlobalInterceptors(new ClassSerializerInterceptor(app.get(Reflector)));
    app.setGlobalPrefix('api/v1');
    await app.init();

    await request(app.getHttpServer()).post('/api/v1/auth/register-company').send({
      companyName: `Test Co ${suffix}`,
      adminEmail: `admin-${suffix}@example.com`,
      adminFullName: 'Test Admin',
      password: 'a-strong-enough-password-123',
    });

    const login = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: `admin-${suffix}@example.com`, password: 'a-strong-enough-password-123' });
    adminToken = login.body.accessToken;
  });

  afterAll(async () => {
    await app.close();
  });

  it('invites a courier — the admin never sees or sets a password', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/invites')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ email: courierEmail, fullName: 'Test Courier', role: 'COURIER', vehicleType: 'BICYCLE', plateNumber: 'ABC-123' })
      .expect(201);

    expect(res.body.email).toBe(courierEmail);
    expect(res.body.role).toBe('COURIER');
    expect(res.body.token).toEqual(expect.any(String));
    expect(res.body).not.toHaveProperty('password');
    inviteToken = res.body.token;
  });

  it('rejects a second invite for the same email while one is still pending', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/invites')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ email: courierEmail, fullName: 'Dup', role: 'COURIER', vehicleType: 'SCOOTER' })
      .expect(409);
  });

  it('lets the courier preview the invite before accepting', async () => {
    const res = await request(app.getHttpServer()).get(`/api/v1/invites/preview/${inviteToken}`).expect(200);
    expect(res.body.email).toBe(courierEmail);
    expect(res.body.role).toBe('COURIER');
    expect(res.body.valid).toBe(true);
  });

  it('accepts the invite, creating the account and never leaking the password hash', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/invites/accept')
      .send({ token: inviteToken, password: courierPassword })
      .expect(201);

    expect(res.body.user.email).toBe(courierEmail);
    expect(res.body.user).not.toHaveProperty('passwordHash');
    expect(res.body.accessToken).toEqual(expect.any(String));
    courierToken = res.body.accessToken;

    const me = await request(app.getHttpServer())
      .get('/api/v1/couriers/me')
      .set('Authorization', `Bearer ${courierToken}`)
      .expect(200);
    expect(me.body.vehicle.type).toBe('BICYCLE');
    expect(me.body.status).toBe('OFFLINE');
    courierId = me.body.id;
  });

  it('rejects accepting the same invite twice', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/invites/accept')
      .send({ token: inviteToken, password: courierPassword })
      .expect(409);
  });

  it('rejects a new invite for an email that already has an account', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/invites')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ email: courierEmail, fullName: 'Dup Again', role: 'COURIER', vehicleType: 'SCOOTER' })
      .expect(409);
  });

  it('the courier can set their own status to AVAILABLE but not to DELIVERING', async () => {
    const updated = await request(app.getHttpServer())
      .patch('/api/v1/couriers/me/status')
      .set('Authorization', `Bearer ${courierToken}`)
      .send({ status: 'AVAILABLE' })
      .expect(200);
    expect(updated.body.status).toBe('AVAILABLE');

    await request(app.getHttpServer())
      .patch('/api/v1/couriers/me/status')
      .set('Authorization', `Bearer ${courierToken}`)
      .send({ status: 'DELIVERING' })
      .expect(400);
  });

  it('a courier cannot list all couriers (dispatcher/admin only)', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/couriers')
      .set('Authorization', `Bearer ${courierToken}`)
      .expect(403);
  });

  it('registers a device, pairs it to the courier, then revokes it', async () => {
    const hardwareId = `HW-${suffix}`;

    const registered = await request(app.getHttpServer())
      .post('/api/v1/devices')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ hardwareId })
      .expect(201);
    expect(registered.body.status).toBe('UNPAIRED');

    const paired = await request(app.getHttpServer())
      .post(`/api/v1/devices/${registered.body.id}/pair`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ courierId })
      .expect(201);

    expect(paired.body.pairingToken).toEqual(expect.any(String));
    expect(paired.body.device.status).toBe('PAIRED');
    expect(paired.body.device).not.toHaveProperty('pairingTokenHash');

    const revoked = await request(app.getHttpServer())
      .post(`/api/v1/devices/${registered.body.id}/revoke`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({})
      .expect(201);
    expect(revoked.body.status).toBe('REVOKED');
  });
});

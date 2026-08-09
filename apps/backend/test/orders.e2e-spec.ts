import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe, ClassSerializerInterceptor } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import request from 'supertest';
import { randomUUID } from 'crypto';
import { AppModule } from '../src/app.module';

/**
 * This is the one file most worth running first once a live Postgres/PostGIS
 * is available: it round-trips pickup/delivery coordinates through the raw
 * SQL in OrdersService (ST_MakePoint on write, ST_X/ST_Y on read), which is
 * the one piece of this module I could not execute against a real database
 * before writing it — see OrdersService's class docstring.
 */
describe('Orders (e2e)', () => {
  let app: INestApplication;
  let adminToken: string;
  let courierId: string;
  let courierToken: string;
  const suffix = randomUUID().slice(0, 8);

  // Tashkent-ish coordinates — arbitrary, just need to be valid and distinct.
  const pickup = { lat: 41.311081, lng: 69.240562 };
  const delivery = { lat: 41.32993, lng: 69.267294 };

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

    const courier = await request(app.getHttpServer())
      .post('/api/v1/couriers')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        email: `courier-${suffix}@example.com`,
        fullName: 'Test Courier',
        password: 'a-strong-enough-password-123',
        vehicleType: 'BICYCLE',
      });
    courierId = courier.body.id;

    const courierLogin = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: `courier-${suffix}@example.com`, password: 'a-strong-enough-password-123' });
    courierToken = courierLogin.body.accessToken;
  });

  afterAll(async () => {
    await app.close();
  });

  it('creates an order and returns the exact coordinates back (PostGIS round-trip)', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/orders')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        pickupAddress: 'EVOS, Amir Temur ko\'chasi',
        pickup,
        deliveryAddress: 'Customer address',
        delivery,
      })
      .expect(201);

    expect(res.body.status).toBe('CREATED');
    expect(res.body.pickup.lat).toBeCloseTo(pickup.lat, 5);
    expect(res.body.pickup.lng).toBeCloseTo(pickup.lng, 5);
    expect(res.body.delivery.lat).toBeCloseTo(delivery.lat, 5);
    expect(res.body.delivery.lng).toBeCloseTo(delivery.lng, 5);
  });

  it('runs an order through its full lifecycle and flips courier status accordingly', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/v1/orders')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ pickupAddress: 'A', pickup, deliveryAddress: 'B', delivery })
      .expect(201);
    const orderId = created.body.id;

    await request(app.getHttpServer())
      .post(`/api/v1/orders/${orderId}/assign`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ courierId })
      .expect(201)
      .expect((r) => expect(r.body.status).toBe('ASSIGNED'));

    // A courier cannot skip straight from ASSIGNED to PICKED_UP.
    await request(app.getHttpServer())
      .post(`/api/v1/orders/${orderId}/transition`)
      .set('Authorization', `Bearer ${courierToken}`)
      .send({ toStatus: 'PICKED_UP' })
      .expect(400);

    await request(app.getHttpServer())
      .post(`/api/v1/orders/${orderId}/transition`)
      .set('Authorization', `Bearer ${courierToken}`)
      .send({ toStatus: 'ACCEPTED' })
      .expect(201);

    const meAfterAccept = await request(app.getHttpServer())
      .get('/api/v1/couriers/me')
      .set('Authorization', `Bearer ${courierToken}`)
      .expect(200);
    expect(meAfterAccept.body.status).toBe('DELIVERING');

    for (const status of ['PICKUP', 'PICKED_UP', 'DELIVERING', 'DELIVERED']) {
      await request(app.getHttpServer())
        .post(`/api/v1/orders/${orderId}/transition`)
        .set('Authorization', `Bearer ${courierToken}`)
        .send({ toStatus: status })
        .expect(201)
        .expect((r) => expect(r.body.status).toBe(status));
    }

    const meAfterDelivered = await request(app.getHttpServer())
      .get('/api/v1/couriers/me')
      .set('Authorization', `Bearer ${courierToken}`)
      .expect(200);
    expect(meAfterDelivered.body.status).toBe('AVAILABLE');
  });

  it('rejects a courier acting on an order assigned to a different courier', async () => {
    const otherCourier = await request(app.getHttpServer())
      .post('/api/v1/couriers')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        email: `other-courier-${suffix}@example.com`,
        fullName: 'Other Courier',
        password: 'a-strong-enough-password-123',
        vehicleType: 'SCOOTER',
      });
    const otherLogin = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: `other-courier-${suffix}@example.com`, password: 'a-strong-enough-password-123' });

    const created = await request(app.getHttpServer())
      .post('/api/v1/orders')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ pickupAddress: 'A', pickup, deliveryAddress: 'B', delivery })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/api/v1/orders/${created.body.id}/assign`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ courierId }) // assigned to the FIRST courier
      .expect(201);

    // The SECOND courier — who has a real Courier profile, just not this order — tries to accept it.
    await request(app.getHttpServer())
      .post(`/api/v1/orders/${created.body.id}/transition`)
      .set('Authorization', `Bearer ${otherLogin.body.accessToken}`)
      .send({ toStatus: 'ACCEPTED' })
      .expect(403);

    expect(otherCourier.body.id).not.toBe(courierId);
  });
});

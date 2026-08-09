import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe, ClassSerializerInterceptor } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import request from 'supertest';
import { randomUUID } from 'crypto';
import { AppModule } from '../src/app.module';
import { onboardCourierViaInvite } from './helpers';

/**
 * Runs one order through its full DELIVERED lifecycle (same pattern as
 * orders.e2e-spec.ts) and confirms AnalyticsService's aggregate queries
 * actually see it — this is the one thing that file's own e2e suite doesn't
 * cover: whether GET /analytics/summary's numbers reflect real data,
 * including the ST_Distance query flagged as unverified in the README.
 */
describe('Analytics (e2e)', () => {
  let app: INestApplication;
  let adminToken: string;
  let courierId: string;
  let courierToken: string;
  const suffix = randomUUID().slice(0, 8);

  // Two distinct Tashkent-ish points a few km apart, so avgDeliveryDistanceMeters
  // has something non-zero to report.
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
      companyName: `Analytics Test Co ${suffix}`,
      adminEmail: `admin-${suffix}@example.com`,
      adminFullName: 'Test Admin',
      password: 'a-strong-enough-password-123',
    });
    const login = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: `admin-${suffix}@example.com`, password: 'a-strong-enough-password-123' });
    adminToken = login.body.accessToken;

    const courier = await onboardCourierViaInvite(app, adminToken, {
      email: `courier-${suffix}@example.com`,
      fullName: 'Analytics Test Courier',
      password: 'a-strong-enough-password-123',
      vehicleType: 'BICYCLE',
    });
    courierId = courier.courierId;
    courierToken = courier.accessToken;

    // Run one order all the way through to DELIVERED.
    const created = await request(app.getHttpServer())
      .post('/api/v1/orders')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ pickupAddress: 'Pickup point', pickup, deliveryAddress: 'Delivery point', delivery })
      .expect(201);
    const orderId = created.body.id;

    await request(app.getHttpServer())
      .post(`/api/v1/orders/${orderId}/assign`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ courierId })
      .expect(201);

    for (const toStatus of ['ACCEPTED', 'PICKUP', 'PICKED_UP', 'DELIVERING', 'DELIVERED']) {
      await request(app.getHttpServer())
        .post(`/api/v1/orders/${orderId}/transition`)
        .set('Authorization', `Bearer ${courierToken}`)
        .send({ toStatus })
        .expect(201);
    }
  });

  afterAll(async () => {
    await app.close();
  });

  it('rejects unauthenticated requests', async () => {
    await request(app.getHttpServer()).get('/api/v1/analytics/summary').expect(401);
  });

  it('rejects a courier (COMPANY_ADMIN/DISPATCHER only)', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/analytics/summary')
      .set('Authorization', `Bearer ${courierToken}`)
      .expect(403);
  });

  it('reflects the delivered order in the summary', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/analytics/summary')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(res.body.orders.total).toBeGreaterThanOrEqual(1);
    expect(res.body.orders.byStatus.DELIVERED).toBeGreaterThanOrEqual(1);

    // ACCEPTED -> DELIVERED happened within this test run, seconds apart —
    // not null, and small (well under an hour), proves the CTE join actually
    // matched the right order_status_history rows rather than silently
    // returning nothing.
    expect(res.body.avgDeliveryTimeSeconds).not.toBeNull();
    expect(res.body.avgDeliveryTimeSeconds).toBeGreaterThanOrEqual(0);
    expect(res.body.avgDeliveryTimeSeconds).toBeLessThan(3600);

    // The one PostGIS query in this service — pickup/delivery are ~3km apart
    // in real coordinates, so a non-null, non-zero result here is exactly
    // the ST_Distance round-trip this test exists to confirm.
    expect(res.body.avgDeliveryDistanceMeters).not.toBeNull();
    expect(res.body.avgDeliveryDistanceMeters).toBeGreaterThan(1000);

    const ourCourier = res.body.topCouriers.find((c: { courierId: string }) => c.courierId === courierId);
    expect(ourCourier).toBeDefined();
    expect(ourCourier.deliveredCount).toBeGreaterThanOrEqual(1);
  });

  it('honors an explicit date range that excludes the delivery', async () => {
    const longAgo = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);
    const stillLongAgo = new Date(Date.now() - 300 * 24 * 60 * 60 * 1000);

    const res = await request(app.getHttpServer())
      .get('/api/v1/analytics/summary')
      .query({ from: longAgo.toISOString(), to: stillLongAgo.toISOString() })
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(res.body.orders.total).toBe(0);
    expect(res.body.topCouriers).toHaveLength(0);
  });
});

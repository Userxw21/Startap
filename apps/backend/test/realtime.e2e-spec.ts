import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe, ClassSerializerInterceptor } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import request from 'supertest';
import { io, Socket } from 'socket.io-client';
import { randomUUID } from 'crypto';
import { AppModule } from '../src/app.module';

/**
 * Exercises RealtimeGateway end to end: JWT handshake auth, company-room
 * scoping, and the courier:location -> courier:location:update round trip —
 * the exact things flagged as unverified in the README. Runs the app on a
 * real ephemeral port (app.listen(0)) since, unlike supertest's HTTP
 * injection, a WebSocket client needs a real socket to connect to. No
 * explicit WS adapter is set here, so this uses Nest's default in-memory
 * Socket.IO adapter — the Redis-backed one (main.ts's RedisIoAdapter) only
 * matters for fan-out across multiple processes, irrelevant to one test process.
 */
jest.setTimeout(15000);

describe('Realtime (e2e)', () => {
  let app: INestApplication;
  let baseUrl: string;
  const suffix = randomUUID().slice(0, 8);

  let companyAAdminToken: string;
  let companyACourierToken: string;
  let companyACourierId: string;

  let companyBAdminToken: string;

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    app.useGlobalInterceptors(new ClassSerializerInterceptor(app.get(Reflector)));
    app.setGlobalPrefix('api/v1');
    await app.init();
    await app.listen(0);

    const address = app.getHttpServer().address();
    baseUrl = `http://127.0.0.1:${address.port}`;

    // --- Company A: admin + courier ---
    await request(app.getHttpServer()).post('/api/v1/auth/register-company').send({
      companyName: `Realtime Test Co A ${suffix}`,
      adminEmail: `admin-a-${suffix}@example.com`,
      adminFullName: 'Admin A',
      password: 'a-strong-enough-password-123',
    });
    const loginA = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: `admin-a-${suffix}@example.com`, password: 'a-strong-enough-password-123' });
    companyAAdminToken = loginA.body.accessToken;

    const courierA = await request(app.getHttpServer())
      .post('/api/v1/couriers')
      .set('Authorization', `Bearer ${companyAAdminToken}`)
      .send({
        email: `courier-a-${suffix}@example.com`,
        fullName: 'Courier A',
        password: 'a-strong-enough-password-123',
        vehicleType: 'BICYCLE',
      });
    companyACourierId = courierA.body.id;

    const courierALogin = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: `courier-a-${suffix}@example.com`, password: 'a-strong-enough-password-123' });
    companyACourierToken = courierALogin.body.accessToken;

    // --- Company B: admin only (for the cross-tenant isolation check) ---
    await request(app.getHttpServer()).post('/api/v1/auth/register-company').send({
      companyName: `Realtime Test Co B ${suffix}`,
      adminEmail: `admin-b-${suffix}@example.com`,
      adminFullName: 'Admin B',
      password: 'a-strong-enough-password-123',
    });
    const loginB = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: `admin-b-${suffix}@example.com`, password: 'a-strong-enough-password-123' });
    companyBAdminToken = loginB.body.accessToken;
  });

  afterAll(async () => {
    await app.close();
  });

  function connect(token?: string): Socket {
    return io(baseUrl, {
      auth: token ? { token } : {},
      reconnection: false,
      forceNew: true,
    });
  }

  function waitForEvent<T = unknown>(socket: Socket, event: string, timeoutMs = 4000): Promise<T> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`Timed out waiting for "${event}"`)), timeoutMs);
      socket.once(event, (payload: T) => {
        clearTimeout(timer);
        resolve(payload);
      });
    });
  }

  it('disconnects a connection with no token', async () => {
    const socket = connect();
    await waitForEvent(socket, 'disconnect');
    socket.close();
  });

  it('disconnects a connection with a garbage token', async () => {
    const socket = connect('not-a-real-jwt');
    await waitForEvent(socket, 'disconnect');
    socket.close();
  });

  it('accepts a valid token and joins the company room', async () => {
    const socket = connect(companyAAdminToken);
    await waitForEvent(socket, 'connect');
    expect(socket.connected).toBe(true);
    socket.close();
  });

  it('broadcasts courier:location to other sockets in the same company', async () => {
    const adminSocket = connect(companyAAdminToken);
    const courierSocket = connect(companyACourierToken);
    await Promise.all([waitForEvent(adminSocket, 'connect'), waitForEvent(courierSocket, 'connect')]);

    const updatePromise = waitForEvent<{
      companyId: string;
      courierId: string;
      lat: number;
      lng: number;
    }>(adminSocket, 'courier:location:update');

    courierSocket.emit('courier:location', { lat: 41.311081, lng: 69.240562 });

    const payload = await updatePromise;
    expect(payload.courierId).toBe(companyACourierId);
    expect(payload.lat).toBeCloseTo(41.311081, 5);
    expect(payload.lng).toBeCloseTo(69.240562, 5);

    adminSocket.close();
    courierSocket.close();
  });

  it('never delivers another company\'s location updates (tenant isolation)', async () => {
    const companyBSocket = connect(companyBAdminToken);
    const courierASocket = connect(companyACourierToken);
    await Promise.all([waitForEvent(companyBSocket, 'connect'), waitForEvent(courierASocket, 'connect')]);

    let leaked = false;
    companyBSocket.on('courier:location:update', () => {
      leaked = true;
    });

    courierASocket.emit('courier:location', { lat: 41.32, lng: 69.25 });

    // No clean "event never arrives" signal exists other than waiting a
    // bounded time and checking nothing showed up.
    await new Promise((resolve) => setTimeout(resolve, 1000));
    expect(leaked).toBe(false);

    companyBSocket.close();
    courierASocket.close();
  });
});

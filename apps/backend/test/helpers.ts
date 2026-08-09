import { INestApplication } from '@nestjs/common';
import request from 'supertest';

/**
 * Onboarding a courier is now a two-step invite flow (create -> accept),
 * not a single admin-sets-a-password call — see InvitesModule. This
 * collapses both steps into one call so the four e2e spec files that all
 * need "just give me a logged-in courier" don't each re-implement it.
 */
export async function onboardCourierViaInvite(
  app: INestApplication,
  adminToken: string,
  params: { email: string; fullName: string; password: string; vehicleType: string; plateNumber?: string },
): Promise<{ courierId: string; accessToken: string }> {
  const invite = await request(app.getHttpServer())
    .post('/api/v1/invites')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({
      email: params.email,
      fullName: params.fullName,
      role: 'COURIER',
      vehicleType: params.vehicleType,
      plateNumber: params.plateNumber,
    })
    .expect(201);

  const accepted = await request(app.getHttpServer())
    .post('/api/v1/invites/accept')
    .send({ token: invite.body.token, password: params.password })
    .expect(201);
  const accessToken = accepted.body.accessToken;

  // accept()'s response is login tokens + the User row — the Courier row's
  // own id (what /orders/:id/assign etc. actually need) only comes from
  // asking the courier's own profile, same as a real client would.
  const profile = await request(app.getHttpServer())
    .get('/api/v1/couriers/me')
    .set('Authorization', `Bearer ${accessToken}`)
    .expect(200);

  return { courierId: profile.body.id, accessToken };
}

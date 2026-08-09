import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * See Invite entity's docstring for why this table is deliberately NOT
 * RLS-protected — same rationale as `users`/`refresh_tokens`.
 */
export class CreateInvites1700000000002 implements MigrationInterface {
  name = 'CreateInvites1700000000002';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "invites" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now(),
        "companyId" uuid NOT NULL REFERENCES "companies"("id") ON DELETE CASCADE,
        "email" text NOT NULL,
        "fullName" text NOT NULL,
        "role" user_role_enum NOT NULL,
        "vehicleType" vehicle_type_enum NULL,
        "vehicleModel" text NULL,
        "plateNumber" text NULL,
        "tokenHash" text NOT NULL UNIQUE,
        "expiresAt" timestamptz NOT NULL,
        "invitedByUserId" uuid NULL REFERENCES "users"("id") ON DELETE SET NULL,
        "acceptedAt" timestamptz NULL,
        "revokedAt" timestamptz NULL
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_invites_companyId" ON "invites" ("companyId")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "invites"`);
  }
}

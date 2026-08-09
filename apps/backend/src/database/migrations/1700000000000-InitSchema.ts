import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Initial schema for the courier platform.
 *
 * Written as raw SQL rather than TypeORM's `synchronize`/auto-generation
 * because PostGIS geography columns and GiST spatial indexes need exact
 * control that the schema-diff generator doesn't reliably produce.
 *
 * Column names are camelCase, quoted, to match TypeORM's default naming
 * strategy exactly (no snake_case conversion configured) — this must stay
 * consistent with apps/backend/src/database/entities/*.ts.
 *
 * Note on location_points: NOT natively partitioned by date in this first
 * migration. Postgres declarative partitioning would force `recordedAt`
 * into the primary key and the `clientId` unique constraint, which isn't
 * worth the complexity before we have real volume. The documented plan
 * (see original architecture §4) is a scheduled job that deletes rows
 * older than 30 days; partitioning is a follow-up migration once ingest
 * volume actually makes plain DELETEs too slow.
 */
export class InitSchema1700000000000 implements MigrationInterface {
  name = 'InitSchema1700000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "postgis"`);

    // --- Enum types -------------------------------------------------------
    await queryRunner.query(`CREATE TYPE "company_plan_enum" AS ENUM ('TRIAL','STANDARD','ENTERPRISE')`);
    await queryRunner.query(`CREATE TYPE "company_status_enum" AS ENUM ('ACTIVE','SUSPENDED')`);
    await queryRunner.query(`CREATE TYPE "user_role_enum" AS ENUM ('SUPER_ADMIN','COMPANY_ADMIN','DISPATCHER','COURIER')`);
    await queryRunner.query(`CREATE TYPE "supported_locale_enum" AS ENUM ('uz','ru','en')`);
    await queryRunner.query(`CREATE TYPE "vehicle_type_enum" AS ENUM ('BICYCLE','SCOOTER','MOTORCYCLE')`);
    await queryRunner.query(`CREATE TYPE "courier_status_enum" AS ENUM ('OFFLINE','ONLINE','AVAILABLE','DELIVERING','PAUSED')`);
    await queryRunner.query(`CREATE TYPE "device_status_enum" AS ENUM ('UNPAIRED','PAIRED','CONNECTED','DISCONNECTED','REVOKED')`);
    await queryRunner.query(`CREATE TYPE "device_transport_enum" AS ENUM ('USB','BLUETOOTH','MOCK')`);
    await queryRunner.query(`CREATE TYPE "order_status_enum" AS ENUM ('CREATED','ASSIGNED','ACCEPTED','PICKUP','PICKED_UP','DELIVERING','DELIVERED','CANCELLED','FAILED')`);
    await queryRunner.query(`CREATE TYPE "order_priority_enum" AS ENUM ('NORMAL','HIGH','URGENT')`);

    // --- companies ----------------------------------------------------------
    await queryRunner.query(`
      CREATE TABLE "companies" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now(),
        "name" text NOT NULL,
        "plan" company_plan_enum NOT NULL DEFAULT 'TRIAL',
        "status" company_status_enum NOT NULL DEFAULT 'ACTIVE'
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_companies_status" ON "companies" ("status")`);

    // --- users ----------------------------------------------------------------
    await queryRunner.query(`
      CREATE TABLE "users" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now(),
        "companyId" uuid NULL REFERENCES "companies"("id") ON DELETE CASCADE,
        "email" text NOT NULL UNIQUE,
        "phone" text NULL,
        "passwordHash" text NOT NULL,
        "fullName" text NOT NULL,
        "role" user_role_enum NOT NULL,
        "preferredLanguage" supported_locale_enum NOT NULL DEFAULT 'uz',
        "isActive" boolean NOT NULL DEFAULT true,
        "lastLoginAt" timestamptz NULL
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_users_companyId" ON "users" ("companyId")`);
    await queryRunner.query(`CREATE INDEX "IDX_users_companyId_role" ON "users" ("companyId","role")`);

    // --- devices (created before couriers because couriers.currentDeviceId references it) ---
    await queryRunner.query(`
      CREATE TABLE "devices" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now(),
        "companyId" uuid NOT NULL REFERENCES "companies"("id") ON DELETE CASCADE,
        "hardwareId" text NOT NULL UNIQUE,
        "pairingTokenHash" text NULL,
        "pairedCourierId" uuid NULL,
        "protocolVersion" integer NOT NULL DEFAULT 1,
        "firmwareVersion" text NULL,
        "status" device_status_enum NOT NULL DEFAULT 'UNPAIRED',
        "lastSeenAt" timestamptz NULL,
        "batteryPct" smallint NULL
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_devices_companyId" ON "devices" ("companyId")`);
    await queryRunner.query(`CREATE INDEX "IDX_devices_companyId_status" ON "devices" ("companyId","status")`);

    // --- couriers ---------------------------------------------------------
    await queryRunner.query(`
      CREATE TABLE "couriers" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now(),
        "companyId" uuid NOT NULL REFERENCES "companies"("id") ON DELETE CASCADE,
        "userId" uuid NOT NULL UNIQUE REFERENCES "users"("id") ON DELETE CASCADE,
        "status" courier_status_enum NOT NULL DEFAULT 'OFFLINE',
        "currentDeviceId" uuid NULL REFERENCES "devices"("id") ON DELETE SET NULL
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_couriers_companyId" ON "couriers" ("companyId")`);
    await queryRunner.query(`CREATE INDEX "IDX_couriers_companyId_status" ON "couriers" ("companyId","status")`);

    await queryRunner.query(`
      ALTER TABLE "devices"
      ADD CONSTRAINT "FK_devices_pairedCourierId" FOREIGN KEY ("pairedCourierId") REFERENCES "couriers"("id") ON DELETE SET NULL
    `);

    // --- vehicles -----------------------------------------------------------
    await queryRunner.query(`
      CREATE TABLE "vehicles" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now(),
        "courierId" uuid NOT NULL UNIQUE REFERENCES "couriers"("id") ON DELETE CASCADE,
        "type" vehicle_type_enum NOT NULL,
        "model" text NULL,
        "plateNumber" text NULL
      )
    `);

    // --- device_sessions ------------------------------------------------------
    await queryRunner.query(`
      CREATE TABLE "device_sessions" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now(),
        "deviceId" uuid NOT NULL REFERENCES "devices"("id") ON DELETE CASCADE,
        "courierId" uuid NOT NULL REFERENCES "couriers"("id") ON DELETE CASCADE,
        "connectionType" device_transport_enum NOT NULL,
        "startedAt" timestamptz NOT NULL,
        "endedAt" timestamptz NULL
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_device_sessions_deviceId" ON "device_sessions" ("deviceId")`);
    await queryRunner.query(`CREATE INDEX "IDX_device_sessions_courierId" ON "device_sessions" ("courierId")`);

    // --- orders -------------------------------------------------------------
    await queryRunner.query(`
      CREATE TABLE "orders" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now(),
        "companyId" uuid NOT NULL REFERENCES "companies"("id") ON DELETE CASCADE,
        "externalRef" text NULL,
        "status" order_status_enum NOT NULL DEFAULT 'CREATED',
        "priority" order_priority_enum NOT NULL DEFAULT 'NORMAL',
        "pickupAddress" text NOT NULL,
        "pickupLocation" geography(Point,4326) NOT NULL,
        "deliveryAddress" text NOT NULL,
        "deliveryLocation" geography(Point,4326) NOT NULL,
        "customerName" text NULL,
        "customerPhone" text NULL,
        "assignedCourierId" uuid NULL REFERENCES "couriers"("id") ON DELETE SET NULL,
        "pickupDeadlineAt" timestamptz NULL,
        "deliveryDeadlineAt" timestamptz NULL,
        "notes" text NULL
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_orders_companyId" ON "orders" ("companyId")`);
    await queryRunner.query(`CREATE INDEX "IDX_orders_companyId_status" ON "orders" ("companyId","status")`);
    await queryRunner.query(`CREATE INDEX "IDX_orders_assignedCourierId" ON "orders" ("assignedCourierId")`);
    await queryRunner.query(`CREATE INDEX "IDX_orders_pickupLocation" ON "orders" USING GIST ("pickupLocation")`);
    await queryRunner.query(`CREATE INDEX "IDX_orders_deliveryLocation" ON "orders" USING GIST ("deliveryLocation")`);

    // --- order_status_history --------------------------------------------
    await queryRunner.query(`
      CREATE TABLE "order_status_history" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now(),
        "orderId" uuid NOT NULL REFERENCES "orders"("id") ON DELETE CASCADE,
        "fromStatus" order_status_enum NULL,
        "toStatus" order_status_enum NOT NULL,
        "actorUserId" uuid NULL REFERENCES "users"("id") ON DELETE SET NULL
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_order_status_history_orderId" ON "order_status_history" ("orderId")`);

    // --- routes ---------------------------------------------------------------
    await queryRunner.query(`
      CREATE TABLE "routes" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now(),
        "orderId" uuid NOT NULL REFERENCES "orders"("id") ON DELETE CASCADE,
        "courierId" uuid NOT NULL REFERENCES "couriers"("id") ON DELETE CASCADE,
        "geometry" geography(LineString,4326) NOT NULL,
        "distanceMeters" integer NOT NULL,
        "durationSeconds" integer NOT NULL,
        "provider" text NOT NULL
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_routes_orderId" ON "routes" ("orderId")`);
    await queryRunner.query(`CREATE INDEX "IDX_routes_courierId" ON "routes" ("courierId")`);
    await queryRunner.query(`CREATE INDEX "IDX_routes_geometry" ON "routes" USING GIST ("geometry")`);

    // --- navigation_sessions ------------------------------------------------
    await queryRunner.query(`
      CREATE TABLE "navigation_sessions" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now(),
        "courierId" uuid NOT NULL REFERENCES "couriers"("id") ON DELETE CASCADE,
        "routeId" uuid NOT NULL REFERENCES "routes"("id") ON DELETE CASCADE,
        "deviceId" uuid NULL REFERENCES "devices"("id") ON DELETE SET NULL,
        "startedAt" timestamptz NOT NULL,
        "endedAt" timestamptz NULL,
        "rerouteCount" integer NOT NULL DEFAULT 0
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_navigation_sessions_courierId" ON "navigation_sessions" ("courierId")`);

    // --- location_points (see class-level note on partitioning) -------------
    await queryRunner.query(`
      CREATE TABLE "location_points" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now(),
        "courierId" uuid NOT NULL REFERENCES "couriers"("id") ON DELETE CASCADE,
        "location" geography(Point,4326) NOT NULL,
        "speedMps" real NULL,
        "headingDegrees" real NULL,
        "recordedAt" timestamptz NOT NULL,
        "source" text NOT NULL DEFAULT 'gps',
        "clientId" uuid NOT NULL UNIQUE
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_location_points_courierId_recordedAt" ON "location_points" ("courierId","recordedAt")`);
    await queryRunner.query(`CREATE INDEX "IDX_location_points_location" ON "location_points" USING GIST ("location")`);

    // --- deliveries -------------------------------------------------------
    await queryRunner.query(`
      CREATE TABLE "deliveries" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now(),
        "orderId" uuid NOT NULL UNIQUE REFERENCES "orders"("id") ON DELETE CASCADE,
        "courierId" uuid NOT NULL REFERENCES "couriers"("id") ON DELETE CASCADE,
        "podPhotoUrl" text NULL,
        "deliveredAt" timestamptz NOT NULL,
        "deliveryLocation" geography(Point,4326) NOT NULL
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_deliveries_courierId" ON "deliveries" ("courierId")`);

    // --- notifications ------------------------------------------------------
    await queryRunner.query(`
      CREATE TABLE "notifications" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now(),
        "userId" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "type" text NOT NULL,
        "payload" jsonb NOT NULL,
        "readAt" timestamptz NULL
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_notifications_userId" ON "notifications" ("userId")`);

    // --- audit_logs -----------------------------------------------------------
    await queryRunner.query(`
      CREATE TABLE "audit_logs" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now(),
        "companyId" uuid NULL,
        "actorUserId" uuid NULL,
        "action" text NOT NULL,
        "entity" text NOT NULL,
        "entityId" uuid NULL,
        "metadata" jsonb NULL
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_audit_logs_companyId_createdAt" ON "audit_logs" ("companyId","createdAt")`);

    // --- refresh_tokens ---------------------------------------------------
    await queryRunner.query(`
      CREATE TABLE "refresh_tokens" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now(),
        "userId" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "tokenHash" text NOT NULL UNIQUE,
        "familyId" uuid NOT NULL,
        "expiresAt" timestamptz NOT NULL,
        "revokedAt" timestamptz NULL,
        "replacedByTokenHash" text NULL
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_refresh_tokens_userId" ON "refresh_tokens" ("userId")`);
    await queryRunner.query(`CREATE INDEX "IDX_refresh_tokens_familyId" ON "refresh_tokens" ("familyId")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "refresh_tokens"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "audit_logs"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "notifications"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "deliveries"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "location_points"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "navigation_sessions"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "routes"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "order_status_history"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "orders"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "device_sessions"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "vehicles"`);
    await queryRunner.query(`ALTER TABLE "devices" DROP CONSTRAINT IF EXISTS "FK_devices_pairedCourierId"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "couriers"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "devices"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "users"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "companies"`);

    await queryRunner.query(`DROP TYPE IF EXISTS "order_priority_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "order_status_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "device_transport_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "device_status_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "courier_status_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "vehicle_type_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "supported_locale_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "user_role_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "company_status_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "company_plan_enum"`);
  }
}

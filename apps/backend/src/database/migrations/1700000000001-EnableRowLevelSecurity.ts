import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Defense-in-depth backstop for multi-tenancy (original architecture §4/§10).
 *
 * Layer 1 is application-level: every query is scoped by companyId in
 * application code (see TenantContextService / TenantScopeInterceptor).
 * Layer 2, added here, is enforced by Postgres itself: even if application
 * code has a bug and forgets a companyId filter, the database refuses to
 * return or modify rows outside the caller's tenant.
 *
 * The app sets two session-local settings at the start of each authenticated
 * request's transaction (see TenantScopeInterceptor):
 *   app.current_company_id  — the caller's companyId (or '' for SUPER_ADMIN)
 *   app.is_super_admin      — 'true' only for platform-level operators
 *
 * For this to restrict anything, the connection running these queries must
 * be neither a superuser nor the table owner — Postgres exempts both from
 * RLS unconditionally. docker/init-db.sql creates a separate "courier_app"
 * role for exactly this reason; the running app (app.module.ts) connects as
 * that role, while migrations run as the "courier" owner role. FORCE ROW
 * LEVEL SECURITY below additionally makes the policy apply even if a future
 * deployment makes the app role the table owner.
 *
 * NOT applied to "users" or "refresh_tokens": login is inherently a
 * cross-tenant lookup by email — at that point in the request there is no
 * companyId yet, so app.current_company_id is unset and an RLS policy on
 * "users" would make every login query return zero rows, i.e. it would lock
 * everyone out. Tenant scoping for user listings is enforced at the
 * application layer instead (see UsersService.listForCompany, which filters
 * by companyId explicitly) — layer 1 only, deliberately, for this one table.
 */
export class EnableRowLevelSecurity1700000000001 implements MigrationInterface {
  name = 'EnableRowLevelSecurity1700000000001';

  private readonly tenantTables = [
    'couriers',
    'vehicles',
    'devices',
    'orders',
    'order_status_history',
    'routes',
    'navigation_sessions',
    'location_points',
    'deliveries',
  ];

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const table of this.tenantTables) {
      const companyIdExpr = this.companyIdExpression(table);

      await queryRunner.query(`ALTER TABLE "${table}" ENABLE ROW LEVEL SECURITY`);
      await queryRunner.query(`ALTER TABLE "${table}" FORCE ROW LEVEL SECURITY`);
      await queryRunner.query(`
        CREATE POLICY "tenant_isolation_${table}" ON "${table}"
        USING (
          current_setting('app.is_super_admin', true) = 'true'
          OR ${companyIdExpr} = NULLIF(current_setting('app.current_company_id', true), '')::uuid
        )
      `);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const table of this.tenantTables) {
      await queryRunner.query(`DROP POLICY IF EXISTS "tenant_isolation_${table}" ON "${table}"`);
      await queryRunner.query(`ALTER TABLE "${table}" NO FORCE ROW LEVEL SECURITY`);
      await queryRunner.query(`ALTER TABLE "${table}" DISABLE ROW LEVEL SECURITY`);
    }
  }

  /**
   * Most tenant tables carry companyId directly. A few (vehicles, routes,
   * navigation_sessions, location_points, deliveries) only carry courierId,
   * and order_status_history only carries orderId — reach companyId through
   * the parent table via a correlated subquery instead of duplicating the
   * column everywhere. Note each subquery is itself subject to that parent
   * table's own RLS policy, which is what makes this safe: if courierId/
   * orderId ever pointed at another tenant's row, the subquery would see
   * zero rows (not the foreign row) and the comparison would fail closed.
   */
  private companyIdExpression(table: string): string {
    const viaCourier = new Set(['vehicles', 'routes', 'navigation_sessions', 'location_points', 'deliveries']);
    if (viaCourier.has(table)) {
      return `(SELECT c."companyId" FROM "couriers" c WHERE c."id" = "${table}"."courierId")`;
    }
    if (table === 'order_status_history') {
      return `(SELECT o."companyId" FROM "orders" o WHERE o."id" = "${table}"."orderId")`;
    }
    return `"companyId"`;
  }
}

import { DataSource, In } from 'typeorm';
import { randomUUID } from 'crypto';
import * as entities from '../src/database/entities';

/**
 * Proves the actual security property claimed in the architecture doc: even
 * with zero application-level WHERE clause, Postgres itself refuses to
 * return another tenant's rows. Requires the docker-compose Postgres to be
 * running with docker/init-db.sql applied and migrations run — see README
 * "Running tests".
 */
describe('Row-Level Security (requires a live Postgres — see README)', () => {
  let ownerDs: DataSource;
  let appDs: DataSource;
  let companyAId: string;
  let companyBId: string;
  let deviceAId: string;
  let deviceBId: string;

  const allEntities = Object.values(entities).filter((e) => typeof e === 'function');

  beforeAll(async () => {
    ownerDs = new DataSource({
      type: 'postgres',
      host: process.env.DB_HOST ?? 'localhost',
      port: Number(process.env.DB_PORT ?? 5432),
      username: process.env.DB_USERNAME ?? 'courier',
      password: process.env.DB_PASSWORD ?? 'courier_dev_password',
      database: process.env.DB_NAME ?? 'courier_platform',
      entities: allEntities,
    });
    await ownerDs.initialize();

    appDs = new DataSource({
      type: 'postgres',
      host: process.env.DB_HOST ?? 'localhost',
      port: Number(process.env.DB_PORT ?? 5432),
      username: process.env.DB_APP_USERNAME ?? 'courier_app',
      password: process.env.DB_APP_PASSWORD ?? 'courier_app_dev_password',
      database: process.env.DB_NAME ?? 'courier_platform',
      entities: allEntities,
    });
    await appDs.initialize();

    const companyRepo = ownerDs.getRepository(entities.Company);
    const deviceRepo = ownerDs.getRepository(entities.Device);

    const companyA = await companyRepo.save(companyRepo.create({ name: `RLS Test Co A ${randomUUID()}` }));
    const companyB = await companyRepo.save(companyRepo.create({ name: `RLS Test Co B ${randomUUID()}` }));
    companyAId = companyA.id;
    companyBId = companyB.id;

    const deviceA = await deviceRepo.save(
      deviceRepo.create({ companyId: companyA.id, hardwareId: `HW-A-${randomUUID()}` }),
    );
    const deviceB = await deviceRepo.save(
      deviceRepo.create({ companyId: companyB.id, hardwareId: `HW-B-${randomUUID()}` }),
    );
    deviceAId = deviceA.id;
    deviceBId = deviceB.id;
  });

  afterAll(async () => {
    await ownerDs.getRepository(entities.Device).delete({ id: In([deviceAId, deviceBId]) });
    await ownerDs.getRepository(entities.Company).delete({ id: In([companyAId, companyBId]) });
    await ownerDs.destroy();
    await appDs.destroy();
  });

  it('default-denies: no tenant context set means zero rows, not all rows', async () => {
    const rows = await appDs.query(`SELECT id FROM devices WHERE id = $1`, [deviceAId]);
    expect(rows).toHaveLength(0);
  });

  it('only returns the caller\'s own tenant rows even with no WHERE clause at all', async () => {
    const runner = appDs.createQueryRunner();
    await runner.connect();
    await runner.startTransaction();
    try {
      await runner.query(`SELECT set_config('app.is_super_admin', 'false', true)`);
      await runner.query(`SELECT set_config('app.current_company_id', $1, true)`, [companyAId]);

      // No "WHERE companyId = ..." here on purpose — this is the property under test.
      const rows: Array<{ id: string }> = await runner.query(`SELECT id FROM devices`);
      const ids = rows.map((r) => r.id);

      expect(ids).toContain(deviceAId);
      expect(ids).not.toContain(deviceBId);
    } finally {
      await runner.rollbackTransaction();
      await runner.release();
    }
  });

  it('SUPER_ADMIN context can see rows across tenants', async () => {
    const runner = appDs.createQueryRunner();
    await runner.connect();
    await runner.startTransaction();
    try {
      await runner.query(`SELECT set_config('app.is_super_admin', 'true', true)`);

      const rows = await runner.query(`SELECT id FROM devices WHERE id = ANY($1)`, [[deviceAId, deviceBId]]);
      expect(rows).toHaveLength(2);
    } finally {
      await runner.rollbackTransaction();
      await runner.release();
    }
  });
});

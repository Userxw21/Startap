import 'dotenv/config';
import { DataSource } from 'typeorm';
// Explicit '/index' rather than the bare directory: the TypeORM CLI loads
// this file via a dynamic import() under the hood, which goes through
// Node's native ESM resolver even in an otherwise-CommonJS ts-node setup —
// and native ESM (unlike CommonJS require()) doesn't support importing a
// directory and implicitly resolving its index file. Confirmed via CI: bare
// `from './entities'` failed with "Directory import ... is not supported
// resolving ES modules"; nest build (plain tsc, no dynamic import) never
// hit this, which is why it only showed up in `migration:run`, not the
// type-check/build step.
import * as entities from './entities/index';

/**
 * Used by the TypeORM CLI (migration:generate/run/revert) and, separately,
 * wired into Nest via TypeOrmModule.forRootAsync in app.module.ts.
 * synchronize is intentionally never true anywhere — schema changes only
 * ever happen through a reviewed migration file.
 */
export const AppDataSource = new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST ?? 'localhost',
  port: parseInt(process.env.DB_PORT ?? '5432', 10),
  username: process.env.DB_USERNAME ?? 'courier',
  password: process.env.DB_PASSWORD ?? 'courier_dev_password',
  database: process.env.DB_NAME ?? 'courier_platform',
  entities: Object.values(entities).filter((e) => typeof e === 'function'),
  migrations: [__dirname + '/migrations/*.{ts,js}'],
  synchronize: false,
  logging: process.env.NODE_ENV === 'development',
});

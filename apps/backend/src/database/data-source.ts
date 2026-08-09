import 'dotenv/config';
import { DataSource } from 'typeorm';
import * as entities from './entities';

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

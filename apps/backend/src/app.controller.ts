import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { Public } from './common/decorators/roles.decorator';

/**
 * Excluded from the global api/v1 prefix (see main.ts) so it's reachable at
 * the plain /health path most load balancers/orchestrators expect. Checks
 * the DB connection specifically, not just "process is alive" — a backend
 * that's up but can't reach Postgres should read as unhealthy, not healthy.
 */
@Controller()
export class AppController {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  @Public()
  @Get('health')
  async health() {
    if (!this.dataSource.isInitialized) {
      throw new ServiceUnavailableException('Database not initialized');
    }
    try {
      await this.dataSource.query('SELECT 1');
    } catch {
      throw new ServiceUnavailableException('Database unreachable');
    }
    return { status: 'ok' };
  }
}

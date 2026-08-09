import { Injectable } from '@nestjs/common';
import { AsyncLocalStorage } from 'async_hooks';
import { DataSource, EntityManager } from 'typeorm';
import { UserRole } from '../../database/entities';

export interface TenantContext {
  companyId: string | null;
  isSuperAdmin: boolean;
  manager: EntityManager;
}

export interface TenantActor {
  companyId: string | null;
  role: UserRole;
}

/**
 * Carries the current request's tenant-scoped EntityManager through async
 * call chains without threading it through every function signature.
 *
 * Two callers populate it, both funneling through `runForActor` below so
 * the actual transaction/RLS-session-variable logic exists in exactly one
 * place: TenantScopeInterceptor (HTTP, see that file) and
 * RealtimeGateway (WebSocket, see realtime/realtime.gateway.ts) — a
 * WS message has no HTTP request/response cycle for an interceptor to hook
 * into, but it needs the exact same RLS-scoped-transaction treatment for
 * any DB write it triggers.
 */
@Injectable()
export class TenantContextService {
  private readonly storage = new AsyncLocalStorage<TenantContext>();

  constructor(private readonly dataSource: DataSource) {}

  async runForActor<T>(actor: TenantActor, fn: () => Promise<T>): Promise<T> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    const isSuperAdmin = actor.role === UserRole.SUPER_ADMIN;

    try {
      await queryRunner.query(`SELECT set_config('app.is_super_admin', $1, true)`, [String(isSuperAdmin)]);
      await queryRunner.query(`SELECT set_config('app.current_company_id', $1, true)`, [actor.companyId ?? '']);

      const result = await this.run(
        { companyId: actor.companyId, isSuperAdmin, manager: queryRunner.manager },
        fn,
      );

      await queryRunner.commitTransaction();
      return result;
    } catch (err) {
      await queryRunner.rollbackTransaction();
      throw err;
    } finally {
      await queryRunner.release();
    }
  }

  run<T>(context: TenantContext, fn: () => Promise<T>): Promise<T> {
    return this.storage.run(context, fn);
  }

  getContext(): TenantContext {
    const context = this.storage.getStore();
    if (!context) {
      throw new Error(
        'TenantContextService.getContext() called outside a scope started by runForActor()',
      );
    }
    return context;
  }

  /** The RLS-scoped EntityManager — use this instead of the default DataSource for any tenant-owned query. */
  getManager(): EntityManager {
    return this.getContext().manager;
  }
}

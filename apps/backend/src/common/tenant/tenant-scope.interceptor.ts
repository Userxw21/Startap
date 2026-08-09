import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { firstValueFrom, from, Observable } from 'rxjs';
import { TenantContextService } from './tenant-context.service';
import { AuthenticatedUser } from '../decorators/current-user.decorator';

/**
 * Applied globally (see app.module.ts). For authenticated requests, opens an
 * RLS-scoped transaction via TenantContextService.runForActor() and runs the
 * handler inside it. Unauthenticated routes (login, health check) pass
 * through untouched. See TenantContextService for why the actual
 * transaction/session-variable logic lives there rather than here.
 */
@Injectable()
export class TenantScopeInterceptor implements NestInterceptor {
  constructor(private readonly tenantContext: TenantContextService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest();
    const user: AuthenticatedUser | undefined = request.user;

    if (!user) {
      return next.handle();
    }

    return from(
      this.tenantContext.runForActor({ companyId: user.companyId, role: user.role }, () =>
        firstValueFrom(next.handle()),
      ),
    );
  }
}

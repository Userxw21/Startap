import { Global, Module } from '@nestjs/common';
import { TenantContextService } from './tenant-context.service';
import { TenantScopeInterceptor } from './tenant-scope.interceptor';

@Global()
@Module({
  providers: [TenantContextService, TenantScopeInterceptor],
  exports: [TenantContextService, TenantScopeInterceptor],
})
export class TenantModule {}

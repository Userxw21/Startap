import { ClassSerializerInterceptor, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { I18nModule, QueryResolver, HeaderResolver, AcceptLanguageResolver } from 'nestjs-i18n';
import * as path from 'path';
import configuration from './config/configuration';
import { validate } from './config/env.validation';
import * as entities from './database/entities';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { CompaniesModule } from './modules/companies/companies.module';
import { CouriersModule } from './modules/couriers/couriers.module';
import { DevicesModule } from './modules/devices/devices.module';
import { OrdersModule } from './modules/orders/orders.module';
import { AnalyticsModule } from './modules/analytics/analytics.module';
import { RealtimeModule } from './realtime/realtime.module';
import { TenantModule } from './common/tenant/tenant.module';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { RolesGuard } from './common/guards/roles.guard';
import { TenantScopeInterceptor } from './common/tenant/tenant-scope.interceptor';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, load: [configuration], validate }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        host: config.get('database.host'),
        port: config.get('database.port'),
        // Intentionally the restricted app role, not the migration-owner
        // credentials — see docker/init-db.sql and the RLS migration's notes.
        username: config.get('database.appUsername'),
        password: config.get('database.appPassword'),
        database: config.get('database.name'),
        entities: Object.values(entities).filter((e) => typeof e === 'function'),
        synchronize: false,
        logging: config.get('nodeEnv') === 'development',
      }),
    }),
    ThrottlerModule.forRoot({
      throttlers: [{ ttl: 60_000, limit: 60 }],
    }),
    EventEmitterModule.forRoot(),
    I18nModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        fallbackLanguage: config.get('i18n.defaultLocale') ?? 'uz',
        loaderOptions: {
          path: path.join(__dirname, 'i18n'),
          watch: config.get('nodeEnv') === 'development',
        },
      }),
      resolvers: [
        { use: QueryResolver, options: ['lang'] },
        new HeaderResolver(['x-lang']),
        AcceptLanguageResolver,
      ],
    }),
    TenantModule,
    AuthModule,
    UsersModule,
    CompaniesModule,
    CouriersModule,
    DevicesModule,
    OrdersModule,
    AnalyticsModule,
    RealtimeModule,
  ],
  providers: [
    // Order matters: auth guard establishes request.user, then RBAC, then
    // the tenant interceptor opens the RLS-scoped transaction using that user.
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_INTERCEPTOR, useClass: TenantScopeInterceptor },
    // Strips @Exclude()-decorated fields (e.g. User.passwordHash) from every
    // response, including nested relations — see the note on User.passwordHash.
    { provide: APP_INTERCEPTOR, useClass: ClassSerializerInterceptor },
    { provide: APP_FILTER, useClass: HttpExceptionFilter },
  ],
})
export class AppModule {}

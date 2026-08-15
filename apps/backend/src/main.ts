import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { Logger, ValidationPipe } from '@nestjs/common';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { RedisIoAdapter } from './realtime/redis-io.adapter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);
  const logger = new Logger('Bootstrap');

  app.use(helmet());

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  app.setGlobalPrefix(config.get<string>('apiPrefix') ?? 'api/v1', { exclude: ['health'] });

  // No default: a wide-open CORS_ORIGIN default would silently ship as
  // "allow any origin" in production if someone forgot to set it. Failing
  // fast at boot is louder and safer than that. Dev/test stay permissive
  // (undefined origin -> reflects the request's own origin) since there's
  // no real attacker to defend against on a local machine.
  const corsOrigins = config.get<string[] | undefined>('corsOrigins');
  if (config.get('nodeEnv') === 'production' && (!corsOrigins || corsOrigins.length === 0)) {
    throw new Error('CORS_ORIGIN must be set in production — refusing to boot with CORS wide open.');
  }
  app.enableCors({ origin: corsOrigins ?? true, credentials: true });

  const redisIoAdapter = new RedisIoAdapter(app);
  await redisIoAdapter.connectToRedis();
  app.useWebSocketAdapter(redisIoAdapter);

  const port = config.get<number>('port') ?? 3000;
  await app.listen(port);
  logger.log(`Courier platform backend listening on port ${port}`);
}

bootstrap();

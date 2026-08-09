import { INestApplicationContext, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import Redis from 'ioredis';
import { ServerOptions } from 'socket.io';

/**
 * Lets WebSocket broadcasts fan out across multiple backend instances via
 * Redis pub/sub (original architecture §12) instead of only reaching
 * clients connected to the same process that emitted the event — matters
 * once this runs behind a load balancer with >1 instance; harmless no-op
 * shape at single-instance MVP scale.
 *
 * Deliberately non-fatal if Redis is unreachable: connectToRedis() times
 * out and falls back to Socket.IO's default in-memory adapter rather than
 * blocking the entire API from starting over a real-time nice-to-have. A
 * single instance works exactly the same either way; only cross-instance
 * fan-out is lost.
 */
export class RedisIoAdapter extends IoAdapter {
  private readonly logger = new Logger(RedisIoAdapter.name);
  private adapterConstructor: ReturnType<typeof createAdapter> | null = null;

  constructor(private readonly app: INestApplicationContext) {
    super(app);
  }

  async connectToRedis(): Promise<void> {
    const config = this.app.get(ConfigService);
    const host = config.get<string>('redis.host');
    const port = config.get<number>('redis.port');

    const pubClient = new Redis({ host, port, lazyConnect: true });
    const subClient = pubClient.duplicate();

    try {
      await Promise.race([
        Promise.all([pubClient.connect(), subClient.connect()]),
        new Promise((_resolve, reject) => setTimeout(() => reject(new Error('timed out')), 5000)),
      ]);
      this.adapterConstructor = createAdapter(pubClient, subClient);
      this.logger.log('Socket.IO Redis adapter connected.');
    } catch (err) {
      this.logger.warn(
        `Could not connect to Redis for the Socket.IO adapter (${(err as Error).message}) — ` +
          'falling back to the in-memory adapter. Fine for a single instance; ' +
          'events just won\'t fan out across multiple backend processes.',
      );
      pubClient.disconnect();
      subClient.disconnect();
    }
  }

  createIOServer(port: number, options?: ServerOptions) {
    const server = super.createIOServer(port, options);
    if (this.adapterConstructor) {
      server.adapter(this.adapterConstructor);
    }
    return server;
  }
}

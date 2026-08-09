import { Logger, UsePipes, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { OnEvent } from '@nestjs/event-emitter';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { UserRole } from '../database/entities';
import { TenantContextService } from '../common/tenant/tenant-context.service';
import { LocationsService } from '../modules/couriers/locations.service';
import { RecordLocationDto } from '../modules/couriers/dto/record-location.dto';
import {
  CourierLocationUpdatedPayload,
  CourierStatusChangedPayload,
  DeviceStatusChangedPayload,
  OrderStatusChangedPayload,
  RealtimeEvent,
} from './events';

interface SocketUser {
  userId: string;
  companyId: string | null;
  role: UserRole;
}

/**
 * Every connection authenticates with the SAME JWT access token the REST
 * API uses (passed via the Socket.IO handshake, not a cookie/header dance) —
 * one token, one auth system, matching the original architecture's "one
 * language across backend" preference for reducing moving parts. A socket
 * that can't produce a valid token is disconnected before ever joining a
 * room, so tenant isolation on the WS side is enforced the same way it is
 * everywhere else: by which room a connection is even allowed into.
 */
@WebSocketGateway({ cors: { origin: '*' } })
export class RealtimeGateway implements OnGatewayConnection {
  private readonly logger = new Logger(RealtimeGateway.name);

  @WebSocketServer()
  server: Server;

  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly tenantContext: TenantContextService,
    private readonly locationsService: LocationsService,
  ) {}

  async handleConnection(client: Socket): Promise<void> {
    const token = this.extractToken(client);
    if (!token) {
      client.disconnect(true);
      return;
    }

    try {
      const payload = await this.jwt.verifyAsync(token, {
        secret: this.config.get<string>('auth.accessSecret'),
      });
      const user: SocketUser = { userId: payload.sub, companyId: payload.companyId ?? null, role: payload.role };
      client.data.user = user;

      if (user.companyId) {
        await client.join(this.companyRoom(user.companyId));
      }
    } catch {
      client.disconnect(true);
    }
  }

  @UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
  @SubscribeMessage('courier:location')
  async onCourierLocation(@ConnectedSocket() client: Socket, @MessageBody() dto: RecordLocationDto): Promise<void> {
    const user: SocketUser | undefined = client.data.user;
    if (!user || user.role !== UserRole.COURIER || !user.companyId) {
      return;
    }

    try {
      await this.tenantContext.runForActor({ companyId: user.companyId, role: user.role }, () =>
        this.locationsService.record({ userId: user.userId, companyId: user.companyId as string }, dto),
      );
    } catch (err) {
      this.logger.warn(`courier:location handling failed for user ${user.userId}: ${(err as Error).message}`);
    }
  }

  @OnEvent(RealtimeEvent.CourierLocationUpdated)
  handleCourierLocationUpdated(payload: CourierLocationUpdatedPayload): void {
    this.server.to(this.companyRoom(payload.companyId)).emit(RealtimeEvent.CourierLocationUpdated, payload);
  }

  @OnEvent(RealtimeEvent.CourierStatusChanged)
  handleCourierStatusChanged(payload: CourierStatusChangedPayload): void {
    this.server.to(this.companyRoom(payload.companyId)).emit(RealtimeEvent.CourierStatusChanged, payload);
  }

  @OnEvent(RealtimeEvent.OrderStatusChanged)
  handleOrderStatusChanged(payload: OrderStatusChangedPayload): void {
    this.server.to(this.companyRoom(payload.companyId)).emit(RealtimeEvent.OrderStatusChanged, payload);
  }

  @OnEvent(RealtimeEvent.DeviceStatusChanged)
  handleDeviceStatusChanged(payload: DeviceStatusChangedPayload): void {
    this.server.to(this.companyRoom(payload.companyId)).emit(RealtimeEvent.DeviceStatusChanged, payload);
  }

  private companyRoom(companyId: string): string {
    return `company:${companyId}`;
  }

  private extractToken(client: Socket): string | null {
    const authToken = client.handshake.auth?.token as string | undefined;
    if (authToken) return authToken.replace(/^Bearer\s+/i, '');

    const header = client.handshake.headers?.authorization;
    if (typeof header === 'string') return header.replace(/^Bearer\s+/i, '');

    return null;
  }
}

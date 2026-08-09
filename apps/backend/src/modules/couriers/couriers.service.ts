import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import * as argon2 from 'argon2';
import {
  AuditLog,
  Courier,
  CourierStatus,
  SupportedLocale,
  User,
  UserRole,
  Vehicle,
  VehicleType,
} from '../../database/entities';
import { TenantContextService } from '../../common/tenant/tenant-context.service';
import { RealtimeEvent, CourierStatusChangedPayload } from '../../realtime/events';

@Injectable()
export class CouriersService {
  constructor(
    private readonly tenantContext: TenantContextService,
    private readonly events: EventEmitter2,
  ) {}

  /**
   * Creates the User(role=COURIER), Courier, and Vehicle rows together.
   * All three writes share the single per-request transaction already opened
   * by TenantScopeInterceptor — if anything below throws, the interceptor's
   * catch block rolls back everything, including the User row, so we never
   * end up with a login-capable account that has no Courier profile.
   */
  async onboard(params: {
    companyId: string;
    actorUserId: string | null;
    email: string;
    fullName: string;
    password: string;
    preferredLanguage?: SupportedLocale;
    vehicleType: VehicleType;
    vehicleModel?: string;
    plateNumber?: string;
  }): Promise<Courier> {
    const manager = this.tenantContext.getManager();

    const existing = await manager.findOne(User, { where: { email: params.email } });
    if (existing) {
      throw new ConflictException('An account with this email already exists');
    }

    const passwordHash = await argon2.hash(params.password, { type: argon2.argon2id });

    const user = await manager.save(
      manager.create(User, {
        companyId: params.companyId,
        email: params.email,
        fullName: params.fullName,
        passwordHash,
        role: UserRole.COURIER,
        preferredLanguage: params.preferredLanguage ?? SupportedLocale.UZ,
      }),
    );

    const courier = await manager.save(
      manager.create(Courier, {
        companyId: params.companyId,
        userId: user.id,
        status: CourierStatus.OFFLINE,
      }),
    );

    await manager.save(
      manager.create(Vehicle, {
        courierId: courier.id,
        type: params.vehicleType,
        model: params.vehicleModel ?? null,
        plateNumber: params.plateNumber ?? null,
      }),
    );

    await manager.save(
      manager.create(AuditLog, {
        companyId: params.companyId,
        actorUserId: params.actorUserId,
        action: 'courier.onboarded',
        entity: 'Courier',
        entityId: courier.id,
      }),
    );

    return this.getByIdOrThrow(courier.id);
  }

  async listForCompany(companyId: string): Promise<Courier[]> {
    const manager = this.tenantContext.getManager();
    return manager.find(Courier, {
      where: { companyId },
      relations: { user: true, vehicle: true },
    });
  }

  async getByUserId(userId: string): Promise<Courier> {
    const manager = this.tenantContext.getManager();
    const courier = await manager.findOne(Courier, {
      where: { userId },
      relations: { user: true, vehicle: true },
    });
    if (!courier) {
      throw new NotFoundException('Courier profile not found for this account');
    }
    return courier;
  }

  async updateOwnStatus(userId: string, status: CourierStatus): Promise<Courier> {
    if (status === CourierStatus.DELIVERING) {
      // Belt-and-suspenders: the DTO already rejects this at the validation
      // layer, but a service is not just a controller's DTO — defend here too.
      throw new ForbiddenException('DELIVERING is set automatically when an order is assigned, not chosen directly');
    }

    const manager = this.tenantContext.getManager();
    const courier = await manager.findOne(Courier, { where: { userId } });
    if (!courier) {
      throw new NotFoundException('Courier profile not found for this account');
    }

    courier.status = status;
    await manager.save(courier);

    const payload: CourierStatusChangedPayload = { companyId: courier.companyId, courierId: courier.id, status };
    this.events.emit(RealtimeEvent.CourierStatusChanged, payload);

    return this.getByUserId(userId);
  }

  private async getByIdOrThrow(id: string): Promise<Courier> {
    const manager = this.tenantContext.getManager();
    const courier = await manager.findOne(Courier, { where: { id }, relations: { user: true, vehicle: true } });
    if (!courier) {
      throw new NotFoundException('Courier not found');
    }
    return courier;
  }
}

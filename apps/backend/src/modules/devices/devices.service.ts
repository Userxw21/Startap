import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { randomBytes, createHash } from 'crypto';
import { AuditLog, Courier, Device, DeviceStatus } from '../../database/entities';
import { TenantContextService } from '../../common/tenant/tenant-context.service';
import { DeviceStatusChangedPayload, RealtimeEvent } from '../../realtime/events';

@Injectable()
export class DevicesService {
  constructor(
    private readonly tenantContext: TenantContextService,
    private readonly events: EventEmitter2,
  ) {}

  async register(companyId: string, actorUserId: string, hardwareId: string): Promise<Device> {
    const manager = this.tenantContext.getManager();

    const existing = await manager.findOne(Device, { where: { hardwareId } });
    if (existing) {
      throw new ConflictException('A device with this hardware ID is already registered');
    }

    const device = await manager.save(
      manager.create(Device, {
        companyId,
        hardwareId,
        status: DeviceStatus.UNPAIRED,
        protocolVersion: 1,
      }),
    );

    await manager.save(
      manager.create(AuditLog, {
        companyId,
        actorUserId,
        action: 'device.registered',
        entity: 'Device',
        entityId: device.id,
      }),
    );

    return device;
  }

  async listForCompany(companyId: string): Promise<Device[]> {
    const manager = this.tenantContext.getManager();
    return manager.find(Device, { where: { companyId } });
  }

  /**
   * Returns the pairing token in PLAINTEXT exactly once — only the hash is
   * ever persisted (see Device.pairingTokenHash). The courier app presents
   * this token to the device during the USB/BLE handshake (original
   * architecture §7); if it's lost, the only recovery is to pair again,
   * which issues a new token and invalidates the old one.
   */
  async pair(companyId: string, actorUserId: string, deviceId: string, courierId: string): Promise<{ device: Device; pairingToken: string }> {
    const manager = this.tenantContext.getManager();

    const device = await manager.findOne(Device, { where: { id: deviceId, companyId } });
    if (!device) {
      throw new NotFoundException('Device not found');
    }

    const courier = await manager.findOne(Courier, { where: { id: courierId, companyId } });
    if (!courier) {
      throw new NotFoundException('Courier not found');
    }

    const pairingToken = randomBytes(32).toString('hex');
    device.pairingTokenHash = createHash('sha256').update(pairingToken).digest('hex');
    device.pairedCourierId = courierId;
    device.status = DeviceStatus.PAIRED;
    await manager.save(device);

    courier.currentDeviceId = device.id;
    await manager.save(courier);

    await manager.save(
      manager.create(AuditLog, {
        companyId,
        actorUserId,
        action: 'device.paired',
        entity: 'Device',
        entityId: device.id,
        metadata: { courierId },
      }),
    );

    this.emitDeviceStatusChanged(companyId, device.id, DeviceStatus.PAIRED);
    return { device, pairingToken };
  }

  async revoke(companyId: string, actorUserId: string, deviceId: string): Promise<Device> {
    const manager = this.tenantContext.getManager();

    const device = await manager.findOne(Device, { where: { id: deviceId, companyId } });
    if (!device) {
      throw new NotFoundException('Device not found');
    }

    if (device.pairedCourierId) {
      await manager.update(Courier, { id: device.pairedCourierId, currentDeviceId: device.id }, { currentDeviceId: null });
    }

    device.status = DeviceStatus.REVOKED;
    device.pairingTokenHash = null;
    device.pairedCourierId = null;
    await manager.save(device);

    await manager.save(
      manager.create(AuditLog, {
        companyId,
        actorUserId,
        action: 'device.revoked',
        entity: 'Device',
        entityId: device.id,
      }),
    );

    this.emitDeviceStatusChanged(companyId, device.id, DeviceStatus.REVOKED);
    return device;
  }

  private emitDeviceStatusChanged(companyId: string, deviceId: string, status: DeviceStatus): void {
    const payload: DeviceStatusChangedPayload = { companyId, deviceId, status };
    this.events.emit(RealtimeEvent.DeviceStatusChanged, payload);
  }
}

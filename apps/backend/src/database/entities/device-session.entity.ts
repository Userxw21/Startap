import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from './base.entity';
import { Device } from './device.entity';
import { Courier } from './courier.entity';
import { DeviceTransport } from './enums';

@Entity('device_sessions')
export class DeviceSession extends BaseEntity {
  @Column({ type: 'uuid' })
  @Index()
  deviceId: string;

  @ManyToOne(() => Device, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'deviceId' })
  device: Device;

  @Column({ type: 'uuid' })
  @Index()
  courierId: string;

  @ManyToOne(() => Courier, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'courierId' })
  courier: Courier;

  @Column({ type: 'enum', enum: DeviceTransport })
  connectionType: DeviceTransport;

  @Column({ type: 'timestamptz' })
  startedAt: Date;

  @Column({ type: 'timestamptz', nullable: true })
  endedAt: Date | null;
}

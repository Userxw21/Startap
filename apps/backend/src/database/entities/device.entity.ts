import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { Exclude } from 'class-transformer';
import { BaseEntity } from './base.entity';
import { Company } from './company.entity';
import { DeviceStatus } from './enums';

/**
 * hardwareId is the immutable identifier burned into the device at manufacture.
 * pairingTokenHash is the current long-lived credential (hashed, never stored
 * plaintext) issued when a dispatcher pairs the device to a courier — see
 * the Device Service design in the original architecture doc §10.
 */
@Entity('devices')
@Index(['companyId', 'status'])
export class Device extends BaseEntity {
  @Column({ type: 'uuid' })
  @Index()
  companyId: string;

  @ManyToOne(() => Company, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'companyId' })
  company: Company;

  @Column({ unique: true })
  hardwareId: string;

  /** Never returned by the API — even the hash shouldn't leave the server. The
   * plaintext pairing token itself is returned exactly once, directly by
   * DevicesService.pair(), as a plain field outside this entity. */
  @Exclude()
  @Column({ nullable: true })
  pairingTokenHash: string | null;

  @Column({ type: 'uuid', nullable: true })
  pairedCourierId: string | null;

  @Column({ default: 1 })
  protocolVersion: number;

  @Column({ nullable: true })
  firmwareVersion: string | null;

  @Column({ type: 'enum', enum: DeviceStatus, default: DeviceStatus.UNPAIRED })
  status: DeviceStatus;

  @Column({ type: 'timestamptz', nullable: true })
  lastSeenAt: Date | null;

  @Column({ type: 'smallint', nullable: true })
  batteryPct: number | null;
}

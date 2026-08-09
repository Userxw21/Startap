import { Column, Entity, Index, JoinColumn, ManyToOne, OneToOne } from 'typeorm';
import { BaseEntity } from './base.entity';
import { Company } from './company.entity';
import { User } from './user.entity';
import { Vehicle } from './vehicle.entity';
import { Device } from './device.entity';
import { CourierStatus } from './enums';

@Entity('couriers')
@Index(['companyId', 'status'])
export class Courier extends BaseEntity {
  @Column({ type: 'uuid' })
  @Index()
  companyId: string;

  @ManyToOne(() => Company, (company) => company.couriers, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'companyId' })
  company: Company;

  @Column({ type: 'uuid', unique: true })
  userId: string;

  @OneToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @OneToOne(() => Vehicle, (vehicle) => vehicle.courier)
  vehicle: Vehicle;

  @Column({ type: 'enum', enum: CourierStatus, default: CourierStatus.OFFLINE })
  status: CourierStatus;

  @Column({ type: 'uuid', nullable: true })
  currentDeviceId: string | null;

  @ManyToOne(() => Device, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'currentDeviceId' })
  currentDevice: Device | null;
}

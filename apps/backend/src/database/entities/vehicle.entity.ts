import { Column, Entity, Index, JoinColumn, ManyToOne, OneToOne } from 'typeorm';
import { BaseEntity } from './base.entity';
import { Courier } from './courier.entity';
import { VehicleType } from './enums';

@Entity('vehicles')
export class Vehicle extends BaseEntity {
  @Column({ type: 'uuid' })
  @Index()
  courierId: string;

  @OneToOne(() => Courier, (courier) => courier.vehicle, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'courierId' })
  courier: Courier;

  @Column({ type: 'enum', enum: VehicleType })
  type: VehicleType;

  @Column({ type: 'text', nullable: true })
  model: string | null;

  @Column({ type: 'text', nullable: true })
  plateNumber: string | null;
}

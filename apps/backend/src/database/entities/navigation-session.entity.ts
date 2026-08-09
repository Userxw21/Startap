import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from './base.entity';
import { Courier } from './courier.entity';
import { Route } from './route.entity';
import { Device } from './device.entity';

@Entity('navigation_sessions')
export class NavigationSession extends BaseEntity {
  @Column({ type: 'uuid' })
  @Index()
  courierId: string;

  @ManyToOne(() => Courier, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'courierId' })
  courier: Courier;

  @Column({ type: 'uuid' })
  routeId: string;

  @ManyToOne(() => Route, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'routeId' })
  route: Route;

  @Column({ type: 'uuid', nullable: true })
  deviceId: string | null;

  @ManyToOne(() => Device, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'deviceId' })
  device: Device | null;

  @Column({ type: 'timestamptz' })
  startedAt: Date;

  @Column({ type: 'timestamptz', nullable: true })
  endedAt: Date | null;

  @Column({ type: 'int', default: 0 })
  rerouteCount: number;
}

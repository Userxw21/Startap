import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from './base.entity';
import { Order } from './order.entity';
import { Courier } from './courier.entity';

@Entity('routes')
export class Route extends BaseEntity {
  @Column({ type: 'uuid' })
  @Index()
  orderId: string;

  @ManyToOne(() => Order, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'orderId' })
  order: Order;

  @Column({ type: 'uuid' })
  @Index()
  courierId: string;

  @ManyToOne(() => Courier, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'courierId' })
  courier: Courier;

  /** Simplified polyline of the route actually taken/planned — geography(LineString,4326). */
  @Column({ type: 'geography', spatialFeatureType: 'LineString', srid: 4326 })
  geometry: string;

  @Column({ type: 'int' })
  distanceMeters: number;

  @Column({ type: 'int' })
  durationSeconds: number;

  /** e.g. "yandex" — matches the RoutingProvider implementation that produced this route. */
  @Column()
  provider: string;
}

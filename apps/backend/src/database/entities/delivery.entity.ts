import { Column, Entity, Index, JoinColumn, ManyToOne, OneToOne } from 'typeorm';
import { BaseEntity } from './base.entity';
import { Order } from './order.entity';
import { Courier } from './courier.entity';

@Entity('deliveries')
export class Delivery extends BaseEntity {
  @Column({ type: 'uuid', unique: true })
  orderId: string;

  @OneToOne(() => Order, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'orderId' })
  order: Order;

  @Column({ type: 'uuid' })
  @Index()
  courierId: string;

  @ManyToOne(() => Courier, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'courierId' })
  courier: Courier;

  /** Object-storage URL, uploaded via the backend, never a client-supplied URL. */
  @Column({ type: 'text', nullable: true })
  podPhotoUrl: string | null;

  @Column({ type: 'timestamptz' })
  deliveredAt: Date;

  @Column({ type: 'geography', spatialFeatureType: 'Point', srid: 4326 })
  deliveryLocation: string;
}

import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from './base.entity';
import { Order } from './order.entity';
import { User } from './user.entity';
import { OrderStatus } from './enums';

/** Append-only. Never updated or deleted — the audit trail for every order transition. */
@Entity('order_status_history')
export class OrderStatusHistory extends BaseEntity {
  @Column({ type: 'uuid' })
  @Index()
  orderId: string;

  @ManyToOne(() => Order, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'orderId' })
  order: Order;

  @Column({ type: 'enum', enum: OrderStatus, nullable: true })
  fromStatus: OrderStatus | null;

  @Column({ type: 'enum', enum: OrderStatus })
  toStatus: OrderStatus;

  @Column({ type: 'uuid', nullable: true })
  actorUserId: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'actorUserId' })
  actorUser: User | null;
}

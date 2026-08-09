import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from './base.entity';
import { Company } from './company.entity';
import { Courier } from './courier.entity';
import { OrderPriority, OrderStatus } from './enums';

/**
 * pickupLocation / deliveryLocation are PostGIS geography(Point,4326).
 * The raw pg driver returns geography columns as WKB hex by default —
 * reads that need coordinates go through OrdersRepository methods that
 * wrap the column in ST_AsGeoJSON(...) rather than a plain find().
 */
@Entity('orders')
@Index(['companyId', 'status'])
export class Order extends BaseEntity {
  @Column({ type: 'uuid' })
  @Index()
  companyId: string;

  @ManyToOne(() => Company, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'companyId' })
  company: Company;

  @Column({ type: 'text', nullable: true })
  externalRef: string | null;

  @Column({ type: 'enum', enum: OrderStatus, default: OrderStatus.CREATED })
  status: OrderStatus;

  @Column({ type: 'enum', enum: OrderPriority, default: OrderPriority.NORMAL })
  priority: OrderPriority;

  @Column()
  pickupAddress: string;

  @Column({ type: 'geography', spatialFeatureType: 'Point', srid: 4326 })
  pickupLocation: string;

  @Column()
  deliveryAddress: string;

  @Column({ type: 'geography', spatialFeatureType: 'Point', srid: 4326 })
  deliveryLocation: string;

  @Column({ type: 'text', nullable: true })
  customerName: string | null;

  @Column({ type: 'text', nullable: true })
  customerPhone: string | null;

  @Column({ type: 'uuid', nullable: true })
  @Index()
  assignedCourierId: string | null;

  @ManyToOne(() => Courier, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'assignedCourierId' })
  assignedCourier: Courier | null;

  @Column({ type: 'timestamptz', nullable: true })
  pickupDeadlineAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  deliveryDeadlineAt: Date | null;

  @Column({ type: 'text', nullable: true })
  notes: string | null;
}

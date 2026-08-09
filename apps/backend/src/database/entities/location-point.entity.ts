import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from './base.entity';
import { Courier } from './courier.entity';

/**
 * Raw GPS pings. High volume by design — this table is range-partitioned by
 * recordedAt in the migration and old partitions are dropped after 30 days
 * (see original architecture §4 retention policy). Never queried directly
 * for "where is this courier now" — that's Redis (see Tracking Service);
 * this table is for the offline sync trail and short-term analytics only.
 */
@Entity('location_points')
@Index(['courierId', 'recordedAt'])
export class LocationPoint extends BaseEntity {
  @Column({ type: 'uuid' })
  courierId: string;

  @ManyToOne(() => Courier, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'courierId' })
  courier: Courier;

  @Column({ type: 'geography', spatialFeatureType: 'Point', srid: 4326 })
  location: string;

  @Column({ type: 'real', nullable: true })
  speedMps: number | null;

  @Column({ type: 'real', nullable: true })
  headingDegrees: number | null;

  @Column({ type: 'timestamptz' })
  recordedAt: Date;

  /** "gps" | "network" | "fused" — informational, not used for filtering logic. */
  @Column({ default: 'gps' })
  source: string;

  /** Client-generated UUID used as the offline-sync idempotency key (see original §11). */
  @Column({ type: 'uuid', unique: true })
  clientId: string;
}

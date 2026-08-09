import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from './base.entity';

/**
 * Append-only, never mutated or deleted except on a GDPR-style erasure
 * request for a specific user's PII (see original architecture §4/§10).
 * companyId is nullable to allow SUPER_ADMIN cross-tenant actions to be
 * logged too — those are the ones that most need an audit trail.
 */
@Entity('audit_logs')
@Index(['companyId', 'createdAt'])
export class AuditLog extends BaseEntity {
  @Column({ type: 'uuid', nullable: true })
  companyId: string | null;

  @Column({ type: 'uuid', nullable: true })
  actorUserId: string | null;

  @Column()
  action: string;

  @Column()
  entity: string;

  @Column({ type: 'uuid', nullable: true })
  entityId: string | null;

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, unknown> | null;
}

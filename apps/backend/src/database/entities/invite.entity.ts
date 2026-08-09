import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { Exclude } from 'class-transformer';
import { BaseEntity } from './base.entity';
import { Company } from './company.entity';
import { User } from './user.entity';
import { UserRole, VehicleType } from './enums';

/**
 * How a company adds a dispatcher or courier now: an admin (or, for
 * couriers, a dispatcher) creates an Invite with just an email — never a
 * password, an admin should never know a courier's password — and the
 * invitee sets their own password when accepting it. See InvitesService.
 *
 * Deliberately NOT RLS-protected, same reasoning as `users`/`refresh_tokens`
 * (see EnableRowLevelSecurity migration): the accept/preview endpoints are
 * necessarily public (the invitee has no account, hence no companyId, yet)
 * and look up an invite by its token — a high-entropy secret only the
 * recipient has, which is itself a valid access-control boundary, the same
 * way a refresh token is. Tenant scoping for create/list/revoke (the
 * authenticated operations) is enforced at the application layer instead.
 */
@Entity('invites')
export class Invite extends BaseEntity {
  @Column({ type: 'uuid' })
  @Index()
  companyId: string;

  @ManyToOne(() => Company, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'companyId' })
  company: Company;

  @Column()
  email: string;

  @Column()
  fullName: string;

  @Column({ type: 'enum', enum: UserRole })
  role: UserRole;

  // Only meaningful when role = COURIER.
  @Column({ type: 'enum', enum: VehicleType, nullable: true })
  vehicleType: VehicleType | null;

  @Column({ type: 'text', nullable: true })
  vehicleModel: string | null;

  @Column({ type: 'text', nullable: true })
  plateNumber: string | null;

  @Exclude()
  @Column({ unique: true })
  tokenHash: string;

  @Column({ type: 'timestamptz' })
  expiresAt: Date;

  @Column({ type: 'uuid', nullable: true })
  invitedByUserId: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'invitedByUserId' })
  invitedBy: User | null;

  @Column({ type: 'timestamptz', nullable: true })
  acceptedAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  revokedAt: Date | null;
}

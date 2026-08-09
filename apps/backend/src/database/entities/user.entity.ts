import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { Exclude } from 'class-transformer';
import { BaseEntity } from './base.entity';
import { Company } from './company.entity';
import { SupportedLocale, UserRole } from './enums';

/**
 * SUPER_ADMIN rows have companyId = null (platform-level operator).
 * Every other role is scoped to exactly one company.
 */
@Entity('users')
@Index(['companyId', 'role'])
export class User extends BaseEntity {
  @Column({ type: 'uuid', nullable: true })
  @Index()
  companyId: string | null;

  @ManyToOne(() => Company, (company) => company.users, { nullable: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'companyId' })
  company: Company | null;

  @Column({ unique: true })
  email: string;

  @Column({ nullable: true })
  phone: string | null;

  /**
   * argon2id hash — never plaintext, never a reversible cipher.
   * @Exclude() is the systemic backstop: it strips this field from every
   * API response globally (see ClassSerializerInterceptor in app.module.ts),
   * including when a User is loaded as a *nested* relation (e.g.
   * Courier.user) where a manual `{ passwordHash, ...safe }` destructure at
   * the call site would be easy to forget. Manual strips elsewhere in
   * AuthService/UsersService are redundant with this now — kept anyway as
   * defense-in-depth on a field this sensitive.
   */
  @Exclude()
  @Column()
  passwordHash: string;

  @Column()
  fullName: string;

  @Column({ type: 'enum', enum: UserRole })
  role: UserRole;

  @Column({ type: 'enum', enum: SupportedLocale, default: SupportedLocale.UZ })
  preferredLanguage: SupportedLocale;

  @Column({ default: true })
  isActive: boolean;

  @Column({ type: 'timestamptz', nullable: true })
  lastLoginAt: Date | null;
}

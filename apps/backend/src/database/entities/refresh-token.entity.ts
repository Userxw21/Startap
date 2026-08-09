import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from './base.entity';
import { User } from './user.entity';

/**
 * Refresh tokens are never stored in plaintext — only a SHA-256 hash of the
 * token, so a leaked database dump can't be replayed as valid credentials.
 * `familyId` lets us revoke every token descended from one login in a single
 * update if reuse of an already-rotated token is detected (token-theft signal).
 */
@Entity('refresh_tokens')
@Index(['userId'])
export class RefreshToken extends BaseEntity {
  @Column({ type: 'uuid' })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column({ unique: true })
  tokenHash: string;

  @Column({ type: 'uuid' })
  @Index()
  familyId: string;

  @Column({ type: 'timestamptz' })
  expiresAt: Date;

  @Column({ type: 'timestamptz', nullable: true })
  revokedAt: Date | null;

  @Column({ nullable: true })
  replacedByTokenHash: string | null;
}

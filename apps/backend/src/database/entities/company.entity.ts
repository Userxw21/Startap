import { Column, Entity, Index, OneToMany } from 'typeorm';
import { BaseEntity } from './base.entity';
import { User } from './user.entity';
import { Courier } from './courier.entity';

export enum CompanyPlan {
  TRIAL = 'TRIAL',
  STANDARD = 'STANDARD',
  ENTERPRISE = 'ENTERPRISE',
}

export enum CompanyStatus {
  ACTIVE = 'ACTIVE',
  SUSPENDED = 'SUSPENDED',
}

/** Root tenant. Every tenant-owned row ultimately traces back to one Company. */
@Entity('companies')
export class Company extends BaseEntity {
  @Column()
  name: string;

  @Column({ type: 'enum', enum: CompanyPlan, default: CompanyPlan.TRIAL })
  plan: CompanyPlan;

  @Column({ type: 'enum', enum: CompanyStatus, default: CompanyStatus.ACTIVE })
  @Index()
  status: CompanyStatus;

  @OneToMany(() => User, (user) => user.company)
  users: User[];

  @OneToMany(() => Courier, (courier) => courier.company)
  couriers: Courier[];
}

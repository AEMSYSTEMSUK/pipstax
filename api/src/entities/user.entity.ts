import {
  Column,
  Entity,
  JoinTable,
  ManyToMany,
  ManyToOne,
  Index
} from 'typeorm';
import { BaseEntity } from './base.entity';
import { Tenant } from './tenant.entity';
import { Role } from './role.entity';

@Entity('users')
export class User extends BaseEntity {
  @Column({ length: 120 })
  fullName!: string;

  @Column({ length: 160 })
  email!: string;

  @Column({ nullable: true })
  phone?: string;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  hourlyRate?: number;

  @Column({ default: true })
  isActive!: boolean;

  @Column({ nullable: true })
  accountId?: string;

  @Column({ type: 'json', nullable: true })
  permissionsOverride?: Record<string, boolean>;

  @ManyToOne(() => Tenant, (tenant) => tenant.users)
  tenant!: Tenant;

  @Column()
  tenantId!: string;

  @ManyToMany(() => Role, (role) => role.users)
  @JoinTable({ name: 'user_roles' })
  roles!: Role[];
}

import {
  Column,
  Entity,
  JoinTable,
  ManyToMany,
  Index
} from 'typeorm';
import { BaseEntity } from '../../entities/base.entity';
import { PlatformRole } from './platform-role.entity';

@Entity('platform_admins')
export class PlatformAdmin extends BaseEntity {
  @Column({ length: 120 })
  fullName!: string;

  @Column({ length: 160 })
  @Index({ unique: true })
  email!: string;

  @Column({ length: 200 })
  passwordHash!: string;

  @Column({ default: true })
  isActive!: boolean;

  @Column({ type: 'json', nullable: true })
  permissionsOverride?: Record<string, boolean>;

  @ManyToMany(() => PlatformRole, (role: any) => role.admins)
  @JoinTable({ name: 'platform_admin_roles' })
  roles!: PlatformRole[];
}

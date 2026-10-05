import { Column, Entity, ManyToMany, Index } from 'typeorm';
import { BaseEntity } from '../../entities/base.entity';
import { PlatformAdmin } from './platform-admin.entity';

@Entity('platform_roles')
@Index(['code'], { unique: true })
export class PlatformRole extends BaseEntity {
  @Column({ length: 60 })
  code!: string;

  @Column({ length: 120 })
  name!: string;

  @Column({ type: 'json', nullable: true })
  permissions?: Record<string, boolean>;

  @ManyToMany(() => PlatformAdmin, (admin: any) => admin.roles)
  admins!: PlatformAdmin[];
}

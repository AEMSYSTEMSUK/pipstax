import { Column, Entity, ManyToMany, ManyToOne, Index } from 'typeorm';
import { BaseEntity } from './base.entity';
import { User } from './user.entity';
import { Tenant } from './tenant.entity';

@Entity('roles')
@Index(['tenantId', 'code'], { unique: true })
export class Role extends BaseEntity {
  @Column({ length: 60 })
  code!: string;

  @Column({ length: 120 })
  name!: string;

  @Column({ type: 'json', nullable: true })
  permissions?: Record<string, boolean>;

  @ManyToOne(() => Tenant)
  tenant!: Tenant;

  @Column()
  tenantId!: string;

  @ManyToMany(() => User, (user) => user.roles)
  users!: User[];
}

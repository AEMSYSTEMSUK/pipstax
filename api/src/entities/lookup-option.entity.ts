import { Column, Entity, Index, ManyToOne } from 'typeorm';
import { BaseEntity } from './base.entity';
import { Tenant } from './tenant.entity';

@Entity('lookup_options')
@Index(['tenantId', 'type', 'title'], { unique: true })
export class LookupOption extends BaseEntity {
  @Column({ length: 120 })
  title!: string;

  @Column({ length: 80 })
  type!: string;

  @ManyToOne(() => Tenant)
  tenant!: Tenant;

  @Column()
  tenantId!: string;
}

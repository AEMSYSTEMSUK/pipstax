import { Column, Entity, ManyToOne } from 'typeorm';
import { BaseEntity } from './base.entity';
import { Tenant } from './tenant.entity';
import { Customer } from './customer.entity';

@Entity('customer_site_groups')
export class CustomerSiteGroup extends BaseEntity {
  @Column({ length: 160 })
  name!: string;

  @Column({ type: 'text', nullable: true })
  description?: string;

  @Column({ type: 'int', default: 0 })
  sortOrder!: number;

  @ManyToOne(() => Tenant)
  tenant!: Tenant;

  @Column()
  tenantId!: string;

  @ManyToOne(() => Customer)
  customer!: Customer;

  @Column()
  customerId!: string;
}

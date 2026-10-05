import { Column, Entity, ManyToOne } from 'typeorm';
import { BaseEntity } from './base.entity';
import { Tenant } from './tenant.entity';
import { Customer } from './customer.entity';
import { CustomerSite } from './customer-site.entity';

@Entity('customer_site_contacts')
export class CustomerSiteContact extends BaseEntity {
  @Column({ length: 120 })
  name!: string;

  @Column({ length: 160, nullable: true })
  email?: string;

  @Column({ nullable: true })
  phone?: string;

  @Column({ length: 120, nullable: true })
  role?: string;

  @Column({ type: 'text', nullable: true })
  notes?: string;

  @ManyToOne(() => Tenant)
  tenant!: Tenant;

  @Column()
  tenantId!: string;

  @ManyToOne(() => Customer)
  customer!: Customer;

  @Column()
  customerId!: string;

  @ManyToOne(() => CustomerSite)
  site!: CustomerSite;

  @Column()
  siteId!: string;
}

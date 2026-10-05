import { Column, Entity, ManyToOne } from 'typeorm';
import { BaseEntity } from './base.entity';
import { Tenant } from './tenant.entity';
import { Customer } from './customer.entity';
import { CustomerSiteGroup } from './customer-site-group.entity';

@Entity('customer_sites')
export class CustomerSite extends BaseEntity {
  @Column({ length: 160 })
  name!: string;

  @Column({ length: 80, nullable: true })
  category?: string;

  @Column({ length: 80, nullable: true })
  reference?: string;

  @Column({ length: 40, default: 'ACTIVE' })
  status!: string;

  @Column({ nullable: true })
  addressLine1?: string;

  @Column({ nullable: true })
  addressLine2?: string;

  @Column({ nullable: true })
  city?: string;

  @Column({ nullable: true })
  state?: string;

  @Column({ nullable: true })
  postalCode?: string;

  @Column({ nullable: true })
  country?: string;

  @Column({ nullable: true })
  primaryContactName?: string;

  @Column({ nullable: true })
  primaryContactEmail?: string;

  @Column({ nullable: true })
  primaryContactPhone?: string;

  @Column({ nullable: true })
  mainContactId?: string;

  @Column({ type: 'json', nullable: true })
  tags?: string[];

  @Column({ type: 'text', nullable: true })
  additionalInformation?: string;

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

  @ManyToOne(() => CustomerSiteGroup, { nullable: true })
  siteGroup?: CustomerSiteGroup;

  @Column({ nullable: true })
  siteGroupId?: string;
}

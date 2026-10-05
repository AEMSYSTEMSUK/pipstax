import { Column, Entity, ManyToOne } from 'typeorm';
import { BaseEntity } from './base.entity';
import { Tenant } from './tenant.entity';
import { Customer } from './customer.entity';
import { CustomerSite } from './customer-site.entity';
import { Quote } from './quote.entity';

@Entity('renewal_opportunities')
export class RenewalOpportunity extends BaseEntity {
  @Column({ length: 180 })
  title!: string;

  @Column({ length: 100, nullable: true })
  reportType?: string;

  @Column({ length: 80, nullable: true })
  reference?: string;

  @Column({ length: 80, nullable: true })
  outcome?: string;

  @Column({ length: 40, default: 'OPEN' })
  status!: string;

  @Column({ type: 'timestamptz' })
  dueDate!: Date;

  @Column({ type: 'timestamptz', nullable: true })
  renewalWindowStart?: Date;

  @Column({ type: 'decimal', precision: 12, scale: 2, nullable: true })
  estimatedValue?: number;

  @Column({ type: 'timestamptz', nullable: true })
  lastQuotedAt?: Date;

  @Column({ type: 'timestamptz', nullable: true })
  lastChasedAt?: Date;

  @Column({ type: 'timestamptz', nullable: true })
  closedAt?: Date;

  @Column({ type: 'text', nullable: true })
  notes?: string;

  @Column({ nullable: true })
  ownerUserId?: string;

  @ManyToOne(() => Quote, { nullable: true })
  quote?: Quote;

  @Column({ nullable: true })
  quoteId?: string;

  @Column({ nullable: true })
  sourceComplianceRecordId?: string;

  @Column({ nullable: true })
  sourceJobId?: string;

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

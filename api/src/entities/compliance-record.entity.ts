import { Column, Entity, ManyToOne } from 'typeorm';
import { BaseEntity } from './base.entity';
import { Tenant } from './tenant.entity';
import { Customer } from './customer.entity';
import { CustomerSite } from './customer-site.entity';
import { Job } from './job.entity';

@Entity('compliance_records')
export class ComplianceRecord extends BaseEntity {
  @Column({ length: 180 })
  title!: string;

  @Column({ length: 100 })
  reportType!: string;

  @Column({ length: 80, nullable: true })
  reference?: string;

  @Column({ length: 80, nullable: true })
  outcome?: string;

  @Column({ length: 40, default: 'PENDING_REVIEW' })
  reviewStatus!: string;

  @Column({ type: 'timestamptz', nullable: true })
  testedAt?: Date;

  @Column({ type: 'timestamptz', nullable: true })
  validFrom?: Date;

  @Column({ type: 'timestamptz', nullable: true })
  validUntil?: Date;

  @Column({ type: 'timestamptz', nullable: true })
  reviewedAt?: Date;

  @Column({ type: 'decimal', precision: 12, scale: 2, nullable: true })
  expectedRenewalValue?: number;

  @Column({ nullable: true })
  reviewerUserId?: string;

  @Column({ type: 'text', nullable: true })
  reviewNote?: string;

  @Column({ default: true })
  customerVisible!: boolean;

  @Column({ type: 'text', nullable: true })
  notes?: string;

  @Column({ nullable: true })
  documentId?: string;

  @ManyToOne(() => Job, { nullable: true })
  job?: Job;

  @Column({ nullable: true })
  jobId?: string;

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

import { Column, Entity, Index, ManyToOne } from 'typeorm';
import { BaseEntity } from './base.entity';
import { Tenant } from './tenant.entity';
import { Customer } from './customer.entity';
import { CustomerSite } from './customer-site.entity';
import { Lead } from './lead.entity';
import { JobStatus } from '../constants/status';

@Entity('jobs')
@Index(['tenantId', 'jobNumber'], { unique: true })
export class Job extends BaseEntity {
  @Column({ length: 40, nullable: true })
  jobNumber?: string;

  @Column({ length: 160 })
  title!: string;

  @Column({ type: 'text', nullable: true })
  description?: string;

  @Column({ nullable: true })
  location?: string;

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

  @Column({ default: false })
  addressManuallyEdited!: boolean;

  @Column({ type: 'enum', enum: JobStatus, default: JobStatus.CREATED })
  status!: JobStatus;

  @Column({ nullable: true })
  priority?: string;

  @Column({ type: 'decimal', precision: 12, scale: 2, nullable: true })
  amount?: number;

  @Column({ type: 'timestamptz', nullable: true })
  scheduledAt?: Date;

  @Column({ type: 'timestamptz', nullable: true })
  scheduledEndAt?: Date;

  @Column({ type: 'timestamptz', nullable: true })
  completedAt?: Date;

  @Column({ length: 80, nullable: true })
  workflowStageKey?: string;

  @ManyToOne(() => Customer)
  customer!: Customer;

  @Column({ nullable: true })
  customerId?: string;

  @ManyToOne(() => CustomerSite, { nullable: true })
  site?: CustomerSite;

  @Column({ nullable: true })
  siteId?: string;

  @ManyToOne(() => Lead)
  lead?: Lead;

  @Column({ nullable: true })
  leadId?: string;

  @Column({ nullable: true })
  leadSource?: string;

  @Column({ type: 'json', nullable: true })
  leadActivitySnapshot?: Array<{
    id: string;
    type: string;
    message: string;
    createdAt: string;
    userId?: string | null;
    actorName?: string | null;
  }>;

  @ManyToOne(() => Tenant)
  tenant!: Tenant;

  @Column()
  tenantId!: string;
}

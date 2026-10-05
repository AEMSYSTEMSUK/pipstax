import { Column, Entity, ManyToOne } from 'typeorm';
import { BaseEntity } from './base.entity';
import { Tenant } from './tenant.entity';
import { Customer } from './customer.entity';
import { CustomerSite } from './customer-site.entity';
import { Lead } from './lead.entity';
import { QuoteStatus } from '../constants/status';

@Entity('quotes')
export class Quote extends BaseEntity {
  @Column({ length: 24, nullable: true, unique: true })
  quoteNumber?: string;

  @Column({ length: 160 })
  title!: string;

  @Column({ type: 'enum', enum: QuoteStatus, default: QuoteStatus.DRAFT })
  status!: QuoteStatus;

  @Column({ type: 'json' })
  lineItems!: Array<{ description: string; quantity: number; unitPrice: number; vatRate?: number }>;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  total!: number;

  @Column({ type: 'timestamptz', nullable: true })
  validUntil?: Date;

  @Column({ type: 'text', nullable: true })
  notes?: string;

  @Column({ type: 'text', nullable: true })
  termsAndConditions?: string;

  @Column({ nullable: true })
  publicToken?: string;

  @Column({ type: 'timestamptz', nullable: true })
  sentAt?: Date;

  @Column({ type: 'timestamptz', nullable: true })
  viewedAt?: Date;

  @Column({ type: 'timestamptz', nullable: true })
  signedAt?: Date;

  @Column({ type: 'timestamptz', nullable: true })
  declinedAt?: Date;

  @Column({ type: 'timestamptz', nullable: true })
  expiredAt?: Date;

  @Column({ length: 80, nullable: true })
  workflowStageKey?: string;

  @Column({ nullable: true })
  signedByName?: string;

  @Column({ nullable: true })
  signedByEmail?: string;

  @Column({ type: 'text', nullable: true })
  signatureData?: string;

  @Column({ nullable: true })
  signatureIp?: string;

  @ManyToOne(() => Customer)
  customer?: Customer;

  @Column({ nullable: true })
  customerId?: string;

  @ManyToOne(() => CustomerSite, { nullable: true })
  site?: CustomerSite;

  @Column({ nullable: true })
  siteId?: string;

  @Column({ length: 140, nullable: true })
  recipientName?: string;

  @Column({ length: 180, nullable: true })
  recipientEmail?: string;

  @Column({ length: 40, nullable: true })
  recipientPhone?: string;

  @ManyToOne(() => Lead)
  lead?: Lead;

  @Column({ nullable: true })
  leadId?: string;

  @Column({ nullable: true })
  jobId?: string;

  @ManyToOne(() => Tenant)
  tenant!: Tenant;

  @Column()
  tenantId!: string;
}

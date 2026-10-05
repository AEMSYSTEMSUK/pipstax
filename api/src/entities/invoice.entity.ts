import { Column, Entity, ManyToOne } from 'typeorm';
import { BaseEntity } from './base.entity';
import { Tenant } from './tenant.entity';
import { Customer } from './customer.entity';
import { CustomerSite } from './customer-site.entity';
import { InvoiceStatus } from '../constants/status';
import { AccountingSyncStatus } from '../constants/accounting';
import { IntegrationProvider } from '../constants/integrations';

export type InvoicePaymentRecord = {
  id: string;
  amount: number;
  paymentDate: string;
  method?: string;
  reference?: string;
  notes?: string;
  recordedAt: string;
  recordedByUserId?: string;
};

@Entity('invoices')
export class Invoice extends BaseEntity {
  @Column({ length: 24, nullable: true, unique: true })
  invoiceNumber?: string;

  @Column({ length: 160 })
  title!: string;

  @Column({ type: 'enum', enum: InvoiceStatus, default: InvoiceStatus.DRAFT })
  status!: InvoiceStatus;

  @Column({ type: 'json' })
  lineItems!: Array<{ description: string; quantity: number; unitPrice: number; vatRate?: number }>;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  subTotal!: number;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  vatTotal!: number;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  total!: number;

  @Column({ type: 'json', nullable: true })
  payments?: InvoicePaymentRecord[];

  @Column({ nullable: true })
  vatNumber?: string;

  @Column({ default: false })
  isMtdCompliant!: boolean;

  @Column({ type: 'date', nullable: true })
  dueDate?: string;

  @Column({ type: 'timestamptz', nullable: true })
  paidAt?: Date;

  @Column({ type: 'timestamptz', nullable: true })
  sentAt?: Date;

  @Column({ type: 'timestamptz', nullable: true })
  viewedAt?: Date;

  @Column({ length: 80, nullable: true })
  workflowStageKey?: string;

  @Column({ nullable: true })
  sourceQuoteId?: string;

  @Column({ nullable: true })
  sourceSplitInvoiceId?: string;

  @Column({ type: 'enum', enum: IntegrationProvider, nullable: true })
  accountingProvider?: IntegrationProvider;

  @Column({ nullable: true })
  accountingExternalId?: string;

  @Column({ nullable: true })
  accountingExternalReference?: string;

  @Column({
    type: 'enum',
    enum: AccountingSyncStatus,
    default: AccountingSyncStatus.NOT_SYNCED,
  })
  accountingSyncStatus!: AccountingSyncStatus;

  @Column({ type: 'timestamptz', nullable: true })
  accountingSyncedAt?: Date;

  @Column({ type: 'timestamptz', nullable: true })
  accountingLastStatusSyncAt?: Date;

  @Column({ type: 'text', nullable: true })
  accountingSyncError?: string;

  @ManyToOne(() => Customer)
  customer!: Customer;

  @Column()
  customerId!: string;

  @ManyToOne(() => CustomerSite, { nullable: true })
  site?: CustomerSite;

  @Column({ nullable: true })
  siteId?: string;

  @Column({ nullable: true })
  jobId?: string;

  @ManyToOne(() => Tenant)
  tenant!: Tenant;

  @Column()
  tenantId!: string;
}

import { Column, Entity, ManyToOne } from 'typeorm';
import { BaseEntity } from './base.entity';
import { Job } from './job.entity';
import { Tenant } from './tenant.entity';
import { Invoice } from './invoice.entity';
import { SplitInvoiceStatus } from '../constants/status';

@Entity('split_invoices')
export class SplitInvoice extends BaseEntity {
  @ManyToOne(() => Job)
  job!: Job;

  @Column()
  jobId!: string;

  @Column({ length: 240, nullable: true })
  description?: string;

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  valueExVat!: number;

  @Column({ type: 'enum', enum: SplitInvoiceStatus, default: SplitInvoiceStatus.TO_SEND })
  status!: SplitInvoiceStatus;

  @Column({ type: 'date', nullable: true })
  invoiceDate?: string;

  @ManyToOne(() => Invoice, { nullable: true })
  linkedInvoice?: Invoice;

  @Column({ nullable: true })
  linkedInvoiceId?: string;

  @ManyToOne(() => Tenant)
  tenant!: Tenant;

  @Column()
  tenantId!: string;
}

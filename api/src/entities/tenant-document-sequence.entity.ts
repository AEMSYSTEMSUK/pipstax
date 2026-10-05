import { Column, Entity, Index, ManyToOne } from 'typeorm';
import { BaseEntity } from './base.entity';
import { Tenant } from './tenant.entity';

@Entity('tenant_document_sequences')
@Index(['tenantId'], { unique: true })
@Index(['tenantCode'], { unique: true })
export class TenantDocumentSequence extends BaseEntity {
  @ManyToOne(() => Tenant)
  tenant!: Tenant;

  @Column()
  tenantId!: string;

  @Column({ length: 10 })
  tenantCode!: string;

  @Column({ default: 0 })
  quoteCounter!: number;

  @Column({ default: 0 })
  invoiceCounter!: number;

  @Column({ default: 0 })
  jobCounter!: number;

  @Column({ default: 0 })
  ticketCounter!: number;
}

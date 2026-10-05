import { Column, Entity, ManyToOne } from 'typeorm';
import { BaseEntity } from './base.entity';
import { Tenant } from './tenant.entity';
import { Lead } from './lead.entity';

@Entity('lead_activities')
export class LeadActivity extends BaseEntity {
  @ManyToOne(() => Lead)
  lead!: Lead;

  @Column()
  leadId!: string;

  @Column({ length: 80 })
  type!: string;

  @Column({ type: 'text' })
  message!: string;

  @Column({ type: 'json', nullable: true })
  metadata?: Record<string, unknown>;

  @Column({ nullable: true })
  userId?: string;

  @ManyToOne(() => Tenant)
  tenant!: Tenant;

  @Column()
  tenantId!: string;
}

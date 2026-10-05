import { Column, Entity, ManyToOne } from 'typeorm';
import { BaseEntity } from './base.entity';
import { Lead } from './lead.entity';
import { Tenant } from './tenant.entity';
import { LeadTaskStatus } from '../constants/status';

@Entity('lead_tasks')
export class LeadTask extends BaseEntity {
  @ManyToOne(() => Lead)
  lead!: Lead;

  @Column()
  leadId!: string;

  @Column({ length: 160 })
  title!: string;

  @Column({ length: 80, default: 'GENERAL' })
  taskType!: string;

  @Column({ type: 'text', nullable: true })
  description?: string;

  @Column({ type: 'enum', enum: LeadTaskStatus, default: LeadTaskStatus.OPEN })
  status!: LeadTaskStatus;

  @Column({ nullable: true })
  assigneeUserId?: string;

  @Column({ type: 'timestamptz', nullable: true })
  reminderAt?: Date;

  @Column({ type: 'timestamptz', nullable: true })
  reminderSentAt?: Date;

  @Column({ type: 'timestamptz', nullable: true })
  completedAt?: Date;

  @Column({ nullable: true })
  createdByUserId?: string;

  @ManyToOne(() => Tenant)
  tenant!: Tenant;

  @Column()
  tenantId!: string;
}

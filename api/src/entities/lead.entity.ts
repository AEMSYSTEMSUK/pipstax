import { Column, Entity, ManyToOne } from 'typeorm';
import { BaseEntity } from './base.entity';
import { Tenant } from './tenant.entity';
import { LeadStatus } from '../constants/status';

@Entity('leads')
export class Lead extends BaseEntity {
  @Column({ length: 120 })
  name!: string;

  @Column({ length: 160 })
  email!: string;

  @Column({ nullable: true })
  phone?: string;

  @Column({ length: 120 })
  source!: string;

  @Column({ type: 'enum', enum: LeadStatus, default: LeadStatus.NEW })
  status!: LeadStatus;

  @Column({ nullable: true })
  industry?: string;

  @Column({ type: 'json', nullable: true })
  tags?: string[];

  @Column({ type: 'timestamptz', nullable: true })
  nextFollowUpAt?: Date;

  @Column({ nullable: true })
  assignedUserId?: string;

  @Column({ nullable: true })
  createdByUserId?: string;

  @Column({ type: 'text', nullable: true })
  notes?: string;

  @Column({ type: 'timestamptz', nullable: true })
  followUpReminderSentAt?: Date;

  @ManyToOne(() => Tenant)
  tenant!: Tenant;

  @Column()
  tenantId!: string;
}

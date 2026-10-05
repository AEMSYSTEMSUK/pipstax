import { Column, Entity, ManyToOne } from 'typeorm';
import { BaseEntity } from './base.entity';
import { Job } from './job.entity';
import { Tenant } from './tenant.entity';

@Entity('job_activities')
export class JobActivity extends BaseEntity {
  @ManyToOne(() => Job)
  job!: Job;

  @Column()
  jobId!: string;

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

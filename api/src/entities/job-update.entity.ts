import { Column, Entity, ManyToOne } from 'typeorm';
import { BaseEntity } from './base.entity';
import { Tenant } from './tenant.entity';
import { Job } from './job.entity';
import { User } from './user.entity';
import { JobStatus } from '../constants/status';

@Entity('job_updates')
export class JobUpdate extends BaseEntity {
  @ManyToOne(() => Job)
  job!: Job;

  @Column()
  jobId!: string;

  @ManyToOne(() => User)
  user!: User;

  @Column()
  userId!: string;

  @Column({ type: 'enum', enum: JobStatus, nullable: true })
  status?: JobStatus;

  @Column({ type: 'text', nullable: true })
  notes?: string;

  @Column({ type: 'json', nullable: true })
  photoUrls?: string[];

  @Column({ type: 'json', nullable: true })
  photoLabels?: string[];

  @Column({ type: 'text', nullable: true })
  customerSignatureData?: string;

  @Column({ nullable: true })
  customerSignatureName?: string;

  @Column({ type: 'timestamptz', nullable: true })
  clientTimestamp?: Date;

  @ManyToOne(() => Tenant)
  tenant!: Tenant;

  @Column()
  tenantId!: string;
}

import { Column, Entity, ManyToOne } from 'typeorm';
import { BaseEntity } from './base.entity';
import { Job } from './job.entity';
import { Tenant } from './tenant.entity';
import { User } from './user.entity';

@Entity('job_time_entries')
export class JobTimeEntry extends BaseEntity {
  @ManyToOne(() => Job)
  job!: Job;

  @Column()
  jobId!: string;

  @ManyToOne(() => User)
  user!: User;

  @Column()
  userId!: string;

  @Column({ type: 'timestamptz', nullable: true })
  startTime?: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  endTime?: Date | null;

  @Column({ type: 'int', nullable: true })
  durationMinutes?: number | null;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  hourlyRate?: number;

  @Column({ type: 'text', nullable: true })
  notes?: string;

  @Column({ type: 'varchar', length: 50, default: 'MANUAL' })
  entryType!: string;

  @ManyToOne(() => Tenant)
  tenant!: Tenant;

  @Column()
  tenantId!: string;
}

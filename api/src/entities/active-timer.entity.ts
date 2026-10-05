import { Column, Entity, ManyToOne } from 'typeorm';
import { BaseEntity } from './base.entity';
import { Job } from './job.entity';
import { Tenant } from './tenant.entity';
import { User } from './user.entity';

@Entity('active_timers')
export class ActiveTimer extends BaseEntity {
  @ManyToOne(() => Job)
  job!: Job;

  @Column()
  jobId!: string;

  @ManyToOne(() => User)
  user!: User;

  @Column()
  userId!: string;

  @Column({ type: 'timestamptz' })
  startTime!: Date;

  @ManyToOne(() => Tenant)
  tenant!: Tenant;

  @Column()
  tenantId!: string;
}

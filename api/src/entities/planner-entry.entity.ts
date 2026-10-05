import { Column, Entity, Index, ManyToOne } from 'typeorm';
import { BaseEntity } from './base.entity';
import { Tenant } from './tenant.entity';
import { Job } from './job.entity';
import { User } from './user.entity';

@Entity('planner_entries')
@Index(['tenantId', 'jobId', 'userId', 'date'])
export class PlannerEntry extends BaseEntity {
  @ManyToOne(() => Job)
  job!: Job;

  @Column()
  jobId!: string;

  @ManyToOne(() => User)
  user!: User;

  @Column()
  userId!: string;

  @Column({ type: 'date' })
  date!: string;

  @Column({ type: 'text', nullable: true })
  note?: string;

  @ManyToOne(() => Tenant)
  tenant!: Tenant;

  @Column()
  tenantId!: string;
}

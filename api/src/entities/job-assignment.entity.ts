import { Column, Entity, ManyToOne } from 'typeorm';
import { BaseEntity } from './base.entity';
import { Tenant } from './tenant.entity';
import { Job } from './job.entity';
import { User } from './user.entity';
import { AssignmentType } from '../constants/jobs';
import { EmployeeTeam } from './employee-team.entity';

@Entity('job_assignments')
export class JobAssignment extends BaseEntity {
  @ManyToOne(() => Job)
  job!: Job;

  @Column()
  jobId!: string;

  @ManyToOne(() => User)
  user!: User;

  @Column()
  userId!: string;

  @Column({ type: 'enum', enum: AssignmentType, default: AssignmentType.INTERNAL })
  assignmentType!: AssignmentType;

  @ManyToOne(() => EmployeeTeam, { nullable: true })
  team?: EmployeeTeam;

  @Column({ nullable: true })
  teamId?: string;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  effectiveHourlyRate?: number;

  @Column({ type: 'timestamptz', nullable: true })
  assignedAt?: Date;

  @Column({ type: 'boolean', default: true })
  isActive!: boolean;

  @Column({ type: 'boolean', default: true })
  isPrimary!: boolean;

  @ManyToOne(() => Tenant)
  tenant!: Tenant;

  @Column()
  tenantId!: string;
}

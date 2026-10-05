import { Column, Entity, ManyToOne } from 'typeorm';
import { BaseEntity } from './base.entity';
import { Job } from './job.entity';
import { Tenant } from './tenant.entity';
import { User } from './user.entity';

@Entity('job_expenses')
export class JobExpense extends BaseEntity {
  @ManyToOne(() => Job)
  job!: Job;

  @Column()
  jobId!: string;

  @ManyToOne(() => User)
  user!: User;

  @Column()
  userId!: string;

  @Column({ length: 240 })
  description!: string;

  @Column({ length: 120, nullable: true })
  category?: string;

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  amount!: number;

  @Column({ length: 3, default: 'GBP' })
  currency!: string;

  @Column({ type: 'date' })
  expenseDate!: string;

  @Column({ nullable: true })
  receiptUrl?: string;

  @Column({ type: 'text', nullable: true })
  customerSignatureData?: string;

  @Column({ nullable: true })
  customerSignatureName?: string;

  @Column({ type: 'timestamptz', nullable: true })
  customerSignatureCapturedAt?: Date;

  @ManyToOne(() => Tenant)
  tenant!: Tenant;

  @Column()
  tenantId!: string;
}

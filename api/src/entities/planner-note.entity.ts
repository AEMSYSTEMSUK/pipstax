import { Column, Entity, ManyToOne } from 'typeorm';
import { BaseEntity } from './base.entity';
import { Tenant } from './tenant.entity';
import { User } from './user.entity';

@Entity('planner_notes')
export class PlannerNote extends BaseEntity {
  @Column({ length: 160 })
  title!: string;

  @Column({ type: 'date' })
  date!: string;

  @Column({ type: 'date', nullable: true })
  endDate?: string | null;

  @Column({ length: 80, nullable: true })
  kind?: string;

  @Column({ type: 'text', nullable: true })
  notes?: string;

  @Column({ default: false })
  reminderEnabled!: boolean;

  @Column({ type: 'timestamptz', nullable: true })
  reminderSentAt?: Date | null;

  @ManyToOne(() => User)
  user!: User;

  @Column()
  userId!: string;

  @ManyToOne(() => Tenant)
  tenant!: Tenant;

  @Column()
  tenantId!: string;
}

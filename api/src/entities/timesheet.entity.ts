import { Column, Entity, ManyToOne } from 'typeorm';
import { BaseEntity } from './base.entity';
import { Tenant } from './tenant.entity';
import { User } from './user.entity';

@Entity('timesheets')
export class Timesheet extends BaseEntity {
  @ManyToOne(() => User)
  worker!: User;

  @Column()
  workerId!: string;

  @Column({ type: 'date' })
  date!: string;

  @Column({ type: 'decimal', precision: 6, scale: 2 })
  hours!: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  hourlyRate?: number;

  @Column({ default: false })
  approved!: boolean;

  @ManyToOne(() => Tenant)
  tenant!: Tenant;

  @Column()
  tenantId!: string;
}

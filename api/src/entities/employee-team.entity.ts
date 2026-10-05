import { Column, Entity, ManyToOne, OneToMany } from 'typeorm';
import { BaseEntity } from './base.entity';
import { Tenant } from './tenant.entity';
import { EmployeeTeamMember } from './employee-team-member.entity';

@Entity('employee_teams')
export class EmployeeTeam extends BaseEntity {
  @Column({ length: 120 })
  name!: string;

  @Column({ type: 'text', nullable: true })
  description?: string;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  hourlyRate?: number;

  @Column({ type: 'boolean', default: true })
  isActive!: boolean;

  @ManyToOne(() => Tenant)
  tenant!: Tenant;

  @Column()
  tenantId!: string;

  @OneToMany(() => EmployeeTeamMember, (member) => member.team)
  members!: EmployeeTeamMember[];
}

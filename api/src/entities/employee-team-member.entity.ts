import { Column, Entity, ManyToOne } from 'typeorm';
import { BaseEntity } from './base.entity';
import { Tenant } from './tenant.entity';
import { User } from './user.entity';
import { EmployeeTeam } from './employee-team.entity';

@Entity('employee_team_members')
export class EmployeeTeamMember extends BaseEntity {
  @ManyToOne(() => EmployeeTeam, (team) => team.members)
  team!: EmployeeTeam;

  @Column()
  teamId!: string;

  @ManyToOne(() => User)
  user!: User;

  @Column()
  userId!: string;

  @ManyToOne(() => Tenant)
  tenant!: Tenant;

  @Column()
  tenantId!: string;

  @Column({ type: 'boolean', default: true })
  isActive!: boolean;
}

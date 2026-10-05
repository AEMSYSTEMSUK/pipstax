import { Column, Entity, ManyToOne } from 'typeorm';
import { BaseEntity } from './base.entity';
import { Tenant } from './tenant.entity';
import { User } from './user.entity';
import { ContractorComplianceStatus } from '../constants/status';

@Entity('contractor_profiles')
export class ContractorProfile extends BaseEntity {
  @ManyToOne(() => User)
  user!: User;

  @Column()
  userId!: string;

  @Column({ nullable: true })
  companyName?: string;

  @Column({ nullable: true })
  tradeType?: string;

  @Column({ nullable: true })
  contactName?: string;

  @Column({ nullable: true })
  phone?: string;

  @Column({ nullable: true })
  notes?: string;

  @Column({ type: 'enum', enum: ContractorComplianceStatus, default: ContractorComplianceStatus.PENDING })
  complianceStatus!: ContractorComplianceStatus;

  @ManyToOne(() => Tenant)
  tenant!: Tenant;

  @Column()
  tenantId!: string;
}

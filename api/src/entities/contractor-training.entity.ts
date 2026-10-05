import { Column, Entity, ManyToOne } from 'typeorm';
import { BaseEntity } from './base.entity';
import { Tenant } from './tenant.entity';
import { ContractorProfile } from './contractor-profile.entity';

@Entity('contractor_trainings')
export class ContractorTraining extends BaseEntity {
  @ManyToOne(() => ContractorProfile)
  contractor!: ContractorProfile;

  @Column()
  contractorId!: string;

  @Column({ default: false })
  acknowledged!: boolean;

  @Column({ type: 'timestamptz', nullable: true })
  acknowledgedAt?: Date;

  @Column({ type: 'text', nullable: true })
  signatureData?: string;

  @ManyToOne(() => Tenant)
  tenant!: Tenant;

  @Column()
  tenantId!: string;
}

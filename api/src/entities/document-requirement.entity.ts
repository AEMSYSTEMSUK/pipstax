import { Column, Entity, ManyToOne } from 'typeorm';
import { BaseEntity } from './base.entity';
import { Tenant } from './tenant.entity';
import { ContractorProfile } from './contractor-profile.entity';

@Entity('document_requirements')
export class DocumentRequirement extends BaseEntity {
  @Column({ length: 160 })
  name!: string;

  @Column({ nullable: true })
  description?: string;

  @Column({ default: true })
  isRequired!: boolean;

  @ManyToOne(() => ContractorProfile, { nullable: true })
  contractor?: ContractorProfile;

  @Column({ nullable: true })
  contractorId?: string;

  @ManyToOne(() => Tenant)
  tenant!: Tenant;

  @Column()
  tenantId!: string;
}

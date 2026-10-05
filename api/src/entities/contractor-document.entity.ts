import { Column, Entity, ManyToOne } from 'typeorm';
import { BaseEntity } from './base.entity';
import { Tenant } from './tenant.entity';
import { ContractorProfile } from './contractor-profile.entity';
import { DocumentRequirement } from './document-requirement.entity';
import { DocumentStatus } from '../constants/status';

@Entity('contractor_documents')
export class ContractorDocument extends BaseEntity {
  @ManyToOne(() => ContractorProfile)
  contractor!: ContractorProfile;

  @Column()
  contractorId!: string;

  @ManyToOne(() => DocumentRequirement)
  requirement!: DocumentRequirement;

  @Column()
  requirementId!: string;

  @Column({ nullable: true })
  fileUrl?: string;

  @Column({ type: 'enum', enum: DocumentStatus, default: DocumentStatus.PENDING })
  status!: DocumentStatus;

  @Column({ type: 'text', nullable: true })
  reviewerNotes?: string;

  @ManyToOne(() => Tenant)
  tenant!: Tenant;

  @Column()
  tenantId!: string;
}

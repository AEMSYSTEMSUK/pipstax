import { Column, Entity, ManyToOne } from 'typeorm';
import { BaseEntity } from './base.entity';
import { ContractorDocument } from './contractor-document.entity';
import { ContractorProfile } from './contractor-profile.entity';
import { Tenant } from './tenant.entity';
import { User } from './user.entity';
import { DocumentStatus } from '../constants/status';

@Entity('contractor_document_reviews')
export class ContractorDocumentReview extends BaseEntity {
  @ManyToOne(() => ContractorDocument)
  document!: ContractorDocument;

  @Column()
  documentId!: string;

  @ManyToOne(() => ContractorProfile)
  contractor!: ContractorProfile;

  @Column()
  contractorId!: string;

  @Column({ type: 'enum', enum: DocumentStatus })
  status!: DocumentStatus;

  @Column({ type: 'text', nullable: true })
  notes?: string;

  @Column({ length: 32, default: 'SYSTEM' })
  actorType!: string;

  @ManyToOne(() => User, { nullable: true })
  actor?: User;

  @Column({ nullable: true })
  actorUserId?: string;

  @ManyToOne(() => Tenant)
  tenant!: Tenant;

  @Column()
  tenantId!: string;
}

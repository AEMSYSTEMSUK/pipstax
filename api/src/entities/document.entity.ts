import { Column, Entity, ManyToOne } from 'typeorm';
import { BaseEntity } from './base.entity';
import { Tenant } from './tenant.entity';
import { DocumentStatus } from '../constants/status';
import { SyncStatus } from '../constants/integrations';

@Entity('documents')
export class DocumentItem extends BaseEntity {
  @Column({ length: 180 })
  name!: string;

  @Column({ length: 180, nullable: true })
  label?: string;

  @Column({ length: 260 })
  fileUrl!: string;

  @Column({ nullable: true })
  category?: string;

  @Column({ type: 'enum', enum: DocumentStatus, default: DocumentStatus.PENDING })
  status!: DocumentStatus;

  @Column({ type: 'enum', enum: SyncStatus, default: SyncStatus.PENDING })
  syncStatus!: SyncStatus;

  @Column({ nullable: true })
  externalId?: string;

  @Column({ nullable: true })
  relatedEntityType?: string;

  @Column({ nullable: true })
  relatedEntityId?: string;

  @Column({ type: 'int', nullable: true })
  fileSizeBytes?: number;

  @ManyToOne(() => Tenant)
  tenant!: Tenant;

  @Column()
  tenantId!: string;
}

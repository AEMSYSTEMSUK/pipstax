import { Column, Entity, ManyToOne } from 'typeorm';
import { BaseEntity } from './base.entity';
import { Tenant } from './tenant.entity';
import { IntegrationProvider, IntegrationStatus } from '../constants/integrations';

@Entity('integrations')
export class IntegrationConnection extends BaseEntity {
  @Column({ type: 'enum', enum: IntegrationProvider })
  provider!: IntegrationProvider;

  @Column({ type: 'enum', enum: IntegrationStatus, default: IntegrationStatus.DISCONNECTED })
  status!: IntegrationStatus;

  @Column({ nullable: true })
  accessToken?: string;

  @Column({ nullable: true })
  refreshToken?: string;

  @Column({ nullable: true })
  rootFolderId?: string;

  @Column({ type: 'json', nullable: true })
  metadata?: Record<string, unknown>;

  @Column({ type: 'timestamptz', nullable: true })
  connectedAt?: Date;

  @ManyToOne(() => Tenant)
  tenant!: Tenant;

  @Column()
  tenantId!: string;
}

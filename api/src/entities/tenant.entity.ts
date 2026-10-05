import { Column, Entity, OneToMany } from 'typeorm';
import { BaseEntity } from './base.entity';
import { User } from './user.entity';
import { IntegrationProvider } from '../constants/integrations';

@Entity('tenants')
export class Tenant extends BaseEntity {
  @Column({ length: 120 })
  name!: string;

  @Column({ length: 120 })
  tradingName!: string;

  @Column({ length: 120, unique: true, nullable: true })
  subdomain?: string;

  @Column({ nullable: true })
  logoUrl?: string;

  @Column({ nullable: true })
  primaryColor?: string;

  @Column({ nullable: true })
  emailHeaderLogoUrl?: string;

  @Column({ nullable: true })
  address?: string;

  @Column({ nullable: true })
  contactEmail?: string;

  @Column({ nullable: true })
  contactPhone?: string;

  @Column({ nullable: true })
  vatNumber?: string;

  @Column({ nullable: true })
  companyNumber?: string;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  defaultHourlyRate?: number;

  @Column({
    type: 'enum',
    enum: IntegrationProvider,
    default: IntegrationProvider.GOOGLE_DRIVE,
  })
  documentSyncProvider!: IntegrationProvider;

  @Column({
    type: 'enum',
    enum: IntegrationProvider,
    nullable: true,
  })
  accountingProvider?: IntegrationProvider;

  @Column({ type: 'jsonb', default: () => "'{}'::jsonb" })
  featureFlags!: Record<string, boolean>;

  @Column({ type: 'jsonb', default: () => "'{}'::jsonb" })
  workflowConfig!: Record<string, unknown>;

  @Column({ type: 'jsonb', default: () => "'{}'::jsonb" })
  uiPreferences!: Record<string, unknown>;

  @OneToMany(() => User, (user) => user.tenant)
  users!: User[];
}

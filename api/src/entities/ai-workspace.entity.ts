import { Column, Entity, Index, ManyToOne } from 'typeorm';
import { BaseEntity } from './base.entity';
import { Tenant } from './tenant.entity';

// AI Workspace (#229 part 3, Nov 2026): per-tenant Spaces + Actions over that tenant's Pipstax data, Claude tool loop,
// approve-before-write proposals, full run log and a monthly spend cap. Tables are created by
// `npm run db:ai-workspace` (src/scripts/apply-ai-workspace-tables.ts) - DB_SYNC stays off in production.

// Platform-wide AI settings (one row). The Anthropic key here is AEM's "managed AI" key: tenants that the platform
// allows to use it are billed for their usage (see GET /platform/ai/usage). Stored encrypted (utils/secret-box.ts).
@Entity('ai_platform_settings')
export class AiPlatformSettings extends BaseEntity {
  @Column({ type: 'text', nullable: true })
  anthropicKeyEnc?: string | null;

  @Column({ type: 'varchar', length: 60, nullable: true })
  defaultModel?: string | null;
}

// Per-tenant switch + key choice + cap. keySource 'own' = the tenant's own Anthropic key (entered in AI Workspace >
// Manage, never in .env); 'managed' = AEM's platform key, only when the platform has set managedAllowed.
@Entity('ai_tenant_settings')
export class AiTenantSettings extends BaseEntity {
  @Index({ unique: true })
  @Column({ type: 'uuid' })
  tenantId!: string;

  @ManyToOne(() => Tenant)
  tenant!: Tenant;

  @Column({ default: false })
  enabled!: boolean;

  @Column({ type: 'varchar', length: 16, default: 'own' })
  keySource!: string;

  @Column({ type: 'text', nullable: true })
  anthropicKeyEnc?: string | null;

  @Column({ type: 'varchar', length: 60, nullable: true })
  defaultModel?: string | null;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 25 })
  monthlyCapUsd!: string;

  // Set by the platform (AEM), not the tenant.
  @Column({ default: false })
  managedAllowed!: boolean;

  // Ceiling AEM puts on managed-key spend for this tenant (null = no extra ceiling beyond monthlyCapUsd).
  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  platformCapUsd?: string | null;
}

@Entity('ai_spaces')
@Index(['tenantId', 'key'], { unique: true })
export class AiSpace extends BaseEntity {
  @Column({ type: 'uuid' })
  tenantId!: string;

  @Column({ type: 'varchar', length: 32 })
  key!: string;

  @Column({ type: 'varchar', length: 80 })
  name!: string;

  @Column({ type: 'text', nullable: true })
  description?: string | null;

  // Permission key (constants/permissions) the person needs to use this Space; null = any AI Workspace user.
  @Column({ type: 'varchar', length: 40, nullable: true })
  requiredPermission?: string | null;

  @Column({ default: true })
  enabled!: boolean;

  @Column({ type: 'int', default: 0 })
  sortOrder!: number;
}

@Entity('ai_actions')
@Index(['tenantId', 'spaceId'])
export class AiAction extends BaseEntity {
  @Column({ type: 'uuid' })
  tenantId!: string;

  @Column({ type: 'uuid' })
  spaceId!: string;

  @Column({ type: 'varchar', length: 120 })
  name!: string;

  @Column({ type: 'text', nullable: true })
  description?: string | null;

  // Role, tone, output format, examples - becomes part of the system prompt.
  @Column({ type: 'text' })
  instructions!: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  inputHint?: string | null;

  // Claude model id; null = the tenant default (then the platform default).
  @Column({ type: 'varchar', length: 60, nullable: true })
  model?: string | null;

  // false = read-only Action (the propose_* tools are not offered).
  @Column({ default: false })
  allowWrites!: boolean;

  @Column({ default: true })
  enabled!: boolean;

  @Column({ default: false })
  builtIn!: boolean;

  @Column({ type: 'int', default: 0 })
  sortOrder!: number;
}

@Entity('ai_runs')
@Index(['tenantId', 'createdAt'])
export class AiRun extends BaseEntity {
  @Column({ type: 'uuid' })
  tenantId!: string;

  @Column({ type: 'varchar', length: 32 })
  spaceKey!: string;

  @Column({ type: 'uuid', nullable: true })
  actionId?: string | null;

  @Column({ type: 'varchar', length: 120, nullable: true })
  actionName?: string | null;

  @Column({ type: 'uuid' })
  userId!: string;

  @Column({ type: 'varchar', length: 191 })
  userName!: string;

  @Column({ type: 'varchar', length: 60 })
  model!: string;

  // 'own' | 'managed' - managed runs are billed to the tenant by AEM.
  @Column({ type: 'varchar', length: 16, default: 'own' })
  keySource!: string;

  @Column({ type: 'text' })
  input!: string;

  // JSON: system prompt, tool names, every tool call (name, input, ok, result size) and the model's turns.
  @Column({ type: 'text', nullable: true })
  transcript?: string | null;

  @Column({ type: 'text', nullable: true })
  output?: string | null;

  // running | ok | error | capped
  @Column({ type: 'varchar', length: 16, default: 'running' })
  status!: string;

  @Column({ type: 'text', nullable: true })
  error?: string | null;

  @Column({ type: 'int', default: 0 })
  inputTokens!: number;

  @Column({ type: 'int', default: 0 })
  outputTokens!: number;

  @Column({ type: 'decimal', precision: 12, scale: 6, default: 0 })
  costUsd!: string;

  @Column({ type: 'int', default: 0 })
  toolCalls!: number;
}

@Entity('ai_proposals')
@Index(['tenantId', 'status'])
export class AiProposal extends BaseEntity {
  @Column({ type: 'uuid' })
  tenantId!: string;

  @Column({ type: 'uuid' })
  runId!: string;

  // lead_note
  @Column({ type: 'varchar', length: 40 })
  kind!: string;

  @Column({ type: 'text' })
  summary!: string;

  @Column({ type: 'jsonb' })
  payload!: Record<string, unknown>;

  // pending | applying | done | rejected | failed
  @Column({ type: 'varchar', length: 16, default: 'pending' })
  status!: string;

  @Column({ type: 'uuid' })
  requestedById!: string;

  @Column({ type: 'uuid', nullable: true })
  decidedById?: string | null;

  @Column({ type: 'varchar', length: 191, nullable: true })
  decidedByName?: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  decidedAt?: Date | null;

  @Column({ type: 'text', nullable: true })
  result?: string | null;
}

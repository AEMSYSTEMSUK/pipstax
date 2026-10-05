import { AppDataSource } from '../config/data-source';
import { InvoiceStatus, JobStatus, QuoteStatus } from '../constants/status';
import { Invoice } from '../entities/invoice.entity';
import { Job } from '../entities/job.entity';
import { Quote } from '../entities/quote.entity';
import { Tenant } from '../entities/tenant.entity';
import { BadRequestError, NotFoundError } from '../utils/errors';

export const WORKFLOW_MODULE_KEYS = ['jobs', 'quotes', 'invoices'] as const;
export type WorkflowModuleKey = (typeof WORKFLOW_MODULE_KEYS)[number];

export type WorkflowStageColorTone = 'secondary' | 'warning' | 'success' | 'destructive' | 'primary';

export type WorkflowStageDefinition = {
  key: string;
  label: string;
  baseStatus: string;
  colorTone?: WorkflowStageColorTone;
  sortOrder: number;
  terminal: boolean;
};

export type TenantWorkflowConfig = Record<WorkflowModuleKey, { stages: WorkflowStageDefinition[] }>;
export type WorkflowStageUsageSummary = Record<WorkflowModuleKey, Record<string, number>>;

const WORKFLOW_BASE_STATUS_OPTIONS: Record<WorkflowModuleKey, string[]> = {
  jobs: [
    JobStatus.NOT_ASSIGNED,
    JobStatus.ASSIGNED,
    JobStatus.LIVE,
    JobStatus.REQUIRES_FOLLOW_UP,
    JobStatus.FINISHED,
    JobStatus.COMPLETED,
  ],
  quotes: [
    QuoteStatus.DRAFT,
    QuoteStatus.SENT,
    QuoteStatus.VIEWED,
    QuoteStatus.SIGNED,
    QuoteStatus.DECLINED,
  ],
  invoices: [
    InvoiceStatus.DRAFT,
    InvoiceStatus.SENT,
    InvoiceStatus.VIEWED,
    InvoiceStatus.OVERDUE,
    InvoiceStatus.PAID,
    InvoiceStatus.VOID,
  ],
};

const TERMINAL_STATUSES = new Set<string>([
  JobStatus.COMPLETED,
  QuoteStatus.SIGNED,
  QuoteStatus.DECLINED,
  InvoiceStatus.PAID,
  InvoiceStatus.VOID,
]);

const DEFAULT_STAGE_TONES: Record<string, WorkflowStageColorTone> = {
  [JobStatus.NOT_ASSIGNED]: 'secondary',
  [JobStatus.ASSIGNED]: 'primary',
  [JobStatus.LIVE]: 'warning',
  [JobStatus.REQUIRES_FOLLOW_UP]: 'destructive',
  [JobStatus.FINISHED]: 'primary',
  [JobStatus.COMPLETED]: 'success',
  [QuoteStatus.DRAFT]: 'secondary',
  [QuoteStatus.SENT]: 'warning',
  [QuoteStatus.VIEWED]: 'primary',
  [QuoteStatus.SIGNED]: 'success',
  [QuoteStatus.DECLINED]: 'destructive',
  [InvoiceStatus.OVERDUE]: 'destructive',
  [InvoiceStatus.PAID]: 'success',
  [InvoiceStatus.VOID]: 'destructive',
};

const toTitleCase = (value: string) =>
  value
    .toLowerCase()
    .split(' ')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');

const normalizeStageKey = (value: string) =>
  value
    .trim()
    .replace(/[^A-Za-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toUpperCase();

const formatStageStatusText = (status: string) => (status === QuoteStatus.SIGNED ? 'Accepted' : status.replace(/_/g, ' '));
const formatWorkflowStageLabel = (status: string) =>
  status === JobStatus.COMPLETED
    ? 'Closed'
    : status === JobStatus.REQUIRES_FOLLOW_UP
      ? 'Needs Attention'
      : toTitleCase(formatStageStatusText(status));
const formatFallbackStatusLabel = (status: string) => toTitleCase(formatStageStatusText(status));
const normalizeLegacyStageLabel = (module: WorkflowModuleKey, baseStatus: string, key: string, label: string) =>
  module === 'quotes' && baseStatus === QuoteStatus.SIGNED && key === QuoteStatus.SIGNED && label === 'Signed'
    ? 'Accepted'
    : module === 'jobs' && baseStatus === JobStatus.COMPLETED && key === JobStatus.COMPLETED && label === 'Completed'
      ? 'Closed'
      : module === 'jobs' && baseStatus === JobStatus.NOT_ASSIGNED && key === JobStatus.NOT_ASSIGNED
        ? 'Not Assigned'
        : module === 'jobs' && baseStatus === JobStatus.LIVE && key === JobStatus.LIVE
        ? 'Live'
        : module === 'jobs' && baseStatus === JobStatus.REQUIRES_FOLLOW_UP && key === JobStatus.REQUIRES_FOLLOW_UP
          ? 'Needs Attention'
        : module === 'jobs' && baseStatus === JobStatus.FINISHED && key === JobStatus.FINISHED
          ? 'Finished'
      : label;

const normalizeWorkflowBaseStatus = (module: WorkflowModuleKey, value: unknown) => {
  const normalized = String(value ?? '').trim().toUpperCase();
  if (module === 'jobs') {
    if (
      normalized === JobStatus.CREATED ||
      normalized === JobStatus.SCHEDULED ||
      normalized === JobStatus.CANCELLED
    ) {
      return JobStatus.NOT_ASSIGNED;
    }
    if (normalized === JobStatus.EN_ROUTE || normalized === JobStatus.ON_SITE) {
      return JobStatus.LIVE;
    }
    if (normalized === JobStatus.REQUIRES_FOLLOW_UP) {
      return JobStatus.REQUIRES_FOLLOW_UP;
    }
  }
  return normalized;
};

const normalizeWorkflowStageKeyForBase = (module: WorkflowModuleKey, value: string, baseStatus: string) => {
  const normalized = normalizeStageKey(value);
  if (module !== 'jobs') return normalized;
  if (
    normalized === JobStatus.CREATED ||
    normalized === JobStatus.SCHEDULED ||
    normalized === JobStatus.CANCELLED
  ) {
    return JobStatus.NOT_ASSIGNED;
  }
  if (normalized === JobStatus.EN_ROUTE || normalized === JobStatus.ON_SITE) {
    return JobStatus.LIVE;
  }
  if (normalized === JobStatus.REQUIRES_FOLLOW_UP) {
    return JobStatus.REQUIRES_FOLLOW_UP;
  }
  return normalized || baseStatus;
};

const isPlatformStageKey = (module: WorkflowModuleKey, key: string) =>
  WORKFLOW_BASE_STATUS_OPTIONS[module].includes(key);

const buildDefaultStages = (module: WorkflowModuleKey): WorkflowStageDefinition[] =>
  WORKFLOW_BASE_STATUS_OPTIONS[module].map((status, index) => ({
    key: status,
    label: formatWorkflowStageLabel(status),
    baseStatus: status,
    colorTone: DEFAULT_STAGE_TONES[status] ?? 'primary',
    sortOrder: index,
    terminal: TERMINAL_STATUSES.has(status),
  }));

export const DEFAULT_TENANT_WORKFLOW_CONFIG: TenantWorkflowConfig = {
  jobs: { stages: buildDefaultStages('jobs') },
  quotes: { stages: buildDefaultStages('quotes') },
  invoices: { stages: buildDefaultStages('invoices') },
};

export const EMPTY_WORKFLOW_STAGE_USAGE_SUMMARY: WorkflowStageUsageSummary = {
  jobs: {},
  quotes: {},
  invoices: {},
};

const WORKFLOW_MODULE_LABELS: Record<WorkflowModuleKey, string> = {
  jobs: 'jobs',
  quotes: 'quotes',
  invoices: 'invoices',
};

const normalizeStageColorTone = (value: unknown): WorkflowStageColorTone | undefined => {
  if (typeof value !== 'string') {
    return undefined;
  }
  const normalized = value.trim().toLowerCase();
  if (
    normalized === 'secondary' ||
    normalized === 'warning' ||
    normalized === 'success' ||
    normalized === 'destructive' ||
    normalized === 'primary'
  ) {
    return normalized;
  }
  return undefined;
};

const normalizeModuleStages = (
  module: WorkflowModuleKey,
  source: unknown,
): WorkflowStageDefinition[] => {
  const defaultStages = buildDefaultStages(module);
  const inputStages =
    source &&
    typeof source === 'object' &&
    !Array.isArray(source) &&
    Array.isArray((source as { stages?: unknown[] }).stages)
      ? ((source as { stages: unknown[] }).stages ?? [])
      : [];

  const stageMap = new Map<string, WorkflowStageDefinition>();
  const orderedStages: WorkflowStageDefinition[] = [];

  inputStages.forEach((stage, index) => {
    if (!stage || typeof stage !== 'object' || Array.isArray(stage)) {
      return;
    }

    const candidate = stage as Record<string, unknown>;
    const rawLabel = String(candidate.label ?? '').trim();
    const keySource = String(candidate.key ?? candidate.label ?? '').trim();
    let baseStatus = normalizeWorkflowBaseStatus(module, candidate.baseStatus);

    if (!rawLabel) {
      return;
    }
    if (!baseStatus || !WORKFLOW_BASE_STATUS_OPTIONS[module].includes(baseStatus)) {
      throw new BadRequestError(`Invalid base status "${candidate.baseStatus}" for ${module}.`);
    }

    const key = normalizeWorkflowStageKeyForBase(module, keySource, baseStatus);
    if (!key) {
      throw new BadRequestError(`Workflow stage key is invalid for ${module}.`);
    }
    if (isPlatformStageKey(module, key)) {
      // Platform anchor stages may be renamed, but they must keep their own base status
      // so lifecycle logic, reporting, and automation remain stable.
      baseStatus = key;
    }
    if (stageMap.has(key)) {
      return;
    }
    const label = normalizeLegacyStageLabel(module, baseStatus, key, rawLabel);

    const normalizedStage: WorkflowStageDefinition = {
      key,
      label,
      baseStatus,
      colorTone: normalizeStageColorTone(candidate.colorTone) ?? DEFAULT_STAGE_TONES[baseStatus] ?? 'primary',
      sortOrder:
        typeof candidate.sortOrder === 'number' && Number.isFinite(candidate.sortOrder)
          ? candidate.sortOrder
          : index,
      terminal:
        typeof candidate.terminal === 'boolean'
          ? candidate.terminal
          : TERMINAL_STATUSES.has(baseStatus),
    };

    stageMap.set(key, normalizedStage);
    orderedStages.push(normalizedStage);
  });

  defaultStages.forEach((stage) => {
    const hasBaseStage = orderedStages.some((item) => item.baseStatus === stage.baseStatus);
    if (!hasBaseStage) {
      orderedStages.push({
        ...stage,
        sortOrder: orderedStages.length,
      });
    }
  });

  return orderedStages
    .sort((a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label))
    .map((stage, index) => ({ ...stage, sortOrder: index }));
};

export const normalizeTenantWorkflowConfig = (value: unknown): TenantWorkflowConfig => {
  const source =
    value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};

  return WORKFLOW_MODULE_KEYS.reduce((acc, module) => {
    acc[module] = {
      stages: normalizeModuleStages(module, source[module]),
    };
    return acc;
  }, {} as TenantWorkflowConfig);
};

export const sanitizeTenantWorkflowConfigInput = (value: unknown) => {
  if (value == null) {
    return undefined;
  }
  if (typeof value !== 'object' || Array.isArray(value)) {
    throw new BadRequestError('Workflow configuration must be an object.');
  }
  return normalizeTenantWorkflowConfig(value);
};

const findRemovedCustomWorkflowStages = (
  currentConfig: TenantWorkflowConfig,
  nextConfig: TenantWorkflowConfig,
) =>
  WORKFLOW_MODULE_KEYS.flatMap((module) => {
    const nextStageKeys = new Set(nextConfig[module].stages.map((stage) => stage.key));
    return currentConfig[module].stages
      .filter((stage) => stage.key !== stage.baseStatus)
      .filter((stage) => !nextStageKeys.has(stage.key))
      .map((stage) => ({ ...stage, module }));
  });

const getWorkflowStageUsageCount = async (
  tenantId: string,
  module: WorkflowModuleKey,
  stageKeys: string[],
) => {
  if (stageKeys.length === 0) {
    return new Map<string, number>();
  }

  const repo =
    module === 'jobs'
      ? AppDataSource.getRepository(Job)
      : module === 'quotes'
        ? AppDataSource.getRepository(Quote)
        : AppDataSource.getRepository(Invoice);

  const rows = await repo
    .createQueryBuilder('record')
    .select('record.workflowStageKey', 'workflowStageKey')
    .addSelect('COUNT(*)', 'usageCount')
    .where('record.tenantId = :tenantId', { tenantId })
    .andWhere('record.isDeleted = false')
    .andWhere('record.workflowStageKey IN (:...stageKeys)', { stageKeys })
    .groupBy('record.workflowStageKey')
    .getRawMany<{ workflowStageKey: string; usageCount: string }>();

  return new Map(rows.map((row) => [row.workflowStageKey, Number(row.usageCount)]));
};

export const assertRemovedWorkflowStagesNotInUse = async (params: {
  tenantId: string;
  currentConfig: TenantWorkflowConfig;
  nextConfig: TenantWorkflowConfig;
}) => {
  const removedStages = findRemovedCustomWorkflowStages(
    params.currentConfig,
    params.nextConfig,
  );

  for (const module of WORKFLOW_MODULE_KEYS) {
    const removedModuleStages = removedStages.filter((stage) => stage.module === module);
    if (removedModuleStages.length === 0) {
      continue;
    }

    const usageByStageKey = await getWorkflowStageUsageCount(
      params.tenantId,
      module,
      removedModuleStages.map((stage) => stage.key),
    );

    const blockedStage = removedModuleStages.find(
      (stage) => (usageByStageKey.get(stage.key) ?? 0) > 0,
    );

    if (!blockedStage) {
      continue;
    }

    const usageCount = usageByStageKey.get(blockedStage.key) ?? 0;
    const recordLabel = usageCount === 1 ? 'record' : 'records';
    throw new BadRequestError(
      `Cannot remove workflow stage "${blockedStage.label}" from ${WORKFLOW_MODULE_LABELS[module]}. It is currently used by ${usageCount} ${recordLabel}. Move those records to another status first.`,
    );
  }
};

export const buildWorkflowStageUsageSummary = async (
  tenantId: string,
  config: TenantWorkflowConfig,
): Promise<WorkflowStageUsageSummary> => {
  const summary: WorkflowStageUsageSummary = {
    jobs: {},
    quotes: {},
    invoices: {},
  };

  for (const module of WORKFLOW_MODULE_KEYS) {
    const customStageKeys = config[module].stages
      .filter((stage) => stage.key !== stage.baseStatus)
      .map((stage) => stage.key);

    if (customStageKeys.length === 0) {
      continue;
    }

    const usageByStageKey = await getWorkflowStageUsageCount(tenantId, module, customStageKeys);
    customStageKeys.forEach((stageKey) => {
      summary[module][stageKey] = usageByStageKey.get(stageKey) ?? 0;
    });
  }

  return summary;
};

export const loadTenantWorkflowConfig = async (tenantId: string) => {
  const repo = AppDataSource.getRepository(Tenant);
  const tenant = await repo.findOne({
    where: { id: tenantId, isDeleted: false },
    select: ['id', 'workflowConfig'],
  });
  if (!tenant) {
    throw new NotFoundError('Tenant not found');
  }
  return normalizeTenantWorkflowConfig(tenant.workflowConfig);
};

export const findWorkflowStage = (
  config: TenantWorkflowConfig,
  module: WorkflowModuleKey,
  stageKey: string | null | undefined,
) => {
  const normalizedKey = normalizeStageKey(String(stageKey ?? ''));
  if (!normalizedKey) {
    return null;
  }
  return config[module].stages.find((stage) => stage.key === normalizedKey) ?? null;
};

export const getDefaultWorkflowStageForStatus = (
  config: TenantWorkflowConfig,
  module: WorkflowModuleKey,
  baseStatus: string | null | undefined,
) => {
  const normalizedStatus = String(baseStatus ?? '').trim().toUpperCase();
  if (!normalizedStatus) {
    return null;
  }
  return config[module].stages.find((stage) => stage.baseStatus === normalizedStatus) ?? null;
};

export const formatWorkflowBaseStatusLabel = (
  module: WorkflowModuleKey,
  baseStatus: string | null | undefined,
) => {
  const normalizedStatus = String(baseStatus ?? '').trim().toUpperCase();
  if (!normalizedStatus) {
    return '';
  }

  const stage = getDefaultWorkflowStageForStatus(
    DEFAULT_TENANT_WORKFLOW_CONFIG,
    module,
    normalizedStatus,
  );
  return stage?.label ?? formatFallbackStatusLabel(normalizedStatus);
};

export const getWorkflowDisplayState = (params: {
  config: TenantWorkflowConfig;
  module: WorkflowModuleKey;
  baseStatus: string | null | undefined;
  workflowStageKey?: string | null | undefined;
  enabled: boolean;
}) => {
  const normalizedStatus = String(params.baseStatus ?? '').trim().toUpperCase();
  const stage = params.enabled
    ? findWorkflowStage(params.config, params.module, params.workflowStageKey)
    : null;
  const workflowBaseStatus = stage?.baseStatus ?? normalizedStatus;
  const workflowBaseStatusLabel = formatWorkflowBaseStatusLabel(
    params.module,
    workflowBaseStatus,
  );

  return {
    workflowBaseStatus: workflowBaseStatus || undefined,
    workflowBaseStatusLabel,
    workflowStatusLabel: stage?.label ?? formatWorkflowBaseStatusLabel(params.module, normalizedStatus),
  };
};

export const resolveWorkflowStageKeyForRecord = async (params: {
  tenantId: string;
  module: WorkflowModuleKey;
  baseStatus: string | null | undefined;
  requestedStageKey?: string | null | undefined;
  currentStageKey?: string | null | undefined;
  featureEnabled?: boolean;
}) => {
  if (params.featureEnabled === false) {
    return undefined;
  }

  const config = await loadTenantWorkflowConfig(params.tenantId);
  const normalizedStatus = String(params.baseStatus ?? '').trim().toUpperCase();
  if (!normalizedStatus) {
    return undefined;
  }

  if (params.requestedStageKey) {
    const requestedStage = findWorkflowStage(config, params.module, params.requestedStageKey);
    if (!requestedStage) {
      throw new BadRequestError(`Workflow stage "${params.requestedStageKey}" is not configured.`);
    }
    if (requestedStage.baseStatus !== normalizedStatus) {
      throw new BadRequestError(
        `Workflow stage "${requestedStage.label}" does not belong to status "${normalizedStatus}".`,
      );
    }
    return requestedStage.key;
  }

  if (params.currentStageKey) {
    const currentStage = findWorkflowStage(config, params.module, params.currentStageKey);
    if (currentStage?.baseStatus === normalizedStatus) {
      return currentStage.key;
    }
  }

  return getDefaultWorkflowStageForStatus(config, params.module, normalizedStatus)?.key;
};

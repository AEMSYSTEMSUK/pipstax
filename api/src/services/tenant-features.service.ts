import { AppDataSource } from '../config/data-source';
import { Tenant } from '../entities/tenant.entity';
import { BadRequestError, NotFoundError } from '../utils/errors';

export const TENANT_FEATURE_KEYS = [
  'sites',
  'complianceReports',
  'renewals',
  'splitInvoicing',
  'complianceWorkflows',
  'plannerNotes',
  'siteScopedPortal',
] as const;

export type TenantFeatureKey = (typeof TENANT_FEATURE_KEYS)[number];

export type TenantFeatureFlags = Record<TenantFeatureKey, boolean>;

export const DEFAULT_TENANT_FEATURE_FLAGS: TenantFeatureFlags = {
  sites: false,
  complianceReports: false,
  renewals: false,
  splitInvoicing: false,
  complianceWorkflows: false,
  plannerNotes: false,
  siteScopedPortal: false,
};

export const normalizeTenantFeatureFlags = (value: unknown): TenantFeatureFlags => {
  const source =
    value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};

  return TENANT_FEATURE_KEYS.reduce((acc, key) => {
    acc[key] = source[key] === true;
    return acc;
  }, { ...DEFAULT_TENANT_FEATURE_FLAGS });
};

export const sanitizeTenantFeatureFlagsInput = (value: unknown) => {
  if (value == null) {
    return undefined;
  }
  if (typeof value !== 'object' || Array.isArray(value)) {
    throw new BadRequestError('Feature flags must be an object.');
  }

  const source = value as Record<string, unknown>;
  const nextFlags = { ...DEFAULT_TENANT_FEATURE_FLAGS };

  for (const key of Object.keys(source)) {
    if (!TENANT_FEATURE_KEYS.includes(key as TenantFeatureKey)) {
      continue;
    }
    nextFlags[key as TenantFeatureKey] = source[key] === true;
  }

  return nextFlags;
};

export const isTenantFeatureEnabled = (
  tenantOrFlags: Pick<Tenant, 'featureFlags'> | TenantFeatureFlags | null | undefined,
  feature: TenantFeatureKey,
) => {
  const flags =
    tenantOrFlags && 'featureFlags' in tenantOrFlags
      ? normalizeTenantFeatureFlags(tenantOrFlags.featureFlags)
      : normalizeTenantFeatureFlags(tenantOrFlags);
  return flags[feature] === true;
};

export const loadTenantFeatureFlags = async (tenantId: string) => {
  const repo = AppDataSource.getRepository(Tenant);
  const tenant = await repo.findOne({
    where: { id: tenantId, isDeleted: false },
    select: ['id', 'featureFlags'],
  });
  if (!tenant) {
    throw new NotFoundError('Tenant not found');
  }
  return normalizeTenantFeatureFlags(tenant.featureFlags);
};

export const assertTenantFeatureEnabled = async (
  tenantId: string,
  feature: TenantFeatureKey,
  message?: string,
) => {
  const flags = await loadTenantFeatureFlags(tenantId);
  if (!flags[feature]) {
    throw new BadRequestError(message ?? `Feature "${feature}" is not enabled for this tenant.`);
  }
  return flags;
};

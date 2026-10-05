export const TENANT_FEATURE_KEYS = [
    "sites",
    "complianceReports",
    "renewals",
    "splitInvoicing",
    "complianceWorkflows",
    "plannerNotes",
    "siteScopedPortal",
] as const

export type TenantFeatureKey = (typeof TENANT_FEATURE_KEYS)[number]

export type TenantFeatureFlags = Record<TenantFeatureKey, boolean>

export const DEFAULT_TENANT_FEATURE_FLAGS: TenantFeatureFlags = {
    sites: false,
    complianceReports: false,
    renewals: false,
    splitInvoicing: false,
    complianceWorkflows: false,
    plannerNotes: false,
    siteScopedPortal: false,
}

export const normalizeTenantFeatureFlags = (value: unknown): TenantFeatureFlags => {
    const source =
        value && typeof value === "object" && !Array.isArray(value)
            ? (value as Record<string, unknown>)
            : {}

    return TENANT_FEATURE_KEYS.reduce((acc, key) => {
        acc[key] = source[key] === true
        return acc
    }, { ...DEFAULT_TENANT_FEATURE_FLAGS })
}

export const isTenantFeatureEnabled = (
    flags: TenantFeatureFlags | null | undefined,
    feature: TenantFeatureKey
) => Boolean(flags?.[feature])

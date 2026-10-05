import { formatInvoiceStatus, formatJobStatus, formatQuoteStatus } from "@/lib/status"

export const WORKFLOW_MODULE_KEYS = ["jobs", "quotes", "invoices"] as const
export type WorkflowModuleKey = (typeof WORKFLOW_MODULE_KEYS)[number]

export type WorkflowStageColorTone = "secondary" | "warning" | "success" | "destructive" | "primary"

export type WorkflowStageDefinition = {
    key: string
    label: string
    baseStatus: string
    colorTone?: WorkflowStageColorTone
    sortOrder: number
    terminal: boolean
}

export type TenantWorkflowConfig = Record<WorkflowModuleKey, { stages: WorkflowStageDefinition[] }>

export const WORKFLOW_BASE_STATUS_OPTIONS: Record<WorkflowModuleKey, string[]> = {
    jobs: ["NOT_ASSIGNED", "ASSIGNED", "LIVE", "REQUIRES_FOLLOW_UP", "FINISHED", "COMPLETED"],
    quotes: ["DRAFT", "SENT", "VIEWED", "SIGNED", "DECLINED"],
    invoices: ["DRAFT", "SENT", "VIEWED", "OVERDUE", "PAID", "VOID"],
}

export const WORKFLOW_MODULE_LABELS: Record<WorkflowModuleKey, string> = {
    jobs: "Jobs",
    quotes: "Quotes",
    invoices: "Invoices",
}

const DEFAULT_STAGE_TONES: Record<string, WorkflowStageColorTone> = {
    NOT_ASSIGNED: "secondary",
    ASSIGNED: "primary",
    LIVE: "warning",
    REQUIRES_FOLLOW_UP: "destructive",
    FINISHED: "primary",
    COMPLETED: "success",
    CANCELLED: "destructive",
    DRAFT: "secondary",
    SENT: "warning",
    VIEWED: "primary",
    SIGNED: "success",
    DECLINED: "destructive",
    OVERDUE: "destructive",
    PAID: "success",
    VOID: "destructive",
}

const TERMINAL_STATUSES = new Set(["COMPLETED", "CANCELLED", "SIGNED", "DECLINED", "PAID", "VOID"])

const toTitleCase = (value: string) =>
    value
        .toLowerCase()
        .split(" ")
        .filter(Boolean)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(" ")

const normalizeStageKey = (value: string) =>
    value
        .trim()
        .replace(/[^A-Za-z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "")
        .toUpperCase()

const formatStageStatusText = (status: string) => (status === "SIGNED" ? "Accepted" : status.replace(/_/g, " "))
const formatWorkflowStageLabel = (status: string) =>
    status === "COMPLETED" ? "Closed" : status === "REQUIRES_FOLLOW_UP" ? "Needs Attention" : toTitleCase(formatStageStatusText(status))

const normalizeLegacyStageLabel = (module: WorkflowModuleKey, baseStatus: string, key: string, label: string) =>
    module === "quotes" && baseStatus === "SIGNED" && key === "SIGNED" && label === "Signed"
        ? "Accepted"
        : module === "jobs" && baseStatus === "COMPLETED" && key === "COMPLETED" && label === "Completed"
            ? "Closed"
            : module === "jobs" && baseStatus === "NOT_ASSIGNED" && key === "NOT_ASSIGNED"
                ? "Not Assigned"
                : module === "jobs" && baseStatus === "LIVE" && key === "LIVE"
                    ? "Live"
                    : module === "jobs" && baseStatus === "REQUIRES_FOLLOW_UP" && key === "REQUIRES_FOLLOW_UP"
                        ? "Needs Attention"
                    : module === "jobs" && baseStatus === "FINISHED" && key === "FINISHED"
                        ? "Finished"
                        : label

const normalizeWorkflowBaseStatus = (module: WorkflowModuleKey, value: unknown) => {
    const normalized = String(value ?? "").trim().toUpperCase()
    if (module === "jobs") {
        if (["CREATED", "SCHEDULED", "CANCELLED"].includes(normalized)) return "NOT_ASSIGNED"
        if (["EN_ROUTE", "ON_SITE"].includes(normalized)) return "LIVE"
        if (normalized === "REQUIRES_FOLLOW_UP") return "REQUIRES_FOLLOW_UP"
    }
    return normalized
}

const normalizeWorkflowStageKeyForBase = (module: WorkflowModuleKey, value: string, baseStatus: string) => {
    const normalized = normalizeStageKey(value)
    if (module !== "jobs") return normalized
    if (["CREATED", "SCHEDULED", "CANCELLED"].includes(normalized)) return "NOT_ASSIGNED"
    if (["EN_ROUTE", "ON_SITE"].includes(normalized)) return "LIVE"
    if (normalized === "REQUIRES_FOLLOW_UP") return "REQUIRES_FOLLOW_UP"
    return normalized || baseStatus
}

export const isPlatformWorkflowStage = (module: WorkflowModuleKey, key: string) =>
    WORKFLOW_BASE_STATUS_OPTIONS[module].includes(key)

const buildDefaultStages = (module: WorkflowModuleKey): WorkflowStageDefinition[] =>
    WORKFLOW_BASE_STATUS_OPTIONS[module].map((status, index) => ({
        key: status,
        label: formatWorkflowStageLabel(status),
        baseStatus: status,
        colorTone: DEFAULT_STAGE_TONES[status] ?? "primary",
        sortOrder: index,
        terminal: TERMINAL_STATUSES.has(status),
    }))

export const DEFAULT_TENANT_WORKFLOW_CONFIG: TenantWorkflowConfig = {
    jobs: { stages: buildDefaultStages("jobs") },
    quotes: { stages: buildDefaultStages("quotes") },
    invoices: { stages: buildDefaultStages("invoices") },
}

export const normalizeTenantWorkflowConfig = (value: unknown): TenantWorkflowConfig => {
    const source =
        value && typeof value === "object" && !Array.isArray(value)
            ? (value as Record<string, unknown>)
            : {}

    return WORKFLOW_MODULE_KEYS.reduce((acc, module) => {
        const defaults = buildDefaultStages(module)
        const incoming =
            source[module] &&
            typeof source[module] === "object" &&
            !Array.isArray(source[module]) &&
            Array.isArray((source[module] as { stages?: unknown[] }).stages)
                ? ((source[module] as { stages: unknown[] }).stages ?? [])
                : []

        const stages: WorkflowStageDefinition[] = []
        const existingKeys = new Set<string>()

        incoming.forEach((stage, index) => {
            if (!stage || typeof stage !== "object" || Array.isArray(stage)) return
            const candidate = stage as Record<string, unknown>
            const rawLabel = String(candidate.label ?? "").trim()
            let baseStatus = normalizeWorkflowBaseStatus(module, candidate.baseStatus)
            const key = normalizeWorkflowStageKeyForBase(module, String(candidate.key ?? candidate.label ?? ""), baseStatus)
            if (isPlatformWorkflowStage(module, key)) {
                baseStatus = key
            }
            const label = normalizeLegacyStageLabel(module, baseStatus, key, rawLabel)
            if (!rawLabel || !baseStatus || !WORKFLOW_BASE_STATUS_OPTIONS[module].includes(baseStatus) || !key || existingKeys.has(key)) {
                return
            }
            existingKeys.add(key)
            stages.push({
                key,
                label,
                baseStatus,
                colorTone: typeof candidate.colorTone === "string" ? (candidate.colorTone as WorkflowStageColorTone) : DEFAULT_STAGE_TONES[baseStatus] ?? "primary",
                sortOrder: typeof candidate.sortOrder === "number" ? candidate.sortOrder : index,
                terminal: typeof candidate.terminal === "boolean" ? candidate.terminal : TERMINAL_STATUSES.has(baseStatus),
            })
        })

        defaults.forEach((stage) => {
            if (!stages.some((item) => item.baseStatus === stage.baseStatus)) {
                stages.push({ ...stage, sortOrder: stages.length })
            }
        })

        acc[module] = {
            stages: stages
                .sort((a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label))
                .map((stage, index) => ({ ...stage, sortOrder: index })),
        }
        return acc
    }, {} as TenantWorkflowConfig)
}

export const findWorkflowStage = (
    config: TenantWorkflowConfig | null | undefined,
    module: WorkflowModuleKey,
    workflowStageKey: string | null | undefined
) => {
    const normalizedKey = normalizeStageKey(String(workflowStageKey ?? ""))
    if (!normalizedKey) return null
    return (config ?? DEFAULT_TENANT_WORKFLOW_CONFIG)[module].stages.find((stage) => stage.key === normalizedKey) ?? null
}

export const getWorkflowStatusLabel = (
    module: WorkflowModuleKey,
    status: string | null | undefined,
    workflowStageKey: string | null | undefined,
    workflowConfig: TenantWorkflowConfig | null | undefined,
    enabled: boolean
) => {
    if (enabled) {
        const stage = findWorkflowStage(workflowConfig, module, workflowStageKey)
        if (stage?.label) {
            return stage.label
        }
    }

    switch (module) {
        case "jobs":
            return formatJobStatus(status)
        case "quotes":
            return formatQuoteStatus(status)
        case "invoices":
            return formatInvoiceStatus(status)
        default:
            return String(status ?? "")
    }
}

export const getWorkflowStageOptions = (
    module: WorkflowModuleKey,
    workflowConfig: TenantWorkflowConfig | null | undefined
) => (workflowConfig ?? DEFAULT_TENANT_WORKFLOW_CONFIG)[module].stages

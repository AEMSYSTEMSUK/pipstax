"use client"

import { useEffect, useState } from "react"
import { PageContainer } from "@/components/layout/PageContainer"
import { GlassCard, GlassCardContent, GlassCardHeader, GlassCardTitle, GlassCardDescription, GlassCardFooter } from "@/components/glass/GlassCard"
import { GlassModal } from "@/components/glass/GlassModal"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Switch } from "@/components/ui/switch"
import { Building2, CalendarDays, Palette, Users, Link as LinkIcon, Save, Settings, ShieldCheck, Plus, HardDrive, Trash2 } from "lucide-react"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { StatusBadge } from "@/components/shared/StatusBadge"
import { AddressFields, emptyAddressValue, formatAddressValue, parseAddressValue, PhoneInput } from "@/components/shared/LocalizedFields"
import { apiGet, apiPost, apiPut, apiRequest } from "@/lib/api"
import { getEffectivePermissions } from "@/lib/auth"
import { useToast } from "@/components/ui/toast"
import { DEFAULT_TENANT_FEATURE_FLAGS, TenantFeatureKey, normalizeTenantFeatureFlags } from "@/lib/tenant-features"
import { DEFAULT_TENANT_WORKFLOW_CONFIG, TenantWorkflowConfig, WorkflowModuleKey, WORKFLOW_BASE_STATUS_OPTIONS, WORKFLOW_MODULE_LABELS, isPlatformWorkflowStage, normalizeTenantWorkflowConfig } from "@/lib/workflows"
import { SquarePen } from "lucide-react"
import { useSearchParams } from "next/navigation"
import { useUrlSyncedTab } from "@/components/shared/useUrlSyncedTab"

const formatStageStatusText = (status: string) => status.replace(/_/g, " ")
const EMPTY_WORKFLOW_STAGE_USAGE = {
    jobs: {},
    quotes: {},
    invoices: {},
}
const SETTINGS_TABS = ["company", "branding", "modules", "planner", "sync", "rbac", "integrations"]

type PlannerSettings = {
    workingDays: number[]
    usePublicHolidays: boolean
    holidayCountryCode: string
    holidaySubdivisionCode?: string | null
    includeRegionalHolidays: boolean
    customHolidays: Array<{ date: string; title: string }>
}

const DEFAULT_PLANNER_SETTINGS: PlannerSettings = {
    workingDays: [1, 2, 3, 4, 5],
    usePublicHolidays: true,
    holidayCountryCode: "GB",
    holidaySubdivisionCode: null,
    includeRegionalHolidays: true,
    customHolidays: [],
}

const plannerWeekdays = [
    { value: 1, label: "Mon" },
    { value: 2, label: "Tue" },
    { value: 3, label: "Wed" },
    { value: 4, label: "Thu" },
    { value: 5, label: "Fri" },
    { value: 6, label: "Sat" },
    { value: 0, label: "Sun" },
]

const holidayCountries = [
    { value: "GB", label: "United Kingdom" },
    { value: "AT", label: "Austria" },
    { value: "IE", label: "Ireland" },
    { value: "US", label: "United States" },
    { value: "CA", label: "Canada" },
    { value: "AU", label: "Australia" },
    { value: "IN", label: "India" },
    { value: "DE", label: "Germany" },
    { value: "FR", label: "France" },
    { value: "ES", label: "Spain" },
    { value: "IT", label: "Italy" },
    { value: "NL", label: "Netherlands" },
]

export default function ClientSettingsPage() {
    const searchParams = useSearchParams()
    const [activeTab, setActiveTab] = useUrlSyncedTab({
        defaultTab: "company",
        allowedTabs: SETTINGS_TABS,
    })
    const [tenant, setTenant] = useState<any>({
        name: "",
        tradingName: "",
        address: "",
        contactEmail: "",
        contactPhone: "",
        defaultHourlyRate: "",
        logoUrl: "",
        emailHeaderLogoUrl: "",
        primaryColor: "#0E8585",
        accountingProvider: "",
        featureFlags: DEFAULT_TENANT_FEATURE_FLAGS,
        workflowConfig: DEFAULT_TENANT_WORKFLOW_CONFIG,
        workflowStageUsage: EMPTY_WORKFLOW_STAGE_USAGE,
    })
    const [tenantAddress, setTenantAddress] = useState(emptyAddressValue())
    const [roles, setRoles] = useState<any[]>([])
    const [selectedRoleId, setSelectedRoleId] = useState<string>("")
    const [rolePermissions, setRolePermissions] = useState<Record<string, boolean>>({})
    const [integrations, setIntegrations] = useState<any[]>([])
    const [integrationBusy, setIntegrationBusy] = useState<string | null>(null)
    const [newRoleOpen, setNewRoleOpen] = useState(false)
    const [newRoleName, setNewRoleName] = useState("")
    const [newRoleCode, setNewRoleCode] = useState("")
    const [newRoleError, setNewRoleError] = useState<string | null>(null)
    const [logoFile, setLogoFile] = useState<File | null>(null)
    const [emailLogoFile, setEmailLogoFile] = useState<File | null>(null)
    const [isUploadingLogo, setIsUploadingLogo] = useState(false)
    const [isUploadingEmailLogo, setIsUploadingEmailLogo] = useState(false)
    const [addStageOpen, setAddStageOpen] = useState(false)
    const [addStageModule, setAddStageModule] = useState<WorkflowModuleKey>("jobs")
    const [addStageForm, setAddStageForm] = useState({
        label: "",
        baseStatus: WORKFLOW_BASE_STATUS_OPTIONS.jobs[0],
    })
    const [addStageError, setAddStageError] = useState<string | null>(null)
    const [editStageOpen, setEditStageOpen] = useState(false)
    const [editStageModule, setEditStageModule] = useState<WorkflowModuleKey>("jobs")
    const [editStageKey, setEditStageKey] = useState<string>("")
    const [editStageForm, setEditStageForm] = useState({
        label: "",
        baseStatus: WORKFLOW_BASE_STATUS_OPTIONS.jobs[0],
    })
    const [editStageError, setEditStageError] = useState<string | null>(null)
    const [deleteStageOpen, setDeleteStageOpen] = useState(false)
    const [deleteStageModule, setDeleteStageModule] = useState<WorkflowModuleKey>("jobs")
    const [deleteStageKey, setDeleteStageKey] = useState<string>("")
    const [deleteStageLabel, setDeleteStageLabel] = useState<string>("")
    const [deleteStageBaseStatus, setDeleteStageBaseStatus] = useState<string>(WORKFLOW_BASE_STATUS_OPTIONS.jobs[0])
    const [plannerSettings, setPlannerSettings] = useState<PlannerSettings>(DEFAULT_PLANNER_SETTINGS)
    const [plannerSettingsSaving, setPlannerSettingsSaving] = useState(false)
    const [newHoliday, setNewHoliday] = useState({ date: "", title: "" })

    useEffect(() => {
        if (searchParams.get("create") === "role") {
            setActiveTab("rbac")
            setNewRoleOpen(true)
        }
    }, [searchParams, setActiveTab])
    const [deleteStageUsageCount, setDeleteStageUsageCount] = useState<number>(0)
    const [isWorkflowOverlaySaving, setIsWorkflowOverlaySaving] = useState(false)
    const { toast } = useToast()
    const permissions = getEffectivePermissions() ?? {}
    const canManageSettings = Boolean(permissions["settings.manage"])
    const canViewSettings = Boolean(permissions["settings.view"] || canManageSettings)
    const excludedRoleCodes = new Set(["CUSTOMER", "FIELD_WORKER", "SUB_CONTRACTOR"])

    useEffect(() => {
        if (typeof window === "undefined") return
        const params = new URLSearchParams(window.location.search)
        const status = params.get("integrationStatus")
        const provider = params.get("integrationProvider")
        const message = params.get("integrationMessage")
        if (status && provider) {
            toast({
                title: status === "connected" ? "Integration Connected" : "Integration Error",
                description: message ?? (status === "connected" ? `${provider} connected.` : `Failed to connect ${provider}.`),
                variant: status === "connected" ? "success" : "error",
            })
            params.delete("integrationStatus")
            params.delete("integrationProvider")
            params.delete("integrationMessage")
            const nextQuery = params.toString()
            const nextUrl = `${window.location.pathname}${nextQuery ? `?${nextQuery}` : ""}`
            window.history.replaceState({}, "", nextUrl)
        }
    }, [toast])

    useEffect(() => {
        const load = async () => {
            try {
                const [tenantRes, roleRes, integrationRes, plannerSettingsRes] = await Promise.all([
                    apiGet<any>("/settings/tenant"),
                    apiGet<any[]>("/settings/roles"),
                    apiGet<any[]>("/integrations"),
                    apiGet<PlannerSettings>("/planner-notes/settings").catch(() => ({ data: DEFAULT_PLANNER_SETTINGS })),
                ])
                const nextTenant = {
                    ...tenantRes.data,
                    featureFlags: normalizeTenantFeatureFlags(tenantRes.data?.featureFlags),
                    workflowConfig: normalizeTenantWorkflowConfig(tenantRes.data?.workflowConfig),
                    workflowStageUsage: tenantRes.data?.workflowStageUsage ?? EMPTY_WORKFLOW_STAGE_USAGE,
                }
                setTenant(nextTenant)
                setTenantAddress(parseAddressValue(nextTenant.address))
                setRoles(roleRes.data || [])
                const roleList = (roleRes.data || []).filter((role) => !excludedRoleCodes.has((role.code ?? "").toString().toUpperCase()))
                if (roleList.length > 0) {
                    setSelectedRoleId(roleList[0].id)
                    setRolePermissions(roleList[0].permissions || {})
                }
                setIntegrations(integrationRes.data || [])
                setPlannerSettings(plannerSettingsRes.data ?? DEFAULT_PLANNER_SETTINGS)
            } catch {
                // ignore
            }
        }
        load()
    }, [])

    const permissionRows = [
        { label: "CRM Leads Pipeline", view: "crm.view", manage: "crm.manage" },
        { label: "Scheduling & Dispatch", view: "scheduling.view", manage: "scheduling.manage" },
        { label: "Sub-Contractors", view: "subcontractors.view", manage: "subcontractors.manage" },
        { label: "Quotes", view: "quotes.view", manage: "quotes.manage" },
        { label: "Financials", view: "financials.view", manage: "financials.manage" },
        { label: "Documents", view: "documents.view", manage: "documents.manage" },
        { label: "Support", view: "support.view", manage: "support.manage" },
        { label: "Reports", view: "reports.view", manage: "reports.manage" },
        { label: "Employees", view: "team.view", manage: "team.manage" },
        { label: "Settings", view: "settings.view", manage: "settings.manage" },
        { label: "HR & Payroll", view: "hr.view", manage: "hr.manage" }
    ]

    const visibleRoles = roles.filter((role) => !excludedRoleCodes.has((role.code ?? "").toString().toUpperCase()))
    const featureFlagRows: Array<{ key: TenantFeatureKey; label: string; description: string }> = [
        { key: "sites", label: "Sites", description: "Enable site-level operational structure under customers." },
        { key: "complianceReports", label: "Compliance Reports", description: "Enable structured compliance report and certificate workflows." },
        { key: "renewals", label: "Tests Due / Renewals", description: "Enable renewal tracking and recurring compliance work visibility." },
        { key: "complianceWorkflows", label: "Compliance Workflow Overlay", description: "Enable compliance-stage overlays on top of standard workflows." },
        { key: "plannerNotes", label: "Planner Notes", description: "Enable non-job planner entries such as training and holiday blocks." },
    ]

    const integrationCatalog = [
        {
            provider: "XERO",
            name: "Xero Accounting",
            description: "Sync invoices, clients, and payments.",
            badgeClass: "bg-[#13B5EA]/10 border-[#13B5EA]/20 text-[#13B5EA]",
            badgeText: "Xero",
            type: "accounting"
        },
        {
            provider: "QUICKBOOKS",
            name: "QuickBooks Online",
            description: "Export invoices and payments to QuickBooks.",
            badgeClass: "bg-[#1FA463]/10 border-[#1FA463]/20 text-[#1FA463]",
            badgeText: "Qs",
            type: "accounting"
        },
        {
            provider: "GOOGLE_DRIVE",
            name: "Google Drive Workspace",
            description: "Backs up CRM attachments and documents.",
            badgeClass: "bg-blue-100 border-blue-200 text-blue-600",
            icon: <HardDrive className="h-5 w-5" />,
            type: "document"
        },
        {
            provider: "SHAREPOINT",
            name: "Microsoft SharePoint",
            description: "Mirror files and project documents.",
            badgeClass: "bg-indigo-100 border-indigo-200 text-indigo-600",
            icon: <HardDrive className="h-5 w-5" />,
            type: "document"
        }
    ]

    const effectiveAccountingProvider =
        tenant.accountingProvider || "QUICKBOOKS"

    const visibleIntegrationCatalog = integrationCatalog.filter((item) => {
        if (item.type !== "accounting") return true
        return item.provider === effectiveAccountingProvider
    })

    const getIntegration = (provider: string) => integrations.find((item) => item.provider === provider)

    const handleConnect = async (provider: string) => {
        try {
            setIntegrationBusy(provider)
            if (provider === "XERO" || provider === "QUICKBOOKS") {
                const returnUrl = `${window.location.origin}/admin/settings?tab=integrations`
                const res = await apiGet<{ authUrl: string }>(
                    `/integrations/accounting/${provider}/oauth/start?returnUrl=${encodeURIComponent(returnUrl)}`
                )
                window.location.href = res.data.authUrl
                return
            }
            const returnUrl = `${window.location.origin}/admin/settings?tab=integrations`
            const res = await apiGet<{ authUrl: string }>(`/integrations/${provider}/oauth/start?returnUrl=${encodeURIComponent(returnUrl)}`)
            window.location.href = res.data.authUrl
        } catch (error: any) {
            toast({
                title: "Connection Failed",
                description: error?.message ?? "Unable to start OAuth flow.",
                variant: "error"
            })
        } finally {
            setIntegrationBusy(null)
        }
    }

    const handleDisconnect = async (provider: string) => {
        try {
            setIntegrationBusy(provider)
            if (provider === "XERO" || provider === "QUICKBOOKS") {
                await apiPost<any>(`/integrations/accounting/${provider}/disconnect`, {})
                const [integrationRes, tenantRes] = await Promise.all([
                    apiGet<any[]>("/integrations"),
                    apiGet<any>("/settings/tenant")
                ])
                setIntegrations(integrationRes.data || [])
                setTenant((prev: any) => ({ ...prev, ...(tenantRes.data || {}) }))
                return
            }
            const res = await apiPost<any>(`/integrations/${provider}/disconnect`, {})
            setIntegrations((prev) => {
                const existing = prev.filter((item) => item.provider !== provider)
                return res.data ? [...existing, res.data] : existing
            })
        } finally {
            setIntegrationBusy(null)
        }
    }

    const syncTenantBrandMeta = (nextTenant: any) => {
        if (typeof window === "undefined") return
        const tenantId = localStorage.getItem("aem_tenant_id")
        if (!tenantId) return
        const payload = {
            tenantId,
            tradingName: nextTenant?.tradingName,
            name: nextTenant?.name,
            logoUrl: nextTenant?.logoUrl,
            primaryColor: nextTenant?.primaryColor
        }
        localStorage.setItem("aem_tenant_meta", JSON.stringify(payload))
        try {
            const workspacesRaw = localStorage.getItem("aem_workspaces")
            if (workspacesRaw) {
                const workspaces = JSON.parse(workspacesRaw) as Array<any>
                if (Array.isArray(workspaces)) {
                    const updated = workspaces.map((workspace) =>
                        workspace?.tenantId === tenantId
                            ? {
                                ...workspace,
                                tradingName: payload.tradingName ?? workspace.tradingName,
                                name: payload.name ?? workspace.name,
                                logoUrl: payload.logoUrl ?? workspace.logoUrl,
                                primaryColor: payload.primaryColor ?? workspace.primaryColor
                            }
                            : workspace
                    )
                    localStorage.setItem("aem_workspaces", JSON.stringify(updated))
                }
            }
        } catch {
            // ignore workspace cache errors
        }
        window.dispatchEvent(new CustomEvent("aem-tenant-brand-updated", { detail: payload }))
    }

    const syncTenantFeatureMeta = (nextTenant: any) => {
        if (typeof window === "undefined") return
        const nextFlags = normalizeTenantFeatureFlags(nextTenant?.featureFlags)
        localStorage.setItem("aem_tenant_features", JSON.stringify(nextFlags))
        window.dispatchEvent(new CustomEvent("aem-tenant-features-updated", { detail: { featureFlags: nextFlags } }))
    }

    const syncTenantWorkflowMeta = (nextTenant: any) => {
        if (typeof window === "undefined") return
        const nextWorkflowConfig = normalizeTenantWorkflowConfig(nextTenant?.workflowConfig)
        localStorage.setItem("aem_tenant_workflows", JSON.stringify(nextWorkflowConfig))
        window.dispatchEvent(new CustomEvent("aem-tenant-workflows-updated", { detail: { workflowConfig: nextWorkflowConfig } }))
    }

    const applyTenantModuleState = (nextTenant: any) => {
        setTenant((prev: any) => ({
            ...prev,
            ...nextTenant,
            featureFlags: normalizeTenantFeatureFlags(nextTenant?.featureFlags ?? prev.featureFlags),
            workflowConfig: normalizeTenantWorkflowConfig(nextTenant?.workflowConfig ?? prev.workflowConfig),
            workflowStageUsage: nextTenant?.workflowStageUsage ?? prev.workflowStageUsage ?? EMPTY_WORKFLOW_STAGE_USAGE,
        }))
    }

    const saveTenantSettings = async (successTitle: string) => {
        try {
            const res = await apiPut<any>("/settings/tenant", tenant)
            const nextTenant = res.data ?? tenant
            applyTenantModuleState(nextTenant)
            syncTenantBrandMeta(nextTenant)
            syncTenantFeatureMeta(nextTenant)
            syncTenantWorkflowMeta(nextTenant)
            toast({
                title: successTitle,
                description: "Workspace settings saved successfully.",
                variant: "success"
            })
        } catch (error: any) {
            toast({
                title: "Save failed",
                description: error?.message ?? "Unable to save workspace settings.",
                variant: "error"
            })
        }
    }

    const togglePlannerWorkingDay = (day: number) => {
        setPlannerSettings((prev) => {
            const workingDays = prev.workingDays.includes(day)
                ? prev.workingDays.filter((entry) => entry !== day)
                : [...prev.workingDays, day].sort((a, b) => a - b)
            return { ...prev, workingDays: workingDays.length > 0 ? workingDays : prev.workingDays }
        })
    }

    const addCustomHoliday = () => {
        const date = newHoliday.date.trim()
        const title = newHoliday.title.trim()
        if (!date || !title) {
            toast({ title: "Holiday needs date and title", variant: "error" })
            return
        }
        setPlannerSettings((prev) => ({
            ...prev,
            customHolidays: [
                ...prev.customHolidays.filter((holiday) => holiday.date !== date || holiday.title !== title),
                { date, title },
            ].sort((a, b) => a.date.localeCompare(b.date)),
        }))
        setNewHoliday({ date: "", title: "" })
    }

    const savePlannerSettings = async () => {
        setPlannerSettingsSaving(true)
        try {
            const response = await apiPut<PlannerSettings>("/planner-notes/settings", plannerSettings)
            setPlannerSettings(response.data ?? plannerSettings)
            toast({
                title: "Planner Settings Saved",
                description: "Working days and holiday settings have been updated.",
                variant: "success",
            })
        } catch (error: any) {
            toast({
                title: "Unable to Save Planner Settings",
                description: error?.message ?? "Please try again.",
                variant: "error",
            })
        } finally {
            setPlannerSettingsSaving(false)
        }
    }

    const uploadBrandAsset = async (file: File, type: "logo" | "emailLogo") => {
        const isLogo = type === "logo"
        try {
            if (isLogo) {
                setIsUploadingLogo(true)
            } else {
                setIsUploadingEmailLogo(true)
            }

            const formData = new FormData()
            formData.append("file", file)
            const uploadRes = await apiRequest<{ path?: string; url?: string }>("/settings/brand-assets", {
                method: "POST",
                body: formData
            })
            const filePath = uploadRes.data?.path ?? uploadRes.data?.url
            if (!filePath) {
                throw new Error("Upload path not received")
            }
            const payload = isLogo ? { logoUrl: filePath } : { emailHeaderLogoUrl: filePath }
            const saveRes = await apiPut<any>("/settings/tenant", payload)
            const nextTenant = {
                ...tenant,
                ...payload,
                ...(saveRes.data ?? {})
            }
            setTenant(nextTenant)
            syncTenantBrandMeta(nextTenant)
            if (isLogo) {
                setLogoFile(null)
            } else {
                setEmailLogoFile(null)
            }
            toast({
                title: isLogo ? "Logo uploaded" : "Email logo uploaded",
                description: "Asset uploaded and saved.",
                variant: "success"
            })
        } catch (error: any) {
            toast({
                title: "Upload failed",
                description: error?.message ?? "Failed to upload image.",
                variant: "error"
            })
        } finally {
            if (isLogo) {
                setIsUploadingLogo(false)
            } else {
                setIsUploadingEmailLogo(false)
            }
        }
    }

    const persistWorkflowOverlay = async (nextWorkflowConfig: TenantWorkflowConfig, successTitle: string) => {
        try {
            setIsWorkflowOverlaySaving(true)
            const payload = {
                featureFlags: normalizeTenantFeatureFlags(tenant.featureFlags),
                workflowConfig: normalizeTenantWorkflowConfig(nextWorkflowConfig),
            }
            const res = await apiPut<any>("/settings/tenant", payload)
            const nextTenant = {
                ...tenant,
                ...payload,
                ...(res.data ?? {}),
            }
            applyTenantModuleState(nextTenant)
            syncTenantFeatureMeta(nextTenant)
            syncTenantWorkflowMeta(nextTenant)
            toast({
                title: successTitle,
                description: "Workflow overlay settings saved successfully.",
                variant: "success",
            })
            return true
        } catch (error: any) {
            toast({
                title: "Save failed",
                description: error?.message ?? "Unable to save workflow overlay settings.",
                variant: "error",
            })
            return false
        } finally {
            setIsWorkflowOverlaySaving(false)
        }
    }

    const buildWorkflowConfigWithAddedStage = (module: WorkflowModuleKey, label: string, baseStatus: string) => {
        const workflowConfig = normalizeTenantWorkflowConfig(tenant.workflowConfig)
        const normalizedLabel = label.trim()
        return {
            ...workflowConfig,
            [module]: {
                stages: [
                    ...workflowConfig[module].stages,
                    {
                        key: `CUSTOM_${module.toUpperCase()}_${Date.now()}`,
                        label: normalizedLabel,
                        baseStatus,
                        colorTone: "primary",
                        sortOrder: workflowConfig[module].stages.length,
                        terminal: false,
                    },
                ],
            },
        }
    }

    const openAddStageModal = (module: WorkflowModuleKey) => {
        const workflowConfig = normalizeTenantWorkflowConfig(tenant.workflowConfig)
        const customStageCount = workflowConfig[module].stages.filter((stage) => stage.key !== stage.baseStatus).length + 1
        const defaultBaseStatus = WORKFLOW_BASE_STATUS_OPTIONS[module][0]
        setAddStageModule(module)
        setAddStageForm({
            label: `Custom ${WORKFLOW_MODULE_LABELS[module].slice(0, -1)} Stage ${customStageCount}`,
            baseStatus: defaultBaseStatus,
        })
        setAddStageError(null)
        setAddStageOpen(true)
    }

    const submitAddStage = async () => {
        const label = addStageForm.label.trim()
        if (!label) {
            setAddStageError("Stage label is required.")
            return
        }
        const nextWorkflowConfig = buildWorkflowConfigWithAddedStage(addStageModule, label, addStageForm.baseStatus)
        const saved = await persistWorkflowOverlay(nextWorkflowConfig, "Workflow stage added")
        if (!saved) return
        setAddStageOpen(false)
        setAddStageError(null)
    }

    const openEditStageModal = (module: WorkflowModuleKey, stage: { key: string; label: string; baseStatus: string }) => {
        setEditStageModule(module)
        setEditStageKey(stage.key)
        setEditStageForm({
            label: stage.label,
            baseStatus: stage.baseStatus,
        })
        setEditStageError(null)
        setEditStageOpen(true)
    }

    const submitEditStage = async () => {
        const label = editStageForm.label.trim()
        if (!label) {
            setEditStageError("Stage label is required.")
            return
        }
        const isPlatformStage = isPlatformWorkflowStage(editStageModule, editStageKey)
        const nextWorkflowConfig = updateWorkflowStage(editStageModule, editStageKey, {
            label,
            ...(isPlatformStage ? {} : { baseStatus: editStageForm.baseStatus }),
        })
        const saved = await persistWorkflowOverlay(nextWorkflowConfig, "Workflow stage updated")
        if (!saved) return
        setEditStageOpen(false)
        setEditStageError(null)
    }

    const updateWorkflowStage = (
        module: WorkflowModuleKey,
        key: string,
        updates: Partial<{ label: string; baseStatus: string }>
    ) => {
        const workflowConfig = normalizeTenantWorkflowConfig(tenant.workflowConfig)
        return {
            ...workflowConfig,
            [module]: {
                stages: workflowConfig[module].stages.map((stage) =>
                    stage.key === key
                        ? {
                            ...stage,
                            ...updates,
                        }
                        : stage
                ),
            },
        }
    }

    const removeWorkflowStage = async (module: WorkflowModuleKey, key: string) => {
        if (isPlatformWorkflowStage(module, key)) {
            toast({
                title: "Stage is protected",
                description: "Platform anchor stages can be renamed, but they cannot be removed.",
                variant: "error",
            })
            return
        }
        const workflowConfig = normalizeTenantWorkflowConfig(tenant.workflowConfig)
        const nextWorkflowConfig = {
            ...workflowConfig,
            [module]: {
                stages: workflowConfig[module].stages.filter((stage) => stage.key !== key),
            },
        }
        const saved = await persistWorkflowOverlay(nextWorkflowConfig, "Workflow stage removed")
        if (!saved) return
        setDeleteStageOpen(false)
        setDeleteStageKey("")
        setDeleteStageLabel("")
        setDeleteStageBaseStatus(WORKFLOW_BASE_STATUS_OPTIONS.jobs[0])
        setDeleteStageUsageCount(0)
    }

    const openDeleteStageModal = (module: WorkflowModuleKey, stage: { key: string; label: string; baseStatus: string }) => {
        const usageCount = Number(tenant?.workflowStageUsage?.[module]?.[stage.key] ?? 0)
        setDeleteStageModule(module)
        setDeleteStageKey(stage.key)
        setDeleteStageLabel(stage.label)
        setDeleteStageBaseStatus(stage.baseStatus)
        setDeleteStageUsageCount(usageCount)
        setDeleteStageOpen(true)
    }

    const isEditingPlatformStage = isPlatformWorkflowStage(editStageModule, editStageKey)

    return (
        <PageContainer>
            {!canViewSettings ? (
                <GlassCard>
                    <GlassCardHeader>
                        <GlassCardTitle>Workspace Settings</GlassCardTitle>
                        <GlassCardDescription>You do not have access to view settings.</GlassCardDescription>
                    </GlassCardHeader>
                </GlassCard>
            ) : (
            <>
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-foreground">Workspace Settings</h1>
                    <p className="text-muted-foreground mt-1 text-sm">Configure your brand, billing, integrations, and user permissions.</p>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
                <div className="md:col-span-3">
                    <GlassCard>
                        <GlassCardContent className="p-2 space-y-1">
                            <Button
                                variant={activeTab === "company" ? "secondary" : "ghost"}
                                className={`w-full justify-start gap-2 ${activeTab === "company" ? "bg-white/60 shadow-sm" : ""}`}
                                onClick={() => setActiveTab("company")}
                                disabled={!canViewSettings}
                            >
                                <Building2 className="h-4 w-4" /> Company Info
                            </Button>
                            <Button
                                variant={activeTab === "branding" ? "secondary" : "ghost"}
                                className={`w-full justify-start gap-2 ${activeTab === "branding" ? "bg-white/60 shadow-sm" : ""}`}
                                onClick={() => setActiveTab("branding")}
                                disabled={!canViewSettings}
                            >
                                <Palette className="h-4 w-4" /> Brand & Portal
                            </Button>
                            <Button
                                variant={activeTab === "modules" ? "secondary" : "ghost"}
                                className={`w-full justify-start gap-2 ${activeTab === "modules" ? "bg-white/60 shadow-sm" : ""}`}
                                onClick={() => setActiveTab("modules")}
                                disabled={!canViewSettings}
                            >
                                <Settings className="h-4 w-4" /> Modules & Compliance
                            </Button>
                            <Button
                                variant={activeTab === "planner" ? "secondary" : "ghost"}
                                className={`w-full justify-start gap-2 ${activeTab === "planner" ? "bg-white/60 shadow-sm" : ""}`}
                                onClick={() => setActiveTab("planner")}
                                disabled={!canViewSettings}
                            >
                                <CalendarDays className="h-4 w-4" /> Planner Settings
                            </Button>
                            <Button
                                variant={activeTab === "sync" ? "secondary" : "ghost"}
                                className={`w-full justify-start gap-2 ${activeTab === "sync" ? "bg-white/60 shadow-sm" : ""}`}
                                onClick={() => setActiveTab("sync")}
                                disabled={!canViewSettings}
                            >
                                <HardDrive className="h-4 w-4" /> Document Sync
                            </Button>
                            <Button
                                variant={activeTab === "rbac" ? "secondary" : "ghost"}
                                className={`w-full justify-start gap-2 ${activeTab === "rbac" ? "bg-white/60 shadow-sm" : ""}`}
                                onClick={() => setActiveTab("rbac")}
                                disabled={!canViewSettings}
                            >
                                <ShieldCheck className="h-4 w-4" /> Team Roles & RBAC
                            </Button>
                            <Button
                                variant={activeTab === "integrations" ? "secondary" : "ghost"}
                                className={`w-full justify-start gap-2 ${activeTab === "integrations" ? "bg-white/60 shadow-sm" : ""}`}
                                onClick={() => setActiveTab("integrations")}
                                disabled={!canViewSettings}
                            >
                                <LinkIcon className="h-4 w-4" /> Integrations
                            </Button>
                        </GlassCardContent>
                    </GlassCard>
                </div>

                <div className="md:col-span-9">
                    {activeTab === "company" && (
                        <GlassCard>
                            <GlassCardHeader>
                                <GlassCardTitle>Company Information</GlassCardTitle>
                                <GlassCardDescription>These details appear on quotes, invoices, and the customer portal.</GlassCardDescription>
                            </GlassCardHeader>
                            <GlassCardContent className="space-y-4">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <Label optional>Trading Name</Label>
                                        <Input value={tenant.tradingName ?? ""} className="bg-white/50" disabled={!canManageSettings} onChange={(e) => setTenant((prev: any) => ({ ...prev, tradingName: e.target.value }))} />
                                    </div>
                                    <div className="space-y-2">
                                        <Label required>Legal Entity Name</Label>
                                        <Input value={tenant.name ?? ""} className="bg-white/50" disabled={!canManageSettings} onChange={(e) => setTenant((prev: any) => ({ ...prev, name: e.target.value }))} />
                                    </div>
                                    <div className="space-y-2">
                                        <Label optional>Tax / VAT Number</Label>
                                        <Input value={tenant.vatNumber ?? ""} className="bg-white/50" disabled={!canManageSettings} onChange={(e) => setTenant((prev: any) => ({ ...prev, vatNumber: e.target.value }))} />
                                    </div>
                                    <div className="space-y-2">
                                        <Label optional>Company Registration NO.</Label>
                                        <Input value={tenant.companyNumber ?? ""} className="bg-white/50" disabled={!canManageSettings} onChange={(e) => setTenant((prev: any) => ({ ...prev, companyNumber: e.target.value }))} />
                                    </div>
                                    <div className="space-y-2">
                                        <Label optional>Contact Email</Label>
                                        <Input
                                            type="email"
                                            value={tenant.contactEmail ?? ""}
                                            className="bg-white/50"
                                            disabled={!canManageSettings}
                                            onChange={(e) => setTenant((prev: any) => ({ ...prev, contactEmail: e.target.value }))}
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label optional>Contact Phone</Label>
                                        <PhoneInput
                                            value={tenant.contactPhone ?? ""}
                                            disabled={!canManageSettings}
                                            onChange={(contactPhone) => setTenant((prev: any) => ({ ...prev, contactPhone }))}
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label optional>Default Hourly Rate (£)</Label>
                                        <Input
                                            type="number"
                                            min={0}
                                            step={0.01}
                                            value={tenant.defaultHourlyRate ?? ""}
                                            className="bg-white/50"
                                            disabled={!canManageSettings}
                                            onChange={(e) =>
                                                setTenant((prev: any) => ({
                                                    ...prev,
                                                    defaultHourlyRate: e.target.value === "" ? "" : Number(e.target.value)
                                                }))
                                            }
                                        />
                                        <p className="text-xs text-muted-foreground">
                                            Used when no team rate and no employee rate are set on job assignments.
                                        </p>
                                    </div>
                                </div>
                                <div className="space-y-2 border-t border-glass-border pt-4">
                                    <Label optional>Primary Office Address</Label>
                                    <AddressFields
                                        value={tenantAddress}
                                        disabled={!canManageSettings}
                                        onChange={(address) => {
                                            setTenantAddress(address)
                                            setTenant((prev: any) => ({ ...prev, address: formatAddressValue(address) }))
                                        }}
                                    />
                                </div>
                            </GlassCardContent>
                            <GlassCardFooter className="justify-end border-t border-glass-border/50">
                                <Button className="gap-2" onClick={async () => {
                                    await saveTenantSettings("Company updated")
                                }} disabled={!canManageSettings}><Save className="h-4 w-4" /> Save Changes</Button>
                            </GlassCardFooter>
                        </GlassCard>
                    )}

                    {activeTab === "branding" && (
                        <GlassCard>
                            <GlassCardHeader>
                                <GlassCardTitle>Brand Settings</GlassCardTitle>
                                <GlassCardDescription>Customize the look and feel of your customer-facing portal and PDFs.</GlassCardDescription>
                            </GlassCardHeader>
                            <GlassCardContent className="space-y-6">
                                <div className="flex gap-6 items-start">
                                    <div className="h-24 w-32 bg-white rounded-lg border border-glass-border flex border-dashed items-center justify-center overflow-hidden">
                                        {tenant.logoUrl ? (
                                            <img src={tenant.logoUrl} alt="Company logo" className="h-full w-full object-contain" />
                                        ) : (
                                            <span className="font-bold text-primary">Logo</span>
                                        )}
                                    </div>
                                    <div className="space-y-2 flex-1">
                                        <Label optional>Company Logo</Label>
                                        <p className="text-xs text-muted-foreground mb-2">Upload a high-resolution logo (PNG or SVG transparent preferred).</p>
                                        <div className="flex flex-col sm:flex-row gap-2">
                                            <Input
                                                type="file"
                                                accept="image/*"
                                                className="bg-white/50"
                                                disabled={!canManageSettings || isUploadingLogo}
                                                onChange={(e) => setLogoFile(e.target.files?.[0] ?? null)}
                                            />
                                            <Button
                                                type="button"
                                                variant="outline"
                                                className="bg-white/50"
                                                disabled={!canManageSettings || !logoFile || isUploadingLogo}
                                                onClick={() => {
                                                    if (!logoFile) return
                                                    void uploadBrandAsset(logoFile, "logo")
                                                }}
                                            >
                                                {isUploadingLogo ? "Uploading..." : "Upload"}
                                            </Button>
                                        </div>
                                        <p className="text-xs text-muted-foreground">
                                            {logoFile ? `Selected: ${logoFile.name}` : "No file selected"}
                                        </p>
                                    </div>
                                </div>
                                <div className="space-y-3 pt-4 border-t border-glass-border">
                                    <Label optional>Primary Brand Color</Label>
                                    <div className="flex gap-4">
                                        <Input type="color" value={tenant.primaryColor ?? "#0E8585"} className="w-16 h-10 p-1 bg-white/40" disabled={!canManageSettings} onChange={(e) => setTenant((prev: any) => ({ ...prev, primaryColor: e.target.value }))} />
                                        <Input value={tenant.primaryColor ?? "#0E8585"} className="bg-white/50 flex-1" disabled={!canManageSettings} onChange={(e) => setTenant((prev: any) => ({ ...prev, primaryColor: e.target.value }))} />
                                    </div>
                                    <p className="text-xs text-muted-foreground mt-1">This color will be used for buttons, accents, and headers across your customer portal.</p>
                                </div>
                                <div className="space-y-3 pt-4 border-t border-glass-border">
                                    <Label optional>Email Header Logo</Label>
                                    <div className="h-20 w-full bg-white rounded-lg border border-dashed border-glass-border flex items-center justify-center overflow-hidden">
                                        {tenant.emailHeaderLogoUrl ? (
                                            <img src={tenant.emailHeaderLogoUrl} alt="Email header logo" className="h-full w-full object-contain" />
                                        ) : (
                                            <span className="text-sm text-muted-foreground">No email logo uploaded</span>
                                        )}
                                    </div>
                                    <div className="flex flex-col sm:flex-row gap-2">
                                        <Input
                                            type="file"
                                            accept="image/*"
                                            className="bg-white/50"
                                            disabled={!canManageSettings || isUploadingEmailLogo}
                                            onChange={(e) => setEmailLogoFile(e.target.files?.[0] ?? null)}
                                        />
                                        <Button
                                            type="button"
                                            variant="outline"
                                            className="bg-white/50"
                                            disabled={!canManageSettings || !emailLogoFile || isUploadingEmailLogo}
                                            onClick={() => {
                                                if (!emailLogoFile) return
                                                void uploadBrandAsset(emailLogoFile, "emailLogo")
                                            }}
                                        >
                                            {isUploadingEmailLogo ? "Uploading..." : "Upload"}
                                        </Button>
                                    </div>
                                    <p className="text-xs text-muted-foreground">
                                        {emailLogoFile ? `Selected: ${emailLogoFile.name}` : "No file selected"}
                                    </p>
                                </div>
                            </GlassCardContent>
                            <GlassCardFooter className="justify-end border-t border-glass-border/50">
                                <Button className="gap-2" onClick={async () => {
                                    await saveTenantSettings("Brand updated")
                                }} disabled={!canManageSettings}><Save className="h-4 w-4" /> Save Brand Identity</Button>
                            </GlassCardFooter>
                        </GlassCard>
                    )}

                    {activeTab === "modules" && (
                        <GlassCard>
                            <GlassCardHeader>
                                <GlassCardTitle>Modules & Compliance</GlassCardTitle>
                                <GlassCardDescription>
                                    Control optional workspace modules. Disabled modules should stay invisible to standard tenants.
                                </GlassCardDescription>
                            </GlassCardHeader>
                            <GlassCardContent className="space-y-4">
                                <div className="space-y-3">
                                    {featureFlagRows.map((item) => (
                                        <div key={item.key} className="rounded-xl border border-glass-border bg-white/40 px-4 py-3">
                                            <div className="flex items-center justify-between gap-4">
                                                <div>
                                                    <div className="font-medium text-sm">{item.label}</div>
                                                    <p className="text-xs text-muted-foreground mt-1">{item.description}</p>
                                                </div>
                                                <Switch
                                                    checked={Boolean(tenant.featureFlags?.[item.key])}
                                                    disabled={!canManageSettings}
                                                    onCheckedChange={(checked) =>
                                                        setTenant((prev: any) => ({
                                                            ...prev,
                                                            featureFlags: {
                                                                ...normalizeTenantFeatureFlags(prev.featureFlags),
                                                                [item.key]: checked,
                                                            },
                                                        }))
                                                    }
                                                />
                                            </div>

                                            {item.key === "complianceWorkflows" && Boolean(tenant.featureFlags?.complianceWorkflows) ? (
                                                <div className="mt-4 rounded-2xl border border-glass-border/80 bg-white/35 p-4">
                                                    <div className="mb-4">
                                                        <div className="font-semibold">Workflow Overlay Configuration</div>
                                                        <p className="text-xs text-muted-foreground mt-1">
                                                            Configure extra tenant-specific stages on top of the base job, quote, and invoice statuses. This section is only visible when `Compliance Workflow Overlay` is enabled.
                                                        </p>
                                                    </div>
                                                    <div className="space-y-5">
                                                        {(["jobs", "quotes", "invoices"] as WorkflowModuleKey[]).map((module) => {
                                                            const workflowConfig = normalizeTenantWorkflowConfig(tenant.workflowConfig)
                                                            const stages = workflowConfig[module].stages
                                                            const systemStages = stages.filter((stage) => stage.key === stage.baseStatus)
                                                            const customStages = stages.filter((stage) => stage.key !== stage.baseStatus)
                                                            return (
                                                                <div key={module} className="rounded-xl border border-glass-border/70 bg-white/50 p-4">
                                                                    <div className="flex items-center justify-between gap-3 mb-3">
                                                                        <div>
                                                                            <div className="font-medium">{WORKFLOW_MODULE_LABELS[module]}</div>
                                                            <p className="text-xs text-muted-foreground mt-1">
                                                                Stages appear as normal workflow statuses to users. Pipstack quietly keeps protected system behavior underneath for reporting and automation safety.
                                                            </p>
                                                                        </div>
                                                                        <Button
                                                                            type="button"
                                                                            variant="outline"
                                                                            size="sm"
                                                                            className="bg-white/60"
                                                                            onClick={() => openAddStageModal(module)}
                                                                            disabled={!canManageSettings || isWorkflowOverlaySaving}
                                                                        >
                                                                            <Plus className="h-4 w-4 mr-2" />
                                                                            Add Stage
                                                                        </Button>
                                                                    </div>
                                                                    <div className="space-y-4">
                                                                        <div className="rounded-xl border border-glass-border/60 bg-white/60 p-3">
                                                                            <div className="mb-2">
                                                                                <div className="text-sm font-medium">Protected Platform Stages</div>
                                                                                <p className="text-[11px] text-muted-foreground mt-1">
                                                                                    These are the core lifecycle anchors used by reporting and automation. You can rename their display label, but they cannot be deleted or remapped.
                                                                                </p>
                                                                            </div>
                                                                            <div className="space-y-2">
                                                                                {systemStages.map((stage) => (
                                                                                    <div key={stage.key} className="flex flex-col gap-3 rounded-xl border border-glass-border/60 bg-white/70 p-3 md:flex-row md:items-center md:justify-between">
                                                                                        <div className="min-w-0">
                                                                                            <div className="flex flex-wrap items-center gap-2">
                                                                                                <StatusBadge status={stage.label} className="px-3 py-1 text-xs font-medium shadow-sm">
                                                                                                    {stage.label}
                                                                                                </StatusBadge>
                                                                                                <Badge variant="outline" className="bg-white/70 text-[11px]">
                                                                                                    Protected
                                                                                                </Badge>
                                                                                            </div>
                                                                                            <p className="mt-1 text-xs text-muted-foreground">
                                                                                                Base status: {formatStageStatusText(stage.baseStatus)}
                                                                                            </p>
                                                                                        </div>
                                                                                        <Button
                                                                                            type="button"
                                                                                            variant="outline"
                                                                                            size="sm"
                                                                                            className="bg-white/60"
                                                                                            disabled={!canManageSettings || isWorkflowOverlaySaving}
                                                                                            onClick={() => openEditStageModal(module, stage)}
                                                                                        >
                                                                                            <SquarePen className="h-4 w-4 mr-2" />
                                                                                            Edit Label
                                                                                        </Button>
                                                                                    </div>
                                                                                ))}
                                                                            </div>
                                                                        </div>

                                                                        <div className="rounded-xl border border-glass-border/60 bg-white/55 p-3">
                                                                            <div className="mb-3">
                                                                                <div className="text-sm font-medium">Custom Stages</div>
                                                                                <p className="text-[11px] text-muted-foreground mt-1">
                                                                                    These are tenant-specific stages that appear as normal workflow statuses in boards and dropdowns.
                                                                                </p>
                                                                            </div>
                                                                            {customStages.length === 0 ? (
                                                                                <div className="rounded-lg border border-dashed border-glass-border/70 bg-white/50 px-4 py-6 text-center text-sm text-muted-foreground">
                                                                                    No custom stages added yet.
                                                                                </div>
                                                                            ) : (
                                                                                <div className="space-y-3">
                                                                                    {customStages.map((stage) => (
                                                                                        <div key={stage.key} className="flex flex-col gap-3 rounded-xl border border-glass-border/60 bg-white/60 p-4 md:flex-row md:items-center md:justify-between">
                                                                                            <div className="min-w-0 flex-1">
                                                                                                <div className="font-medium text-sm text-foreground">{stage.label}</div>
                                                                                                <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                                                                                                <span>Behaves like: {formatStageStatusText(stage.baseStatus)}</span>
                                                                                                    {Number(tenant?.workflowStageUsage?.[module]?.[stage.key] ?? 0) > 0 ? (
                                                                                                        <span>Used in {Number(tenant?.workflowStageUsage?.[module]?.[stage.key] ?? 0)} record(s)</span>
                                                                                                    ) : null}
                                                                                                </div>
                                                                                            </div>
                                                                                            <div className="flex flex-wrap items-center gap-2 md:justify-end">
                                                                                                <Button
                                                                                                    type="button"
                                                                                                    variant="outline"
                                                                                                    size="sm"
                                                                                                    className="bg-white/60"
                                                                                                    disabled={!canManageSettings || isWorkflowOverlaySaving}
                                                                                                    onClick={() => openEditStageModal(module, stage)}
                                                                                                >
                                                                                                    <SquarePen className="h-4 w-4 mr-2" />
                                                                                                    Edit
                                                                                                </Button>
                                                                                                <Button
                                                                                                    type="button"
                                                                                                    variant="outline"
                                                                                                    size="sm"
                                                                                                    className="bg-white/60 text-destructive"
                                                                                                    disabled={!canManageSettings || isWorkflowOverlaySaving}
                                                                                                    onClick={() => openDeleteStageModal(module, stage)}
                                                                                                >
                                                                                                    Remove
                                                                                                </Button>
                                                                                            </div>
                                                                                        </div>
                                                                                    ))}
                                                                                </div>
                                                                            )}
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                            )
                                                        })}
                                                    </div>
                                                </div>
                                            ) : null}
                                        </div>
                                    ))}
                                </div>
                            </GlassCardContent>
                            <GlassCardFooter className="justify-end border-t border-glass-border/50">
                                <Button
                                    className="gap-2"
                                    onClick={async () => {
                                        await saveTenantSettings("Module settings updated")
                                    }}
                                    disabled={!canManageSettings}
                                >
                                    <Save className="h-4 w-4" /> Save Module Settings
                                </Button>
                            </GlassCardFooter>
                        </GlassCard>
                    )}

                    {activeTab === "planner" && (
                        <GlassCard>
                            <GlassCardHeader>
                                <GlassCardTitle>Planner Settings</GlassCardTitle>
                                <GlassCardDescription>
                                    Control company working days, country-based public holidays, and custom holidays shown in the Planner.
                                </GlassCardDescription>
                            </GlassCardHeader>
                            <GlassCardContent className="space-y-6">
                                <div className="rounded-xl border border-glass-border bg-white/40 p-4">
                                    <div className="mb-3">
                                        <div className="font-medium">Working Days</div>
                                        <p className="text-xs text-muted-foreground mt-1">Non-working days are highlighted in Planner views.</p>
                                    </div>
                                    <div className="flex flex-wrap gap-2">
                                        {plannerWeekdays.map((day) => (
                                            <Button
                                                key={day.value}
                                                type="button"
                                                variant={plannerSettings.workingDays.includes(day.value) ? "default" : "outline"}
                                                size="sm"
                                                className={plannerSettings.workingDays.includes(day.value) ? "" : "bg-white/60"}
                                                disabled={!canManageSettings}
                                                onClick={() => togglePlannerWorkingDay(day.value)}
                                            >
                                                {day.label}
                                            </Button>
                                        ))}
                                    </div>
                                </div>

                                <div className="rounded-xl border border-glass-border bg-white/40 p-4">
                                    <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                                        <div>
                                            <div className="font-medium">Public Holidays</div>
                                            <p className="text-xs text-muted-foreground mt-1">
                                                Pull public holidays for the tenant country and highlight them in the Planner.
                                            </p>
                                        </div>
                                        <Switch
                                            checked={plannerSettings.usePublicHolidays}
                                            disabled={!canManageSettings}
                                            onCheckedChange={(checked) => setPlannerSettings((prev) => ({ ...prev, usePublicHolidays: checked }))}
                                        />
                                    </div>
                                    <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
                                        <div className="space-y-2">
                                            <Label optional>Holiday Country</Label>
                                            <Select
                                                value={plannerSettings.holidayCountryCode}
                                                disabled={!canManageSettings || !plannerSettings.usePublicHolidays}
                                                onValueChange={(value) =>
                                                    setPlannerSettings((prev) => ({
                                                        ...prev,
                                                        holidayCountryCode: value,
                                                        holidaySubdivisionCode: null,
                                                    }))
                                                }
                                            >
                                                <SelectTrigger className="bg-white/60">
                                                    <SelectValue />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    {holidayCountries.map((country) => (
                                                        <SelectItem key={country.value} value={country.value}>
                                                            {country.label} ({country.value})
                                                        </SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                            <Input
                                                value={plannerSettings.holidayCountryCode}
                                                maxLength={2}
                                                placeholder="e.g. AT"
                                                className="bg-white/60 uppercase"
                                                disabled={!canManageSettings || !plannerSettings.usePublicHolidays}
                                                onChange={(event) =>
                                                    setPlannerSettings((prev) => ({
                                                        ...prev,
                                                        holidayCountryCode: event.target.value.replace(/[^a-z]/gi, "").slice(0, 2).toUpperCase(),
                                                        holidaySubdivisionCode: null,
                                                    }))
                                                }
                                            />
                                            <p className="text-[11px] text-muted-foreground">Use a two-letter country code, such as GB, AT, US, or IN.</p>
                                        </div>
                                        <div className="space-y-2">
                                            <Label optional>Subdivision / Region Code</Label>
                                            <Input
                                                value={plannerSettings.holidaySubdivisionCode ?? ""}
                                                placeholder="e.g. AT-9, US-CA"
                                                className="bg-white/60 uppercase"
                                                disabled={!canManageSettings || !plannerSettings.usePublicHolidays}
                                                onChange={(event) =>
                                                    setPlannerSettings((prev) => ({
                                                        ...prev,
                                                        holidaySubdivisionCode: event.target.value.trim().toUpperCase() || null,
                                                    }))
                                                }
                                            />
                                            <p className="text-[11px] text-muted-foreground">Optional. Use this if a tenant needs state/province-specific holidays.</p>
                                        </div>
                                        <div className="rounded-xl border border-glass-border bg-white/50 p-3">
                                            <div className="flex items-start justify-between gap-3">
                                                <div>
                                                    <div className="text-sm font-medium">Include regional holidays</div>
                                                    <p className="mt-1 text-[11px] text-muted-foreground">Show non-national holidays returned for the selected country.</p>
                                                </div>
                                                <Switch
                                                    checked={plannerSettings.includeRegionalHolidays}
                                                    disabled={!canManageSettings || !plannerSettings.usePublicHolidays}
                                                    onCheckedChange={(checked) => setPlannerSettings((prev) => ({ ...prev, includeRegionalHolidays: checked }))}
                                                />
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <div className="rounded-xl border border-glass-border bg-white/40 p-4">
                                    <div className="mb-3">
                                        <div className="font-medium">Custom Holidays</div>
                                        <p className="text-xs text-muted-foreground mt-1">Add company-specific closed days, shutdown periods, or special holidays.</p>
                                    </div>
                                    <div className="grid grid-cols-1 gap-3 md:grid-cols-[180px_1fr_auto]">
                                        <Input
                                            type="date"
                                            value={newHoliday.date}
                                            className="bg-white/60"
                                            disabled={!canManageSettings}
                                            onChange={(event) => setNewHoliday((prev) => ({ ...prev, date: event.target.value }))}
                                        />
                                        <Input
                                            value={newHoliday.title}
                                            className="bg-white/60"
                                            placeholder="e.g. Company shutdown"
                                            disabled={!canManageSettings}
                                            onChange={(event) => setNewHoliday((prev) => ({ ...prev, title: event.target.value }))}
                                        />
                                        <Button type="button" variant="outline" className="bg-white/60" disabled={!canManageSettings} onClick={addCustomHoliday}>
                                            <Plus className="mr-2 h-4 w-4" /> Add
                                        </Button>
                                    </div>
                                    <div className="mt-4 space-y-2">
                                        {plannerSettings.customHolidays.length === 0 ? (
                                            <div className="rounded-lg border border-dashed border-glass-border bg-white/40 px-3 py-4 text-sm text-muted-foreground">
                                                No custom holidays added.
                                            </div>
                                        ) : (
                                            plannerSettings.customHolidays.map((holiday) => (
                                                <div key={`${holiday.date}-${holiday.title}`} className="flex items-center justify-between gap-3 rounded-lg border border-glass-border bg-white/60 px-3 py-2">
                                                    <div>
                                                        <div className="font-medium">{holiday.title}</div>
                                                        <div className="text-xs text-muted-foreground">{holiday.date}</div>
                                                    </div>
                                                    <Button
                                                        type="button"
                                                        variant="ghost"
                                                        size="sm"
                                                        disabled={!canManageSettings}
                                                        onClick={() =>
                                                            setPlannerSettings((prev) => ({
                                                                ...prev,
                                                                customHolidays: prev.customHolidays.filter((entry) => entry !== holiday),
                                                            }))
                                                        }
                                                    >
                                                        <Trash2 className="h-4 w-4 text-destructive" />
                                                    </Button>
                                                </div>
                                            ))
                                        )}
                                    </div>
                                </div>
                            </GlassCardContent>
                            <GlassCardFooter className="justify-end border-t border-glass-border/50">
                                <Button className="gap-2" disabled={!canManageSettings || plannerSettingsSaving} onClick={savePlannerSettings}>
                                    <Save className="h-4 w-4" /> {plannerSettingsSaving ? "Saving..." : "Save Planner Settings"}
                                </Button>
                            </GlassCardFooter>
                        </GlassCard>
                    )}

                    {activeTab === "sync" && (
                        <GlassCard>
                            <GlassCardHeader>
                                <GlassCardTitle>Document Sync Preference</GlassCardTitle>
                                <GlassCardDescription>
                                    Choose where workspace documents should sync: Google Drive or SharePoint.
                                </GlassCardDescription>
                            </GlassCardHeader>
                            <GlassCardContent className="space-y-4">
                                <div className="space-y-2">
                                    <Label optional>Preferred Sync Provider</Label>
                                    <Select
                                        value={tenant.documentSyncProvider ?? "GOOGLE_DRIVE"}
                                        onValueChange={(value) => setTenant((prev: any) => ({ ...prev, documentSyncProvider: value }))}
                                        disabled={!canManageSettings}
                                    >
                                        <SelectTrigger className="w-full md:w-[280px] bg-white/50">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="GOOGLE_DRIVE">Google Drive</SelectItem>
                                            <SelectItem value="SHAREPOINT">Microsoft SharePoint</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="rounded-lg border border-dashed border-glass-border bg-white/30 p-3 text-sm text-muted-foreground space-y-1">
                                    <p>Current selection: <strong>{tenant.documentSyncProvider ?? "GOOGLE_DRIVE"}</strong></p>
                                    <p>
                                        This controls destination for Document Shadowing sync at workspace level.
                                    </p>
                                </div>
                            </GlassCardContent>
                            <GlassCardFooter className="justify-end border-t border-glass-border/50">
                                <Button
                                    className="gap-2"
                                    onClick={async () => {
                                        await saveTenantSettings("Sync preference saved")
                                    }}
                                    disabled={!canManageSettings}
                                >
                                    <Save className="h-4 w-4" /> Save Sync Preference
                                </Button>
                            </GlassCardFooter>
                        </GlassCard>
                    )}

                    {activeTab === "integrations" && (
                        <div className="space-y-4">
                            {visibleIntegrationCatalog.map((item) => {
                                const integration = getIntegration(item.provider)
                                const isConnected = integration?.status === "CONNECTED"
                                const connectedAt = integration?.connectedAt ? new Date(integration.connectedAt).toLocaleString() : "—"
                                const isAccounting = item.type === "accounting"
                                const isAccountingLockedForRow =
                                    isAccounting &&
                                    Boolean(tenant.accountingProvider) &&
                                    tenant.accountingProvider !== item.provider
                                return (
                                    <GlassCard key={item.provider}>
                                        <GlassCardHeader className="pb-3">
                                            <div className="flex items-center justify-between gap-4">
                                                <div className="flex items-center gap-3">
                                                    <div className={`h-10 w-10 border rounded-lg flex items-center justify-center font-bold text-xs ${item.badgeClass}`}>
                                                        {item.icon ?? item.badgeText}
                                                    </div>
                                                    <div>
                                                        <GlassCardTitle className="text-base">{item.name}</GlassCardTitle>
                                                        <GlassCardDescription>{item.description}</GlassCardDescription>
                                                    </div>
                                                </div>
                                                {isConnected ? (
                                                    <Badge variant="success" className="gap-1.5 whitespace-nowrap">
                                                        <ShieldCheck className="h-3 w-3" /> Connected
                                                    </Badge>
                                                ) : (
                                                    <Badge variant="outline" className="text-muted-foreground whitespace-nowrap border-dashed">
                                                        Not Connected
                                                    </Badge>
                                                )}
                                            </div>
                                        </GlassCardHeader>
                                        <GlassCardContent className="pt-0 space-y-3">
                                            <div className="bg-black/5 p-3 rounded-lg flex items-center justify-between border border-glass-border">
                                                <span className="text-sm">
                                                    Connected at: <strong>{connectedAt}</strong>
                                                </span>
                                                {isConnected ? (
                                                    <Button
                                                        variant="outline"
                                                        size="sm"
                                                        className="bg-white/50 h-8"
                                                        disabled={
                                                            !canManageSettings ||
                                                            integrationBusy === item.provider ||
                                                            isAccountingLockedForRow
                                                        }
                                                        onClick={() => handleDisconnect(item.provider)}
                                                    >
                                                        Disconnect
                                                    </Button>
                                                ) : (
                                                    <Button
                                                        variant="outline"
                                                        size="sm"
                                                        className="bg-white/50 h-8"
                                                        disabled={
                                                            !canManageSettings ||
                                                            integrationBusy === item.provider ||
                                                            isAccountingLockedForRow
                                                        }
                                                        onClick={() => handleConnect(item.provider)}
                                                    >
                                                        Connect
                                                    </Button>
                                                )}
                                            </div>
                                            <div className="flex items-center justify-between">
                                                <span className="text-sm font-medium">
                                                    {isAccounting ? "Auto-sync invoice statuses" : "Auto-sync documents"}
                                                </span>
                                                <Switch
                                                    disabled={!canManageSettings || !isConnected}
                                                    checked={isConnected}
                                                />
                                            </div>
                                        </GlassCardContent>
                                    </GlassCard>
                                )
                            })}
                        </div>
                    )}

                    {activeTab === "rbac" && (
                        <>
                            <GlassCard>
                                <GlassCardHeader className="pb-3 border-b border-glass-border">
                                    <GlassCardTitle>Role-Based Access Control (RBAC)</GlassCardTitle>
                                    <GlassCardDescription>Define permissions for custom roles in your organization.</GlassCardDescription>
                                </GlassCardHeader>
                                <GlassCardContent className="p-0">
                                    <div className="p-4 border-b border-glass-border bg-white/30 flex justify-between items-center">
                                        <div className="flex items-center gap-2 text-sm font-medium">
                                            Editing Role:
                                            <Select
                                                value={selectedRoleId}
                                                createOption={{ label: "role", onSelect: () => setNewRoleOpen(true) }}
                                                onValueChange={(value) => {
                                                    setSelectedRoleId(value)
                                                    const role = roles.find((r) => r.id === value)
                                                    setRolePermissions(role?.permissions || {})
                                                }}
                                                disabled={!canManageSettings}
                                            >
                                                <SelectTrigger className="w-[180px] h-8 bg-white/60">
                                                    <SelectValue />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    {visibleRoles.map((role) => (
                                                        <SelectItem key={role.id} value={role.id}>{role.name ?? role.code}</SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                        </div>
                                        <Button
                                            size="sm"
                                            variant="outline"
                                            className="h-8 bg-white/50"
                                            disabled={!canManageSettings}
                                            onClick={() => {
                                                setNewRoleName("")
                                                setNewRoleCode("")
                                                setNewRoleError(null)
                                                setNewRoleOpen(true)
                                            }}
                                        >
                                            <Plus className="h-3 w-3 mr-1" /> New Role
                                        </Button>
                                    </div>
                                    <Table>
                                        <TableHeader className="bg-black/5">
                                            <TableRow className="border-glass-border">
                                                <TableHead>Module Feature</TableHead>
                                                <TableHead className="text-center w-[100px]">View</TableHead>
                                                <TableHead className="text-center w-[100px]">Manage</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {permissionRows.map((row) => (
                                                <TableRow key={row.view} className="border-glass-border hover:bg-black/5">
                                                    <TableCell className="font-medium">{row.label}</TableCell>
                                                    <TableCell className="text-center">
                                                        <Switch
                                                            checked={Boolean(rolePermissions[row.view])}
                                                            onCheckedChange={(checked) =>
                                                                setRolePermissions((prev) => ({ ...prev, [row.view]: checked }))
                                                            }
                                                            disabled={!canManageSettings}
                                                        />
                                                    </TableCell>
                                                    <TableCell className="text-center">
                                                        <Switch
                                                            checked={Boolean(rolePermissions[row.manage])}
                                                            onCheckedChange={(checked) =>
                                                                setRolePermissions((prev) => ({ ...prev, [row.manage]: checked }))
                                                            }
                                                            disabled={!canManageSettings}
                                                        />
                                                    </TableCell>
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                                    <div className="p-4 border-t border-glass-border flex justify-end">
                                        <Button size="sm" onClick={async () => {
                                            if (!selectedRoleId) return
                                            await apiPut(`/settings/roles/${selectedRoleId}`, { permissions: rolePermissions })
                                        }} disabled={!canManageSettings}>
                                            Save Role
                                        </Button>
                                    </div>
                                </GlassCardContent>
                            </GlassCard>
                            <GlassModal
                                open={newRoleOpen}
                                onOpenChange={setNewRoleOpen}
                                title="Create New Role"
                                description="Add a custom team role for this workspace."
                                footer={
                                    <div className="flex justify-end gap-2 w-full">
                                        <Button variant="outline" onClick={() => setNewRoleOpen(false)}>Cancel</Button>
                                        <Button
                                            onClick={async () => {
                                                if (!canManageSettings) return
                                                if (!newRoleName.trim()) {
                                                    setNewRoleError("Role name is required.")
                                                    return
                                                }
                                                try {
                                                    const res = await apiPost<any>("/settings/roles", {
                                                        name: newRoleName.trim(),
                                                        code: newRoleCode.trim() || undefined
                                                    })
                                                    const created = res.data
                                                    setRoles((prev) => [created, ...prev])
                                                    setSelectedRoleId(created.id)
                                                    setRolePermissions(created.permissions || {})
                                                    setNewRoleOpen(false)
                                                    setNewRoleError(null)
                                                } catch (err: any) {
                                                    setNewRoleError(err?.message ?? "Failed to create role.")
                                                }
                                            }}
                                            disabled={!canManageSettings}
                                        >
                                            Create Role
                                        </Button>
                                    </div>
                                }
                            >
                                <div className="space-y-4">
                                    {newRoleError && <p className="text-sm text-destructive">{newRoleError}</p>}
                                    <div className="space-y-2">
                                        <Label required>Role Name</Label>
                                        <Input value={newRoleName} onChange={(e) => setNewRoleName(e.target.value)} placeholder="e.g. Operations Lead" />
                                    </div>
                                    <div className="space-y-2">
                                        <Label optional>Role Code</Label>
                                        <Input value={newRoleCode} onChange={(e) => setNewRoleCode(e.target.value)} placeholder="e.g. OPERATIONS_LEAD" />
                                    </div>
                                </div>
                            </GlassModal>
                        </>
                    )}
                </div>
            </div>
            </>
            )}
            <GlassModal
                open={deleteStageOpen}
                onOpenChange={(open) => {
                    setDeleteStageOpen(open)
                    if (!open) {
                        setDeleteStageKey("")
                        setDeleteStageLabel("")
                        setDeleteStageBaseStatus(WORKFLOW_BASE_STATUS_OPTIONS.jobs[0])
                    }
                }}
                title={`Remove ${WORKFLOW_MODULE_LABELS[deleteStageModule]} Stage`}
                description="Review the restriction before removing this custom workflow stage."
                footer={
                    <div className="flex justify-end gap-2 w-full">
                        {deleteStageUsageCount > 0 ? (
                            <Button variant="outline" onClick={() => setDeleteStageOpen(false)}>
                                Close
                            </Button>
                        ) : (
                            <>
                                <Button variant="outline" onClick={() => setDeleteStageOpen(false)}>
                                    Cancel
                                </Button>
                                <Button
                                    variant="destructive"
                                    onClick={() => { void removeWorkflowStage(deleteStageModule, deleteStageKey) }}
                                    disabled={!canManageSettings || isWorkflowOverlaySaving || !deleteStageKey}
                                >
                                    {isWorkflowOverlaySaving ? "Removing..." : "Remove Stage"}
                                </Button>
                            </>
                        )}
                    </div>
                }
            >
                <div className="space-y-4">
                    <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-4">
                        <div className="font-medium text-sm text-destructive">
                            {deleteStageUsageCount > 0 ? "This custom stage cannot be removed." : "This custom stage can be removed."}
                        </div>
                        <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
                            {deleteStageUsageCount > 0 ? (
                                <>
                                    <span className="font-medium text-foreground">{deleteStageLabel || "This custom stage"}</span>
                                    {" "}is currently used by{" "}
                                    <span className="font-medium text-foreground">{deleteStageUsageCount}</span>
                                    {" "}existing {WORKFLOW_MODULE_LABELS[deleteStageModule].toLowerCase()} record(s). Move those records to another status first.
                                </>
                            ) : (
                                <>
                                    <span className="font-medium text-foreground">{deleteStageLabel || "This custom stage"}</span>
                                    {" "}is not currently used by any existing {WORKFLOW_MODULE_LABELS[deleteStageModule].toLowerCase()} records.
                                </>
                            )}
                        </p>
                    </div>
                    <div className="rounded-xl border border-glass-border/70 bg-white/60 p-4 text-sm">
                        <div className="font-medium text-foreground">Stage being reviewed</div>
                        <div className="mt-2 text-muted-foreground">
                            <span className="font-medium text-foreground">{deleteStageLabel || "Custom stage"}</span>
                            {" "}in{" "}
                            <span className="font-medium text-foreground">{WORKFLOW_MODULE_LABELS[deleteStageModule]}</span>
                            {" "}behaves like{" "}
                            <span className="font-medium text-foreground">{formatStageStatusText(deleteStageBaseStatus)}</span>.
                        </div>
                    </div>
                </div>
            </GlassModal>
            <GlassModal
                open={addStageOpen}
                onOpenChange={(open) => {
                    setAddStageOpen(open)
                    if (!open) {
                        setAddStageError(null)
                    }
                }}
                title={`Add ${WORKFLOW_MODULE_LABELS[addStageModule]} Stage`}
                description="Create a tenant-specific workflow stage. It will appear as its own status in boards and dropdowns."
                footer={
                    <div className="flex justify-end gap-2 w-full">
                        <Button variant="outline" onClick={() => setAddStageOpen(false)}>
                            Cancel
                        </Button>
                        <Button onClick={() => { void submitAddStage() }} disabled={!canManageSettings || isWorkflowOverlaySaving}>
                            {isWorkflowOverlaySaving ? "Saving..." : "Add Stage"}
                        </Button>
                    </div>
                }
            >
                <div className="space-y-4">
                    <div className="space-y-2">
                        <Label required>Stage Label</Label>
                        <Input
                            value={addStageForm.label}
                            onChange={(e) => {
                                setAddStageForm((prev) => ({ ...prev, label: e.target.value }))
                                if (addStageError) {
                                    setAddStageError(null)
                                }
                            }}
                            className="bg-white/60"
                            placeholder="Enter stage label"
                        />
                    </div>
                    <div className="space-y-2">
                        <Label required>Workflow Phase</Label>
                        <Select
                            value={addStageForm.baseStatus}
                            onValueChange={(value) => setAddStageForm((prev) => ({ ...prev, baseStatus: value }))}
                        >
                            <SelectTrigger className="bg-white/60">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {WORKFLOW_BASE_STATUS_OPTIONS[addStageModule].map((status) => (
                                    <SelectItem key={status} value={status}>
                                        {formatStageStatusText(status)}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    <p className="text-xs text-muted-foreground">
                        This only tells Pipstack how the stage should behave internally. Users will see the stage label as a normal status.
                    </p>
                    {addStageError ? (
                        <p className="text-sm text-destructive">{addStageError}</p>
                    ) : null}
                </div>
            </GlassModal>
            <GlassModal
                open={editStageOpen}
                onOpenChange={(open) => {
                    setEditStageOpen(open)
                    if (!open) {
                        setEditStageError(null)
                    }
                }}
                title={`Edit ${WORKFLOW_MODULE_LABELS[editStageModule]} Stage`}
                description={
                    isEditingPlatformStage
                        ? "Rename this protected platform stage for this tenant. Its workflow behavior remains locked for system safety."
                        : "Update the stage label and where it belongs in the workflow."
                }
                footer={
                    <div className="flex justify-end gap-2 w-full">
                        <Button variant="outline" onClick={() => setEditStageOpen(false)}>
                            Cancel
                        </Button>
                        <Button onClick={() => { void submitEditStage() }} disabled={!canManageSettings || isWorkflowOverlaySaving}>
                            {isWorkflowOverlaySaving ? "Saving..." : "Save Changes"}
                        </Button>
                    </div>
                }
            >
                <div className="space-y-4">
                    <div className="space-y-2">
                        <Label required>Stage Label</Label>
                        <Input
                            value={editStageForm.label}
                            onChange={(e) => {
                                setEditStageForm((prev) => ({ ...prev, label: e.target.value }))
                                if (editStageError) {
                                    setEditStageError(null)
                                }
                            }}
                            className="bg-white/60"
                            placeholder="Enter stage label"
                        />
                    </div>
                    <div className="space-y-2">
                        <Label required>{isEditingPlatformStage ? "Locked Workflow Phase" : "Workflow Phase"}</Label>
                        <Select
                            value={editStageForm.baseStatus}
                            onValueChange={(value) => setEditStageForm((prev) => ({ ...prev, baseStatus: value }))}
                            disabled={isEditingPlatformStage}
                        >
                            <SelectTrigger className="bg-white/60">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {WORKFLOW_BASE_STATUS_OPTIONS[editStageModule].map((status) => (
                                    <SelectItem key={status} value={status}>
                                        {formatStageStatusText(status)}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        {isEditingPlatformStage ? (
                            <p className="text-xs text-muted-foreground">
                                This stage is a platform anchor. Only the display label can be changed.
                            </p>
                        ) : (
                            <p className="text-xs text-muted-foreground">
                                This only controls how the stage behaves internally. It will still appear as its own status to users.
                            </p>
                        )}
                    </div>
                    {editStageError ? (
                        <p className="text-sm text-destructive">{editStageError}</p>
                    ) : null}
                </div>
            </GlassModal>
        </PageContainer>
    )
}

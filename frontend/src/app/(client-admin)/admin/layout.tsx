"use client"

import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { AppHeader } from "@/components/layout/AppHeader"
import { AppSidebar } from "@/components/layout/AppSidebar"
import Link from "next/link"
import { LayoutDashboard, Users, Settings, Briefcase, Calendar, FileText, FileSpreadsheet, HardHat, Ticket, Clock, PieChart, User, AlertTriangle, CheckSquare, CalendarClock, ClipboardCheck, TrendingUp } from "lucide-react"
import { getAuth, clearAuth, setEffectivePermissions } from "@/lib/auth"
import { apiGet } from "@/lib/api"
import { applyTenantTheme } from "@/lib/theme"
import { getTenantSubdomain } from "@/lib/tenant-domain"
import { getPermissionsForRoles, getPermissionsFromRoleObjects, hasPermission } from "@/lib/permissions"
import { TenantFeaturesProvider } from "@/components/layout/TenantFeaturesContext"
import { DEFAULT_TENANT_FEATURE_FLAGS, normalizeTenantFeatureFlags, TenantFeatureKey } from "@/lib/tenant-features"
import { TenantWorkflowProvider } from "@/components/layout/TenantWorkflowContext"
import { DEFAULT_TENANT_WORKFLOW_CONFIG, normalizeTenantWorkflowConfig } from "@/lib/workflows"
import { QuickCreateProvider } from "@/components/shared/QuickCreateProvider"

const navItems = [
    { name: "Dashboard", href: "/admin/dashboard", icon: <LayoutDashboard className="h-4 w-4" /> },
    { name: "My Tasks", href: "/admin/my-tasks", icon: <CheckSquare className="h-4 w-4" /> },
    { name: "CRM & Leads", href: "/admin/crm", icon: <Users className="h-4 w-4" />, permission: "crm.view" },
    { name: "Quotes", href: "/admin/quotes", icon: <FileText className="h-4 w-4" />, permission: "quotes.view" },
    { name: "Job", href: "/admin/schedule", icon: <Calendar className="h-4 w-4" />, permission: "scheduling.view" },
    { name: "Invoices", href: "/admin/finance", icon: <FileSpreadsheet className="h-4 w-4" />, permission: "financials.view" },
    { name: "Customers", href: "/admin/customers", icon: <Briefcase className="h-4 w-4" />, permission: "crm.view" },
    { name: "Contractors", href: "/admin/contractors", icon: <HardHat className="h-4 w-4" />, permission: "subcontractors.view" },
    { name: "Employees", href: "/admin/team", icon: <User className="h-4 w-4" />, permission: "team.view" },
    { name: "Documents", href: "/admin/documents", icon: <Briefcase className="h-4 w-4" />, permission: "documents.view" },
    { name: "Support Tickets", href: "/admin/tickets", icon: <Ticket className="h-4 w-4" />, permission: "support.view" },
    { name: "HR & Payroll", href: "/admin/hr", icon: <Clock className="h-4 w-4" />, permission: "hr.view" },
    { name: "WIP", href: "/admin/wip", icon: <TrendingUp className="h-4 w-4" />, permission: "reports.view" },
    { name: "Reports", href: "/admin/reports", icon: <PieChart className="h-4 w-4" />, permission: "reports.view" },
    { name: "Renewals", href: "/admin/renewals", icon: <CalendarClock className="h-4 w-4" />, permission: "reports.view", featureFlag: "renewals" },
    { name: "Compliance", href: "/admin/compliance", icon: <ClipboardCheck className="h-4 w-4" />, permission: "reports.view", featureFlag: "complianceReports" },
    { name: "Settings", href: "/admin/settings", icon: <Settings className="h-4 w-4" />, permission: "settings.view" },
]

export default function ClientAdminLayout({
    children,
}: {
    children: React.ReactNode
}) {
    const router = useRouter()
    const [authChecked, setAuthChecked] = useState(false)
    const [authorized, setAuthorized] = useState(false)
    const [brandName, setBrandName] = useState<string | undefined>(undefined)
    const [logoUrl, setLogoUrl] = useState<string | undefined>(undefined)
    const [permissions, setPermissions] = useState<Record<string, boolean>>({})
    const [featureFlags, setFeatureFlags] = useState(DEFAULT_TENANT_FEATURE_FLAGS)
    const [workflowConfig, setWorkflowConfig] = useState(DEFAULT_TENANT_WORKFLOW_CONFIG)
    const [integrationAlerts, setIntegrationAlerts] = useState<
        Array<{ provider: string; reason?: string; detectedAt?: string }>
    >([])
    const initializedRef = useRef(false)

    const getProviderLabel = (provider: string) => {
        switch (provider) {
            case "GOOGLE_DRIVE":
                return "Google Drive"
            case "SHAREPOINT":
                return "SharePoint"
            case "QUICKBOOKS":
                return "QuickBooks"
            case "XERO":
                return "Xero"
            default:
                return provider
        }
    }

    useEffect(() => {
        if (initializedRef.current) return
        initializedRef.current = true
        const auth = getAuth()
        const roleCodes = auth?.user?.roles?.map((r: any) => r.code) ?? []
        if (!auth) {
            clearAuth()
            router.replace("/common-login")
            setAuthorized(false)
            setAuthChecked(true)
            return
        }
        setAuthorized(true)
        setAuthChecked(true)
        const load = async () => {
            if (typeof window !== "undefined") {
                try {
                    const tenantId = localStorage.getItem("aem_tenant_id")
                    const cachedMeta = localStorage.getItem("aem_tenant_meta")
                    if (cachedMeta && tenantId) {
                        const meta = JSON.parse(cachedMeta)
                        if (meta?.tenantId === tenantId) {
                            setBrandName(meta?.tradingName ?? meta?.name ?? brandName)
                            setLogoUrl(meta?.logoUrl ?? logoUrl)
                            if (meta?.primaryColor) {
                                applyTenantTheme(meta.primaryColor)
                            }
                        }
                    }
                    const workspacesRaw = localStorage.getItem("aem_workspaces")
                    if (workspacesRaw && tenantId) {
                        const workspaces = JSON.parse(workspacesRaw) as Array<any>
                        const selected = workspaces.find((workspace) => workspace.tenantId === tenantId)
                        if (selected) {
                            setBrandName(selected.tradingName ?? selected.name ?? brandName)
                            setLogoUrl(selected.logoUrl ?? logoUrl)
                            if (selected.primaryColor) {
                                applyTenantTheme(selected.primaryColor)
                            }
                        }
                    }
                } catch {
                    // ignore cached metadata issues
                }
            }
            try {
                const tenantRes = await apiGet<any>("/settings/tenant")
                const nextBrand = tenantRes.data?.tradingName ?? tenantRes.data?.name ?? "Client"
                setBrandName(nextBrand)
                setLogoUrl(tenantRes.data?.logoUrl)
                setFeatureFlags(normalizeTenantFeatureFlags(tenantRes.data?.featureFlags))
                setWorkflowConfig(normalizeTenantWorkflowConfig(tenantRes.data?.workflowConfig))
                applyTenantTheme(tenantRes.data?.primaryColor)
                if (typeof window !== "undefined") {
                    const tenantId = localStorage.getItem("aem_tenant_id")
                    if (tenantId) {
                        localStorage.setItem("aem_tenant_meta", JSON.stringify({
                            tenantId,
                            tradingName: tenantRes.data?.tradingName,
                            name: tenantRes.data?.name,
                            logoUrl: tenantRes.data?.logoUrl,
                            primaryColor: tenantRes.data?.primaryColor
                        }))
                        localStorage.setItem("aem_tenant_features", JSON.stringify(normalizeTenantFeatureFlags(tenantRes.data?.featureFlags)))
                        localStorage.setItem("aem_tenant_workflows", JSON.stringify(normalizeTenantWorkflowConfig(tenantRes.data?.workflowConfig)))
                    }
                }
            } catch {
                // ignore tenant branding errors (permissions)
                if (typeof window !== "undefined") {
                    try {
                        const baseDomain = process.env.NEXT_PUBLIC_TENANT_BASE_DOMAIN ?? ""
                        const subdomain = getTenantSubdomain(window.location.hostname, baseDomain)
                        if (subdomain) {
                            const publicRes = await apiGet<any>(`/public/tenant/${subdomain}`)
                            const nextBrand = publicRes.data?.tradingName ?? publicRes.data?.name
                            if (nextBrand) {
                                setBrandName(nextBrand)
                            }
                            if (publicRes.data?.logoUrl) {
                                setLogoUrl(publicRes.data.logoUrl)
                            }
                            if (publicRes.data?.primaryColor) {
                                applyTenantTheme(publicRes.data.primaryColor)
                            }
                            const tenantId = localStorage.getItem("aem_tenant_id")
                            if (tenantId) {
                                localStorage.setItem("aem_tenant_meta", JSON.stringify({
                                    tenantId,
                                    tradingName: publicRes.data?.tradingName,
                                    name: publicRes.data?.name,
                                    logoUrl: publicRes.data?.logoUrl,
                                    primaryColor: publicRes.data?.primaryColor
                                }))
                            }
                        }
                    } catch {
                        // ignore public tenant fallback
                    }
                }
            }

            try {
                const meRes = await apiGet<any>("/users/me")
                const effective = meRes.data?.effectivePermissions
                if (effective) {
                    setPermissions(effective)
                    setEffectivePermissions(effective)
                    return
                }
                const roleObjects = meRes.data?.roles ?? []
                const computed = roleObjects.length > 0
                    ? getPermissionsFromRoleObjects(roleObjects)
                    : getPermissionsForRoles(roleCodes)
                setPermissions(computed)
                setEffectivePermissions(computed)
            } catch {
                setPermissions(getPermissionsForRoles(roleCodes))
            }

            try {
                const alertsRes = await apiGet<any[]>("/integrations/alerts")
                setIntegrationAlerts(Array.isArray(alertsRes.data) ? alertsRes.data : [])
            } catch {
                setIntegrationAlerts([])
            }
        }
        load()
    }, [router])

    useEffect(() => {
        if (typeof window === "undefined") return
        const onBrandUpdated = (event: Event) => {
            const customEvent = event as CustomEvent<{
                tradingName?: string
                name?: string
                logoUrl?: string
                primaryColor?: string
            }>
            const detail = customEvent.detail
            if (!detail) return
            const nextBrand = detail.tradingName ?? detail.name
            if (nextBrand) {
                setBrandName(nextBrand)
            }
            if (typeof detail.logoUrl === "string") {
                setLogoUrl(detail.logoUrl)
            }
            if (detail.primaryColor) {
                applyTenantTheme(detail.primaryColor)
            }
        }
        window.addEventListener("aem-tenant-brand-updated", onBrandUpdated as EventListener)
        return () => {
            window.removeEventListener("aem-tenant-brand-updated", onBrandUpdated as EventListener)
        }
    }, [])

    useEffect(() => {
        if (typeof window === "undefined") return
        const onWorkflowUpdated = (event: Event) => {
            const customEvent = event as CustomEvent<{ workflowConfig?: unknown }>
            setWorkflowConfig(normalizeTenantWorkflowConfig(customEvent.detail?.workflowConfig))
        }
        window.addEventListener("aem-tenant-workflows-updated", onWorkflowUpdated as EventListener)
        return () => {
            window.removeEventListener("aem-tenant-workflows-updated", onWorkflowUpdated as EventListener)
        }
    }, [])

    useEffect(() => {
        if (typeof window === "undefined") return
        const onFeaturesUpdated = (event: Event) => {
            const customEvent = event as CustomEvent<{ featureFlags?: unknown }>
            setFeatureFlags(normalizeTenantFeatureFlags(customEvent.detail?.featureFlags))
        }
        window.addEventListener("aem-tenant-features-updated", onFeaturesUpdated as EventListener)
        return () => {
            window.removeEventListener("aem-tenant-features-updated", onFeaturesUpdated as EventListener)
        }
    }, [])

    if (!authChecked || !authorized) {
        return null
    }

    const sidebarItems = navItems
        .filter((item) => {
            const hasPermissionAccess = !item.permission || hasPermission(permissions as any, item.permission as any)
            const featureFlag = (item as { featureFlag?: TenantFeatureKey }).featureFlag
            const hasFeatureAccess = !featureFlag || featureFlags[featureFlag]
            return hasPermissionAccess && hasFeatureAccess
        })
        .flatMap((item) => {
            if (item.name !== "Job" || !featureFlags.plannerNotes) {
                return [item]
            }
            return [
                {
                    ...item,
                    href: "/admin/schedule?section=jobs",
                    children: [
                        { name: "Jobs", href: "/admin/schedule?section=jobs", icon: <Calendar className="h-4 w-4" /> },
                        { name: "Planner", href: "/admin/schedule?section=planner", icon: <CalendarClock className="h-4 w-4" /> },
                    ],
                },
            ]
        })

    return (
        <TenantFeaturesProvider value={featureFlags}>
            <TenantWorkflowProvider value={workflowConfig}>
                <QuickCreateProvider>
                    <div className="flex min-h-screen">
                        <AppSidebar
                            items={sidebarItems}
                            portalName="Workspace"
                            brandName={brandName}
                            logoUrl={logoUrl}
                        />
                        <div className="flex-1 flex flex-col min-w-0">
                            <AppHeader title={brandName ?? "Workspace"} breadcrumbs="Workspace" />
                            {integrationAlerts.length > 0 ? (
                                <div className="mx-4 mt-3 rounded-lg border border-amber-300 bg-amber-50 px-4 py-2 text-amber-900">
                                    <div className="flex items-center gap-2 text-sm font-semibold">
                                        <AlertTriangle className="h-4 w-4" />
                                        Reconnection Required
                                    </div>
                                    <p className="mt-1 text-xs text-amber-800">
                                        {integrationAlerts.map((alert) => getProviderLabel(alert.provider)).join(", ")} integration requires attention.{" "}
                                        {integrationAlerts[0]?.reason ? `${integrationAlerts[0].reason} ` : ""}
                                        Please reconnect from{" "}
                                        <Link href="/admin/settings" className="font-semibold underline underline-offset-2">
                                            Settings
                                        </Link>.
                                    </p>
                                </div>
                            ) : null}
                            <main className="flex-1 overflow-y-auto">
                                {children}
                            </main>
                            <footer className="py-3 text-center text-[10px] text-muted-foreground border-t border-glass-border">
                                Powered by AEM Systems
                            </footer>
                        </div>
                    </div>
                </QuickCreateProvider>
            </TenantWorkflowProvider>
        </TenantFeaturesProvider>
    )
}

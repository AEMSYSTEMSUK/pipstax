"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { PageContainer } from "@/components/layout/PageContainer"
import { GlassCard, GlassCardContent, GlassCardHeader, GlassCardTitle } from "@/components/glass/GlassCard"
import { GlassModal } from "@/components/glass/GlassModal"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Building2, Plus, Users, FileText } from "lucide-react"
import { apiGet, apiPost } from "@/lib/api"
import { ErrorToast } from "@/components/shared/ErrorToast"
import { Switch } from "@/components/ui/switch"

const defaultFeatureFlags = {
    sites: false,
    complianceReports: false,
    renewals: false,
    splitInvoicing: false,
    complianceWorkflows: false,
    plannerNotes: false,
    siteScopedPortal: false,
}

const optionalModules = [
    ["sites", "Sites", "Manage multiple service locations for each customer."],
    ["complianceReports", "Compliance Reports", "Create, review, and share structured compliance reports."],
    ["renewals", "Tests Due / Renewals", "Track upcoming tests and renewal work."],
    ["complianceWorkflows", "Compliance Workflow Overlay", "Use compliance-focused stages in existing workflows."],
    ["plannerNotes", "Planner Notes", "Add operational notes to planning workflows."],
    ["siteScopedPortal", "Site-scoped Portal", "Restrict portal users to selected customer sites."],
] as const

type TenantForm = {
    name: string
    tradingName: string
    adminName: string
    adminEmail: string
    adminPassword: string
    primaryColor: string
    featureFlags: typeof defaultFeatureFlags
}

const createEmptyForm = (): TenantForm => ({
    name: "",
    tradingName: "",
    adminName: "",
    adminEmail: "",
    adminPassword: "Password123!",
    primaryColor: "#0E8585",
    featureFlags: { ...defaultFeatureFlags },
})

export default function TenantsPage() {
    const [tenants, setTenants] = useState<any[]>([])
    const [error, setError] = useState<string | null>(null)
    const [isOpen, setIsOpen] = useState(false)
    const [form, setForm] = useState<TenantForm>(createEmptyForm)
    const baseDomain = process.env.NEXT_PUBLIC_TENANT_BASE_DOMAIN ?? "app.com"

    const load = async () => {
        try {
            const res = await apiGet<any[]>("/platform/tenants")
            setTenants(Array.isArray(res.data) ? res.data : [])
        } catch (err: any) {
            setError(err?.message ?? "Failed to load tenants")
        }
    }

    useEffect(() => {
        load()
    }, [])

    return (
        <PageContainer>
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-foreground">Tenants</h1>
                    <p className="text-muted-foreground mt-1 text-sm">Manage all client workspaces and onboarding.</p>
                </div>

                <GlassModal
                    open={isOpen}
                    onOpenChange={setIsOpen}
                    trigger={
                        <Button className="gap-2">
                            <Plus className="h-4 w-4" /> New Tenant
                        </Button>
                    }
                    title="Create New Tenant"
                    description="Spin up a new client workspace with an admin login."
                    footer={
                        <div className="flex justify-end gap-2 w-full">
                            <Button variant="outline" onClick={() => setIsOpen(false)}>Cancel</Button>
                            <Button
                                onClick={async () => {
                                    try {
                                        await apiPost("/platform/tenants", form)
                                        setIsOpen(false)
                                        setForm(createEmptyForm())
                                        await load()
                                    } catch (err: any) {
                                        setError(err?.message ?? "Failed to create tenant")
                                    }
                                }}
                            >
                                Create Tenant
                            </Button>
                        </div>
                    }
                >
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label>Legal Name</Label>
                            <Input value={form.name} onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))} />
                        </div>
                        <div className="space-y-2">
                            <Label>Trading Name</Label>
                            <Input value={form.tradingName} onChange={(e) => setForm((prev) => ({ ...prev, tradingName: e.target.value }))} />
                        </div>
                        <div className="space-y-2">
                            <Label>Admin Name</Label>
                            <Input value={form.adminName} onChange={(e) => setForm((prev) => ({ ...prev, adminName: e.target.value }))} />
                        </div>
                        <div className="space-y-2">
                            <Label>Admin Email</Label>
                            <Input type="email" value={form.adminEmail} onChange={(e) => setForm((prev) => ({ ...prev, adminEmail: e.target.value }))} />
                        </div>
                        <div className="space-y-2">
                            <Label>Admin Password</Label>
                            <Input value={form.adminPassword} onChange={(e) => setForm((prev) => ({ ...prev, adminPassword: e.target.value }))} />
                        </div>
                        <div className="space-y-2">
                            <Label>Brand Color</Label>
                            <Input type="color" value={form.primaryColor} onChange={(e) => setForm((prev) => ({ ...prev, primaryColor: e.target.value }))} />
                        </div>
                        <div className="space-y-3 md:col-span-2 border-t border-glass-border/60 pt-4 mt-1">
                            <div>
                                <Label className="text-base">Optional Modules</Label>
                                <p className="text-sm text-muted-foreground mt-1">
                                    Choose the additional capabilities for this tenant. All modules are off by default and can be changed later.
                                </p>
                            </div>
                            {optionalModules.map(([key, label, description]) => (
                                <div key={key} className="flex items-center justify-between gap-4 rounded-lg border border-glass-border bg-white/40 px-4 py-3">
                                    <div>
                                        <Label htmlFor={`create-tenant-${key}`} className="font-medium">{label}</Label>
                                        <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
                                    </div>
                                    <Switch
                                        id={`create-tenant-${key}`}
                                        checked={form.featureFlags[key]}
                                        onCheckedChange={(checked) =>
                                            setForm((prev) => ({
                                                ...prev,
                                                featureFlags: {
                                                    ...prev.featureFlags,
                                                    [key]: checked,
                                                },
                                            }))
                                        }
                                        aria-label={`Enable ${label}`}
                                    />
                                </div>
                            ))}
                        </div>
                    </div>
                </GlassModal>
            </div>

            <GlassCard>
                <GlassCardHeader className="pb-3 border-b border-glass-border/50">
                    <GlassCardTitle className="text-lg">Workspace Directory</GlassCardTitle>
                </GlassCardHeader>
                <GlassCardContent className="p-0">
                    <Table>
                        <TableHeader className="bg-black/5">
                            <TableRow className="hover:bg-transparent border-glass-border">
                                <TableHead>Workspace</TableHead>
                                <TableHead>Contact</TableHead>
                                <TableHead className="text-center">Users</TableHead>
                                <TableHead className="text-center">Jobs</TableHead>
                                <TableHead className="text-center">Invoices</TableHead>
                                <TableHead></TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {tenants.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={6} className="h-32 text-center text-muted-foreground">
                                        <div className="flex flex-col items-center gap-3">
                                            <span>No tenants found.</span>
                                            <Button size="sm" className="gap-2" onClick={() => setIsOpen(true)}>
                                                <Plus className="h-4 w-4" /> New Tenant
                                            </Button>
                                        </div>
                                    </TableCell>
                                </TableRow>
                            ) : (
                                tenants.map((tenant) => (
                                    <TableRow key={tenant.id} className="border-glass-border hover:bg-black/5 transition-colors">
                                        <TableCell>
                                            <div className="flex items-center gap-3">
                                                <div className="h-10 w-10 overflow-hidden rounded-xl bg-primary/10 text-primary-dark flex items-center justify-center shrink-0 border border-primary/20">
                                                    {tenant.logoUrl ? (
                                                        <img src={tenant.logoUrl} alt={`${tenant.tradingName ?? tenant.name} logo`} className="h-full w-full object-contain p-1" />
                                                    ) : (
                                                        <Building2 className="h-4 w-4" />
                                                    )}
                                                </div>
                                                <div className="flex flex-col">
                                                    <span className="font-medium text-sm">{tenant.tradingName ?? tenant.name}</span>
                                                    <span className="text-xs text-muted-foreground">{tenant.name}</span>
                                                    {tenant.isDeleted ? (
                                                        <Badge variant="outline" className="mt-1 w-fit border-amber-200 bg-amber-50 text-amber-700">Deactivated</Badge>
                                                    ) : null}
                                                    {tenant.subdomain && (
                                                        <span className="text-[11px] text-muted-foreground">URL: {tenant.subdomain}.{baseDomain}</span>
                                                    )}
                                                </div>
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            <div className="text-sm">{tenant.contactEmail ?? "—"}</div>
                                        </TableCell>
                                        <TableCell className="text-center">
                                            <Badge variant="secondary" className="gap-1"><Users className="h-3 w-3" /> {tenant.stats?.users ?? 0}</Badge>
                                        </TableCell>
                                        <TableCell className="text-center">{tenant.stats?.jobs ?? 0}</TableCell>
                                        <TableCell className="text-center">
                                            <Badge variant="outline" className="gap-1"><FileText className="h-3 w-3" /> {tenant.stats?.invoices ?? 0}</Badge>
                                        </TableCell>
                                        <TableCell className="text-right">
                                            <Button variant="outline" size="sm" className="bg-white/50" asChild>
                                                <Link href={`/sa/tenants/${tenant.id}`}>Manage</Link>
                                            </Button>
                                        </TableCell>
                                    </TableRow>
                                ))
                            )}
                        </TableBody>
                    </Table>
                </GlassCardContent>
            </GlassCard>

            <ErrorToast error={error} onClear={() => setError(null)} />
        </PageContainer>
    )
}

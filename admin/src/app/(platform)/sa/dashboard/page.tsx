"use client"

import { useEffect, useState } from "react"
import { PageContainer } from "@/components/layout/PageContainer"
import { GlassCard, GlassCardContent, GlassCardHeader, GlassCardTitle } from "@/components/glass/GlassCard"
import { Building2, Users, FileText, AlertTriangle, Layers3, Sparkles, Ticket, WalletCards } from "lucide-react"
import { apiGet } from "@/lib/api"
import { ErrorToast } from "@/components/shared/ErrorToast"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Plus } from "lucide-react"
import { BarListCard, DonutCard, ExecutiveMetric, formatCurrency } from "@/components/shared/DashboardVisuals"

type Overview = {
    tenants: number
    users: number
    jobs: number
    quotes: number
    invoices: number
    tickets: number
    totalInvoiced: number
    totalPaid: number
    totalOverdue: number
}

export default function SuperAdminDashboard() {
    const [overview, setOverview] = useState<Overview | null>(null)
    const [tenants, setTenants] = useState<any[]>([])
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        const load = async () => {
            try {
                const [overviewRes, tenantsRes] = await Promise.all([
                    apiGet<Overview>("/platform/overview"),
                    apiGet<any[]>("/platform/tenants")
                ])
                setOverview(overviewRes.data)
                setTenants(Array.isArray(tenantsRes.data) ? tenantsRes.data : [])
            } catch (err: any) {
                setError(err?.message ?? "Failed to load platform overview")
            }
        }
        load()
    }, [])

    const activeTenants = tenants.filter((tenant) => !tenant.isDeleted)
    const inactiveTenants = tenants.filter((tenant) => tenant.isDeleted)
    const tenantRows = tenants
        .slice(0, 6)
        .map((tenant) => ({
            label: tenant.tradingName ?? tenant.name,
            value: Number(tenant.stats?.users ?? 0),
            meta: `${tenant.stats?.jobs ?? 0} jobs • ${tenant.stats?.invoices ?? 0} invoices`,
        }))

    return (
        <PageContainer>
            <div className="mb-8 overflow-hidden rounded-[34px] border border-glass-border/70 bg-gradient-to-br from-white via-white/75 to-primary/10 p-6 shadow-xl shadow-slate-200/50">
                <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
                    <div>
                        <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-xs font-bold uppercase tracking-[0.18em] text-primary">
                            <Sparkles className="h-3.5 w-3.5" /> Platform Health
                        </div>
                        <h1 className="text-4xl font-semibold tracking-tight text-foreground">Platform Dashboard</h1>
                        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">Monitor workspace adoption, billing value, support pressure, and tenant activity from one polished view.</p>
                    </div>
                    <Button className="gap-2" asChild>
                        <Link href="/sa/tenants"><Plus className="h-4 w-4" /> New Tenant</Link>
                    </Button>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
                <ExecutiveMetric label="Active Tenants" value={activeTenants.length || overview?.tenants || "—"} icon={<Building2 className="h-5 w-5" />} description={`${inactiveTenants.length} deactivated`} tone="primary" />
                <ExecutiveMetric label="Total Users" value={overview?.users ?? "—"} icon={<Users className="h-5 w-5" />} description="Across all workspaces" tone="sky" />
                <ExecutiveMetric label="Total Invoiced" value={formatCurrency(overview?.totalInvoiced)} icon={<FileText className="h-5 w-5" />} description="All tenant invoice value" tone="emerald" />
                <ExecutiveMetric label="Overdue Value" value={formatCurrency(overview?.totalOverdue)} icon={<AlertTriangle className="h-5 w-5" />} description="Invoices currently overdue" tone={Number(overview?.totalOverdue ?? 0) > 0 ? "rose" : "slate"} />
            </div>

            <div className="mb-6 grid gap-6 lg:grid-cols-3">
                <DonutCard title="Tenant Availability" description="Active workspaces compared to all workspaces." value={activeTenants.length} total={tenants.length} centerLabel="active" />
                <BarListCard title="Workspace Adoption" description="Recent tenants by user count." rows={tenantRows} />
                <GlassCard className="bg-white/70">
                    <GlassCardHeader>
                        <GlassCardTitle className="text-lg">Platform Totals</GlassCardTitle>
                    </GlassCardHeader>
                    <GlassCardContent className="grid gap-3">
                        {[
                            { label: "Jobs", value: overview?.jobs ?? 0, icon: Layers3 },
                            { label: "Quotes", value: overview?.quotes ?? 0, icon: WalletCards },
                            { label: "Invoices", value: overview?.invoices ?? 0, icon: FileText },
                            { label: "Tickets", value: overview?.tickets ?? 0, icon: Ticket },
                        ].map((item) => (
                            <div key={item.label} className="flex items-center justify-between rounded-2xl border border-glass-border bg-white/55 px-4 py-3">
                                <div className="flex items-center gap-3">
                                    <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
                                        <item.icon className="h-4 w-4" />
                                    </div>
                                    <span className="font-semibold text-foreground">{item.label}</span>
                                </div>
                                <span className="text-lg font-bold text-primary">{Number(item.value).toLocaleString()}</span>
                            </div>
                        ))}
                    </GlassCardContent>
                </GlassCard>
            </div>

            <GlassCard className="bg-white/70">
                <GlassCardHeader>
                    <GlassCardTitle>Recent Tenants</GlassCardTitle>
                </GlassCardHeader>
                <GlassCardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                    {tenants.length === 0 ? (
                        <div className="flex flex-col items-start gap-3 text-sm text-muted-foreground">
                            <span>No tenants found.</span>
                            <Button size="sm" className="gap-2" asChild>
                                <Link href="/sa/tenants"><Plus className="h-4 w-4" /> New Tenant</Link>
                            </Button>
                        </div>
                    ) : (
                        tenants.slice(0, 6).map((tenant) => (
                            <Link key={tenant.id} href={`/sa/tenants/${tenant.id}`} className="rounded-2xl border border-glass-border/60 bg-white/45 p-4 transition hover:-translate-y-0.5 hover:bg-white/70 hover:shadow-lg">
                                <div className="flex items-center gap-3">
                                    <div className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-2xl border border-primary/15 bg-primary/10 text-primary">
                                        {tenant.logoUrl ? <img src={tenant.logoUrl} alt="" className="h-full w-full object-contain p-1.5" /> : <Building2 className="h-5 w-5" />}
                                    </div>
                                    <div className="min-w-0">
                                        <p className="truncate font-semibold text-foreground">{tenant.tradingName ?? tenant.name}</p>
                                        <p className="truncate text-xs text-muted-foreground">{tenant.contactEmail ?? "No contact email"}</p>
                                    </div>
                                </div>
                                <div className="mt-4 grid grid-cols-3 gap-2 text-center text-xs">
                                    <div className="rounded-xl bg-white/60 p-2"><b>{tenant.stats?.users ?? 0}</b><br />Users</div>
                                    <div className="rounded-xl bg-white/60 p-2"><b>{tenant.stats?.jobs ?? 0}</b><br />Jobs</div>
                                    <div className="rounded-xl bg-white/60 p-2"><b>{tenant.stats?.invoices ?? 0}</b><br />Invoices</div>
                                </div>
                            </Link>
                        ))
                    )}
                </GlassCardContent>
            </GlassCard>

            <ErrorToast error={error} onClear={() => setError(null)} />
        </PageContainer>
    )
}

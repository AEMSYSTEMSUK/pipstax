"use client"

import { useEffect, useMemo, useState } from "react"
import { PageContainer } from "@/components/layout/PageContainer"
import { GlassCard, GlassCardContent, GlassCardHeader, GlassCardTitle, GlassCardDescription } from "@/components/glass/GlassCard"
import { Briefcase, CreditCard, Users, CheckCircle, Calendar, MapPin, UserPlus, ClipboardCheck, RefreshCw, Building2, ArrowUpRight, PieChart, ReceiptText, TrendingUp } from "lucide-react"
import { apiGet } from "@/lib/api"
import { ErrorToast } from "@/components/shared/ErrorToast"
import { Button } from "@/components/ui/button"
import Link from "next/link"
import { Plus } from "lucide-react"
import { useTenantFeatures } from "@/components/layout/TenantFeaturesContext"
import { BarListCard, DonutCard, ExecutiveMetric, formatCurrency } from "@/components/shared/DashboardVisuals"

type DashboardMetrics = {
    leads: number
    jobs: number
    quotes: number
    invoices: number
    revenueTotal: number
    revenueLabel?: string
    overdueCount: number
    optionalMetrics?: {
        sites?: number | null
        compliancePendingReview?: number | null
        renewalsDue?: number | null
    }
    wip?: {
        count: number
        totalValue: number
        byCategory?: Record<string, { count: number; value: number }>
    }
}

export default function ClientDashboard() {
    const [metrics, setMetrics] = useState<DashboardMetrics | null>(null)
    const [jobs, setJobs] = useState<any[]>([])
    const [assignments, setAssignments] = useState<any[]>([])
    const [customers, setCustomers] = useState<any[]>([])
    const [error, setError] = useState<string | null>(null)
    const { sites: sitesEnabled, complianceReports, renewals } = useTenantFeatures()

    useEffect(() => {
        const load = async () => {
            try {
                const [metricsRes, jobsRes, customersRes, assignmentsRes] = await Promise.all([
                    apiGet<DashboardMetrics>("/reports/dashboard"),
                    apiGet<any[]>("/jobs"),
                    apiGet<any[]>("/customers"),
                    apiGet<any[]>("/jobs/assignments").catch(() => ({ data: [] }))
                ])
                setMetrics(metricsRes.data)
                setJobs(Array.isArray(jobsRes.data) ? jobsRes.data : [])
                setAssignments(Array.isArray(assignmentsRes.data) ? assignmentsRes.data : [])
                setCustomers(Array.isArray(customersRes.data) ? customersRes.data : [])
            } catch (error) {
                setError(error instanceof Error ? error.message : "Failed to load dashboard")
                setMetrics(null)
            }
        }
        load()
    }, [])

    const revenue = formatCurrency(metrics?.revenueTotal)
    const wipValue = formatCurrency(metrics?.wip?.totalValue)
    const todayKey = new Date().toDateString()
    const customerMap = useMemo(() => {
        const map = new Map<string, string>()
        customers.forEach((c) => {
            map.set(c.id, c.name)
        })
        return map
    }, [customers])
    const todaysJobs = jobs
        .filter((job) => job.scheduledAt && new Date(job.scheduledAt).toDateString() === todayKey)
        .sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime())

    const leads = metrics?.leads ?? 0
    const quotes = metrics?.quotes ?? 0
    const invoices = metrics?.invoices ?? 0
    const assignedJobIds = useMemo(() => new Set(assignments.map((assignment) => assignment.jobId).filter(Boolean)), [assignments])
    const jobsNeedingAssignment = jobs.filter((job) => {
        const status = String(job.status ?? "").toUpperCase()
        return !assignedJobIds.has(job.id) && !["COMPLETED", "FINISHED", "CANCELLED"].includes(status)
    })
    const leadQuoteRatio = leads ? Math.min(100, Math.round((quotes / leads) * 100)) : 0
    const quoteInvoiceRatio = quotes ? Math.min(100, Math.round((invoices / quotes) * 100)) : 0
    const wipCategoryRows = Object.entries(metrics?.wip?.byCategory ?? {})
        .map(([label, row]) => ({ label, value: row.value, meta: `${row.count} active job${row.count === 1 ? "" : "s"}` }))
        .sort((a, b) => b.value - a.value)
        .slice(0, 5)
    const openJobCount = jobs.filter((job) => !["COMPLETED", "CANCELLED"].includes(String(job.status ?? "").toUpperCase())).length
    const assignmentCoverage = openJobCount ? Math.max(0, openJobCount - jobsNeedingAssignment.length) : 0

    return (
        <PageContainer>
            <div className="mb-8 overflow-hidden rounded-[34px] border border-glass-border/70 bg-gradient-to-br from-white via-white/75 to-primary/10 p-6 shadow-xl shadow-slate-200/50">
                <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
                    <div>
                        <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-xs font-bold uppercase tracking-[0.18em] text-primary">
                            <PieChart className="h-3.5 w-3.5" /> Business Overview
                        </div>
                        <h1 className="text-4xl font-semibold tracking-tight text-foreground">Dashboard</h1>
                        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">A live control room for sales, jobs, billing, WIP, and operational attention points.</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        <Button variant="outline" className="gap-2 bg-white/70" asChild>
                            <Link href="/admin/reports">Reports <ArrowUpRight className="h-4 w-4" /></Link>
                        </Button>
                        <Button className="gap-2" asChild>
                            <Link href="/admin/schedule?create=job"><Plus className="h-4 w-4" /> New Job</Link>
                        </Button>
                    </div>
                </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4 mb-6">
                <Link href="/admin/wip" className="block">
                    <ExecutiveMetric label="WIP Value" value={wipValue} icon={<TrendingUp className="h-5 w-5" />} description={`${metrics?.wip?.count ?? 0} active job${metrics?.wip?.count === 1 ? "" : "s"} not fully invoiced`} tone="primary" />
                </Link>
                <Link href="/admin/finance" className="block">
                    <ExecutiveMetric label={metrics?.revenueLabel ?? "Revenue Received"} value={revenue} icon={<CreditCard className="h-5 w-5" />} description="Recorded payments, including partial payments" tone="emerald" />
                </Link>
                <Link href="/admin/schedule?status=NOT_ASSIGNED" className="block">
                    <ExecutiveMetric label="Jobs Need Assignment" value={String(jobsNeedingAssignment.length)} icon={<UserPlus className="h-5 w-5" />} description="Open jobs without active crew assignment" tone={jobsNeedingAssignment.length > 0 ? "amber" : "slate"} />
                </Link>
                <Link href="/admin/crm" className="block">
                    <ExecutiveMetric label="Active Leads" value={metrics ? String(metrics.leads) : "--"} icon={<Users className="h-5 w-5" />} description={`${quotes} quote${quotes === 1 ? "" : "s"} issued`} tone="sky" />
                </Link>
            </div>

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4 mb-6">
                <Link href="/admin/schedule" className="block">
                    <ExecutiveMetric label="Jobs" value={metrics ? String(metrics.jobs) : "--"} icon={<Briefcase className="h-5 w-5" />} description="Total job records" tone="slate" />
                </Link>
                <Link href="/admin/quotes" className="block">
                    <ExecutiveMetric label="Quotes" value={metrics ? String(metrics.quotes) : "--"} icon={<CheckCircle className="h-5 w-5" />} description={`${leadQuoteRatio}% lead to quote ratio`} tone="primary" />
                </Link>
                <Link href="/admin/finance" className="block">
                    <ExecutiveMetric label="Invoices" value={metrics ? String(metrics.invoices) : "--"} icon={<ReceiptText className="h-5 w-5" />} description={`${quoteInvoiceRatio}% quote to invoice ratio`} tone="emerald" />
                </Link>
                {sitesEnabled ? (
                    <Link href="/admin/customers?tab=sites" className="block">
                        <ExecutiveMetric label="Sites" value={metrics?.optionalMetrics?.sites ?? "--"} icon={<Building2 className="h-5 w-5" />} description="Customer locations" tone="sky" />
                    </Link>
                ) : null}
                {complianceReports ? (
                    <Link href="/admin/compliance" className="block">
                        <ExecutiveMetric label="Pending Reviews" value={metrics?.optionalMetrics?.compliancePendingReview ?? "--"} icon={<ClipboardCheck className="h-5 w-5" />} description="Compliance reports waiting" tone="amber" />
                    </Link>
                ) : null}
                {renewals ? (
                    <Link href="/admin/renewals" className="block">
                        <ExecutiveMetric label="Open Renewals" value={metrics?.optionalMetrics?.renewalsDue ?? "--"} icon={<RefreshCw className="h-5 w-5" />} description="Due tests/requotes" tone="rose" />
                    </Link>
                ) : null}
            </div>

            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                <GlassCard className="lg:col-span-2">
                    <GlassCardHeader className="flex flex-row items-center justify-between">
                        <div>
                            <GlassCardTitle>Today's Schedule</GlassCardTitle>
                            <GlassCardDescription>Upcoming jobs for your team.</GlassCardDescription>
                        </div>
                        <div className="h-10 w-10 bg-primary/10 rounded-full flex items-center justify-center text-primary">
                            <Calendar className="h-5 w-5" />
                        </div>
                    </GlassCardHeader>
                    <GlassCardContent>
                        <div className="space-y-4">
                            {todaysJobs.length === 0 ? (
                                <div className="flex flex-col items-start gap-3 text-sm text-muted-foreground">
                                    <span>No jobs scheduled for today.</span>
                                    <Button size="sm" className="gap-2" asChild>
                                        <Link href="/admin/schedule?create=job"><Plus className="h-4 w-4" /> Create Job</Link>
                                    </Button>
                                </div>
                            ) : todaysJobs.map((job, i) => (
                                <div key={i} className="flex gap-4 p-3 rounded-lg border border-glass-border bg-white/40 hover:bg-white/60 transition-colors">
                                    <div className="w-20 pt-1 text-sm font-semibold text-primary-dark shrink-0">
                                        {job.scheduledAt ? new Date(job.scheduledAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "TBD"}
                                    </div>
                                    <div className="border-l-2 border-primary/30 pl-4 py-1 flex-1 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                                        <div>
                                            <h4 className="font-semibold text-foreground text-sm tracking-tight">{job.title}</h4>
                                            <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                                                <MapPin className="h-3 w-3" /> {job.location ?? "TBD"} • {customerMap.get(job.customerId) ?? "Customer"}
                                            </p>
                                        </div>
                                        <div className="text-xs font-medium px-2 py-1 rounded-full bg-black/5 self-start sm:self-auto">
                                            {job.status?.toString().replace(/_/g, " ")}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </GlassCardContent>
                </GlassCard>

                <DonutCard title="Assignment Coverage" description="Open jobs with crew assigned." value={assignmentCoverage} total={openJobCount} centerLabel="covered" />
                <BarListCard title="WIP By Category" description="Largest active uninvoiced values." rows={wipCategoryRows} valuePrefix="£" />
            </div>
            <ErrorToast error={error} onClear={() => setError(null)} />
        </PageContainer>
    )
}

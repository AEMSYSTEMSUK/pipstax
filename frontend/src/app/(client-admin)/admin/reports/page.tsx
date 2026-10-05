"use client"

import { useEffect, useMemo, useState } from "react"
import { PageContainer } from "@/components/layout/PageContainer"
import { GlassCard, GlassCardContent, GlassCardHeader, GlassCardTitle, GlassCardDescription } from "@/components/glass/GlassCard"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer,
    AreaChart, Area, PieChart, Pie, Cell, Legend
} from "recharts"
import { Download, CalendarIcon, TrendingUp, TrendingDown } from "lucide-react"
import { apiGet, downloadFile } from "@/lib/api"
import { ErrorToast } from "@/components/shared/ErrorToast"
import { useToast } from "@/components/ui/toast"
import { getModulePermissions } from "@/lib/permission-ui"
import { useTenantFeatures } from "@/components/layout/TenantFeaturesContext"
import { CustomerSiteOption, fetchCustomerSites, formatCustomerSiteLabel } from "@/lib/customer-sites"

const COLORS = ["#0E8585", "#5EC4AC", "#F5A623", "#E5484D", "#30A46C"]

type InsightsResponse = {
    revenueByClient?: Record<string, number>
    revenueByJob?: Record<string, number>
    outstandingInvoices?: {
        count?: number
        total?: number
    }
    leadConversion?: {
        leadToQuoteRate?: number | null
        leadToJobRate?: number | null
    }
    leadSourceBreakdown?: Record<string, number>
    workerPerformance?: Record<string, { jobsCompleted: number; avgCompletionHours: number }>
    contractorCompliance?: Array<unknown>
    pipelineSummary?: Record<string, number>
    monthlyRevenue?: number
    quarterlyRevenue?: number
    splitBilling?: {
        totalLines?: number
        toSendValue?: number
        invoicedValue?: number
        paidValue?: number
        linkedCount?: number
        unlinkedCount?: number
    }
    wip?: {
        count?: number
        totalValue?: number
        byCategory?: Record<string, { count: number; value: number }>
        items?: Array<{
            id: string
            jobNumber?: string | null
            title?: string | null
            status?: string | null
            category?: string | null
            remainingValue?: number
            invoicedValue?: number
            jobValue?: number
        }>
    }
    reportScope?: {
        scoped?: boolean
        customerId?: string
        siteId?: string
        leadMetricsAvailable?: boolean
        contractorComplianceAvailable?: boolean
        splitBillingAvailable?: boolean
    }
}

export default function ReportsPage() {
    const { toast } = useToast()
    const { canView } = getModulePermissions("reports.view", "reports.manage")
    const { sites: sitesEnabled, splitInvoicing } = useTenantFeatures()
    const [dateRange] = useState("Last 6 Months")
    const [insights, setInsights] = useState<InsightsResponse | null>(null)
    const [revenueData, setRevenueData] = useState<any[]>([])
    const [pipelineData, setPipelineData] = useState<any[]>([])
    const [leadSourceData, setLeadSourceData] = useState<any[]>([])
    const [users, setUsers] = useState<any[]>([])
    const [customers, setCustomers] = useState<any[]>([])
    const [customerSites, setCustomerSites] = useState<CustomerSiteOption[]>([])
    const [selectedCustomerId, setSelectedCustomerId] = useState("__all__")
    const [selectedSiteId, setSelectedSiteId] = useState("__all__")
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        const loadLookups = async () => {
            try {
                const [usersRes, customersRes] = await Promise.all([
                    apiGet<any[]>("/users"),
                    apiGet<any[]>("/customers"),
                ])
                setUsers(Array.isArray(usersRes.data) ? usersRes.data : [])
                setCustomers(Array.isArray(customersRes.data) ? customersRes.data : [])
            } catch (err: any) {
                setUsers([])
                setCustomers([])
                setError(err?.message ?? "Failed to load report lookups")
            }
        }

        void loadLookups()
    }, [])

    useEffect(() => {
        const loadSites = async () => {
            if (!sitesEnabled || selectedCustomerId === "__all__") {
                setCustomerSites([])
                setSelectedSiteId("__all__")
                return
            }

            try {
                const sites = await fetchCustomerSites(selectedCustomerId)
                setCustomerSites(sites)
                setSelectedSiteId((prev) => (sites.some((site) => site.id === prev) ? prev : "__all__"))
            } catch (err: any) {
                setCustomerSites([])
                setSelectedSiteId("__all__")
                setError(err?.message ?? "Failed to load customer sites")
            }
        }

        void loadSites()
    }, [selectedCustomerId, sitesEnabled])

    useEffect(() => {
        const load = async () => {
            try {
                const params = new URLSearchParams()
                if (selectedCustomerId !== "__all__") {
                    params.set("customerId", selectedCustomerId)
                }
                if (selectedSiteId !== "__all__") {
                    params.set("siteId", selectedSiteId)
                }

                const query = params.toString()
                const insightsRes = await apiGet<InsightsResponse>(`/reports/insights${query ? `?${query}` : ""}`)
                const data = insightsRes.data
                setInsights(data)

                setPipelineData(
                    Object.entries(data.pipelineSummary || {}).map(([stage, count]) => ({ stage, count }))
                )
                setLeadSourceData(
                    Object.entries(data.leadSourceBreakdown || {}).map(([name, value]) => ({ name, value }))
                )
                setRevenueData([
                    { name: "Month", revenue: data.monthlyRevenue ?? 0, expenses: 0 },
                    { name: "Quarter", revenue: data.quarterlyRevenue ?? 0, expenses: 0 }
                ])
                setError(null)
            } catch (err: any) {
                setError(err?.message ?? "Failed to load reports")
            }
        }

        void load()
    }, [selectedCustomerId, selectedSiteId])

    const handleExport = async (format: "pdf" | "csv") => {
        try {
            const params = new URLSearchParams()
            if (selectedCustomerId !== "__all__") {
                params.set("customerId", selectedCustomerId)
            }
            if (selectedSiteId !== "__all__") {
                params.set("siteId", selectedSiteId)
            }

            const basePath = format === "pdf" ? "/reports/summary.pdf" : "/reports/summary.csv"
            const path = params.toString() ? `${basePath}?${params.toString()}` : basePath
            const blob = await downloadFile(path)
            const url = URL.createObjectURL(blob)
            const link = document.createElement("a")
            link.href = url
            link.download = format === "pdf" ? "summary-report.pdf" : "summary-report.csv"
            document.body.appendChild(link)
            link.click()
            link.remove()
            URL.revokeObjectURL(url)
        } catch (err: any) {
            toast({ title: "Export failed", description: err?.message ?? "Unable to export report.", variant: "error" })
        }
    }

    const topPerformers = useMemo(() => {
        if (!insights?.workerPerformance) return []
        const entries = Object.entries(insights.workerPerformance) as Array<[string, { jobsCompleted: number; avgCompletionHours: number }]>
        return entries
            .map(([userId, stats]) => {
                const user = users.find((u) => u.id === userId)
                const roleLabel = Array.isArray(user?.roles) && user.roles.length > 0
                    ? (user.roles[0].name ?? user.roles[0].code ?? "Field Staff")
                    : "Field Staff"
                return {
                    id: userId,
                    name: user?.fullName ?? "Worker",
                    role: roleLabel,
                    jobsCompleted: stats.jobsCompleted ?? 0,
                    avgCompletionHours: stats.avgCompletionHours ?? 0
                }
            })
            .sort((a, b) => b.jobsCompleted - a.jobsCompleted)
            .slice(0, 6)
    }, [insights, users])

    const leadMetricsAvailable = insights?.reportScope?.leadMetricsAvailable !== false
    const scopedAnalytics = insights?.reportScope?.scoped === true
    const splitBillingAvailable = splitInvoicing && insights?.reportScope?.splitBillingAvailable === true

    return (
        <PageContainer>
            {!canView ? (
                <GlassCard>
                    <GlassCardHeader>
                        <GlassCardTitle>Reports</GlassCardTitle>
                    </GlassCardHeader>
                    <GlassCardContent>You do not have access to view reports.</GlassCardContent>
                </GlassCard>
            ) : (
            <>
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-foreground">Reporting & Business Intelligence</h1>
                    <p className="text-muted-foreground mt-1 text-sm">Analyze revenue, pipeline health, and team performance.</p>
                </div>

                <div className="flex items-center gap-2">
                    <Button variant="outline" className="gap-2 bg-white/40">
                        <CalendarIcon className="h-4 w-4" /> {dateRange}
                    </Button>
                    <Button className="gap-2" onClick={() => handleExport("pdf")}>
                        <Download className="h-4 w-4" /> Export Report
                    </Button>
                </div>
            </div>

            <div className="mb-6 flex flex-col gap-3 md:flex-row md:flex-wrap">
                <Select
                    value={selectedCustomerId}
                    onValueChange={(value) => {
                        setSelectedCustomerId(value)
                        setSelectedSiteId("__all__")
                    }}
                >
                    <SelectTrigger className="w-full md:w-[240px] bg-white/40">
                        <SelectValue placeholder="All clients" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="__all__">All clients</SelectItem>
                        {customers.map((customer) => (
                            <SelectItem key={customer.id} value={customer.id}>
                                {customer.name ?? customer.email ?? "Customer"}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>

                {sitesEnabled ? (
                    <Select value={selectedSiteId} onValueChange={setSelectedSiteId}>
                        <SelectTrigger className="w-full md:w-[260px] bg-white/40" disabled={selectedCustomerId === "__all__"}>
                            <SelectValue placeholder={selectedCustomerId === "__all__" ? "Select client first" : "All sites"} />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="__all__">All sites</SelectItem>
                            {customerSites.map((site) => (
                                <SelectItem key={site.id} value={site.id}>
                                    {formatCustomerSiteLabel(site)}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                ) : null}
            </div>

            {scopedAnalytics && !leadMetricsAvailable ? (
                <GlassCard className="mb-6 border border-amber-200/70 bg-amber-50/70">
                    <GlassCardContent className="flex flex-col gap-2 p-4 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                            <p className="text-sm font-semibold text-amber-900">Filtered reporting uses scoped operational data.</p>
                            <p className="text-sm text-amber-800/90">
                                Lead conversion and lead source charts are hidden for customer/site scoped reports so the numbers do not overstate performance.
                            </p>
                        </div>
                        <Badge variant="outline" className="border-amber-300 bg-white/70 text-amber-900">
                            Scoped analytics
                        </Badge>
                    </GlassCardContent>
                </GlassCard>
            ) : null}

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                <GlassCard className="p-5 flex flex-col justify-center">
                    <p className="text-sm font-medium text-muted-foreground mb-1">Total Revenue (MTD)</p>
                    <h3 className="text-2xl font-bold">£{Number(insights?.monthlyRevenue ?? 0).toLocaleString()}</h3>
                    <p className="text-xs text-success flex items-center mt-2 font-medium">
                        <TrendingUp className="h-3 w-3 mr-1" /> Recorded payments this month
                    </p>
                </GlassCard>
                <GlassCard className="p-5 flex flex-col justify-center">
                    <p className="text-sm font-medium text-muted-foreground mb-1">Win Rate</p>
                    <h3 className="text-2xl font-bold">
                        {leadMetricsAvailable
                            ? `${(((insights?.leadConversion?.leadToJobRate ?? 0) as number) * 100).toFixed(1)}%`
                            : "N/A"}
                    </h3>
                    <p className="text-xs text-success flex items-center mt-2 font-medium">
                        <TrendingUp className="h-3 w-3 mr-1" />
                        {leadMetricsAvailable ? "Lead to job conversion" : "Hidden for scoped reporting"}
                    </p>
                </GlassCard>
                <GlassCard className="p-5 flex flex-col justify-center">
                    <p className="text-sm font-medium text-muted-foreground mb-1">Avg. Job Value</p>
                    <h3 className="text-2xl font-bold">£{Number(insights?.revenueByJob ? Object.values(insights.revenueByJob).reduce((a: number, b: any) => a + Number(b), 0) / (Object.keys(insights.revenueByJob).length || 1) : 0).toFixed(0)}</h3>
                    <p className="text-xs text-muted-foreground flex items-center mt-2 font-medium">
                        <TrendingDown className="h-3 w-3 mr-1" /> Based on recorded payments
                    </p>
                </GlassCard>
                <GlassCard className="p-5 flex flex-col justify-center">
                    <p className="text-sm font-medium text-muted-foreground mb-1">Outstanding Invoices</p>
                    <h3 className="text-2xl font-bold text-primary">£{Number(insights?.outstandingInvoices?.total ?? 0).toLocaleString()}</h3>
                    <p className="text-xs text-muted-foreground mt-2">Across {insights?.outstandingInvoices?.count ?? 0} invoices</p>
                </GlassCard>
            </div>

            <GlassCard className="mb-6" id="wip">
                <GlassCardHeader>
                    <GlassCardTitle>Work In Progress</GlassCardTitle>
                    <GlassCardDescription>Active job value that has not yet been fully invoiced.</GlassCardDescription>
                </GlassCardHeader>
                <GlassCardContent>
                    <div className="grid gap-4 lg:grid-cols-3">
                        <div className="rounded-2xl border border-glass-border bg-white/50 p-4">
                            <p className="text-sm font-medium text-muted-foreground">Total WIP Value</p>
                            <p className="mt-2 text-3xl font-bold text-primary">£{Number(insights?.wip?.totalValue ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
                            <p className="mt-1 text-xs text-muted-foreground">{insights?.wip?.count ?? 0} active jobs with remaining billable value</p>
                        </div>
                        <div className="rounded-2xl border border-glass-border bg-white/50 p-4 lg:col-span-2">
                            <p className="text-sm font-semibold text-foreground">Summary by category</p>
                            <div className="mt-3 grid gap-2 md:grid-cols-2">
                                {Object.entries(insights?.wip?.byCategory ?? {}).length === 0 ? (
                                    <p className="text-sm text-muted-foreground">No active WIP value at the moment.</p>
                                ) : Object.entries(insights?.wip?.byCategory ?? {}).map(([category, row]) => (
                                    <div key={category} className="flex items-center justify-between rounded-xl bg-white/70 px-3 py-2 text-sm">
                                        <span className="font-medium">{category}</span>
                                        <span className="text-muted-foreground">{row.count} jobs • £{Number(row.value ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </GlassCardContent>
            </GlassCard>

            {splitBillingAvailable ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                    <GlassCard className="p-5 flex flex-col justify-center">
                        <p className="text-sm font-medium text-muted-foreground mb-1">Split To Send</p>
                        <h3 className="text-2xl font-bold">£{Number(insights?.splitBilling?.toSendValue ?? 0).toLocaleString()}</h3>
                        <p className="text-xs text-muted-foreground mt-2">Commercial value not invoiced yet</p>
                    </GlassCard>
                    <GlassCard className="p-5 flex flex-col justify-center">
                        <p className="text-sm font-medium text-muted-foreground mb-1">Split Invoiced</p>
                        <h3 className="text-2xl font-bold">£{Number(insights?.splitBilling?.invoicedValue ?? 0).toLocaleString()}</h3>
                        <p className="text-xs text-muted-foreground mt-2">Value already billed from split lines</p>
                    </GlassCard>
                    <GlassCard className="p-5 flex flex-col justify-center">
                        <p className="text-sm font-medium text-muted-foreground mb-1">Split Paid</p>
                        <h3 className="text-2xl font-bold">£{Number(insights?.splitBilling?.paidValue ?? 0).toLocaleString()}</h3>
                        <p className="text-xs text-success flex items-center mt-2 font-medium">
                            <TrendingUp className="h-3 w-3 mr-1" /> Paid commercial milestones
                        </p>
                    </GlassCard>
                    <GlassCard className="p-5 flex flex-col justify-center">
                        <p className="text-sm font-medium text-muted-foreground mb-1">Split Unlinked</p>
                        <h3 className="text-2xl font-bold">{Number(insights?.splitBilling?.unlinkedCount ?? 0).toLocaleString()}</h3>
                        <p className="text-xs text-muted-foreground mt-2">
                            {Number(insights?.splitBilling?.totalLines ?? 0).toLocaleString()} split lines tracked
                        </p>
                    </GlassCard>
                </div>
            ) : null}

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
                <GlassCard>
                    <GlassCardHeader>
                        <GlassCardTitle>Revenue vs Expenses</GlassCardTitle>
                        <GlassCardDescription>Monthly financial snapshot</GlassCardDescription>
                    </GlassCardHeader>
                    <GlassCardContent>
                        <div className="h-[300px] w-full mt-4">
                            <ResponsiveContainer width="100%" height="100%">
                                <AreaChart data={revenueData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                                    <defs>
                                        <linearGradient id="colorRev" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="#0E8585" stopOpacity={0.3} />
                                            <stop offset="95%" stopColor="#0E8585" stopOpacity={0} />
                                        </linearGradient>
                                        <linearGradient id="colorExp" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="#E5484D" stopOpacity={0.1} />
                                            <stop offset="95%" stopColor="#E5484D" stopOpacity={0} />
                                        </linearGradient>
                                    </defs>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(0,0,0,0.05)" />
                                    <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: "#6B7A8D" }} dy={10} />
                                    <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: "#6B7A8D" }} tickFormatter={(value) => `£${value / 1000}k`} />
                                    <RechartsTooltip
                                        contentStyle={{ borderRadius: "12px", border: "1px solid rgba(255,255,255,0.4)", background: "rgba(255,255,255,0.9)", backdropFilter: "blur(8px)", boxShadow: "0 4px 20px rgba(0,0,0,0.08)" }}
                                        formatter={(value: any) => [`£${value}`, undefined]}
                                    />
                                    <Legend iconType="circle" wrapperStyle={{ paddingTop: "20px", fontSize: "12px" }} />
                                    <Area type="monotone" dataKey="revenue" name="Revenue" stroke="#0E8585" strokeWidth={3} fillOpacity={1} fill="url(#colorRev)" />
                                    <Area type="monotone" dataKey="expenses" name="Expenses" stroke="#E5484D" strokeWidth={2} fillOpacity={1} fill="url(#colorExp)" />
                                </AreaChart>
                            </ResponsiveContainer>
                        </div>
                    </GlassCardContent>
                </GlassCard>

                <GlassCard>
                    <GlassCardHeader>
                        <GlassCardTitle>Sales Pipeline Funnel</GlassCardTitle>
                        <GlassCardDescription>Lead conversion across stages</GlassCardDescription>
                    </GlassCardHeader>
                    <GlassCardContent>
                        <div className="h-[300px] w-full mt-4">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={pipelineData} layout="vertical" margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                                    <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="rgba(0,0,0,0.05)" />
                                    <XAxis type="number" hide />
                                    <YAxis dataKey="stage" type="category" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: "#1A2B3C", fontWeight: 500 }} width={100} />
                                    <RechartsTooltip
                                        cursor={{ fill: "rgba(0,0,0,0.02)" }}
                                        contentStyle={{ borderRadius: "12px", border: "1px solid rgba(255,255,255,0.4)", background: "rgba(255,255,255,0.9)", boxShadow: "0 4px 20px rgba(0,0,0,0.08)" }}
                                    />
                                    <Bar dataKey="count" fill="#5EC4AC" radius={[0, 4, 4, 0]} barSize={24}>
                                        {pipelineData.map((entry, index) => (
                                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                        ))}
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </GlassCardContent>
                </GlassCard>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <GlassCard className="lg:col-span-1">
                    <GlassCardHeader>
                        <GlassCardTitle>Lead Sources</GlassCardTitle>
                        {!leadMetricsAvailable ? (
                            <GlassCardDescription>Not shown while customer/site filters are active.</GlassCardDescription>
                        ) : null}
                    </GlassCardHeader>
                    <GlassCardContent>
                        {leadMetricsAvailable ? (
                            <div className="h-[250px] w-full">
                                <ResponsiveContainer width="100%" height="100%">
                                    <PieChart>
                                        <Pie
                                            data={leadSourceData}
                                            cx="50%"
                                            cy="50%"
                                            innerRadius={60}
                                            outerRadius={80}
                                            paddingAngle={5}
                                            dataKey="value"
                                            stroke="none"
                                        >
                                            {leadSourceData.map((entry, index) => (
                                                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                            ))}
                                        </Pie>
                                        <RechartsTooltip
                                            contentStyle={{ borderRadius: "8px", border: "1px solid rgba(255,255,255,0.4)" }}
                                        />
                                        <Legend verticalAlign="bottom" height={36} iconType="circle" wrapperStyle={{ fontSize: "12px" }} />
                                    </PieChart>
                                </ResponsiveContainer>
                            </div>
                        ) : (
                            <div className="flex h-[250px] items-center justify-center rounded-2xl border border-dashed border-amber-200/80 bg-amber-50/40 px-6 text-center text-sm text-amber-900/85">
                                Lead source analytics are available in workspace-wide reporting and are intentionally hidden for customer/site scoped views.
                            </div>
                        )}
                    </GlassCardContent>
                </GlassCard>

                <GlassCard className="lg:col-span-2">
                    <GlassCardHeader className="flex flex-row items-center justify-between pb-2">
                        <div>
                            <GlassCardTitle>Top Performing Field Staff</GlassCardTitle>
                            <GlassCardDescription>Based on completed jobs</GlassCardDescription>
                        </div>
                    </GlassCardHeader>
                    <GlassCardContent className="p-0">
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm text-left">
                                <thead className="bg-black/5 text-muted-foreground text-xs uppercase font-semibold">
                                    <tr>
                                        <th className="px-4 py-3 rounded-tl-xl border-b border-glass-border">Name</th>
                                        <th className="px-4 py-3 border-b border-glass-border">Role</th>
                                        <th className="px-4 py-3 border-b border-glass-border">Jobs Completed</th>
                                        <th className="px-4 py-3 rounded-tr-xl border-b border-glass-border text-right">Avg Completion (hrs)</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-glass-border/50">
                                    {topPerformers.length === 0 ? (
                                        <tr>
                                            <td className="px-4 py-6 text-sm text-muted-foreground" colSpan={4}>No performance data available yet.</td>
                                        </tr>
                                    ) : (
                                        topPerformers.map((staff) => (
                                            <tr key={staff.id} className="hover:bg-white/40 transition-colors">
                                                <td className="px-4 py-3 font-medium flex items-center gap-2">
                                                    <div className="h-6 w-6 rounded-full bg-primary/20 text-primary-dark flex items-center justify-center text-[10px] font-bold">
                                                        {staff.name.split(" ").map((p: string) => p[0]).slice(0, 2).join("")}
                                                    </div>
                                                    {staff.name}
                                                </td>
                                                <td className="px-4 py-3 text-muted-foreground">{staff.role}</td>
                                                <td className="px-4 py-3 font-semibold">{staff.jobsCompleted}</td>
                                                <td className="px-4 py-3 text-right font-medium">{Number(staff.avgCompletionHours).toFixed(1)}</td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </GlassCardContent>
                </GlassCard>
            </div>
            <ErrorToast error={error} onClear={() => setError(null)} />
            </>
            )}
        </PageContainer>
    )
}

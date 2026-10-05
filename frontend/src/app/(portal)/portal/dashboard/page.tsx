"use client"

import { useEffect, useState } from "react"
import { PageContainer } from "@/components/layout/PageContainer"
import { GlassCard, GlassCardContent, GlassCardHeader, GlassCardTitle } from "@/components/glass/GlassCard"
import { Button } from "@/components/ui/button"
import { apiGet } from "@/lib/api"
import { getPortalToken } from "@/lib/auth"
import { CreditCard, FileText, HardHat, ChevronRight, CheckCircle2, Clock, Sparkles, AlertTriangle } from "lucide-react"
import { StatusBadge } from "@/components/shared/StatusBadge"
import Link from "next/link"
import { ErrorToast } from "@/components/shared/ErrorToast"
import { BarListCard, DonutCard, ExecutiveMetric, formatCurrency } from "@/components/shared/DashboardVisuals"

type PortalCustomer = {
    id: string
    name?: string
    email?: string
    portalToken?: string
}

type PortalScopeSite = {
    id: string
    name: string
    reference?: string
    category?: string
}

type PortalScope = {
    siteScoped?: boolean
    mode?: "all-sites" | "selected-sites"
    allowedSiteIds?: string[]
    sites?: PortalScopeSite[]
}

type PortalProfileResponse = {
    customer: PortalCustomer
    portalScope?: PortalScope
}

type PortalTenant = {
    name?: string
    tradingName?: string
    logoUrl?: string
    primaryColor?: string
}

type PortalQuote = {
    id: string
    status?: string
    workflowBaseStatus?: string
    workflowBaseStatusLabel?: string
    workflowStatusLabel?: string
    total?: number
    publicToken?: string
    createdAt?: string
    siteName?: string | null
    siteReference?: string | null
}

type PortalInvoice = {
    id: string
    invoiceNumber?: string
    status?: string
    workflowBaseStatus?: string
    workflowBaseStatusLabel?: string
    workflowStatusLabel?: string
    total?: number
    dueDate?: string
    createdAt?: string
    siteName?: string | null
    siteReference?: string | null
}

type PortalJob = {
    id: string
    jobNumber?: string | null
    title?: string | null
    status?: string
    workflowBaseStatus?: string
    workflowBaseStatusLabel?: string
    workflowStatusLabel?: string
    scheduledAt?: string
    scheduledEndAt?: string
    siteName?: string | null
    siteReference?: string | null
}

export default function PortalDashboard() {
    const [customer, setCustomer] = useState<PortalCustomer | null>(null)
    const [portalScope, setPortalScope] = useState<PortalScope | null>(null)
    const [quotes, setQuotes] = useState<PortalQuote[]>([])
    const [invoices, setInvoices] = useState<PortalInvoice[]>([])
    const [jobs, setJobs] = useState<PortalJob[]>([])
    const [error, setError] = useState<string | null>(null)

    const portalToken = getPortalToken()

    useEffect(() => {
        if (!portalToken) return
        const load = async () => {
            try {
                const [profileRes, quoteRes, invoiceRes, jobRes] = await Promise.all([
                    apiGet<PortalProfileResponse>(`/portal/${portalToken}/profile`),
                    apiGet<PortalQuote[]>(`/portal/${portalToken}/quotes`),
                    apiGet<PortalInvoice[]>(`/portal/${portalToken}/invoices`),
                    apiGet<PortalJob[]>(`/portal/${portalToken}/jobs`)
                ])
                const profileData = profileRes.data
                setCustomer(profileData?.customer ?? null)
                setPortalScope(profileData?.portalScope ?? null)
                setQuotes(Array.isArray(quoteRes.data) ? quoteRes.data : [])
                setInvoices(
                    Array.isArray(invoiceRes.data)
                        ? invoiceRes.data.filter((invoice) => String(invoice.workflowBaseStatus ?? invoice.status ?? "").toUpperCase() !== "DRAFT")
                        : []
                )
                setJobs(Array.isArray(jobRes.data) ? jobRes.data : [])
                setError(null)
            } catch (err: any) {
                setError(err?.message ?? "Failed to load portal data")
            }
        }
        load()
    }, [portalToken])

    const getQuoteBaseStatus = (quote: PortalQuote) => String(quote.workflowBaseStatus ?? quote.status ?? "").toUpperCase()
    const getQuoteBaseStatusLabel = (quote: PortalQuote) => quote.workflowBaseStatusLabel ?? quote.status ?? "Draft"
    const getQuoteStatusLabel = (quote: PortalQuote) => quote.workflowStatusLabel ?? getQuoteBaseStatusLabel(quote)
    const getInvoiceBaseStatus = (invoice: PortalInvoice) => String(invoice.workflowBaseStatus ?? invoice.status ?? "").toUpperCase()
    const getInvoiceBaseStatusLabel = (invoice: PortalInvoice) => invoice.workflowBaseStatusLabel ?? invoice.status ?? "Draft"
    const getInvoiceStatusLabel = (invoice: PortalInvoice) => invoice.workflowStatusLabel ?? getInvoiceBaseStatusLabel(invoice)
    const getJobBaseStatus = (job: PortalJob) => String(job.workflowBaseStatus ?? job.status ?? "").toUpperCase()
    const getJobBaseStatusLabel = (job: PortalJob) => job.workflowBaseStatusLabel ?? job.status ?? "Not Assigned"
    const getJobStatusLabel = (job: PortalJob) => job.workflowStatusLabel ?? getJobBaseStatusLabel(job)

    const activeJobs = jobs.filter((job) => !["COMPLETED", "CANCELLED"].includes(getJobBaseStatus(job)))
    const pendingInvoices = invoices.filter((invoice) => !["PAID", "VOID"].includes(getInvoiceBaseStatus(invoice)))
    const overdueInvoices = invoices.filter((invoice) => getInvoiceBaseStatus(invoice) === "OVERDUE")
    const attentionJobs = activeJobs.filter((job) => getJobBaseStatus(job) === "REQUIRES_FOLLOW_UP")
    const openQuotes = quotes.filter((quote) => ["SENT", "VIEWED"].includes(getQuoteBaseStatus(quote)))

    const totalDue = pendingInvoices.reduce((acc, curr) => acc + Number(curr.total ?? 0), 0);
    const paidInvoices = invoices.filter((invoice) => getInvoiceBaseStatus(invoice) === "PAID")
    const statusRows = [
        { label: "Active projects", value: activeJobs.length, meta: "Scheduled or in progress" },
        { label: "Pending invoices", value: pendingInvoices.length, meta: "Awaiting payment" },
        { label: "Pending quotes", value: openQuotes.length, meta: "Awaiting approval" },
        { label: "Attention needed", value: attentionJobs.length + overdueInvoices.length, meta: "Jobs or payments needing action" },
    ]
    const recentInvoices = [...invoices]
        .sort((a, b) => new Date(b.createdAt ?? b.dueDate ?? 0).getTime() - new Date(a.createdAt ?? a.dueDate ?? 0).getTime())
        .slice(0, 3)
    const upcomingActiveJobs = [...activeJobs]
        .sort((a, b) => new Date(a.scheduledAt ?? 8640000000000000).getTime() - new Date(b.scheduledAt ?? 8640000000000000).getTime())
        .slice(0, 3)
    const accountStatus = overdueInvoices.length > 0
        ? {
            value: "Payment Due",
            description: `${overdueInvoices.length} overdue invoice(s)`,
            className: "border-destructive/30 bg-destructive/5",
        }
        : attentionJobs.length > 0
            ? {
                value: "Needs Attention",
                description: `${attentionJobs.length} job(s) need review`,
                className: "border-amber-200 bg-amber-50/30",
            }
            : {
                value: "Good Standing",
                description: pendingInvoices.length > 0 ? `${pendingInvoices.length} invoice(s) awaiting payment` : "No overdue actions",
                className: "border-success/30 bg-success/5",
            }

    return (
        <PageContainer>
            <div className="mb-8 overflow-hidden rounded-[34px] border border-glass-border/70 bg-gradient-to-br from-white via-white/80 to-primary/10 p-6 shadow-xl shadow-slate-200/50">
                <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
                    <div>
                        <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-xs font-bold uppercase tracking-[0.18em] text-primary">
                            <Sparkles className="h-3.5 w-3.5" /> Customer Portal
                        </div>
                        <h1 className="text-4xl font-semibold tracking-tight text-foreground">
                            Welcome back{customer?.name ? `, ${customer.name}` : ""}
                        </h1>
                        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
                            A clear view of your active projects, quotes, invoices, and account status.
                        </p>
                    </div>
                    <Button variant="outline" className="bg-white/70" asChild>
                        <Link href="/portal/tickets">Need help?</Link>
                    </Button>
                </div>
                {portalScope?.siteScoped ? (
                    <div className="mt-4 rounded-2xl border border-glass-border/70 bg-white/45 px-4 py-3 text-sm text-muted-foreground">
                        {portalScope.mode === "selected-sites"
                            ? `Portal access is currently limited to ${portalScope.sites?.length ?? 0} site(s): ${(portalScope.sites ?? []).map((site) => site.name).join(", ") || "no active sites configured"}.`
                            : "Portal access currently covers all sites linked to your customer account."}
                    </div>
                ) : null}
                <ErrorToast error={error} onClear={() => setError(null)} />
            </div>

            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4 mb-8">
                <ExecutiveMetric
                    label="Total Balance Due"
                    value={formatCurrency(totalDue)}
                    icon={<CreditCard className="h-5 w-5" />}
                    description={pendingInvoices.length > 0 ? `${pendingInvoices.length} unpaid invoice(s)` : 'All clear!'}
                    tone={pendingInvoices.length > 0 ? "amber" : "emerald"}
                />
                <ExecutiveMetric
                    label="Active Projects"
                    value={activeJobs.length.toString()}
                    icon={<HardHat className="h-5 w-5" />}
                    description="Currently scheduled or in progress"
                    tone="sky"
                />
                <ExecutiveMetric
                    label="Pending Quotes"
                    value={openQuotes.length.toString()}
                    icon={<FileText className="h-5 w-5" />}
                    description="Awaiting your approval"
                    tone="primary"
                />
                <ExecutiveMetric
                    label="Account Status"
                    value={accountStatus.value}
                    icon={overdueInvoices.length > 0 ? <AlertTriangle className="h-5 w-5" /> : <CheckCircle2 className="h-5 w-5" />}
                    description={accountStatus.description}
                    tone={overdueInvoices.length > 0 ? "rose" : "emerald"}
                />
            </div>

            <div className="mb-6 grid gap-6 lg:grid-cols-3">
                <DonutCard title="Invoice Health" description="Paid invoices as a share of visible invoices." value={paidInvoices.length} total={invoices.length} centerLabel="paid" />
                <BarListCard title="Account Snapshot" description="Current customer activity levels." rows={statusRows} />
                <GlassCard className="bg-white/70">
                    <GlassCardHeader>
                        <GlassCardTitle className="text-lg">Quick Actions</GlassCardTitle>
                    </GlassCardHeader>
                    <GlassCardContent className="grid gap-3">
                        <Button variant="outline" className="justify-between bg-white/60" asChild><Link href="/portal/jobs">View jobs <ChevronRight className="h-4 w-4" /></Link></Button>
                        <Button variant="outline" className="justify-between bg-white/60" asChild><Link href="/portal/quotes">Review quotes <ChevronRight className="h-4 w-4" /></Link></Button>
                        <Button variant="outline" className="justify-between bg-white/60" asChild><Link href="/portal/invoices">View invoices <ChevronRight className="h-4 w-4" /></Link></Button>
                    </GlassCardContent>
                </GlassCard>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <GlassCard>
                    <GlassCardHeader className="flex flex-row items-center justify-between pb-3 border-b border-glass-border">
                        <GlassCardTitle className="text-lg">Recent Invoices</GlassCardTitle>
                        <Button variant="outline" size="sm" asChild className="h-8 text-xs bg-white/40">
                            <Link href="/portal/invoices">View All</Link>
                        </Button>
                    </GlassCardHeader>
                    <GlassCardContent className="p-0">
                        <div className="divide-y divide-glass-border">
                            {recentInvoices.length === 0 ? (
                                <div className="p-8 text-center text-muted-foreground">
                                    <p>No customer-visible invoices yet.</p>
                                </div>
                            ) : recentInvoices.map(invoice => (
                                <Link key={invoice.id} href={`/portal/invoices/${invoice.id}`} className="p-4 hover:bg-white/30 transition-colors flex items-center justify-between group">
                                    <div className="flex gap-4 items-center">
                                        <div className={`h-10 w-10 rounded-full flex items-center justify-center ${getInvoiceBaseStatus(invoice) === 'PAID' ? 'bg-success/10 text-success' : 'bg-amber-100 text-amber-600'}`}>
                                            <FileText className="h-5 w-5" />
                                        </div>
                                        <div>
                                            <p className="font-semibold text-sm group-hover:text-primary transition-colors">
                                                {invoice.invoiceNumber ?? "INV-PENDING"}
                                            </p>
                                            <p className="text-xs text-muted-foreground flex items-center gap-1">Due {invoice.dueDate ?? "TBD"}</p>
                                            {invoice.siteName ? (
                                                <p className="text-[11px] text-muted-foreground">
                                                    {invoice.siteName}{invoice.siteReference ? ` • ${invoice.siteReference}` : ""}
                                                </p>
                                            ) : null}
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <p className="font-bold text-sm">£{Number(invoice.total ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
                                        <StatusBadge status={getInvoiceBaseStatusLabel(invoice)} className="mt-1 shadow-sm text-[10px] px-1.5 h-4">
                                            {getInvoiceStatusLabel(invoice)}
                                        </StatusBadge>
                                    </div>
                                </Link>
                            ))}
                        </div>
                    </GlassCardContent>
                </GlassCard>

                <GlassCard>
                    <GlassCardHeader className="flex flex-row items-center justify-between pb-3 border-b border-glass-border">
                        <GlassCardTitle className="text-lg">Active Jobs</GlassCardTitle>
                        <Button variant="outline" size="sm" asChild className="h-8 text-xs bg-white/40">
                            <Link href="/portal/jobs">View History</Link>
                        </Button>
                    </GlassCardHeader>
                    <GlassCardContent className="p-0">
                        <div className="divide-y divide-glass-border">
                            {activeJobs.length === 0 ? (
                                <div className="p-8 text-center text-muted-foreground">
                                    <p>No active jobs at the moment.</p>
                                </div>
                            ) : (
                                upcomingActiveJobs.map(job => (
                                    <Link key={job.id} href={`/portal/jobs/${job.id}`} className="block p-4 hover:bg-white/30 transition-colors group">
                                        <div className="flex flex-col gap-2">
                                        <div className="flex justify-between items-start">
                                            <div className="space-y-1">
                                                <StatusBadge status={getJobBaseStatusLabel(job)} className="shadow-sm">
                                                    {getJobStatusLabel(job)}
                                                </StatusBadge>
                                                <p className="text-sm font-semibold text-foreground">{job.title ?? job.jobNumber ?? "Job"}</p>
                                            </div>
                                            <span className="text-xs text-muted-foreground">
                                                {job.scheduledAt ? new Date(job.scheduledAt).toLocaleDateString() : "TBD"}
                                            </span>
                                        </div>
                                        <div className="flex justify-between items-center text-xs text-muted-foreground mt-1">
                                            <span className="flex items-center gap-1">
                                                <Clock className="h-3 w-3" />
                                                {job.scheduledAt ? new Date(job.scheduledAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "TBD"}
                                            </span>
                                            <span className="flex items-center gap-1 text-primary group-hover:underline">View Details <ChevronRight className="h-3 w-3" /></span>
                                        </div>
                                        {job.siteName ? (
                                            <div className="text-[11px] text-muted-foreground">
                                                Site: {job.siteName}{job.siteReference ? ` • ${job.siteReference}` : ""}
                                            </div>
                                        ) : null}
                                        </div>
                                    </Link>
                                ))
                            )}
                        </div>
                    </GlassCardContent>
                </GlassCard>
            </div>
        </PageContainer>
    )
}

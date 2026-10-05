"use client"

import { use, useEffect, useState } from "react"
import Link from "next/link"
import { PageContainer } from "@/components/layout/PageContainer"
import { GlassCard, GlassCardContent, GlassCardHeader, GlassCardTitle, GlassCardDescription } from "@/components/glass/GlassCard"
import { Button } from "@/components/ui/button"
import { StatusBadge } from "@/components/shared/StatusBadge"
import { ErrorToast } from "@/components/shared/ErrorToast"
import { BrowserBackButton } from "@/components/shared/BrowserBackButton"
import { apiGet } from "@/lib/api"
import { getPortalToken } from "@/lib/auth"
import { ArrowLeft, BriefcaseBusiness, Calendar, CheckCircle2, Clock, ExternalLink, FileText, Info, MapPin, MessageSquare, Navigation, Receipt, ShieldCheck, Wrench } from "lucide-react"
import { useTenantFeatures } from "@/components/layout/TenantFeaturesContext"

type PortalJob = {
    id: string
    jobNumber?: string | null
    title?: string | null
    description?: string | null
    status?: string | null
    workflowBaseStatus?: string | null
    workflowBaseStatusLabel?: string | null
    workflowStatusLabel?: string | null
    priority?: string | null
    amount?: number | string | null
    scheduledAt?: string | null
    scheduledEndAt?: string | null
    completedAt?: string | null
    location?: string | null
    addressLine1?: string | null
    addressLine2?: string | null
    city?: string | null
    state?: string | null
    postalCode?: string | null
    country?: string | null
    siteName?: string | null
    siteReference?: string | null
    siteAddress?: string | null
    createdAt?: string | null
    updatedAt?: string | null
    relatedQuotes?: RelatedQuote[]
    relatedInvoices?: RelatedInvoice[]
    complianceRecords?: RelatedComplianceRecord[]
}

type RelatedQuote = {
    id: string
    quoteNumber?: string | null
    title?: string | null
    status?: string | null
    workflowBaseStatusLabel?: string | null
    workflowStatusLabel?: string | null
    total?: number | string | null
    validUntil?: string | null
    createdAt?: string | null
}

type RelatedInvoice = {
    id: string
    invoiceNumber?: string | null
    title?: string | null
    status?: string | null
    workflowBaseStatusLabel?: string | null
    workflowStatusLabel?: string | null
    total?: number | string | null
    dueDate?: string | null
    createdAt?: string | null
}

type RelatedComplianceRecord = {
    id: string
    title?: string | null
    reportType?: string | null
    reference?: string | null
    outcome?: string | null
    reviewStatus?: string | null
    testedAt?: string | null
    validUntil?: string | null
    documentName?: string | null
    documentFileUrl?: string | null
}

const formatDate = (value?: string | null) => {
    if (!value) return "TBD"
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return "TBD"
    return date.toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" })
}

const formatTime = (value?: string | null) => {
    if (!value) return "TBD"
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return "TBD"
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
}

const formatDateTime = (value?: string | null) => {
    if (!value) return "TBD"
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return "TBD"
    return date.toLocaleString(undefined, { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })
}

const formatMoney = (value?: number | string | null) => {
    if (value === null || typeof value === "undefined" || value === "") return "Not confirmed"
    const numeric = typeof value === "number" ? value : Number(value)
    if (!Number.isFinite(numeric)) return "Not confirmed"
    return new Intl.NumberFormat(undefined, { style: "currency", currency: "GBP" }).format(numeric)
}

const getStatusStep = (status: string) => {
    switch (status) {
        case "ASSIGNED": return 1
        case "LIVE": return 2
        case "REQUIRES_FOLLOW_UP": return 3
        case "FINISHED": return 4
        case "COMPLETED": return 5
        default: return 0
    }
}

const getJobUpdateMessage = (baseStatus: string) => {
    switch (baseStatus) {
        case "COMPLETED":
            return "This job has been closed by the office team. Any final paperwork or invoices will be available from your portal."
        case "FINISHED":
            return "The field work has been finished and our office team is preparing the final closeout."
        case "REQUIRES_FOLLOW_UP":
            return "The field team has flagged that this job needs attention. Our office team is reviewing the next steps."
        case "LIVE":
            return "Our team is currently working on this job."
        case "ASSIGNED":
            return "This job has been assigned to the field team and is ready for delivery."
        case "CANCELLED":
            return "This job has been cancelled. Please contact support if you need more information."
        default:
            return "This job is being prepared by the office team."
    }
}

export default function PortalJobDetail({ params }: { params: Promise<{ id: string }> }) {
    const resolvedParams = use(params)
    const [job, setJob] = useState<PortalJob | null>(null)
    const [error, setError] = useState<string | null>(null)
    const { sites: sitesEnabled } = useTenantFeatures()
    const portalToken = getPortalToken()

    useEffect(() => {
        if (!portalToken) return
        const load = async () => {
            try {
                const res = await apiGet<PortalJob>(`/portal/${portalToken}/jobs/${resolvedParams.id}`)
                setJob(res.data ?? null)
                setError(null)
            } catch (err: any) {
                setError(err?.message ?? "Failed to load job")
            }
        }
        load()
    }, [portalToken, resolvedParams.id])

    if (!job) {
        return (
            <PageContainer>
                <div className="text-center p-12">Job not found</div>
                <ErrorToast error={error} onClear={() => setError(null)} />
            </PageContainer>
        )
    }

    const baseStatus = String(job.workflowBaseStatus ?? job.status ?? "").toUpperCase()
    const baseStatusLabel = job.workflowBaseStatusLabel ?? job.status ?? "Not Assigned"
    const statusLabel = job.workflowStatusLabel ?? baseStatusLabel
    const step = getStatusStep(baseStatus)
    const formattedAddress = [job.addressLine1, job.addressLine2, job.city, job.state, job.postalCode, job.country]
        .map((part) => String(part ?? "").trim())
        .filter(Boolean)
        .join(", ")
    const address = ((sitesEnabled ? job.siteAddress : null) ?? formattedAddress) || job.location || "Address to be confirmed"
    const jobReference = job.jobNumber ?? "Job pending"
    const relatedQuotes = Array.isArray(job.relatedQuotes) ? job.relatedQuotes : []
    const relatedInvoices = Array.isArray(job.relatedInvoices) ? job.relatedInvoices : []
    const complianceRecords = Array.isArray(job.complianceRecords) ? job.complianceRecords : []

    return (
        <PageContainer>
            <div className="mb-6">
                <BrowserBackButton className="text-sm font-medium text-primary hover:text-primary-dark transition-colors inline-flex items-center gap-1 mb-4">
                    <ArrowLeft className="h-3 w-3" /> Back to Jobs
                </BrowserBackButton>

                <GlassCard className="overflow-hidden border-primary/20 bg-gradient-to-br from-white/75 via-white/55 to-primary/10">
                    <GlassCardContent className="p-6 md:p-8">
                        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-6">
                            <div className="space-y-4">
                                <div className="flex flex-wrap items-center gap-2">
                                    <span className="inline-flex items-center rounded-full bg-primary px-3 py-1 text-xs font-bold text-white shadow-sm">
                                        {jobReference}
                                    </span>
                                    <StatusBadge status={baseStatusLabel} className="shadow-sm">
                                        {statusLabel}
                                    </StatusBadge>
                                </div>
                                <div>
                                    <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-foreground">{job.title ?? "Job"}</h1>
                                    <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
                                        {job.description || getJobUpdateMessage(baseStatus)}
                                    </p>
                                </div>
                            </div>
                            <div className="rounded-2xl border border-glass-border bg-white/65 p-4 min-w-[240px] shadow-sm">
                                <p className="text-xs uppercase tracking-wide text-muted-foreground">Scheduled</p>
                                <p className="mt-1 text-lg font-bold text-foreground">{formatDate(job.scheduledAt)}</p>
                                <p className="text-sm text-muted-foreground">{formatTime(job.scheduledAt)} - {formatTime(job.scheduledEndAt)}</p>
                            </div>
                        </div>
                    </GlassCardContent>
                </GlassCard>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
                <div className="xl:col-span-2 space-y-6">
                    <GlassCard>
                        <GlassCardHeader>
                            <GlassCardTitle className="text-lg flex items-center gap-2">
                                <Navigation className="h-5 w-5 text-primary" />
                                Job Progress
                            </GlassCardTitle>
                            <GlassCardDescription>Current position in the delivery workflow.</GlassCardDescription>
                        </GlassCardHeader>
                        <GlassCardContent>
                            <div className="relative mb-8">
                                <div className="absolute top-3 left-0 w-full h-1 bg-black/10 rounded-full overflow-hidden">
                                    <div className="h-full bg-primary transition-all duration-500" style={{ width: `${(step / 5) * 100}%` }} />
                                </div>
                                <div className="relative grid grid-cols-6 gap-2">
                                    {["Not Assigned", "Assigned", "Live", "Needs Attention", "Finished", "Closed"].map((item, index) => {
                                        const active = step >= index
                                        return (
                                            <div key={item} className="flex flex-col items-center gap-2 text-center">
                                                <div className={`h-7 w-7 rounded-full border-2 bg-white flex items-center justify-center ${active ? "border-primary text-primary" : "border-glass-border text-muted-foreground"}`}>
                                                    {active ? <CheckCircle2 className="h-4 w-4" /> : <span className="h-2 w-2 rounded-full bg-current opacity-30" />}
                                                </div>
                                                <span className={`text-[10px] sm:text-xs font-semibold ${active ? "text-primary-dark" : "text-muted-foreground"}`}>{item}</span>
                                            </div>
                                        )
                                    })}
                                </div>
                            </div>

                            <div className="rounded-2xl border border-glass-border bg-white/45 p-4">
                                <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                                    <MessageSquare className="h-4 w-4 text-primary" />
                                    Latest Update
                                </h3>
                                <p className="mt-2 text-sm text-muted-foreground leading-relaxed">{getJobUpdateMessage(baseStatus)}</p>
                            </div>
                        </GlassCardContent>
                    </GlassCard>

                    <GlassCard>
                        <GlassCardHeader>
                            <GlassCardTitle className="text-lg flex items-center gap-2">
                                <BriefcaseBusiness className="h-5 w-5 text-primary" />
                                Job Information
                            </GlassCardTitle>
                        </GlassCardHeader>
                        <GlassCardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <InfoTile label="Reference" value={jobReference} />
                            <InfoTile label="Priority" value={job.priority ?? "Standard"} />
                            <InfoTile label="Job Value" value={formatMoney(job.amount)} />
                            <InfoTile label="Created" value={formatDate(job.createdAt)} />
                            <InfoTile label="Last Updated" value={formatDateTime(job.updatedAt)} className="md:col-span-2" />
                            <div className="md:col-span-2 rounded-xl border border-glass-border bg-white/45 p-4">
                                <p className="text-xs uppercase tracking-wide text-muted-foreground">Description</p>
                                <p className="mt-1 text-sm font-medium text-foreground whitespace-pre-wrap">{job.description || "No additional description has been shared yet."}</p>
                            </div>
                        </GlassCardContent>
                    </GlassCard>

                    <GlassCard>
                        <GlassCardHeader>
                            <GlassCardTitle className="text-lg flex items-center gap-2">
                                <FileText className="h-5 w-5 text-primary" />
                                Related Quotes & Invoices
                            </GlassCardTitle>
                            <GlassCardDescription>Commercial documents linked to this job.</GlassCardDescription>
                        </GlassCardHeader>
                        <GlassCardContent className="space-y-5">
                            <RelatedDocumentSection
                                title="Quotes"
                                emptyText="No quotes are linked to this job yet."
                                records={relatedQuotes}
                                renderRecord={(quote) => (
                                    <RelatedDocumentCard
                                        key={quote.id}
                                        href={`/portal/quotes/${quote.id}`}
                                        icon={<FileText className="h-4 w-4 text-primary" />}
                                        reference={quote.quoteNumber ?? "QT-PENDING"}
                                        title={quote.title ?? "Quote"}
                                        status={quote.workflowStatusLabel ?? quote.workflowBaseStatusLabel ?? quote.status ?? "Draft"}
                                        amount={formatMoney(quote.total)}
                                        meta={`Issued ${formatDate(quote.createdAt)}${quote.validUntil ? ` • Valid until ${formatDate(quote.validUntil)}` : ""}`}
                                    />
                                )}
                            />
                            <RelatedDocumentSection
                                title="Invoices"
                                emptyText="No customer-visible invoices are linked to this job yet."
                                records={relatedInvoices}
                                renderRecord={(invoice) => (
                                    <RelatedDocumentCard
                                        key={invoice.id}
                                        href={`/portal/invoices/${invoice.id}`}
                                        icon={<Receipt className="h-4 w-4 text-primary" />}
                                        reference={invoice.invoiceNumber ?? "INV-PENDING"}
                                        title={invoice.title ?? "Invoice"}
                                        status={invoice.workflowStatusLabel ?? invoice.workflowBaseStatusLabel ?? invoice.status ?? "Draft"}
                                        amount={formatMoney(invoice.total)}
                                        meta={`Created ${formatDate(invoice.createdAt)}${invoice.dueDate ? ` • Due ${formatDate(invoice.dueDate)}` : ""}`}
                                    />
                                )}
                            />
                        </GlassCardContent>
                    </GlassCard>

                    <GlassCard>
                        <GlassCardHeader>
                            <GlassCardTitle className="text-lg flex items-center gap-2">
                                <ShieldCheck className="h-5 w-5 text-primary" />
                                Compliance Documents
                            </GlassCardTitle>
                            <GlassCardDescription>Reports and certificates linked to this job.</GlassCardDescription>
                        </GlassCardHeader>
                        <GlassCardContent className="space-y-3">
                            {complianceRecords.length === 0 ? (
                                <div className="rounded-2xl border border-dashed border-glass-border bg-white/35 p-6 text-center text-sm text-muted-foreground">
                                    No customer-visible compliance documents are linked to this job yet.
                                </div>
                            ) : (
                                complianceRecords.map((record) => (
                                    <div key={record.id} className="rounded-2xl border border-glass-border bg-white/45 p-4">
                                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                                            <div>
                                                <div className="flex flex-wrap items-center gap-2">
                                                    <h3 className="text-sm font-semibold text-foreground">{record.title ?? "Compliance record"}</h3>
                                                    <StatusBadge status={String(record.reviewStatus ?? "Approved").replace(/_/g, " ")}>
                                                        {String(record.reviewStatus ?? "Approved").replace(/_/g, " ")}
                                                    </StatusBadge>
                                                </div>
                                                <p className="mt-1 text-xs text-muted-foreground">
                                                    {record.reportType ?? "Report"}
                                                    {record.reference ? ` • ${record.reference}` : ""}
                                                </p>
                                            </div>
                                            {record.documentFileUrl ? (
                                                <Button asChild variant="outline" size="sm" className="gap-2 bg-white/60">
                                                    <a href={record.documentFileUrl} target="_blank" rel="noreferrer">
                                                        View Document <ExternalLink className="h-4 w-4" />
                                                    </a>
                                                </Button>
                                            ) : null}
                                        </div>
                                        <div className="mt-4 grid gap-3 md:grid-cols-3">
                                            <InfoTile label="Outcome" value={record.outcome || "Not recorded"} />
                                            <InfoTile label="Tested" value={formatDate(record.testedAt)} />
                                            <InfoTile label="Valid Until" value={formatDate(record.validUntil)} />
                                        </div>
                                    </div>
                                ))
                            )}
                        </GlassCardContent>
                    </GlassCard>
                </div>

                <div className="space-y-6">
                    <GlassCard>
                        <GlassCardHeader>
                            <GlassCardTitle className="text-lg flex items-center gap-2">
                                <MapPin className="h-5 w-5 text-primary" />
                                {sitesEnabled ? "Site Details" : "Job Address"}
                            </GlassCardTitle>
                        </GlassCardHeader>
                        <GlassCardContent className="space-y-4">
                            {sitesEnabled ? (
                                <div className="rounded-xl border border-glass-border bg-white/45 p-4">
                                    <p className="text-xs uppercase tracking-wide text-muted-foreground">Site</p>
                                    <p className="mt-1 text-sm font-semibold text-foreground">
                                        {job.siteName ?? "Site to be confirmed"}
                                    </p>
                                    {job.siteReference ? <p className="text-xs text-muted-foreground">{job.siteReference}</p> : null}
                                </div>
                            ) : null}
                            <div className="rounded-xl border border-glass-border bg-white/45 p-4">
                                <p className="text-xs uppercase tracking-wide text-muted-foreground">Address</p>
                                <p className="mt-1 text-sm font-medium text-foreground">{address}</p>
                            </div>
                        </GlassCardContent>
                    </GlassCard>

                    <GlassCard>
                        <GlassCardHeader>
                            <GlassCardTitle className="text-lg flex items-center gap-2">
                                <Calendar className="h-5 w-5 text-primary" />
                                Schedule
                            </GlassCardTitle>
                        </GlassCardHeader>
                        <GlassCardContent className="space-y-4">
                            <InfoTile icon={<Calendar className="h-4 w-4" />} label="Date" value={formatDate(job.scheduledAt)} />
                            <InfoTile icon={<Clock className="h-4 w-4" />} label="Start Time" value={formatTime(job.scheduledAt)} />
                            <InfoTile icon={<Clock className="h-4 w-4" />} label="End Time" value={formatTime(job.scheduledEndAt)} />
                            {job.completedAt ? <InfoTile icon={<Wrench className="h-4 w-4" />} label="Completed" value={formatDateTime(job.completedAt)} /> : null}
                        </GlassCardContent>
                    </GlassCard>

                    <div className="rounded-2xl border border-primary/20 bg-primary/5 p-4 text-sm text-muted-foreground">
                        Need to ask about this job? Please use the Support section and include reference <span className="font-semibold text-foreground">{jobReference}</span>.
                        <div className="mt-3">
                            <Button asChild variant="outline" className="bg-white/50">
                                <a href="/portal/tickets">Contact Support</a>
                            </Button>
                        </div>
                    </div>
                </div>
            </div>
            <ErrorToast error={error} onClear={() => setError(null)} />
        </PageContainer>
    )
}

function RelatedDocumentSection<T>({
    title,
    emptyText,
    records,
    renderRecord,
}: {
    title: string
    emptyText: string
    records: T[]
    renderRecord: (record: T) => React.ReactNode
}) {
    return (
        <div className="space-y-3">
            <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-foreground">{title}</h3>
                <span className="text-xs text-muted-foreground">{records.length}</span>
            </div>
            {records.length > 0 ? (
                <div className="space-y-3">{records.map(renderRecord)}</div>
            ) : (
                <div className="rounded-xl border border-dashed border-glass-border bg-white/35 p-4 text-sm text-muted-foreground">
                    {emptyText}
                </div>
            )}
        </div>
    )
}

function RelatedDocumentCard({
    href,
    icon,
    reference,
    title,
    status,
    amount,
    meta,
}: {
    href: string
    icon: React.ReactNode
    reference: string
    title: string
    status: string
    amount: string
    meta: string
}) {
    return (
        <Link href={href} className="block rounded-xl border border-glass-border bg-white/45 p-4 transition-colors hover:bg-white/70">
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-bold text-primary-dark">
                            {icon}
                            {reference}
                        </span>
                        <StatusBadge status={status} className="shadow-sm">
                            {status}
                        </StatusBadge>
                    </div>
                    <p className="mt-2 font-semibold text-foreground">{title}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{meta}</p>
                </div>
                <p className="shrink-0 text-sm font-bold text-foreground">{amount}</p>
            </div>
        </Link>
    )
}

function InfoTile({ label, value, icon, className = "" }: { label: string; value: string; icon?: React.ReactNode; className?: string }) {
    return (
        <div className={`rounded-xl border border-glass-border bg-white/45 p-4 ${className}`}>
            <p className="text-xs uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
                {icon}
                {label}
            </p>
            <p className="mt-1 text-sm font-semibold text-foreground">{value}</p>
        </div>
    )
}

"use client"

import { use, useEffect, useState } from "react"
import type { ReactNode } from "react"
import Link from "next/link"
import { PageContainer } from "@/components/layout/PageContainer"
import { GlassCard, GlassCardContent, GlassCardDescription, GlassCardHeader, GlassCardTitle } from "@/components/glass/GlassCard"
import { Button } from "@/components/ui/button"
import { StatusBadge } from "@/components/shared/StatusBadge"
import { ErrorToast } from "@/components/shared/ErrorToast"
import { BrowserBackButton } from "@/components/shared/BrowserBackButton"
import { apiGet } from "@/lib/api"
import { getPortalToken } from "@/lib/auth"
import { ArrowLeft, Building2, ExternalLink, FileSpreadsheet, FileText, MapPin, ShieldCheck, UserRound, Wrench } from "lucide-react"

type PortalSite = {
    id: string
    name: string
    reference?: string | null
    category?: string | null
    status?: string | null
    siteAddress?: string | null
    primaryContactName?: string | null
    primaryContactEmail?: string | null
    primaryContactPhone?: string | null
    notes?: string | null
    additionalInformation?: string | null
    counts?: Record<string, number>
    recentJobs?: LinkedJob[]
    recentQuotes?: LinkedQuote[]
    recentInvoices?: LinkedInvoice[]
    complianceRecords?: ComplianceRecord[]
    contacts?: SiteContact[]
}

type LinkedJob = {
    id: string
    jobNumber?: string | null
    title?: string | null
    status?: string | null
    workflowBaseStatusLabel?: string | null
    workflowStatusLabel?: string | null
    scheduledAt?: string | null
}

type LinkedQuote = {
    id: string
    quoteNumber?: string | null
    title?: string | null
    status?: string | null
    workflowBaseStatusLabel?: string | null
    workflowStatusLabel?: string | null
    total?: number | string | null
    createdAt?: string | null
}

type LinkedInvoice = {
    id: string
    invoiceNumber?: string | null
    title?: string | null
    status?: string | null
    workflowBaseStatusLabel?: string | null
    workflowStatusLabel?: string | null
    total?: number | string | null
    createdAt?: string | null
}

type ComplianceRecord = {
    id: string
    title?: string | null
    reportType?: string | null
    reviewStatus?: string | null
    outcome?: string | null
    validUntil?: string | null
    documentName?: string | null
    documentFileUrl?: string | null
}

type SiteContact = {
    id: string
    name: string
    email?: string | null
    phone?: string | null
    role?: string | null
}

const formatDate = (value?: string | null) => {
    if (!value) return "TBD"
    const date = new Date(value)
    return Number.isNaN(date.getTime()) ? "TBD" : date.toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" })
}

const formatMoney = (value?: number | string | null) => {
    if (value === null || typeof value === "undefined" || value === "") return "Not confirmed"
    const numeric = typeof value === "number" ? value : Number(value)
    if (!Number.isFinite(numeric)) return "Not confirmed"
    return new Intl.NumberFormat(undefined, { style: "currency", currency: "GBP" }).format(numeric)
}

export default function PortalSiteDetailPage({ params }: { params: Promise<{ id: string }> }) {
    const resolvedParams = use(params)
    const [site, setSite] = useState<PortalSite | null>(null)
    const [error, setError] = useState<string | null>(null)
    const portalToken = getPortalToken()

    useEffect(() => {
        if (!portalToken) return
        const load = async () => {
            try {
                const res = await apiGet<PortalSite>(`/portal/${portalToken}/sites/${resolvedParams.id}`)
                setSite(res.data ?? null)
                setError(null)
            } catch (err: any) {
                setError(err?.message ?? "Failed to load site")
            }
        }
        void load()
    }, [portalToken, resolvedParams.id])

    if (!site) {
        return (
            <PageContainer>
                <div className="p-12 text-center text-muted-foreground">Site not found</div>
                <ErrorToast error={error} onClear={() => setError(null)} />
            </PageContainer>
        )
    }

    return (
        <PageContainer>
            <BrowserBackButton className="mb-4 inline-flex items-center gap-1 text-sm font-medium text-primary hover:text-primary-dark">
                <ArrowLeft className="h-3 w-3" /> Back to Sites
            </BrowserBackButton>

            <GlassCard className="mb-6 overflow-hidden border-primary/20 bg-gradient-to-br from-white/75 via-white/55 to-primary/10">
                <GlassCardContent className="p-6 md:p-8">
                    <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
                        <div>
                            <div className="mb-3 flex flex-wrap items-center gap-2">
                                <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                                    <Building2 className="h-6 w-6" />
                                </span>
                                <StatusBadge status={site.status ?? "Active"}>{site.status ?? "Active"}</StatusBadge>
                            </div>
                            <h1 className="text-3xl font-bold tracking-tight text-foreground">{site.name}</h1>
                            <p className="mt-2 text-sm text-muted-foreground">
                                {site.category ?? "Site"}
                                {site.reference ? ` • ${site.reference}` : ""}
                            </p>
                            <div className="mt-4 flex items-start gap-2 text-sm text-muted-foreground">
                                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                                <span>{site.siteAddress || "Address to be confirmed"}</span>
                            </div>
                        </div>
                        <div className="grid min-w-[260px] grid-cols-2 gap-3">
                            <Metric icon={<Wrench className="h-4 w-4" />} label="Open Jobs" value={site.counts?.openJobs ?? 0} />
                            <Metric icon={<ShieldCheck className="h-4 w-4" />} label="Reports" value={site.counts?.complianceRecords ?? 0} />
                        </div>
                    </div>
                </GlassCardContent>
            </GlassCard>

            <div className="grid gap-6 xl:grid-cols-3">
                <div className="space-y-6 xl:col-span-2">
                    <LinkedSection title="Recent Jobs" description="Latest jobs for this site.">
                        {(site.recentJobs ?? []).length === 0 ? <EmptyText>No jobs linked yet.</EmptyText> : (site.recentJobs ?? []).map((job) => (
                            <LinkedCard
                                key={job.id}
                                href={`/portal/jobs/${job.id}`}
                                icon={<Wrench className="h-4 w-4 text-primary" />}
                                title={job.title ?? "Job"}
                                reference={job.jobNumber ?? "JOB-PENDING"}
                                status={job.workflowStatusLabel ?? job.workflowBaseStatusLabel ?? job.status ?? "Open"}
                                meta={`Scheduled ${formatDate(job.scheduledAt)}`}
                            />
                        ))}
                    </LinkedSection>

                    <LinkedSection title="Compliance Documents" description="Visible reports and certificates for this site.">
                        {(site.complianceRecords ?? []).length === 0 ? <EmptyText>No compliance documents visible yet.</EmptyText> : (site.complianceRecords ?? []).map((record) => (
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
                                            {record.reportType ?? "Report"} • Valid until {formatDate(record.validUntil)}
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
                            </div>
                        ))}
                    </LinkedSection>

                    <div className="grid gap-6 lg:grid-cols-2">
                        <LinkedSection title="Recent Quotes">
                            {(site.recentQuotes ?? []).length === 0 ? <EmptyText>No quotes linked yet.</EmptyText> : (site.recentQuotes ?? []).map((quote) => (
                                <LinkedCard
                                    key={quote.id}
                                    href={`/portal/quotes/${quote.id}`}
                                    icon={<FileText className="h-4 w-4 text-primary" />}
                                    title={quote.title ?? "Quote"}
                                    reference={quote.quoteNumber ?? "QT-PENDING"}
                                    status={quote.workflowStatusLabel ?? quote.workflowBaseStatusLabel ?? quote.status ?? "Draft"}
                                    meta={`${formatMoney(quote.total)} • ${formatDate(quote.createdAt)}`}
                                />
                            ))}
                        </LinkedSection>
                        <LinkedSection title="Recent Invoices">
                            {(site.recentInvoices ?? []).length === 0 ? <EmptyText>No invoices linked yet.</EmptyText> : (site.recentInvoices ?? []).map((invoice) => (
                                <LinkedCard
                                    key={invoice.id}
                                    href={`/portal/invoices/${invoice.id}`}
                                    icon={<FileSpreadsheet className="h-4 w-4 text-primary" />}
                                    title={invoice.title ?? "Invoice"}
                                    reference={invoice.invoiceNumber ?? "INV-PENDING"}
                                    status={invoice.workflowStatusLabel ?? invoice.workflowBaseStatusLabel ?? invoice.status ?? "Open"}
                                    meta={`${formatMoney(invoice.total)} • ${formatDate(invoice.createdAt)}`}
                                />
                            ))}
                        </LinkedSection>
                    </div>
                </div>

                <div className="space-y-6">
                    <GlassCard>
                        <GlassCardHeader>
                            <GlassCardTitle className="text-lg flex items-center gap-2">
                                <UserRound className="h-5 w-5 text-primary" /> Contacts
                            </GlassCardTitle>
                        </GlassCardHeader>
                        <GlassCardContent className="space-y-3">
                            {(site.contacts ?? []).length === 0 ? <EmptyText>No site contacts shared yet.</EmptyText> : (site.contacts ?? []).map((contact) => (
                                <div key={contact.id} className="rounded-2xl border border-glass-border bg-white/45 p-4">
                                    <div className="text-sm font-semibold text-foreground">{contact.name}</div>
                                    <div className="mt-1 text-xs text-muted-foreground">{contact.role ?? "Contact"}</div>
                                    <div className="mt-2 text-xs text-muted-foreground">
                                        {[contact.email, contact.phone].filter(Boolean).join(" • ") || "No contact details provided"}
                                    </div>
                                </div>
                            ))}
                        </GlassCardContent>
                    </GlassCard>

                    {(site.notes || site.additionalInformation) ? (
                        <GlassCard>
                            <GlassCardHeader>
                                <GlassCardTitle className="text-lg">Site Notes</GlassCardTitle>
                            </GlassCardHeader>
                            <GlassCardContent className="space-y-3 text-sm text-muted-foreground">
                                {site.additionalInformation ? <p className="whitespace-pre-wrap">{site.additionalInformation}</p> : null}
                                {site.notes ? <p className="whitespace-pre-wrap">{site.notes}</p> : null}
                            </GlassCardContent>
                        </GlassCard>
                    ) : null}
                </div>
            </div>
            <ErrorToast error={error} onClear={() => setError(null)} />
        </PageContainer>
    )
}

function Metric({ icon, label, value }: { icon: ReactNode; label: string; value: number }) {
    return (
        <div className="rounded-2xl border border-glass-border bg-white/60 p-4">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">{icon}{label}</div>
            <div className="mt-1 text-2xl font-bold text-foreground">{value}</div>
        </div>
    )
}

function LinkedSection({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
    return (
        <GlassCard>
            <GlassCardHeader>
                <GlassCardTitle className="text-lg">{title}</GlassCardTitle>
                {description ? <GlassCardDescription>{description}</GlassCardDescription> : null}
            </GlassCardHeader>
            <GlassCardContent className="space-y-3">{children}</GlassCardContent>
        </GlassCard>
    )
}

function LinkedCard({ href, icon, reference, title, status, meta }: { href: string; icon: ReactNode; reference: string; title: string; status: string; meta: string }) {
    return (
        <Link href={href} className="block rounded-2xl border border-glass-border bg-white/45 p-4 transition-colors hover:bg-white/70">
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                    <div className="flex items-center gap-2 text-xs font-semibold text-primary">{icon}{reference}</div>
                    <div className="mt-1 truncate text-sm font-semibold text-foreground">{title}</div>
                    <div className="mt-1 text-xs text-muted-foreground">{meta}</div>
                </div>
                <StatusBadge status={status}>{status}</StatusBadge>
            </div>
        </Link>
    )
}

function EmptyText({ children }: { children: ReactNode }) {
    return <div className="rounded-2xl border border-dashed border-glass-border bg-white/35 p-6 text-center text-sm text-muted-foreground">{children}</div>
}

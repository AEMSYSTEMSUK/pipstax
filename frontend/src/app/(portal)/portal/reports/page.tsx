"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { PageContainer } from "@/components/layout/PageContainer"
import { GlassCard, GlassCardContent, GlassCardHeader, GlassCardTitle } from "@/components/glass/GlassCard"
import { Button } from "@/components/ui/button"
import { StatusBadge } from "@/components/shared/StatusBadge"
import { ErrorToast } from "@/components/shared/ErrorToast"
import { apiGet } from "@/lib/api"
import { getPortalToken } from "@/lib/auth"
import { ExternalLink, ShieldCheck } from "lucide-react"

type PortalComplianceRecord = {
    id: string
    title: string
    reportType: string
    reference?: string | null
    outcome?: string | null
    reviewStatus?: string | null
    testedAt?: string | null
    validFrom?: string | null
    validUntil?: string | null
    reviewerName?: string | null
    reviewNote?: string | null
    notes?: string | null
    siteName?: string | null
    siteReference?: string | null
    siteAddress?: string | null
    documentName?: string | null
    documentFileUrl?: string | null
}

const formatDate = (value?: string | null) => {
    if (!value) return "—"
    const parsed = new Date(value)
    return Number.isNaN(parsed.getTime()) ? "—" : parsed.toLocaleDateString("en-GB")
}

const formatStatus = (status?: string | null) =>
    String(status ?? "APPROVED").replace(/_/g, " ")

export default function PortalReportsPage() {
    const [records, setRecords] = useState<PortalComplianceRecord[]>([])
    const [error, setError] = useState<string | null>(null)

    const portalToken = getPortalToken()

    useEffect(() => {
        if (!portalToken) return
        const load = async () => {
            try {
                const response = await apiGet<PortalComplianceRecord[]>(`/portal/${portalToken}/compliance-records`)
                setRecords(Array.isArray(response.data) ? response.data : [])
                setError(null)
            } catch (err: any) {
                setError(err?.message ?? "Failed to load compliance records")
            }
        }
        void load()
    }, [portalToken])

    return (
        <PageContainer>
            <div className="mb-6">
                <h1 className="text-3xl font-bold tracking-tight text-foreground">Reports & Certificates</h1>
                <p className="text-muted-foreground mt-1 text-sm">Approved customer-visible compliance records for your sites.</p>
            </div>

            <div className="space-y-5">
                {records.length === 0 ? (
                    <GlassCard>
                        <GlassCardContent className="p-12 text-center text-muted-foreground">
                            <ShieldCheck className="h-12 w-12 mx-auto mb-3 opacity-20" />
                            <p className="text-lg font-medium">No Reports Available</p>
                            <p className="text-sm">There are no approved compliance records visible in the portal yet.</p>
                        </GlassCardContent>
                    </GlassCard>
                ) : (
                    records.map((record) => (
                        <GlassCard key={record.id} className="overflow-hidden">
                            <GlassCardHeader className="border-b border-glass-border/50 pb-4">
                                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                                    <div>
                                        <div className="flex flex-wrap items-center gap-2">
                                            <GlassCardTitle className="text-lg">{record.title}</GlassCardTitle>
                                            <StatusBadge status={formatStatus(record.reviewStatus)}>
                                                {formatStatus(record.reviewStatus)}
                                            </StatusBadge>
                                        </div>
                                        <div className="mt-2 text-sm text-muted-foreground">
                                            {record.reportType}
                                            {record.reference ? ` • ${record.reference}` : ""}
                                        </div>
                                        {record.siteName ? (
                                            <div className="mt-1 text-sm text-muted-foreground">
                                                Site: {record.siteName}{record.siteReference ? ` • ${record.siteReference}` : ""}
                                                {record.siteAddress ? ` • ${record.siteAddress}` : ""}
                                            </div>
                                        ) : null}
                                    </div>
                                    {record.documentFileUrl ? (
                                        <Button asChild variant="outline" size="sm" className="gap-2 bg-white/50">
                                            <Link href={record.documentFileUrl} target="_blank">
                                                View Document <ExternalLink className="h-4 w-4" />
                                            </Link>
                                        </Button>
                                    ) : null}
                                </div>
                            </GlassCardHeader>
                            <GlassCardContent className="grid gap-4 p-6 md:grid-cols-2 xl:grid-cols-4">
                                <div className="rounded-2xl border border-glass-border/60 bg-white/40 p-4">
                                    <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Outcome</div>
                                    <div className="mt-2 text-sm font-medium text-foreground">{record.outcome || "—"}</div>
                                </div>
                                <div className="rounded-2xl border border-glass-border/60 bg-white/40 p-4">
                                    <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Tested</div>
                                    <div className="mt-2 text-sm font-medium text-foreground">{formatDate(record.testedAt)}</div>
                                </div>
                                <div className="rounded-2xl border border-glass-border/60 bg-white/40 p-4">
                                    <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Valid Until</div>
                                    <div className="mt-2 text-sm font-medium text-foreground">{formatDate(record.validUntil)}</div>
                                </div>
                                <div className="rounded-2xl border border-glass-border/60 bg-white/40 p-4">
                                    <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Reviewer</div>
                                    <div className="mt-2 text-sm font-medium text-foreground">{record.reviewerName || "—"}</div>
                                </div>
                                {record.reviewNote ? (
                                    <div className="rounded-2xl border border-glass-border/60 bg-white/35 p-4 md:col-span-2">
                                        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Review Note</div>
                                        <p className="mt-2 text-sm leading-6 text-foreground">{record.reviewNote}</p>
                                    </div>
                                ) : null}
                                {record.notes ? (
                                    <div className="rounded-2xl border border-glass-border/60 bg-white/35 p-4 md:col-span-2">
                                        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Notes</div>
                                        <p className="mt-2 text-sm leading-6 text-foreground">{record.notes}</p>
                                    </div>
                                ) : null}
                            </GlassCardContent>
                        </GlassCard>
                    ))
                )}
            </div>

            <ErrorToast error={error} onClear={() => setError(null)} />
        </PageContainer>
    )
}

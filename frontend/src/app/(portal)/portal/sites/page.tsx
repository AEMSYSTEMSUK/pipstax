"use client"

import { useEffect, useState } from "react"
import type { ReactNode } from "react"
import Link from "next/link"
import { PageContainer } from "@/components/layout/PageContainer"
import { GlassCard, GlassCardContent } from "@/components/glass/GlassCard"
import { Button } from "@/components/ui/button"
import { StatusBadge } from "@/components/shared/StatusBadge"
import { ErrorToast } from "@/components/shared/ErrorToast"
import { apiGet } from "@/lib/api"
import { getPortalToken } from "@/lib/auth"
import { Building2, ChevronRight, FileText, MapPin, ShieldCheck, Wrench } from "lucide-react"

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
    counts?: {
        jobs?: number
        openJobs?: number
        quotes?: number
        invoices?: number
        complianceRecords?: number
        contacts?: number
    }
}

export default function PortalSitesPage() {
    const [sites, setSites] = useState<PortalSite[]>([])
    const [error, setError] = useState<string | null>(null)
    const portalToken = getPortalToken()

    useEffect(() => {
        if (!portalToken) return
        const load = async () => {
            try {
                const res = await apiGet<PortalSite[]>(`/portal/${portalToken}/sites`)
                setSites(Array.isArray(res.data) ? res.data : [])
                setError(null)
            } catch (err: any) {
                setError(err?.message ?? "Failed to load sites")
            }
        }
        void load()
    }, [portalToken])

    return (
        <PageContainer>
            <div className="mb-6 rounded-3xl border border-glass-border bg-gradient-to-br from-white/75 via-white/55 to-primary/10 p-6 sm:p-8 shadow-sm">
                <h1 className="text-3xl font-bold tracking-tight text-foreground">Sites</h1>
                <p className="text-muted-foreground mt-1 text-sm">View locations, jobs, reports, and documents linked to your account.</p>
            </div>

            {sites.length === 0 ? (
                <GlassCard>
                    <GlassCardContent className="p-12 text-center text-muted-foreground">
                        <Building2 className="h-12 w-12 mx-auto mb-3 opacity-20" />
                        <p className="text-lg font-medium">No Sites Available</p>
                        <p className="text-sm">No customer-visible sites are currently linked to this portal account.</p>
                    </GlassCardContent>
                </GlassCard>
            ) : (
                <div className="grid gap-5 xl:grid-cols-2">
                    {sites.map((site) => (
                        <GlassCard key={site.id} className="overflow-hidden transition-colors hover:bg-white/55">
                            <GlassCardContent className="p-5 sm:p-6">
                                <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                                    <div className="min-w-0 flex-1">
                                        <div className="flex flex-wrap items-center gap-2">
                                            <h2 className="text-xl font-bold text-foreground">{site.name}</h2>
                                            <StatusBadge status={site.status ?? "Active"}>
                                                {site.status ?? "Active"}
                                            </StatusBadge>
                                        </div>
                                        <p className="mt-1 text-sm text-muted-foreground">
                                            {site.category ?? "Site"}
                                            {site.reference ? ` • ${site.reference}` : ""}
                                        </p>
                                        <div className="mt-4 flex items-start gap-2 text-sm text-muted-foreground">
                                            <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                                            <span>{site.siteAddress || "Address to be confirmed"}</span>
                                        </div>
                                        {site.primaryContactName || site.primaryContactEmail || site.primaryContactPhone ? (
                                            <div className="mt-4 rounded-2xl border border-glass-border bg-white/45 p-3 text-sm">
                                                <div className="font-semibold text-foreground">{site.primaryContactName ?? "Primary contact"}</div>
                                                <div className="mt-1 text-xs text-muted-foreground">
                                                    {[site.primaryContactEmail, site.primaryContactPhone].filter(Boolean).join(" • ") || "Contact details not provided"}
                                                </div>
                                            </div>
                                        ) : null}
                                        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                                            <Metric icon={<Wrench className="h-4 w-4" />} label="Open Jobs" value={site.counts?.openJobs ?? 0} />
                                            <Metric icon={<FileText className="h-4 w-4" />} label="Quotes" value={site.counts?.quotes ?? 0} />
                                            <Metric icon={<ShieldCheck className="h-4 w-4" />} label="Reports" value={site.counts?.complianceRecords ?? 0} />
                                            <Metric icon={<Building2 className="h-4 w-4" />} label="Contacts" value={site.counts?.contacts ?? 0} />
                                        </div>
                                    </div>
                                    <Button asChild className="gap-1 shadow-sm">
                                        <Link href={`/portal/sites/${site.id}`}>
                                            View Site <ChevronRight className="h-3.5 w-3.5" />
                                        </Link>
                                    </Button>
                                </div>
                            </GlassCardContent>
                        </GlassCard>
                    ))}
                </div>
            )}
            <ErrorToast error={error} onClear={() => setError(null)} />
        </PageContainer>
    )
}

function Metric({ icon, label, value }: { icon: ReactNode; label: string; value: number }) {
    return (
        <div className="rounded-xl border border-glass-border bg-white/50 p-3">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                {icon}
                {label}
            </div>
            <div className="mt-1 text-lg font-bold text-foreground">{value}</div>
        </div>
    )
}

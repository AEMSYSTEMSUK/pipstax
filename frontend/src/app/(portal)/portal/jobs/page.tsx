"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { StatusBadge } from "@/components/shared/StatusBadge"
import { PageContainer } from "@/components/layout/PageContainer"
import { GlassCard, GlassCardContent } from "@/components/glass/GlassCard"
import { Button } from "@/components/ui/button"
import { apiGet } from "@/lib/api"
import { getPortalToken } from "@/lib/auth"
import { HardHat, Calendar as CalendarIcon, Clock, MapPin, ChevronRight } from "lucide-react"
import { ErrorToast } from "@/components/shared/ErrorToast"
import { useTenantFeatures } from "@/components/layout/TenantFeaturesContext"

type PortalJob = {
    id: string
    jobNumber?: string | null
    title?: string | null
    status?: string | null
    workflowBaseStatus?: string | null
    workflowBaseStatusLabel?: string | null
    workflowStatusLabel?: string | null
    scheduledAt?: string | null
    scheduledEndAt?: string | null
    location?: string | null
    siteName?: string | null
    siteReference?: string | null
    siteAddress?: string | null
}

export default function PortalJobs() {
    const [jobs, setJobs] = useState<PortalJob[]>([])
    const [error, setError] = useState<string | null>(null)
    const { sites: sitesEnabled } = useTenantFeatures()

    const portalToken = getPortalToken()

    useEffect(() => {
        if (!portalToken) return
        const load = async () => {
            try {
                const res = await apiGet<PortalJob[]>(`/portal/${portalToken}/jobs`)
                setJobs(Array.isArray(res.data) ? res.data : [])
                setError(null)
            } catch (err: any) {
                setError(err?.message ?? "Failed to load jobs")
            }
        }
        load()
    }, [portalToken])

    const getJobBaseStatus = (job: PortalJob) => String(job.workflowBaseStatus ?? job.status ?? "").toUpperCase()
    const getJobBaseStatusLabel = (job: PortalJob) => job.workflowBaseStatusLabel ?? job.status ?? "Not Assigned"
    const getJobStatusLabel = (job: PortalJob) => job.workflowStatusLabel ?? getJobBaseStatusLabel(job)

    const getJobUpdateMessage = (baseStatus: string) => {
        switch (baseStatus) {
            case 'COMPLETED':
                return 'This project has been closed. Check your invoices tab for the final bill.'
            case 'FINISHED':
                return 'Work on site has finished and the final closeout is being prepared.'
            case 'LIVE':
                return 'Our team is currently on site and actively working on your project.'
            case 'REQUIRES_FOLLOW_UP':
                return 'The field team reported an issue and our office team is reviewing the next action.'
            case 'ASSIGNED':
                return 'Your project has been assigned to the field team and is moving toward delivery.'
            case 'NOT_ASSIGNED':
            case 'SCHEDULED':
            case 'CREATED':
            case 'CANCELLED':
                return 'Your project is being prepared and will be assigned to the field team.'
            default:
                return 'Your project is progressing through the current workflow stage.'
        }
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

    const openJobs = jobs.filter((job) => !["COMPLETED", "CLOSED", "CANCELLED"].includes(getJobBaseStatus(job)))
    const closedJobs = jobs.filter((job) => ["COMPLETED", "CLOSED", "CANCELLED"].includes(getJobBaseStatus(job)))

    const renderJobCard = (job: PortalJob) => {
        const baseStatus = getJobBaseStatus(job)
        const statusLabel = getJobStatusLabel(job)
        const reference = job.jobNumber ?? `JOB-${job.id.slice(0, 8).toUpperCase()}`
        const address = (sitesEnabled ? job.siteAddress : null) ?? job.location ?? "Address to be confirmed"
        const isAttention = baseStatus === "REQUIRES_FOLLOW_UP"
        const isClosed = ["COMPLETED", "CLOSED", "CANCELLED"].includes(baseStatus)

        return (
            <GlassCard key={job.id} className={`overflow-hidden transition-colors hover:bg-white/55 ${isAttention ? "border-destructive/30 bg-destructive/5" : isClosed ? "bg-white/45" : "bg-white/55"}`}>
                <GlassCardContent className="p-5 sm:p-6">
                    <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-5">
                        <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2 mb-3">
                                <span className="inline-flex items-center rounded-full bg-primary px-3 py-1 text-xs font-bold text-white shadow-sm">
                                    {reference}
                                </span>
                                <StatusBadge status={getJobBaseStatusLabel(job)} className="shadow-sm">
                                    {statusLabel}
                                </StatusBadge>
                            </div>

                            <h3 className="text-xl font-bold text-foreground leading-tight">{job.title ?? "Job"}</h3>
                            <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
                                {getJobUpdateMessage(baseStatus)}
                            </p>

                            <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
                                <div className="rounded-xl border border-glass-border bg-white/50 p-3">
                                    <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Date</span>
                                    <p className="mt-1 font-semibold text-foreground flex items-center gap-1.5">
                                        <CalendarIcon className="h-3.5 w-3.5 text-primary" />
                                        {formatDate(job.scheduledAt)}
                                    </p>
                                </div>
                                <div className="rounded-xl border border-glass-border bg-white/50 p-3">
                                    <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Time</span>
                                    <p className="mt-1 font-semibold text-foreground flex items-center gap-1.5">
                                        <Clock className="h-3.5 w-3.5 text-primary" />
                                        {formatTime(job.scheduledAt)} - {formatTime(job.scheduledEndAt)}
                                    </p>
                                </div>
                                <div className="rounded-xl border border-glass-border bg-white/50 p-3">
                                    <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                                        {sitesEnabled ? "Site" : "Address"}
                                    </span>
                                    <p className="mt-1 font-semibold text-foreground truncate">
                                        {sitesEnabled ? job.siteName ?? "Site to be confirmed" : address}
                                    </p>
                                </div>
                            </div>

                            <div className="mt-4 flex items-start gap-2 text-xs text-muted-foreground">
                                <MapPin className="h-3.5 w-3.5 mt-0.5 shrink-0 text-primary" />
                                <span>{address}{sitesEnabled && job.siteReference ? ` • ${job.siteReference}` : ""}</span>
                            </div>
                        </div>

                        <Button asChild className="gap-1 shadow-sm w-full lg:w-auto">
                            <Link href={`/portal/jobs/${job.id}`}>
                                View Details <ChevronRight className="h-3.5 w-3.5" />
                            </Link>
                        </Button>
                    </div>
                </GlassCardContent>
            </GlassCard>
        )
    }

    return (
        <PageContainer>
            <div className="mb-6 rounded-3xl border border-glass-border bg-gradient-to-br from-white/75 via-white/55 to-primary/10 p-6 sm:p-8 shadow-sm">
                <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-5">
                    <div>
                        <h1 className="text-3xl font-bold tracking-tight text-foreground">Project Tracking</h1>
                        <p className="text-muted-foreground mt-1 text-sm">Monitor the progress of your active and past jobs.</p>
                    </div>
                    <div className="grid grid-cols-2 gap-3 sm:min-w-[280px]">
                        <div className="rounded-2xl border border-glass-border bg-white/60 p-4">
                            <p className="text-xs uppercase tracking-wide text-muted-foreground">Open Jobs</p>
                            <p className="text-2xl font-bold text-foreground">{openJobs.length}</p>
                        </div>
                        <div className="rounded-2xl border border-glass-border bg-white/60 p-4">
                            <p className="text-xs uppercase tracking-wide text-muted-foreground">Closed Jobs</p>
                            <p className="text-2xl font-bold text-foreground">{closedJobs.length}</p>
                        </div>
                    </div>
                </div>
            </div>

            <div className="space-y-6">
                {jobs.length === 0 ? (
                    <GlassCard>
                        <GlassCardContent className="p-12 text-center text-muted-foreground">
                            <HardHat className="h-12 w-12 mx-auto mb-3 opacity-20" />
                            <p className="text-lg font-medium">No Projects Yet</p>
                            <p className="text-sm">You do not have any projects or service jobs associated with your account.</p>
                        </GlassCardContent>
                    </GlassCard>
                ) : (
                    <>
                        <section className="space-y-3">
                            <div className="flex items-center justify-between">
                                <h2 className="text-lg font-bold text-foreground">Open Jobs</h2>
                                <span className="text-xs text-muted-foreground">{openJobs.length} active</span>
                            </div>
                            {openJobs.length === 0 ? (
                                <GlassCard>
                                    <GlassCardContent className="p-8 text-center text-muted-foreground">
                                        <p className="font-medium">No open jobs right now.</p>
                                        <p className="text-sm">Closed jobs are listed below for your records.</p>
                                    </GlassCardContent>
                                </GlassCard>
                            ) : (
                                openJobs.map(renderJobCard)
                            )}
                        </section>

                        {closedJobs.length > 0 && (
                            <section className="space-y-3 pt-2">
                                <div className="flex items-center justify-between">
                                    <h2 className="text-lg font-bold text-foreground">Closed Jobs</h2>
                                    <span className="text-xs text-muted-foreground">{closedJobs.length} archived</span>
                                </div>
                                {closedJobs.map(renderJobCard)}
                            </section>
                        )}
                    </>
                )}
            </div>
            <ErrorToast error={error} onClear={() => setError(null)} />
        </PageContainer>
    )
}

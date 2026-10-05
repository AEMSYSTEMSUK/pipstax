"use client"

import { useEffect, useMemo, useState } from "react"
import { PageContainer } from "@/components/layout/PageContainer"
import { GlassCard, GlassCardContent, GlassCardHeader, GlassCardTitle, GlassCardDescription } from "@/components/glass/GlassCard"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { apiGet } from "@/lib/api"
import { getAuth } from "@/lib/auth"
import { MapPin, Clock, CalendarIcon, ChevronRight, CheckCircle2, FileText } from "lucide-react"
import { StatusBadge } from "@/components/shared/StatusBadge"
import Link from "next/link"
import { ErrorToast } from "@/components/shared/ErrorToast"

export default function WorkerDashboard() {
    const [jobs, setJobs] = useState<any[]>([])
    const [error, setError] = useState<string | null>(null)
    const auth = useMemo(() => getAuth(), [])

    useEffect(() => {
        const load = async () => {
            try {
                const res = await apiGet<any[]>(`/jobs/assigned/me`)
                setJobs(Array.isArray(res.data) ? res.data : [])
                setError(null)
            } catch (err: any) {
                setError(err?.message ?? "Failed to load jobs")
            }
        }
        load()
    }, [])

    const getJobBaseStatus = (job: any) => String(job.workflowBaseStatus ?? job.status ?? "").toUpperCase()
    const getJobBaseStatusLabel = (job: any) => job.workflowBaseStatusLabel ?? job.status ?? "Not Assigned"
    const getJobStatusLabel = (job: any) => job.workflowStatusLabel ?? getJobBaseStatusLabel(job)

    const todayKey = new Date().toDateString()
    const todayJobs = jobs.filter((job) => job.scheduledAt && new Date(job.scheduledAt).toDateString() === todayKey && !["COMPLETED", "CANCELLED"].includes(getJobBaseStatus(job)));
    const upcomingJobs = jobs.filter((job) => job.scheduledAt && new Date(job.scheduledAt).toDateString() !== todayKey && !["COMPLETED", "CANCELLED"].includes(getJobBaseStatus(job)));

    const getPriorityBadge = (priority: string) => {
        switch (priority) {
            case 'Emergency': return 'destructive'
            case 'High': return 'warning'
            case 'Medium': return 'default'
            case 'Low': return 'secondary'
            default: return 'outline'
        }
    }

    return (
        <PageContainer>
            <div className="mb-6">
                <h1 className="text-3xl font-bold tracking-tight text-foreground">Welcome back{auth?.user?.fullName ? `, ${auth.user.fullName}` : ""}</h1>
                <p className="text-muted-foreground mt-1 text-sm">You have {todayJobs.length} jobs assigned for today.</p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Today's Jobs */}
                <div className="lg:col-span-2 space-y-6">
                    <GlassCard>
                        <GlassCardHeader className="pb-3 border-b border-glass-border">
                            <GlassCardTitle className="text-lg flex justify-between items-center">
                                Today's Schedule
                                <Badge variant="outline" className="font-normal bg-white/40">{new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short' })}</Badge>
                            </GlassCardTitle>
                        </GlassCardHeader>
                        <GlassCardContent className="p-0">
                            <div className="divide-y divide-glass-border">
                                {todayJobs.length === 0 ? (
                                    <div className="p-8 text-center text-muted-foreground">
                                        <CheckCircle2 className="h-8 w-8 mx-auto mb-2 opacity-50" />
                                        <p>You have no more jobs scheduled for today.</p>
                                    </div>
                                ) : (
                                    todayJobs.map(job => (
                                        <Link href={`/worker/jobs/${job.id}`} key={job.id} className="block p-4 sm:p-6 hover:bg-white/30 transition-colors">
                                            <div className="flex flex-col sm:flex-row justify-between gap-4">
                                                <div className="space-y-3">
                                                    <div className="flex items-center gap-2 flex-wrap">
                                                        <StatusBadge status={getJobBaseStatusLabel(job)} className="shadow-sm">
                                                            {getJobStatusLabel(job)}
                                                        </StatusBadge>
                                                        <Badge variant={getPriorityBadge(job.priority) as any}>{job.priority}</Badge>
                                                        <span className="text-xs font-semibold text-primary px-2 py-0.5 bg-primary/10 rounded-full">
                                                            {job.scheduledAt ? new Date(job.scheduledAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "TBD"}
                                                        </span>
                                                    </div>
                                                    <div>
                                                        <h3 className="font-semibold text-lg">{job.title}</h3>
                                                        <p className="text-sm text-foreground/80 font-medium">Customer</p>
                                                    </div>
                                                    <div className="flex items-center gap-4 text-sm text-muted-foreground">
                                                        <span className="flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5" /> {job.location ?? "TBD"}</span>
                                                    </div>
                                                </div>
                                                <div className="flex sm:flex-col items-center sm:items-end justify-between">
                                                    <Button variant="outline" size="sm" className="bg-white/50 border-glass-border">
                                                        Update Status
                                                    </Button>
                                                    <Button variant="ghost" size="icon" className="hidden sm:inline-flex mt-auto text-primary">
                                                        <ChevronRight className="h-5 w-5" />
                                                    </Button>
                                                </div>
                                            </div>
                                        </Link>
                                    ))
                                )}
                            </div>
                        </GlassCardContent>
                    </GlassCard>

                    <GlassCard>
                        <GlassCardHeader className="pb-3 border-b border-glass-border">
                            <GlassCardTitle className="text-lg">Upcoming Jobs</GlassCardTitle>
                        </GlassCardHeader>
                        <GlassCardContent className="p-0">
                            <div className="divide-y divide-glass-border">
                                {upcomingJobs.slice(0, 3).map(job => (
                                    <Link href={`/worker/jobs/${job.id}`} key={job.id} className="block p-4 hover:bg-white/30 transition-colors">
                                        <div className="flex justify-between items-center">
                                            <div>
                                                <h4 className="font-medium text-sm">{job.title}</h4>
                                                <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                                                    <span className="flex items-center gap-1"><CalendarIcon className="h-3 w-3" /> {job.scheduledAt ? new Date(job.scheduledAt).toLocaleDateString() : "TBD"}</span>
                                                    <span className="flex items-center gap-1"><Clock className="h-3 w-3" /> {job.scheduledAt ? new Date(job.scheduledAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "TBD"}</span>
                                                </div>
                                            </div>
                                            <ChevronRight className="h-4 w-4 text-muted-foreground" />
                                        </div>
                                    </Link>
                                ))}
                            </div>
                            <div className="p-3 border-t border-glass-border bg-black/5 text-center">
                                <Button variant="link" className="text-sm h-8" asChild>
                                    <Link href="/worker/jobs">View All Assignments</Link>
                                </Button>
                            </div>
                        </GlassCardContent>
                    </GlassCard>
                </div>

                {/* Sidebar */}
                <div className="lg:col-span-1 space-y-6">
                    <GlassCard className="bg-gradient-to-br from-primary/10 to-transparent">
                        <GlassCardContent className="pt-6">
                            <div className="flex items-center gap-4 mb-4">
                                <div className="h-16 w-16 rounded-full bg-white border-2 border-primary  shadow-sm overflow-hidden flex items-center justify-center">
                                    <span className="text-xl font-bold text-primary-dark">{auth?.user?.fullName ? auth.user.fullName.split(" ").map((p: string) => p[0]).join("") : "ME"}</span>
                                </div>
                                <div>
                                    <h3 className="font-bold text-lg leading-tight">{auth?.user?.fullName ?? "Worker"}</h3>
                                    <p className="text-sm text-primary font-medium">{auth?.user?.roles?.map((r: any) => r.code).join(", ") ?? "Field Worker"}</p>
                                </div>
                            </div>
                            <div className="space-y-2 mt-4 pt-4 border-t border-primary/20">
                                <Button variant="outline" className="w-full justify-start gap-2 bg-white/50 border-glass-border text-destructive hover:text-destructive">
                                    Report Safety Issue
                                </Button>
                            </div>
                        </GlassCardContent>
                    </GlassCard>

                    <GlassCard>
                        <GlassCardHeader className="pb-2">
                            <GlassCardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Quick Resources</GlassCardTitle>
                        </GlassCardHeader>
                        <GlassCardContent className="space-y-3 pt-2">
                            <Link href="#" className="flex gap-3 items-center group p-2 rounded-lg hover:bg-white/40 transition-colors">
                                <div className="h-8 w-8 rounded bg-blue-100 text-blue-600 flex items-center justify-center"><FileText className="h-4 w-4" /></div>
                                <div>
                                    <p className="text-sm font-medium group-hover:text-primary transition-colors">Health & Safety Handbook</p>
                                    <p className="text-xs text-muted-foreground">PDF • 2.4MB</p>
                                </div>
                            </Link>
                            <Link href="#" className="flex gap-3 items-center group p-2 rounded-lg hover:bg-white/40 transition-colors">
                                <div className="h-8 w-8 rounded bg-rose-100 text-rose-600 flex items-center justify-center"><FileText className="h-4 w-4" /></div>
                                <div>
                                    <p className="text-sm font-medium group-hover:text-primary transition-colors">Emergency Procedures</p>
                                    <p className="text-xs text-muted-foreground">PDF • 1.1MB</p>
                                </div>
                            </Link>
                        </GlassCardContent>
                    </GlassCard>
                </div>
            </div>
            <ErrorToast error={error} onClear={() => setError(null)} />
        </PageContainer>
    )
}

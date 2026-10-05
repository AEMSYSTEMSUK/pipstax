"use client"

import { useEffect, useState } from "react"
import { PageContainer } from "@/components/layout/PageContainer"
import { GlassCard, GlassCardContent, GlassCardHeader, GlassCardTitle } from "@/components/glass/GlassCard"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { apiGet } from "@/lib/api"
import { ErrorToast } from "@/components/shared/ErrorToast"
import { MapPin, CheckCircle2, ChevronRight, Search, Clock, Calendar as CalendarIcon } from "lucide-react"
import { StatusBadge } from "@/components/shared/StatusBadge"
import Link from "next/link"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

export default function WorkerJobsPage() {
    const [searchQuery, setSearchQuery] = useState("")
    const [statusFilter, setStatusFilter] = useState("all")
    const [jobs, setJobs] = useState<any[]>([])
    const [error, setError] = useState<string | null>(null)

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

    const filteredJobs = jobs.filter(j =>
        j.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (j.location ?? "").toLowerCase().includes(searchQuery.toLowerCase())
    )
        .filter((j) => {
            const baseStatus = getJobBaseStatus(j)
            if (statusFilter === "all") return !["COMPLETED", "CANCELLED"].includes(baseStatus)
            if (statusFilter === "today") {
                return j.scheduledAt && new Date(j.scheduledAt).toDateString() === new Date().toDateString()
            }
            if (statusFilter === "progress") return ["ASSIGNED", "LIVE", "FINISHED"].includes(baseStatus)
            if (statusFilter === "completed") return baseStatus === "COMPLETED"
            return true
        })

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
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-foreground">My Jobs</h1>
                    <p className="text-muted-foreground mt-1 text-sm">View and manage all your assigned jobs.</p>
                </div>
            </div>

            <GlassCard>
                <GlassCardHeader className="pb-3 border-b border-glass-border">
                    <div className="flex flex-col md:flex-row justify-between gap-4">
                        <GlassCardTitle className="text-lg">Assignment List</GlassCardTitle>
                        <div className="flex items-center gap-2">
                            <Select defaultValue="all" onValueChange={(value) => setStatusFilter(value)}>
                                <SelectTrigger className="w-[140px] h-9 bg-white/40">
                                    <SelectValue placeholder="Status Filter" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">All Active</SelectItem>
                                    <SelectItem value="today">Today Only</SelectItem>
                                    <SelectItem value="progress">In Progress</SelectItem>
                                    <SelectItem value="completed">Closed</SelectItem>
                                </SelectContent>
                            </Select>
                            <div className="relative w-full md:w-64">
                                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                                <Input
                                    placeholder="Search jobs..."
                                    className="pl-9 bg-white/40 h-9"
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                />
                            </div>
                        </div>
                    </div>
                </GlassCardHeader>
                <GlassCardContent className="p-0">
                    <div className="divide-y divide-glass-border">
                        {filteredJobs.length === 0 ? (
                            <div className="p-12 text-center text-muted-foreground">
                                <CheckCircle2 className="h-12 w-12 mx-auto mb-3 opacity-20" />
                                <p className="text-lg font-medium">No Jobs Found</p>
                                <p className="text-sm">You don't have any jobs matching those filters.</p>
                            </div>
                        ) : (
                            filteredJobs.map(job => (
                                <div key={job.id} className="p-4 sm:p-6 hover:bg-white/30 transition-colors flex flex-col md:flex-row md:items-center justify-between gap-4 group">
                                    <div className="flex-1 space-y-2">
                                        <div className="flex flex-wrap items-center gap-2 mb-1">
                                            <StatusBadge status={getJobBaseStatusLabel(job)} className="shadow-sm">
                                                {getJobStatusLabel(job)}
                                            </StatusBadge>
                                            <Badge variant={getPriorityBadge(job.priority) as any}>{job.priority}</Badge>
                                            <span className="text-xs font-semibold bg-black/5 px-2 py-0.5 rounded text-foreground/70">{job.id}</span>
                                        </div>
                                        <h3 className="font-semibold text-lg leading-tight group-hover:text-primary transition-colors">{job.title}</h3>
                                        <p className="text-sm font-medium text-foreground/80">Customer</p>

                                        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 pt-2 text-sm text-muted-foreground">
                                            <span className="flex items-center gap-1.5 min-w-[120px]"><CalendarIcon className="h-3.5 w-3.5" /> {job.scheduledAt ? new Date(job.scheduledAt).toLocaleDateString() : "TBD"}</span>
                                            <span className="flex items-center gap-1.5 min-w-[100px]"><Clock className="h-3.5 w-3.5" /> {job.scheduledAt ? new Date(job.scheduledAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "TBD"}</span>
                                            <span className="flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5" /> {job.location ?? "TBD"}</span>
                                        </div>
                                    </div>

                                    <div className="flex items-center justify-end w-full md:w-auto mt-2 md:mt-0">
                                        <Button className="w-full md:w-auto shadow-sm gap-2" asChild>
                                            <Link href={`/worker/jobs/${job.id}`}>View Details <ChevronRight className="h-4 w-4" /></Link>
                                        </Button>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </GlassCardContent>
            </GlassCard>
            <ErrorToast error={error} onClear={() => setError(null)} />
        </PageContainer>
    )
}

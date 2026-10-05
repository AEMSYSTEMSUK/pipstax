"use client"

import { Fragment, use, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { ArrowLeft, BriefcaseBusiness, Calendar, Clock, Mail, Phone, ShieldCheck } from "lucide-react"
import { PageContainer } from "@/components/layout/PageContainer"
import { GlassCard, GlassCardContent, GlassCardDescription, GlassCardHeader, GlassCardTitle } from "@/components/glass/GlassCard"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { ErrorToast } from "@/components/shared/ErrorToast"
import { apiGet } from "@/lib/api"
import { getModulePermissions } from "@/lib/permission-ui"
import { BrowserBackButton } from "@/components/shared/BrowserBackButton"

const formatDateTime = (value?: string | null) => {
    if (!value) return "—"
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return "—"
    return date.toLocaleString()
}

const formatDate = (value?: string | null) => {
    if (!value) return "—"
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return "—"
    return date.toLocaleDateString()
}

const formatMoney = (value?: number | string | null) => {
    if (value === null || typeof value === "undefined" || value === "") return "Not set"
    const numeric = typeof value === "number" ? value : Number(value)
    if (!Number.isFinite(numeric)) return "Not set"
    return new Intl.NumberFormat(undefined, { style: "currency", currency: "GBP" }).format(numeric)
}

type UserDetailsResponse = {
    user: any
    summary: {
        totalAssignedJobs: number
        activeAssignments: number
        totalTimeEntries: number
        totalLoggedHours: number
    }
    jobs: Array<{
        assignmentType: string
        assignmentStatus: "ACTIVE" | "INACTIVE"
        teamName: string | null
        effectiveHourlyRate: number | null
        totalLoggedHours: number
        timeEntries: Array<{
            id: string
            startTime: string
            endTime: string
            durationHours: number
            notes?: string | null
        }>
        job: {
            id: string
            title: string
            status: string
            priority?: string | null
            location?: string | null
            customerName?: string | null
            scheduledAt?: string | null
            scheduledEndAt?: string | null
        }
    }>
}

export default function EmployeeDetailPage({ params }: { params: Promise<{ id: string }> }) {
    const resolvedParams = use(params)
    const { canView } = getModulePermissions("team.view", "team.manage")
    const [data, setData] = useState<UserDetailsResponse | null>(null)
    const [error, setError] = useState<string | null>(null)
    const [openJobs, setOpenJobs] = useState<Record<string, boolean>>({})

    useEffect(() => {
        if (!canView) return
        const load = async () => {
            try {
                const res = await apiGet<UserDetailsResponse>(`/users/${resolvedParams.id}/details`)
                setData(res.data)
                setError(null)
            } catch (err: any) {
                setError(err?.message ?? "Failed to load employee details")
            }
        }
        load()
    }, [canView, resolvedParams.id])

    const user = data?.user
    const summary = data?.summary
    const jobs = data?.jobs ?? []
    const roleLabel = useMemo(() => {
        const role = Array.isArray(user?.roles) ? user.roles[0] : null
        const code = String(role?.code ?? "").toUpperCase()
        if (!code) return "Member"
        return role?.name ?? code.replace(/_/g, " ")
    }, [user])

    const toggleJob = (jobId: string) => {
        setOpenJobs((prev) => ({ ...prev, [jobId]: !prev[jobId] }))
    }

    return (
        <PageContainer>
            {!canView ? (
                <GlassCard>
                    <GlassCardHeader>
                        <GlassCardTitle>Employee Details</GlassCardTitle>
                    </GlassCardHeader>
                    <GlassCardContent>You do not have access to view employee details.</GlassCardContent>
                </GlassCard>
            ) : (
                <div className="space-y-6">
                    <div className="flex items-center justify-between gap-3">
                        <div>
                            <Button asChild variant="ghost" className="px-0 text-primary hover:text-primary">
                                <BrowserBackButton>
                                    <ArrowLeft className="h-4 w-4 mr-2" />
                                    Back To Employees
                                </BrowserBackButton>
                            </Button>
                            <h1 className="text-3xl font-bold tracking-tight text-foreground mt-1">
                                {user?.fullName ?? "Employee"}
                            </h1>
                            <p className="text-sm text-muted-foreground">
                                Personal profile, assigned jobs, and job timesheets.
                            </p>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
                        <GlassCard className="xl:col-span-2">
                            <GlassCardHeader>
                                <GlassCardTitle className="text-lg">Personal Details</GlassCardTitle>
                                <GlassCardDescription>Employee identity and payroll defaults.</GlassCardDescription>
                            </GlassCardHeader>
                            <GlassCardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="space-y-1">
                                    <p className="text-xs uppercase tracking-wide text-muted-foreground">Email</p>
                                    <p className="text-sm font-medium flex items-center gap-2"><Mail className="h-3.5 w-3.5" />{user?.email ?? "—"}</p>
                                </div>
                                <div className="space-y-1">
                                    <p className="text-xs uppercase tracking-wide text-muted-foreground">Phone</p>
                                    <p className="text-sm font-medium flex items-center gap-2"><Phone className="h-3.5 w-3.5" />{user?.phone ?? "—"}</p>
                                </div>
                                <div className="space-y-1">
                                    <p className="text-xs uppercase tracking-wide text-muted-foreground">Role</p>
                                    <p className="text-sm font-medium flex items-center gap-2"><ShieldCheck className="h-3.5 w-3.5" />{roleLabel}</p>
                                </div>
                                <div className="space-y-1">
                                    <p className="text-xs uppercase tracking-wide text-muted-foreground">Hourly Rate</p>
                                    <p className="text-sm font-medium">{formatMoney(user?.hourlyRate)}</p>
                                </div>
                                <div className="space-y-1">
                                    <p className="text-xs uppercase tracking-wide text-muted-foreground">Joined</p>
                                    <p className="text-sm font-medium flex items-center gap-2"><Calendar className="h-3.5 w-3.5" />{formatDate(user?.createdAt)}</p>
                                </div>
                                <div className="space-y-1">
                                    <p className="text-xs uppercase tracking-wide text-muted-foreground">Status</p>
                                    <Badge variant={user?.isActive ? "success" : "secondary"}>{user?.isActive ? "Active" : "Inactive"}</Badge>
                                </div>
                            </GlassCardContent>
                        </GlassCard>

                        <GlassCard>
                            <GlassCardHeader>
                                <GlassCardTitle className="text-lg">Work Summary</GlassCardTitle>
                                <GlassCardDescription>Assignment and effort metrics.</GlassCardDescription>
                            </GlassCardHeader>
                            <GlassCardContent className="space-y-4">
                                <div className="rounded-lg border border-glass-border bg-white/50 p-3">
                                    <p className="text-xs uppercase text-muted-foreground">Assigned Jobs</p>
                                    <p className="text-2xl font-bold">{summary?.totalAssignedJobs ?? 0}</p>
                                </div>
                                <div className="rounded-lg border border-glass-border bg-white/50 p-3">
                                    <p className="text-xs uppercase text-muted-foreground">Active Assignments</p>
                                    <p className="text-2xl font-bold">{summary?.activeAssignments ?? 0}</p>
                                </div>
                                <div className="rounded-lg border border-glass-border bg-white/50 p-3">
                                    <p className="text-xs uppercase text-muted-foreground">Time Entries</p>
                                    <p className="text-2xl font-bold">{summary?.totalTimeEntries ?? 0}</p>
                                </div>
                                <div className="rounded-lg border border-glass-border bg-white/50 p-3">
                                    <p className="text-xs uppercase text-muted-foreground">Total Logged Hours</p>
                                    <p className="text-2xl font-bold">{summary?.totalLoggedHours?.toFixed(2) ?? "0.00"}h</p>
                                </div>
                            </GlassCardContent>
                        </GlassCard>
                    </div>

                    <GlassCard>
                        <GlassCardHeader>
                            <GlassCardTitle className="text-lg">Assigned Jobs & Timesheets</GlassCardTitle>
                            <GlassCardDescription>Jobs this employee was assigned to, with per-job timesheet entries.</GlassCardDescription>
                        </GlassCardHeader>
                        <GlassCardContent className="p-0">
                            <Table>
                                <TableHeader className="bg-black/5">
                                    <TableRow className="border-glass-border">
                                        <TableHead>Job</TableHead>
                                        <TableHead>Assignment</TableHead>
                                        <TableHead>Schedule</TableHead>
                                        <TableHead>Status</TableHead>
                                        <TableHead>Logged</TableHead>
                                        <TableHead className="text-right">Actions</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {jobs.length === 0 ? (
                                        <TableRow>
                                            <TableCell colSpan={6} className="text-center text-sm text-muted-foreground py-8">
                                                No assigned jobs found for this employee yet.
                                            </TableCell>
                                        </TableRow>
                                    ) : (
                                        jobs.map((entry) => {
                                            const isOpen = Boolean(openJobs[entry.job.id])
                                            return (
                                                <Fragment key={entry.assignmentType + entry.job.id}>
                                                    <TableRow className="border-glass-border hover:bg-black/5">
                                                        <TableCell>
                                                            <p className="font-semibold text-sm flex items-center gap-2">
                                                                <BriefcaseBusiness className="h-3.5 w-3.5" />
                                                                {entry.job.title}
                                                            </p>
                                                            <p className="text-xs text-muted-foreground mt-0.5">
                                                                {entry.job.customerName ?? "No customer"} • {entry.job.location ?? "No location"}
                                                            </p>
                                                        </TableCell>
                                                        <TableCell>
                                                            <div className="space-y-1">
                                                                <Badge variant={entry.assignmentType === "SUB_CONTRACTOR" ? "secondary" : "outline"}>
                                                                    {entry.assignmentType === "SUB_CONTRACTOR" ? "Sub-Contractor" : "Internal"}
                                                                </Badge>
                                                                <p className="text-xs text-muted-foreground">
                                                                    {entry.teamName ? `Team: ${entry.teamName}` : "Individual assignment"}
                                                                </p>
                                                            </div>
                                                        </TableCell>
                                                        <TableCell>
                                                            <p className="text-sm">{formatDateTime(entry.job.scheduledAt)}</p>
                                                            <p className="text-xs text-muted-foreground">to {formatDateTime(entry.job.scheduledEndAt)}</p>
                                                        </TableCell>
                                                        <TableCell>
                                                            <div className="space-y-1">
                                                                <Badge variant={entry.assignmentStatus === "ACTIVE" ? "success" : "secondary"}>{entry.assignmentStatus}</Badge>
                                                                <p className="text-xs text-muted-foreground">{entry.job.status}</p>
                                                            </div>
                                                        </TableCell>
                                                        <TableCell>
                                                            <p className="text-sm font-semibold flex items-center gap-1.5"><Clock className="h-3.5 w-3.5" />{entry.totalLoggedHours.toFixed(2)}h</p>
                                                            <p className="text-xs text-muted-foreground">{entry.timeEntries.length} entries</p>
                                                        </TableCell>
                                                        <TableCell className="text-right">
                                                            <div className="flex items-center justify-end gap-2">
                                                                <Button size="sm" variant="outline" onClick={() => toggleJob(entry.job.id)}>
                                                                    {isOpen ? "Hide Timesheets" : "View Timesheets"}
                                                                </Button>
                                                                <Button asChild size="sm" variant="outline">
                                                                    <Link href={`/admin/schedule/${entry.job.id}`}>Open Job</Link>
                                                                </Button>
                                                            </div>
                                                        </TableCell>
                                                    </TableRow>
                                                    {isOpen && (
                                                        <TableRow className="border-glass-border/60 bg-white/40">
                                                            <TableCell colSpan={6}>
                                                                {entry.timeEntries.length === 0 ? (
                                                                    <p className="text-sm text-muted-foreground py-2">No timesheets for this job by this employee.</p>
                                                                ) : (
                                                                    <div className="overflow-x-auto rounded-md border border-glass-border">
                                                                        <table className="w-full text-sm">
                                                                            <thead className="bg-black/5">
                                                                                <tr>
                                                                                    <th className="text-left px-3 py-2 font-medium text-muted-foreground">Start</th>
                                                                                    <th className="text-left px-3 py-2 font-medium text-muted-foreground">End</th>
                                                                                    <th className="text-left px-3 py-2 font-medium text-muted-foreground">Duration</th>
                                                                                    <th className="text-left px-3 py-2 font-medium text-muted-foreground">Notes</th>
                                                                                </tr>
                                                                            </thead>
                                                                            <tbody>
                                                                                {entry.timeEntries.map((time) => (
                                                                                    <tr key={time.id} className="border-t border-glass-border/70">
                                                                                        <td className="px-3 py-2">{formatDateTime(time.startTime)}</td>
                                                                                        <td className="px-3 py-2">{formatDateTime(time.endTime)}</td>
                                                                                        <td className="px-3 py-2 font-medium">{time.durationHours.toFixed(2)}h</td>
                                                                                        <td className="px-3 py-2 text-muted-foreground">{time.notes ?? "—"}</td>
                                                                                    </tr>
                                                                                ))}
                                                                            </tbody>
                                                                        </table>
                                                                    </div>
                                                                )}
                                                            </TableCell>
                                                        </TableRow>
                                                    )}
                                                </Fragment>
                                            )
                                        })
                                    )}
                                </TableBody>
                            </Table>
                        </GlassCardContent>
                    </GlassCard>
                </div>
            )}
            <ErrorToast error={error} onClear={() => setError(null)} />
        </PageContainer>
    )
}

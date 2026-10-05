"use client"

import { Fragment, use, useEffect, useState } from "react"
import Link from "next/link"
import { PageContainer } from "@/components/layout/PageContainer"
import { GlassCard, GlassCardContent, GlassCardHeader, GlassCardTitle, GlassCardDescription } from "@/components/glass/GlassCard"
import { GlassModal } from "@/components/glass/GlassModal"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { ArrowLeft, BriefcaseBusiness, Calendar, Clock, FileText, HardHat, KeyRound, Mail, Phone, ShieldAlert, ShieldCheck, ShieldX, CheckCircle2, XCircle, Eye, Plus, Trash2 } from "lucide-react"
import { apiGet, apiPost, apiPut } from "@/lib/api"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ErrorToast } from "@/components/shared/ErrorToast"
import { PhoneInput } from "@/components/shared/LocalizedFields"
import { useToast } from "@/components/ui/toast"
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

type Contractor = {
    id: string
    name: string
    companyName: string
    trade: string
    complianceStatus: string
    status: string
    email?: string
    phone?: string
    userId?: string
}

type DocumentHistory = {
    id: string
    status: string
    notes?: string
    actorType?: string
    createdAt?: string
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

export default function ContractorDetailPage({ params }: { params: Promise<{ id: string }> }) {
    const resolvedParams = use(params)
    const { toast } = useToast()
    const [contractor, setContractor] = useState<Contractor | null>(null)
    const [documents, setDocuments] = useState<Array<{ id: string; name: string; status: string; uploadedAt: string; expiresAt?: string; fileUrl?: string; history?: DocumentHistory[] }>>([])
    const [error, setError] = useState<string | null>(null)
    const [requirements, setRequirements] = useState<any[]>([])
    const [userDetails, setUserDetails] = useState<UserDetailsResponse | null>(null)
    const [reqForms, setReqForms] = useState([{ name: "", description: "" }])
    const [reqErrors, setReqErrors] = useState<Record<number, { name?: string }>>({})
    const [openJobs, setOpenJobs] = useState<Record<string, boolean>>({})
    const [editOpen, setEditOpen] = useState(false)
    const [editForm, setEditForm] = useState({ name: "", companyName: "", phone: "", tradeType: "", notes: "" })
    const [editErrors, setEditErrors] = useState<{ name?: string; companyName?: string }>({})
    const [resetPasswordOpen, setResetPasswordOpen] = useState(false)
    const [resetPasswordLoading, setResetPasswordLoading] = useState(false)
    const [resetPasswordForm, setResetPasswordForm] = useState({ password: "" })
    const [resetPasswordErrors, setResetPasswordErrors] = useState<{ password?: string }>({})
    const [credentialsOpen, setCredentialsOpen] = useState(false)
    const [credentials, setCredentials] = useState<{ email: string; loginUrl: string; tempPassword?: string | null } | null>(null)
    const [rejectModalOpen, setRejectModalOpen] = useState(false)
    const [rejectReason, setRejectReason] = useState("")
    const [rejectError, setRejectError] = useState<string | null>(null)
    const [historyOpen, setHistoryOpen] = useState(false)
    const [historyDoc, setHistoryDoc] = useState<{ name: string; history: DocumentHistory[] } | null>(null)

    const loadDocuments = async () => {
        const docs = await apiGet<any[]>(`/contractors/${resolvedParams.id}/documents`)
        const list = Array.isArray(docs.data) ? docs.data : []
        setDocuments(
            list.map((doc) => ({
                id: doc.id,
                name: doc.requirement?.name ?? doc.requirementId,
                status: doc.status,
                uploadedAt: doc.updatedAt ?? doc.createdAt ?? new Date().toISOString(),
                fileUrl: doc.fileUrl ?? undefined,
                history: Array.isArray(doc.history) ? doc.history : []
            }))
        )
    }

    useEffect(() => {
        const load = async () => {
            try {
                const [contractorRes, reqs] = await Promise.all([
                    apiGet<any>(`/contractors/${resolvedParams.id}`),
                    apiGet<any[]>(`/contractors/requirements?contractorId=${resolvedParams.id}`)
                ])
                const found = contractorRes.data
                setContractor({
                    id: found.id,
                    name: found.contactName ?? "Contractor",
                    companyName: found.companyName ?? "—",
                    trade: found.tradeType ?? found.trade ?? "General",
                    complianceStatus: found.complianceStatus ?? "PENDING",
                    status: found.user?.isActive === false ? "Suspended" : "Active",
                    email: found.user?.email ?? "",
                    phone: found.phone ?? "",
                    userId: found.userId
                })
                if (found.userId) {
                    const detailsRes = await apiGet<UserDetailsResponse>(`/users/${found.userId}/details`)
                    setUserDetails(detailsRes.data)
                }
                await loadDocuments()
                const requirementsData = Array.isArray(reqs.data) ? reqs.data : []
                setRequirements(requirementsData)
            } catch (err: any) {
                setError(err?.message ?? "Failed to load contractor")
            }
        }
        load()
    }, [resolvedParams.id])

    const refreshContractor = async () => {
        const updated = await apiGet<any>(`/contractors/${resolvedParams.id}`)
        setContractor((prev) => prev ? {
            ...prev,
            name: updated.data.contactName ?? prev.name,
            companyName: updated.data.companyName ?? prev.companyName,
            trade: updated.data.tradeType ?? updated.data.trade ?? prev.trade,
            complianceStatus: updated.data.complianceStatus ?? prev.complianceStatus,
            status: updated.data.user?.isActive === false ? "Suspended" : "Active",
            email: updated.data.user?.email ?? prev.email,
            phone: updated.data.phone ?? prev.phone,
            userId: updated.data.userId ?? prev.userId
        } : prev)
        const userId = updated.data.userId
        if (userId) {
            const detailsRes = await apiGet<UserDetailsResponse>(`/users/${userId}/details`)
            setUserDetails(detailsRes.data)
        }
    }

    const getDocStatusBadge = (status: string) => {
        switch (status) {
            case 'APPROVED':
            case 'Approved': return 'success'
            case 'PENDING':
            case 'SUBMITTED':
            case 'Pending': return 'warning'
            case 'REJECTED':
            case 'Rejected': return 'destructive'
            case 'EXPIRED':
            case 'Expired': return 'destructive'
            default: return 'outline'
        }
    }

    const getDocStatusIcon = (status: string) => {
        switch (status) {
            case 'APPROVED':
            case 'Approved': return <CheckCircle2 className="h-4 w-4 text-success" />
            case 'PENDING':
            case 'SUBMITTED':
            case 'Pending': return <Clock className="h-4 w-4 text-warning" />
            case 'REJECTED':
            case 'Rejected':
            case 'EXPIRED':
            case 'Expired': return <XCircle className="h-4 w-4 text-destructive" />
            default: return <FileText className="h-4 w-4 text-muted-foreground" />
        }
    }

    const formatDocStatus = (status: string) => {
        switch (status) {
            case 'APPROVED': return 'Approved'
            case 'PENDING': return 'Pending'
            case 'SUBMITTED': return 'Submitted'
            case 'REJECTED': return 'Rejected'
            case 'EXPIRED': return 'Expired'
            default: return status
        }
    }

    const formatComplianceLabel = (status: string) => {
        switch (status) {
            case 'COMPLIANT': return 'Compliant'
            case 'REJECTED': return 'Non-Compliant'
            case 'SUBMITTED': return 'Submitted'
            case 'PENDING': return 'Pending'
            default: return status
        }
    }

    const approveCompliancePack = async () => {
        if (!contractor) return
        try {
            await apiPost(`/contractors/${contractor.id}/compliance-review`, { status: "APPROVED" })
            await loadDocuments()
            await refreshContractor()
            toast({
                title: "Compliance Approved",
                description: "The contractor compliance pack has been approved.",
                variant: "success"
            })
        } catch (err: any) {
            toast({
                title: "Approve Failed",
                description: err?.message ?? "Failed to approve compliance pack.",
                variant: "error"
            })
        }
    }

    const openRejectCompliancePack = () => {
        setRejectReason("")
        setRejectError(null)
        setReqForms([{ name: "", description: "" }])
        setReqErrors({})
        setRejectModalOpen(true)
    }

    const canReviewCompliancePack = contractor?.complianceStatus !== "COMPLIANT"

    const openResetPassword = () => {
        setResetPasswordForm({ password: "" })
        setResetPasswordErrors({})
        setResetPasswordOpen(true)
    }

    const submitResetPassword = async () => {
        if (!contractor?.userId) {
            toast({
                title: "Reset Failed",
                description: "Contractor user account not found.",
                variant: "error"
            })
            return
        }
        const password = resetPasswordForm.password.trim()
        if (password.length > 0 && password.length < 6) {
            setResetPasswordErrors({ password: "Password must be at least 6 characters." })
            return
        }
        try {
            setResetPasswordLoading(true)
            const res = await apiPost<{ updated: boolean; authDetails?: { tempPassword?: string; loginUrl?: string; email?: string } }>(
                `/users/${contractor.userId}/reset-password`,
                { password: password || undefined }
            )
            const authDetails = res.data.authDetails
            setCredentials({
                email: authDetails?.email ?? contractor.email ?? "",
                loginUrl: authDetails?.loginUrl ?? "",
                tempPassword: authDetails?.tempPassword ?? null,
            })
            setResetPasswordOpen(false)
            setCredentialsOpen(true)
            toast({
                title: "Password Reset",
                description: "The new login details are ready to share.",
                variant: "success"
            })
        } catch (err: any) {
            setError(err?.message ?? "Failed to reset password")
        } finally {
            setResetPasswordLoading(false)
        }
    }

    const toggleJob = (jobId: string) => {
        setOpenJobs((prev) => ({ ...prev, [jobId]: !prev[jobId] }))
    }

    if (!contractor) {
        return (
            <PageContainer>
                <div className="text-center p-12">Contractor not found</div>
                <ErrorToast error={error} onClear={() => setError(null)} />
            </PageContainer>
        )
    }

    const summary = userDetails?.summary
    const assignedJobs = userDetails?.jobs ?? []

    return (
        <PageContainer>
            <div className="mb-6">
                <BrowserBackButton className="text-sm font-medium text-primary hover:text-primary-dark transition-colors inline-flex items-center gap-1 mb-4">
                    <ArrowLeft className="h-3 w-3" /> Back to Contractors
                </BrowserBackButton>

                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                    <div className="flex items-center gap-4">
                        <div className="h-16 w-16 rounded-2xl bg-white/60 border border-glass-border flex items-center justify-center shadow-md">
                            <HardHat className="h-8 w-8 text-primary" />
                        </div>
                        <div>
                            <h1 className="text-3xl font-bold tracking-tight text-foreground flex items-center gap-3">
                                {contractor.name}
                                <Badge
                                    variant={(contractor.complianceStatus === 'COMPLIANT' ? 'success' : contractor.complianceStatus === 'PENDING' || contractor.complianceStatus === 'SUBMITTED' ? 'warning' : 'destructive') as any}
                                    className="text-xs gap-1"
                                >
                                    {contractor.complianceStatus === 'COMPLIANT' && <ShieldCheck className="h-3 w-3" />}
                                    {(contractor.complianceStatus === 'PENDING' || contractor.complianceStatus === 'SUBMITTED') && <ShieldAlert className="h-3 w-3" />}
                                    {contractor.complianceStatus === 'REJECTED' && <ShieldX className="h-3 w-3" />}
                                    {formatComplianceLabel(contractor.complianceStatus)}
                                </Badge>
                            </h1>
                            <p className="text-muted-foreground mt-1 font-medium">{contractor.companyName} • {contractor.trade}</p>
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        <Button
                            variant="outline"
                            className="bg-white/40"
                            onClick={() => {
                                setEditForm({
                                    name: contractor.name ?? "",
                                    companyName: contractor.companyName ?? "",
                                    phone: contractor.phone ?? "",
                                    tradeType: contractor.trade ?? "",
                                    notes: ""
                                })
                                setEditErrors({})
                                setEditOpen(true)
                            }}
                        >
                            Edit Profile
                        </Button>
                        <Button
                            variant="outline"
                            className="bg-white/40 gap-2"
                            onClick={openResetPassword}
                        >
                            <KeyRound className="h-4 w-4" />
                            Reset Password
                        </Button>
                    </div>
                </div>
            </div>

            <div className="space-y-6">
                <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
                    <GlassCard className="xl:col-span-2">
                        <GlassCardHeader>
                            <GlassCardTitle className="text-lg">Contractor Details</GlassCardTitle>
                            <GlassCardDescription>Contact, company, and compliance profile.</GlassCardDescription>
                        </GlassCardHeader>
                        <GlassCardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="flex flex-col gap-1">
                                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Email</span>
                                <span className="text-sm flex items-center gap-2 text-foreground font-medium">
                                    <Mail className="h-4 w-4 text-primary" /> {contractor.email}
                                </span>
                            </div>
                            <div className="flex flex-col gap-1">
                                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Phone</span>
                                <span className="text-sm flex items-center gap-2 text-foreground font-medium">
                                    <Phone className="h-4 w-4 text-primary" /> {contractor.phone}
                                </span>
                            </div>
                            <div className="flex flex-col gap-1">
                                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Company</span>
                                <span className="text-sm text-foreground font-medium">{contractor.companyName}</span>
                            </div>
                            <div className="flex flex-col gap-1">
                                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Trade</span>
                                <span className="text-sm text-foreground font-medium">{contractor.trade}</span>
                            </div>
                            <div className="flex flex-col gap-1">
                                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Hourly Rate</span>
                                <span className="text-sm text-foreground font-medium">{formatMoney(userDetails?.user?.hourlyRate)}</span>
                            </div>
                            <div className="flex flex-col gap-1">
                                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Joined</span>
                                <span className="text-sm flex items-center gap-2 text-foreground font-medium">
                                    <Calendar className="h-4 w-4 text-primary" /> {formatDate(userDetails?.user?.createdAt)}
                                </span>
                            </div>
                            <div className="flex flex-col gap-1">
                                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Status</span>
                                <Badge variant={contractor.status === "Active" ? "success" : "secondary"} className="w-fit">{contractor.status}</Badge>
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
                        <GlassCardDescription>Jobs this contractor was assigned to, with per-job timesheet entries.</GlassCardDescription>
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
                                {assignedJobs.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={6} className="text-center text-sm text-muted-foreground py-8">
                                            No assigned jobs found for this contractor yet.
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    assignedJobs.map((entry) => {
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
                                                            <Badge variant="secondary">Sub-Contractor</Badge>
                                                            <p className="text-xs text-muted-foreground">
                                                                {entry.teamName ? `Team: ${entry.teamName}` : "Individual assignment"}
                                                            </p>
                                                            <p className="text-xs text-muted-foreground">Rate: {formatMoney(entry.effectiveHourlyRate)}</p>
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
                                                                <p className="text-sm text-muted-foreground py-2">No timesheets for this job by this contractor.</p>
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

                <GlassCard>
                        <GlassCardHeader className="flex flex-row items-center justify-between gap-4">
                            <div>
                                <GlassCardTitle>Compliance Documents</GlassCardTitle>
                                <GlassCardDescription>Manage onboarding and compliance documents</GlassCardDescription>
                            </div>
                            {canReviewCompliancePack ? (
                                <div className="flex items-center gap-2 flex-wrap justify-end">
                                    <Button
                                        size="sm"
                                        className="bg-success-foreground text-white hover:bg-success-foreground/90"
                                        disabled={documents.length === 0}
                                        onClick={approveCompliancePack}
                                    >
                                        <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
                                        Approve Compliance
                                    </Button>
                                    <Button
                                        size="sm"
                                        variant="outline"
                                        className="border-destructive/30 text-destructive hover:text-destructive hover:bg-destructive/10"
                                        disabled={documents.length === 0}
                                        onClick={openRejectCompliancePack}
                                    >
                                        <XCircle className="h-3.5 w-3.5 mr-1" />
                                        Reject / Request Documents
                                    </Button>
                                </div>
                            ) : (
                                <Badge variant="success" className="shadow-sm">Approved</Badge>
                            )}
                        </GlassCardHeader>
                        <GlassCardContent className="p-0">
                            <Table>
                                <TableHeader className="bg-black/5">
                                    <TableRow className="border-glass-border">
                                        <TableHead>Document Type</TableHead>
                                        <TableHead>Uploaded</TableHead>
                                        <TableHead>Expires</TableHead>
                                        <TableHead>Status</TableHead>
                                        <TableHead className="min-w-[260px] text-right">Actions</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {documents.map((doc) => (
                                        <TableRow key={doc.id} className="border-glass-border">
                                            <TableCell className="font-medium">
                                                <div className="flex items-center gap-2">
                                                    <FileText className="h-4 w-4 text-primary" />
                                                    {requirements.find((r) => r.id === doc.name)?.name ?? doc.name}
                                                </div>
                                            </TableCell>
                                            <TableCell className="text-sm text-muted-foreground">{doc.uploadedAt}</TableCell>
                                            <TableCell className="text-sm">
                                                {doc.expiresAt ? (
                                                    <span className={new Date(doc.expiresAt) < new Date() ? "text-destructive font-semibold" : ""}>
                                                        {doc.expiresAt}
                                                    </span>
                                                ) : (
                                                    <span className="text-muted-foreground italic">N/A</span>
                                                )}
                                            </TableCell>
                                            <TableCell>
                                                <div className="flex items-center gap-1.5">
                                                    {getDocStatusIcon(doc.status)}
                                                    <Badge variant={getDocStatusBadge(doc.status) as any} className="shadow-sm">
                                                        {formatDocStatus(doc.status)}
                                                    </Badge>
                                                </div>
                                            </TableCell>
                                            <TableCell>
                                                <div className="flex items-center justify-end gap-2 flex-wrap">
                                                    {doc.fileUrl && (
                                                        <Button
                                                            size="sm"
                                                            variant="outline"
                                                            className="h-8 px-3 text-primary hover:text-primary hover:bg-primary/10"
                                                            onClick={() => window.open(doc.fileUrl, "_blank", "noopener,noreferrer")}
                                                        >
                                                            <Eye className="h-3.5 w-3.5 mr-1" />
                                                            Preview
                                                        </Button>
                                                    )}
                                                    {doc.history && doc.history.length > 0 && (
                                                        <Button
                                                            size="sm"
                                                            variant="outline"
                                                            className="h-8 px-3 text-muted-foreground hover:text-foreground hover:bg-muted/40"
                                                            onClick={() => {
                                                                setHistoryDoc({ name: doc.name, history: doc.history ?? [] })
                                                                setHistoryOpen(true)
                                                            }}
                                                        >
                                                            <Clock className="h-3.5 w-3.5 mr-1" />
                                                            History
                                                        </Button>
                                                    )}
                                                    {!doc.fileUrl && (!doc.history || doc.history.length === 0) ? (
                                                        <span className="text-xs text-muted-foreground px-2">No file submitted</span>
                                                    ) : null}
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                    {documents.length === 0 && (
                                        <TableRow>
                                            <TableCell colSpan={5} className="text-center text-muted-foreground h-24">
                                                No documents uploaded yet.
                                            </TableCell>
                                        </TableRow>
                                    )}
                                </TableBody>
                            </Table>
                        </GlassCardContent>
                    </GlassCard>
            </div>

            <GlassModal
                open={editOpen}
                onOpenChange={setEditOpen}
                title="Edit Contractor"
                description="Update contractor profile details."
                footer={
                    <div className="flex justify-end gap-2 w-full">
                        <Button variant="outline" onClick={() => setEditOpen(false)}>Cancel</Button>
                        <Button
                            onClick={async () => {
                                const nextErrors: { name?: string; companyName?: string } = {}
                                if (!editForm.name.trim()) {
                                    nextErrors.name = "Name is required."
                                }
                                if (!editForm.companyName.trim()) {
                                    nextErrors.companyName = "Company is required."
                                }
                                setEditErrors(nextErrors)
                                if (Object.keys(nextErrors).length > 0) {
                                    return
                                }
                                try {
                                    const res = await apiPut<any>(`/contractors/${contractor.id}`, {
                                        contactName: editForm.name.trim(),
                                        companyName: editForm.companyName.trim(),
                                        phone: editForm.phone.trim(),
                                        tradeType: editForm.tradeType.trim(),
                                        notes: editForm.notes.trim()
                                    })
                                    setContractor((prev) => prev ? {
                                        ...prev,
                                        name: res.data.contactName ?? editForm.name,
                                        companyName: res.data.companyName ?? editForm.companyName,
                                        phone: res.data.phone ?? editForm.phone,
                                        trade: res.data.tradeType ?? editForm.tradeType
                                    } : prev)
                                    toast({
                                        title: "Updated",
                                        description: "Contractor profile updated.",
                                        variant: "success"
                                    })
                                    setEditOpen(false)
                                } catch (err: any) {
                                    toast({
                                        title: "Update Failed",
                                        description: err?.message ?? "Failed to update contractor.",
                                        variant: "error"
                                    })
                                }
                            }}
                        >
                            Save Changes
                        </Button>
                    </div>
                }
            >
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                        <Label required>Full Name</Label>
                        <Input
                            value={editForm.name}
                            className={editErrors.name ? "border-destructive focus-visible:ring-destructive/50" : ""}
                            onChange={(e) => setEditForm((prev) => ({ ...prev, name: e.target.value }))}
                        />
                        {editErrors.name && <p className="text-xs text-destructive">{editErrors.name}</p>}
                    </div>
                    <div className="space-y-2">
                        <Label required>Company</Label>
                        <Input
                            value={editForm.companyName}
                            className={editErrors.companyName ? "border-destructive focus-visible:ring-destructive/50" : ""}
                            onChange={(e) => setEditForm((prev) => ({ ...prev, companyName: e.target.value }))}
                        />
                        {editErrors.companyName && <p className="text-xs text-destructive">{editErrors.companyName}</p>}
                    </div>
                    <div className="space-y-2">
                        <Label optional>Phone</Label>
                        <PhoneInput value={editForm.phone} onChange={(phone) => setEditForm((prev) => ({ ...prev, phone }))} />
                    </div>
                    <div className="space-y-2">
                        <Label optional>Trade Type</Label>
                        <Input value={editForm.tradeType} onChange={(e) => setEditForm((prev) => ({ ...prev, tradeType: e.target.value }))} />
                    </div>
                    <div className="space-y-2">
                        <Label optional>Notes</Label>
                        <Input value={editForm.notes} onChange={(e) => setEditForm((prev) => ({ ...prev, notes: e.target.value }))} />
                    </div>
                </div>
            </GlassModal>
            <GlassModal
                open={resetPasswordOpen}
                onOpenChange={(open) => {
                    setResetPasswordOpen(open)
                    if (!open) {
                        setResetPasswordForm({ password: "" })
                        setResetPasswordErrors({})
                    }
                }}
                title="Reset Password"
                description="Set a new password, or leave it blank to auto-generate one."
                footer={
                    <div className="flex justify-end gap-2 w-full">
                        <Button variant="outline" onClick={() => setResetPasswordOpen(false)}>Cancel</Button>
                        <Button type="button" onClick={submitResetPassword} disabled={resetPasswordLoading}>
                            <KeyRound className="h-3.5 w-3.5 mr-1" />
                            {resetPasswordLoading ? "Saving..." : "Reset Password"}
                        </Button>
                    </div>
                }
            >
                <div className="space-y-4">
                    <div className="rounded-xl border border-glass-border bg-white/40 p-4">
                        <p className="text-xs uppercase text-muted-foreground">Contractor</p>
                        <p className="font-semibold text-foreground">{contractor.name}</p>
                        <p className="text-sm text-muted-foreground">{contractor.email ?? ""}</p>
                    </div>
                    <div className="space-y-2">
                        <Label optional>New Password</Label>
                        <Input
                            className={`w-full h-10 ${resetPasswordErrors.password ? "border-destructive" : ""}`}
                            type="password"
                            name="reset-contractor-new-password"
                            autoComplete="new-password"
                            data-lpignore="true"
                            data-1p-ignore="true"
                            value={resetPasswordForm.password}
                            onChange={(e) => {
                                setResetPasswordForm({ password: e.target.value })
                                setResetPasswordErrors({})
                            }}
                            placeholder="Leave blank to auto-generate"
                        />
                        {resetPasswordErrors.password ? (
                            <p className="text-xs text-destructive">{resetPasswordErrors.password}</p>
                        ) : (
                            <p className="text-xs text-muted-foreground">Generated/reset credentials will be shown after reset and emailed to the contractor.</p>
                        )}
                    </div>
                </div>
            </GlassModal>
            <GlassModal
                open={credentialsOpen}
                onOpenChange={setCredentialsOpen}
                title="Login Details"
                description="Share these credentials with the sub-contractor."
                footer={
                    <div className="flex justify-end gap-2 w-full">
                        <Button onClick={() => setCredentialsOpen(false)}>Close</Button>
                    </div>
                }
            >
                <div className="space-y-3 text-sm">
                    <div>
                        <p className="text-xs uppercase text-muted-foreground">Login URL</p>
                        <p className="font-medium">{credentials?.loginUrl ?? "—"}</p>
                        {credentials?.loginUrl?.includes("5173") && (
                            <p className="text-xs text-muted-foreground mt-1">Sub-contractor accounts log in through the worker app.</p>
                        )}
                    </div>
                    <div>
                        <p className="text-xs uppercase text-muted-foreground">Email</p>
                        <p className="font-medium">{credentials?.email ?? "—"}</p>
                    </div>
                    <div>
                        <p className="text-xs uppercase text-muted-foreground">Temporary Password</p>
                        <p className="font-medium">{credentials?.tempPassword ?? "Use existing password"}</p>
                    </div>
                </div>
            </GlassModal>
            <GlassModal
                open={rejectModalOpen}
                onOpenChange={setRejectModalOpen}
                title="Reject Compliance Pack"
                description="Provide one clear reason. Optionally request additional documents. The contractor will upload all documents again and sign again."
                footer={
                    <div className="flex justify-end gap-2 w-full">
                        <Button variant="outline" onClick={() => setRejectModalOpen(false)}>Cancel</Button>
                        <Button
                            onClick={async () => {
                                if (!rejectReason.trim()) {
                                    setRejectError("Rejection reason is required.")
                                    return
                                }
                                const nextReqErrors: Record<number, { name?: string }> = {}
                                const requestedDocuments = reqForms
                                    .map((item) => ({
                                        name: item.name.trim(),
                                        description: item.description.trim()
                                    }))
                                    .filter((item, index) => {
                                        const hasAnyValue = Boolean(item.name || item.description)
                                        if (hasAnyValue && !item.name) {
                                            nextReqErrors[index] = { name: "Document name is required when requesting a document." }
                                        }
                                        return hasAnyValue && item.name
                                    })
                                setReqErrors(nextReqErrors)
                                if (Object.keys(nextReqErrors).length > 0) {
                                    return
                                }
                                try {
                                    if (requestedDocuments.length > 0) {
                                        await Promise.all(requestedDocuments.map((requestDoc) => apiPost<any>("/contractors/requirements", {
                                            ...requestDoc,
                                            contractorId: contractor.id
                                        })))
                                        const nextReqs = await apiGet<any[]>(`/contractors/requirements?contractorId=${contractor.id}`)
                                        setRequirements(Array.isArray(nextReqs.data) ? nextReqs.data : [])
                                    }
                                    await apiPost(`/contractors/${contractor.id}/compliance-review`, {
                                        status: "REJECTED",
                                        reviewerNotes: rejectReason.trim()
                                    })
                                    await loadDocuments()
                                    await refreshContractor()
                                    setRejectModalOpen(false)
                                    setReqForms([{ name: "", description: "" }])
                                    setReqErrors({})
                                    toast({
                                        title: "Compliance Rejected",
                                        description: "The contractor can now resubmit all documents and signature.",
                                        variant: "success"
                                    })
                                } catch (err: any) {
                                    toast({
                                        title: "Reject Failed",
                                        description: err?.message ?? "Failed to reject compliance pack.",
                                        variant: "error"
                                    })
                                }
                            }}
                        >
                            Reject Compliance
                        </Button>
                    </div>
                }
            >
                <div className="space-y-4">
                    <div className="space-y-2">
                        <Label required>Reason</Label>
                        <Input value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} placeholder="Explain what needs to be corrected" />
                        {rejectError && <p className="text-xs text-destructive">{rejectError}</p>}
                    </div>
                    <div className="rounded-xl border border-glass-border bg-white/40 p-4 space-y-3">
                        <div className="flex items-start justify-between gap-3">
                            <div>
                                <p className="text-sm font-semibold text-foreground">Request additional documents</p>
                                <p className="text-xs text-muted-foreground mt-1">Optional. Add one or more extra documents needed during resubmission.</p>
                            </div>
                            <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                className="shrink-0 bg-white/50"
                                onClick={() => setReqForms((prev) => [...prev, { name: "", description: "" }])}
                            >
                                <Plus className="h-3.5 w-3.5 mr-1" />
                                Add More
                            </Button>
                        </div>
                        {reqForms.map((requestDoc, index) => (
                            <div key={`requested-document-${index}`} className="rounded-lg border border-glass-border bg-white/50 p-3 space-y-3">
                                <div className="flex items-center justify-between gap-2">
                                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Document {index + 1}</p>
                                    {reqForms.length > 1 && (
                                        <Button
                                            type="button"
                                            size="sm"
                                            variant="ghost"
                                            className="h-7 px-2 text-destructive hover:text-destructive hover:bg-destructive/10"
                                            onClick={() => {
                                                setReqForms((prev) => prev.filter((_, itemIndex) => itemIndex !== index))
                                                setReqErrors((prev) => {
                                                    const nextErrors: Record<number, { name?: string }> = {}
                                                    Object.entries(prev).forEach(([key, value]) => {
                                                        const numericKey = Number(key)
                                                        if (numericKey < index) {
                                                            nextErrors[numericKey] = value
                                                        }
                                                        if (numericKey > index) {
                                                            nextErrors[numericKey - 1] = value
                                                        }
                                                    })
                                                    return nextErrors
                                                })
                                            }}
                                        >
                                            <Trash2 className="h-3.5 w-3.5 mr-1" />
                                            Remove
                                        </Button>
                                    )}
                                </div>
                                <div className="space-y-2">
                                    <Label optional>Document Name</Label>
                                    <Input
                                        value={requestDoc.name}
                                        onChange={(e) => {
                                            const value = e.target.value
                                            setReqForms((prev) => prev.map((item, itemIndex) => itemIndex === index ? { ...item, name: value } : item))
                                            setReqErrors((prev) => ({ ...prev, [index]: { ...prev[index], name: undefined } }))
                                        }}
                                        placeholder="e.g. Updated insurance certificate"
                                    />
                                    {reqErrors[index]?.name && <p className="text-xs text-destructive">{reqErrors[index].name}</p>}
                                </div>
                                <div className="space-y-2">
                                    <Label optional>Description</Label>
                                    <Input
                                        value={requestDoc.description}
                                        onChange={(e) => {
                                            const value = e.target.value
                                            setReqForms((prev) => prev.map((item, itemIndex) => itemIndex === index ? { ...item, description: value } : item))
                                        }}
                                        placeholder="Explain what should be uploaded"
                                    />
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </GlassModal>
            <GlassModal
                open={historyOpen}
                onOpenChange={setHistoryOpen}
                title="Document History"
                description={historyDoc ? `Review history for ${historyDoc.name}.` : "Review document history."}
                footer={
                    <div className="flex justify-end w-full">
                        <Button variant="outline" onClick={() => setHistoryOpen(false)}>Close</Button>
                    </div>
                }
            >
                <div className="space-y-3">
                    {historyDoc?.history?.length ? (
                        historyDoc.history.map((entry) => (
                            <div key={entry.id} className="rounded-md border border-glass-border p-3">
                                <div className="flex items-center justify-between text-sm font-medium">
                                    <span>{formatDocStatus(entry.status)}</span>
                                    <span className="text-xs text-muted-foreground">
                                        {entry.createdAt ? new Date(entry.createdAt).toLocaleString() : "—"}
                                    </span>
                                </div>
                                {entry.notes && <div className="text-xs text-muted-foreground mt-1">{entry.notes}</div>}
                            </div>
                        ))
                    ) : (
                        <div className="text-sm text-muted-foreground">No history recorded.</div>
                    )}
                </div>
            </GlassModal>
            <ErrorToast error={error} onClear={() => setError(null)} />
        </PageContainer>
    )
}

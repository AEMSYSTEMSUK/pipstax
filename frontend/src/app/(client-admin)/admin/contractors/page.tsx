"use client"

import { useEffect, useState } from "react"
import { PageContainer } from "@/components/layout/PageContainer"
import { GlassCard, GlassCardContent, GlassCardHeader, GlassCardTitle } from "@/components/glass/GlassCard"
import { GlassModal } from "@/components/glass/GlassModal"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Search, Plus, MoreHorizontal, ShieldCheck, ShieldAlert, ShieldX, HardHat, KeyRound } from "lucide-react"
type Contractor = {
    id: string
    name: string
    companyName: string
    trade: string
    complianceStatus: string
    jobsCompleted: number
    status: string
    userId?: string
    isActive?: boolean
    email?: string
}
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { useRouter, useSearchParams } from "next/navigation"
import { apiGet, apiPost } from "@/lib/api"
import { ErrorToast } from "@/components/shared/ErrorToast"
import { PhoneInput } from "@/components/shared/LocalizedFields"
import { DataPagination, useClientPagination } from "@/components/shared/DataPagination"
import { useToast } from "@/components/ui/toast"
import { getModulePermissions } from "@/lib/permission-ui"

export default function ContractorsPage() {
    const router = useRouter()
    const searchParams = useSearchParams()
    const { toast } = useToast()
    const { canView, canManage } = getModulePermissions("subcontractors.view", "subcontractors.manage")
    const [contractors, setContractors] = useState<Contractor[]>([])
    const [error, setError] = useState<string | null>(null)
    const [searchQuery, setSearchQuery] = useState("")
    const [inviteOpen, setInviteOpen] = useState(false)
    const [inviteForm, setInviteForm] = useState({
        fullName: "",
        email: "",
        phone: "",
        companyName: "",
        tradeType: "",
        password: ""
    })
    const [inviteErrors, setInviteErrors] = useState<{ fullName?: string; email?: string; companyName?: string; password?: string }>({})
    const [credentialsOpen, setCredentialsOpen] = useState(false)
    const [credentials, setCredentials] = useState<{ email: string; loginUrl: string; tempPassword?: string | null } | null>(null)
    const [inviteRequirements, setInviteRequirements] = useState<Array<{ name: string; description?: string }>>([])
    const [inviteRequirementDraft, setInviteRequirementDraft] = useState({ name: "", description: "" })
    const [resetPasswordOpen, setResetPasswordOpen] = useState(false)
    const [resetPasswordLoading, setResetPasswordLoading] = useState(false)
    const [resetPasswordTarget, setResetPasswordTarget] = useState<Contractor | null>(null)
    const [resetPasswordForm, setResetPasswordForm] = useState({ password: "" })
    const [resetPasswordErrors, setResetPasswordErrors] = useState<{ password?: string }>({})
    const [isSuspendOpen, setIsSuspendOpen] = useState(false)
    const [suspendTarget, setSuspendTarget] = useState<{ contractorId: string; isActive?: boolean } | null>(null)

    const isValidEmail = (value: string) => /\S+@\S+\.\S+/.test(value)

    useEffect(() => {
        if (searchParams.get("create") === "contractor" && canManage) {
            setInviteOpen(true)
        }
    }, [canManage, searchParams])

    useEffect(() => {
        const load = async () => {
            try {
                const [contractorsRes, assignmentsRes] = await Promise.all([
                    apiGet<any[]>("/contractors"),
                    apiGet<any[]>("/jobs/assignments")
                ])
                const contractorsData = Array.isArray(contractorsRes.data) ? contractorsRes.data : []
                const assignmentsData = Array.isArray(assignmentsRes.data) ? assignmentsRes.data : []

                const docsResponses = await Promise.all(
                    contractorsData.map((contractor) => apiGet<any[]>(`/contractors/${contractor.id}/documents`))
                )
                const docsMap = new Map<string, any[]>()
                docsResponses.forEach((res, idx) => {
                    docsMap.set(contractorsData[idx].id, Array.isArray(res.data) ? res.data : [])
                })

                const mapped = contractorsData.map((contractor) => {
                    const docs = docsMap.get(contractor.id) ?? []
                    const completedJobs = assignmentsData.filter((assignment) => (
                        assignment.userId === contractor.userId &&
                        assignment.assignmentType === "SUB_CONTRACTOR" &&
                        assignment.job?.status === "COMPLETED"
                    )).length

                    return {
                        id: contractor.id,
                        name: contractor.contactName ?? "Contractor",
                        companyName: contractor.companyName ?? "—",
                        trade: contractor.tradeType ?? contractor.trade ?? "General",
                        complianceStatus: contractor.complianceStatus ?? "PENDING",
                        jobsCompleted: completedJobs,
                        status: contractor.user?.isActive === false ? "Suspended" : "Active",
                        userId: contractor.userId,
                        isActive: contractor.user?.isActive ?? true,
                        email: contractor.user?.email ?? ""
                    } as Contractor
                })
                setContractors(mapped)
            } catch (err: any) {
                setError(err?.message ?? "Failed to load contractors")
            }
        }
        load()
    }, [])

    const filteredContractors = contractors.filter(c =>
        c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        c.companyName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        c.trade.toLowerCase().includes(searchQuery.toLowerCase())
    )
    const contractorsPagination = useClientPagination(filteredContractors)

    const getComplianceIcon = (status: string) => {
        switch (status) {
            case 'COMPLIANT':
            case 'Compliant': return <ShieldCheck className="h-4 w-4 text-success" />
            case 'SUBMITTED':
            case 'PENDING':
            case 'Action Required': return <ShieldAlert className="h-4 w-4 text-warning" />
            case 'REJECTED':
            case 'Non-Compliant': return <ShieldX className="h-4 w-4 text-destructive" />
            default: return null
        }
    }

    const getComplianceBadge = (status: string) => {
        switch (status) {
            case 'COMPLIANT':
            case 'Compliant': return 'success'
            case 'SUBMITTED':
            case 'PENDING':
            case 'Action Required': return 'warning'
            case 'REJECTED':
            case 'Non-Compliant': return 'destructive'
            default: return 'outline'
        }
    }

    const formatComplianceLabel = (status: string) => {
        switch (status) {
            case 'COMPLIANT': return 'Compliant'
            case 'SUBMITTED': return 'Submitted'
            case 'REJECTED': return 'Non-Compliant'
            case 'PENDING': return 'Pending'
            default: return status
        }
    }

    const openResetPassword = (contractor: Contractor) => {
        if (!canManage) {
            toast({
                title: "Insufficient permissions",
                description: "You can view contractors but cannot reset passwords.",
                variant: "error"
            })
            return
        }
        setResetPasswordTarget(contractor)
        setResetPasswordForm({ password: "" })
        setResetPasswordErrors({})
        setResetPasswordOpen(true)
    }

    const submitResetPassword = async () => {
        if (!resetPasswordTarget?.userId) {
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
                `/users/${resetPasswordTarget.userId}/reset-password`,
                { password: password || undefined }
            )
            const authDetails = res.data.authDetails
            setCredentials({
                email: authDetails?.email ?? resetPasswordTarget.email ?? "",
                loginUrl: authDetails?.loginUrl ?? "",
                tempPassword: authDetails?.tempPassword ?? null,
            })
            setResetPasswordOpen(false)
            setResetPasswordTarget(null)
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

    return (
        <PageContainer>
            {!canView ? (
                <GlassCard>
                    <GlassCardHeader>
                        <GlassCardTitle>Sub-Contractors</GlassCardTitle>
                    </GlassCardHeader>
                    <GlassCardContent>You do not have access to view contractors.</GlassCardContent>
                </GlassCard>
            ) : (
            <>
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-foreground">Sub-Contractors</h1>
                    <p className="text-muted-foreground mt-1 text-sm">Manage external workforce, compliance, and documents.</p>
                </div>

                <GlassModal
                    open={inviteOpen}
                    onOpenChange={setInviteOpen}
                    trigger={
                        <Button className="gap-2" disabled={!canManage}>
                            <Plus className="h-4 w-4" /> Invite Sub-Contractor
                        </Button>
                    }
                    title="Invite Sub-Contractor"
                    description="Create a sub-contractor account and start onboarding."
                    footer={
                        <div className="flex justify-end gap-2 w-full">
                            <Button variant="outline" onClick={() => setInviteOpen(false)}>Cancel</Button>
                            <Button
                                    onClick={async () => {
                                        try {
                                            if (!canManage) {
                                                toast({
                                                    title: "Insufficient permissions",
                                                    description: "You can view contractors but cannot invite them.",
                                                    variant: "error"
                                                })
                                                return
                                            }
                                            const nextErrors: { fullName?: string; email?: string; companyName?: string; password?: string } = {}
                                            if (!inviteForm.fullName.trim()) {
                                                nextErrors.fullName = "Full name is required."
                                            }
                                            if (!inviteForm.email.trim()) {
                                                nextErrors.email = "Email is required."
                                            } else if (!isValidEmail(inviteForm.email.trim())) {
                                                nextErrors.email = "Enter a valid email address."
                                            }
                                            if (!inviteForm.companyName.trim()) {
                                                nextErrors.companyName = "Company name is required."
                                            }
                                            if (inviteForm.password.trim().length > 0 && inviteForm.password.trim().length < 6) {
                                                nextErrors.password = "Password must be at least 6 characters."
                                            }
                                            setInviteErrors(nextErrors)
                                            if (Object.keys(nextErrors).length > 0) {
                                                return
                                            }

                                            const res = await apiPost<any>("/contractors", {
                                                ...inviteForm,
                                                password: inviteForm.password.trim() || undefined,
                                                requirements: inviteRequirements
                                            })
                                            const contractor = res.data.contractor ?? res.data
                                            const authDetails = res.data.authDetails
                                            setContractors((prev) => [
                                                {
                                                    id: contractor.id,
                                                    name: contractor.contactName ?? inviteForm.fullName ?? "Contractor",
                                                    companyName: contractor.companyName ?? inviteForm.companyName ?? "—",
                                                    trade: contractor.tradeType ?? contractor.trade ?? inviteForm.tradeType ?? "General",
                                                    complianceStatus: contractor.complianceStatus ?? "PENDING",
                                                    jobsCompleted: 0,
                                                    status: "Active",
                                                    userId: contractor.userId,
                                                    isActive: true
                                                },
                                                ...prev
                                            ])
                                            setInviteForm({ fullName: "", email: "", phone: "", companyName: "", tradeType: "", password: "" })
                                            setInviteRequirements([])
                                            setInviteRequirementDraft({ name: "", description: "" })
                                            setInviteErrors({})
                                            setInviteOpen(false)
                                            if (authDetails?.loginUrl) {
                                                setCredentials({
                                                    email: authDetails.email ?? inviteForm.email.trim(),
                                                    loginUrl: authDetails.loginUrl,
                                                    tempPassword: authDetails.tempPassword ?? null
                                                })
                                                setCredentialsOpen(true)
                                            } else {
                                                toast({
                                                    title: "Invite Sent",
                                                    description: "Sub-contractor created successfully.",
                                                    variant: "success"
                                                })
                                            }
                                        } catch (err: any) {
                                            toast({
                                                title: "Invite Failed",
                                                description: err?.message ?? "Failed to invite contractor.",
                                                variant: "error"
                                            })
                                        }
                                    }}
                                >
                                    Send Invite
                            </Button>
                        </div>
                    }
                >
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label required>Full Name</Label>
                            <Input value={inviteForm.fullName} onChange={(e) => setInviteForm((prev) => ({ ...prev, fullName: e.target.value }))} />
                            {inviteErrors.fullName && <p className="text-xs text-destructive">{inviteErrors.fullName}</p>}
                        </div>
                        <div className="space-y-2">
                            <Label required>Email</Label>
                            <Input type="email" value={inviteForm.email} onChange={(e) => setInviteForm((prev) => ({ ...prev, email: e.target.value }))} />
                            {inviteErrors.email && <p className="text-xs text-destructive">{inviteErrors.email}</p>}
                        </div>
                        <div className="space-y-2">
                            <Label optional>Phone</Label>
                            <PhoneInput value={inviteForm.phone} onChange={(phone) => setInviteForm((prev) => ({ ...prev, phone }))} />
                        </div>
                        <div className="space-y-2">
                            <Label required>Company</Label>
                            <Input value={inviteForm.companyName} onChange={(e) => setInviteForm((prev) => ({ ...prev, companyName: e.target.value }))} />
                            {inviteErrors.companyName && <p className="text-xs text-destructive">{inviteErrors.companyName}</p>}
                        </div>
                        <div className="space-y-2">
                            <Label optional>Trade Type</Label>
                            <Input value={inviteForm.tradeType} onChange={(e) => setInviteForm((prev) => ({ ...prev, tradeType: e.target.value }))} />
                        </div>
                        <div className="space-y-2">
                            <Label optional>Password</Label>
                            <Input
                                className={`w-full h-10 ${inviteErrors.password ? "border-destructive" : ""}`}
                                type="password"
                                name="new-contractor-temporary-password"
                                autoComplete="new-password"
                                data-lpignore="true"
                                data-1p-ignore="true"
                                value={inviteForm.password}
                                onChange={(e) => setInviteForm((prev) => ({ ...prev, password: e.target.value }))}
                                placeholder="Leave blank to auto-generate"
                            />
                            {inviteErrors.password ? (
                                <p className="text-xs text-destructive">{inviteErrors.password}</p>
                            ) : (
                                <p className="text-xs text-muted-foreground">If blank, the system will generate a secure temporary password.</p>
                            )}
                        </div>
                        <div className="space-y-3 md:col-span-2">
                            <Label optional>Required Documents</Label>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                <Input
                                    placeholder="Document name"
                                    value={inviteRequirementDraft.name}
                                    onChange={(e) => setInviteRequirementDraft((prev) => ({ ...prev, name: e.target.value }))}
                                />
                                <Input
                                    placeholder="Description (optional)"
                                    value={inviteRequirementDraft.description}
                                    onChange={(e) => setInviteRequirementDraft((prev) => ({ ...prev, description: e.target.value }))}
                                />
                                <Button
                                    variant="outline"
                                    className="h-10"
                                    onClick={() => {
                                        if (!inviteRequirementDraft.name.trim()) {
                                            return
                                        }
                                        setInviteRequirements((prev) => [...prev, { ...inviteRequirementDraft }])
                                        setInviteRequirementDraft({ name: "", description: "" })
                                    }}
                                >
                                    Add Requirement
                                </Button>
                            </div>
                            {inviteRequirements.length > 0 && (
                                <div className="flex flex-wrap gap-2">
                                    {inviteRequirements.map((reqItem, index) => (
                                        <Badge key={`${reqItem.name}-${index}`} variant="outline" className="gap-2">
                                            {reqItem.name}
                                            <button
                                                className="text-xs text-muted-foreground hover:text-destructive"
                                                onClick={() => setInviteRequirements((prev) => prev.filter((_, idx) => idx !== index))}
                                                type="button"
                                            >
                                                ✕
                                            </button>
                                        </Badge>
                                    ))}
                                </div>
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
            </div>

            <GlassCard>
                <GlassCardHeader className="pb-3 border-b border-glass-border/50">
                    <div className="flex items-center justify-between">
                        <GlassCardTitle className="text-lg">Network Directory</GlassCardTitle>
                        <div className="relative w-64">
                            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                            <Input
                                placeholder="Search name, trade..."
                                className="pl-9 bg-white/40 h-9"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                            />
                        </div>
                    </div>
                </GlassCardHeader>
                <GlassCardContent className="p-0">
                    <Table>
                        <TableHeader className="bg-black/5">
                            <TableRow className="hover:bg-transparent border-glass-border">
                                <TableHead>Contractor</TableHead>
                                <TableHead>Trade</TableHead>
                                <TableHead>Compliance</TableHead>
                                <TableHead className="text-center">Jobs</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead className="w-[50px]"></TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {filteredContractors.length === 0 ? (
                                <TableRow key="contractors-empty-state">
                                    <TableCell colSpan={6} className="h-32 text-center text-muted-foreground">
                                        <div className="flex flex-col items-center gap-3">
                                            <span>{contractors.length === 0 ? "No contractors yet." : "No contractors match your search."}</span>
                                            {contractors.length === 0 && canManage ? (
                                                <Button size="sm" className="gap-2" onClick={() => setInviteOpen(true)}>
                                                    <Plus className="h-4 w-4" /> Invite Contractor
                                                </Button>
                                            ) : null}
                                        </div>
                                    </TableCell>
                                </TableRow>
                            ) : (
                                contractorsPagination.paginatedItems.map((contractor) => (
                                    <TableRow
                                        key={contractor.id}
                                        className="border-glass-border hover:bg-black/5 transition-colors cursor-pointer"
                                        onClick={() => router.push(`/admin/contractors/${contractor.id}`)}
                                    >
                                        <TableCell>
                                            <div className="flex items-center gap-3">
                                                <div className="h-9 w-9 rounded-lg bg-primary/10 text-primary-dark flex items-center justify-center shrink-0 border border-primary/20">
                                                    <HardHat className="h-4 w-4" />
                                                </div>
                                                <div className="flex flex-col">
                                                    <span className="font-medium text-sm">{contractor.name}</span>
                                                    <span className="text-xs text-muted-foreground">{contractor.companyName}</span>
                                                </div>
                                            </div>
                                        </TableCell>
                                        <TableCell className="font-medium text-sm">
                                            {contractor.trade}
                                        </TableCell>
                                        <TableCell>
                                            <div className="flex items-center gap-2">
                                                {getComplianceIcon(contractor.complianceStatus)}
                                                <Badge variant={getComplianceBadge(contractor.complianceStatus) as any} className="shadow-sm">
                                                    {formatComplianceLabel(contractor.complianceStatus)}
                                                </Badge>
                                            </div>
                                        </TableCell>
                                        <TableCell className="text-center font-medium">
                                            {contractor.jobsCompleted}
                                        </TableCell>
                                        <TableCell>
                                            <Badge variant={contractor.status === 'Active' ? 'default' : contractor.status === 'Onboarding' ? 'secondary' : 'destructive'} className="shadow-sm">
                                                {contractor.status}
                                            </Badge>
                                        </TableCell>
                                        <TableCell onClick={(e) => e.stopPropagation()}>
                                            <DropdownMenu>
                                                <DropdownMenuTrigger asChild>
                                                    <Button variant="ghost" className="h-8 w-8 p-0">
                                                        <span className="sr-only">Open menu</span>
                                                        <MoreHorizontal className="h-4 w-4" />
                                                    </Button>
                                                </DropdownMenuTrigger>
                                                <DropdownMenuContent align="end" className="bg-white/90 backdrop-blur-xl border-glass-border">
                                                    <DropdownMenuLabel>Actions</DropdownMenuLabel>
                                                    <DropdownMenuSeparator />
                                                    <DropdownMenuItem onClick={() => router.push(`/admin/contractors/${contractor.id}`)}>
                                                        View Profile & Docs
                                                    </DropdownMenuItem>
                                                    <DropdownMenuItem
                                                        onClick={() => openResetPassword(contractor)}
                                                        disabled={!canManage}
                                                    >
                                                        <KeyRound className="h-3.5 w-3.5 mr-2" />
                                                        Reset Password
                                                    </DropdownMenuItem>
                                                    <DropdownMenuSeparator />
                                                    <DropdownMenuItem
                                                        className="text-destructive focus:bg-destructive focus:text-destructive-foreground"
                                                        onClick={() => {
                                                            if (!canManage) {
                                                                toast({
                                                                    title: "Insufficient permissions",
                                                                    description: "You can view contractors but cannot change status.",
                                                                    variant: "error"
                                                                })
                                                                return
                                                            }
                                                            setSuspendTarget({ contractorId: contractor.id, isActive: contractor.isActive })
                                                            setIsSuspendOpen(true)
                                                        }}
                                                        disabled={!canManage}
                                                    >
                                                        {contractor.isActive === false ? "Activate Contractor" : "Suspend Contractor"}
                                                    </DropdownMenuItem>
                                                </DropdownMenuContent>
                                            </DropdownMenu>
                                        </TableCell>
                                    </TableRow>
                                ))
                            )}
                        </TableBody>
                    </Table>
                    <DataPagination {...contractorsPagination} onPageChange={contractorsPagination.setPage} />
                </GlassCardContent>
            </GlassCard>

            <GlassModal
                open={resetPasswordOpen}
                onOpenChange={(open) => {
                    setResetPasswordOpen(open)
                    if (!open) {
                        setResetPasswordTarget(null)
                        setResetPasswordForm({ password: "" })
                        setResetPasswordErrors({})
                    }
                }}
                title="Reset Password"
                description="Set a new password, or leave it blank to auto-generate one."
                footer={
                    <div className="flex justify-end gap-2 w-full">
                        <Button variant="outline" onClick={() => setResetPasswordOpen(false)}>Cancel</Button>
                        <Button type="button" onClick={submitResetPassword} disabled={resetPasswordLoading || !canManage}>
                            <KeyRound className="h-3.5 w-3.5 mr-1" />
                            {resetPasswordLoading ? "Saving..." : "Reset Password"}
                        </Button>
                    </div>
                }
            >
                <div className="space-y-4">
                    <div className="rounded-xl border border-glass-border bg-white/40 p-4">
                        <p className="text-xs uppercase text-muted-foreground">Contractor</p>
                        <p className="font-semibold text-foreground">{resetPasswordTarget?.name ?? "Selected contractor"}</p>
                        <p className="text-sm text-muted-foreground">{resetPasswordTarget?.email ?? ""}</p>
                    </div>
                    <div className="space-y-2">
                        <Label optional>New Password</Label>
                        <Input
                            className={`w-full h-10 ${resetPasswordErrors.password ? "border-destructive" : ""}`}
                            type="password"
                            name="reset-contractor-list-new-password"
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
                open={isSuspendOpen}
                onOpenChange={setIsSuspendOpen}
                title={suspendTarget?.isActive === false ? "Activate Contractor?" : "Suspend Contractor?"}
                description={suspendTarget?.isActive === false ? "This will restore access for the contractor." : "This will disable contractor access."}
                footer={
                    <div className="flex justify-end gap-2 w-full">
                        <Button variant="outline" onClick={() => setIsSuspendOpen(false)}>Cancel</Button>
                        <Button
                            variant="destructive"
                            onClick={async () => {
                                if (!canManage) {
                                    toast({
                                        title: "Insufficient permissions",
                                        description: "You can view contractors but cannot change status.",
                                        variant: "error"
                                    })
                                    return
                                }
                                if (!suspendTarget?.contractorId) return
                                try {
                                    const endpoint = suspendTarget.isActive === false ? "activate" : "suspend"
                                    await apiPost(`/contractors/${suspendTarget.contractorId}/${endpoint}`)
                                    setContractors((prev) => prev.map((c) =>
                                        c.id === suspendTarget.contractorId
                                            ? { ...c, status: suspendTarget.isActive === false ? "Active" : "Suspended", isActive: suspendTarget.isActive === false }
                                            : c
                                    ))
                                    toast({
                                        title: suspendTarget.isActive === false ? "Activated" : "Suspended",
                                        description: suspendTarget.isActive === false ? "Contractor activated." : "Contractor suspended.",
                                        variant: "success"
                                    })
                                    setIsSuspendOpen(false)
                                } catch (err: any) {
                                    toast({
                                        title: "Action Failed",
                                        description: err?.message ?? "Failed to update contractor status.",
                                        variant: "error"
                                    })
                                }
                            }}
                        >
                            {suspendTarget?.isActive === false ? "Activate" : "Suspend"}
                        </Button>
                    </div>
                }
            >
                <div className="sr-only" aria-hidden="true" />
            </GlassModal>
            <ErrorToast error={error} onClear={() => setError(null)} />
            </>
            )}
        </PageContainer>
    )
}

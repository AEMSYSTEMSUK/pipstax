"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { PageContainer } from "@/components/layout/PageContainer"
import { GlassCard, GlassCardContent, GlassCardHeader, GlassCardTitle, GlassCardDescription } from "@/components/glass/GlassCard"
import { GlassModal } from "@/components/glass/GlassModal"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { ShieldCheck, Plus, Search, Mail, Phone, Pencil, Users, Trash2, Eye, KeyRound } from "lucide-react"
import { apiDelete, apiGet, apiPost, apiPut, isDeleteCancelled } from "@/lib/api"
import { ErrorToast } from "@/components/shared/ErrorToast"
import { PhoneInput } from "@/components/shared/LocalizedFields"
import { DataPagination, useClientPagination } from "@/components/shared/DataPagination"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useToast } from "@/components/ui/toast"
import { getModulePermissions } from "@/lib/permission-ui"
import { getAuth } from "@/lib/auth"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import { useSearchParams } from "next/navigation"
import { quickCreatedEventName } from "@/components/shared/QuickCreateProvider"

export default function TeamPage() {
    const searchParams = useSearchParams()
    const [searchQuery, setSearchQuery] = useState("")
    const [searchInputUnlocked, setSearchInputUnlocked] = useState(false)
    const [teamMembers, setTeamMembers] = useState<any[]>([])
    const [error, setError] = useState<string | null>(null)
    const [inviteOpen, setInviteOpen] = useState(false)
    const [inviteLoading, setInviteLoading] = useState(false)
    const [inviteForm, setInviteForm] = useState({ fullName: "", email: "", phone: "", role: "MANAGER", hourlyRate: "", password: "" })
    const [inviteErrors, setInviteErrors] = useState<{ fullName?: string; email?: string; password?: string }>({})
    const [credentialsOpen, setCredentialsOpen] = useState(false)
    const [credentials, setCredentials] = useState<{ email: string; loginUrl: string; tempPassword?: string | null } | null>(null)
    const [editOpen, setEditOpen] = useState(false)
    const [editLoading, setEditLoading] = useState(false)
    const [editMember, setEditMember] = useState<any | null>(null)
    const [editForm, setEditForm] = useState({ fullName: "", phone: "", hourlyRate: "", role: "MANAGER" })
    const [editErrors, setEditErrors] = useState<{ fullName?: string; hourlyRate?: string }>({})
    const [resetPasswordOpen, setResetPasswordOpen] = useState(false)
    const [resetPasswordLoading, setResetPasswordLoading] = useState(false)
    const [resetPasswordMember, setResetPasswordMember] = useState<any | null>(null)
    const [resetPasswordForm, setResetPasswordForm] = useState({ currentPassword: "", password: "" })
    const [resetPasswordErrors, setResetPasswordErrors] = useState<{ currentPassword?: string; password?: string }>({})
    const [teams, setTeams] = useState<any[]>([])
    const [assignableWorkers, setAssignableWorkers] = useState<any[]>([])
    const [teamModalOpen, setTeamModalOpen] = useState(false)
    const [teamSaving, setTeamSaving] = useState(false)
    const [teamEditTarget, setTeamEditTarget] = useState<any | null>(null)
    const [teamForm, setTeamForm] = useState({
        name: "",
        description: "",
        hourlyRate: "",
        memberUserIds: [] as string[],
    })
    const [teamErrors, setTeamErrors] = useState<{ name?: string; memberUserIds?: string; hourlyRate?: string }>({})
    const { toast } = useToast()
    const { canView, canManage } = getModulePermissions("team.view", "team.manage")
    const fieldWorkerOption = { value: "FIELD_WORKER", label: "Field Worker" }
    const fallbackRoleOptions = [
        fieldWorkerOption,
        { value: "ADMIN", label: "Admin" },
        { value: "MANAGER", label: "Manager" },
        { value: "HR", label: "HR" }
    ]
    const [teamRoleOptions, setTeamRoleOptions] = useState(fallbackRoleOptions)
    const roleLabelMap = useMemo(() => new Map(teamRoleOptions.map((role) => [role.value, role.label])), [teamRoleOptions])
    const teamRoleCodes = useMemo(() => new Set(teamRoleOptions.map((role) => role.value)), [teamRoleOptions])

    useEffect(() => {
        if (!canManage) return
        if (searchParams.get("create") === "employee") {
            setInviteOpen(true)
        }
        if (searchParams.get("create") === "team") {
            setTeamEditTarget(null)
            setTeamModalOpen(true)
        }
    }, [canManage, searchParams])

    const buildTeamRoleOptions = (roles: any[]) => {
        const excluded = new Set(["CUSTOMER", "SUB_CONTRACTOR"])
        const mapped = roles
            .filter((role) => role && !excluded.has(role.code))
            .map((role) => ({
                value: role.code,
                label: role.name ?? role.code?.toString().replace(/_/g, " ")
            }))
            .filter((role) => role.value !== "FIELD_WORKER")
        const deduped = new Map<string, string>()
        mapped.forEach((role) => {
            if (!deduped.has(role.value)) {
                deduped.set(role.value, role.label)
            }
        })
        return [fieldWorkerOption, ...Array.from(deduped.entries()).map(([value, label]) => ({ value, label }))]
    }

    const loadEmployeesAndTeams = async () => {
        try {
            const [usersRes, rolesRes, teamsRes, workersRes] = await Promise.all([
                apiGet<any[]>(`/users`),
                apiGet<any[]>(`/settings/roles`).catch(() => ({ data: [] })),
                apiGet<any[]>(`/teams`).catch(() => ({ data: [] })),
                apiGet<any[]>(`/teams/assignable-workers`).catch(() => ({ data: [] })),
            ])
                const roles = Array.isArray(rolesRes.data) ? rolesRes.data : []
                const nextRoleOptions = roles.length > 0 ? buildTeamRoleOptions(roles) : fallbackRoleOptions
                setTeamRoleOptions(nextRoleOptions)
            setTeamMembers(Array.isArray(usersRes.data) ? usersRes.data : [])
            setTeams(Array.isArray(teamsRes.data) ? teamsRes.data : [])
            setAssignableWorkers(Array.isArray(workersRes.data) ? workersRes.data : [])
            setError(null)
        } catch (err: any) {
            setError(err?.message ?? "Failed to load employees")
        }
    }

    useEffect(() => {
        loadEmployeesAndTeams()
    }, [])

    useEffect(() => {
        const handleQuickCreated = (event: Event) => {
            const customEvent = event as CustomEvent<{ type?: string; data?: any }>
            const { type, data } = customEvent.detail ?? {}

            if (type === "role" && data?.code) {
                const nextRole = { value: data.code, label: data.name ?? String(data.code).replace(/_/g, " ") }
                setTeamRoleOptions((prev) => [nextRole, ...prev.filter((role) => role.value !== nextRole.value)])
                setInviteForm((prev) => ({ ...prev, role: nextRole.value }))
            }

            if (type === "employee" && data?.id) {
                setTeamMembers((prev) => [data, ...prev.filter((member) => member.id !== data.id)])
            }
        }

        window.addEventListener(quickCreatedEventName, handleQuickCreated)
        return () => window.removeEventListener(quickCreatedEventName, handleQuickCreated)
    }, [])

    useEffect(() => {
        if (!teamRoleCodes.has(inviteForm.role)) {
            setInviteForm((prev) => ({ ...prev, role: teamRoleOptions[0]?.value ?? "FIELD_WORKER" }))
        }
    }, [teamRoleCodes, inviteForm.role, teamRoleOptions])

    const handleInvite = async () => {
        if (!canManage) {
            toast({ title: "Insufficient permissions", description: "You can view employees but cannot invite users.", variant: "error" })
            return
        }
        setInviteErrors({})
        const defaultRole = teamRoleOptions.find((role) => role.value === "MANAGER")?.value ?? teamRoleOptions[0]?.value ?? "FIELD_WORKER"
        setInviteForm({ fullName: "", email: "", phone: "", role: defaultRole, hourlyRate: "", password: "" })
        setInviteOpen(true)
    }

    const submitInvite = async () => {
        if (!canManage) {
            toast({ title: "Insufficient permissions", description: "You can view employees but cannot add users.", variant: "error" })
            return
        }
        const nextErrors: { fullName?: string; email?: string; password?: string } = {}
        if (!inviteForm.fullName.trim()) {
            nextErrors.fullName = "Full name is required."
        }
        if (!inviteForm.email.trim()) {
            nextErrors.email = "Email is required."
        }
        if (inviteForm.password.trim().length > 0 && inviteForm.password.trim().length < 6) {
            nextErrors.password = "Password must be at least 6 characters."
        }
        setInviteErrors(nextErrors)
        if (Object.keys(nextErrors).length > 0) {
            return
        }
        try {
            setInviteLoading(true)
            const hourlyRate =
                inviteForm.hourlyRate.trim().length > 0 ? Number(inviteForm.hourlyRate) : undefined
            const res = await apiPost<{ user: any; authDetails?: { tempPassword?: string; loginUrl?: string; email?: string } }>(`/users`, {
                fullName: inviteForm.fullName.trim(),
                email: inviteForm.email.trim(),
                phone: inviteForm.phone.trim() || undefined,
                hourlyRate: typeof hourlyRate === "number" && Number.isFinite(hourlyRate) ? hourlyRate : undefined,
                password: inviteForm.password.trim() || undefined,
                roleCodes: [inviteForm.role]
            })
            setTeamMembers((prev) => [res.data.user, ...prev])
            setInviteOpen(false)
            const defaultRole = teamRoleOptions.find((role) => role.value === "MANAGER")?.value ?? teamRoleOptions[0]?.value ?? "FIELD_WORKER"
            setInviteForm({ fullName: "", email: "", phone: "", role: defaultRole, hourlyRate: "", password: "" })
            setInviteErrors({})

            const authDetails = res.data.authDetails
            if (authDetails?.loginUrl) {
                setCredentials({
                    email: authDetails.email ?? inviteForm.email.trim(),
                    loginUrl: authDetails.loginUrl,
                    tempPassword: authDetails.tempPassword ?? null
                })
                setCredentialsOpen(true)
            } else {
                toast({
                    title: "Team member added",
                    description: "Login details have been emailed to the user.",
                    variant: "success"
                })
            }
        } catch (err: any) {
            setError(err?.message ?? "Failed to add employee")
        } finally {
            setInviteLoading(false)
        }
    }

    const openEditMember = (member: any) => {
        if (!canManage) {
            toast({ title: "Insufficient permissions", description: "You can view employees but cannot edit users.", variant: "error" })
            return
        }
        setEditMember(member)
        setEditForm({
            fullName: member.fullName ?? "",
            phone: member.phone ?? "",
            hourlyRate:
                member.hourlyRate !== null && typeof member.hourlyRate !== "undefined"
                    ? String(member.hourlyRate)
                    : "",
            role: (member.roles || [])[0]?.code ?? "MANAGER"
        })
        setEditErrors({})
        setEditOpen(true)
    }

    const openResetPassword = (member: any) => {
        if (!canManage) {
            toast({ title: "Insufficient permissions", description: "You can view employees but cannot reset passwords.", variant: "error" })
            return
        }
        setResetPasswordMember(member)
        setResetPasswordForm({ currentPassword: "", password: "" })
        setResetPasswordErrors({})
        setResetPasswordOpen(true)
    }

    const submitEditMember = async () => {
        if (!editMember) return
        const nextErrors: { fullName?: string; hourlyRate?: string } = {}
        if (!editForm.fullName.trim()) {
            nextErrors.fullName = "Full name is required."
        }
        if (editForm.hourlyRate.trim().length > 0) {
            const rate = Number(editForm.hourlyRate)
            if (!Number.isFinite(rate) || rate < 0) {
                nextErrors.hourlyRate = "Hourly rate must be 0 or more."
            }
        }
        setEditErrors(nextErrors)
        if (Object.keys(nextErrors).length > 0) {
            return
        }
        try {
            setEditLoading(true)
            const payload = {
                fullName: editForm.fullName.trim(),
                phone: editForm.phone.trim() || "",
                hourlyRate:
                    editForm.hourlyRate.trim().length > 0
                        ? Number(editForm.hourlyRate)
                        : undefined
            }
            const res = await apiPut<any>(`/users/${editMember.id}`, payload)
            let updatedMember = res.data
            const currentRole = (editMember.roles || [])[0]?.code
            if (canEditRoles && editForm.role && editForm.role !== currentRole) {
                const roleRes = await apiPut<any>(`/users/${editMember.id}/roles`, { roleCodes: [editForm.role] })
                updatedMember = roleRes.data
            }
            setTeamMembers((prev) => prev.map((member) => (member.id === editMember.id ? updatedMember : member)))
            toast({ title: "Member updated", description: "Team member details saved.", variant: "success" })
            setEditOpen(false)
            setEditMember(null)
        } catch (err: any) {
            setError(err?.message ?? "Failed to update employee")
        } finally {
            setEditLoading(false)
        }
    }

    const submitResetPassword = async () => {
        if (!resetPasswordMember) return
        const isOwnPasswordChange = resetPasswordMember.id === currentUserId
        const currentPassword = resetPasswordForm.currentPassword.trim()
        const password = resetPasswordForm.password.trim()
        const nextErrors: { currentPassword?: string; password?: string } = {}
        if (isOwnPasswordChange && !currentPassword) {
            nextErrors.currentPassword = "Current password is required."
        }
        if (isOwnPasswordChange && !password) {
            nextErrors.password = "New password is required."
        } else if (password.length > 0 && password.length < 6) {
            nextErrors.password = "Password must be at least 6 characters."
        }
        setResetPasswordErrors(nextErrors)
        if (Object.keys(nextErrors).length > 0) {
            return
        }
        try {
            setResetPasswordLoading(true)
            if (isOwnPasswordChange) {
                await apiPost<{ updated: boolean }>(`/users/change-password`, {
                    currentPassword,
                    newPassword: password,
                })
                setResetPasswordOpen(false)
                setResetPasswordMember(null)
                toast({ title: "Password changed", description: "Your password has been updated.", variant: "success" })
                return
            }
            const res = await apiPost<{ updated: boolean; authDetails?: { tempPassword?: string; loginUrl?: string; email?: string } }>(
                `/users/${resetPasswordMember.id}/reset-password`,
                { password: password || undefined }
            )
            const authDetails = res.data.authDetails
            setCredentials({
                email: authDetails?.email ?? resetPasswordMember.email,
                loginUrl: authDetails?.loginUrl ?? "",
                tempPassword: authDetails?.tempPassword ?? null,
            })
            setResetPasswordOpen(false)
            setResetPasswordMember(null)
            setCredentialsOpen(true)
            toast({ title: "Password reset", description: "The new login details are ready to share.", variant: "success" })
        } catch (err: any) {
            setError(err?.message ?? "Failed to reset password")
        } finally {
            setResetPasswordLoading(false)
        }
    }

    const openCreateTeam = () => {
        if (!canManage) {
            toast({ title: "Insufficient permissions", description: "You can view employees but cannot create teams.", variant: "error" })
            return
        }
        setTeamEditTarget(null)
        setTeamForm({ name: "", description: "", hourlyRate: "", memberUserIds: [] })
        setTeamErrors({})
        setTeamModalOpen(true)
    }

    const openEditTeam = (team: any) => {
        if (!canManage) {
            toast({ title: "Insufficient permissions", description: "You can view employees but cannot edit teams.", variant: "error" })
            return
        }
        setTeamEditTarget(team)
        setTeamForm({
            name: team.name ?? "",
            description: team.description ?? "",
            hourlyRate:
                typeof team.hourlyRate !== "undefined" && team.hourlyRate !== null
                    ? String(team.hourlyRate)
                    : "",
            memberUserIds: Array.isArray(team.members) ? team.members.map((member: any) => member.userId) : [],
        })
        setTeamErrors({})
        setTeamModalOpen(true)
    }

    const toggleTeamMember = (userId: string, checked: boolean) => {
        setTeamForm((prev) => {
            const next = new Set(prev.memberUserIds)
            if (checked) next.add(userId)
            else next.delete(userId)
            return { ...prev, memberUserIds: Array.from(next) }
        })
    }

    const saveTeam = async () => {
        if (!canManage) {
            toast({ title: "Insufficient permissions", description: "You can view employees but cannot save teams.", variant: "error" })
            return
        }
        const nextErrors: { name?: string; memberUserIds?: string } = {}
        if (!teamForm.name.trim()) {
            nextErrors.name = "Team name is required."
        }
        setTeamErrors(nextErrors)
        if (Object.keys(nextErrors).length > 0) {
            return
        }

        const rate =
            teamForm.hourlyRate.trim().length > 0 ? Number(teamForm.hourlyRate) : undefined
        if (typeof rate === "number" && (!Number.isFinite(rate) || rate < 0)) {
            setTeamErrors({ hourlyRate: "Hourly rate must be 0 or more." })
            return
        }

        try {
            setTeamSaving(true)
            const payload = {
                name: teamForm.name.trim(),
                description: teamForm.description.trim() || undefined,
                hourlyRate: typeof rate === "number" && Number.isFinite(rate) ? rate : undefined,
                memberUserIds: teamForm.memberUserIds,
            }
            if (teamEditTarget) {
                await apiPut(`/teams/${teamEditTarget.id}`, payload)
                await apiPut(`/teams/${teamEditTarget.id}/members`, { memberUserIds: payload.memberUserIds })
                toast({ title: "Team updated", description: "Team details were saved.", variant: "success" })
            } else {
                await apiPost(`/teams`, payload)
                toast({ title: "Team created", description: "New internal crew team created.", variant: "success" })
            }
            setTeamModalOpen(false)
            await loadEmployeesAndTeams()
        } catch (err: any) {
            setError(err?.message ?? "Failed to save team")
        } finally {
            setTeamSaving(false)
        }
    }

    const removeTeam = async (teamId: string) => {
        if (!canManage) {
            toast({ title: "Insufficient permissions", description: "You can view employees but cannot delete teams.", variant: "error" })
            return
        }
        try {
            await apiDelete(`/teams/${teamId}`)
            setTeams((prev) => prev.filter((team) => team.id !== teamId))
            toast({ title: "Team deleted", description: "Team removed successfully.", variant: "success" })
        } catch (err: any) {
            if (isDeleteCancelled(err)) return
            setError(err?.message ?? "Failed to delete team")
        }
    }

    const filteredMembers = teamMembers.filter((member) => {
        const roles = (member.roles || []).map((r: any) => r.code)
        const isTeamRole = roles.some((code: string) => teamRoleCodes.has(code))
        const matchSearch = member.fullName?.toLowerCase().includes(searchQuery.toLowerCase()) || member.email?.toLowerCase().includes(searchQuery.toLowerCase())
        return isTeamRole && matchSearch
    })
    const membersPagination = useClientPagination(filteredMembers)

    const primaryAdminId = teamMembers
        .filter((member) => (member.roles || []).some((r: any) => r.code === "ADMIN"))
        .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())[0]?.id
    const currentUserId = getAuth()?.user?.id
    const canEditRoles = Boolean(primaryAdminId && currentUserId && primaryAdminId === currentUserId)

    return (
        <PageContainer>
            {!canView ? (
                <GlassCard>
                    <GlassCardHeader>
                        <GlassCardTitle>Employees</GlassCardTitle>
                    </GlassCardHeader>
                    <GlassCardContent>You do not have access to view employees.</GlassCardContent>
                </GlassCard>
            ) : (
            <>
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-foreground">Employees</h1>
                    <p className="text-muted-foreground mt-1 text-sm">Manage employee access, teams, roles, and payroll rates.</p>
                </div>

                <div className="flex items-center gap-2">
                    <Button variant="outline" className="gap-2" onClick={openCreateTeam} disabled={!canManage}>
                        <Users className="h-4 w-4" /> New Team
                    </Button>
                    <Button className="gap-2" onClick={handleInvite} disabled={!canManage}>
                        <Plus className="h-4 w-4" /> Add Employee
                    </Button>
                </div>
            </div>

            <GlassModal
                open={inviteOpen}
                onOpenChange={setInviteOpen}
                title="Add Employee"
                description="Create an employee and send login details."
                footer={
                    <div className="flex justify-end gap-2 w-full">
                        <Button variant="outline" onClick={() => setInviteOpen(false)}>Cancel</Button>
                        <Button onClick={submitInvite} disabled={inviteLoading}>
                            {inviteLoading ? "Creating..." : "Create Member"}
                        </Button>
                    </div>
                }
            >
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                        <Label required>Full Name</Label>
                        <Input className="w-full h-10" value={inviteForm.fullName} onChange={(e) => setInviteForm((prev) => ({ ...prev, fullName: e.target.value }))} />
                        {inviteErrors.fullName && <p className="text-xs text-destructive">{inviteErrors.fullName}</p>}
                    </div>
                    <div className="space-y-2">
                        <Label required>Email</Label>
                        <Input className="w-full h-10" type="email" value={inviteForm.email} onChange={(e) => setInviteForm((prev) => ({ ...prev, email: e.target.value }))} />
                        {inviteErrors.email && <p className="text-xs text-destructive">{inviteErrors.email}</p>}
                    </div>
                    <div className="space-y-2">
                        <Label optional>Phone</Label>
                        <PhoneInput value={inviteForm.phone} onChange={(phone) => setInviteForm((prev) => ({ ...prev, phone }))} />
                    </div>
                    <div className="space-y-2">
                        <Label optional>Hourly Rate</Label>
                        <Input
                            className="w-full h-10"
                            type="number"
                            min={0}
                            step={0.5}
                            value={inviteForm.hourlyRate}
                            onChange={(e) => setInviteForm((prev) => ({ ...prev, hourlyRate: e.target.value }))}
                            placeholder="e.g. 25"
                        />
                    </div>
                    <div className="space-y-2">
                        <Label required>Role</Label>
                        <Select
                            value={inviteForm.role}
                            createOption={{ label: "role", href: "/admin/settings?create=role" }}
                            onValueChange={(value) => setInviteForm((prev) => ({ ...prev, role: value }))}
                        >
                            <SelectTrigger className="bg-white/60 w-full h-10">
                                <SelectValue placeholder="Select role" />
                            </SelectTrigger>
                            <SelectContent>
                                {teamRoleOptions.map((role) => (
                                    <SelectItem key={role.value} value={role.value}>
                                        {role.label}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        {inviteForm.role === "FIELD_WORKER" && (
                            <p className="text-xs text-muted-foreground">Field workers use the worker app only and cannot access this tenant panel.</p>
                        )}
                    </div>
                    <div className="space-y-2">
                        <Label optional>Password</Label>
                        <Input
                            className={`w-full h-10 ${inviteErrors.password ? "border-destructive" : ""}`}
                            type="password"
                            name="new-employee-temporary-password"
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
                </div>
            </GlassModal>

            <GlassModal
                open={credentialsOpen}
                onOpenChange={setCredentialsOpen}
                title="Login Details"
                description="Share these credentials with the employee."
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
                            <p className="text-xs text-muted-foreground mt-1">Worker accounts can only log in via the worker app.</p>
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
                open={editOpen}
                onOpenChange={(open) => {
                    setEditOpen(open)
                    if (!open) {
                        setEditMember(null)
                        setEditErrors({})
                    }
                }}
                title="Edit Team Member"
                description="Update profile details, role, and hourly rate."
                footer={
                    <div className="flex justify-end gap-2 w-full">
                        <Button variant="outline" onClick={() => setEditOpen(false)}>Cancel</Button>
                        {editMember?.id !== primaryAdminId && (
                            <Button onClick={submitEditMember} disabled={editLoading || !canManage}>
                                {editLoading ? "Saving..." : "Save Changes"}
                            </Button>
                        )}
                    </div>
                }
            >
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                        <Label required>Full Name</Label>
                        <Input
                            className="w-full h-10"
                            value={editForm.fullName}
                            onChange={(e) => setEditForm((prev) => ({ ...prev, fullName: e.target.value }))}
                            disabled={editMember?.id === primaryAdminId}
                        />
                        {editErrors.fullName && <p className="text-xs text-destructive">{editErrors.fullName}</p>}
                    </div>
                    <div className="space-y-2">
                        <Label required>Email</Label>
                        <Input className="w-full h-10" value={editMember?.email ?? ""} disabled />
                    </div>
                    <div className="space-y-2">
                        <Label optional>Phone</Label>
                        <PhoneInput
                            value={editForm.phone}
                            onChange={(phone) => setEditForm((prev) => ({ ...prev, phone }))}
                            disabled={editMember?.id === primaryAdminId}
                        />
                    </div>
                    <div className="space-y-2">
                        <Label optional>Hourly Rate</Label>
                        <Input
                            className={`w-full h-10 ${editErrors.hourlyRate ? "border-destructive" : ""}`}
                            type="number"
                            min={0}
                            step={0.5}
                            value={editForm.hourlyRate}
                            onChange={(e) => setEditForm((prev) => ({ ...prev, hourlyRate: e.target.value }))}
                            placeholder="e.g. 25"
                            disabled={editMember?.id === primaryAdminId}
                        />
                        {editErrors.hourlyRate && <p className="text-xs text-destructive">{editErrors.hourlyRate}</p>}
                    </div>
                    <div className="space-y-2 md:col-span-2">
                        <Label required>Role</Label>
                        <Select
                            value={editForm.role}
                            createOption={{ label: "role", href: "/admin/settings?create=role" }}
                            onValueChange={(value) => setEditForm((prev) => ({ ...prev, role: value }))}
                            disabled={!canEditRoles || editMember?.id === primaryAdminId}
                        >
                            <SelectTrigger className="bg-white/60 w-full h-10">
                                <SelectValue placeholder="Select role" />
                            </SelectTrigger>
                            <SelectContent>
                                {teamRoleOptions.map((role) => (
                                    <SelectItem key={role.value} value={role.value}>
                                        {role.label}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        {(!canEditRoles || editMember?.id === primaryAdminId) && (
                            <p className="text-xs text-muted-foreground">
                                {editMember?.id === primaryAdminId ? "Primary admin role cannot be changed." : "Only the primary admin can change employee roles."}
                            </p>
                        )}
                    </div>
                </div>
            </GlassModal>

            <GlassModal
                open={resetPasswordOpen}
                onOpenChange={(open) => {
                    setResetPasswordOpen(open)
                    if (!open) {
                        setResetPasswordMember(null)
                        setResetPasswordForm({ currentPassword: "", password: "" })
                        setResetPasswordErrors({})
                    }
                }}
                title={resetPasswordMember?.id === currentUserId ? "Change My Password" : "Reset Password"}
                description={
                    resetPasswordMember?.id === currentUserId
                        ? "Enter your current password before setting a new one."
                        : "Set a new password, or leave it blank to auto-generate one."
                }
                footer={
                    <div className="flex justify-end gap-2 w-full">
                        <Button variant="outline" onClick={() => setResetPasswordOpen(false)}>Cancel</Button>
                        <Button type="button" onClick={submitResetPassword} disabled={resetPasswordLoading || !canManage}>
                            <KeyRound className="h-3.5 w-3.5 mr-1" />
                            {resetPasswordLoading
                                ? "Saving..."
                                : resetPasswordMember?.id === currentUserId
                                ? "Change Password"
                                : "Reset Password"}
                        </Button>
                    </div>
                }
            >
                <div className="space-y-4">
                    <div className="rounded-xl border border-glass-border bg-white/40 p-4">
                        <p className="text-xs uppercase text-muted-foreground">Team Member</p>
                        <p className="font-semibold text-foreground">{resetPasswordMember?.fullName ?? "Selected member"}</p>
                        <p className="text-sm text-muted-foreground">{resetPasswordMember?.email ?? ""}</p>
                    </div>
                    {resetPasswordMember?.id === currentUserId && (
                        <div className="space-y-2">
                            <Label required>Current Password</Label>
                            <Input
                                className={`w-full h-10 ${resetPasswordErrors.currentPassword ? "border-destructive" : ""}`}
                                type="password"
                                name="reset-current-password-confirmation"
                                autoComplete="current-password"
                                value={resetPasswordForm.currentPassword}
                                onChange={(e) => setResetPasswordForm((prev) => ({ ...prev, currentPassword: e.target.value }))}
                                placeholder="Enter current password"
                            />
                            {resetPasswordErrors.currentPassword && <p className="text-xs text-destructive">{resetPasswordErrors.currentPassword}</p>}
                        </div>
                    )}
                    <div className="space-y-2">
                        <Label optional={resetPasswordMember?.id !== currentUserId} required={resetPasswordMember?.id === currentUserId}>New Password</Label>
                        <Input
                            className={`w-full h-10 ${resetPasswordErrors.password ? "border-destructive" : ""}`}
                            type="password"
                            name="reset-team-member-new-password"
                            autoComplete="new-password"
                            data-lpignore="true"
                            data-1p-ignore="true"
                            value={resetPasswordForm.password}
                            onChange={(e) => setResetPasswordForm((prev) => ({ ...prev, password: e.target.value }))}
                            placeholder={resetPasswordMember?.id === currentUserId ? "Enter new password" : "Leave blank to auto-generate"}
                        />
                        {resetPasswordErrors.password ? (
                            <p className="text-xs text-destructive">{resetPasswordErrors.password}</p>
                        ) : (
                            <p className="text-xs text-muted-foreground">
                                {resetPasswordMember?.id === currentUserId
                                    ? "Your current password is required to change your own password."
                                    : "Generated/reset credentials will be shown after reset and emailed to the user."}
                            </p>
                        )}
                    </div>
                </div>
            </GlassModal>

            <GlassModal
                open={teamModalOpen}
                onOpenChange={(open) => {
                    setTeamModalOpen(open)
                    if (!open) {
                        setTeamEditTarget(null)
                        setTeamErrors({})
                    }
                }}
                title={teamEditTarget ? "Edit Team" : "Create Team"}
                description="Group internal field workers into assignable job teams."
                footer={
                    <div className="flex justify-end gap-2 w-full">
                        <Button variant="outline" onClick={() => setTeamModalOpen(false)}>
                            Cancel
                        </Button>
                        <Button onClick={saveTeam} disabled={teamSaving || !canManage}>
                            {teamSaving ? "Saving..." : teamEditTarget ? "Save Team" : "Create Team"}
                        </Button>
                    </div>
                }
            >
                <div className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label required>Team Name</Label>
                            <Input
                                className="w-full h-10"
                                value={teamForm.name}
                                onChange={(e) => setTeamForm((prev) => ({ ...prev, name: e.target.value }))}
                                placeholder="e.g. Installation Engineers"
                            />
                            {teamErrors.name && <p className="text-xs text-destructive">{teamErrors.name}</p>}
                        </div>
                        <div className="space-y-2">
                            <Label optional>Team Hourly Rate</Label>
                            <Input
                                className="w-full h-10"
                                type="number"
                                min={0}
                                step={0.5}
                                value={teamForm.hourlyRate}
                                onChange={(e) => setTeamForm((prev) => ({ ...prev, hourlyRate: e.target.value }))}
                                placeholder="Defaults to individual rate when empty"
                            />
                            {teamErrors.hourlyRate && <p className="text-xs text-destructive">{teamErrors.hourlyRate}</p>}
                        </div>
                    </div>
                    <div className="space-y-2">
                        <Label optional>Description</Label>
                        <Input
                            className="w-full h-10"
                            value={teamForm.description}
                            onChange={(e) => setTeamForm((prev) => ({ ...prev, description: e.target.value }))}
                            placeholder="What this team usually handles"
                        />
                    </div>
                    <div className="space-y-2">
                        <Label optional>Team Members (field workers)</Label>
                        <div className="max-h-56 overflow-auto rounded-lg border border-glass-border bg-white/40 p-3 space-y-2">
                            {assignableWorkers.length === 0 ? (
                                <p className="text-sm text-muted-foreground">No eligible field workers available yet.</p>
                            ) : (
                                assignableWorkers.map((worker) => {
                                    const checked = teamForm.memberUserIds.includes(worker.id)
                                    return (
                                        <label
                                            key={worker.id}
                                            className="flex items-center justify-between gap-3 rounded-md border border-transparent px-2 py-1.5 hover:bg-white/70 cursor-pointer"
                                        >
                                            <div>
                                                <p className="text-sm font-medium text-foreground">{worker.fullName ?? worker.email}</p>
                                                <p className="text-xs text-muted-foreground">{worker.email}</p>
                                            </div>
                                            <Checkbox checked={checked} onCheckedChange={(next) => toggleTeamMember(worker.id, Boolean(next))} />
                                        </label>
                                    )
                                })
                            )}
                        </div>
                    </div>
                </div>
            </GlassModal>

            <GlassCard>
                <GlassCardHeader className="pb-3 border-b border-glass-border/50 flex flex-col sm:flex-row items-center justify-between gap-4">
                    <div>
                    <GlassCardTitle className="text-lg">Employee Directory</GlassCardTitle>
                    <GlassCardDescription>{filteredMembers.length} members in workspace</GlassCardDescription>
                    </div>
                    <div className="relative w-full sm:w-64">
                        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                        <Input
                            placeholder="Search by name or email..."
                            className="pl-9 bg-white/40 h-9"
                            type="search"
                            name="team-directory-search"
                            autoComplete="off"
                            data-lpignore="true"
                            data-1p-ignore="true"
                            readOnly={!searchInputUnlocked}
                            onFocus={() => setSearchInputUnlocked(true)}
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                        />
                    </div>
                </GlassCardHeader>
                <GlassCardContent className="p-0">
                    <Table>
                        <TableHeader className="bg-black/5">
                            <TableRow className="border-glass-border">
                                <TableHead>Member</TableHead>
                                <TableHead>Contact</TableHead>
                                <TableHead>System Role</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead>Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {membersPagination.paginatedItems.map((member) => (
                                <TableRow key={member.id} className="border-glass-border hover:bg-black/5 transition-colors">
                                    <TableCell>
                                        <div className="flex items-center gap-3">
                                            <div className="h-10 w-10 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-sm shadow-sm">
                                                {(member.fullName ?? "U").split(' ').map((n: string) => n[0]).join('')}
                                            </div>
                                            <div className="flex flex-col">
                                                <div className="flex items-center gap-2 flex-wrap">
                                                    <span className="font-semibold text-sm">{member.fullName ?? "User"}</span>
                                                    {(member.roles || [])[0]?.code === "FIELD_WORKER" && (
                                                        <Badge variant="secondary" className="text-[10px] px-2 py-0.5">Worker App Only</Badge>
                                                    )}
                                                </div>
                                                <span className="text-xs text-muted-foreground">Joined {member.createdAt ? new Date(member.createdAt).toLocaleDateString() : "N/A"}</span>
                                            </div>
                                        </div>
                                    </TableCell>
                                    <TableCell>
                                        <div className="flex flex-col space-y-1">
                                            <span className="text-sm font-medium flex items-center gap-2 text-muted-foreground">
                                                <Mail className="h-3 w-3" /> {member.email}
                                            </span>
                                            <span className="text-xs flex items-center gap-2 text-muted-foreground">
                                                <Phone className="h-3 w-3" /> {member.phone ?? "N/A"}
                                            </span>
                                            <span className="text-xs text-muted-foreground">
                                                Hourly: {member.hourlyRate !== null && typeof member.hourlyRate !== "undefined" ? `£${Number(member.hourlyRate).toFixed(2)}/hr` : "Not set"}
                                            </span>
                                        </div>
                                    </TableCell>
                                    <TableCell>
                                        <div className="flex items-center gap-2">
                                            <ShieldCheck className="h-4 w-4 text-primary" />
                                            {member.id === primaryAdminId ? (
                                                <span className="font-medium text-sm">Admin (Primary)</span>
                                            ) : (
                                                <span className="font-medium text-sm">
                                                    {roleLabelMap.get((member.roles || [])[0]?.code) ?? (member.roles || [])[0]?.code ?? "Member"}
                                                </span>
                                            )}
                                        </div>
                                    </TableCell>
                                    <TableCell>
                                        <Badge variant={member.isActive ? 'success' : 'secondary'} className="shadow-sm">
                                            {member.isActive ? "Active" : "Inactive"}
                                        </Badge>
                                    </TableCell>
                                    <TableCell>
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <Button
                                                asChild
                                                variant="outline"
                                                size="sm"
                                                className="h-8 px-2"
                                            >
                                                <Link href={`/admin/team/${member.id}`}>
                                                    <Eye className="h-3.5 w-3.5 mr-1" />
                                                    Details
                                                </Link>
                                            </Button>
                                            {canManage && (
                                                <>
                                                    <Button
                                                        variant="outline"
                                                        size="sm"
                                                        className="h-8 px-2"
                                                        onClick={() => openResetPassword(member)}
                                                    >
                                                        <KeyRound className="h-3.5 w-3.5 mr-1" />
                                                        Reset Password
                                                    </Button>
                                                    <Button
                                                        variant="outline"
                                                        size="sm"
                                                        className="h-8 px-2"
                                                        onClick={() => openEditMember(member)}
                                                    >
                                                        <Pencil className="h-3.5 w-3.5 mr-1" />
                                                        {member.id === primaryAdminId ? "Manage" : "Edit"}
                                                    </Button>
                                                </>
                                            )}
                                        </div>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                    <DataPagination {...membersPagination} onPageChange={membersPagination.setPage} />
                </GlassCardContent>
            </GlassCard>

            <GlassCard>
                <GlassCardHeader className="pb-3 border-b border-glass-border/50 flex flex-row items-center justify-between">
                    <div>
                        <GlassCardTitle className="text-lg">Internal Teams</GlassCardTitle>
                        <GlassCardDescription>Create assignable teams for internal crew scheduling.</GlassCardDescription>
                    </div>
                    <Button size="sm" className="gap-2" onClick={openCreateTeam} disabled={!canManage}>
                        <Plus className="h-4 w-4" /> New Team
                    </Button>
                </GlassCardHeader>
                <GlassCardContent className="p-0">
                    <Table>
                        <TableHeader className="bg-black/5">
                            <TableRow className="border-glass-border">
                                <TableHead>Team</TableHead>
                                <TableHead>Members</TableHead>
                                <TableHead>Hourly Rate</TableHead>
                                <TableHead>Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {teams.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={4} className="text-center text-sm text-muted-foreground py-8">
                                        <div className="flex flex-col items-center gap-3">
                                            <span>No teams created yet.</span>
                                            {canManage ? (
                                                <Button size="sm" className="gap-2" onClick={openCreateTeam}>
                                                    <Plus className="h-4 w-4" /> New Team
                                                </Button>
                                            ) : null}
                                        </div>
                                    </TableCell>
                                </TableRow>
                            ) : (
                                teams.map((team) => (
                                    <TableRow key={team.id} className="border-glass-border hover:bg-black/5 transition-colors">
                                        <TableCell>
                                            <p className="font-semibold text-sm text-foreground">{team.name}</p>
                                            <p className="text-xs text-muted-foreground">{team.description || "No description"}</p>
                                        </TableCell>
                                        <TableCell>
                                            <div className="flex flex-wrap gap-1.5">
                                                {(team.members || []).length === 0 ? (
                                                    <span className="text-sm text-muted-foreground">No members</span>
                                                ) : (
                                                    (team.members || []).map((member: any) => (
                                                        <Badge key={member.userId} variant="secondary" className="font-normal">
                                                            {member.fullName}
                                                        </Badge>
                                                    ))
                                                )}
                                            </div>
                                        </TableCell>
                                        <TableCell className="text-sm">
                                            {team.hourlyRate !== null && typeof team.hourlyRate !== "undefined"
                                                ? `£${Number(team.hourlyRate).toFixed(2)}/hr`
                                                : "Uses individual rates"}
                                        </TableCell>
                                        <TableCell>
                                            <div className="flex items-center gap-2">
                                                <Button size="sm" variant="outline" onClick={() => openEditTeam(team)} disabled={!canManage}>
                                                    <Pencil className="h-3.5 w-3.5 mr-1" />
                                                    Edit
                                                </Button>
                                                <Button
                                                    size="sm"
                                                    variant="outline"
                                                    className="text-destructive border-destructive/30 hover:text-destructive"
                                                    onClick={() => removeTeam(team.id)}
                                                    disabled={!canManage}
                                                >
                                                    <Trash2 className="h-3.5 w-3.5 mr-1" />
                                                    Delete
                                                </Button>
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                ))
                            )}
                        </TableBody>
                    </Table>
                </GlassCardContent>
            </GlassCard>
            <ErrorToast error={error} onClear={() => setError(null)} />
            </>
            )}
        </PageContainer>
    )
}

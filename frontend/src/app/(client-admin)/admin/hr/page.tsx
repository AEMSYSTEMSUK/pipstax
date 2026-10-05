"use client"

import { Fragment, useEffect, useMemo, useState } from "react"
import { PageContainer } from "@/components/layout/PageContainer"
import { GlassCard, GlassCardContent, GlassCardHeader, GlassCardTitle } from "@/components/glass/GlassCard"
import { GlassModal } from "@/components/glass/GlassModal"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Search, Download, Calendar as CalendarIcon, Filter, CheckCircle2, MoreHorizontal, Plus, ChevronDown, ChevronRight } from "lucide-react"
import DatePicker from "react-datepicker"
import { apiDelete, apiGet, apiPost, apiPut, downloadFile } from "@/lib/api"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { ErrorToast } from "@/components/shared/ErrorToast"
import { useToast } from "@/components/ui/toast"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { getModulePermissions } from "@/lib/permission-ui"

export default function HRPage() {
    const { toast } = useToast()
    const { canView, canManage } = getModulePermissions("hr.view", "hr.manage")
    const [searchQuery, setSearchQuery] = useState("")
    const [roleFilter, setRoleFilter] = useState<"All" | "Staff" | "Sub-contractor">("All")
    const [statusFilter, setStatusFilter] = useState<string>("All")
    const [timesheetLogs, setTimesheetLogs] = useState<any[]>([])
    const [users, setUsers] = useState<any[]>([])
    const [error, setError] = useState<string | null>(null)
    const [isCreateOpen, setIsCreateOpen] = useState(false)
    const [editTarget, setEditTarget] = useState<any | null>(null)
    const [deleteTarget, setDeleteTarget] = useState<any | null>(null)
    const [saving, setSaving] = useState(false)
    const [expandedWorkers, setExpandedWorkers] = useState<Record<string, boolean>>({})
    const [formErrors, setFormErrors] = useState<{ workerId?: string; date?: string; hours?: string }>({})
    const [form, setForm] = useState({ workerId: "", date: null as Date | null, hours: 0, hourlyRate: 0 })

    useEffect(() => {
        loadTimesheets()
    }, [])

    const loadTimesheets = async () => {
        try {
            const [timesheetRes, usersRes] = await Promise.all([
                apiGet<any[]>("/timesheets/logs"),
                apiGet<any[]>("/users")
            ])
            setTimesheetLogs(Array.isArray(timesheetRes.data) ? timesheetRes.data : [])
            setUsers(Array.isArray(usersRes.data) ? usersRes.data : [])
            setError(null)
        } catch (err: any) {
            setError(err?.message ?? "Failed to load timesheets")
        }
    }

    const userMap = useMemo(() => new Map(users.map((u) => [u.id, u])), [users])

    const getEntryMinutes = (entry: any) => {
        if (entry?.startTime && entry?.endTime) {
            const start = new Date(entry.startTime).getTime()
            const end = new Date(entry.endTime).getTime()
            if (Number.isFinite(start) && Number.isFinite(end) && end > start) {
                return Math.round((end - start) / 60000)
            }
        }
        const hours = Number(entry?.hours ?? 0)
        if (!Number.isFinite(hours) || hours <= 0) return 0
        return Math.round(hours * 60)
    }

    const formatDuration = (minutes: number) => {
        const safe = Number.isFinite(minutes) ? Math.max(0, Math.round(minutes)) : 0
        const hrs = Math.floor(safe / 60)
        const mins = safe % 60
        if (mins === 0) return `${hrs}h`
        if (hrs === 0) return `${mins}m`
        return `${hrs}h ${mins}m`
    }

    const classifyRole = (user: any) => {
        const roles = Array.isArray(user?.roles) ? user.roles : []
        const roleNames = roles.map((r: any) => (r?.name ?? r?.code ?? "").toString().toLowerCase())
        const isSub = roleNames.some((name: string) => name.includes("contract") || name.includes("sub"))
        return isSub ? "Sub-contractor" : "Staff"
    }

    const filteredTimesheets = useMemo(
        () =>
            timesheetLogs.filter((ts) => {
                const worker = userMap.get(ts.workerId)
                const workerName = ts.workerName ?? worker?.fullName ?? "Worker"
                const matchesSearch = workerName.toLowerCase().includes(searchQuery.toLowerCase())
                const matchesRole = roleFilter === "All" ? true : classifyRole(worker) === roleFilter
                const status = ts.approved ? "Approved" : "Submitted"
                const matchesStatus = statusFilter === "All" || status === statusFilter
                return matchesSearch && matchesRole && matchesStatus
            }),
        [timesheetLogs, userMap, searchQuery, roleFilter, statusFilter]
    )

    const groupedTimesheets = useMemo(() => {
        const grouped = new Map<string, { workerId: string; workerName: string; workerEmail: string; roleLabel: string; totalMinutes: number; totalCost: number; entries: any[] }>()
        for (const entry of filteredTimesheets) {
            const worker = userMap.get(entry.workerId)
            const workerName = entry.workerName ?? worker?.fullName ?? "Worker"
            const workerEmail = entry.workerEmail ?? worker?.email ?? ""
            const roleLabel = classifyRole(worker)
            if (!grouped.has(entry.workerId)) {
                grouped.set(entry.workerId, {
                    workerId: entry.workerId,
                    workerName,
                    workerEmail,
                    roleLabel,
                    totalMinutes: 0,
                    totalCost: 0,
                    entries: []
                })
            }
            const item = grouped.get(entry.workerId)!
            const minutes = getEntryMinutes(entry)
            const hours = minutes / 60
            const cost = hours * Number(entry.hourlyRate ?? 0)
            item.totalMinutes += minutes
            item.totalCost += cost
            item.entries.push(entry)
        }
        return Array.from(grouped.values()).map((group) => ({
            ...group,
            entries: [...group.entries].sort((a, b) => {
                const aTs = new Date(a.startTime ?? `${a.date}T00:00:00Z`).getTime()
                const bTs = new Date(b.startTime ?? `${b.date}T00:00:00Z`).getTime()
                return bTs - aTs
            })
        }))
    }, [filteredTimesheets, userMap])

    const totalMinutes = filteredTimesheets.reduce((acc, curr) => acc + getEntryMinutes(curr), 0)
    const totalHours = totalMinutes / 60
    const totalCost = filteredTimesheets.reduce((acc, curr) => acc + ((getEntryMinutes(curr) / 60) * Number(curr.hourlyRate ?? 0)), 0)

    const getStatusBadge = (status: string) => {
        switch (status) {
            case "Paid": return "default"
            case "Approved": return "success"
            case "Submitted": return "warning"
            case "Rejected": return "destructive"
            case "Draft": return "secondary"
            default: return "outline"
        }
    }

    const resetForm = () => {
        setForm({ workerId: "", date: null, hours: 0, hourlyRate: 0 })
        setFormErrors({})
        setEditTarget(null)
    }

    const validateForm = () => {
        const nextErrors: { workerId?: string; date?: string; hours?: string } = {}
        if (!form.workerId) nextErrors.workerId = "Select a worker."
        if (!form.date) nextErrors.date = "Date is required."
        if (!form.hours || form.hours <= 0) nextErrors.hours = "Hours must be > 0."
        setFormErrors(nextErrors)
        return Object.keys(nextErrors).length === 0
    }

    const handleSave = async () => {
        if (!canManage) {
            toast({ title: "Insufficient permissions", description: "You can view timesheets but cannot edit them.", variant: "error" })
            return
        }
        if (!validateForm()) return
        setSaving(true)
        try {
            const payload = {
                workerId: form.workerId,
                date: form.date ? form.date.toISOString().split("T")[0] : undefined,
                hours: Number(form.hours),
                hourlyRate: Number(form.hourlyRate)
            }
            if (editTarget) {
                await apiPut(`/timesheets/${editTarget.entryId}`, payload)
                toast({ title: "Timesheet updated", description: "Entry saved.", variant: "success" })
            } else {
                await apiPost("/timesheets", payload)
                toast({ title: "Timesheet created", description: "Entry logged.", variant: "success" })
            }
            setIsCreateOpen(false)
            resetForm()
            await loadTimesheets()
        } catch (err: any) {
            toast({ title: "Save failed", description: err?.message ?? "Please try again.", variant: "error" })
        } finally {
            setSaving(false)
        }
    }

    const handleBatchApprove = async () => {
        if (!canManage) {
            toast({ title: "Insufficient permissions", description: "You can view timesheets but cannot approve them.", variant: "error" })
            return
        }
        const pending = filteredTimesheets.filter((t) => t.entryKind === "MANUAL" && !t.approved)
        if (pending.length === 0) {
            toast({ title: "No pending timesheets", description: "All visible entries are approved.", variant: "success" })
            return
        }
        try {
            await Promise.all(pending.map((t) => apiPost(`/timesheets/${t.entryId}/approve`)))
            setTimesheetLogs((prev) => prev.map((t) => (pending.find((p) => p.id === t.id) ? { ...t, approved: true } : t)))
            toast({ title: "Batch approved", description: `${pending.length} timesheets approved.`, variant: "success" })
        } catch (err: any) {
            toast({ title: "Batch approve failed", description: err?.message ?? "Unable to approve all timesheets.", variant: "error" })
        }
    }

    const toggleWorkerExpanded = (workerId: string) => {
        setExpandedWorkers((prev) => ({
            ...prev,
            [workerId]: !prev[workerId]
        }))
    }

    return (
        <PageContainer>
            {!canView ? (
                <GlassCard>
                    <GlassCardHeader>
                        <GlassCardTitle>HR & Payroll</GlassCardTitle>
                    </GlassCardHeader>
                    <GlassCardContent>You do not have access to view HR & Payroll.</GlassCardContent>
                </GlassCard>
            ) : (
            <>
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-foreground">HR & Payroll</h1>
                    <p className="text-muted-foreground mt-1 text-sm">Review timesheets, track team hours, and export data for payroll.</p>
                </div>

                <div className="flex items-center gap-2">
                    <Button variant="outline" className="gap-2 bg-white/40 border-glass-border" onClick={async () => {
                        try {
                            const blob = await downloadFile(`/timesheets/export.csv`)
                            const url = window.URL.createObjectURL(blob)
                            const a = document.createElement("a")
                            a.href = url
                            a.download = "timesheets.csv"
                            a.click()
                            window.URL.revokeObjectURL(url)
                        } catch (err: any) {
                            toast({ title: "Export failed", description: err?.message ?? "Unable to export timesheets.", variant: "error" })
                        }
                    }}>
                        <Download className="h-4 w-4" /> Export CSV
                    </Button>
                    <Button className="gap-2 bg-primary hover:bg-primary-dark" onClick={handleBatchApprove} disabled={!canManage}>
                        <CheckCircle2 className="h-4 w-4" /> Batch Approve
                    </Button>
                    <Button className="gap-2" onClick={() => setIsCreateOpen(true)} disabled={!canManage}>
                        <Plus className="h-4 w-4" /> New Entry
                    </Button>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-6">
                <GlassCard className="col-span-1 md:col-span-2 p-6 flex items-center justify-between">
                    <div>
                        <p className="text-sm font-medium text-muted-foreground">Total Time</p>
                        <p className="text-3xl font-bold mt-1">{formatDuration(totalMinutes)}</p>
                    </div>
                    <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center text-primary-dark shadow-sm">
                        <CalendarIcon className="h-6 w-6" />
                    </div>
                </GlassCard>
                <GlassCard className="col-span-1 md:col-span-2 p-6 flex items-center justify-between bg-gradient-to-br from-white/40 to-primary/5">
                    <div>
                        <p className="text-sm font-medium text-muted-foreground">Estimated Payroll/Cost</p>
                        <p className="text-3xl font-bold mt-1 text-primary">£{totalCost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                    </div>
                    <div className="h-12 w-12 rounded-full bg-white/60 flex items-center justify-center text-primary shadow-sm border border-glass-border">
                        <span className="text-xl font-bold">£</span>
                    </div>
                </GlassCard>
            </div>

            <GlassCard>
                <GlassCardHeader className="pb-3 border-b border-glass-border/50">
                    <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                        <GlassCardTitle className="text-lg">Timesheets Log</GlassCardTitle>

                        <div className="flex items-center gap-2 w-full md:w-auto">
                            <div className="flex items-center gap-1 bg-white/30 p-1 rounded-lg border border-glass-border text-sm">
                                <button
                                    onClick={() => setRoleFilter("All")}
                                    className={`px-3 py-1.5 rounded-md transition-colors ${roleFilter === "All" ? "bg-white shadow-sm font-medium" : "text-muted-foreground hover:bg-white/50"}`}
                                >All</button>
                                <button
                                    onClick={() => setRoleFilter("Staff")}
                                    className={`px-3 py-1.5 rounded-md transition-colors ${roleFilter === "Staff" ? "bg-white shadow-sm font-medium" : "text-muted-foreground hover:bg-white/50"}`}
                                >Staff</button>
                                <button
                                    onClick={() => setRoleFilter("Sub-contractor")}
                                    className={`px-3 py-1.5 rounded-md transition-colors ${roleFilter === "Sub-contractor" ? "bg-white shadow-sm font-medium" : "text-muted-foreground hover:bg-white/50"}`}
                                >Subs</button>
                            </div>

                            <div className="relative flex-1 md:w-64">
                                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                                <Input
                                    placeholder="Search worker..."
                                    className="pl-9 bg-white/40 h-9"
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                />
                            </div>

                            <div className="relative">
                                <Select value={statusFilter} onValueChange={setStatusFilter}>
                                    <SelectTrigger className="w-[140px] h-9 bg-white/40 border-glass-border">
                                        <SelectValue placeholder="Status" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="All">All</SelectItem>
                                        <SelectItem value="Submitted">Submitted</SelectItem>
                                        <SelectItem value="Approved">Approved</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>

                            <Button variant="outline" size="icon" className="h-9 w-9 bg-white/40 border-glass-border shrink-0">
                                <Filter className="h-4 w-4 text-muted-foreground" />
                            </Button>
                        </div>
                    </div>
                </GlassCardHeader>
                <GlassCardContent className="p-0">
                    <Table>
                        <TableHeader className="bg-black/5">
                            <TableRow className="hover:bg-transparent border-glass-border">
                                <TableHead>Worker</TableHead>
                                <TableHead>Role</TableHead>
                                <TableHead className="text-right">Total Hours</TableHead>
                                <TableHead className="text-right">Est. Cost</TableHead>
                                <TableHead className="text-right">Entries</TableHead>
                                <TableHead className="w-[60px]"></TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {groupedTimesheets.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={6} className="h-32 text-center text-muted-foreground">
                                        No timesheets match your filters.
                                    </TableCell>
                                </TableRow>
                            ) : (
                                groupedTimesheets.map((group) => {
                                    const isExpanded = Boolean(expandedWorkers[group.workerId])
                                    return (
                                        <Fragment key={group.workerId}>
                                            <TableRow
                                                className="border-glass-border hover:bg-black/5 transition-colors cursor-pointer"
                                                onClick={() => toggleWorkerExpanded(group.workerId)}
                                            >
                                                <TableCell>
                                                    <div className="flex flex-col">
                                                        <span className="font-semibold text-sm">{group.workerName}</span>
                                                        <span className="text-xs text-muted-foreground">{group.workerEmail}</span>
                                                    </div>
                                                </TableCell>
                                                <TableCell className="whitespace-nowrap">
                                                    <Badge variant="outline">{group.roleLabel}</Badge>
                                                </TableCell>
                                                <TableCell className="text-right font-bold whitespace-nowrap tabular-nums">
                                                    {formatDuration(group.totalMinutes)}
                                                </TableCell>
                                                <TableCell className="text-right font-medium text-sm whitespace-nowrap tabular-nums">
                                                    £{group.totalCost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                </TableCell>
                                                <TableCell className="text-right text-sm text-muted-foreground whitespace-nowrap">{group.entries.length}</TableCell>
                                                <TableCell className="text-right">
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        onClick={(event) => {
                                                            event.stopPropagation()
                                                            toggleWorkerExpanded(group.workerId)
                                                        }}
                                                    >
                                                        {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                                                    </Button>
                                                </TableCell>
                                            </TableRow>
                                            {isExpanded && (
                                                <TableRow className="border-glass-border/60 bg-white/30">
                                                    <TableCell colSpan={6} className="p-3">
                                                        <Table className="w-full table-fixed">
                                                            <TableHeader>
                                                                <TableRow className="hover:bg-transparent border-glass-border/60">
                                                                    <TableHead className="w-[18%]">Job</TableHead>
                                                                    <TableHead className="w-[10%]">Date</TableHead>
                                                                    <TableHead className="w-[16%]">Time</TableHead>
                                                                    <TableHead className="w-[9%] text-right">Hours</TableHead>
                                                                    <TableHead className="w-[12%] text-right">Hourly Rate</TableHead>
                                                                    <TableHead className="w-[10%] text-right">Est. Cost</TableHead>
                                                                    <TableHead className="w-[11%]">Status</TableHead>
                                                                    <TableHead className="w-[12%]">Notes</TableHead>
                                                                    <TableHead className="w-[2%]"></TableHead>
                                                                </TableRow>
                                                            </TableHeader>
                                                            <TableBody>
                                                                {group.entries.map((entry: any) => (
                                                                    <TableRow key={entry.id} className="border-glass-border/40">
                                                                        <TableCell className="font-medium truncate">
                                                                            {entry.jobTitle ? entry.jobTitle : "Manual Entry"}
                                                                        </TableCell>
                                                                        <TableCell className="whitespace-nowrap truncate">
                                                                            {entry.date
                                                                                ? new Date(entry.date).toLocaleDateString("en-GB", {
                                                                                      weekday: "short",
                                                                                      month: "short",
                                                                                      day: "numeric"
                                                                                  })
                                                                                : "—"}
                                                                        </TableCell>
                                                                        <TableCell className="whitespace-nowrap text-muted-foreground truncate">
                                                                            {entry.startTime && entry.endTime
                                                                                ? `${new Date(entry.startTime).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })} - ${new Date(entry.endTime).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}`
                                                                                : "—"}
                                                                        </TableCell>
                                                                        <TableCell className="text-right font-semibold whitespace-nowrap tabular-nums">
                                                                            {formatDuration(getEntryMinutes(entry))}
                                                                        </TableCell>
                                                                        <TableCell className="text-right whitespace-nowrap tabular-nums">
                                                                            £{Number(entry.hourlyRate ?? 0).toLocaleString(undefined, {
                                                                                minimumFractionDigits: 2,
                                                                                maximumFractionDigits: 2
                                                                            })}
                                                                        </TableCell>
                                                                        <TableCell className="text-right whitespace-nowrap tabular-nums">
                                                                            £
                                                                            {((getEntryMinutes(entry) / 60) * Number(entry.hourlyRate ?? 0)).toLocaleString(
                                                                                undefined,
                                                                                { minimumFractionDigits: 2, maximumFractionDigits: 2 }
                                                                            )}
                                                                        </TableCell>
                                                                        <TableCell className="whitespace-nowrap">
                                                                            <Badge
                                                                                variant={getStatusBadge(entry.approved ? "Approved" : "Submitted") as any}
                                                                                className="shadow-sm"
                                                                            >
                                                                                {entry.approved ? "Approved" : "Submitted"}
                                                                            </Badge>
                                                                        </TableCell>
                                                                        <TableCell className="truncate">
                                                                            <span className="block truncate text-sm text-muted-foreground">
                                                                                {entry.notes || "—"}
                                                                            </span>
                                                                        </TableCell>
                                                                        <TableCell>
                                                                            {entry.entryKind === "MANUAL" ? (
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
                                                                                        {canManage && !entry.approved && (
                                                                                            <DropdownMenuItem
                                                                                                className="text-success focus:text-success gap-2"
                                                                                                onClick={async () => {
                                                                                                    try {
                                                                                                        await apiPost(`/timesheets/${entry.entryId}/approve`)
                                                                                                        setTimesheetLogs((prev) =>
                                                                                                            prev.map((t) =>
                                                                                                                t.id === entry.id ? { ...t, approved: true } : t
                                                                                                            )
                                                                                                        )
                                                                                                        toast({
                                                                                                            title: "Timesheet approved",
                                                                                                            description: "Entry approved.",
                                                                                                            variant: "success"
                                                                                                        })
                                                                                                    } catch (err: any) {
                                                                                                        toast({
                                                                                                            title: "Approve failed",
                                                                                                            description: err?.message ?? "Unable to approve.",
                                                                                                            variant: "error"
                                                                                                        })
                                                                                                    }
                                                                                                }}
                                                                                            >
                                                                                                <CheckCircle2 className="h-4 w-4" /> Approve
                                                                                            </DropdownMenuItem>
                                                                                        )}
                                                                                        {canManage && (
                                                                                            <DropdownMenuItem
                                                                                                onClick={() => {
                                                                                                    setEditTarget(entry)
                                                                                                    setForm({
                                                                                                        workerId: entry.workerId,
                                                                                                        date: entry.date ? new Date(entry.date) : null,
                                                                                                        hours: Number(entry.hours ?? 0),
                                                                                                        hourlyRate: Number(entry.hourlyRate ?? 0)
                                                                                                    })
                                                                                                    setIsCreateOpen(true)
                                                                                                }}
                                                                                            >
                                                                                                Edit Entry
                                                                                            </DropdownMenuItem>
                                                                                        )}
                                                                                        {canManage && (
                                                                                            <DropdownMenuItem
                                                                                                className="text-destructive focus:text-destructive"
                                                                                                onClick={() => setDeleteTarget(entry)}
                                                                                            >
                                                                                                Delete Entry
                                                                                            </DropdownMenuItem>
                                                                                        )}
                                                                                    </DropdownMenuContent>
                                                                                </DropdownMenu>
                                                                            ) : null}
                                                                        </TableCell>
                                                                    </TableRow>
                                                                ))}
                                                            </TableBody>
                                                        </Table>
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

            <GlassModal
                open={isCreateOpen}
                onOpenChange={(open) => {
                    setIsCreateOpen(open)
                    if (!open) resetForm()
                }}
                title={editTarget ? "Edit Timesheet" : "New Timesheet"}
                description="Log a new timesheet entry."
                footer={
                    <div className="flex justify-end gap-2">
                        <Button variant="ghost" onClick={() => setIsCreateOpen(false)}>Cancel</Button>
                        <Button onClick={handleSave} disabled={saving || !canManage}>{saving ? "Saving..." : "Save Entry"}</Button>
                    </div>
                }
            >
                <div className="space-y-4">
                    <div className="space-y-2">
                        <Label required>Worker</Label>
                        <Select
                            value={form.workerId}
                            createOption={{ label: "employee", href: "/admin/team?create=employee" }}
                            onValueChange={(value) => {
                                const selectedWorker = users.find((u) => u.id === value)
                                const defaultRate =
                                    selectedWorker && selectedWorker.hourlyRate !== null && typeof selectedWorker.hourlyRate !== "undefined"
                                        ? Number(selectedWorker.hourlyRate)
                                        : 0
                                setForm((prev) => ({
                                    ...prev,
                                    workerId: value,
                                    hourlyRate: Number.isFinite(defaultRate) ? defaultRate : prev.hourlyRate
                                }))
                            }}
                        >
                            <SelectTrigger className={`w-full bg-white/50 ${formErrors.workerId ? "border-destructive" : ""}`}>
                                <SelectValue placeholder="Select worker" />
                            </SelectTrigger>
                            <SelectContent>
                                {users.map((u) => (
                                    <SelectItem key={u.id} value={u.id}>{u.fullName}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        {formErrors.workerId && <p className="text-xs text-destructive">{formErrors.workerId}</p>}
                    </div>
                    <div className="space-y-2">
                        <Label required>Date</Label>
                        <DatePicker
                            selected={form.date}
                            onChange={(date: Date | null) => setForm((prev) => ({ ...prev, date: date as Date }))}
                            className={`w-full rounded-md border border-glass-border bg-white/50 px-3 py-2 text-sm ${formErrors.date ? "border-destructive" : ""}`}
                            dateFormat="dd/MM/yyyy"
                        />
                        {formErrors.date && <p className="text-xs text-destructive">{formErrors.date}</p>}
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label required>Hours</Label>
                            <Input type="number" min={0} step={0.5} value={form.hours} onChange={(e) => setForm((prev) => ({ ...prev, hours: Number(e.target.value) }))} className={formErrors.hours ? "border-destructive" : ""} />
                            {formErrors.hours && <p className="text-xs text-destructive">{formErrors.hours}</p>}
                        </div>
                        <div className="space-y-2">
                            <Label optional>Hourly Rate</Label>
                            <Input type="number" min={0} step={0.5} value={form.hourlyRate} onChange={(e) => setForm((prev) => ({ ...prev, hourlyRate: Number(e.target.value) }))} />
                        </div>
                    </div>
                </div>
            </GlassModal>

            <GlassModal
                open={Boolean(deleteTarget)}
                onOpenChange={(open) => !open && setDeleteTarget(null)}
                title="Delete Timesheet"
                description="Are you sure you want to delete this timesheet entry?"
                footer={
                    <div className="flex justify-end gap-2">
                        <Button variant="ghost" onClick={() => setDeleteTarget(null)}>Cancel</Button>
                        <Button
                            variant="destructive"
                            onClick={async () => {
                                if (!deleteTarget) return
                                try {
                                    await apiDelete(`/timesheets/${deleteTarget.entryId}`, { confirmed: true })
                                    setTimesheetLogs((prev) => prev.filter((t) => t.entryId !== deleteTarget.entryId))
                                    toast({ title: "Timesheet deleted", description: "Entry removed.", variant: "success" })
                                } catch (err: any) {
                                    toast({ title: "Delete failed", description: err?.message ?? "Unable to delete timesheet.", variant: "error" })
                                } finally {
                                    setDeleteTarget(null)
                                }
                            }}
                        >
                            Delete
                        </Button>
                    </div>
                }
            >
                <div className="text-sm text-muted-foreground">
                    This will permanently remove the selected timesheet entry.
                </div>
            </GlassModal>

            <ErrorToast error={error} onClear={() => setError(null)} />
            </>
            )}
        </PageContainer>
    )
}

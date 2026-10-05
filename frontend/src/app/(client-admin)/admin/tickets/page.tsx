"use client"

import { useEffect, useMemo, useState } from "react"
import { PageContainer } from "@/components/layout/PageContainer"
import { GlassCard, GlassCardContent, GlassCardHeader, GlassCardTitle } from "@/components/glass/GlassCard"
import { GlassModal } from "@/components/glass/GlassModal"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Search, Plus, MoreHorizontal } from "lucide-react"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { useRouter } from "next/navigation"
import { apiDelete, apiGet, apiPost, apiPut } from "@/lib/api"
import { ErrorToast } from "@/components/shared/ErrorToast"
import { DataPagination, useClientPagination } from "@/components/shared/DataPagination"
import { RecordNumberBadge } from "@/components/shared/RecordNumberBadge"
import { useToast } from "@/components/ui/toast"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { getModulePermissions } from "@/lib/permission-ui"

type Ticket = {
    id: string
    ticketNumber: string
    subject: string
    clientName: string
    clientEmail?: string
    customerId?: string
    priority: string
    status: string
    lastUpdated: string
}

export default function TicketsPage() {
    const router = useRouter()
    const { toast } = useToast()
    const { canView, canManage } = getModulePermissions("support.view", "support.manage")
    const [searchQuery, setSearchQuery] = useState("")
    const [tickets, setTickets] = useState<Ticket[]>([])
    const [customers, setCustomers] = useState<any[]>([])
    const [error, setError] = useState<string | null>(null)
    const [isCreateOpen, setIsCreateOpen] = useState(false)
    const [deleteTarget, setDeleteTarget] = useState<Ticket | null>(null)
    const [creating, setCreating] = useState(false)
    const [formErrors, setFormErrors] = useState<{ subject?: string; customerId?: string; message?: string }>({})
    const [form, setForm] = useState({ subject: "", customerId: "", message: "", priority: "Medium" })

    useEffect(() => {
        loadTickets()
    }, [])

    const loadTickets = async () => {
        try {
            const [ticketsRes, customersRes] = await Promise.all([
                apiGet<any[]>("/tickets"),
                apiGet<any[]>("/customers")
            ])
            const customerList = Array.isArray(customersRes.data) ? customersRes.data : []
            setCustomers(customerList)
            const customerMap = new Map(customerList.map((c) => [c.id, c]))
            const mapped = ticketsRes.data.map((ticket) => {
                const customer = customerMap.get(ticket.customerId)
                const statusRaw = (ticket.status ?? "OPEN").toString()
                const status = statusRaw
                    .toLowerCase()
                    .replace(/_/g, " ")
                    .replace(/\b\w/g, (c: string) => c.toUpperCase())
                return {
                    id: ticket.id,
                    ticketNumber: ticket.ticketNumber ?? `TKT-${ticket.id.slice(0, 6).toUpperCase()}`,
                    subject: ticket.subject,
                    clientName: customer?.name ?? "Customer",
                    clientEmail: customer?.email ?? "",
                    customerId: ticket.customerId,
                    priority: "Medium",
                    status,
                    lastUpdated: ticket.updatedAt ?? ticket.createdAt ?? new Date().toISOString()
                } as Ticket
            })
            setTickets(mapped)
        } catch (err: any) {
            setError(err?.message ?? "Failed to load tickets")
        }
    }

    const customerOptions = useMemo(() => customers.map((c) => ({ value: c.id, label: c.name })), [customers])

    const filteredTickets = tickets.filter(t =>
        t.clientName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        t.subject.toLowerCase().includes(searchQuery.toLowerCase()) ||
        t.ticketNumber.toLowerCase().includes(searchQuery.toLowerCase())
    )
    const ticketsPagination = useClientPagination(filteredTickets)

    const getPriorityBadge = (priority: string) => {
        switch (priority) {
            case "Urgent": return "destructive"
            case "High": return "warning"
            case "Medium": return "default"
            case "Low": return "secondary"
            default: return "outline"
        }
    }

    const getStatusBadge = (status: string) => {
        switch (status) {
            case "Open": return "warning"
            case "In Progress": return "default"
            case "Resolved":
            case "Closed": return "success"
            default: return "outline"
        }
    }

    const resetForm = () => {
        setForm({ subject: "", customerId: "", message: "", priority: "Medium" })
        setFormErrors({})
    }

    const validateForm = () => {
        const nextErrors: { subject?: string; customerId?: string; message?: string } = {}
        if (!form.subject.trim()) nextErrors.subject = "Subject is required."
        if (!form.customerId) nextErrors.customerId = "Select a client."
        if (!form.message.trim()) nextErrors.message = "Message is required."
        setFormErrors(nextErrors)
        return Object.keys(nextErrors).length === 0
    }

    const handleCreateTicket = async () => {
        if (!canManage) {
            toast({ title: "Insufficient permissions", description: "You can view tickets but cannot create them.", variant: "error" })
            return
        }
        if (!validateForm()) return
        setCreating(true)
        try {
            await apiPost("/tickets", {
                subject: form.subject,
                customerId: form.customerId,
                message: form.message
            })
            toast({ title: "Ticket created", description: "Support ticket has been logged.", variant: "success" })
            setIsCreateOpen(false)
            resetForm()
            await loadTickets()
        } catch (err: any) {
            toast({ title: "Failed to create ticket", description: err?.message ?? "Please try again.", variant: "error" })
        } finally {
            setCreating(false)
        }
    }

    const updateStatus = async (ticketId: string, status: string) => {
        try {
            await apiPut(`/tickets/${ticketId}`, { status })
            const nextStatus = status
                .toLowerCase()
                .replace(/_/g, " ")
                .replace(/\b\w/g, (c) => c.toUpperCase())
            setTickets((prev) => prev.map((t) => (t.id === ticketId ? { ...t, status: nextStatus } : t)))
            toast({ title: "Ticket updated", description: "Status updated successfully.", variant: "success" })
        } catch (err: any) {
            toast({ title: "Update failed", description: err?.message ?? "Unable to update ticket.", variant: "error" })
        }
    }

    return (
        <PageContainer>
            {!canView ? (
                <GlassCard>
                    <GlassCardHeader>
                        <GlassCardTitle>Support Helpdesk</GlassCardTitle>
                    </GlassCardHeader>
                    <GlassCardContent>You do not have access to view tickets.</GlassCardContent>
                </GlassCard>
            ) : (
            <>
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-foreground flex items-center gap-2">
                        Support Helpdesk
                        <Badge variant="secondary" className="ml-2 bg-primary/10 text-primary hover:bg-primary/20">{tickets.filter(t => t.status === "Open").length} Open</Badge>
                    </h1>
                    <p className="text-muted-foreground mt-1 text-sm">Manage client queries, issues, and communication threads.</p>
                </div>

                <div className="flex items-center gap-2">
                    <Button
                        className="gap-2"
                        onClick={() => {
                            if (!canManage) {
                                toast({ title: "Insufficient permissions", description: "You can view tickets but cannot create them.", variant: "error" })
                                return
                            }
                            setIsCreateOpen(true)
                        }}
                        disabled={!canManage}
                    >
                        <Plus className="h-4 w-4" /> New Ticket
                    </Button>
                </div>
            </div>

            <GlassCard>
                <GlassCardHeader className="pb-3 border-b border-glass-border/50">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                        <GlassCardTitle className="text-lg">Recent Tickets</GlassCardTitle>
                        <div className="relative w-64">
                            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                            <Input
                                placeholder="Search subject, client..."
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
                                <TableHead>Ticket</TableHead>
                                <TableHead>Client</TableHead>
                                <TableHead>Priority</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead>Last Updated</TableHead>
                                <TableHead className="w-[50px]"></TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {filteredTickets.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={6} className="h-32 text-center text-muted-foreground">
                                        <div className="flex flex-col items-center gap-3">
                                            <span>{tickets.length === 0 ? "No tickets yet." : "No tickets match your search."}</span>
                                            {tickets.length === 0 && canManage ? (
                                                <Button size="sm" className="gap-2" onClick={() => setIsCreateOpen(true)}>
                                                    <Plus className="h-4 w-4" /> New Ticket
                                                </Button>
                                            ) : null}
                                        </div>
                                    </TableCell>
                                </TableRow>
                            ) : (
                                ticketsPagination.paginatedItems.map((ticket) => (
                                    <TableRow
                                        key={ticket.id}
                                        className="border-glass-border hover:bg-black/5 transition-colors cursor-pointer"
                                        onClick={() => router.push(`/admin/tickets/${ticket.id}`)}
                                    >
                                        <TableCell>
                                            <div className="flex flex-col">
                                                <span className="font-semibold text-sm line-clamp-1">{ticket.subject}</span>
                                                <RecordNumberBadge value={ticket.ticketNumber} />
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            <div className="flex items-center gap-2">
                                                <div className="h-6 w-6 rounded bg-primary/10 text-primary-dark flex items-center justify-center font-bold text-xs">
                                                    {ticket.clientName.charAt(0)}
                                                </div>
                                                <span className="text-sm font-medium">{ticket.clientName}</span>
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            <Badge variant={getPriorityBadge(ticket.priority) as any} className="shadow-sm">
                                                {ticket.priority}
                                            </Badge>
                                        </TableCell>
                                        <TableCell>
                                            <Badge variant={getStatusBadge(ticket.status) as any} className="shadow-sm">
                                                {ticket.status}
                                            </Badge>
                                        </TableCell>
                                        <TableCell className="text-sm text-muted-foreground font-medium">
                                            {new Date(ticket.lastUpdated).toLocaleDateString("en-GB", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
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
                                                    <DropdownMenuItem onClick={() => router.push(`/admin/tickets/${ticket.id}`)}>
                                                        View Thread
                                                    </DropdownMenuItem>
                                                    {ticket.status !== "Resolved" && (
                                                        <DropdownMenuItem className="text-success focus:text-success" onClick={() => updateStatus(ticket.id, "RESOLVED")}>Mark Resolved</DropdownMenuItem>
                                                    )}
                                                    <DropdownMenuItem
                                                        className="text-destructive focus:text-destructive"
                                                        onClick={() => {
                                                            if (!canManage) {
                                                                toast({ title: "Insufficient permissions", description: "You can view tickets but cannot delete them.", variant: "error" })
                                                                return
                                                            }
                                                            setDeleteTarget(ticket)
                                                        }}
                                                        disabled={!canManage}
                                                    >
                                                        Delete Ticket
                                                    </DropdownMenuItem>
                                                </DropdownMenuContent>
                                            </DropdownMenu>
                                        </TableCell>
                                    </TableRow>
                                ))
                            )}
                        </TableBody>
                    </Table>
                    <DataPagination {...ticketsPagination} onPageChange={ticketsPagination.setPage} />
                </GlassCardContent>
            </GlassCard>

            <GlassModal
                open={isCreateOpen}
                onOpenChange={(open) => {
                    setIsCreateOpen(open)
                    if (!open) resetForm()
                }}
                title="New Support Ticket"
                description="Log a new support issue for a client."
                footer={
                    <div className="flex justify-end gap-2">
                        <Button variant="ghost" onClick={() => setIsCreateOpen(false)}>Cancel</Button>
                        <Button onClick={handleCreateTicket} disabled={creating}>{creating ? "Creating..." : "Create Ticket"}</Button>
                    </div>
                }
            >
                <div className="space-y-4">
                    <div className="space-y-2">
                        <Label required>Subject</Label>
                        <Input value={form.subject} onChange={(e) => setForm((prev) => ({ ...prev, subject: e.target.value }))} className={formErrors.subject ? "border-destructive" : ""} />
                        {formErrors.subject && <p className="text-xs text-destructive">{formErrors.subject}</p>}
                    </div>
                    <div className="space-y-2">
                        <Label required>Client</Label>
                        <Select
                            value={form.customerId}
                            createOption={{ label: "customer", href: "/admin/customers?create=customer" }}
                            onValueChange={(value) => setForm((prev) => ({ ...prev, customerId: value }))}
                        >
                            <SelectTrigger className={`w-full bg-white/50 ${formErrors.customerId ? "border-destructive" : ""}`}>
                                <SelectValue placeholder="Select client" />
                            </SelectTrigger>
                            <SelectContent>
                                {customerOptions.map((c) => (
                                    <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        {formErrors.customerId && <p className="text-xs text-destructive">{formErrors.customerId}</p>}
                    </div>
                    <div className="space-y-2">
                        <Label required>Message</Label>
                        <Textarea value={form.message} onChange={(e) => setForm((prev) => ({ ...prev, message: e.target.value }))} className={formErrors.message ? "border-destructive" : ""} placeholder="Describe the issue" />
                        {formErrors.message && <p className="text-xs text-destructive">{formErrors.message}</p>}
                    </div>
                </div>
            </GlassModal>

            <GlassModal
                open={Boolean(deleteTarget)}
                onOpenChange={(open) => !open && setDeleteTarget(null)}
                title="Delete Ticket"
                description="Are you sure you want to delete this support ticket?"
                footer={
                    <div className="flex justify-end gap-2">
                        <Button variant="ghost" onClick={() => setDeleteTarget(null)}>Cancel</Button>
                        <Button
                            variant="destructive"
                            onClick={async () => {
                                if (!canManage) {
                                    toast({ title: "Insufficient permissions", description: "You can view tickets but cannot delete them.", variant: "error" })
                                    return
                                }
                                if (!deleteTarget) return
                                try {
                                    await apiDelete(`/tickets/${deleteTarget.id}`, { confirmed: true })
                                    setTickets((prev) => prev.filter((t) => t.id !== deleteTarget.id))
                                    toast({ title: "Ticket deleted", description: "The ticket was removed.", variant: "success" })
                                } catch (err: any) {
                                    toast({ title: "Delete failed", description: err?.message ?? "Unable to delete ticket.", variant: "error" })
                                } finally {
                                    setDeleteTarget(null)
                                }
                            }}
                        disabled={!canManage}>
                            Delete
                        </Button>
                    </div>
                }
            >
                <div className="text-sm text-muted-foreground">
                    This will permanently remove ticket <span className="font-semibold">{deleteTarget?.ticketNumber}</span>.
                </div>
            </GlassModal>

            <ErrorToast error={error} onClear={() => setError(null)} />
            </>
            )}
        </PageContainer>
    )
}

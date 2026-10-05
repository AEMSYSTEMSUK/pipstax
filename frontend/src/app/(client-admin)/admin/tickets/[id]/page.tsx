"use client"

import { use, useState, useRef, useEffect } from "react"
import { PageContainer } from "@/components/layout/PageContainer"
import { GlassCard, GlassCardContent, GlassCardHeader, GlassCardTitle } from "@/components/glass/GlassCard"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Textarea } from "@/components/ui/textarea"
import { ArrowLeft, Send, AlertCircle, Clock, CheckCircle2, User } from "lucide-react"
import { apiGet, apiPost, apiPut } from "@/lib/api"
import { ErrorToast } from "@/components/shared/ErrorToast"
import { useToast } from "@/components/ui/toast"
import { getModulePermissions } from "@/lib/permission-ui"
import { BrowserBackButton } from "@/components/shared/BrowserBackButton"
import { RecordNumberBadge } from "@/components/shared/RecordNumberBadge"

type Ticket = {
    id: string
    ticketNumber: string
    subject: string
    customerId?: string
    clientName: string
    clientEmail?: string
    status: string
    createdAt: string
    lastUpdated: string
    messages: Array<{ id?: string; senderName?: string; senderRole?: string; content?: string; timestamp?: string }>
}

export default function TicketDetailPage({ params }: { params: Promise<{ id: string }> }) {
    const resolvedParams = use(params)
    const { toast } = useToast()
    const { canView, canManage } = getModulePermissions("support.view", "support.manage")
    const [ticket, setTicket] = useState<Ticket | null>(null)
    const [error, setError] = useState<string | null>(null)
    const [reply, setReply] = useState("")
    const messagesEndRef = useRef<HTMLDivElement>(null)

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
    }

    useEffect(() => {
        const load = async () => {
            try {
                const [ticketRes, customersRes] = await Promise.all([
                    apiGet<any>(`/tickets/${resolvedParams.id}`),
                    apiGet<any[]>("/customers")
                ])
                const data = ticketRes.data.ticket
                const messages = (ticketRes.data.messages ?? []).map((msg: any) => ({
                    id: msg.id,
                    senderName: msg.senderType === "ADMIN" ? "Admin" : "Customer",
                    senderRole: msg.senderType === "ADMIN" ? "agent" : "client",
                    content: msg.message,
                    timestamp: msg.createdAt
                }))
                const customerList = Array.isArray(customersRes.data) ? customersRes.data : []
                const customer = customerList.find((c) => c.id === data.customerId)
                const statusRaw = (data.status ?? "OPEN").toString()
                const status = statusRaw
                    .toLowerCase()
                    .replace(/_/g, " ")
                    .replace(/\b\w/g, (c: string) => c.toUpperCase())

                setTicket({
                    id: data.id,
                    ticketNumber: data.ticketNumber ?? `TKT-${data.id.slice(0, 6).toUpperCase()}`,
                    subject: data.subject,
                    customerId: data.customerId,
                    clientName: customer?.name ?? "Customer",
                    clientEmail: customer?.email ?? "",
                    status,
                    createdAt: data.createdAt ?? new Date().toISOString(),
                    lastUpdated: data.updatedAt ?? new Date().toISOString(),
                    messages
                })
            } catch (err: any) {
                setError(err?.message ?? "Failed to load ticket")
            }
        }
        load()
    }, [resolvedParams.id])

    useEffect(() => {
        if (ticket?.messages) scrollToBottom()
    }, [ticket?.messages])

    const getStatusBadge = (status: string) => {
        switch (status) {
            case "Open": return "warning"
            case "In Progress": return "default"
            case "Resolved":
            case "Closed": return "success"
            default: return "outline"
        }
    }

    if (!canView) {
        return (
            <PageContainer>
                <GlassCard>
                    <GlassCardHeader>
                        <GlassCardTitle>Support Ticket</GlassCardTitle>
                    </GlassCardHeader>
                    <GlassCardContent>You do not have access to view this ticket.</GlassCardContent>
                </GlassCard>
            </PageContainer>
        )
    }

    if (!ticket) {
        return (
            <PageContainer>
                <div className="text-center p-12">Ticket not found</div>
                <ErrorToast error={error} onClear={() => setError(null)} />
            </PageContainer>
        )
    }

    const handleSend = async () => {
        if (!canManage) {
            toast({ title: "Insufficient permissions", description: "You can view tickets but cannot reply.", variant: "error" })
            return
        }
        if (!reply.trim()) return
        try {
            await apiPost(`/tickets/${ticket.id}/reply`, { message: reply })
            setTicket((prev) => prev ? {
                ...prev,
                messages: [
                    ...prev.messages,
                    {
                        id: `${Date.now()}`,
                        senderName: "Admin",
                        senderRole: "agent",
                        content: reply,
                        timestamp: new Date().toISOString()
                    }
                ],
                lastUpdated: new Date().toISOString()
            } : prev)
            setReply("")
            toast({ title: "Reply sent", description: "Message delivered to the client.", variant: "success" })
        } catch (err: any) {
            toast({ title: "Send failed", description: err?.message ?? "Unable to send reply.", variant: "error" })
        }
    }

    const handleResolve = async () => {
        if (!canManage) {
            toast({ title: "Insufficient permissions", description: "You can view tickets but cannot resolve them.", variant: "error" })
            return
        }
        try {
            await apiPut(`/tickets/${ticket.id}`, { status: "RESOLVED" })
            setTicket((prev) => prev ? { ...prev, status: "Resolved" } : prev)
            toast({ title: "Ticket resolved", description: "Status updated to resolved.", variant: "success" })
        } catch (err: any) {
            toast({ title: "Update failed", description: err?.message ?? "Unable to update status.", variant: "error" })
        }
    }

    return (
        <PageContainer>
            <div className="mb-6">
                <BrowserBackButton className="text-sm font-medium text-primary hover:text-primary-dark transition-colors inline-flex items-center gap-1 mb-4">
                    <ArrowLeft className="h-3 w-3" /> Back to Tickets
                </BrowserBackButton>

                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                    <div>
                        <h1 className="text-3xl font-bold tracking-tight text-foreground flex items-center gap-3">
                            {ticket.subject}
                        </h1>
                        <p className="text-muted-foreground mt-1 flex items-center gap-2 font-medium">
                            <RecordNumberBadge value={ticket.ticketNumber} />
                            <span>From {ticket.clientName}</span>
                            <Badge variant={getStatusBadge(ticket.status) as any}>{ticket.status}</Badge>
                        </p>
                    </div>

                    <div className="flex items-center gap-2">
                        {ticket.status !== "Resolved" && (
                            <Button variant="outline" className="gap-2 bg-white/40" onClick={handleResolve} disabled={!canManage}>
                                <CheckCircle2 className="h-4 w-4" /> Mark Resolved
                            </Button>
                        )}
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 h-[700px]">
                <div className="lg:col-span-3 flex flex-col h-full">
                    <GlassCard className="flex-1 flex flex-col overflow-hidden">
                        <div className="flex-1 overflow-y-auto p-6 space-y-6">
                            {ticket.messages.map((msg) => {
                                const isAgent = msg.senderRole === "agent"
                                return (
                                    <div key={msg.id} className={`flex ${isAgent ? "justify-end" : "justify-start"}`}>
                                        <div className={`flex gap-3 max-w-[80%] ${isAgent ? "flex-row-reverse" : "flex-row"}`}>
                                            <div className="flex-shrink-0 mt-1">
                                                <div className={`h-8 w-8 rounded-full flex items-center justify-center font-bold text-xs ${isAgent ? "bg-primary text-primary-foreground" : "bg-black/10 text-foreground"}`}>
                                                    {isAgent ? <User className="h-4 w-4" /> : (msg.senderName ?? "C").charAt(0)}
                                                </div>
                                            </div>
                                            <div className={`flex flex-col ${isAgent ? "items-end" : "items-start"}`}>
                                                <div className="flex items-center gap-2 mb-1">
                                                    <span className="text-xs font-semibold">{msg.senderName}</span>
                                                    <span className="text-[10px] text-muted-foreground">{msg.timestamp ? new Date(msg.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : ""}</span>
                                                </div>
                                                <div className={`p-3 rounded-2xl shadow-sm ${isAgent ? "bg-primary text-primary-foreground rounded-tr-none" : "bg-white/80 border border-glass-border text-foreground rounded-tl-none"} text-sm whitespace-pre-wrap leading-relaxed`}>
                                                    {msg.content}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                )
                            })}
                            <div ref={messagesEndRef} />
                        </div>

                        <div className="p-4 border-t border-glass-border bg-white/30 backdrop-blur-md">
                            {ticket.status === "Resolved" ? (
                                <div className="text-center p-3 text-sm text-muted-foreground bg-black/5 rounded-lg border border-glass-border">
                                    This ticket is resolved. Reopen to send a new message.
                                </div>
                            ) : (
                                <div className="relative">
                                    <Textarea
                                        placeholder="Type your reply here..."
                                        className="min-h-[100px] resize-none pr-12 pb-12 bg-white/70 shadow-inner"
                                        value={reply}
                                        onChange={(e) => setReply(e.target.value)}
                                    />
                                    <div className="absolute bottom-3 right-3 flex items-center gap-2">
                                        <Button size="sm" className="gap-2 shadow-sm" disabled={!reply.trim() || !canManage} onClick={handleSend}>
                                            Send <Send className="h-3.5 w-3.5" />
                                        </Button>
                                    </div>
                                </div>
                            )}
                        </div>
                    </GlassCard>
                </div>

                <div className="lg:col-span-1 space-y-6">
                    <GlassCard>
                        <GlassCardHeader>
                            <GlassCardTitle>Ticket Details</GlassCardTitle>
                        </GlassCardHeader>
                        <GlassCardContent className="space-y-4 text-sm">
                            <div>
                                <span className="text-xs font-semibold text-muted-foreground uppercase block mb-1">Status</span>
                                <Badge variant={getStatusBadge(ticket.status) as any}>{ticket.status}</Badge>
                            </div>
                            <div>
                                <span className="text-xs font-semibold text-muted-foreground uppercase block mb-1">Last Updated</span>
                                <span className="text-muted-foreground flex items-center gap-1"><Clock className="h-3 w-3" /> {new Date(ticket.lastUpdated).toLocaleString()}</span>
                            </div>
                            <div className="pt-4 border-t border-glass-border">
                                <span className="text-xs font-semibold text-muted-foreground uppercase block mb-1">Created</span>
                                <span className="text-muted-foreground flex items-center gap-1"><AlertCircle className="h-3 w-3" /> {new Date(ticket.createdAt).toLocaleString()}</span>
                            </div>
                        </GlassCardContent>
                    </GlassCard>

                    <GlassCard>
                        <GlassCardHeader>
                            <GlassCardTitle>Client Info</GlassCardTitle>
                        </GlassCardHeader>
                        <GlassCardContent className="space-y-4 text-sm">
                            <div>
                                <span className="text-xs font-semibold text-muted-foreground uppercase block mb-1">Name</span>
                                <span className="font-medium">{ticket.clientName}</span>
                            </div>
                            {ticket.clientEmail && (
                                <div>
                                    <span className="text-xs font-semibold text-muted-foreground uppercase block mb-1">Email</span>
                                    <span className="font-medium">{ticket.clientEmail}</span>
                                </div>
                            )}
                        </GlassCardContent>
                    </GlassCard>
                </div>
            </div>
            <ErrorToast error={error} onClear={() => setError(null)} />
        </PageContainer>
    )
}

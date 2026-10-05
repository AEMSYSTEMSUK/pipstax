"use client"

import { use, useEffect, useState } from "react"
import { PageContainer } from "@/components/layout/PageContainer"
import { GlassCard, GlassCardContent, GlassCardHeader, GlassCardTitle, GlassCardDescription, GlassCardFooter } from "@/components/glass/GlassCard"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Textarea } from "@/components/ui/textarea"
import { apiGet, apiPost } from "@/lib/api"
import { getPortalToken } from "@/lib/auth"
import { ArrowLeft, Send, Clock, User, ShieldCheck, CheckCircle2 } from "lucide-react"
import { StatusBadge } from "@/components/shared/StatusBadge"
import { ErrorToast } from "@/components/shared/ErrorToast"
import { BrowserBackButton } from "@/components/shared/BrowserBackButton"
import { RecordNumberBadge } from "@/components/shared/RecordNumberBadge"

export default function PortalTicketDetail({ params }: { params: Promise<{ id: string }> }) {
    const resolvedParams = use(params)
    const [ticketEntry, setTicketEntry] = useState<any | null>(null)
    const [error, setError] = useState<string | null>(null)
    const [reply, setReply] = useState("");

    const portalToken = getPortalToken()

    const formatStatusLabel = (status?: string | null) => {
        const raw = String(status ?? "OPEN")
        return raw
            .toLowerCase()
            .replace(/_/g, " ")
            .replace(/\b\w/g, (char) => char.toUpperCase())
    }

    const getNormalizedStatus = (status?: string | null) => String(status ?? "OPEN").toUpperCase()

    const getDisplayStatus = (status?: string | null) => {
        const normalized = getNormalizedStatus(status)
        return normalized === "IN_PROGRESS" ? "In Progress" : formatStatusLabel(status)
    }

    useEffect(() => {
        if (!portalToken) return
        const load = async () => {
            try {
                const res = await apiGet<any[]>(`/portal/${portalToken}/tickets`)
                const found = (res.data || []).find((entry: any) => entry.ticket?.id === resolvedParams.id)
                setTicketEntry(found || null)
                setError(null)
            } catch (err: any) {
                setError(err?.message ?? "Failed to load ticket")
            }
        }
        load()
    }, [portalToken, resolvedParams.id])

    const handleReply = async () => {
        if (!portalToken || !reply || !ticketEntry?.ticket?.id) return
        try {
            await apiPost(`/portal/${portalToken}/tickets/${ticketEntry.ticket.id}/reply`, { message: reply })
            setReply("")
            const res = await apiGet<any[]>(`/portal/${portalToken}/tickets`)
            const found = (res.data || []).find((entry: any) => entry.ticket?.id === resolvedParams.id)
            setTicketEntry(found || null)
        } catch (err: any) {
            setError(err?.message ?? "Failed to send reply")
        }
    }

    const handleResolve = async () => {
        if (!portalToken || !ticketEntry?.ticket?.id) return
        try {
            const res = await apiPost<any>(`/portal/${portalToken}/tickets/${ticketEntry.ticket.id}/resolve`, {})
            setTicketEntry((prev: any) => prev ? {
                ...prev,
                ticket: {
                    ...prev.ticket,
                    ...(res.data ?? {}),
                    status: "RESOLVED",
                    updatedAt: new Date().toISOString(),
                }
            } : prev)
            setError(null)
        } catch (err: any) {
            setError(err?.message ?? "Failed to mark ticket as resolved")
        }
    }

    if (!ticketEntry?.ticket) {
        return (
            <PageContainer>
                <div className="text-center p-12">Ticket not found</div>
                <ErrorToast error={error} onClear={() => setError(null)} />
            </PageContainer>
        )
    }

    const ticket = ticketEntry.ticket
    const ticketNumber = ticket.ticketNumber ?? `TKT-${String(ticket.id ?? "").slice(0, 6).toUpperCase()}`
    const normalizedStatus = getNormalizedStatus(ticket.status)
    const statusLabel = getDisplayStatus(ticket.status)
    const isResolved = normalizedStatus === "RESOLVED" || normalizedStatus === "CLOSED"
    const messages = (ticketEntry.messages || []).map((msg: any) => ({
        id: msg.id,
        senderRole: msg.senderType === "CUSTOMER" ? "Customer" : "Agent",
        senderName: msg.senderType === "CUSTOMER" ? "You" : "Support",
        content: msg.message,
        timestamp: new Date(msg.createdAt ?? Date.now()).toLocaleString()
    }))

    return (
        <PageContainer>
            <div className="mb-6">
                <BrowserBackButton className="text-sm font-medium text-primary hover:text-primary-dark transition-colors inline-flex items-center gap-1 mb-4">
                    <ArrowLeft className="h-3 w-3" /> Back to Tickets
                </BrowserBackButton>
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                    <div>
                        <div className="flex items-center gap-3 mb-1">
                            <h1 className="text-3xl font-bold tracking-tight text-foreground">{ticket.subject}</h1>
                            <StatusBadge status={statusLabel} className="shadow-sm">
                                {statusLabel}
                            </StatusBadge>
                        </div>
                        <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                            <RecordNumberBadge value={ticketNumber} />
                            <span>Created on {new Date(ticket.createdAt).toLocaleDateString()}</span>
                        </div>
                    </div>

                    {!isResolved && (
                        <Button variant="outline" className="bg-white/40 text-success hover:text-success hover:bg-success/5 border-success/20" onClick={handleResolve}>
                            Mark as Resolved
                        </Button>
                    )}
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 space-y-6">
                    <GlassCard>
                        <GlassCardHeader className="pb-3 border-b border-glass-border">
                            <GlassCardTitle className="text-lg">Conversation History</GlassCardTitle>
                        </GlassCardHeader>
                        <GlassCardContent className="pt-6">
                            <div className="space-y-8">
                                {messages.map((msg: any) => (
                                    <div key={msg.id} className={`flex flex-col ${msg.senderRole === 'Customer' ? 'items-end' : 'items-start'}`}>
                                        <div className={`flex items-center gap-2 mb-2 ${msg.senderRole === 'Customer' ? 'flex-row-reverse' : ''}`}>
                                            <div className={`h-8 w-8 rounded-full flex items-center justify-center text-xs font-bold shadow-sm ${msg.senderRole === 'Customer' ? 'bg-primary text-white' : 'bg-gray-200 text-gray-700'}`}>
                                                {msg.senderName.split(' ').map((n: string) => n[0]).join('')}
                                            </div>
                                            <div className={`flex flex-col ${msg.senderRole === 'Customer' ? 'items-end' : 'items-start'}`}>
                                                <span className="text-xs font-bold text-foreground">{msg.senderName}</span>
                                                <span className="text-[10px] text-muted-foreground flex items-center gap-1 font-medium italic">
                                                    {msg.senderRole !== 'Customer' && <ShieldCheck className="h-2.5 w-2.5 text-primary" />}
                                                    {msg.timestamp}
                                                </span>
                                            </div>
                                        </div>
                                        <div className={`max-w-[85%] px-5 py-3.5 rounded-2xl text-sm leading-relaxed shadow-sm border ${msg.senderRole === 'Customer'
                                            ? 'bg-primary/5 border-primary/20 text-foreground rounded-tr-none'
                                            : 'bg-white border-glass-border text-foreground rounded-tl-none'
                                            }`}>
                                            {msg.content}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </GlassCardContent>
                        {!isResolved ? (
                            <GlassCardFooter className="bg-black/5 p-6 border-t border-glass-border block">
                                <div className="space-y-4">
                                    <Textarea
                                        placeholder="Type your reply here..."
                                        className="min-h-[120px] bg-white border-glass-border focus:ring-primary/20"
                                        value={reply}
                                        onChange={(e) => setReply(e.target.value)}
                                    />
                                    <div className="flex justify-end items-center">
                                        <Button className="gap-2 shadow-lg shadow-primary/20" disabled={!reply} onClick={handleReply}>
                                            <Send className="h-4 w-4" /> Send Reply
                                        </Button>
                                    </div>
                                </div>
                            </GlassCardFooter>
                        ) : (
                            <GlassCardFooter className="bg-success/5 p-6 border-t border-success/20 block">
                                <div className="rounded-xl border border-success/20 bg-white/60 p-4 text-center">
                                    <CheckCircle2 className="h-6 w-6 text-success mx-auto mb-2" />
                                    <p className="text-sm font-semibold text-foreground">This ticket has been marked as resolved.</p>
                                    <p className="text-xs text-muted-foreground mt-1">If you need more help, please open a new support request.</p>
                                </div>
                            </GlassCardFooter>
                        )}
                    </GlassCard>
                </div>

                <div className="lg:col-span-1 space-y-6">
                    <GlassCard>
                        <GlassCardHeader>
                            <GlassCardTitle>Ticket Details</GlassCardTitle>
                        </GlassCardHeader>
                        <GlassCardContent className="space-y-6">
                            <div>
                                <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest block mb-2">Priority</span>
                                <Badge variant={ticket.priority === 'High' ? 'destructive' : ticket.priority === 'Medium' ? 'warning' : 'outline'} className="w-full justify-center py-1 font-bold">
                                    {ticket.priority ?? "Normal"} Priority
                                </Badge>
                            </div>

                            <div className="pt-4 border-t border-glass-border">
                                <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest block mb-2">Assigned Agent</span>
                                <div className="flex items-center gap-3 bg-white/40 p-3 rounded-xl border border-glass-border/50">
                                    <div className="h-10 w-10 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center font-bold shadow-sm">SJ</div>
                                    <div>
                                        <p className="text-sm font-bold">Sarah Jenkins</p>
                                        <p className="text-[11px] text-muted-foreground">Support Specialist</p>
                                    </div>
                                </div>
                            </div>

                            <div className="pt-4 border-t border-glass-border">
                                <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest block mb-2">Time Statistics</span>
                                <div className="space-y-3">
                                    <div className="flex justify-between items-center">
                                        <span className="text-xs text-muted-foreground flex items-center gap-1.5"><Clock className="h-3.5 w-3.5" /> Response Time</span>
                                        <span className="text-xs font-bold text-foreground">14m</span>
                                    </div>
                                    <div className="flex justify-between items-center">
                                        <span className="text-xs text-muted-foreground flex items-center gap-1.5"><CheckCircle2 className="h-3.5 w-3.5" /> SLA Status</span>
                                        <Badge variant="success" className="text-[9px] h-4">Compliant</Badge>
                                    </div>
                                </div>
                            </div>
                        </GlassCardContent>
                    </GlassCard>
                </div>
            </div>
            <ErrorToast error={error} onClear={() => setError(null)} />
        </PageContainer>
    )
}

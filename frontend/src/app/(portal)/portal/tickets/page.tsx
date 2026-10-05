"use client"

import { useEffect, useState } from "react"
import { PageContainer } from "@/components/layout/PageContainer"
import { GlassCard, GlassCardContent, GlassCardHeader, GlassCardTitle, GlassCardDescription } from "@/components/glass/GlassCard"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { apiGet, apiPost } from "@/lib/api"
import { getPortalToken } from "@/lib/auth"
import { Search, Plus, MessageSquare, Clock, AlertCircle, ChevronRight, Filter } from "lucide-react"
import Link from "next/link"
import { StatusBadge } from "@/components/shared/StatusBadge"
import { ErrorToast } from "@/components/shared/ErrorToast"
import { RecordNumberBadge } from "@/components/shared/RecordNumberBadge"

export default function PortalTickets() {
    const [searchQuery, setSearchQuery] = useState("")
    const [tickets, setTickets] = useState<any[]>([])
    const [showForm, setShowForm] = useState(false)
    const [subject, setSubject] = useState("")
    const [message, setMessage] = useState("")
    const [error, setError] = useState<string | null>(null)
    const portalToken = getPortalToken()

    const formatStatusLabel = (status?: string | null) => {
        const raw = String(status ?? "OPEN")
        return raw
            .toLowerCase()
            .replace(/_/g, " ")
            .replace(/\b\w/g, (char) => char.toUpperCase())
    }

    useEffect(() => {
        if (!portalToken) return
        const load = async () => {
            try {
                const res = await apiGet<any[]>(`/portal/${portalToken}/tickets`)
                setTickets(Array.isArray(res.data) ? res.data : [])
                setError(null)
            } catch (err: any) {
                setError(err?.message ?? "Failed to load tickets")
            }
        }
        load()
    }, [portalToken])

    const filteredTickets = tickets.filter(t =>
        t.ticket?.subject?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        t.ticket?.ticketNumber?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        t.ticket?.id?.toLowerCase().includes(searchQuery.toLowerCase())
    )

    const getTicketNumber = (ticket: any) => ticket?.ticketNumber ?? `TKT-${String(ticket?.id ?? "").slice(0, 6).toUpperCase()}`

    const handleCreate = async () => {
        if (!portalToken || !subject || !message) return
        try {
            await apiPost(`/portal/${portalToken}/tickets`, { subject, message })
            setSubject("")
            setMessage("")
            setShowForm(false)
            const res = await apiGet<any[]>(`/portal/${portalToken}/tickets`)
            setTickets(Array.isArray(res.data) ? res.data : [])
            setError(null)
        } catch (err: any) {
            setError(err?.message ?? "Failed to create ticket")
        }
    }

    return (
        <PageContainer>
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-foreground">Support Tickets</h1>
                    <p className="text-muted-foreground mt-1 text-sm">Need help or want to report an issue? Open a ticket.</p>
                </div>

                <div className="flex items-center gap-2">
                    <Button className="gap-2 shadow-sm" onClick={() => setShowForm((prev) => !prev)}>
                        <Plus className="h-4 w-4" /> New Request
                    </Button>
                </div>
            </div>

            {showForm && (
                <GlassCard className="mb-6">
                    <GlassCardHeader className="pb-3 border-b border-glass-border">
                        <GlassCardTitle className="text-lg">Open a Ticket</GlassCardTitle>
                        <GlassCardDescription>Tell us what you need help with.</GlassCardDescription>
                    </GlassCardHeader>
                    <GlassCardContent className="space-y-4">
                        <Input
                            placeholder="Subject"
                            className="bg-white/50"
                            value={subject}
                            onChange={(e) => setSubject(e.target.value)}
                        />
                        <Textarea
                            placeholder="Describe your issue..."
                            className="bg-white/50 min-h-[120px]"
                            value={message}
                            onChange={(e) => setMessage(e.target.value)}
                        />
                        <div className="flex justify-end gap-2">
                            <Button variant="outline" onClick={() => setShowForm(false)} className="bg-white/40">Cancel</Button>
                            <Button onClick={handleCreate} disabled={!subject || !message}>Submit Ticket</Button>
                        </div>
                    </GlassCardContent>
                </GlassCard>
            )}

            <GlassCard>
                <GlassCardHeader className="pb-3 border-b border-glass-border flex flex-col md:flex-row justify-between gap-4">
                    <GlassCardTitle className="text-lg">Your Requests</GlassCardTitle>
                    <div className="relative w-full md:w-64">
                        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                        <Input
                            placeholder="Search tickets..."
                            className="pl-9 bg-white/40 h-9"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                        />
                    </div>
                </GlassCardHeader>
                <GlassCardContent className="p-0">
                    <div className="divide-y divide-glass-border">
                        {filteredTickets.length === 0 ? (
                            <div className="p-12 text-center text-muted-foreground">
                                <MessageSquare className="h-12 w-12 mx-auto mb-3 opacity-20" />
                                <p className="text-lg font-medium">No Support Requests</p>
                                <p className="text-sm mt-1">You haven't opened any support tickets yet.</p>
                                <Button variant="outline" className="mt-4 bg-white/50">Open a Ticket</Button>
                            </div>
                        ) : (
                            filteredTickets.map((entry: any) => (
                                <div key={entry.ticket.id} className="p-4 sm:p-6 hover:bg-white/30 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-4 group">
                                    <div className="flex-1 space-y-2">
                                        <div className="flex justify-between items-start">
                                            <StatusBadge status={formatStatusLabel(entry.ticket.status)} className="shadow-sm">
                                                {formatStatusLabel(entry.ticket.status)}
                                            </StatusBadge>
                                            <Badge variant="outline" className="text-[10px] px-1.5 h-4 opacity-70">
                                                {entry.ticket.priority ?? "Normal"}
                                            </Badge>
                                        </div>
                                        <div className="flex flex-wrap items-center gap-2">
                                            <RecordNumberBadge value={getTicketNumber(entry.ticket)} />
                                            <h3 className="font-semibold text-lg leading-tight group-hover:text-primary transition-colors">{entry.ticket.subject}</h3>
                                        </div>
                                        <div className="flex items-center gap-4 text-xs text-muted-foreground pt-1">
                                            <span className="flex items-center gap-1.5"><MessageSquare className="h-3.5 w-3.5" /> {(entry.messages || []).length} messages</span>
                                            <span>Updated: {new Date(entry.ticket.updatedAt ?? entry.ticket.createdAt ?? Date.now()).toLocaleDateString()}</span>
                                        </div>
                                    </div>

                                    <div className="flex items-center justify-end w-full sm:w-auto mt-2 sm:mt-0">
                                        <Button variant="ghost" className="hidden sm:flex text-primary group-hover:bg-primary/10 gap-2 h-9" asChild>
                                            <Link href={`/portal/tickets/${entry.ticket.id}`}>View Thread <ChevronRight className="h-4 w-4" /></Link>
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

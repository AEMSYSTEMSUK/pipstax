"use client"

import { useEffect, useState } from "react"
import { PageContainer } from "@/components/layout/PageContainer"
import { GlassCard, GlassCardContent, GlassCardHeader, GlassCardTitle } from "@/components/glass/GlassCard"
import { Button } from "@/components/ui/button"
import { apiGet, downloadFile } from "@/lib/api"
import { getPortalToken } from "@/lib/auth"
import { FileText, ChevronRight, Download } from "lucide-react"
import { StatusBadge } from "@/components/shared/StatusBadge"
import Link from "next/link"
import { ErrorToast } from "@/components/shared/ErrorToast"

type PortalQuote = {
    id: string
    quoteNumber?: string
    title?: string
    status?: string
    workflowBaseStatus?: string
    workflowBaseStatusLabel?: string
    workflowStatusLabel?: string
    total?: number
    publicToken?: string
    createdAt?: string
    siteName?: string | null
    siteReference?: string | null
    siteAddress?: string | null
}

export default function PortalQuotes() {
    const [quotes, setQuotes] = useState<PortalQuote[]>([])
    const [error, setError] = useState<string | null>(null)

    const portalToken = getPortalToken()

    useEffect(() => {
        if (!portalToken) return
        const load = async () => {
            try {
                const res = await apiGet<PortalQuote[]>(`/portal/${portalToken}/quotes`)
                setQuotes(Array.isArray(res.data) ? res.data : [])
                setError(null)
            } catch (err: any) {
                setError(err?.message ?? "Failed to load quotes")
            }
        }
        load()
    }, [portalToken])

    const handleDownload = async (token?: string, quoteNumber?: string) => {
        if (!token) return
        const blob = await downloadFile(`/public/quotes/${token}/pdf`)
        const url = window.URL.createObjectURL(blob)
        const a = document.createElement("a")
        a.href = url
        a.download = `quote-${quoteNumber ?? token}.pdf`
        a.click()
        window.URL.revokeObjectURL(url)
    }

    const getQuoteBaseStatus = (quote: PortalQuote) => String(quote.workflowBaseStatus ?? quote.status ?? "").toUpperCase()
    const getQuoteBaseStatusLabel = (quote: PortalQuote) => quote.workflowBaseStatusLabel ?? quote.status ?? "Draft"
    const getQuoteStatusLabel = (quote: PortalQuote) => quote.workflowStatusLabel ?? getQuoteBaseStatusLabel(quote)

    return (
        <PageContainer>
            <div className="mb-6">
                <h1 className="text-3xl font-bold tracking-tight text-foreground">Quotes & Proposals</h1>
                <p className="text-muted-foreground mt-1 text-sm">Review, download, and approve your project quotes.</p>
            </div>

            <GlassCard>
                <GlassCardHeader className="pb-3 border-b border-glass-border">
                    <GlassCardTitle className="text-lg">All Quotes</GlassCardTitle>
                </GlassCardHeader>
                <GlassCardContent className="p-0">
                    <div className="divide-y divide-glass-border">
                        {quotes.length === 0 ? (
                            <div className="p-12 text-center text-muted-foreground">
                                <FileText className="h-12 w-12 mx-auto mb-3 opacity-20" />
                                <p className="text-lg font-medium">No Quotes Available</p>
                                <p className="text-sm">You don't have any quotes on file yet.</p>
                            </div>
                        ) : (
                            quotes.map(quote => (
                                <div key={quote.id} className="p-4 sm:p-6 hover:bg-white/30 transition-colors flex flex-col md:flex-row md:items-center justify-between gap-4 group">
                                    <div className="flex-1 space-y-2">
                                        <div className="flex items-center gap-2">
                                            <StatusBadge status={getQuoteBaseStatusLabel(quote)} className="shadow-sm">
                                                {getQuoteStatusLabel(quote)}
                                            </StatusBadge>
                                            <span className="text-xs font-medium text-muted-foreground">
                                                {quote.quoteNumber ?? "QT-PENDING"}
                                            </span>
                                        </div>
                                        <h3 className="font-semibold text-lg leading-tight group-hover:text-primary transition-colors">{quote.title ?? "Quote"}</h3>
                                        <p className="font-bold text-foreground">£{Number(quote.total ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
                                        {quote.siteName ? (
                                            <div className="text-xs text-muted-foreground space-y-1">
                                                <p>Site: {quote.siteName}{quote.siteReference ? ` • ${quote.siteReference}` : ""}</p>
                                                {quote.siteAddress ? <p>{quote.siteAddress}</p> : null}
                                            </div>
                                        ) : null}
                                    </div>

                                    <div className="flex items-center gap-2 justify-end w-full md:w-auto mt-2 md:mt-0">
                                        <Button variant="outline" size="sm" className="bg-white/40 h-9 px-3 gap-2" onClick={() => handleDownload(quote.publicToken, quote.quoteNumber)}>
                                            <Download className="h-4 w-4" /> PDF
                                        </Button>
                                        <Button className="h-9 gap-2 shadow-sm" asChild>
                                            <Link href={`/portal/quotes/${quote.id}`}>
                                                {["SENT", "VIEWED"].includes(getQuoteBaseStatus(quote)) ? 'Review & Accept' : 'View Details'} <ChevronRight className="h-4 w-4" />
                                            </Link>
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

"use client"

import { useEffect, useState } from "react"
import { PageContainer } from "@/components/layout/PageContainer"
import { GlassCard, GlassCardContent, GlassCardHeader, GlassCardTitle } from "@/components/glass/GlassCard"
import { Button } from "@/components/ui/button"
import { apiGet, downloadFile } from "@/lib/api"
import { getPortalToken } from "@/lib/auth"
import { FileText, ChevronRight, Download, ExternalLink } from "lucide-react"
import { StatusBadge } from "@/components/shared/StatusBadge"
import Link from "next/link"
import { ErrorToast } from "@/components/shared/ErrorToast"

type PortalInvoice = {
    id: string
    invoiceNumber?: string
    status?: string
    workflowBaseStatus?: string
    workflowBaseStatusLabel?: string
    workflowStatusLabel?: string
    total?: number
    dueDate?: string
    sentAt?: string
    siteName?: string | null
    siteReference?: string | null
    siteAddress?: string | null
}

export default function PortalInvoices() {
    const [invoices, setInvoices] = useState<PortalInvoice[]>([])
    const [error, setError] = useState<string | null>(null)

    const portalToken = getPortalToken()

    useEffect(() => {
        if (!portalToken) return
        const load = async () => {
            try {
                const res = await apiGet<PortalInvoice[]>(`/portal/${portalToken}/invoices`)
                const visibleInvoices = Array.isArray(res.data)
                    ? res.data.filter((invoice) => String(invoice.workflowBaseStatus ?? invoice.status ?? "").toUpperCase() !== "DRAFT")
                    : []
                setInvoices(visibleInvoices)
                setError(null)
            } catch (err: any) {
                setError(err?.message ?? "Failed to load invoices")
            }
        }
        load()
    }, [portalToken])

    const getInvoiceBaseStatus = (invoice: PortalInvoice) => String(invoice.workflowBaseStatus ?? invoice.status ?? "").toUpperCase()
    const getInvoiceBaseStatusLabel = (invoice: PortalInvoice) => invoice.workflowBaseStatusLabel ?? invoice.status ?? "Draft"
    const getInvoiceStatusLabel = (invoice: PortalInvoice) => invoice.workflowStatusLabel ?? getInvoiceBaseStatusLabel(invoice)

    const pending = invoices.filter((invoice) => !["PAID", "VOID"].includes(getInvoiceBaseStatus(invoice)));
    const totalDue = pending.reduce((acc, curr) => acc + Number(curr.total ?? 0), 0);

    const handleDownload = async (id: string, invoiceNumber?: string) => {
        if (!portalToken) return
        const blob = await downloadFile(`/portal/${portalToken}/invoices/${id}/pdf`)
        const url = window.URL.createObjectURL(blob)
        const a = document.createElement("a")
        a.href = url
        a.download = `invoice-${invoiceNumber ?? id}.pdf`
        a.click()
        window.URL.revokeObjectURL(url)
    }

    return (
        <PageContainer>
            <div className="mb-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-foreground">Invoices</h1>
                    <p className="text-muted-foreground mt-1 text-sm">View and pay your outstanding balances.</p>
                </div>

                {totalDue > 0 && (
                    <div className="bg-white/40 border border-glass-border p-3 rounded-xl flex items-center justify-between gap-6 min-w-64">
                        <div>
                            <span className="text-xs text-muted-foreground font-semibold uppercase">Total Due</span>
                            <p className="text-xl font-bold">£{totalDue.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
                        </div>
                    </div>
                )}
            </div>

            <GlassCard>
                <GlassCardHeader className="pb-3 border-b border-glass-border">
                    <GlassCardTitle className="text-lg">Invoice History</GlassCardTitle>
                </GlassCardHeader>
                <GlassCardContent className="p-0">
                    <div className="divide-y divide-glass-border">
                        {invoices.length === 0 ? (
                            <div className="p-12 text-center text-muted-foreground">
                                <FileText className="h-12 w-12 mx-auto mb-3 opacity-20" />
                                <p className="text-lg font-medium">No Invoices</p>
                                <p className="text-sm">You don't have any invoices on file yet.</p>
                            </div>
                        ) : (
                            invoices.map(invoice => (
                                <div key={invoice.id} className={`p-4 sm:p-6 hover:bg-white/30 transition-colors flex flex-col md:flex-row md:items-center justify-between gap-4 group ${getInvoiceBaseStatus(invoice) === 'OVERDUE' ? 'bg-destructive/5' : ''}`}>
                                    <div className="flex-1 space-y-2">
                                        <div className="flex items-center gap-2">
                                            <StatusBadge status={getInvoiceBaseStatusLabel(invoice)} className="shadow-sm">
                                                {getInvoiceStatusLabel(invoice)}
                                            </StatusBadge>
                                            <span className="text-xs font-medium text-muted-foreground">
                                                {invoice.invoiceNumber ?? "INV-PENDING"}
                                            </span>
                                            {getInvoiceBaseStatus(invoice) === 'OVERDUE' && invoice.dueDate && (
                                                <span className="text-xs font-bold text-destructive px-1.5 py-0.5 bg-destructive/10 rounded">
                                                    Overdue by {Math.abs(Math.floor((new Date(invoice.dueDate).getTime() - new Date().getTime()) / (1000 * 3600 * 24)))} days
                                                </span>
                                            )}
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <p className="font-bold text-foreground text-lg">£{Number(invoice.total ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
                                            <span className="text-sm text-muted-foreground">Due {invoice.dueDate ? new Date(invoice.dueDate).toLocaleDateString() : "TBD"}</span>
                                        </div>
                                        {invoice.siteName ? (
                                            <div className="text-xs text-muted-foreground space-y-1">
                                                <p>Site: {invoice.siteName}{invoice.siteReference ? ` • ${invoice.siteReference}` : ""}</p>
                                                {invoice.siteAddress ? <p>{invoice.siteAddress}</p> : null}
                                            </div>
                                        ) : null}
                                    </div>

                                    <div className="flex items-center gap-2 justify-end w-full md:w-auto mt-2 md:mt-0">
                                        <Button variant="outline" size="sm" className="bg-white/40 h-9 px-3 gap-2" onClick={() => handleDownload(invoice.id, invoice.invoiceNumber)}>
                                            <Download className="h-4 w-4" /> PDF
                                        </Button>
                                        {["SENT", "VIEWED", "OVERDUE"].includes(getInvoiceBaseStatus(invoice)) ? (
                                            <Button className="h-9 gap-2 shadow-sm border border-primary bg-primary/10 text-primary-dark hover:bg-primary/20">
                                                Pay Now <ExternalLink className="h-4 w-4" />
                                            </Button>
                                        ) : (
                                            <Button variant="ghost" className="h-9 gap-2" asChild>
                                                <Link href={`/portal/invoices/${invoice.id}`}>
                                                    View Details <ChevronRight className="h-4 w-4" />
                                                </Link>
                                            </Button>
                                        )}
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

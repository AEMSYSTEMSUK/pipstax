"use client"

import { use, useEffect, useState } from "react"
import { PageContainer } from "@/components/layout/PageContainer"
import { GlassCard, GlassCardContent } from "@/components/glass/GlassCard"
import { Button } from "@/components/ui/button"
import { apiGet, downloadFile } from "@/lib/api"
import { getPortalToken } from "@/lib/auth"
import { ArrowLeft, Download, CreditCard, CheckCircle2, AlertCircle } from "lucide-react"
import { ErrorToast } from "@/components/shared/ErrorToast"
import { StatusBadge } from "@/components/shared/StatusBadge"
import { BrowserBackButton } from "@/components/shared/BrowserBackButton"

type TenantProfile = {
    name?: string
    tradingName?: string
    logoUrl?: string
    address?: string
    contactEmail?: string
    contactPhone?: string
    vatNumber?: string
}

export default function PortalInvoiceDetail({ params }: { params: Promise<{ id: string }> }) {
    const resolvedParams = use(params)
    const [invoice, setInvoice] = useState<any | null>(null)
    const [error, setError] = useState<string | null>(null)
    const [tenant, setTenant] = useState<TenantProfile | null>(null)
    const [customer, setCustomer] = useState<any | null>(null)
    const [logoUnavailable, setLogoUnavailable] = useState(false)

    const portalToken = getPortalToken()

    useEffect(() => {
        if (!portalToken) return
        const load = async () => {
            try {
                const [invoiceRes, profileRes] = await Promise.all([
                    apiGet<any>(`/portal/${portalToken}/invoices/${resolvedParams.id}`),
                    apiGet<any>(`/portal/${portalToken}/profile`),
                ])
                setInvoice(invoiceRes.data ?? null)
                setTenant(profileRes.data?.tenant ?? null)
                setCustomer(profileRes.data?.customer ?? null)
                setLogoUnavailable(false)
                setError(null)
            } catch (err: any) {
                setError(err?.message ?? "Failed to load invoice")
            }
        }
        load()
    }, [portalToken, resolvedParams.id])

    if (!invoice) {
        return (
            <PageContainer>
                <div className="text-center p-12">Invoice not found</div>
                <ErrorToast error={error} onClear={() => setError(null)} />
            </PageContainer>
        )
    }

    const invoiceNumber = invoice.invoiceNumber ?? "INV-PENDING"
    const tenantName = tenant?.tradingName ?? tenant?.name ?? "Workspace"
    const tenantAddressLines = [tenant?.address, tenant?.contactEmail, tenant?.contactPhone].filter(Boolean)
    const customerName = customer?.name ?? invoice.clientName ?? "Customer"
    const customerAddressLines = [customer?.address ?? invoice.clientAddress].filter(Boolean)
    const invoiceBaseStatus = String(invoice.workflowBaseStatus ?? invoice.status ?? "").toUpperCase()
    const invoiceBaseStatusLabel = invoice.workflowBaseStatusLabel ?? invoice.status ?? "Draft"
    const invoiceStatusLabel = invoice.workflowStatusLabel ?? invoiceBaseStatusLabel

    const handleDownload = async () => {
        if (!portalToken) return
        const blob = await downloadFile(`/portal/${portalToken}/invoices/${invoice.id}/pdf`)
        const url = window.URL.createObjectURL(blob)
        const a = document.createElement("a")
        a.href = url
        a.download = `invoice-${invoiceNumber}.pdf`
        a.click()
        window.URL.revokeObjectURL(url)
    }

    return (
        <PageContainer>
            <div className="mb-6">
                <BrowserBackButton className="text-sm font-medium text-primary hover:text-primary-dark transition-colors inline-flex items-center gap-1 mb-4">
                    <ArrowLeft className="h-3 w-3" /> Back to Invoices
                </BrowserBackButton>
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                    <div>
                        <h1 className="text-3xl font-bold tracking-tight text-foreground">Invoice {invoiceNumber}</h1>
                        <p className="text-muted-foreground mt-1 flex items-center gap-2">
                            Issued {new Date(invoice.createdAt ?? Date.now()).toLocaleDateString()} • <StatusBadge status={invoiceBaseStatusLabel}>{invoiceStatusLabel}</StatusBadge>
                        </p>
                        {invoice.siteName ? (
                            <div className="mt-2 text-sm text-muted-foreground">
                                Site: {invoice.siteName}{invoice.siteReference ? ` • ${invoice.siteReference}` : ""}
                                {invoice.siteAddress ? ` • ${invoice.siteAddress}` : ""}
                            </div>
                        ) : null}
                    </div>

                    <div className="flex items-center gap-2 w-full sm:w-auto">
                        <Button variant="outline" className="bg-white/40 gap-2" onClick={handleDownload}>
                            <Download className="h-4 w-4" /> Download PDF
                        </Button>
                        {!["PAID", "VOID"].includes(invoiceBaseStatus) && (
                            <Button className="shadow-lg shadow-primary/20 gap-2">
                                <CreditCard className="h-4 w-4" /> Pay Now
                            </Button>
                        )}
                    </div>
                </div>
            </div>

            <div className="max-w-4xl mx-auto">
                <GlassCard className="bg-white shadow-2xl">
                    <GlassCardContent className="p-8 md:p-12">
                        {/* Invoice Header */}
                        <div className="flex flex-col md:flex-row justify-between items-start mb-12 gap-8">
                            <div>
                                {tenant?.logoUrl && !logoUnavailable ? (
                                    <img
                                        src={tenant.logoUrl}
                                        alt={`${tenantName} logo`}
                                        className="h-14 max-w-[240px] object-contain mb-4"
                                        onError={() => setLogoUnavailable(true)}
                                    />
                                ) : (
                                    <div className="min-h-14 max-w-[280px] px-3 py-2 rounded bg-black/5 flex items-center justify-center text-primary font-semibold mb-4 border border-black/10 text-sm">
                                        {tenantName}
                                    </div>
                                )}
                                <h2 className="font-bold text-xl text-foreground">{tenantName}</h2>
                                <div className="text-sm text-muted-foreground space-y-0.5 mt-2">
                                    {tenantAddressLines.map((line, idx) => (
                                        <p key={`${line}-${idx}`}>{line}</p>
                                    ))}
                                    {tenant?.vatNumber && <p className="pt-2">VAT: {tenant.vatNumber}</p>}
                                </div>
                            </div>
                            <div className="text-left md:text-right">
                                <h2 className="text-4xl font-light text-muted-foreground mb-6">INVOICE</h2>
                                <div className="space-y-1 text-sm">
                                    <p><span className="font-semibold text-muted-foreground uppercase text-[10px] tracking-wider block">Invoice Number</span> <span className="text-lg font-bold">{invoiceNumber}</span></p>
                                    <p><span className="font-semibold text-muted-foreground uppercase text-[10px] tracking-wider block mt-2">Date Issued</span> {new Date(invoice.createdAt ?? Date.now()).toLocaleDateString()}</p>
                                    <p><span className="font-semibold text-muted-foreground uppercase text-[10px] tracking-wider block mt-2">Due Date</span> <span className={invoiceBaseStatus === 'OVERDUE' ? 'text-destructive font-bold' : ''}>{invoice.dueDate ? new Date(invoice.dueDate).toLocaleDateString() : "TBD"}</span></p>
                                </div>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 mb-12 gap-8 border-t border-b border-gray-100 py-8">
                            <div>
                                <h3 className="font-semibold text-xs text-muted-foreground uppercase tracking-widest mb-3">Bill To:</h3>
                                <p className="font-bold text-lg text-foreground">{customerName}</p>
                                {invoice.clientEmail && <p className="text-sm text-muted-foreground">{invoice.clientEmail}</p>}
                                {customerAddressLines.map((line, idx) => (
                                    <p key={`${line}-${idx}`} className="text-sm text-muted-foreground">{line}</p>
                                ))}
                            </div>
                            <div className="md:text-right">
                                {invoiceBaseStatus === 'PAID' ? (
                                    <div className="inline-flex items-center gap-2 px-4 py-2 bg-success/10 text-success rounded-full border border-success/20">
                                        <CheckCircle2 className="h-5 w-5" />
                                        <span className="font-bold uppercase tracking-widest text-xs">Payment Received</span>
                                    </div>
                                ) : (
                                    <div className="inline-flex items-center gap-2 px-4 py-2 bg-amber-50 text-amber-600 rounded-full border border-amber-100">
                                        <AlertCircle className="h-5 w-5" />
                                        <span className="font-bold uppercase tracking-widest text-xs">Payment Pending</span>
                                    </div>
                                )}
                            </div>
                        </div>

                        {invoice.siteName ? (
                            <div className="mb-10 rounded-2xl border border-gray-200 bg-slate-50 px-5 py-4">
                                <div className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Service Site</div>
                                <div className="mt-1 text-base font-semibold text-foreground">
                                    {invoice.siteName}{invoice.siteReference ? ` • ${invoice.siteReference}` : ""}
                                </div>
                                {invoice.siteAddress ? <div className="mt-1 text-sm text-muted-foreground">{invoice.siteAddress}</div> : null}
                            </div>
                        ) : null}

                        <table className="w-full mb-12 text-sm">
                            <thead>
                                <tr className="border-b-2 border-gray-200 text-left">
                                    <th className="pb-3 font-semibold text-muted-foreground uppercase">Description</th>
                                    <th className="pb-3 font-semibold text-muted-foreground uppercase text-center w-24">Qty</th>
                                    <th className="pb-3 font-semibold text-muted-foreground uppercase text-right w-32">Unit Price</th>
                                    <th className="pb-3 font-semibold text-muted-foreground uppercase text-right w-32">Amount</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {(invoice.lineItems || []).map((item: any, index: number) => (
                                    <tr key={index}>
                                        <td className="py-5">
                                            <p className="font-semibold text-foreground">{item.description}</p>
                                        </td>
                                        <td className="py-5 text-center text-foreground">{item.quantity}</td>
                                        <td className="py-5 text-right text-foreground">£{Number(item.unitPrice ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                                        <td className="py-5 text-right font-bold text-foreground">£{(Number(item.unitPrice ?? 0) * Number(item.quantity ?? 0)).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>

                        <div className="flex justify-end pt-4 border-t-4 border-gray-900/5">
                            <div className="w-full md:w-80 space-y-4">
                                <div className="flex justify-between items-center text-sm font-medium text-muted-foreground px-2">
                                    <span>Subtotal</span>
                                    <span>£{Number(invoice.subTotal ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                                </div>
                                <div className="flex justify-between items-center text-sm font-medium text-muted-foreground px-2">
                                    <span>VAT (20%)</span>
                                    <span>£{Number(invoice.vatTotal ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                                </div>
                                <div className="flex justify-between items-center bg-gray-900 text-white rounded-xl p-4 shadow-xl">
                                    <span className="text-xs uppercase tracking-widest font-bold opacity-70">Total Amount Due</span>
                                    <span className="text-2xl font-bold">£{Number(invoice.total ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                                </div>
                            </div>
                        </div>

                        <div className="mt-20 pt-8 border-t border-gray-100 text-[10px] text-muted-foreground text-center space-y-1">
                            <p className="font-semibold uppercase tracking-[0.2em] mb-2">Payment Information</p>
                            <p>Bank: TechBank UK • Account: 12345678 • Sort Code: 00-11-22</p>
                            <p>Please quote invoice reference {invoiceNumber} when making payment.</p>
                            <p className="pt-4 italic">Thank you for your business!</p>
                        </div>
                    </GlassCardContent>
                </GlassCard>
            </div>
            <ErrorToast error={error} onClear={() => setError(null)} />
        </PageContainer>
    )
}

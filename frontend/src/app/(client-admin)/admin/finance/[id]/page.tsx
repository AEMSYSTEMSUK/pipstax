"use client"

import { use, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { PageContainer } from "@/components/layout/PageContainer"
import { GlassCard, GlassCardContent, GlassCardHeader, GlassCardTitle } from "@/components/glass/GlassCard"
import { Button } from "@/components/ui/button"
import { StatusBadge } from "@/components/shared/StatusBadge"
import { ArrowLeft, Download, Send, AlertTriangle, CheckCircle, CreditCard, Mail, Link2, Copy, Trash2, ExternalLink, Pencil } from "lucide-react"
import { apiDelete, apiGet, apiPost, apiPut, downloadFile, isDeleteCancelled } from "@/lib/api"
import { ErrorToast } from "@/components/shared/ErrorToast"
import { useToast } from "@/components/ui/toast"
import { getModulePermissions } from "@/lib/permission-ui"
import { formatInvoiceStatus } from "@/lib/status"
import { useTenantFeatures } from "@/components/layout/TenantFeaturesContext"
import { useTenantWorkflowConfig } from "@/components/layout/TenantWorkflowContext"
import { getWorkflowStageOptions, getWorkflowStatusLabel } from "@/lib/workflows"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { GlassModal } from "@/components/glass/GlassModal"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Checkbox } from "@/components/ui/checkbox"
import { BrowserBackButton } from "@/components/shared/BrowserBackButton"

type Invoice = {
    id: string
    invoiceNumber: string
    customerId: string
    jobId?: string
    siteId?: string
    siteName?: string
    siteAddress?: string
    sourceQuoteId?: string
    clientName: string
    clientEmail: string
    clientAddress?: string
    projectName: string
    issueDate: string
    dueDate: string
    subtotal: number
    taxTotal: number
    total: number
    status: string
    workflowStageKey?: string
    balanceDue: number
    amountPaid: number
    payments?: Array<{ id: string; amount: number; paymentDate: string; method?: string; reference?: string; notes?: string }>
    lineItems: Array<{ id: string; description?: string; quantity?: number; unitPrice?: number; taxRate?: number; total?: number }>
    paidAt?: string | null
    accountingProvider?: string | null
    accountingSyncStatus?: string | null
    isMtdCompliant?: boolean
}

type Tenant = {
    name?: string
    tradingName?: string
    logoUrl?: string
    address?: string
    contactEmail?: string
    contactPhone?: string
    accountingProvider?: string
}

export default function InvoiceDetailPage({ params }: { params: Promise<{ id: string }> }) {
    const resolvedParams = use(params)
    const router = useRouter()
    const { toast } = useToast()
    const { canView, canManage } = getModulePermissions("financials.view", "financials.manage")
    const { complianceWorkflows } = useTenantFeatures()
    const workflowConfig = useTenantWorkflowConfig()
    const [invoice, setInvoice] = useState<Invoice | null>(null)
    const [tenant, setTenant] = useState<Tenant | null>(null)
    const [customers, setCustomers] = useState<any[]>([])
    const [error, setError] = useState<string | null>(null)
    const [logoUnavailable, setLogoUnavailable] = useState(false)
    const [shareOptionsOpen, setShareOptionsOpen] = useState(false)
    const [shareEmailOpen, setShareEmailOpen] = useState(false)
    const [shareLoading, setShareLoading] = useState<"email" | "copy" | "download" | null>(null)
    const [shareEmailForm, setShareEmailForm] = useState({
        email: "",
        message: "Please find your invoice ready for review in the customer portal.",
        markAsSent: true,
    })
    const [paymentOpen, setPaymentOpen] = useState(false)
    const [paymentSaving, setPaymentSaving] = useState(false)
    const [editingPaymentId, setEditingPaymentId] = useState<string | null>(null)
    const [paymentForm, setPaymentForm] = useState({
        amount: "",
        paymentDate: new Date().toISOString().slice(0, 10),
        method: "Bank Transfer",
        reference: "",
        notes: "",
    })
    const [paymentError, setPaymentError] = useState<string | null>(null)
    const [deletingInvoice, setDeletingInvoice] = useState(false)

    useEffect(() => {
        const load = async () => {
            try {
                const [invoiceRes, customersRes, tenantRes] = await Promise.all([
                    apiGet<any>(`/invoices/${resolvedParams.id}`),
                    apiGet<any[]>("/customers"),
                    apiGet<any>("/settings/tenant")
                ])
                const customerList = Array.isArray(customersRes.data) ? customersRes.data : []
                setCustomers(customerList)
                setTenant(tenantRes.data)
                setLogoUnavailable(false)

                const data = invoiceRes.data
                const customer = customerList.find((c) => c.id === data.customerId)
                const statusRaw = (data.status ?? "DRAFT").toString()
                const status = statusRaw.charAt(0).toUpperCase() + statusRaw.slice(1).toLowerCase()
                const total = Number(data.total ?? 0)
                const amountPaid = Number(data.amountPaid ?? (statusRaw.toUpperCase() === "PAID" ? total : 0))
                const balanceDue = Number(data.balanceDue ?? Math.max(0, total - amountPaid))

                setInvoice({
                    id: data.id,
                    invoiceNumber: data.invoiceNumber ?? "INV-PENDING",
                    customerId: data.customerId ?? "",
                    jobId: data.jobId ?? undefined,
                    siteId: data.siteId ?? undefined,
                    siteName: data.siteName ?? undefined,
                    siteAddress: data.siteAddress ?? undefined,
                    sourceQuoteId: data.sourceQuoteId ?? undefined,
                    clientName: customer?.name ?? "Customer",
                    clientEmail: customer?.email ?? "",
                    clientAddress: customer?.address ?? "",
                    projectName: data.title ?? "Invoice",
                    issueDate: data.createdAt ?? new Date().toISOString(),
                    dueDate: data.dueDate ?? data.createdAt ?? new Date().toISOString(),
                    subtotal: Number(data.subTotal ?? 0),
                    taxTotal: Number(data.vatTotal ?? 0),
                    total,
                    status,
                    workflowStageKey: data.workflowStageKey ?? undefined,
                    balanceDue,
                    amountPaid,
                    payments: Array.isArray(data.payments) ? data.payments : [],
                    lineItems: (data.lineItems ?? []).map((item: any, idx: number) => ({
                        id: `${data.id}-${idx}`,
                        description: item.description,
                        quantity: item.quantity,
                        unitPrice: item.unitPrice,
                        taxRate: item.vatRate ?? 0,
                        total: item.quantity * item.unitPrice
                    })),
                    paidAt: data.paidAt ?? null,
                    accountingProvider: data.accountingProvider ?? null,
                    accountingSyncStatus: data.accountingSyncStatus ?? null,
                    isMtdCompliant: Boolean(data.isMtdCompliant)
                })
            } catch (err: any) {
                setError(err?.message ?? "Failed to load invoice")
            }
        }
        load()
    }, [resolvedParams.id])

    const tenantName = useMemo(() => tenant?.tradingName ?? tenant?.name ?? "Company", [tenant])
    const invoiceStageOptions = getWorkflowStageOptions("invoices", workflowConfig)
    const invoiceStatusLabel = getWorkflowStatusLabel("invoices", invoice?.status, invoice?.workflowStageKey, workflowConfig, complianceWorkflows)
    if (!canView) {
        return (
            <PageContainer>
                <GlassCard>
                    <GlassCardHeader>
                        <GlassCardTitle>Invoice Details</GlassCardTitle>
                    </GlassCardHeader>
                    <GlassCardContent>You do not have access to view invoices.</GlassCardContent>
                </GlassCard>
            </PageContainer>
        )
    }

    if (!invoice) {
        return (
            <PageContainer>
                <div className="text-center p-12">Invoice not found</div>
                <ErrorToast error={error} onClear={() => setError(null)} />
            </PageContainer>
        )
    }

    const mergeInvoiceData = (data: any, emailFallback?: string) => {
        setInvoice((prev) => {
            if (!prev) return prev
            const statusRaw = (data.status ?? prev.status ?? "DRAFT").toString()
            const status = statusRaw.charAt(0).toUpperCase() + statusRaw.slice(1).toLowerCase()
            const total = Number(data.total ?? prev.total ?? 0)
            const amountPaid = Number(data.amountPaid ?? prev.amountPaid ?? 0)
            const balanceDue = Number(data.balanceDue ?? Math.max(0, total - amountPaid))
            return {
                ...prev,
                status,
                workflowStageKey: data.workflowStageKey ?? prev.workflowStageKey,
                balanceDue,
                amountPaid,
                total,
                subtotal: Number(data.subTotal ?? prev.subtotal),
                taxTotal: Number(data.vatTotal ?? prev.taxTotal),
                payments: Array.isArray(data.payments) ? data.payments : prev.payments,
                paidAt: data.paidAt ?? prev.paidAt,
                clientEmail: emailFallback ?? prev.clientEmail,
                accountingProvider: data.accountingProvider ?? prev.accountingProvider,
                accountingSyncStatus: data.accountingSyncStatus ?? prev.accountingSyncStatus,
            }
        })
    }

    const downloadInvoicePdf = async () => {
        try {
            setShareLoading("download")
            const blob = await downloadFile(`/invoices/${invoice.id}/pdf`)
            const url = URL.createObjectURL(blob)
            const link = document.createElement("a")
            link.href = url
            link.download = `invoice-${invoice.invoiceNumber ?? invoice.id}.pdf`
            document.body.appendChild(link)
            link.click()
            link.remove()
            URL.revokeObjectURL(url)
        } catch (err: any) {
            toast({ title: "Download failed", description: err?.message ?? "Unable to download invoice.", variant: "error" })
        } finally {
            setShareLoading(null)
        }
    }

    const openShareEmailDialog = () => {
        setShareEmailForm({
            email: invoice.clientEmail ?? "",
            message: "Please find your invoice ready for review in the customer portal.",
            markAsSent: true,
        })
        setShareEmailOpen(true)
    }

    const handleSendInvoiceEmail = async () => {
        const email = shareEmailForm.email.trim()
        if (!email || !email.includes("@")) {
            toast({ title: "Email required", description: "Enter a valid recipient email.", variant: "error" })
            return
        }
        setShareLoading("email")
        try {
            const response = await apiPost<any>(`/invoices/${invoice.id}/send`, {
                sendEmail: true,
                markAsSent: shareEmailForm.markAsSent,
                email,
                message: shareEmailForm.message,
            })
            mergeInvoiceData(response.data, email)
            setShareEmailOpen(false)
            setShareOptionsOpen(false)
            toast({
                title: "Invoice shared",
                description: shareEmailForm.markAsSent ? "Email sent and invoice marked as sent." : "Email sent without changing status.",
                variant: "success",
            })
        } catch (err: any) {
            toast({ title: "Send failed", description: err?.message ?? "Unable to send invoice.", variant: "error" })
        } finally {
            setShareLoading(null)
        }
    }

    const handleCopyInvoiceLink = async () => {
        setShareLoading("copy")
        try {
            const response = await apiPost<any>(`/invoices/${invoice.id}/send`, {
                sendEmail: false,
                markAsSent: false,
            })
            const link = response.data?.portalLink
            if (!link) throw new Error("Invoice link was not returned.")
            await navigator.clipboard.writeText(link)
            mergeInvoiceData(response.data)
            toast({ title: "Link copied", description: "Invoice portal link copied to clipboard.", variant: "success" })
        } catch (err: any) {
            toast({ title: "Copy failed", description: err?.message ?? "Unable to copy invoice link.", variant: "error" })
        } finally {
            setShareLoading(null)
        }
    }

    const openPaymentDialog = () => {
        setEditingPaymentId(null)
        setPaymentForm({
            amount: invoice.balanceDue ? String(invoice.balanceDue) : "",
            paymentDate: new Date().toISOString().slice(0, 10),
            method: "Bank Transfer",
            reference: "",
            notes: "",
        })
        setPaymentError(null)
        setPaymentOpen(true)
    }

    const openEditPaymentDialog = (payment: NonNullable<Invoice["payments"]>[number]) => {
        setEditingPaymentId(payment.id)
        setPaymentForm({
            amount: String(payment.amount ?? ""),
            paymentDate: payment.paymentDate ? new Date(payment.paymentDate).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10),
            method: payment.method ?? "",
            reference: payment.reference ?? "",
            notes: payment.notes ?? "",
        })
        setPaymentError(null)
        setPaymentOpen(true)
    }

    const handleSavePayment = async () => {
        const amount = Number(paymentForm.amount)
        if (!Number.isFinite(amount) || amount <= 0) {
            setPaymentError("Enter a payment amount greater than 0.")
            return
        }
        const currentPayment = invoice.payments?.find((payment) => payment.id === editingPaymentId)
        const availableBalance = invoice.balanceDue + (currentPayment ? Number(currentPayment.amount ?? 0) : 0)
        if (amount > availableBalance) {
            setPaymentError("Payment cannot be greater than the balance due.")
            return
        }
        setPaymentSaving(true)
        setPaymentError(null)
        try {
            const payload = {
                amount,
                paymentDate: paymentForm.paymentDate,
                method: paymentForm.method || undefined,
                reference: paymentForm.reference.trim() || undefined,
                notes: paymentForm.notes.trim() || undefined,
            }
            const response = editingPaymentId
                ? await apiPut<any>(`/invoices/${invoice.id}/payments/${editingPaymentId}`, payload)
                : await apiPost<any>(`/invoices/${invoice.id}/payments`, payload)
            mergeInvoiceData(response.data)
            setPaymentOpen(false)
            setEditingPaymentId(null)
            toast({ title: editingPaymentId ? "Payment updated" : "Payment recorded", description: "Invoice payment has been saved.", variant: "success" })
        } catch (err: any) {
            setPaymentError(err?.message ?? "Unable to save payment.")
        } finally {
            setPaymentSaving(false)
        }
    }

    const handleDeletePayment = async (paymentId: string) => {
        if (!canManage) return
        try {
            const response = await apiDelete<any>(`/invoices/${invoice.id}/payments/${paymentId}`)
            mergeInvoiceData(response.data)
            toast({ title: "Payment deleted", description: "Invoice balance and status have been recalculated.", variant: "success" })
        } catch (err: any) {
            if (isDeleteCancelled(err)) return
            toast({ title: "Delete failed", description: err?.message ?? "Unable to delete payment.", variant: "error" })
        }
    }

    const handleDeleteInvoice = async () => {
        if (!canManage) return
        setDeletingInvoice(true)
        try {
            await apiDelete(`/invoices/${invoice.id}`)
            toast({ title: "Invoice deleted", description: "Invoice has been removed.", variant: "success" })
            router.push("/admin/finance")
        } catch (err: any) {
            if (isDeleteCancelled(err)) return
            toast({ title: "Delete failed", description: err?.message ?? "Unable to delete invoice.", variant: "error" })
        } finally {
            setDeletingInvoice(false)
        }
    }

    return (
        <PageContainer>
            <div className="mb-6">
                <BrowserBackButton className="text-sm font-medium text-primary hover:text-primary-dark transition-colors inline-flex items-center gap-1 mb-4">
                    <ArrowLeft className="h-3 w-3" /> Back to Invoices
                </BrowserBackButton>

                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                    <div>
                        <h1 className="text-3xl font-bold tracking-tight text-foreground flex items-center gap-3">
                            {invoice.invoiceNumber}
                            <StatusBadge status={formatInvoiceStatus(invoice.status)}>{invoiceStatusLabel}</StatusBadge>
                        </h1>
                        <p className="text-muted-foreground mt-1 flex items-center gap-1.5 font-medium">
                            {invoice.clientName} • {invoice.projectName}
                            {invoice.jobId ? ` • Job Linked` : ""}
                        </p>
                        <div className="mt-2 flex flex-wrap gap-2">
                            <Button size="sm" variant="outline" className="gap-2 bg-white/40" asChild>
                                <Link href={`/admin/customers/${invoice.customerId}`}>
                                    <ExternalLink className="h-3.5 w-3.5" /> Open Client
                                </Link>
                            </Button>
                            {invoice.jobId ? (
                                <Button size="sm" variant="outline" className="gap-2 bg-white/40" asChild>
                                    <Link href={`/admin/schedule/${invoice.jobId}`}>
                                        <ExternalLink className="h-3.5 w-3.5" /> Open Job
                                    </Link>
                                </Button>
                            ) : null}
                        </div>
                        {invoice.siteName ? (
                            <p className="text-xs text-muted-foreground mt-1">
                                Site: {invoice.siteName}{invoice.siteAddress ? ` • ${invoice.siteAddress}` : ""}
                            </p>
                        ) : null}
                    </div>

                    <div className="flex items-center gap-2">
                        {canManage ? (
                            <Select
                                value={invoice.workflowStageKey ?? invoice.status.toUpperCase().replace(/[-\s]+/g, "_")}
                                onValueChange={async (selectedStageKey) => {
                                    try {
                                        const selectedStage = invoiceStageOptions.find((stage) => stage.key === selectedStageKey) ?? null
                                        const nextStatus = selectedStage?.baseStatus ?? selectedStageKey
                                        const response = await apiPut<any>(`/invoices/${invoice.id}`, {
                                            status: nextStatus,
                                            workflowStageKey: selectedStage?.key,
                                        })
                                        mergeInvoiceData(response.data)
                                        toast({
                                            title: "Workflow stage updated",
                                            description: `Invoice stage changed to ${selectedStage?.label ?? formatInvoiceStatus(nextStatus)}.`,
                                            variant: "success",
                                        })
                                    } catch (err: any) {
                                        toast({ title: "Update failed", description: err?.message ?? "Unable to update invoice stage.", variant: "error" })
                                    }
                                }}
                            >
                                <SelectTrigger className="w-[190px] bg-white/40">
                                    <SelectValue placeholder={invoiceStatusLabel} />
                                </SelectTrigger>
                                <SelectContent>
                                    {invoiceStageOptions.map((stage) => (
                                        <SelectItem key={stage.key} value={stage.key}>
                                            {stage.label}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        ) : null}
                        <Button
                            variant="outline"
                            className="gap-2 bg-white/40"
                            onClick={downloadInvoicePdf}
                        >
                            <Download className="h-4 w-4" /> PDF
                        </Button>
                        <Button
                            variant="outline"
                            className="gap-2 bg-white/40"
                            onClick={() => setShareOptionsOpen(true)}
                            disabled={!canManage}
                        >
                            <Send className="h-4 w-4" /> Share Invoice
                        </Button>
                        {invoice.status !== "Paid" && (
                            <Button
                                className="gap-2"
                                onClick={openPaymentDialog}
                                disabled={!canManage}
                            >
                                <CreditCard className="h-4 w-4" /> Record Payment
                            </Button>
                        )}
                        <Button
                            variant="outline"
                            className="gap-2 bg-white/40 text-destructive hover:text-destructive"
                            onClick={handleDeleteInvoice}
                            disabled={!canManage || deletingInvoice || invoice.status === "Paid"}
                            title={invoice.status === "Paid" ? "Paid invoices cannot be deleted." : undefined}
                        >
                            <Trash2 className="h-4 w-4" /> {deletingInvoice ? "Deleting..." : "Delete"}
                        </Button>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 space-y-6">
                    <div className="bg-white rounded-xl shadow-sm border border-glass-border p-8 min-h-[800px] relative overflow-hidden">
                        <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 rounded-bl-[100px] -z-10" />

                        <div className="flex justify-between items-start mb-12">
                            <div>
                                {tenant?.logoUrl && !logoUnavailable ? (
                                    <img
                                        src={tenant.logoUrl}
                                        alt={`${tenantName} logo`}
                                        className="h-10 max-w-[220px] object-contain mb-4"
                                        onError={() => setLogoUnavailable(true)}
                                    />
                                ) : (
                                    <div className="min-h-10 max-w-[280px] px-3 py-2 bg-black/5 rounded flex items-center justify-center font-semibold text-primary mb-4 border border-black/10 text-sm">{tenantName}</div>
                                )}
                                <h3 className="text-sm font-semibold text-foreground">{tenantName}</h3>
                                <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                                    {tenant?.address ?? ""}
                                    {tenant?.contactEmail ? `\n${tenant.contactEmail}` : ""}
                                    {tenant?.contactPhone ? `\n${tenant.contactPhone}` : ""}
                                </p>
                            </div>
                            <div className="text-right">
                                <h2 className="text-5xl font-light text-primary tracking-tight mb-3">INVOICE</h2>
                                <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-sm text-left inline-grid">
                                    <span className="text-muted-foreground font-medium">Invoice No:</span>
                                    <span className="font-semibold text-right">{invoice.invoiceNumber}</span>
                                    <span className="text-muted-foreground font-medium">Issue Date:</span>
                                    <span className="font-semibold text-right">{new Date(invoice.issueDate).toLocaleDateString("en-GB")}</span>
                                    <span className="text-muted-foreground font-medium">Due Date:</span>
                                    <span className="font-semibold text-right">{new Date(invoice.dueDate).toLocaleDateString("en-GB")}</span>
                                </div>
                            </div>
                        </div>

                        <div className="mb-12">
                            <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-2">Billed To</h3>
                            <p className="text-sm font-semibold">{invoice.clientName}</p>
                            <p className="text-sm text-muted-foreground">{invoice.clientEmail}</p>
                            {invoice.clientAddress && <p className="text-sm text-muted-foreground">{invoice.clientAddress}</p>}
                            {invoice.siteName && (
                                <p className="text-sm text-muted-foreground mt-2">
                                    Site: {invoice.siteName}{invoice.siteAddress ? ` • ${invoice.siteAddress}` : ""}
                                </p>
                            )}
                        </div>

                        <div className="mb-12">
                            <div className="w-full">
                                <div className="grid grid-cols-12 pb-2 border-b-2 border-primary/20 text-xs font-bold uppercase tracking-wider text-primary-dark">
                                    <div className="col-span-7">Description</div>
                                    <div className="col-span-2 text-center">Qty</div>
                                    <div className="col-span-3 text-right">Amount</div>
                                </div>

                                <div className="py-2 space-y-2 min-h-[200px]">
                                    {invoice.lineItems.map(item => (
                                        <div key={item.id} className="grid grid-cols-12 py-2 border-b border-black/5 text-sm">
                                            <div className="col-span-7 font-medium text-foreground">{item.description}</div>
                                            <div className="col-span-2 text-center text-muted-foreground">{item.quantity}</div>
                                            <div className="col-span-3 text-right font-semibold">£{(item.total ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
                                        </div>
                                    ))}
                                </div>

                                <div className="mt-4 flex justify-end">
                                    <div className="w-1/2 min-w-[250px] space-y-2">
                                        <div className="flex justify-between text-sm text-muted-foreground py-1">
                                            <span>Subtotal</span>
                                            <span>£{invoice.subtotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                                        </div>
                                        <div className="flex justify-between text-sm text-muted-foreground py-1 border-b border-black/10 pb-2">
                                            <span>VAT</span>
                                            <span>£{invoice.taxTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                                        </div>
                                        <div className="flex justify-between text-lg font-bold text-foreground py-2">
                                            <span>Total</span>
                                            <span>£{invoice.total.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                                        </div>
                                        <div className="flex justify-between text-sm text-muted-foreground py-1 border-b border-black/10 pb-2">
                                            <span>Amount Paid</span>
                                            <span className="text-success">-£{invoice.amountPaid.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                                        </div>
                                        <div className="flex justify-between text-xl font-bold text-primary pt-2">
                                            <span>Balance Due</span>
                                            <span>£{invoice.balanceDue.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {invoice.status === "Paid" && (
                            <div className="absolute top-[40%] left-1/2 -translate-x-1/2 -translate-y-1/2 rotate-[-20deg] border-4 border-[#0f766e]/70 text-[#0f766e]/70 text-6xl font-bold p-4 rounded-xl opacity-35 pointer-events-none uppercase tracking-widest">
                                PAID IN FULL
                            </div>
                        )}
                    </div>
                </div>

                <div className="space-y-6">
                    <GlassCard>
                        <GlassCardHeader>
                            <GlassCardTitle>Payment Status</GlassCardTitle>
                        </GlassCardHeader>
                        <GlassCardContent>
                            {invoice.status === "Paid" ? (
                                <div className="flex flex-col items-center justify-center text-center p-4 bg-emerald-50 border border-emerald-300 rounded-lg">
                                    <CheckCircle className="h-8 w-8 text-emerald-700 mb-2" />
                                    <p className="font-semibold text-emerald-800">Invoice Settled</p>
                                    <p className="text-xs text-emerald-700 mt-1">Full payment received.</p>
                                </div>
                            ) : invoice.status === "Overdue" ? (
                                <div className="flex flex-col items-center justify-center text-center p-4 bg-destructive/5 border border-destructive/20 rounded-lg">
                                    <AlertTriangle className="h-8 w-8 text-destructive mb-2" />
                                    <p className="font-semibold text-destructive">Payment Overdue</p>
                                    <p className="text-xs text-muted-foreground mt-1 px-2">This invoice is past its due date.</p>
                                </div>
                            ) : (
                                <div className="flex flex-col justify-center p-4 bg-black/5 border border-glass-border rounded-lg">
                                    <p className="text-sm font-medium mb-2">Awaiting Payment</p>
                                    <div className="w-full bg-black/10 h-2 rounded-full overflow-hidden mb-2">
                                        <div className="bg-primary h-full transition-all" style={{ width: `${invoice.total > 0 ? (invoice.amountPaid / invoice.total) * 100 : 0}%` }} />
                                    </div>
                                    <div className="flex justify-between text-xs text-muted-foreground">
                                        <span>£{invoice.amountPaid.toLocaleString()} paid</span>
                                        <span>£{invoice.total.toLocaleString()} total</span>
                                    </div>
                                </div>
                            )}
                        </GlassCardContent>
                    </GlassCard>

                    <GlassCard>
                        <GlassCardHeader>
                            <GlassCardTitle>Payment History</GlassCardTitle>
                        </GlassCardHeader>
                        <GlassCardContent>
                            {!invoice.payments || invoice.payments.length === 0 ? (
                                <p className="text-sm text-muted-foreground">No payments recorded yet.</p>
                            ) : (
                                <div className="space-y-2">
                                    {invoice.payments.map((payment) => (
                                        <div key={payment.id} className="rounded-lg border border-glass-border bg-white/50 p-3">
                                            <div className="flex items-center justify-between gap-3">
                                                <p className="text-sm font-semibold text-foreground">
                                                    £{Number(payment.amount ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                                </p>
                                                <p className="text-xs text-muted-foreground">
                                                    {payment.paymentDate ? new Date(payment.paymentDate).toLocaleDateString("en-GB") : "—"}
                                                </p>
                                            </div>
                                            <p className="mt-1 text-xs text-muted-foreground">
                                                {[payment.method, payment.reference].filter(Boolean).join(" • ") || "Manual payment"}
                                            </p>
                                            {payment.notes ? <p className="mt-1 text-xs text-muted-foreground">{payment.notes}</p> : null}
                                            {canManage ? (
                                                <div className="mt-3 flex justify-end gap-2">
                                                    <Button
                                                        type="button"
                                                        size="sm"
                                                        variant="outline"
                                                        className="h-8 gap-1 bg-white/60"
                                                        onClick={() => openEditPaymentDialog(payment)}
                                                    >
                                                        <Pencil className="h-3.5 w-3.5" /> Edit
                                                    </Button>
                                                    <Button
                                                        type="button"
                                                        size="sm"
                                                        variant="outline"
                                                        className="h-8 gap-1 bg-white/60 text-destructive hover:text-destructive"
                                                        onClick={() => handleDeletePayment(payment.id)}
                                                    >
                                                        <Trash2 className="h-3.5 w-3.5" /> Delete
                                                    </Button>
                                                </div>
                                            ) : null}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </GlassCardContent>
                    </GlassCard>
                </div>
            </div>
            <GlassModal
                open={shareOptionsOpen}
                onOpenChange={setShareOptionsOpen}
                title="Share Invoice"
                description="Choose how you want to share this invoice with the client."
                footer={
                    <div className="flex justify-end gap-2 w-full">
                        <Button variant="outline" onClick={() => setShareOptionsOpen(false)}>Close</Button>
                    </div>
                }
            >
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <button
                        type="button"
                        className="rounded-2xl border border-glass-border bg-white/60 p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:bg-white hover:shadow-md"
                        onClick={openShareEmailDialog}
                        disabled={!canManage}
                    >
                        <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                            <Mail className="h-5 w-5" />
                        </div>
                        <p className="font-semibold text-foreground">Send email to client</p>
                        <p className="mt-1 text-sm text-muted-foreground">
                            {invoice.clientEmail ? `Prefilled with ${invoice.clientEmail}.` : "Enter the client email before sending."}
                        </p>
                    </button>
                    <div className="rounded-2xl border border-glass-border bg-white/60 p-4 shadow-sm">
                        <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-black/5 text-foreground">
                            <Link2 className="h-5 w-5" />
                        </div>
                        <p className="font-semibold text-foreground">Download PDF or copy link</p>
                        <p className="mt-1 text-sm text-muted-foreground">Share manually without sending an email from Pipstack.</p>
                        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                            <Button type="button" variant="outline" className="gap-2 bg-white/60" onClick={downloadInvoicePdf} disabled={shareLoading !== null}>
                                <Download className="h-4 w-4" />
                                {shareLoading === "download" ? "Downloading..." : "Download PDF"}
                            </Button>
                            <Button type="button" variant="outline" className="gap-2 bg-white/60" onClick={handleCopyInvoiceLink} disabled={!canManage || shareLoading !== null}>
                                <Copy className="h-4 w-4" />
                                {shareLoading === "copy" ? "Copying..." : "Copy Link"}
                            </Button>
                        </div>
                    </div>
                </div>
            </GlassModal>
            <GlassModal
                open={shareEmailOpen}
                onOpenChange={setShareEmailOpen}
                title="Send Invoice Email"
                description="Review the recipient and email body before sending."
                footer={
                    <div className="flex justify-end gap-2 w-full">
                        <Button variant="outline" onClick={() => setShareEmailOpen(false)}>Cancel</Button>
                        <Button className="gap-2" onClick={handleSendInvoiceEmail} disabled={!canManage || shareLoading !== null}>
                            <Send className="h-4 w-4" />
                            {shareLoading === "email" ? "Sending..." : "Send Email"}
                        </Button>
                    </div>
                }
            >
                <div className="space-y-4">
                    <div className="space-y-2">
                        <Label required>Client Email</Label>
                        <Input
                            type="email"
                            className="bg-white/60"
                            placeholder="client@example.com"
                            value={shareEmailForm.email}
                            onChange={(e) => setShareEmailForm((prev) => ({ ...prev, email: e.target.value }))}
                        />
                    </div>
                    <div className="space-y-2">
                        <Label optional>Email Body</Label>
                        <Textarea
                            rows={6}
                            className="bg-white/60"
                            value={shareEmailForm.message}
                            onChange={(e) => setShareEmailForm((prev) => ({ ...prev, message: e.target.value }))}
                        />
                        <p className="text-xs text-muted-foreground">The secure invoice portal link is added automatically below this message.</p>
                    </div>
                    <label className="flex items-start gap-3 rounded-xl border border-glass-border bg-white/40 p-3 text-sm">
                        <Checkbox
                            checked={shareEmailForm.markAsSent}
                            onCheckedChange={(checked) => setShareEmailForm((prev) => ({ ...prev, markAsSent: Boolean(checked) }))}
                        />
                        <span>
                            <span className="block font-medium text-foreground">Mark invoice status as sent</span>
                            <span className="block text-xs text-muted-foreground">Enabled by default. Turn this off if you only want to email without changing status.</span>
                        </span>
                    </label>
                </div>
            </GlassModal>
            <GlassModal
                open={paymentOpen}
                onOpenChange={(open) => {
                    setPaymentOpen(open)
                    if (!open) setEditingPaymentId(null)
                }}
                title={editingPaymentId ? "Edit Payment" : "Record Payment"}
                description={editingPaymentId ? "Update this payment and recalculate the invoice balance." : "Record a full or partial invoice payment."}
                footer={
                    <div className="flex justify-end gap-2 w-full">
                        <Button variant="outline" onClick={() => setPaymentOpen(false)}>Cancel</Button>
                        <Button className="gap-2" onClick={handleSavePayment} disabled={!canManage || paymentSaving}>
                            <CreditCard className="h-4 w-4" />
                            {paymentSaving ? "Saving..." : editingPaymentId ? "Save Payment" : "Record Payment"}
                        </Button>
                    </div>
                }
            >
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                        <Label required>Amount</Label>
                        <Input
                            type="number"
                            min="0"
                            step="0.01"
                            className="bg-white/60"
                            value={paymentForm.amount}
                            onChange={(e) => setPaymentForm((prev) => ({ ...prev, amount: e.target.value }))}
                        />
                        <p className="text-xs text-muted-foreground">
                            Available to allocate: £{(invoice.balanceDue + Number(invoice.payments?.find((payment) => payment.id === editingPaymentId)?.amount ?? 0)).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </p>
                    </div>
                    <div className="space-y-2">
                        <Label required>Payment Date</Label>
                        <Input
                            type="date"
                            className="bg-white/60"
                            value={paymentForm.paymentDate}
                            onChange={(e) => setPaymentForm((prev) => ({ ...prev, paymentDate: e.target.value }))}
                        />
                    </div>
                    <div className="space-y-2">
                        <Label optional>Method</Label>
                        <Input
                            className="bg-white/60"
                            value={paymentForm.method}
                            onChange={(e) => setPaymentForm((prev) => ({ ...prev, method: e.target.value }))}
                        />
                    </div>
                    <div className="space-y-2">
                        <Label optional>Reference</Label>
                        <Input
                            className="bg-white/60"
                            placeholder="Bank ref, cheque no, Stripe id..."
                            value={paymentForm.reference}
                            onChange={(e) => setPaymentForm((prev) => ({ ...prev, reference: e.target.value }))}
                        />
                    </div>
                    <div className="space-y-2 md:col-span-2">
                        <Label optional>Notes</Label>
                        <Textarea
                            rows={3}
                            className="bg-white/60"
                            value={paymentForm.notes}
                            onChange={(e) => setPaymentForm((prev) => ({ ...prev, notes: e.target.value }))}
                        />
                    </div>
                    {paymentError ? <p className="text-xs text-destructive md:col-span-2">{paymentError}</p> : null}
                </div>
            </GlassModal>
            <ErrorToast error={error} onClear={() => setError(null)} />
        </PageContainer>
    )
}

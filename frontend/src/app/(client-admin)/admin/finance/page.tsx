"use client"

import { useEffect, useMemo, useState } from "react"
import { PageContainer } from "@/components/layout/PageContainer"
import { GlassCard, GlassCardContent, GlassCardHeader, GlassCardTitle } from "@/components/glass/GlassCard"
import { GlassModal } from "@/components/glass/GlassModal"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { StatusBadge } from "@/components/shared/StatusBadge"
import { StatCard } from "@/components/shared/StatCard"
import { Search, Plus, MoreHorizontal, FileText, Download, Send, CreditCard, XCircle, CheckCircle, RefreshCcw, AlertTriangle } from "lucide-react"
import DatePicker from "react-datepicker"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { formatDistanceToNow, isPast, startOfMonth } from "date-fns"
import { useRouter, useSearchParams } from "next/navigation"
import { apiDelete, apiGet, apiPost, downloadFile } from "@/lib/api"
import { ErrorToast } from "@/components/shared/ErrorToast"
import { DataPagination, useClientPagination } from "@/components/shared/DataPagination"
import { RecordNumberBadge } from "@/components/shared/RecordNumberBadge"
import { useToast } from "@/components/ui/toast"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { getModulePermissions } from "@/lib/permission-ui"
import { formatInvoiceStatus, formatSplitInvoiceStatus } from "@/lib/status"
import { CustomerSiteOption, fetchCustomerSites, formatCustomerSiteAddress, formatCustomerSiteLabel } from "@/lib/customer-sites"
import { useTenantFeatures } from "@/components/layout/TenantFeaturesContext"
import { useTenantWorkflowConfig } from "@/components/layout/TenantWorkflowContext"
import { getWorkflowStatusLabel } from "@/lib/workflows"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useUrlSyncedTab } from "@/components/shared/useUrlSyncedTab"

type Invoice = {
    id: string
    invoiceNumber: string
    jobId?: string
    siteId?: string
    siteName?: string
    siteAddress?: string
    sourceQuoteId?: string
    clientId: string
    clientName: string
    clientEmail?: string
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
    paidAt?: string | null
    accountingProvider?: string | null
    accountingSyncStatus?: string | null
}

type SplitBillingRow = {
    id: string
    jobId?: string | null
    jobTitle?: string | null
    customerId?: string | null
    customerName?: string | null
    siteId?: string | null
    siteName?: string | null
    siteAddress?: string | null
    description?: string | null
    valueExVat: number
    status: string
    invoiceDate?: string | null
    linkedInvoiceId?: string | null
    linkedInvoiceNumber?: string | null
    linkedInvoiceStatus?: string | null
    createdAt?: string
}

const SHOW_SPLIT_BILLING = false

export default function InvoicesPage() {
    const router = useRouter()
    const searchParams = useSearchParams()
    const { toast } = useToast()
    const { canView, canManage } = getModulePermissions("financials.view", "financials.manage")
    const { sites: sitesEnabled, complianceWorkflows } = useTenantFeatures()
    const workflowConfig = useTenantWorkflowConfig()
    const financeTabs = useMemo(() => SHOW_SPLIT_BILLING ? ["invoices", "split-billing"] : ["invoices"], [])
    const [activeTab, setActiveTab] = useUrlSyncedTab({
        defaultTab: "invoices",
        allowedTabs: financeTabs,
    })
    const [searchQuery, setSearchQuery] = useState("")
    const [invoices, setInvoices] = useState<Invoice[]>([])
    const [splitRegister, setSplitRegister] = useState<SplitBillingRow[]>([])
    const [customers, setCustomers] = useState<any[]>([])
    const [customerSites, setCustomerSites] = useState<CustomerSiteOption[]>([])
    const [selectedCustomerId, setSelectedCustomerId] = useState("__all__")
    const [selectedSiteId, setSelectedSiteId] = useState("__all__")
    const [filterSites, setFilterSites] = useState<CustomerSiteOption[]>([])
    const [error, setError] = useState<string | null>(null)
    const [isCreateOpen, setIsCreateOpen] = useState(false)
    const [deleteTarget, setDeleteTarget] = useState<Invoice | null>(null)
    const [creating, setCreating] = useState(false)
    const [createAction, setCreateAction] = useState<"CREATE" | "CREATE_SEND" | null>(null)
    const [creatingSplitInvoiceId, setCreatingSplitInvoiceId] = useState<string | null>(null)
    const [syncingAccounting, setSyncingAccounting] = useState(false)
    const [accountingProvider, setAccountingProvider] = useState<string>("")
    const [accountingConnected, setAccountingConnected] = useState(false)
    const [formErrors, setFormErrors] = useState<{ title?: string; customerId?: string; dueDate?: string; lineItems?: string }>({})
    const [itemErrors, setItemErrors] = useState<Record<string, { description?: string; quantity?: string; unitPrice?: string }>>({})
    const [form, setForm] = useState<{
        title: string
        customerId: string
        siteId: string
        dueDate: Date | null
        vatNumber: string
        lineItems: Array<{ id: string; description: string; quantity: number; unitPrice: number; taxRate: number }>
    }>({
        title: "",
        customerId: "",
        siteId: "",
        dueDate: null,
        vatNumber: "",
        lineItems: [{ id: "1", description: "", quantity: 1, unitPrice: 0, taxRate: 20 }]
    })

    useEffect(() => {
        if (searchParams.get("create") === "invoice" && canManage) {
            const customerId = searchParams.get("customerId") ?? ""
            if (customerId) {
                setForm((prev) => ({ ...prev, customerId, siteId: "" }))
            }
            setIsCreateOpen(true)
        }
    }, [canManage, searchParams])

    useEffect(() => {
        loadInvoices()
    }, [])

    const loadInvoices = async () => {
        try {
            const [invoiceRes, customerRes, tenantRes, integrationRes, splitRegisterRes] = await Promise.all([
                apiGet<any[]>("/invoices"),
                apiGet<any[]>("/customers"),
                apiGet<any>("/settings/tenant"),
                apiGet<any[]>("/integrations"),
                SHOW_SPLIT_BILLING
                    ? apiGet<any[]>("/invoices/split-register").catch(() => ({ data: [] }))
                    : Promise.resolve({ data: [] as any[] })
            ])
            const customerList = Array.isArray(customerRes.data) ? customerRes.data : []
            setCustomers(customerList)
            const selectedAccountingProvider = String(tenantRes.data?.accountingProvider ?? "").toUpperCase()
            setAccountingProvider(selectedAccountingProvider)
            const integrations = Array.isArray(integrationRes.data) ? integrationRes.data : []
            const accountingIntegration = integrations.find(
                (integration) => String(integration.provider ?? "").toUpperCase() === selectedAccountingProvider
            )
            setAccountingConnected(Boolean(selectedAccountingProvider && accountingIntegration?.status === "CONNECTED"))
            const customerMap = new Map(customerList.map((c) => [c.id, c]))
            const mapped = invoiceRes.data.map((invoice) => {
                const customer = customerMap.get(invoice.customerId)
                const statusRaw = (invoice.status ?? "DRAFT").toString()
                const status = statusRaw.charAt(0).toUpperCase() + statusRaw.slice(1).toLowerCase()
                const total = Number(invoice.total ?? 0)
                const amountPaid = Number(invoice.amountPaid ?? (statusRaw.toUpperCase() === "PAID" ? total : 0))
                const balanceDue = Number(invoice.balanceDue ?? Math.max(0, total - amountPaid))
                return {
                    id: invoice.id,
                    invoiceNumber: invoice.invoiceNumber ?? "INV-PENDING",
                    jobId: invoice.jobId ?? undefined,
                    siteId: invoice.siteId ?? undefined,
                    siteName: invoice.siteName ?? undefined,
                    siteAddress: invoice.siteAddress ?? undefined,
                    sourceQuoteId: invoice.sourceQuoteId ?? undefined,
                    clientId: invoice.customerId ?? "",
                    clientName: customer?.name ?? "Customer",
                    clientEmail: customer?.email ?? "",
                    projectName: invoice.title ?? "Invoice",
                    issueDate: invoice.createdAt ?? new Date().toISOString(),
                    dueDate: invoice.dueDate ?? invoice.createdAt ?? new Date().toISOString(),
                    subtotal: Number(invoice.subTotal ?? 0),
                    taxTotal: Number(invoice.vatTotal ?? 0),
                    total,
                    status,
                    workflowStageKey: invoice.workflowStageKey ?? undefined,
                    balanceDue,
                    amountPaid,
                    paidAt: invoice.paidAt ?? null,
                    accountingProvider: invoice.accountingProvider ?? null,
                    accountingSyncStatus: invoice.accountingSyncStatus ?? null
                } as Invoice
            })
            setInvoices(mapped)
            setSplitRegister(
                (Array.isArray(splitRegisterRes.data) ? splitRegisterRes.data : []).map((entry) => ({
                    id: entry.id,
                    jobId: entry.jobId ?? entry.job?.id ?? null,
                    jobTitle: entry.jobTitle ?? entry.job?.title ?? null,
                    customerId: entry.customerId ?? null,
                    customerName: entry.customerName ?? null,
                    siteId: entry.siteId ?? null,
                    siteName: entry.siteName ?? null,
                    siteAddress: entry.siteAddress ?? null,
                    description: entry.description ?? null,
                    valueExVat: Number(entry.valueExVat ?? 0),
                    status: String(entry.status ?? "TO_SEND"),
                    invoiceDate: entry.invoiceDate ?? null,
                    linkedInvoiceId: entry.linkedInvoiceId ?? null,
                    linkedInvoiceNumber: entry.linkedInvoiceNumber ?? null,
                    linkedInvoiceStatus: entry.linkedInvoiceStatus ?? null,
                    createdAt: entry.createdAt ?? undefined,
                }))
            )
        } catch (err: any) {
            setError(err?.message ?? "Failed to load invoices")
        }
    }

    useEffect(() => {
        const loadSites = async () => {
            if (!sitesEnabled || !form.customerId) {
                setCustomerSites([])
                setForm((prev) => ({ ...prev, siteId: "" }))
                return
            }
            try {
                const sites = await fetchCustomerSites(form.customerId)
                setCustomerSites(sites)
                setForm((prev) => ({
                    ...prev,
                    siteId: sites.some((site) => site.id === prev.siteId) ? prev.siteId : "",
                }))
            } catch (err: any) {
                setError(err?.message ?? "Failed to load customer sites")
                setCustomerSites([])
                setForm((prev) => ({ ...prev, siteId: "" }))
            }
        }
        void loadSites()
    }, [form.customerId, sitesEnabled])

    useEffect(() => {
        const loadFilterSites = async () => {
            if (!sitesEnabled || selectedCustomerId === "__all__") {
                setFilterSites([])
                setSelectedSiteId("__all__")
                return
            }
            try {
                const sites = await fetchCustomerSites(selectedCustomerId)
                setFilterSites(sites)
                setSelectedSiteId((prev) => (prev === "__all__" || sites.some((site) => site.id === prev) ? prev : "__all__"))
            } catch (err: any) {
                setError(err?.message ?? "Failed to load customer sites")
                setFilterSites([])
                setSelectedSiteId("__all__")
            }
        }
        void loadFilterSites()
    }, [selectedCustomerId, sitesEnabled])

    const customerOptions = useMemo(() => customers.map((c) => ({ value: c.id, label: c.name })), [customers])

    const filteredInvoices = useMemo(() => {
        const query = searchQuery.trim().toLowerCase()
        return invoices.filter((invoice) => {
            if (selectedCustomerId !== "__all__" && invoice.clientId !== selectedCustomerId) return false
            if (selectedSiteId !== "__all__" && invoice.siteId !== selectedSiteId) return false
            if (!query) return true
            const workflowStatusLabel = getWorkflowStatusLabel("invoices", invoice.status, invoice.workflowStageKey, workflowConfig, complianceWorkflows)
            return (
                invoice.clientName.toLowerCase().includes(query) ||
                invoice.invoiceNumber.toLowerCase().includes(query) ||
                invoice.projectName.toLowerCase().includes(query) ||
                String(invoice.siteName ?? "").toLowerCase().includes(query) ||
                String(invoice.siteAddress ?? "").toLowerCase().includes(query) ||
                formatInvoiceStatus(invoice.status).toLowerCase().includes(query) ||
                workflowStatusLabel.toLowerCase().includes(query)
            )
        })
    }, [invoices, searchQuery, selectedCustomerId, selectedSiteId, workflowConfig, complianceWorkflows])

    const filteredSplitRegister = useMemo(() => {
        const query = searchQuery.trim().toLowerCase()
        return splitRegister.filter((entry) => {
            if (selectedCustomerId !== "__all__" && entry.customerId !== selectedCustomerId) return false
            if (selectedSiteId !== "__all__" && entry.siteId !== selectedSiteId) return false
            if (!query) return true
            return (
                String(entry.customerName ?? "").toLowerCase().includes(query) ||
                String(entry.jobTitle ?? "").toLowerCase().includes(query) ||
                String(entry.description ?? "").toLowerCase().includes(query) ||
                String(entry.siteName ?? "").toLowerCase().includes(query) ||
                String(entry.siteAddress ?? "").toLowerCase().includes(query) ||
                formatSplitInvoiceStatus(entry.status).toLowerCase().includes(query) ||
                String(entry.linkedInvoiceNumber ?? "").toLowerCase().includes(query)
            )
        })
    }, [splitRegister, searchQuery, selectedCustomerId, selectedSiteId])
    const invoicePagination = useClientPagination(filteredInvoices)
    const splitRegisterPagination = useClientPagination(filteredSplitRegister)

    const getStatusIcon = (status: string) => {
        switch (status) {
            case "Draft": return <FileText className="h-3.5 w-3.5" />
            case "Sent": return <Send className="h-3.5 w-3.5" />
            case "Viewed": return <CheckCircle className="h-3.5 w-3.5" />
            case "Partially Paid": return <CreditCard className="h-3.5 w-3.5" />
            case "Paid": return <CheckCircle className="h-3.5 w-3.5" />
            case "Overdue": return <AlertTriangle className="h-3.5 w-3.5" />
            default: return <FileText className="h-3.5 w-3.5" />
        }
    }

    const getSyncState = (syncStatus?: string | null) => {
        const value = String(syncStatus ?? "").toUpperCase()
        if (value === "SYNCED") return { label: "Synced", variant: "success" as const }
        if (value === "FAILED") return { label: "Failed", variant: "destructive" as const }
        if (value === "PENDING") return { label: "Pending", variant: "warning" as const }
        return { label: "Not Synced", variant: "secondary" as const }
    }

    const totalOutstanding = invoices.filter((inv) => inv.status !== "Paid").reduce((acc, inv) => acc + inv.balanceDue, 0)
    const totalOverdue = invoices.filter(i => i.status === "Overdue").reduce((acc, inv) => acc + inv.balanceDue, 0)
    const paidThisMonth = invoices
        .filter((inv) => inv.status === "Paid" && inv.paidAt && new Date(inv.paidAt) >= startOfMonth(new Date()))
        .reduce((acc, inv) => acc + inv.total, 0)
    const splitToSendValue = splitRegister
        .filter((entry) => String(entry.status).toUpperCase() === "TO_SEND")
        .reduce((acc, entry) => acc + Number(entry.valueExVat ?? 0), 0)
    const splitInvoicedValue = splitRegister
        .filter((entry) => String(entry.status).toUpperCase() === "INVOICED")
        .reduce((acc, entry) => acc + Number(entry.valueExVat ?? 0), 0)
    const splitPaidValue = splitRegister
        .filter((entry) => String(entry.status).toUpperCase() === "PAID")
        .reduce((acc, entry) => acc + Number(entry.valueExVat ?? 0), 0)
    const splitUnlinkedCount = splitRegister.filter((entry) => !entry.linkedInvoiceId).length
    const accountingLabel =
        accountingProvider === "XERO" ? "Xero" : accountingProvider === "QUICKBOOKS" ? "QuickBooks" : "Accounting"

    const resetForm = () => {
        setForm({
            title: "",
            customerId: "",
            siteId: "",
            dueDate: null,
            vatNumber: "",
            lineItems: [{ id: "1", description: "", quantity: 1, unitPrice: 0, taxRate: 20 }]
        })
        setFormErrors({})
        setItemErrors({})
    }

    const addLineItem = () => {
        setForm((prev) => ({
            ...prev,
            lineItems: [...prev.lineItems, { id: Math.random().toString(), description: "", quantity: 1, unitPrice: 0, taxRate: 20 }]
        }))
    }

    const removeLineItem = (id: string) => {
        setForm((prev) => ({
            ...prev,
            lineItems: prev.lineItems.length > 1 ? prev.lineItems.filter((item) => item.id !== id) : prev.lineItems
        }))
    }

    const updateLineItem = (id: string, field: "description" | "quantity" | "unitPrice" | "taxRate", value: any) => {
        setForm((prev) => ({
            ...prev,
            lineItems: prev.lineItems.map((item) => (item.id === id ? { ...item, [field]: value } : item))
        }))
    }

    const validateForm = () => {
        const nextErrors: { title?: string; customerId?: string; dueDate?: string; lineItems?: string } = {}
        const nextItemErrors: Record<string, { description?: string; quantity?: string; unitPrice?: string }> = {}

        if (!form.title.trim()) nextErrors.title = "Invoice title is required."
        if (!form.customerId) nextErrors.customerId = "Select a client."
        if (!form.dueDate) nextErrors.dueDate = "Due date is required."
        if (form.lineItems.length === 0) nextErrors.lineItems = "Add at least one line item."

        form.lineItems.forEach((item) => {
            const itemError: { description?: string; quantity?: string; unitPrice?: string } = {}
            if (!item.description.trim()) itemError.description = "Description required."
            if (!item.quantity || item.quantity <= 0) itemError.quantity = "Qty must be > 0."
            if (item.unitPrice < 0) itemError.unitPrice = "Price must be >= 0."
            if (Object.keys(itemError).length > 0) {
                nextItemErrors[item.id] = itemError
            }
        })

        setFormErrors(nextErrors)
        setItemErrors(nextItemErrors)
        return Object.keys(nextErrors).length === 0 && Object.keys(nextItemErrors).length === 0
    }

    const handleCreateInvoice = async (sendNow = false) => {
        if (!canManage) {
            toast({ title: "Insufficient permissions", description: "You can view invoices but cannot create them.", variant: "error" })
            return
        }
        if (!validateForm()) return
        setCreateAction(sendNow ? "CREATE_SEND" : "CREATE")
        setCreating(true)
        try {
            const payload = {
                title: form.title,
                customerId: form.customerId,
                siteId: form.siteId || undefined,
                dueDate: form.dueDate ? form.dueDate.toISOString().split("T")[0] : undefined,
                vatNumber: form.vatNumber || undefined,
                lineItems: form.lineItems.map((item) => ({
                    description: item.description,
                    quantity: Number(item.quantity),
                    unitPrice: Number(item.unitPrice),
                    vatRate: Number(item.taxRate)
                }))
            }
            const createdRes = await apiPost<any>("/invoices", payload)
            const invoiceId = createdRes?.data?.id
            if (invoiceId && sendNow) {
                await apiPost(`/invoices/${invoiceId}/send`)
            }
            toast({
                title: sendNow ? "Invoice created & sent" : "Invoice created",
                description: sendNow
                    ? "Invoice has been created and sent to the customer."
                    : "The invoice has been saved.",
                variant: "success"
            })
            setIsCreateOpen(false)
            resetForm()
            await loadInvoices()
        } catch (err: any) {
            toast({ title: "Failed to create invoice", description: err?.message ?? "Please try again.", variant: "error" })
        } finally {
            setCreating(false)
            setCreateAction(null)
        }
    }

    const handleSyncAccounting = async () => {
        if (!canManage) {
            toast({ title: "Insufficient permissions", description: "You can view invoices but cannot sync accounting.", variant: "error" })
            return
        }
        if (!accountingProvider || !accountingConnected) {
            toast({
                title: "Accounting not connected",
                description: "Connect QuickBooks or Xero in Settings → Integrations first.",
                variant: "error"
            })
            return
        }
        setSyncingAccounting(true)
        try {
            const res = await apiPost<any>("/invoices/sync-accounting", {})
            toast({
                title: "Accounting sync queued",
                description: "Sync is running in background. Refresh in a few seconds to see updated statuses.",
                variant: "success"
            })
        } catch (err: any) {
            toast({ title: "Sync failed", description: err?.message ?? "Unable to sync accounting statuses.", variant: "error" })
        } finally {
            setSyncingAccounting(false)
        }
    }

    const handleCreateInvoiceFromSplit = async (entry: SplitBillingRow, sendNow = false) => {
        if (!canManage) {
            toast({ title: "Insufficient permissions", description: "You can view invoices but cannot create them.", variant: "error" })
            return
        }
        setCreatingSplitInvoiceId(entry.id)
        try {
            const response = await apiPost<any>(`/invoices/from-split/${entry.id}`, {
                sendNow,
            })
            const createdInvoiceId = response?.data?.id
            toast({
                title: sendNow ? "Invoice created & sent" : "Invoice created",
                description: sendNow
                    ? "Split billing line has been converted and sent."
                    : "Split billing line has been converted into a draft invoice.",
                variant: "success"
            })
            await loadInvoices()
            if (createdInvoiceId) {
                router.push(`/admin/finance/${createdInvoiceId}`)
            }
        } catch (err: any) {
            toast({
                title: "Split invoice failed",
                description: err?.message ?? "Unable to create invoice from split billing line.",
                variant: "error"
            })
        } finally {
            setCreatingSplitInvoiceId(null)
        }
    }

    return (
        <PageContainer>
            {!canView ? (
                <GlassCard>
                    <GlassCardHeader>
                        <GlassCardTitle>Invoices</GlassCardTitle>
                    </GlassCardHeader>
                    <GlassCardContent>You do not have access to view invoices.</GlassCardContent>
                </GlassCard>
            ) : (
            <>
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-foreground">Invoicing & Financials</h1>
                    <p className="text-muted-foreground mt-1 text-sm">Generate invoices, track payments, and manage external billing.</p>
                    <p className="text-xs text-muted-foreground mt-1">
                        Accounting provider:{" "}
                        <span className="font-medium text-foreground">
                            {accountingProvider ? accountingLabel : "Not configured"}
                        </span>
                    </p>
                </div>

                <div className="flex items-center gap-2">
                    <Button
                        variant="outline"
                        className="gap-2 bg-white/40"
                        onClick={handleSyncAccounting}
                        disabled={!accountingProvider || !accountingConnected || syncingAccounting || !canManage}
                    >
                        <RefreshCcw className={`h-4 w-4 ${syncingAccounting ? "animate-spin" : ""}`} />
                        Sync {accountingLabel}
                    </Button>
                    <Button
                        className="gap-2"
                        onClick={() => {
                            if (!canManage) {
                                toast({
                                    title: "Insufficient permissions",
                                    description: "You can view invoices but cannot create them.",
                                    variant: "error"
                                })
                                return
                            }
                            setIsCreateOpen(true)
                        }}
                        disabled={!canManage}
                    >
                        <Plus className="h-4 w-4" /> Create Invoice
                    </Button>
                </div>
            </div>

            {SHOW_SPLIT_BILLING ? (
                <Tabs value={activeTab} onValueChange={setActiveTab} className="mb-6">
                    <TabsList variant="line" className="justify-start bg-white/50 rounded-xl p-1">
                        <TabsTrigger value="invoices">Invoices</TabsTrigger>
                        <TabsTrigger value="split-billing">Split Billing</TabsTrigger>
                    </TabsList>
                </Tabs>
            ) : null}

            {activeTab === "split-billing" ? (
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 mb-6">
                    <StatCard
                        title="To Send"
                        value={`£${splitToSendValue.toLocaleString(undefined, { minimumFractionDigits: 2 })}`}
                        icon={<FileText className="h-4 w-4" />}
                        description="Split lines not yet invoiced"
                    />
                    <StatCard
                        title="Invoiced"
                        value={`£${splitInvoicedValue.toLocaleString(undefined, { minimumFractionDigits: 2 })}`}
                        icon={<Send className="h-4 w-4" />}
                        description="Commercial value already billed"
                    />
                    <StatCard
                        title="Paid"
                        value={`£${splitPaidValue.toLocaleString(undefined, { minimumFractionDigits: 2 })}`}
                        icon={<CheckCircle className="h-4 w-4 text-success" />}
                        description="Split value fully received"
                    />
                    <StatCard
                        title="Unlinked Lines"
                        value={String(splitUnlinkedCount)}
                        icon={<AlertTriangle className="h-4 w-4 text-warning" />}
                        description="Still need invoice creation"
                    />
                </div>
            ) : (
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 mb-6">
                    <StatCard
                        title="Total Outstanding"
                        value={`£${totalOutstanding.toLocaleString(undefined, { minimumFractionDigits: 2 })}`}
                        icon={<CreditCard className="h-4 w-4" />}
                        description="Awaiting payment"
                    />
                    <StatCard
                        title="Overdue Balance"
                        value={`£${totalOverdue.toLocaleString(undefined, { minimumFractionDigits: 2 })}`}
                        icon={<AlertTriangle className="h-4 w-4 text-destructive" />}
                        className="border-destructive/30"
                        description="Immediate action recommended"
                    />
                    <StatCard
                        title="Paid (MTD)"
                        value={`£${paidThisMonth.toLocaleString(undefined, { minimumFractionDigits: 2 })}`}
                        icon={<CheckCircle className="h-4 w-4 text-success" />}
                        description="Payments received this month"
                    />
                </div>
            )}

            <GlassCard>
                <GlassCardHeader className="pb-3 border-b border-glass-border/50">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                        <div>
                            <GlassCardTitle className="text-lg">
                                {activeTab === "split-billing" ? "Split Billing Register" : "All Invoices"}
                            </GlassCardTitle>
                        </div>
                        <div className="flex flex-wrap items-center gap-3">
                            <div className="relative w-full sm:w-64">
                                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                                <Input
                                    placeholder={activeTab === "split-billing" ? "Search split line, job, client, site..." : "Search invoice #, client, site..."}
                                    className="pl-9 bg-white/40 h-9"
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                />
                            </div>
                            <Select value={selectedCustomerId} onValueChange={setSelectedCustomerId}>
                                <SelectTrigger className="w-full sm:w-[220px] bg-white/40 h-9">
                                    <SelectValue placeholder="All clients" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="__all__">All clients</SelectItem>
                                    {customers.map((customer) => (
                                        <SelectItem key={customer.id} value={customer.id}>{customer.name}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            {sitesEnabled ? (
                                <Select value={selectedSiteId} onValueChange={setSelectedSiteId} disabled={selectedCustomerId === "__all__"}>
                                    <SelectTrigger className="w-full sm:w-[240px] bg-white/40 h-9">
                                        <SelectValue placeholder={selectedCustomerId === "__all__" ? "Select client first" : "All sites"} />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="__all__">All sites</SelectItem>
                                        {filterSites.map((site) => (
                                            <SelectItem key={site.id} value={site.id}>{formatCustomerSiteLabel(site)}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            ) : null}
                            {activeTab === "invoices" ? (
                                <Button
                                    variant="outline"
                                    className="gap-2 bg-white/40"
                                    onClick={async () => {
                                        try {
                                            const blob = await downloadFile("/invoices/export.csv")
                                            const url = URL.createObjectURL(blob)
                                            const link = document.createElement("a")
                                            link.href = url
                                            link.download = "invoices.csv"
                                            document.body.appendChild(link)
                                            link.click()
                                            link.remove()
                                            URL.revokeObjectURL(url)
                                        } catch (err: any) {
                                            toast({ title: "Export failed", description: err?.message ?? "Unable to export invoices.", variant: "error" })
                                        }
                                    }}
                                >
                                    <Download className="h-4 w-4" /> Export CSV
                                </Button>
                            ) : null}
                        </div>
                    </div>
                </GlassCardHeader>
                <GlassCardContent className="p-0">
                    <Table>
                        <TableHeader className="bg-black/5">
                            {activeTab === "split-billing" ? (
                                <TableRow className="hover:bg-transparent border-glass-border">
                                    <TableHead>Job / Split Line</TableHead>
                                    <TableHead>Client / Site</TableHead>
                                    <TableHead>Created</TableHead>
                                    <TableHead className="text-right">Value ex VAT</TableHead>
                                    <TableHead>Status</TableHead>
                                    <TableHead>Linked Invoice</TableHead>
                                    <TableHead className="w-[50px]"></TableHead>
                                </TableRow>
                            ) : (
                                <TableRow className="hover:bg-transparent border-glass-border">
                                    <TableHead>Invoice</TableHead>
                                    <TableHead>Client & Project</TableHead>
                                    <TableHead>Issue Date</TableHead>
                                    <TableHead>Due/Overdue</TableHead>
                                    <TableHead className="text-right">Balance Due</TableHead>
                                    <TableHead>Status</TableHead>
                                    <TableHead>Sync</TableHead>
                                    <TableHead className="w-[50px]"></TableHead>
                                </TableRow>
                            )}
                        </TableHeader>
                        <TableBody>
                            {activeTab === "split-billing" ? (
                                filteredSplitRegister.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={7} className="h-32 text-center text-muted-foreground">
                                            No split billing lines match your search.
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    splitRegisterPagination.paginatedItems.map((entry) => (
                                        <TableRow
                                            key={entry.id}
                                            className="border-glass-border hover:bg-black/5 transition-colors cursor-pointer"
                                            onClick={() => {
                                                if (entry.linkedInvoiceId) {
                                                    router.push(`/admin/finance/${entry.linkedInvoiceId}`)
                                                } else if (entry.jobId) {
                                                    router.push(`/admin/schedule/${entry.jobId}`)
                                                }
                                            }}
                                        >
                                            <TableCell className="font-medium">
                                                <div className="flex flex-col">
                                                    <span>{entry.jobTitle ?? "Linked Job"}</span>
                                                    <span className="text-[11px] text-muted-foreground">
                                                        {entry.description?.trim() || "Untitled split billing line"}
                                                    </span>
                                                </div>
                                            </TableCell>
                                            <TableCell>
                                                <div className="flex flex-col">
                                                    <span className="font-medium text-sm">{entry.customerName ?? "Customer"}</span>
                                                    {sitesEnabled && entry.siteName ? (
                                                        <span className="text-[10px] text-muted-foreground">
                                                            Site: {entry.siteName}
                                                            {entry.siteAddress ? ` • ${entry.siteAddress}` : ""}
                                                        </span>
                                                    ) : (
                                                        <span className="text-[10px] text-muted-foreground">No linked site</span>
                                                    )}
                                                </div>
                                            </TableCell>
                                            <TableCell className="text-sm text-muted-foreground">
                                                {entry.createdAt ? new Date(entry.createdAt).toLocaleDateString("en-GB") : "—"}
                                            </TableCell>
                                            <TableCell className="text-right font-bold text-sm text-foreground">
                                                £{entry.valueExVat.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                            </TableCell>
                                            <TableCell>
                                                <StatusBadge status={formatSplitInvoiceStatus(entry.status)}>
                                                    {formatSplitInvoiceStatus(entry.status)}
                                                </StatusBadge>
                                            </TableCell>
                                            <TableCell>
                                                {entry.linkedInvoiceId ? (
                                                    <div className="flex flex-col">
                                                        <span className="text-sm font-medium text-foreground">
                                                            {entry.linkedInvoiceNumber ?? "Invoice linked"}
                                                        </span>
                                                        <span className="text-[10px] text-muted-foreground">
                                                            {entry.linkedInvoiceStatus ? formatInvoiceStatus(entry.linkedInvoiceStatus) : "Draft"}
                                                        </span>
                                                    </div>
                                                ) : (
                                                    <span className="text-sm text-muted-foreground">Not linked yet</span>
                                                )}
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
                                                        {entry.jobId ? (
                                                            <DropdownMenuItem onClick={() => router.push(`/admin/schedule/${entry.jobId}`)}>
                                                                Open Job
                                                            </DropdownMenuItem>
                                                        ) : null}
                                                        {entry.linkedInvoiceId ? (
                                                            <DropdownMenuItem onClick={() => router.push(`/admin/finance/${entry.linkedInvoiceId}`)}>
                                                                Open Linked Invoice
                                                            </DropdownMenuItem>
                                                        ) : (
                                                            <>
                                                                <DropdownMenuItem
                                                                    onClick={() => handleCreateInvoiceFromSplit(entry, false)}
                                                                    disabled={!canManage || creatingSplitInvoiceId === entry.id}
                                                                >
                                                                    {creatingSplitInvoiceId === entry.id ? "Creating..." : "Create Draft Invoice"}
                                                                </DropdownMenuItem>
                                                                <DropdownMenuItem
                                                                    onClick={() => handleCreateInvoiceFromSplit(entry, true)}
                                                                    disabled={!canManage || creatingSplitInvoiceId === entry.id}
                                                                >
                                                                    {creatingSplitInvoiceId === entry.id ? "Creating..." : "Create & Send Invoice"}
                                                                </DropdownMenuItem>
                                                            </>
                                                        )}
                                                    </DropdownMenuContent>
                                                </DropdownMenu>
                                            </TableCell>
                                        </TableRow>
                                    ))
                                )
                            ) : filteredInvoices.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={8} className="h-32 text-center text-muted-foreground">
                                        <div className="flex flex-col items-center gap-3">
                                            <span>{invoices.length === 0 ? "No invoices yet." : "No invoices match your search."}</span>
                                            {invoices.length === 0 && canManage ? (
                                                <Button size="sm" className="gap-2" onClick={() => setIsCreateOpen(true)}>
                                                    <Plus className="h-4 w-4" /> Create Invoice
                                                </Button>
                                            ) : null}
                                        </div>
                                    </TableCell>
                                </TableRow>
                            ) : (
                                invoicePagination.paginatedItems.map((invoice) => {
                                    const isOverdue = isPast(new Date(invoice.dueDate)) && invoice.status !== "Paid"
                                    const syncState = getSyncState(invoice.accountingSyncStatus)
                                    const workflowStatusLabel = getWorkflowStatusLabel("invoices", invoice.status, invoice.workflowStageKey, workflowConfig, complianceWorkflows)

                                    return (
                                        <TableRow
                                            key={invoice.id}
                                            className={`border-glass-border hover:bg-black/5 transition-colors cursor-pointer ${invoice.status === "Overdue" ? "bg-destructive/5" : ""}`}
                                            onClick={() => router.push(`/admin/finance/${invoice.id}`)}
                                        >
                                            <TableCell className="font-medium">
                                                <div className="flex flex-col">
                                                    <RecordNumberBadge value={invoice.invoiceNumber} />
                                                    {invoice.jobId && (
                                                        <span className="text-[10px] text-muted-foreground">Job linked</span>
                                                    )}
                                                </div>
                                            </TableCell>
                                            <TableCell>
                                                <div className="flex flex-col">
                                                    <span className="font-medium text-sm">{invoice.clientName}</span>
                                                    <span className="text-xs text-muted-foreground">{invoice.projectName}</span>
                                                    {sitesEnabled && invoice.siteName ? (
                                                        <span className="text-[10px] text-muted-foreground">
                                                            Site: {invoice.siteName}
                                                            {invoice.siteAddress ? ` • ${invoice.siteAddress}` : ""}
                                                        </span>
                                                    ) : null}
                                                </div>
                                            </TableCell>
                                            <TableCell className="text-sm text-muted-foreground">
                                                {new Date(invoice.issueDate).toLocaleDateString("en-GB")}
                                            </TableCell>
                                            <TableCell className="text-sm">
                                                {isOverdue ? (
                                                    <span className="text-destructive font-semibold flex items-center gap-1.5">
                                                        <AlertTriangle className="h-3 w-3" />
                                                        {formatDistanceToNow(new Date(invoice.dueDate))} ago
                                                    </span>
                                                ) : (
                                                    <span className="text-muted-foreground">{new Date(invoice.dueDate).toLocaleDateString("en-GB")}</span>
                                                )}
                                            </TableCell>
                                            <TableCell className="text-right">
                                                <div className="flex flex-col items-end">
                                                    <span className="font-bold text-sm text-foreground">£{invoice.balanceDue.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                                                    {invoice.amountPaid > 0 && invoice.amountPaid < invoice.total && (
                                                        <span className="text-[10px] text-success">of £{invoice.total.toLocaleString()} total</span>
                                                    )}
                                                </div>
                                            </TableCell>
                                            <TableCell>
                                                <StatusBadge status={formatInvoiceStatus(invoice.status)} className="shadow-sm gap-1.5">
                                                    {getStatusIcon(invoice.status)}
                                                    {workflowStatusLabel}
                                                </StatusBadge>
                                            </TableCell>
                                            <TableCell>
                                                <Badge variant={syncState.variant as any} className="shadow-sm">
                                                    {syncState.label}
                                                </Badge>
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
                                                        <DropdownMenuItem onClick={() => router.push(`/admin/finance/${invoice.id}`)}>
                                                            View Details
                                                        </DropdownMenuItem>
                                                        <DropdownMenuItem
                                                            onClick={async () => {
                                                                try {
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
                                                                }
                                                            }}
                                                        >
                                                            Download PDF
                                                        </DropdownMenuItem>
                                                        {invoice.status !== "Paid" && (
                                                            <>
                                                                <DropdownMenuItem
                                                                    className="text-primary focus:text-primary"
                                                                    onClick={async () => {
                                                                        if (!canManage) {
                                                                            toast({ title: "Insufficient permissions", description: "You can view invoices but cannot record payments.", variant: "error" })
                                                                            return
                                                                        }
                                                                        try {
                                                                            await apiPost(`/invoices/${invoice.id}/mark-paid`)
                                                                            await loadInvoices()
                                                                            toast({ title: "Payment recorded", description: "Invoice marked as paid.", variant: "success" })
                                                                        } catch (err: any) {
                                                                            toast({ title: "Failed to record payment", description: err?.message ?? "Please try again.", variant: "error" })
                                                                        }
                                                                    }}
                                                                    disabled={!canManage}
                                                                >
                                                                    Record Payment
                                                                </DropdownMenuItem>
                                                                <DropdownMenuItem
                                                                    onClick={async () => {
                                                                        if (!canManage) {
                                                                            toast({ title: "Insufficient permissions", description: "You can view invoices but cannot send reminders.", variant: "error" })
                                                                            return
                                                                        }
                                                                        try {
                                                                            await apiPost(`/invoices/${invoice.id}/send`)
                                                                            await loadInvoices()
                                                                            toast({ title: "Invoice sent", description: "Reminder link sent to the client.", variant: "success" })
                                                                        } catch (err: any) {
                                                                            toast({ title: "Send failed", description: err?.message ?? "Unable to send reminder.", variant: "error" })
                                                                        }
                                                                    }}
                                                                    disabled={!canManage}
                                                                >
                                                                    Send Reminder Link
                                                                </DropdownMenuItem>
                                                            </>
                                                        )}
                                                        <DropdownMenuItem
                                                            className="text-destructive focus:bg-destructive/10 focus:text-destructive"
                                                            onClick={() => {
                                                                if (!canManage) {
                                                                    toast({ title: "Insufficient permissions", description: "You can view invoices but cannot delete them.", variant: "error" })
                                                                    return
                                                                }
                                                                setDeleteTarget(invoice)
                                                            }}
                                                            disabled={!canManage}
                                                        >
                                                            Delete Invoice
                                                        </DropdownMenuItem>
                                                    </DropdownMenuContent>
                                                </DropdownMenu>
                                            </TableCell>
                                        </TableRow>
                                    )
                                })
                            )}
                        </TableBody>
                    </Table>
                    {activeTab === "split-billing" ? (
                        <DataPagination {...splitRegisterPagination} onPageChange={splitRegisterPagination.setPage} />
                    ) : (
                        <DataPagination {...invoicePagination} onPageChange={invoicePagination.setPage} />
                    )}
                </GlassCardContent>
            </GlassCard>

            <GlassModal
                open={isCreateOpen}
                onOpenChange={(open) => {
                    setIsCreateOpen(open)
                    if (!open) resetForm()
                }}
                title="Create Invoice"
                description="Create a new invoice for a customer."
                footer={
                    <div className="flex justify-end gap-2">
                        <Button variant="ghost" onClick={() => setIsCreateOpen(false)}>Cancel</Button>
                        <Button variant="outline" onClick={() => handleCreateInvoice(false)} disabled={creating}>
                            {creating && createAction === "CREATE" ? "Saving..." : "Create"}
                        </Button>
                        <Button onClick={() => handleCreateInvoice(true)} disabled={creating}>
                            {creating && createAction === "CREATE_SEND" ? "Saving & Sending..." : "Create & Send"}
                        </Button>
                    </div>
                }
            >
                <div className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label required>Invoice Title</Label>
                            <Input
                                value={form.title}
                                onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))}
                                className={formErrors.title ? "border-destructive" : ""}
                                placeholder="Invoice title"
                            />
                            {formErrors.title && <p className="text-xs text-destructive">{formErrors.title}</p>}
                        </div>
                        <div className="space-y-2">
                            <Label required>Client</Label>
                            <Select
                                value={form.customerId}
                                createOption={{ label: "customer", href: "/admin/customers?create=customer" }}
                                onValueChange={(value) => setForm((prev) => ({ ...prev, customerId: value, siteId: "" }))}
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
                            {sitesEnabled ? <div className="space-y-2">
                                <Label optional>Customer Site</Label>
                                <Select
                                    value={form.siteId || "__none__"}
                                createOption={form.customerId ? { label: "site", href: `/admin/customers/${form.customerId}?create=site` } : undefined}
                                onValueChange={(value) => setForm((prev) => ({ ...prev, siteId: value === "__none__" ? "" : value }))}
                                disabled={!form.customerId}
                            >
                                <SelectTrigger className="w-full bg-white/50">
                                    <SelectValue placeholder={form.customerId ? "Select site (optional)" : "Select client first"} />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="__none__">No linked site</SelectItem>
                                    {customerSites.map((site) => (
                                        <SelectItem key={site.id} value={site.id}>{formatCustomerSiteLabel(site)}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                                <p className="text-xs text-muted-foreground">
                                    {form.siteId
                                        ? formatCustomerSiteAddress(customerSites.find((site) => site.id === form.siteId)) || "No address saved for this site."
                                        : "Optional, but recommended when the invoice belongs to a specific site."}
                                </p>
                            </div> : null}
                        <div className="space-y-2">
                            <Label required>Due Date</Label>
                            <DatePicker
                                selected={form.dueDate}
                                onChange={(date: Date | null) => setForm((prev) => ({ ...prev, dueDate: date }))}
                                className={`w-full rounded-md border border-glass-border bg-white/50 px-3 py-2 text-sm ${formErrors.dueDate ? "border-destructive" : ""}`}
                                dateFormat="dd/MM/yyyy"
                            />
                            {formErrors.dueDate && <p className="text-xs text-destructive">{formErrors.dueDate}</p>}
                        </div>
                        <div className="space-y-2">
                            <Label optional>VAT Number</Label>
                            <Input
                                value={form.vatNumber}
                                onChange={(e) => setForm((prev) => ({ ...prev, vatNumber: e.target.value }))}
                                placeholder="GB123456789"
                            />
                        </div>
                    </div>

                    <div className="border-t border-glass-border pt-4 space-y-3">
                        <div className="flex items-center justify-between">
                            <Label required>Line Items</Label>
                            <Button variant="outline" size="sm" onClick={addLineItem}>
                                <Plus className="h-4 w-4" /> Add Item
                            </Button>
                        </div>
                        {formErrors.lineItems && <p className="text-xs text-destructive">{formErrors.lineItems}</p>}
                        <div className="space-y-3">
                            {form.lineItems.map((item) => (
                                <div key={item.id} className="grid grid-cols-1 md:grid-cols-12 gap-3 p-3 border border-glass-border rounded-lg bg-white/40">
                                    <div className="md:col-span-5 space-y-1">
                                        <Label required className="text-xs">Description</Label>
                                        <Input
                                            value={item.description}
                                            onChange={(e) => updateLineItem(item.id, "description", e.target.value)}
                                            className={itemErrors[item.id]?.description ? "border-destructive" : ""}
                                        />
                                        {itemErrors[item.id]?.description && <p className="text-xs text-destructive">{itemErrors[item.id]?.description}</p>}
                                    </div>
                                    <div className="md:col-span-2 space-y-1">
                                        <Label required className="text-xs">Qty</Label>
                                        <Input
                                            type="number"
                                            min={1}
                                            value={item.quantity}
                                            onChange={(e) => updateLineItem(item.id, "quantity", Number(e.target.value))}
                                            className={itemErrors[item.id]?.quantity ? "border-destructive" : ""}
                                        />
                                        {itemErrors[item.id]?.quantity && <p className="text-xs text-destructive">{itemErrors[item.id]?.quantity}</p>}
                                    </div>
                                    <div className="md:col-span-2 space-y-1">
                                        <Label required className="text-xs">Unit Price</Label>
                                        <Input
                                            type="number"
                                            min={0}
                                            value={item.unitPrice}
                                            onChange={(e) => updateLineItem(item.id, "unitPrice", Number(e.target.value))}
                                            className={itemErrors[item.id]?.unitPrice ? "border-destructive" : ""}
                                        />
                                        {itemErrors[item.id]?.unitPrice && <p className="text-xs text-destructive">{itemErrors[item.id]?.unitPrice}</p>}
                                    </div>
                                    <div className="md:col-span-2 space-y-1">
                                        <Label optional className="text-xs">VAT %</Label>
                                        <Input
                                            type="number"
                                            min={0}
                                            value={item.taxRate}
                                            onChange={(e) => updateLineItem(item.id, "taxRate", Number(e.target.value))}
                                        />
                                    </div>
                                    <div className="md:col-span-1 flex items-end">
                                        <Button variant="ghost" size="icon" onClick={() => removeLineItem(item.id)} disabled={form.lineItems.length === 1}>
                                            <XCircle className="h-4 w-4 text-destructive" />
                                        </Button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </GlassModal>

            <GlassModal
                open={Boolean(deleteTarget)}
                onOpenChange={(open) => !open && setDeleteTarget(null)}
                title="Delete Invoice"
                description="Are you sure you want to delete this invoice? This action cannot be undone."
                footer={
                    <div className="flex justify-end gap-2">
                        <Button variant="ghost" onClick={() => setDeleteTarget(null)}>Cancel</Button>
                        <Button
                            variant="destructive"
                            onClick={async () => {
                                if (!deleteTarget) return
                                try {
                                    await apiDelete(`/invoices/${deleteTarget.id}`, { confirmed: true })
                                    await loadInvoices()
                                    toast({ title: "Invoice deleted", description: "The invoice was removed.", variant: "success" })
                                } catch (err: any) {
                                    toast({ title: "Delete failed", description: err?.message ?? "Unable to delete invoice.", variant: "error" })
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
                    This will remove invoice <span className="font-semibold">{deleteTarget?.invoiceNumber}</span> from the system.
                </div>
            </GlassModal>
            <ErrorToast error={error} onClear={() => setError(null)} />
            </>
            )}
        </PageContainer>
    )
}

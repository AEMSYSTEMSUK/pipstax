"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { PageContainer } from "@/components/layout/PageContainer"
import { GlassCard, GlassCardContent, GlassCardHeader, GlassCardTitle } from "@/components/glass/GlassCard"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Search, Plus, MoreHorizontal, FileText, Send, Eye, XCircle, Clock3, LayoutGrid, List, CheckCircle2 } from "lucide-react"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
type Quote = {
    id: string
    quoteNumber: string
    clientId: string
    clientName: string
    clientEmail: string
    siteId?: string
    siteName?: string
    siteAddress?: string
    projectName: string
    dateCreated: string
    validUntil: string
    subtotal: number
    taxTotal: number
    total: number
    status: string
    expiredAt?: string
    workflowStageKey?: string
    lineItems: Array<{ description?: string; quantity?: number; unitPrice?: number }>
    notes: string
}
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { useRouter } from "next/navigation"
import { apiDelete, apiGet, apiPost, downloadFile } from "@/lib/api"
import { ErrorToast } from "@/components/shared/ErrorToast"
import { DataPagination, useClientPagination } from "@/components/shared/DataPagination"
import { useSavedColumnOrder } from "@/components/shared/useSavedColumnOrder"
import { useSavedViewMode } from "@/components/shared/useSavedViewMode"
import { RecordNumberBadge } from "@/components/shared/RecordNumberBadge"
import { StatusBadge } from "@/components/shared/StatusBadge"
import { GlassModal } from "@/components/glass/GlassModal"
import { useToast } from "@/components/ui/toast"
import { getModulePermissions } from "@/lib/permission-ui"
import { formatQuoteStatus } from "@/lib/status"
import { CustomerSiteOption, fetchCustomerSites, formatCustomerSiteLabel } from "@/lib/customer-sites"
import { useTenantFeatures } from "@/components/layout/TenantFeaturesContext"
import { useTenantWorkflowConfig } from "@/components/layout/TenantWorkflowContext"
import { findWorkflowStage, getWorkflowStageOptions, getWorkflowStatusLabel } from "@/lib/workflows"

const QUOTE_VIEW_MODES = ["list", "board"] as const

export default function QuotesPage() {
    const router = useRouter()
    const { toast } = useToast()
    const { canView, canManage } = getModulePermissions("quotes.view", "quotes.manage")
    const { sites: sitesEnabled, complianceWorkflows } = useTenantFeatures()
    const workflowConfig = useTenantWorkflowConfig()
    const [quotes, setQuotes] = useState<Quote[]>([])
    const [error, setError] = useState<string | null>(null)
    const [searchQuery, setSearchQuery] = useState("")
    const [customers, setCustomers] = useState<any[]>([])
    const [selectedCustomerId, setSelectedCustomerId] = useState("__all__")
    const [selectedSiteId, setSelectedSiteId] = useState("__all__")
    const [customerSites, setCustomerSites] = useState<CustomerSiteOption[]>([])
    const [viewMode, setViewMode] = useSavedViewMode("pipstack:view-mode:admin-quotes", "list", QUOTE_VIEW_MODES)
    const [sendOpen, setSendOpen] = useState(false)
    const [sendTarget, setSendTarget] = useState<Quote | null>(null)
    const [deleteOpen, setDeleteOpen] = useState(false)
    const [deleteTarget, setDeleteTarget] = useState<Quote | null>(null)

    useEffect(() => {
        const load = async () => {
            try {
                const [quotesRes, customersRes] = await Promise.all([
                    apiGet<any[]>("/quotes"),
                    apiGet<any[]>("/customers")
                ])
                const customerList = Array.isArray(customersRes.data) ? customersRes.data : []
                setCustomers(customerList)
                const mapped = quotesRes.data.map((quote) => {
                    const customer = customerList.find((c) => c.id === quote.customerId)
                    const lineItems = Array.isArray(quote.lineItems) ? quote.lineItems : []
                    const subtotal = lineItems.reduce((acc: number, item: any) => acc + (Number(item.quantity ?? 0) * Number(item.unitPrice ?? 0)), 0)
                    const taxTotal = lineItems.reduce((acc: number, item: any) => acc + ((Number(item.quantity ?? 0) * Number(item.unitPrice ?? 0)) * (Number(item.vatRate ?? 0) / 100)), 0)
                    return {
                    id: quote.id,
                    quoteNumber: quote.quoteNumber ?? "QT-PENDING",
                    clientId: quote.customerId ?? "",
                    clientName: quote.customerName ?? customer?.name ?? quote.recipientName ?? "Customer",
                    clientEmail: quote.customerEmail ?? customer?.email ?? quote.recipientEmail ?? "",
                    siteId: quote.siteId ?? undefined,
                    siteName: quote.siteName ?? undefined,
                    siteAddress: quote.siteAddress ?? undefined,
                    projectName: quote.title ?? "Quote",
                    dateCreated: quote.createdAt ?? new Date().toISOString(),
                    validUntil: quote.validUntil ?? quote.createdAt ?? new Date().toISOString(),
                    subtotal,
                    taxTotal,
                    total: Number(quote.total ?? subtotal + taxTotal),
                    status: (quote.status ?? "DRAFT").toString().toUpperCase(),
                    expiredAt: quote.expiredAt,
                    workflowStageKey: quote.workflowStageKey ?? undefined,
                    lineItems,
                    notes: ""
                }}) as Quote[]
                setQuotes(mapped)
            } catch (err: any) {
                setError(err?.message ?? "Failed to load quotes")
            }
        }
        load()
    }, [])

    useEffect(() => {
        const loadSites = async () => {
            if (!sitesEnabled || selectedCustomerId === "__all__") {
                setCustomerSites([])
                setSelectedSiteId("__all__")
                return
            }
            try {
                const sites = await fetchCustomerSites(selectedCustomerId)
                setCustomerSites(sites)
                setSelectedSiteId((prev) => (prev === "__all__" || sites.some((site) => site.id === prev) ? prev : "__all__"))
            } catch (err: any) {
                setError(err?.message ?? "Failed to load customer sites")
                setCustomerSites([])
                setSelectedSiteId("__all__")
            }
        }
        void loadSites()
    }, [selectedCustomerId, sitesEnabled])

    const filteredQuotes = useMemo(() => {
        const query = searchQuery.trim().toLowerCase()
        return quotes.filter((quote) => {
            if (selectedCustomerId !== "__all__" && quote.clientId !== selectedCustomerId) return false
            if (selectedSiteId !== "__all__" && quote.siteId !== selectedSiteId) return false
            if (!query) return true
            const displayStatus = getDisplayStatus(quote)
            const workflowStatusLabel = getQuoteStatusLabel(quote)
            return (
                quote.clientName.toLowerCase().includes(query) ||
                quote.quoteNumber.toLowerCase().includes(query) ||
                quote.projectName.toLowerCase().includes(query) ||
                String(quote.siteName ?? "").toLowerCase().includes(query) ||
                String(quote.siteAddress ?? "").toLowerCase().includes(query) ||
                formatQuoteStatus(displayStatus).toLowerCase().includes(query) ||
                workflowStatusLabel.toLowerCase().includes(query)
            )
        })
    }, [quotes, searchQuery, selectedCustomerId, selectedSiteId, workflowConfig, complianceWorkflows])
    const quotesPagination = useClientPagination(filteredQuotes)

    function getDisplayStatus(quote: Quote) {
        return quote.expiredAt && quote.status !== "SIGNED" ? "EXPIRED" : quote.status
    }

    function getQuoteStatusLabel(quote: Quote) {
        if (quote.expiredAt && quote.status !== "SIGNED") return "Expired"
        const label = getWorkflowStatusLabel("quotes", quote.status, quote.workflowStageKey, workflowConfig, complianceWorkflows)
        return quote.status === "SIGNED" && label === "Signed" ? "Accepted" : label
    }

    const getStatusIcon = (status: string) => {
        switch (status) {
            case 'DRAFT': return <FileText className="h-3.5 w-3.5" />
            case 'SENT': return <Send className="h-3.5 w-3.5" />
            case 'VIEWED': return <Eye className="h-3.5 w-3.5" />
            case 'SIGNED': return <CheckCircle2 className="h-3.5 w-3.5" />
            case 'DECLINED': return <XCircle className="h-3.5 w-3.5" />
            case 'EXPIRED': return <Clock3 className="h-3.5 w-3.5" />
            default: return <FileText className="h-3.5 w-3.5" />
        }
    }

    const quoteStageOptions = getWorkflowStageOptions("quotes", workflowConfig)
    const getDefaultQuoteStageForStatus = (status: string) =>
        quoteStageOptions.find((stage) => stage.key === stage.baseStatus && stage.baseStatus === status) ??
        quoteStageOptions.find((stage) => stage.baseStatus === status)
    const getQuoteBoardKey = (quote: Quote) => {
        if (quote.expiredAt && quote.status !== "SIGNED") return "EXPIRED"
        if (!complianceWorkflows) return quote.status
        const stage = findWorkflowStage(workflowConfig, "quotes", quote.workflowStageKey)
        return stage?.key ?? getDefaultQuoteStageForStatus(quote.status)?.key ?? quote.status
    }
    const boardColumns = complianceWorkflows
        ? [
            ...quoteStageOptions.map((stage) => ({
                key: stage.key,
                title: stage.label,
                tone: formatQuoteStatus(stage.baseStatus),
            })),
            { key: "EXPIRED", title: "Expired", tone: "Expired" },
        ]
        : [
            { key: "DRAFT", title: "Draft", tone: "Draft" },
            { key: "SENT", title: "Sent", tone: "Sent" },
            { key: "VIEWED", title: "Viewed", tone: "Viewed" },
            { key: "SIGNED", title: "Accepted", tone: "Accepted" },
            { key: "DECLINED", title: "Declined", tone: "Declined" },
            { key: "EXPIRED", title: "Expired", tone: "Expired" },
        ]
    const { orderedColumns: orderedBoardColumns, getColumnDragProps } = useSavedColumnOrder(
        boardColumns,
        "pipstack:board-columns:admin-quotes"
    )

    const quotesByStatus = useMemo(
        () =>
            orderedBoardColumns.reduce((acc, column) => {
                acc[column.key] = filteredQuotes.filter((quote) => getQuoteBoardKey(quote) === column.key)
                return acc
            }, {} as Record<string, Quote[]>),
        [filteredQuotes, orderedBoardColumns, workflowConfig, complianceWorkflows]
    )

    return (
        <PageContainer>
            {!canView ? (
                <GlassCard>
                    <GlassCardHeader>
                        <GlassCardTitle>Quotes & Proposals</GlassCardTitle>
                    </GlassCardHeader>
                    <GlassCardContent>You do not have access to view quotes.</GlassCardContent>
                </GlassCard>
            ) : (
            <>
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-foreground">Quotes & Proposals</h1>
                    <p className="text-muted-foreground mt-1 text-sm">Create estimates, track acceptances, and manage digital signs.</p>
                </div>

                <Button className="gap-2" asChild disabled={!canManage}>
                    <Link href="/admin/quotes/new">
                        <Plus className="h-4 w-4" /> New Quote
                    </Link>
                </Button>
            </div>

            <GlassCard>
                <GlassCardHeader className="pb-3 border-b border-glass-border/50">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                        <GlassCardTitle className="text-lg">Recent Quotes</GlassCardTitle>
                        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
                            <div className="inline-flex rounded-lg border border-glass-border bg-white/40 p-1">
                                <Button
                                    type="button"
                                    variant={viewMode === "list" ? "default" : "ghost"}
                                    size="sm"
                                    className="h-8 gap-1.5 px-3"
                                    onClick={() => setViewMode("list")}
                                >
                                    <List className="h-3.5 w-3.5" /> List
                                </Button>
                                <Button
                                    type="button"
                                    variant={viewMode === "board" ? "default" : "ghost"}
                                    size="sm"
                                    className="h-8 gap-1.5 px-3"
                                    onClick={() => setViewMode("board")}
                                >
                                    <LayoutGrid className="h-3.5 w-3.5" /> Board
                                </Button>
                            </div>
                            <div className="relative w-full sm:w-64">
                                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                                <Input
                                    placeholder="Search quotes, clients, sites..."
                                    className="pl-9 bg-white/40 h-9"
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                />
                            </div>
                            <Select value={selectedCustomerId} onValueChange={setSelectedCustomerId}>
                                <SelectTrigger className="w-full sm:w-[220px] bg-white/40 h-9">
                                    <SelectValue placeholder="All customers" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="__all__">All customers</SelectItem>
                                    {customers.map((customer) => (
                                        <SelectItem key={customer.id} value={customer.id}>{customer.name}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            {sitesEnabled ? (
                                <Select value={selectedSiteId} onValueChange={setSelectedSiteId} disabled={selectedCustomerId === "__all__"}>
                                    <SelectTrigger className="w-full sm:w-[240px] bg-white/40 h-9">
                                        <SelectValue placeholder={selectedCustomerId === "__all__" ? "Select customer first" : "All sites"} />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="__all__">All sites</SelectItem>
                                        {customerSites.map((site) => (
                                            <SelectItem key={site.id} value={site.id}>{formatCustomerSiteLabel(site)}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            ) : null}
                        </div>
                    </div>
                </GlassCardHeader>
                <GlassCardContent className={viewMode === "board" ? "p-4" : "p-0"}>
                    {viewMode === "board" ? (
                        filteredQuotes.length === 0 ? (
                            <div className="flex min-h-52 flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-glass-border bg-white/30 text-center text-muted-foreground">
                                <span>{quotes.length === 0 ? "No quotes yet." : "No quotes match your search."}</span>
                                {quotes.length === 0 && canManage ? (
                                    <Button size="sm" className="gap-2" onClick={() => router.push("/admin/quotes/new")}>
                                        <Plus className="h-4 w-4" /> New Quote
                                    </Button>
                                ) : null}
                            </div>
                        ) : (
                            <div className="-mx-1 overflow-x-auto px-1 pb-2">
                            <div className="flex min-w-max gap-4">
                                {orderedBoardColumns.map((column) => {
                                    const columnQuotes = quotesByStatus[column.key] ?? []
                                    return (
                                        <div key={column.key} className="min-h-[260px] w-[280px] shrink-0 rounded-2xl border border-glass-border bg-white/35 p-3">
                                            <div
                                                className="mb-3 flex cursor-grab items-center justify-between gap-2 rounded-xl active:cursor-grabbing"
                                                title="Drag to rearrange columns"
                                                {...getColumnDragProps(column)}
                                            >
                                                <div className="flex items-center gap-2">
                                                    <StatusBadge status={column.tone} className="gap-1.5">
                                                        {getStatusIcon(column.key)}
                                                        {column.title}
                                                    </StatusBadge>
                                                </div>
                                                <span className="rounded-full bg-black/5 px-2 py-0.5 text-xs font-semibold text-muted-foreground">
                                                    {columnQuotes.length}
                                                </span>
                                            </div>
                                            <div className="space-y-3">
                                                {columnQuotes.length === 0 ? (
                                                    <div className="rounded-xl border border-dashed border-glass-border bg-white/30 px-3 py-8 text-center text-xs text-muted-foreground">
                                                        No quotes
                                                    </div>
                                                ) : (
                                                    columnQuotes.map((quote) => {
                                                        const workflowStatusLabel = getQuoteStatusLabel(quote)
                                                        return (
                                                            <button
                                                                key={quote.id}
                                                                type="button"
                                                                className="w-full rounded-xl border border-glass-border bg-white/70 p-3 text-left shadow-sm transition hover:-translate-y-0.5 hover:bg-white hover:shadow-md"
                                                                onClick={() => router.push(`/admin/quotes/${quote.id}`)}
                                                            >
                                                                <div className="mb-2 flex items-start justify-between gap-2">
                                                                    <RecordNumberBadge value={quote.quoteNumber} />
                                                                    <span className="text-sm font-bold text-foreground">
                                                                        £{quote.total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                                    </span>
                                                                </div>
                                                                <p className="line-clamp-1 text-sm font-semibold text-foreground">{quote.projectName}</p>
                                                                <p className="line-clamp-1 text-xs text-muted-foreground">{quote.clientName}</p>
                                                                {sitesEnabled && quote.siteName ? (
                                                                    <p className="mt-1 line-clamp-1 text-[11px] text-muted-foreground">Site: {quote.siteName}</p>
                                                                ) : null}
                                                                <div className="mt-3 flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
                                                                    <span>Valid {new Date(quote.validUntil).toLocaleDateString("en-GB")}</span>
                                                                    <span>{workflowStatusLabel}</span>
                                                                </div>
                                                            </button>
                                                        )
                                                    })
                                                )}
                                            </div>
                                        </div>
                                    )
                                })}
                            </div>
                            </div>
                        )
                    ) : (
                    <>
                    <Table>
                        <TableHeader className="bg-black/5">
                            <TableRow className="hover:bg-transparent border-glass-border">
                                <TableHead>Quote Number</TableHead>
                                <TableHead>Client & Project</TableHead>
                                <TableHead>Date Created</TableHead>
                                <TableHead className="text-right">Total Amount</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead className="w-[50px]"></TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {filteredQuotes.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={6} className="h-32 text-center text-muted-foreground">
                                        <div className="flex flex-col items-center gap-3">
                                            <span>{quotes.length === 0 ? "No quotes yet." : "No quotes match your search."}</span>
                                            {quotes.length === 0 && canManage ? (
                                                <Button size="sm" className="gap-2" onClick={() => router.push("/admin/quotes/new")}>
                                                    <Plus className="h-4 w-4" /> New Quote
                                                </Button>
                                            ) : null}
                                        </div>
                                    </TableCell>
                                </TableRow>
                            ) : (
                                quotesPagination.paginatedItems.map((quote) => {
                                    const displayStatus = getDisplayStatus(quote)
                                    const workflowStatusLabel = getQuoteStatusLabel(quote)
                                    return (
                                    <TableRow
                                        key={quote.id}
                                        className="border-glass-border hover:bg-black/5 transition-colors cursor-pointer"
                                        onClick={() => router.push(`/admin/quotes/${quote.id}`)}
                                    >
                                        <TableCell className="font-medium">
                                            <RecordNumberBadge value={quote.quoteNumber} />
                                        </TableCell>
                                        <TableCell>
                                            <div className="flex flex-col">
                                                <span className="font-medium text-sm">{quote.clientName}</span>
                                                <span className="text-xs text-muted-foreground">{quote.projectName}</span>
                                                {sitesEnabled && quote.siteName ? (
                                                    <span className="text-[10px] text-muted-foreground">
                                                        Site: {quote.siteName}
                                                        {quote.siteAddress ? ` • ${quote.siteAddress}` : ""}
                                                    </span>
                                                ) : null}
                                            </div>
                                        </TableCell>
                                        <TableCell className="text-sm text-muted-foreground">
                                            {new Date(quote.dateCreated).toLocaleDateString('en-GB')}
                                        </TableCell>
                                        <TableCell className="text-right font-medium text-sm">
                                            £{quote.total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                        </TableCell>
                                        <TableCell>
                                            <StatusBadge status={formatQuoteStatus(displayStatus)} className="shadow-sm gap-1.5">
                                                {getStatusIcon(displayStatus)}
                                                {workflowStatusLabel}
                                            </StatusBadge>
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
                                                    <DropdownMenuItem onClick={() => router.push(`/admin/quotes/${quote.id}`)}>
                                                        View Quote Details
                                                    </DropdownMenuItem>
                                                    <DropdownMenuItem
                                                        onClick={async () => {
                                                            try {
                                                                const blob = await downloadFile(`/quotes/${quote.id}/pdf`)
                                                                const url = URL.createObjectURL(blob)
                                                                const link = document.createElement("a")
                                                                link.href = url
                                                                link.download = `quote-${quote.quoteNumber ?? quote.id}.pdf`
                                                                document.body.appendChild(link)
                                                                link.click()
                                                                link.remove()
                                                                URL.revokeObjectURL(url)
                                                            } catch (err: any) {
                                                                toast({
                                                                    title: "Download Failed",
                                                                    description: err?.message ?? "Failed to download PDF.",
                                                                    variant: "error"
                                                                })
                                                            }
                                                        }}
                                                    >
                                                        Download PDF
                                                    </DropdownMenuItem>
                                                    {displayStatus === 'DRAFT' && (
                                                        <DropdownMenuItem
                                                            className="text-primary focus:text-primary"
                                                            onClick={() => {
                                                                if (!canManage) {
                                                                    toast({
                                                                        title: "Insufficient permissions",
                                                                        description: "You can view quotes but cannot send them.",
                                                                        variant: "error"
                                                                    })
                                                                    return
                                                                }
                                                                setSendTarget(quote)
                                                                setSendOpen(true)
                                                            }}
                                                            disabled={!canManage}
                                                        >
                                                            Send to Client
                                                        </DropdownMenuItem>
                                                    )}
                                                    <DropdownMenuSeparator />
                                                    <DropdownMenuItem
                                                        className="text-destructive focus:bg-destructive focus:text-destructive-foreground"
                                                        onClick={() => {
                                                            if (!canManage) {
                                                                toast({
                                                                    title: "Insufficient permissions",
                                                                    description: "You can view quotes but cannot delete them.",
                                                                    variant: "error"
                                                                })
                                                                return
                                                            }
                                                            if (quote.status === "SIGNED") {
                                                                toast({
                                                                    title: "Cannot Delete",
                                                                    description: "Accepted quotes cannot be deleted.",
                                                                    variant: "error"
                                                                })
                                                                return
                                                            }
                                                            setDeleteTarget(quote)
                                                            setDeleteOpen(true)
                                                        }}
                                                        disabled={!canManage || quote.status === "SIGNED"}
                                                    >
                                                        Delete Quote
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
                    <DataPagination {...quotesPagination} onPageChange={quotesPagination.setPage} />
                    </>
                    )}
                </GlassCardContent>
            </GlassCard>
            <GlassModal
                open={sendOpen}
                onOpenChange={setSendOpen}
                title="Send Quote?"
                description={`Send ${sendTarget?.quoteNumber ?? "this quote"} to the client.`}
                footer={
                    <div className="flex justify-end gap-2 w-full">
                        <Button variant="outline" onClick={() => setSendOpen(false)}>Cancel</Button>
                        <Button
                            onClick={async () => {
                                if (!canManage) {
                                    toast({
                                        title: "Insufficient permissions",
                                        description: "You can view quotes but cannot send them.",
                                        variant: "error"
                                    })
                                    return
                                }
                                if (!sendTarget) return
                                try {
                                    await apiPost(`/quotes/${sendTarget.id}/send`)
                                    setQuotes((prev) => prev.map((q) => q.id === sendTarget.id ? { ...q, status: "SENT" } : q))
                                    toast({
                                        title: "Sent",
                                        description: "Quote sent to client.",
                                        variant: "success"
                                    })
                                    setSendOpen(false)
                                } catch (err: any) {
                                    toast({
                                        title: "Send Failed",
                                        description: err?.message ?? "Failed to send quote.",
                                        variant: "error"
                                    })
                                }
                            }}
                        >
                            Send
                        </Button>
                    </div>
                }
            />

            <GlassModal
                open={deleteOpen}
                onOpenChange={setDeleteOpen}
                title="Delete Quote?"
                description={
                    deleteTarget?.status === "SIGNED"
                        ? "Accepted quotes cannot be deleted."
                        : `This will remove ${deleteTarget?.quoteNumber ?? "this quote"} from the system.`
                }
                footer={
                    <div className="flex justify-end gap-2 w-full">
                        <Button variant="outline" onClick={() => setDeleteOpen(false)}>Cancel</Button>
                        <Button
                            variant="destructive"
                            onClick={async () => {
                                if (!canManage) {
                                    toast({
                                        title: "Insufficient permissions",
                                        description: "You can view quotes but cannot delete them.",
                                        variant: "error"
                                    })
                                    return
                                }
                                if (!deleteTarget) return
                                if (deleteTarget.status === "SIGNED") {
                                    toast({
                                        title: "Cannot Delete",
                                        description: "Accepted quotes cannot be deleted.",
                                        variant: "error"
                                    })
                                    return
                                }
                                try {
                                    await apiDelete(`/quotes/${deleteTarget.id}`, { confirmed: true })
                                    setQuotes((prev) => prev.filter((q) => q.id !== deleteTarget.id))
                                    toast({
                                        title: "Deleted",
                                        description: "Quote removed.",
                                        variant: "success"
                                    })
                                    setDeleteOpen(false)
                                } catch (err: any) {
                                    toast({
                                        title: "Delete Failed",
                                        description: err?.message ?? "Failed to delete quote.",
                                        variant: "error"
                                    })
                                }
                            }}
                            disabled={!canManage || deleteTarget?.status === "SIGNED"}
                        >
                            Delete
                        </Button>
                    </div>
                }
            />
            <ErrorToast error={error} onClear={() => setError(null)} />
            </>
            )}
        </PageContainer>
    )
}

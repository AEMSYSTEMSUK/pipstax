"use client"

import { useEffect, useMemo, useState } from "react"
import type { DragEvent } from "react"
import Link from "next/link"
import { PageContainer } from "@/components/layout/PageContainer"
import { GlassCard, GlassCardContent, GlassCardHeader, GlassCardTitle, GlassCardDescription } from "@/components/glass/GlassCard"
import { GlassModal } from "@/components/glass/GlassModal"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Textarea } from "@/components/ui/textarea"
import { StatusBadge } from "@/components/shared/StatusBadge"
import { ErrorToast } from "@/components/shared/ErrorToast"
import { DataPagination, useClientPagination } from "@/components/shared/DataPagination"
import { isBoardColumnDrag, useSavedColumnOrder } from "@/components/shared/useSavedColumnOrder"
import { useSavedViewMode } from "@/components/shared/useSavedViewMode"
import { useToast } from "@/components/ui/toast"
import { getModulePermissions } from "@/lib/permission-ui"
import { useTenantFeatures } from "@/components/layout/TenantFeaturesContext"
import { apiGet, apiPost, apiPut } from "@/lib/api"
import { CustomerSiteOption, fetchCustomerSites, formatCustomerSiteAddress, formatCustomerSiteLabel } from "@/lib/customer-sites"
import { CalendarClock, LayoutGrid, List, PoundSterling, RefreshCw, Search, SquarePen, TrendingUp, Plus, Trash2 } from "lucide-react"
import DatePicker from "react-datepicker"

type RenewalOpportunity = {
    id: string
    title: string
    reportType?: string | null
    reference?: string | null
    outcome?: string | null
    status: string
    dueDate: string
    renewalWindowStart?: string | null
    estimatedValue?: number | null
    lastQuotedAt?: string | null
    lastChasedAt?: string | null
    closedAt?: string | null
    notes?: string | null
    ownerUserId?: string | null
    ownerName?: string | null
    quoteId?: string | null
    quoteNumber?: string | null
    quoteStatus?: string | null
    quoteWorkflowStatusLabel?: string | null
    quoteWorkflowBaseStatus?: string | null
    customerId: string
    customerName?: string | null
    siteId: string
    siteName?: string | null
    siteReference?: string | null
    siteCategory?: string | null
    timingState?: string | null
}

type RenewalSummary = {
    total: number
    overdue: number
    dueSoon: number
    quoted: number
    chased: number
    pipelineValue: number
}

type RenewalResponse = {
    items: RenewalOpportunity[]
    summary: RenewalSummary
    sync?: {
        scanned: number
        tracked: number
        removed: number
    }
}

type TenantUserOption = {
    id: string
    fullName?: string | null
    email?: string | null
}

type QuoteOption = {
    id: string
    quoteNumber?: string | null
    title?: string | null
    customerId?: string | null
    siteId?: string | null
    status?: string | null
}

type RenewalQuoteCreateResponse = {
    renewal?: RenewalOpportunity
    quote?: {
        id: string
        quoteNumber?: string | null
        title?: string | null
        status?: string | null
    }
}

type EditableQuote = {
    id: string
    quoteNumber?: string | null
    customerId?: string | null
    customerName?: string | null
    siteId?: string | null
    siteName?: string | null
    title: string
    validUntil?: string | null
    status?: string | null
    lineItems: Array<{ description?: string; quantity?: number; unitPrice?: number; vatRate?: number }>
    notes?: string | null
    termsAndConditions?: string | null
}

type QuoteEditForm = {
    customerId: string
    siteId: string
    projectName: string
    validUntil: Date | null
    notes: string
    terms: string
}

type RenewalForm = {
    status: string
    ownerUserId: string
    estimatedValue: string
    lastQuotedAt: string
    lastChasedAt: string
    notes: string
    quoteId: string
}

type QuoteEditItem = {
    id: string
    description: string
    quantity: number
    unitPrice: number
    taxRate: number
}

type RenewalViewMode = "board" | "list"
const RENEWAL_VIEW_MODES = ["board", "list"] as const

const DEFAULT_SUMMARY: RenewalSummary = {
    total: 0,
    overdue: 0,
    dueSoon: 0,
    quoted: 0,
    chased: 0,
    pipelineValue: 0,
}

const DEFAULT_FORM: RenewalForm = {
    status: "OPEN",
    ownerUserId: "",
    estimatedValue: "",
    lastQuotedAt: "",
    lastChasedAt: "",
    notes: "",
    quoteId: "",
}

const DEFAULT_QUOTE_EDIT_FORM: QuoteEditForm = {
    customerId: "",
    siteId: "",
    projectName: "",
    validUntil: null,
    notes: "",
    terms: "",
}

const STATUS_OPTIONS = [
    { value: "__all__", label: "All statuses" },
    { value: "OPEN", label: "Open" },
    { value: "OVERDUE", label: "Overdue" },
    { value: "DUE_SOON", label: "Due Soon" },
    { value: "ON_HOLD", label: "On Hold" },
    { value: "QUOTED", label: "Quoted" },
    { value: "CHASED", label: "Chased" },
    { value: "WON", label: "Won" },
    { value: "LOST", label: "Lost" },
    { value: "COMPLETED", label: "Completed" },
    { value: "CLOSED", label: "Closed" },
]

const BOARD_COLUMNS = [
    { value: "OPEN", title: "Open", description: "Needs planning or first follow-up" },
    { value: "OVERDUE", title: "Overdue", description: "Due date has passed" },
    { value: "ON_HOLD", title: "On Hold", description: "Paused or waiting" },
    { value: "QUOTED", title: "Quoted", description: "Quote has been prepared" },
    { value: "CHASED", title: "Chased", description: "Follow-up is in progress" },
    { value: "WON", title: "Won", description: "Commercially accepted" },
    { value: "LOST", title: "Lost", description: "Opportunity did not proceed" },
    { value: "COMPLETED", title: "Completed", description: "Renewal work completed" },
    { value: "CLOSED", title: "Closed", description: "No further action" },
]

const formatDate = (value?: string | null) => {
    if (!value) return "Not set"
    const parsed = new Date(value)
    if (Number.isNaN(parsed.getTime())) return "Not set"
    return parsed.toLocaleDateString("en-GB")
}

const formatCurrency = (value?: number | null) => `£${Number(value ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

const formatTimingState = (value?: string | null) => {
    switch ((value ?? "").toUpperCase()) {
        case "OVERDUE":
            return "Overdue"
        case "DUE_SOON":
            return "Due Soon"
        case "UPCOMING":
            return "Upcoming"
        case "CLOSED":
            return "Closed"
        default:
            return "Open"
    }
}

const getCommercialStageTone = (value?: string | null) => {
    switch (String(value ?? "OPEN").toUpperCase()) {
        case "OVERDUE":
            return "Overdue"
        case "QUOTED":
        case "CHASED":
            return "Open"
        case "WON":
        case "COMPLETED":
        case "CLOSED":
            return "Completed"
        case "LOST":
            return "Rejected"
        case "ON_HOLD":
            return "Pending"
        default:
            return "Open"
    }
}

export default function RenewalsPage() {
    const { toast } = useToast()
    const { canView, canManage } = getModulePermissions("reports.view", "reports.manage")
    const { renewals, sites: sitesEnabled } = useTenantFeatures()
    const [error, setError] = useState<string | null>(null)
    const [loading, setLoading] = useState(true)
    const [refreshing, setRefreshing] = useState(false)
    const [renewalData, setRenewalData] = useState<RenewalResponse>({ items: [], summary: DEFAULT_SUMMARY })
    const [users, setUsers] = useState<TenantUserOption[]>([])
    const [quotes, setQuotes] = useState<QuoteOption[]>([])
    const [customers, setCustomers] = useState<any[]>([])
    const [customerSites, setCustomerSites] = useState<CustomerSiteOption[]>([])
    const [quoteCustomerSites, setQuoteCustomerSites] = useState<CustomerSiteOption[]>([])
    const [searchQuery, setSearchQuery] = useState("")
    const [statusFilter, setStatusFilter] = useState("__all__")
    const [ownerFilter, setOwnerFilter] = useState("__all__")
    const [customerFilter, setCustomerFilter] = useState("__all__")
    const [siteFilter, setSiteFilter] = useState("__all__")
    const [dueMonth, setDueMonth] = useState("")
    const [editTarget, setEditTarget] = useState<RenewalOpportunity | null>(null)
    const [editOpen, setEditOpen] = useState(false)
    const [saving, setSaving] = useState(false)
    const [form, setForm] = useState<RenewalForm>(DEFAULT_FORM)
    const [quoteEditOpen, setQuoteEditOpen] = useState(false)
    const [quoteEditTarget, setQuoteEditTarget] = useState<EditableQuote | null>(null)
    const [quoteEditRenewalId, setQuoteEditRenewalId] = useState<string | null>(null)
    const [quoteEditForm, setQuoteEditForm] = useState<QuoteEditForm>(DEFAULT_QUOTE_EDIT_FORM)
    const [quoteEditItems, setQuoteEditItems] = useState<QuoteEditItem[]>([])
    const [quoteEditErrors, setQuoteEditErrors] = useState<{ projectName?: string; items?: string }>({})
    const [quoteEditItemErrors, setQuoteEditItemErrors] = useState<Record<string, { description?: string; quantity?: string; unitPrice?: string }>>({})
    const [quoteSavingMode, setQuoteSavingMode] = useState<"save" | null>(null)
    const [quoteCreateRenewal, setQuoteCreateRenewal] = useState<RenewalOpportunity | null>(null)
    const [viewMode, setViewMode] = useSavedViewMode<RenewalViewMode>("pipstack:view-mode:admin-renewals", "board", RENEWAL_VIEW_MODES)
    const [draggedRenewalId, setDraggedRenewalId] = useState<string | null>(null)
    const [dragOverStatus, setDragOverStatus] = useState<string | null>(null)

    const calcQuoteTotals = (items: Array<{ quantity: number; unitPrice: number; taxRate: number }>) => {
        const subtotal = items.reduce((acc, item) => acc + (item.quantity * item.unitPrice), 0)
        const taxTotal = items.reduce((acc, item) => acc + ((item.quantity * item.unitPrice) * (item.taxRate / 100)), 0)
        return { subtotal, taxTotal, total: subtotal + taxTotal }
    }

    const loadRenewals = async (showRefreshState = false) => {
        if (!renewals) {
            setLoading(false)
            return
        }
        if (showRefreshState) {
            setRefreshing(true)
        } else {
            setLoading(true)
        }

        try {
            const params = new URLSearchParams()
            if (statusFilter !== "__all__") {
                params.set("status", statusFilter)
            }
            if (ownerFilter !== "__all__") {
                params.set("ownerUserId", ownerFilter)
            }
            if (customerFilter !== "__all__") {
                params.set("customerId", customerFilter)
            }
            if (siteFilter !== "__all__") {
                params.set("siteId", siteFilter)
            }
            if (dueMonth) {
                params.set("dueMonth", dueMonth)
            }

            const res = await apiGet<RenewalResponse>(`/reports/renewals${params.toString() ? `?${params.toString()}` : ""}`)
            setRenewalData({
                items: Array.isArray(res.data?.items) ? res.data.items : [],
                summary: res.data?.summary ?? DEFAULT_SUMMARY,
            })
            setError(null)
        } catch (err: any) {
            setError(err?.message ?? "Failed to load renewals")
        } finally {
            setLoading(false)
            setRefreshing(false)
        }
    }

    useEffect(() => {
        const loadLookups = async () => {
            if (!renewals) return
            try {
                const [usersRes, quotesRes, customersRes] = await Promise.all([
                    apiGet<TenantUserOption[]>("/users").catch(() => ({ data: [] as TenantUserOption[] })),
                    apiGet<QuoteOption[]>("/quotes").catch(() => ({ data: [] as QuoteOption[] })),
                    apiGet<any[]>("/customers").catch(() => ({ data: [] as any[] })),
                ])
                setUsers(Array.isArray(usersRes.data) ? usersRes.data : [])
                setQuotes(Array.isArray(quotesRes.data) ? quotesRes.data : [])
                setCustomers(Array.isArray(customersRes.data) ? customersRes.data : [])
            } catch {
                setUsers([])
                setQuotes([])
                setCustomers([])
            }
        }

        void loadLookups()
    }, [renewals])

    useEffect(() => {
        const loadSites = async () => {
            if (!sitesEnabled || customerFilter === "__all__") {
                setCustomerSites([])
                setSiteFilter("__all__")
                return
            }

            try {
                const sites = await fetchCustomerSites(customerFilter)
                setCustomerSites(sites)
                setSiteFilter((prev) => (sites.some((site) => site.id === prev) ? prev : "__all__"))
            } catch (err: any) {
                setCustomerSites([])
                setSiteFilter("__all__")
                setError(err?.message ?? "Failed to load customer sites")
            }
        }

        void loadSites()
    }, [customerFilter, sitesEnabled])

    useEffect(() => {
        const loadQuoteSites = async () => {
            if (!sitesEnabled || !quoteEditForm.customerId) {
                setQuoteCustomerSites([])
                return
            }
            try {
                const sites = await fetchCustomerSites(quoteEditForm.customerId)
                setQuoteCustomerSites(sites)
                setQuoteEditForm((prev) => ({
                    ...prev,
                    siteId: sites.some((site) => site.id === prev.siteId) ? prev.siteId : "",
                }))
            } catch (err: any) {
                setQuoteCustomerSites([])
                setError(err?.message ?? "Failed to load customer sites")
            }
        }
        void loadQuoteSites()
    }, [quoteEditForm.customerId, sitesEnabled])

    useEffect(() => {
        void loadRenewals()
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [renewals, statusFilter, ownerFilter, customerFilter, siteFilter, dueMonth])

    const filteredItems = useMemo(() => {
        const query = searchQuery.trim().toLowerCase()
        if (!query) {
            return renewalData.items
        }
        return renewalData.items.filter((item) =>
            item.title.toLowerCase().includes(query) ||
            String(item.customerName ?? "").toLowerCase().includes(query) ||
            String(item.siteName ?? "").toLowerCase().includes(query) ||
            String(item.siteReference ?? "").toLowerCase().includes(query) ||
            String(item.reportType ?? "").toLowerCase().includes(query) ||
            String(item.reference ?? "").toLowerCase().includes(query)
        )
    }, [renewalData.items, searchQuery])
    const renewalsPagination = useClientPagination(filteredItems)

    const boardItemsByStatus = useMemo(() => {
        const grouped = new Map<string, RenewalOpportunity[]>()
        BOARD_COLUMNS.forEach((column) => grouped.set(column.value, []))
        filteredItems.forEach((item) => {
            const status = String(item.status ?? "OPEN").toUpperCase()
            const key = grouped.has(status) ? status : "OPEN"
            grouped.get(key)?.push(item)
        })
        return grouped
    }, [filteredItems])
    const { orderedColumns: orderedBoardColumns, getColumnDragProps } = useSavedColumnOrder(
        BOARD_COLUMNS,
        "pipstack:board-columns:admin-renewals",
        (column) => column.value
    )

    const moveRenewalToStatus = async (renewalId: string, nextStatus: string) => {
        const renewal = renewalData.items.find((item) => item.id === renewalId)
        if (!renewal || String(renewal.status ?? "").toUpperCase() === nextStatus) return

        const previousItems = renewalData.items
        setRenewalData((prev) => ({
            ...prev,
            items: prev.items.map((item) => (item.id === renewalId ? { ...item, status: nextStatus } : item)),
        }))

        try {
            await apiPut<RenewalOpportunity>(`/reports/renewals/${renewalId}`, {
                status: nextStatus,
                ownerUserId: renewal.ownerUserId || undefined,
                estimatedValue: renewal.estimatedValue ?? undefined,
                lastQuotedAt: renewal.lastQuotedAt ?? undefined,
                lastChasedAt: renewal.lastChasedAt ?? undefined,
                notes: renewal.notes ?? undefined,
                quoteId: renewal.quoteId ?? undefined,
            })
            toast({
                title: "Renewal moved",
                description: `"${renewal.title}" moved to ${nextStatus.replace(/_/g, " ")}.`,
                variant: "success",
            })
            await loadRenewals(true)
        } catch (err: any) {
            setRenewalData((prev) => ({ ...prev, items: previousItems }))
            toast({
                title: "Unable to move renewal",
                description: err?.message ?? "Please try again.",
                variant: "error",
            })
        }
    }

    const handleBoardDrop = async (event: DragEvent<HTMLDivElement>, nextStatus: string) => {
        if (isBoardColumnDrag(event)) return
        event.preventDefault()
        setDragOverStatus(null)
        const renewalId = event.dataTransfer.getData("text/plain") || draggedRenewalId
        setDraggedRenewalId(null)
        if (!renewalId || !canManage) return
        await moveRenewalToStatus(renewalId, nextStatus)
    }

    const openEditModal = (item: RenewalOpportunity) => {
        setEditTarget(item)
        setForm({
            status: item.status ?? "OPEN",
            ownerUserId: item.ownerUserId ?? "",
            estimatedValue: item.estimatedValue != null ? String(item.estimatedValue) : "",
            lastQuotedAt: item.lastQuotedAt ? new Date(item.lastQuotedAt).toISOString().slice(0, 10) : "",
            lastChasedAt: item.lastChasedAt ? new Date(item.lastChasedAt).toISOString().slice(0, 10) : "",
            notes: item.notes ?? "",
            quoteId: item.quoteId ?? "",
        })
        setEditOpen(true)
    }

    const availableQuotes = useMemo(() => {
        if (!editTarget) {
            return [] as QuoteOption[]
        }
        return quotes.filter((quote) =>
            quote.customerId === editTarget.customerId &&
            (!editTarget.siteId || quote.siteId === editTarget.siteId)
        )
    }, [editTarget, quotes])

    const saveRenewal = async () => {
        if (!editTarget) return
        setSaving(true)
        try {
            await apiPut<RenewalOpportunity>(`/reports/renewals/${editTarget.id}`, {
                status: form.status,
                ownerUserId: form.ownerUserId || undefined,
                estimatedValue: form.estimatedValue || undefined,
                lastQuotedAt: form.lastQuotedAt || undefined,
                lastChasedAt: form.lastChasedAt || undefined,
                notes: form.notes || undefined,
                quoteId: form.quoteId || undefined,
            })
            toast({ title: "Renewal updated", description: "Renewal register changes have been saved.", variant: "success" })
            setEditOpen(false)
            setEditTarget(null)
            setForm(DEFAULT_FORM)
            await loadRenewals(true)
        } catch (err: any) {
            toast({ title: "Unable to update renewal", description: err?.message ?? "Please try again.", variant: "error" })
        } finally {
            setSaving(false)
        }
    }

    const refreshRenewalRegister = async () => {
        if (!renewals) return
        if (!canManage) {
            await loadRenewals(true)
            return
        }

        setRefreshing(true)
        try {
            const res = await apiPost<RenewalResponse>("/reports/renewals/sync", {})
            const sync = res.data?.sync
            toast({
                title: "Renewal register refreshed",
                description: sync
                    ? `Scanned ${sync.scanned} compliance record(s), tracking ${sync.tracked} renewal opportunity(s).`
                    : "Renewal opportunities are up to date.",
                variant: "success",
            })
            await loadRenewals(true)
            setError(null)
        } catch (err: any) {
            toast({ title: "Unable to refresh renewals", description: err?.message ?? "Please try again.", variant: "error" })
        } finally {
            setRefreshing(false)
            setLoading(false)
        }
    }

    const openQuoteEditModal = async (quoteId: string, renewalId?: string) => {
        try {
            const response = await apiGet<EditableQuote>(`/quotes/${quoteId}`)
            const data = response.data
            const nextQuote = {
                id: data.id,
                quoteNumber: data.quoteNumber ?? "QT-PENDING",
                customerId: data.customerId ?? "",
                customerName: data.customerName ?? null,
                siteId: data.siteId ?? "",
                siteName: data.siteName ?? null,
                title: data.title ?? "Quote",
                validUntil: data.validUntil ?? null,
                status: data.status ?? "DRAFT",
                lineItems: Array.isArray(data.lineItems) ? data.lineItems : [],
                notes: data.notes ?? "",
                termsAndConditions: data.termsAndConditions ?? "",
            }

            setQuoteEditTarget(nextQuote)
            setQuoteEditRenewalId(renewalId ?? null)
            setQuoteEditForm({
                customerId: nextQuote.customerId ?? "",
                siteId: nextQuote.siteId ?? "",
                projectName: nextQuote.title,
                validUntil: nextQuote.validUntil ? new Date(nextQuote.validUntil) : null,
                notes: nextQuote.notes ?? "",
                terms: nextQuote.termsAndConditions ?? "",
            })
            setQuoteEditItems(
                nextQuote.lineItems.length > 0
                    ? nextQuote.lineItems.map((item, idx) => ({
                        id: `${nextQuote.id}-${idx}`,
                        description: item.description ?? "",
                        quantity: Number(item.quantity ?? 1),
                        unitPrice: Number(item.unitPrice ?? 0),
                        taxRate: Number(item.vatRate ?? 20),
                    }))
                    : [{ id: `${nextQuote.id}-0`, description: "", quantity: 1, unitPrice: 0, taxRate: 20 }]
            )
            setQuoteEditErrors({})
            setQuoteEditItemErrors({})
            setQuoteEditOpen(true)
        } catch (err: any) {
            toast({
                title: "Unable to open quote",
                description: err?.message ?? "Please try again.",
                variant: "error",
            })
        }
    }

    const openCreateQuoteDraft = (item: RenewalOpportunity) => {
        const validUntil = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000)
        const lineDescription =
            [item.title, item.reportType, item.reference].filter(Boolean).join(" • ") || "Renewal follow-up work"
        const estimatedValue = Number(item.estimatedValue ?? 0)

        setQuoteCreateRenewal(item)
        setQuoteEditRenewalId(item.id)
        setQuoteEditTarget({
            id: "__new__",
            quoteNumber: null,
            customerId: item.customerId,
            customerName: item.customerName,
            siteId: item.siteId,
            siteName: item.siteName,
            title: `${item.title} Renewal Quote`,
            validUntil: validUntil.toISOString(),
            status: "DRAFT",
            lineItems: [
                {
                    description: lineDescription,
                    quantity: 1,
                    unitPrice: Number.isFinite(estimatedValue) && estimatedValue >= 0 ? estimatedValue : 0,
                    vatRate: 20,
                },
            ],
            notes: item.notes ?? "",
            termsAndConditions: "",
        })
        setQuoteEditForm({
            customerId: item.customerId,
            siteId: item.siteId,
            projectName: `${item.title} Renewal Quote`,
            validUntil,
            notes: item.notes ?? "",
            terms: "",
        })
        setQuoteEditItems([
            {
                id: `${item.id}-new-0`,
                description: lineDescription,
                quantity: 1,
                unitPrice: Number.isFinite(estimatedValue) && estimatedValue >= 0 ? estimatedValue : 0,
                taxRate: 20,
            },
        ])
        setQuoteEditErrors({})
        setQuoteEditItemErrors({})
        setQuoteEditOpen(true)
    }

    const saveQuoteChanges = async () => {
        if (!quoteEditTarget) return

        const nextErrors: { projectName?: string; items?: string } = {}
        const nextItemErrors: Record<string, { description?: string; quantity?: string; unitPrice?: string }> = {}

        if (!quoteEditForm.projectName.trim()) nextErrors.projectName = "Project name is required."
        if (quoteEditItems.length === 0) nextErrors.items = "Add at least one line item."

        quoteEditItems.forEach((item) => {
            const itemError: { description?: string; quantity?: string; unitPrice?: string } = {}
            if (!item.description.trim()) itemError.description = "Description required."
            if (!item.quantity || item.quantity <= 0) itemError.quantity = "Qty must be > 0."
            if (item.unitPrice < 0) itemError.unitPrice = "Price must be >= 0."
            if (Object.keys(itemError).length > 0) {
                nextItemErrors[item.id] = itemError
            }
        })

        setQuoteEditErrors(nextErrors)
        setQuoteEditItemErrors(nextItemErrors)
        if (Object.keys(nextErrors).length > 0 || Object.keys(nextItemErrors).length > 0) return

        const totals = calcQuoteTotals(quoteEditItems)

        try {
            setQuoteSavingMode("save")
            const quotePayload = {
                title: quoteEditForm.projectName,
                customerId: quoteEditForm.customerId || undefined,
                siteId: quoteEditForm.siteId || undefined,
                validUntil: quoteEditForm.validUntil ? quoteEditForm.validUntil.toISOString() : undefined,
                notes: quoteEditForm.notes || undefined,
                termsAndConditions: quoteEditForm.terms || undefined,
                lineItems: quoteEditItems.map((item) => ({
                    description: item.description,
                    quantity: item.quantity,
                    unitPrice: item.unitPrice,
                    vatRate: item.taxRate,
                })),
                total: totals.total,
            }
            const response = quoteCreateRenewal
                ? await apiPost<RenewalQuoteCreateResponse>(`/reports/renewals/${quoteCreateRenewal.id}/create-quote`, {
                    ...quotePayload,
                    estimatedValue: totals.subtotal,
                })
                : await apiPut<any>(`/quotes/${quoteEditTarget.id}`, quotePayload)

            const finalQuote = quoteCreateRenewal ? response.data?.quote : response.data
            const finalQuoteId = quoteCreateRenewal ? response.data?.quote?.id : quoteEditTarget.id

            if (quoteEditRenewalId) {
                await apiPut(`/reports/renewals/${quoteEditRenewalId}`, {
                    estimatedValue: totals.subtotal,
                    quoteId: finalQuoteId,
                })
            }

            setQuoteEditTarget((prev) =>
                prev
                    ? {
                        ...prev,
                        customerId: finalQuote?.customerId ?? quoteEditForm.customerId,
                        customerName: finalQuote?.customerName ?? prev.customerName,
                        siteId: finalQuote?.siteId ?? quoteEditForm.siteId,
                        siteName: finalQuote?.siteName ?? prev.siteName,
                        title: finalQuote?.title ?? quoteEditForm.projectName,
                        validUntil: finalQuote?.validUntil ?? quoteEditForm.validUntil?.toISOString(),
                        id: finalQuoteId ?? prev.id,
                        quoteNumber: finalQuote?.quoteNumber ?? prev.quoteNumber,
                        status: finalQuote?.status ?? prev.status,
                        lineItems: finalQuote?.lineItems ?? prev.lineItems,
                        notes: finalQuote?.notes ?? quoteEditForm.notes,
                        termsAndConditions: finalQuote?.termsAndConditions ?? quoteEditForm.terms,
                    }
                    : prev
            )

            toast({
                title: quoteCreateRenewal ? "Quote created" : "Quote updated",
                description: quoteCreateRenewal
                    ? "The renewal quote has been created and linked."
                    : "The renewal quote has been updated successfully.",
                variant: "success",
            })
            await loadRenewals(true)
            setQuoteCreateRenewal(null)
            setQuoteEditOpen(false)
        } catch (err: any) {
            toast({
                title: "Unable to save quote",
                description: err?.message ?? "Please try again.",
                variant: "error",
            })
        } finally {
            setQuoteSavingMode(null)
        }
    }

    const renderRenewalActions = (item: RenewalOpportunity, compact = false) => (
        <div className={`flex flex-wrap ${compact ? "gap-1.5" : "justify-end gap-2"}`}>
            {item.quoteId ? (
                <>
                    <Button
                        variant="outline"
                        size="sm"
                        className={compact ? "h-8 bg-white/60 px-2 text-xs" : "bg-white/40"}
                        onClick={() => void openQuoteEditModal(item.quoteId as string, item.id)}
                    >
                        Edit Quote
                    </Button>
                    <Button variant="outline" size="sm" className={compact ? "h-8 bg-white/60 px-2 text-xs" : "bg-white/40"} asChild>
                        <Link href={`/admin/quotes/${item.quoteId}`}>Open Quote</Link>
                    </Button>
                </>
            ) : (
                <Button
                    variant="outline"
                    size="sm"
                    className={compact ? "h-8 bg-white/60 px-2 text-xs" : "bg-white/40"}
                    onClick={() => openCreateQuoteDraft(item)}
                    disabled={!canManage}
                >
                    Create Quote
                </Button>
            )}
            <Button
                variant="outline"
                size="sm"
                className={compact ? "h-8 gap-1 bg-white/60 px-2 text-xs" : "bg-white/40"}
                onClick={() => openEditModal(item)}
                disabled={!canManage}
            >
                <SquarePen className="h-4 w-4" />
                Update
            </Button>
        </div>
    )

    const renderRenewalCard = (item: RenewalOpportunity) => (
        <div
            key={item.id}
            draggable={canManage}
            onDragStart={(event) => {
                setDraggedRenewalId(item.id)
                event.dataTransfer.effectAllowed = "move"
                event.dataTransfer.setData("text/plain", item.id)
            }}
            onDragEnd={() => {
                setDraggedRenewalId(null)
                setDragOverStatus(null)
            }}
            className={`rounded-2xl border border-glass-border/70 bg-white/60 p-4 shadow-sm transition hover:-translate-y-0.5 hover:bg-white/80 ${
                canManage ? "cursor-grab active:cursor-grabbing" : ""
            } ${draggedRenewalId === item.id ? "opacity-60" : ""}`}
        >
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                    <div className="line-clamp-2 text-sm font-semibold text-foreground">{item.title}</div>
                    <div className="mt-1 text-xs text-muted-foreground">
                        {item.reportType || "Recurring compliance work"}
                        {item.reference ? ` • ${item.reference}` : ""}
                    </div>
                </div>
                <StatusBadge status={formatTimingState(item.timingState)} />
            </div>

            <div className="mt-3 rounded-xl bg-white/55 p-3 text-xs text-muted-foreground">
                <div className="font-medium text-foreground">{item.siteName ?? "Site"}</div>
                <div className="mt-1">{item.customerName ?? "Customer"}</div>
                <div className="mt-1">{[item.siteCategory, item.siteReference].filter(Boolean).join(" • ") || "Standard site scope"}</div>
            </div>

            <div className="mt-3 grid gap-1.5 text-xs text-muted-foreground">
                <div>Due: <span className="font-medium text-foreground">{formatDate(item.dueDate)}</span></div>
                <div>Owner: <span className="font-medium text-foreground">{item.ownerName ?? "Unassigned"}</span></div>
                <div>Value: <span className="font-medium text-foreground">{item.estimatedValue != null ? formatCurrency(item.estimatedValue) : "Value not set"}</span></div>
                <div>Quote: <span className="font-medium text-foreground">{item.quoteNumber ?? "Not linked"}</span></div>
            </div>

            <div className="mt-4">
                {renderRenewalActions(item, true)}
            </div>
        </div>
    )

    if (!canView) {
        return (
            <PageContainer>
                <GlassCard>
                    <GlassCardHeader>
                        <GlassCardTitle>Renewals</GlassCardTitle>
                    </GlassCardHeader>
                    <GlassCardContent>You do not have access to view renewals.</GlassCardContent>
                </GlassCard>
            </PageContainer>
        )
    }

    if (!renewals) {
        return (
            <PageContainer>
                <GlassCard>
                    <GlassCardHeader>
                        <GlassCardTitle>Renewals</GlassCardTitle>
                        <GlassCardDescription>Recurring test and certificate follow-up register.</GlassCardDescription>
                    </GlassCardHeader>
                    <GlassCardContent className="space-y-3 text-sm text-muted-foreground">
                        <p>The renewals module is currently disabled for this workspace.</p>
                        <p>Enable it from <Link href="/admin/settings" className="font-medium text-primary underline underline-offset-2">Settings</Link> when you are ready to track upcoming recurring work.</p>
                    </GlassCardContent>
                </GlassCard>
            </PageContainer>
        )
    }

    return (
        <PageContainer>
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between mb-6">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-foreground">Tests Due & Renewals</h1>
                    <p className="text-sm text-muted-foreground mt-1">
                        Run the next recurring work cycle from approved compliance records, with due dates, owners, quotes, and pipeline follow-up in one place.
                    </p>
                </div>
                <Button variant="outline" className="gap-2 bg-white/40" onClick={() => void refreshRenewalRegister()} disabled={refreshing || loading}>
                    <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
                    Refresh Register
                </Button>
            </div>

            <div className="mb-6 grid gap-4 xl:grid-cols-3">
                <GlassCard>
                    <GlassCardContent className="p-5">
                        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Purpose</div>
                        <div className="mt-2 text-sm font-medium text-foreground">Operational and commercial follow-up</div>
                        <p className="mt-2 text-xs text-muted-foreground">
                            Use this screen after a compliance record is approved to manage due work, ownership, quoting, and chase activity.
                        </p>
                    </GlassCardContent>
                </GlassCard>
                <GlassCard>
                    <GlassCardContent className="p-5">
                        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Source</div>
                        <div className="mt-2 text-sm font-medium text-foreground">Approved compliance reports and certificates</div>
                        <p className="mt-2 text-xs text-muted-foreground">
                            Renewal opportunities are generated from approved site reports, so this register only tracks work that is ready for delivery planning.
                        </p>
                    </GlassCardContent>
                </GlassCard>
                <GlassCard>
                    <GlassCardContent className="p-5">
                        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Output</div>
                        <div className="mt-2 text-sm font-medium text-foreground">Quotes, chase actions, and recurring jobs</div>
                        <p className="mt-2 text-xs text-muted-foreground">
                            Observers should treat this as the revenue and scheduling register, not the place where report approval decisions are made.
                        </p>
                    </GlassCardContent>
                </GlassCard>
            </div>

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5 mb-6">
                <GlassCard className="p-5">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-sm text-muted-foreground">Active Renewals</p>
                            <h3 className="text-2xl font-bold mt-2">{renewalData.summary.total}</h3>
                        </div>
                        <CalendarClock className="h-8 w-8 text-primary" />
                    </div>
                </GlassCard>
                <GlassCard className="p-5">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-sm text-muted-foreground">Overdue</p>
                            <h3 className="text-2xl font-bold mt-2 text-destructive">{renewalData.summary.overdue}</h3>
                        </div>
                        <StatusBadge status="Overdue" />
                    </div>
                </GlassCard>
                <GlassCard className="p-5">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-sm text-muted-foreground">Due Soon</p>
                            <h3 className="text-2xl font-bold mt-2">{renewalData.summary.dueSoon}</h3>
                        </div>
                        <TrendingUp className="h-8 w-8 text-amber-500" />
                    </div>
                </GlassCard>
                <GlassCard className="p-5">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-sm text-muted-foreground">Quoted / Chased</p>
                            <h3 className="text-2xl font-bold mt-2">{renewalData.summary.quoted + renewalData.summary.chased}</h3>
                        </div>
                        <StatusBadge status="Open">{renewalData.summary.quoted}/{renewalData.summary.chased}</StatusBadge>
                    </div>
                </GlassCard>
                <GlassCard className="p-5">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-sm text-muted-foreground">Pipeline Value</p>
                            <h3 className="text-2xl font-bold mt-2">{formatCurrency(renewalData.summary.pipelineValue)}</h3>
                        </div>
                        <PoundSterling className="h-8 w-8 text-emerald-600" />
                    </div>
                </GlassCard>
            </div>

            <GlassCard>
                <GlassCardHeader className="pb-3 border-b border-glass-border/50">
                    <div className="flex flex-col gap-4">
                        <div>
                            <GlassCardTitle>Renewal Register</GlassCardTitle>
                            <GlassCardDescription>Upcoming recurring work and commercial follow-up generated from approved site reports and certificates.</GlassCardDescription>
                        </div>
                        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                        <div className="flex flex-nowrap items-center gap-3 overflow-x-auto pb-1">
                            <div className="relative w-[290px] shrink-0">
                                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                                <Input
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    placeholder="Search site, customer, reference..."
                                    className="pl-9 bg-white/40"
                                />
                            </div>
                            <Select value={statusFilter} onValueChange={setStatusFilter}>
                                <SelectTrigger className="w-[170px] shrink-0 bg-white/40">
                                    <SelectValue placeholder="Status" />
                                </SelectTrigger>
                                <SelectContent>
                                    {STATUS_OPTIONS.map((option) => (
                                        <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            <Select value={ownerFilter} onValueChange={setOwnerFilter}>
                                <SelectTrigger className="w-[210px] shrink-0 bg-white/40">
                                    <SelectValue placeholder="All owners" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="__all__">All owners</SelectItem>
                                    {users.map((user) => (
                                        <SelectItem key={user.id} value={user.id}>
                                            {user.fullName ?? user.email ?? "Team member"}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            <Select
                                value={customerFilter}
                                onValueChange={(value) => {
                                    setCustomerFilter(value)
                                    setSiteFilter("__all__")
                                }}
                            >
                                <SelectTrigger className="w-[220px] shrink-0 bg-white/40">
                                    <SelectValue placeholder="All customers" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="__all__">All customers</SelectItem>
                                    {customers.map((customer) => (
                                        <SelectItem key={customer.id} value={customer.id}>
                                            {customer.name ?? customer.email ?? "Customer"}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            {sitesEnabled ? (
                                <Select value={siteFilter} onValueChange={setSiteFilter}>
                                    <SelectTrigger className="w-[220px] shrink-0 bg-white/40" disabled={customerFilter === "__all__"}>
                                        <SelectValue placeholder={customerFilter === "__all__" ? "Select customer first" : "All sites"} />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="__all__">All sites</SelectItem>
                                        {customerSites.map((site) => (
                                            <SelectItem key={site.id} value={site.id}>
                                                {formatCustomerSiteLabel(site)}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            ) : null}
                            <Input
                                type="month"
                                value={dueMonth}
                                onChange={(e) => setDueMonth(e.target.value)}
                                className="w-[170px] shrink-0 bg-white/40"
                            />
                        </div>
                        <div className="flex shrink-0 rounded-xl border border-glass-border/70 bg-white/45 p-1">
                            <Button
                                type="button"
                                size="sm"
                                variant={viewMode === "board" ? "default" : "ghost"}
                                className="gap-2"
                                onClick={() => setViewMode("board")}
                            >
                                <LayoutGrid className="h-4 w-4" />
                                Board
                            </Button>
                            <Button
                                type="button"
                                size="sm"
                                variant={viewMode === "list" ? "default" : "ghost"}
                                className="gap-2"
                                onClick={() => setViewMode("list")}
                            >
                                <List className="h-4 w-4" />
                                List
                            </Button>
                        </div>
                        </div>
                    </div>
                </GlassCardHeader>
                <GlassCardContent className="p-0">
                    {loading ? (
                        <div className="p-10 text-sm text-muted-foreground">Loading renewals register...</div>
                    ) : filteredItems.length === 0 ? (
                        <div className="p-10 text-center text-sm text-muted-foreground">
                            No renewal opportunities match the current filters yet.
                        </div>
                    ) : viewMode === "board" ? (
                        <div className="-mx-1 overflow-x-auto p-4">
                            <div className="grid min-w-[2160px] grid-cols-9 gap-4">
                                {orderedBoardColumns.map((column) => {
                                    const items = boardItemsByStatus.get(column.value) ?? []
                                    return (
                                        <div
                                            key={column.value}
                                            onDragOver={(event) => {
                                                if (isBoardColumnDrag(event)) return
                                                if (!canManage) return
                                                event.preventDefault()
                                                event.dataTransfer.dropEffect = "move"
                                                setDragOverStatus(column.value)
                                            }}
                                            onDragLeave={() => {
                                                if (dragOverStatus === column.value) setDragOverStatus(null)
                                            }}
                                            onDrop={(event) => void handleBoardDrop(event, column.value)}
                                            className={`rounded-3xl border p-3 transition ${
                                                dragOverStatus === column.value
                                                    ? "border-primary/50 bg-primary/10"
                                                    : "border-glass-border/70 bg-white/30"
                                            }`}
                                        >
                                            <div
                                                className="mb-3 flex cursor-grab items-start justify-between gap-2 rounded-2xl px-1 active:cursor-grabbing"
                                                title="Drag to rearrange columns"
                                                {...getColumnDragProps(column)}
                                            >
                                                <div>
                                                    <div className="text-sm font-semibold text-foreground">{column.title}</div>
                                                    <div className="mt-1 text-xs text-muted-foreground">
                                                        {column.description}
                                                        {canManage ? " • Drag cards here" : ""}
                                                    </div>
                                                </div>
                                                <span className="rounded-full bg-white/70 px-2 py-1 text-xs font-semibold text-muted-foreground">
                                                    {items.length}
                                                </span>
                                            </div>
                                            <div className="grid gap-3">
                                                {items.length === 0 ? (
                                                    <div className="rounded-2xl border border-dashed border-glass-border/70 bg-white/35 p-6 text-center text-xs text-muted-foreground">
                                                        No renewals in this stage.
                                                    </div>
                                                ) : (
                                                    items.map((item) => renderRenewalCard(item))
                                                )}
                                            </div>
                                        </div>
                                    )
                                })}
                            </div>
                        </div>
                    ) : (
                        <>
                        <Table>
                            <TableHeader className="bg-black/5">
                                <TableRow>
                                    <TableHead>Next Due Work</TableHead>
                                    <TableHead>Operational Site</TableHead>
                                    <TableHead>Due Window</TableHead>
                                    <TableHead>Commercial Pipeline</TableHead>
                                    <TableHead>Owner</TableHead>
                                    <TableHead>Quote & Value</TableHead>
                                    <TableHead className="text-right">Action</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {renewalsPagination.paginatedItems.map((item) => (
                                    <TableRow key={item.id}>
                                        <TableCell className="min-w-[240px] align-top">
                                            <div className="font-medium text-foreground">{item.title}</div>
                                            <div className="mt-1 text-xs text-muted-foreground">
                                                {item.reportType || "Recurring compliance work"}
                                                {item.reference ? ` • ${item.reference}` : ""}
                                            </div>
                                            <div className="text-xs text-muted-foreground">
                                                Source outcome: {item.outcome ?? "Not recorded"}
                                            </div>
                                        </TableCell>
                                        <TableCell className="min-w-[240px] align-top">
                                            <div className="font-medium">{item.siteName ?? "Site"}</div>
                                            <div className="mt-1 text-xs text-muted-foreground">
                                                {item.customerName ?? "Customer"}
                                            </div>
                                            <div className="text-xs text-muted-foreground">
                                                {[item.siteCategory, item.siteReference].filter(Boolean).join(" • ") || "Standard site scope"}
                                            </div>
                                        </TableCell>
                                        <TableCell className="min-w-[190px] align-top">
                                            <div className="font-medium">{formatDate(item.dueDate)}</div>
                                            <div className="mt-1">
                                                <StatusBadge status={formatTimingState(item.timingState)} />
                                            </div>
                                            <div className="text-xs text-muted-foreground mt-1">
                                                Window opens {formatDate(item.renewalWindowStart)}
                                            </div>
                                        </TableCell>
                                        <TableCell className="min-w-[210px] align-top">
                                            <StatusBadge status={getCommercialStageTone(item.status)}>
                                                {item.status.replace(/_/g, " ")}
                                            </StatusBadge>
                                            <div className="text-xs text-muted-foreground mt-2">
                                                Quoted: {formatDate(item.lastQuotedAt)}
                                            </div>
                                            <div className="text-xs text-muted-foreground">
                                                Chased: {formatDate(item.lastChasedAt)}
                                            </div>
                                        </TableCell>
                                        <TableCell className="align-top">
                                            <div className="font-medium">{item.ownerName ?? "Unassigned"}</div>
                                        </TableCell>
                                        <TableCell className="min-w-[190px] align-top">
                                            {item.quoteNumber ? (
                                                <>
                                                    <div className="font-medium">{item.quoteNumber}</div>
                                                    <div className="text-xs text-muted-foreground">{item.quoteWorkflowStatusLabel ?? item.quoteStatus ?? "Linked quote"}</div>
                                                    <div className="mt-1 text-xs font-medium text-foreground">
                                                        {item.estimatedValue != null ? formatCurrency(item.estimatedValue) : "Value not set"}
                                                    </div>
                                                </>
                                            ) : (
                                                <>
                                                    <span className="text-sm text-muted-foreground">Not linked</span>
                                                    <div className="mt-1 text-xs font-medium text-foreground">
                                                        {item.estimatedValue != null ? formatCurrency(item.estimatedValue) : "Value not set"}
                                                    </div>
                                                </>
                                            )}
                                        </TableCell>
                                        <TableCell className="text-right align-top">
                                            <div className="flex justify-end gap-2">
                                                {item.quoteId ? (
                                                    <Button
                                                        variant="outline"
                                                        size="sm"
                                                        className="bg-white/40"
                                                        onClick={() => void openQuoteEditModal(item.quoteId as string, item.id)}
                                                    >
                                                        Edit Quote
                                                    </Button>
                                                ) : (
                                                    <Button
                                                        variant="outline"
                                                        size="sm"
                                                        className="bg-white/40"
                                                        onClick={() => openCreateQuoteDraft(item)}
                                                        disabled={!canManage}
                                                    >
                                                        Create Quote
                                                    </Button>
                                                )}
                                                {item.quoteId ? (
                                                    <Link href={`/admin/quotes/${item.quoteId}`}>
                                                        <Button variant="outline" size="sm" className="bg-white/40">
                                                            Open Quote
                                                        </Button>
                                                    </Link>
                                                ) : null}
                                                <Button
                                                    variant="outline"
                                                    size="sm"
                                                    className="bg-white/40"
                                                    onClick={() => openEditModal(item)}
                                                    disabled={!canManage}
                                                >
                                                    <SquarePen className="h-4 w-4 mr-2" />
                                                    Update
                                                </Button>
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                        <DataPagination {...renewalsPagination} onPageChange={renewalsPagination.setPage} />
                        </>
                    )}
                </GlassCardContent>
            </GlassCard>

            <GlassModal
                open={quoteEditOpen}
                onOpenChange={(open) => {
                    setQuoteEditOpen(open)
                    if (!open) {
                        setQuoteEditTarget(null)
                        setQuoteEditRenewalId(null)
                        setQuoteCreateRenewal(null)
                        setQuoteEditForm(DEFAULT_QUOTE_EDIT_FORM)
                        setQuoteEditItems([])
                        setQuoteCustomerSites([])
                        setQuoteEditErrors({})
                        setQuoteEditItemErrors({})
                        setQuoteSavingMode(null)
                    }
                }}
                title={quoteCreateRenewal ? "Create Renewal Quote" : quoteEditTarget?.quoteNumber ? `Edit ${quoteEditTarget.quoteNumber}` : "Edit Quote"}
                description={quoteCreateRenewal ? "Review the quote details first. The quote is only created when you save changes." : "Adjust the renewal-generated quote before you continue with the usual quote workflow."}
                footer={
                    <div className="flex justify-end gap-2 w-full">
                        <Button variant="outline" onClick={() => setQuoteEditOpen(false)}>
                            Cancel
                        </Button>
                        <Button
                            onClick={() => void saveQuoteChanges()}
                            disabled={!canManage || quoteSavingMode !== null}
                        >
                            {quoteSavingMode === "save" ? "Saving..." : "Save Changes"}
                        </Button>
                    </div>
                }
            >
                {quoteEditTarget ? (
                    <div className="space-y-6">
                        <div className="rounded-xl border border-glass-border/60 bg-white/40 px-4 py-3">
                            <div className="font-medium">{quoteEditTarget.title}</div>
                            <div className="text-xs text-muted-foreground mt-1">
                                {quoteEditTarget.customerName ?? "Customer"}
                                {quoteEditTarget.siteName ? ` • ${quoteEditTarget.siteName}` : ""}
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label optional>Client</Label>
                                <Select
                                    value={quoteEditForm.customerId || "__none__"}
                                    createOption={{ label: "customer", href: "/admin/customers?create=customer" }}
                                    onValueChange={(value) =>
                                        setQuoteEditForm((prev) => ({
                                            ...prev,
                                            customerId: value === "__none__" ? "" : value,
                                            siteId: "",
                                        }))
                                    }
                                >
                                    <SelectTrigger className="w-full bg-white/60">
                                        <SelectValue placeholder="No linked customer" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="__none__">No linked customer</SelectItem>
                                        {customers.map((customer) => (
                                            <SelectItem key={customer.id} value={customer.id}>
                                                {customer.name ?? customer.email ?? "Customer"}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            {sitesEnabled ? (
                                <div className="space-y-2">
                                    <Label optional>Customer Site</Label>
                                    <Select
                                        value={quoteEditForm.siteId || "__none__"}
                                        createOption={quoteEditForm.customerId ? { label: "site", href: `/admin/customers/${quoteEditForm.customerId}?create=site` } : undefined}
                                        onValueChange={(value) =>
                                            setQuoteEditForm((prev) => ({ ...prev, siteId: value === "__none__" ? "" : value }))
                                        }
                                        disabled={!quoteEditForm.customerId}
                                    >
                                        <SelectTrigger className="w-full bg-white/60">
                                            <SelectValue placeholder={quoteEditForm.customerId ? "Select site (optional)" : "Select customer first"} />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="__none__">No linked site</SelectItem>
                                            {quoteCustomerSites.map((site) => (
                                                <SelectItem key={site.id} value={site.id}>
                                                    {formatCustomerSiteLabel(site)}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                    <p className="text-xs text-muted-foreground">
                                        {quoteEditForm.siteId
                                            ? formatCustomerSiteAddress(quoteCustomerSites.find((site) => site.id === quoteEditForm.siteId)) || "No address saved for this site."
                                            : "Optional, but recommended when the quote belongs to a specific site."}
                                    </p>
                                </div>
                            ) : null}
                            <div className="space-y-2">
                                <Label required>Project Name</Label>
                                <Input
                                    className={quoteEditErrors.projectName ? "border-destructive focus-visible:ring-destructive/50" : ""}
                                    value={quoteEditForm.projectName}
                                    onChange={(e) => setQuoteEditForm((prev) => ({ ...prev, projectName: e.target.value }))}
                                />
                                {quoteEditErrors.projectName ? <p className="text-xs text-destructive">{quoteEditErrors.projectName}</p> : null}
                            </div>
                            <div className="space-y-2">
                                <Label optional>Valid Until</Label>
                                <DatePicker
                                    selected={quoteEditForm.validUntil}
                                    onChange={(date: Date | null) => setQuoteEditForm((prev) => ({ ...prev, validUntil: date }))}
                                    dateFormat="MMM d, yyyy"
                                    className="h-9 w-full rounded-md border border-input bg-white/60 px-3 text-sm shadow-sm"
                                    wrapperClassName="w-full"
                                    placeholderText="Select date"
                                />
                            </div>
                        </div>

                        <div className="space-y-3">
                            <Label required>Line Items</Label>
                            <div className="hidden md:grid md:grid-cols-12 gap-4 px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                <div className="md:col-span-6">Description</div>
                                <div className="md:col-span-5 grid grid-cols-3 gap-4">
                                    <span className="text-center">Qty</span>
                                    <span className="col-span-2 text-right">Unit Price</span>
                                </div>
                                <div className="md:col-span-1 text-center">Remove</div>
                            </div>
                            {quoteEditItems.map((item) => (
                                <div key={item.id} className="grid grid-cols-1 md:grid-cols-12 gap-4 items-start md:items-center bg-white/30 p-3 rounded-lg border border-glass-border">
                                    <div className="md:col-span-6 space-y-1">
                                        <Label required className="md:hidden text-xs text-muted-foreground">Description</Label>
                                        <Input
                                            placeholder="Item description..."
                                            className={`bg-white/60 h-9 ${quoteEditItemErrors[item.id]?.description ? "border-destructive focus-visible:ring-destructive/50" : ""}`}
                                            value={item.description}
                                            onChange={(e) => setQuoteEditItems((prev) => prev.map((li) => li.id === item.id ? { ...li, description: e.target.value } : li))}
                                        />
                                        {quoteEditItemErrors[item.id]?.description ? <p className="text-xs text-destructive">{quoteEditItemErrors[item.id]?.description}</p> : null}
                                    </div>
                                    <div className="grid grid-cols-3 md:col-span-5 gap-4">
                                        <div className="space-y-1">
                                            <Label required className="md:hidden text-xs text-muted-foreground">Qty</Label>
                                            <Input
                                                type="number"
                                                min="1"
                                                className={`bg-white/60 h-9 text-center ${quoteEditItemErrors[item.id]?.quantity ? "border-destructive focus-visible:ring-destructive/50" : ""}`}
                                                value={item.quantity}
                                                onChange={(e) => setQuoteEditItems((prev) => prev.map((li) => li.id === item.id ? { ...li, quantity: parseInt(e.target.value) || 0 } : li))}
                                            />
                                            {quoteEditItemErrors[item.id]?.quantity ? <p className="text-xs text-destructive">{quoteEditItemErrors[item.id]?.quantity}</p> : null}
                                        </div>
                                        <div className="space-y-1 col-span-2">
                                            <Label required className="md:hidden text-xs text-muted-foreground">Unit Price</Label>
                                            <Input
                                                type="number"
                                                min="0"
                                                step="0.01"
                                                className={`bg-white/60 h-9 text-right ${quoteEditItemErrors[item.id]?.unitPrice ? "border-destructive focus-visible:ring-destructive/50" : ""}`}
                                                value={item.unitPrice}
                                                onChange={(e) => setQuoteEditItems((prev) => prev.map((li) => li.id === item.id ? { ...li, unitPrice: parseFloat(e.target.value) || 0 } : li))}
                                            />
                                            {quoteEditItemErrors[item.id]?.unitPrice ? <p className="text-xs text-destructive">{quoteEditItemErrors[item.id]?.unitPrice}</p> : null}
                                        </div>
                                    </div>
                                    <div className="md:col-span-1 flex justify-end md:justify-center">
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            onClick={() => setQuoteEditItems((prev) => prev.filter((li) => li.id !== item.id))}
                                            disabled={quoteEditItems.length === 1}
                                            className="text-muted-foreground hover:text-destructive h-9 w-9"
                                        >
                                            <Trash2 className="h-4 w-4" />
                                        </Button>
                                    </div>
                                </div>
                            ))}
                            <Button
                                variant="outline"
                                size="sm"
                                className="gap-2 bg-white/40 border-dashed"
                                onClick={() => setQuoteEditItems((prev) => [...prev, { id: Math.random().toString(), description: "", quantity: 1, unitPrice: 0, taxRate: 20 }])}
                            >
                                <Plus className="h-4 w-4" /> Add Line Item
                            </Button>
                            {quoteEditErrors.items ? <p className="text-xs text-destructive">{quoteEditErrors.items}</p> : null}
                        </div>

                        <div className="space-y-4">
                            <div className="space-y-2">
                                <Label optional>Notes</Label>
                                <Textarea
                                    rows={3}
                                    className="w-full bg-white/60 resize-none"
                                    value={quoteEditForm.notes}
                                    onChange={(e) => setQuoteEditForm((prev) => ({ ...prev, notes: e.target.value }))}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label optional>Terms</Label>
                                <Textarea
                                    rows={3}
                                    className="w-full bg-white/60 resize-none"
                                    value={quoteEditForm.terms}
                                    onChange={(e) => setQuoteEditForm((prev) => ({ ...prev, terms: e.target.value }))}
                                />
                            </div>
                        </div>
                    </div>
                ) : null}
            </GlassModal>

            <GlassModal
                open={editOpen}
                onOpenChange={(open) => {
                    setEditOpen(open)
                    if (!open) {
                        setEditTarget(null)
                        setForm(DEFAULT_FORM)
                    }
                }}
                title="Update Renewal"
                description="Manage owner, commercial stage, and quote follow-up for this recurring opportunity."
                footer={
                    <div className="flex justify-end gap-2 w-full">
                        <Button variant="outline" onClick={() => setEditOpen(false)} disabled={saving}>
                            Cancel
                        </Button>
                        <Button onClick={() => void saveRenewal()} disabled={saving}>
                            {saving ? "Saving..." : "Save Changes"}
                        </Button>
                    </div>
                }
            >
                {editTarget ? (
                    <div className="space-y-4">
                        <div className="rounded-xl border border-glass-border/60 bg-white/40 px-4 py-3">
                            <div className="font-medium">{editTarget.title}</div>
                            <div className="text-xs text-muted-foreground mt-1">
                                {editTarget.siteName ?? "Site"} • {editTarget.customerName ?? "Customer"} • Due {formatDate(editTarget.dueDate)}
                            </div>
                        </div>
                        <div className="grid gap-4 md:grid-cols-2">
                            <div className="space-y-2">
                                <Label required>Status</Label>
                                <Select value={form.status} onValueChange={(value) => setForm((prev) => ({ ...prev, status: value }))}>
                                    <SelectTrigger className="bg-white/50">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {BOARD_COLUMNS.map((option) => (
                                            <SelectItem key={option.value} value={option.value}>{option.title}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-2">
                                <Label optional>Owner</Label>
                                <Select
                                    value={form.ownerUserId || "__unassigned__"}
                                    createOption={{ label: "employee", href: "/admin/team?create=employee" }}
                                    onValueChange={(value) => setForm((prev) => ({ ...prev, ownerUserId: value === "__unassigned__" ? "" : value }))}
                                >
                                    <SelectTrigger className="bg-white/50">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="__unassigned__">Unassigned</SelectItem>
                                        {users.map((user) => (
                                            <SelectItem key={user.id} value={user.id}>{user.fullName ?? user.email ?? "Team member"}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-2">
                                <Label optional>Estimated Value</Label>
                                <Input
                                    value={form.estimatedValue}
                                    onChange={(e) => setForm((prev) => ({ ...prev, estimatedValue: e.target.value }))}
                                    placeholder="e.g. 1250.00"
                                    inputMode="decimal"
                                    className="bg-white/50"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label optional>Linked Quote</Label>
                                <Select
                                    value={form.quoteId || "__none__"}
                                    createOption={{ label: "quote", href: "/admin/quotes/new" }}
                                    onValueChange={(value) =>
                                        setForm((prev) => ({
                                            ...prev,
                                            quoteId: value === "__none__" ? "" : value,
                                            status:
                                                value !== "__none__" && ["OPEN", "OVERDUE", "ON_HOLD"].includes(prev.status)
                                                    ? "QUOTED"
                                                    : prev.status,
                                        }))
                                    }
                                >
                                    <SelectTrigger className="bg-white/50">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="__none__">No linked quote</SelectItem>
                                        {availableQuotes.map((quote) => (
                                            <SelectItem key={quote.id} value={quote.id}>
                                                {(quote.quoteNumber ?? "QT-PENDING")} • {quote.title ?? "Quote"}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-2">
                                <Label optional>Last Quoted</Label>
                                <Input
                                    type="date"
                                    value={form.lastQuotedAt}
                                    onChange={(e) => setForm((prev) => ({ ...prev, lastQuotedAt: e.target.value }))}
                                    className="bg-white/50"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label optional>Last Chased</Label>
                                <Input
                                    type="date"
                                    value={form.lastChasedAt}
                                    onChange={(e) => setForm((prev) => ({ ...prev, lastChasedAt: e.target.value }))}
                                    className="bg-white/50"
                                />
                            </div>
                        </div>
                        <div className="space-y-2">
                            <Label optional>Notes</Label>
                            <Textarea
                                value={form.notes}
                                onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))}
                                className="min-h-[120px] bg-white/50"
                                placeholder="Capture commercial context, required follow-up, or coordination notes."
                            />
                        </div>
                    </div>
                ) : null}
            </GlassModal>

            <ErrorToast error={error} onClear={() => setError(null)} />
        </PageContainer>
    )
}

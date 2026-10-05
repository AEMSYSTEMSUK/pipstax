"use client"

import { useEffect, useMemo, useState } from "react"
import type { DragEvent } from "react"
import Link from "next/link"
import { PageContainer } from "@/components/layout/PageContainer"
import { GlassCard, GlassCardContent, GlassCardDescription, GlassCardHeader, GlassCardTitle } from "@/components/glass/GlassCard"
import { GlassModal } from "@/components/glass/GlassModal"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Textarea } from "@/components/ui/textarea"
import { StatusBadge } from "@/components/shared/StatusBadge"
import { ErrorToast } from "@/components/shared/ErrorToast"
import { isBoardColumnDrag, useSavedColumnOrder } from "@/components/shared/useSavedColumnOrder"
import { useSavedViewMode } from "@/components/shared/useSavedViewMode"
import { useToast } from "@/components/ui/toast"
import { getModulePermissions } from "@/lib/permission-ui"
import { useTenantFeatures } from "@/components/layout/TenantFeaturesContext"
import { getAuth } from "@/lib/auth"
import { apiDelete, apiGet, apiPost, apiPut, uploadWithProgress } from "@/lib/api"
import { CustomerSiteOption, fetchCustomerSites, formatCustomerSiteLabel } from "@/lib/customer-sites"
import { Briefcase, CheckCircle2, ClipboardCheck, Eye, EyeOff, FilePenLine, FileText, LayoutGrid, List, RefreshCw, Search, ShieldAlert, SquarePen, UserCheck } from "lucide-react"

type ComplianceQueueItem = {
    id: string
    customerId: string
    customerName?: string | null
    siteId: string
    siteName?: string | null
    siteReference?: string | null
    siteCategory?: string | null
    siteAddress?: string | null
    title: string
    reportType: string
    reference?: string | null
    outcome?: string | null
    reviewStatus?: string | null
    testedAt?: string | null
    validFrom?: string | null
    validUntil?: string | null
    expectedRenewalValue?: number | string | null
    reviewedAt?: string | null
    reviewerUserId?: string | null
    reviewerName?: string | null
    reviewNote?: string | null
    customerVisible?: boolean | null
    notes?: string | null
    documentId?: string | null
    documentName?: string | null
    documentFileUrl?: string | null
    jobId?: string | null
    jobTitle?: string | null
    jobStatus?: string | null
    createdAt?: string | null
}

type ComplianceSummary = {
    total: number
    pendingReview: number
    inReview: number
    approved: number
    rejected: number
    expired: number
    visibleToCustomer: number
    hiddenFromPortal: number
}

type ComplianceQueueResponse = {
    items: ComplianceQueueItem[]
    summary: ComplianceSummary
}

type TenantUserOption = {
    id: string
    fullName?: string | null
    email?: string | null
}

type LookupOption = {
    id: string
    title: string
    type?: string | null
}

type DocumentUploadResponse = {
    id: string
    name: string
    fileUrl?: string | null
}

type ReviewForm = {
    reviewStatus: string
    reviewerUserId: string
    expectedRenewalValue: string
    reviewNote: string
    customerVisible: boolean
}

type RecordEditForm = {
    title: string
    reportType: string
    reference: string
    outcome: string
    testedAt: string
    validFrom: string
    validUntil: string
    expectedRenewalValue: string
    notes: string
}

const DEFAULT_SUMMARY: ComplianceSummary = {
    total: 0,
    pendingReview: 0,
    inReview: 0,
    approved: 0,
    rejected: 0,
    expired: 0,
    visibleToCustomer: 0,
    hiddenFromPortal: 0,
}

const DEFAULT_REVIEW_FORM: ReviewForm = {
    reviewStatus: "PENDING_REVIEW",
    reviewerUserId: "",
    expectedRenewalValue: "",
    reviewNote: "",
    customerVisible: true,
}

const DEFAULT_RECORD_EDIT_FORM: RecordEditForm = {
    title: "",
    reportType: "",
    reference: "",
    outcome: "",
    testedAt: "",
    validFrom: "",
    validUntil: "",
    expectedRenewalValue: "",
    notes: "",
}

const REVIEW_STATUS_OPTIONS = [
    { value: "__all__", label: "All reviews" },
    { value: "PENDING_REVIEW", label: "Pending Review" },
    { value: "IN_REVIEW", label: "In Review" },
    { value: "APPROVED", label: "Approved" },
    { value: "REJECTED", label: "Rejected" },
    { value: "EXPIRED", label: "Expired" },
]

const VISIBILITY_OPTIONS = [
    { value: "__all__", label: "All visibility" },
    { value: "VISIBLE", label: "Visible to customer" },
    { value: "HIDDEN", label: "Hidden from customer" },
]

const REVIEW_BOARD_COLUMNS = [
    { value: "PENDING_REVIEW", title: "Pending Review", description: "Waiting for review to start" },
    { value: "IN_REVIEW", title: "In Review", description: "Assigned and being checked" },
    { value: "REJECTED", title: "Rejected", description: "Needs correction or follow-up" },
    { value: "APPROVED", title: "Approved", description: "Reviewed and accepted" },
    { value: "EXPIRED", title: "Expired", description: "Validity date has passed" },
]

type ComplianceViewMode = "board" | "list"
const COMPLIANCE_VIEW_MODES = ["board", "list"] as const

const formatDate = (value?: string | null) => {
    if (!value) return "Not set"
    const parsed = new Date(value)
    if (Number.isNaN(parsed.getTime())) return "Not set"
    return parsed.toLocaleDateString("en-GB")
}

const formatDateTime = (value?: string | null) => {
    if (!value) return "Not reviewed"
    const parsed = new Date(value)
    if (Number.isNaN(parsed.getTime())) return "Not reviewed"
    return parsed.toLocaleString("en-GB")
}

const formatCurrency = (value?: number | string | null) => {
    if (value === null || typeof value === "undefined" || value === "") return "Not set"
    const numeric = typeof value === "number" ? value : Number(value)
    if (!Number.isFinite(numeric)) return "Not set"
    return new Intl.NumberFormat(undefined, { style: "currency", currency: "GBP" }).format(numeric)
}

const toDateTimeLocalValue = (value?: string | null) => {
    if (!value) return ""
    const parsed = new Date(value)
    if (Number.isNaN(parsed.getTime())) return ""
    const offset = parsed.getTimezoneOffset() * 60000
    return new Date(parsed.getTime() - offset).toISOString().slice(0, 16)
}

const fromDateTimeLocalValue = (value: string) => {
    if (!value) return undefined
    const parsed = new Date(value)
    return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString()
}

const formatReviewLabel = (value?: string | null) =>
    String(value ?? "PENDING_REVIEW")
        .replace(/_/g, " ")
        .toLowerCase()
        .replace(/\b\w/g, (char) => char.toUpperCase())

const getReviewBadgeTone = (value?: string | null) => {
    switch (String(value ?? "PENDING_REVIEW").toUpperCase()) {
        case "APPROVED":
            return "Completed"
        case "REJECTED":
            return "Rejected"
        case "EXPIRED":
            return "Expired"
        case "IN_REVIEW":
            return "In Progress"
        default:
            return "Pending"
    }
}

export default function CompliancePage() {
    const { toast } = useToast()
    const { canView, canManage } = getModulePermissions("reports.view", "reports.manage")
    const { complianceReports, sites: sitesEnabled } = useTenantFeatures()
    const [loading, setLoading] = useState(true)
    const [refreshing, setRefreshing] = useState(false)
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [users, setUsers] = useState<TenantUserOption[]>([])
    const [customers, setCustomers] = useState<any[]>([])
    const [customerSites, setCustomerSites] = useState<CustomerSiteOption[]>([])
    const [searchQuery, setSearchQuery] = useState("")
    const [debouncedSearch, setDebouncedSearch] = useState("")
    const [reviewStatusFilter, setReviewStatusFilter] = useState("__all__")
    const [reportTypeFilter, setReportTypeFilter] = useState("__all__")
    const [reviewerFilter, setReviewerFilter] = useState("__all__")
    const [customerFilter, setCustomerFilter] = useState("__all__")
    const [siteFilter, setSiteFilter] = useState("__all__")
    const [visibilityFilter, setVisibilityFilter] = useState("__all__")
    const [reportTypes, setReportTypes] = useState<LookupOption[]>([])
    const [newReportType, setNewReportType] = useState("")
    const [newEditReportType, setNewEditReportType] = useState("")
    const [addReportTypeOpen, setAddReportTypeOpen] = useState(false)
    const [manageReportTypesOpen, setManageReportTypesOpen] = useState(false)
    const [editingReportTypeId, setEditingReportTypeId] = useState("")
    const [editingReportTypeTitle, setEditingReportTypeTitle] = useState("")
    const [queueData, setQueueData] = useState<ComplianceQueueResponse>({ items: [], summary: DEFAULT_SUMMARY })
    const [selectedRecord, setSelectedRecord] = useState<ComplianceQueueItem | null>(null)
    const [editOpen, setEditOpen] = useState(false)
    const [editForm, setEditForm] = useState<RecordEditForm>(DEFAULT_RECORD_EDIT_FORM)
    const [replacementFile, setReplacementFile] = useState<File | null>(null)
    const [uploadProgress, setUploadProgress] = useState<number | null>(null)
    const [reviewOpen, setReviewOpen] = useState(false)
    const [reviewForm, setReviewForm] = useState<ReviewForm>(DEFAULT_REVIEW_FORM)
    const [savingReportType, setSavingReportType] = useState(false)
    const [currentUserId, setCurrentUserId] = useState("")
    const [viewMode, setViewMode] = useSavedViewMode<ComplianceViewMode>("pipstack:view-mode:admin-compliance", "board", COMPLIANCE_VIEW_MODES)
    const [draggedRecordId, setDraggedRecordId] = useState<string | null>(null)
    const [dragOverStatus, setDragOverStatus] = useState<string | null>(null)

    useEffect(() => {
        const authUserId = getAuth()?.user?.id ?? ""
        if (authUserId) {
            setCurrentUserId(authUserId)
            return
        }

        let cancelled = false
        apiGet<TenantUserOption & { id: string }>("/users/me")
            .then((response) => {
                if (!cancelled) setCurrentUserId(response.data?.id ?? "")
            })
            .catch(() => {
                if (!cancelled) setCurrentUserId("")
            })
        return () => {
            cancelled = true
        }
    }, [])

    useEffect(() => {
        const timer = window.setTimeout(() => {
            setDebouncedSearch(searchQuery.trim())
        }, 250)
        return () => window.clearTimeout(timer)
    }, [searchQuery])

    useEffect(() => {
        const loadLookups = async () => {
            if (!complianceReports) {
                setLoading(false)
                return
            }

            try {
                const [usersRes, customersRes, reportTypesRes] = await Promise.all([
                    apiGet<TenantUserOption[]>("/users").catch(() => ({ data: [] as TenantUserOption[] })),
                    apiGet<any[]>("/customers").catch(() => ({ data: [] as any[] })),
                    apiGet<LookupOption[]>("/lookups?type=compliance_report_type").catch(() => ({ data: [] as LookupOption[] })),
                ])
                setUsers(Array.isArray(usersRes.data) ? usersRes.data : [])
                setCustomers(Array.isArray(customersRes.data) ? customersRes.data : [])
                setReportTypes(Array.isArray(reportTypesRes.data) ? reportTypesRes.data : [])
            } catch (err: any) {
                setUsers([])
                setCustomers([])
                setError(err?.message ?? "Failed to load compliance lookups")
            }
        }

        void loadLookups()
    }, [complianceReports])

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

    const loadQueue = async (showRefreshing = false) => {
        if (!complianceReports) {
            setLoading(false)
            return
        }

        if (showRefreshing) {
            setRefreshing(true)
        } else {
            setLoading(true)
        }

        try {
            const params = new URLSearchParams()
            if (debouncedSearch) {
                params.set("search", debouncedSearch)
            }
            if (reviewStatusFilter !== "__all__") {
                params.set("reviewStatus", reviewStatusFilter)
            }
            if (reportTypeFilter !== "__all__") {
                params.set("reportType", reportTypeFilter)
            }
            if (reviewerFilter !== "__all__") {
                params.set("reviewerUserId", reviewerFilter)
            }
            if (customerFilter !== "__all__") {
                params.set("customerId", customerFilter)
            }
            if (siteFilter !== "__all__") {
                params.set("siteId", siteFilter)
            }
            if (visibilityFilter !== "__all__") {
                params.set("visibility", visibilityFilter)
            }

            const res = await apiGet<ComplianceQueueResponse>(`/compliance/records${params.toString() ? `?${params.toString()}` : ""}`)
            setQueueData({
                items: Array.isArray(res.data?.items) ? res.data.items : [],
                summary: res.data?.summary ?? DEFAULT_SUMMARY,
            })
            setError(null)
        } catch (err: any) {
            setError(err?.message ?? "Failed to load compliance queue")
        } finally {
            setLoading(false)
            setRefreshing(false)
        }
    }

    useEffect(() => {
        void loadQueue()
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [complianceReports, debouncedSearch, reviewStatusFilter, reportTypeFilter, reviewerFilter, customerFilter, siteFilter, visibilityFilter])

    const pendingItems = useMemo(
        () => queueData.items.filter((item) => String(item.reviewStatus ?? "").toUpperCase() === "PENDING_REVIEW"),
        [queueData.items]
    )

    const boardItemsByStatus = useMemo(() => {
        const grouped = new Map<string, ComplianceQueueItem[]>()
        REVIEW_BOARD_COLUMNS.forEach((column) => grouped.set(column.value, []))
        queueData.items.forEach((item) => {
            const status = String(item.reviewStatus ?? "PENDING_REVIEW").toUpperCase()
            const key = grouped.has(status) ? status : "PENDING_REVIEW"
            grouped.get(key)?.push(item)
        })
        return grouped
    }, [queueData.items])
    const { orderedColumns: orderedReviewBoardColumns, getColumnDragProps } = useSavedColumnOrder(
        REVIEW_BOARD_COLUMNS,
        "pipstack:board-columns:admin-compliance",
        (column) => column.value
    )

    const editReportTypeSelectValue =
        editForm.reportType && reportTypes.some((option) => option.title === editForm.reportType)
            ? editForm.reportType
            : "__custom__"

    const openEditModal = (record: ComplianceQueueItem) => {
        setSelectedRecord(record)
        setEditForm({
            title: record.title ?? "",
            reportType: record.reportType ?? "",
            reference: record.reference ?? "",
            outcome: record.outcome ?? "",
            testedAt: toDateTimeLocalValue(record.testedAt),
            validFrom: toDateTimeLocalValue(record.validFrom),
            validUntil: toDateTimeLocalValue(record.validUntil),
            expectedRenewalValue: record.expectedRenewalValue != null ? String(record.expectedRenewalValue) : "",
            notes: record.notes ?? "",
        })
        setReplacementFile(null)
        setUploadProgress(null)
        setNewEditReportType("")
        setAddReportTypeOpen(false)
        setEditOpen(true)
    }

    const openReviewModal = (record: ComplianceQueueItem) => {
        setSelectedRecord(record)
        setReviewForm({
            reviewStatus: String(record.reviewStatus ?? "PENDING_REVIEW"),
            reviewerUserId: record.reviewerUserId ?? "",
            expectedRenewalValue: record.expectedRenewalValue != null ? String(record.expectedRenewalValue) : "",
            reviewNote: record.reviewNote ?? "",
            customerVisible: Boolean(record.customerVisible ?? true),
        })
        setReviewOpen(true)
    }

    const saveRecordEdits = async () => {
        if (!selectedRecord) return
        if (!editForm.title.trim() || !editForm.reportType.trim()) {
            toast({
                title: "Missing report details",
                description: "Report title and report type are required.",
                variant: "error",
            })
            return
        }
        setSaving(true)
        try {
            let replacementDocumentId: string | null = null
            if (replacementFile) {
                const formData = new FormData()
                formData.append("file", replacementFile)
                formData.append("name", editForm.title.trim() || replacementFile.name)
                formData.append("category", "Compliance Reports")
                const uploadResponse = await uploadWithProgress<DocumentUploadResponse>(
                    "/documents/upload-stream",
                    formData,
                    setUploadProgress
                )
                replacementDocumentId = uploadResponse.data.id
            }
            await apiPut(`/compliance/records/${selectedRecord.id}`, {
                title: editForm.title.trim(),
                reportType: editForm.reportType.trim(),
                reference: editForm.reference.trim() || null,
                outcome: editForm.outcome.trim() || null,
                testedAt: fromDateTimeLocalValue(editForm.testedAt) ?? null,
                validFrom: fromDateTimeLocalValue(editForm.validFrom) ?? null,
                validUntil: fromDateTimeLocalValue(editForm.validUntil) ?? null,
                expectedRenewalValue: editForm.expectedRenewalValue || null,
                notes: editForm.notes.trim() || null,
                ...(replacementDocumentId ? { documentId: replacementDocumentId } : {}),
            })
            toast({
                title: "Compliance record updated",
                description: replacementDocumentId
                    ? "The report details and supporting file have been updated."
                    : "The report details have been corrected.",
                variant: "success",
            })
            setEditOpen(false)
            await loadQueue()
        } catch (err: any) {
            toast({
                title: "Unable to save record",
                description: err?.message ?? "Please try again.",
                variant: "error",
            })
        } finally {
            setSaving(false)
            setUploadProgress(null)
        }
    }

    const saveReview = async () => {
        if (!selectedRecord) return
        setSaving(true)
        try {
            await apiPut(`/compliance/records/${selectedRecord.id}`, {
                reviewStatus: reviewForm.reviewStatus,
                reviewerUserId: reviewForm.reviewerUserId || null,
                expectedRenewalValue: reviewForm.expectedRenewalValue || null,
                reviewNote: reviewForm.reviewNote.trim() || null,
                customerVisible: reviewForm.customerVisible,
            })
            toast({
                title: "Compliance review saved",
                description: "The review decision and visibility have been updated.",
                variant: "success",
            })
            setReviewOpen(false)
            await loadQueue()
        } catch (err: any) {
            toast({
                title: "Unable to save review",
                description: err?.message ?? "Please try again.",
                variant: "error",
            })
        } finally {
            setSaving(false)
        }
    }

    const createReportType = async (titleOverride?: string, options?: { applyToEdit?: boolean }) => {
        const title = (titleOverride ?? newReportType).trim()
        if (!title) return

        setSavingReportType(true)
        try {
            const response = await apiPost<LookupOption>("/lookups", {
                title,
                type: "compliance_report_type",
            })
            setReportTypes((prev) => {
                const next = prev.some((option) => option.id === response.data.id || option.title.toLowerCase() === response.data.title.toLowerCase())
                    ? prev
                    : [...prev, response.data]
                return [...next].sort((a, b) => a.title.localeCompare(b.title))
            })
            if (options?.applyToEdit) {
                setEditForm((prev) => ({ ...prev, reportType: response.data.title }))
                setNewEditReportType("")
                setAddReportTypeOpen(false)
            } else {
                setReportTypeFilter(response.data.title)
                setNewReportType("")
            }
            toast({
                title: "Report type added",
                description: "Engineers can now select this type when submitting compliance reports.",
                variant: "success",
            })
        } catch (err: any) {
            toast({
                title: "Unable to add report type",
                description: err?.message ?? "Please try again.",
                variant: "error",
            })
        } finally {
            setSavingReportType(false)
        }
    }

    const startEditingReportType = (option: LookupOption) => {
        setEditingReportTypeId(option.id)
        setEditingReportTypeTitle(option.title)
    }

    const cancelEditingReportType = () => {
        setEditingReportTypeId("")
        setEditingReportTypeTitle("")
    }

    const saveReportTypeEdit = async (option: LookupOption) => {
        const title = editingReportTypeTitle.trim()
        if (!title) return

        setSavingReportType(true)
        try {
            const response = await apiPut<LookupOption>(`/lookups/${option.id}`, {
                title,
                type: "compliance_report_type",
            })
            setReportTypes((prev) =>
                prev
                    .map((item) => (item.id === option.id ? response.data : item))
                    .sort((a, b) => a.title.localeCompare(b.title))
            )
            setReportTypeFilter((prev) => (prev === option.title ? response.data.title : prev))
            setEditForm((prev) => ({
                ...prev,
                reportType: prev.reportType === option.title ? response.data.title : prev.reportType,
            }))
            cancelEditingReportType()
            toast({
                title: "Report type updated",
                description: "The report type name has been updated.",
                variant: "success",
            })
        } catch (err: any) {
            toast({
                title: "Unable to update report type",
                description: err?.message ?? "Please try again.",
                variant: "error",
            })
        } finally {
            setSavingReportType(false)
        }
    }

    const deleteReportType = async (option: LookupOption) => {
        setSavingReportType(true)
        try {
            await apiDelete(`/lookups/${option.id}?type=compliance_report_type`, {
                confirmMessage: `Delete report type "${option.title}"? Existing records will keep their saved text, but this option will no longer appear in dropdowns.`,
            })
            setReportTypes((prev) => prev.filter((item) => item.id !== option.id))
            setReportTypeFilter((prev) => (prev === option.title ? "__all__" : prev))
            cancelEditingReportType()
            toast({
                title: "Report type deleted",
                description: "The report type has been removed from future dropdown options.",
                variant: "success",
            })
        } catch (err: any) {
            if (err?.name !== "DeleteCancelledError") {
                toast({
                    title: "Unable to delete report type",
                    description: err?.message ?? "Please try again.",
                    variant: "error",
                })
            }
        } finally {
            setSavingReportType(false)
        }
    }

    const moveRecordToStatus = async (recordId: string, nextStatus: string) => {
        const record = queueData.items.find((item) => item.id === recordId)
        if (!record) return
        const currentStatus = String(record.reviewStatus ?? "PENDING_REVIEW").toUpperCase()
        if (currentStatus === nextStatus) return

        setQueueData((prev) => ({
            ...prev,
            items: prev.items.map((item) => (item.id === recordId ? { ...item, reviewStatus: nextStatus } : item)),
        }))

        try {
            await apiPut(`/compliance/records/${recordId}`, {
                reviewStatus: nextStatus,
                reviewerUserId: record.reviewerUserId || undefined,
                reviewNote: record.reviewNote || undefined,
                customerVisible: record.customerVisible ?? true,
            })
            toast({
                title: "Review status updated",
                description: `Moved "${record.title}" to ${formatReviewLabel(nextStatus)}.`,
                variant: "success",
            })
            await loadQueue()
        } catch (err: any) {
            toast({
                title: "Unable to move record",
                description: err?.message ?? "Please try again.",
                variant: "error",
            })
            await loadQueue()
        }
    }

    const handleBoardDrop = async (event: DragEvent<HTMLDivElement>, nextStatus: string) => {
        if (isBoardColumnDrag(event)) return
        event.preventDefault()
        setDragOverStatus(null)
        const recordId = event.dataTransfer.getData("text/plain") || draggedRecordId
        setDraggedRecordId(null)
        if (!recordId || !canManage) return
        await moveRecordToStatus(recordId, nextStatus)
    }

    const renderRecordActions = (item: ComplianceQueueItem, compact = false) => (
        <div className={`flex flex-wrap ${compact ? "gap-1.5" : "justify-end gap-2"}`}>
            {item.documentFileUrl ? (
                <Button asChild variant="outline" size="sm" className={compact ? "h-8 gap-1.5 px-2 text-xs" : "gap-2"}>
                    <a href={item.documentFileUrl} target="_blank" rel="noreferrer">
                        <FileText className="h-4 w-4" />
                        {compact ? "Doc" : "View Document"}
                    </a>
                </Button>
            ) : null}
            {item.jobId ? (
                <Button asChild variant="outline" size="sm" className={compact ? "h-8 gap-1.5 px-2 text-xs" : "gap-2"}>
                    <Link href={`/admin/schedule/${item.jobId}`}>
                        <Briefcase className="h-4 w-4" />
                        Job
                    </Link>
                </Button>
            ) : null}
            <Button asChild variant="outline" size="sm" className={compact ? "h-8 gap-1.5 px-2 text-xs" : "gap-2"}>
                <Link href={`/admin/customers/${item.customerId}`}>
                    <Eye className="h-4 w-4" />
                    {compact ? "Client" : "Customer"}
                </Link>
            </Button>
            <Button
                variant="outline"
                size="sm"
                className={compact ? "h-8 gap-1.5 px-2 text-xs" : "gap-2"}
                disabled={!canManage}
                onClick={() => openEditModal(item)}
            >
                <FilePenLine className="h-4 w-4" />
                {compact ? "Edit" : "Edit Record"}
            </Button>
            <Button
                variant="outline"
                size="sm"
                className={compact ? "h-8 gap-1.5 px-2 text-xs" : "gap-2"}
                disabled={!canManage}
                onClick={() => openReviewModal(item)}
            >
                <SquarePen className="h-4 w-4" />
                Review
            </Button>
        </div>
    )

    const renderRecordCard = (item: ComplianceQueueItem) => (
        <div
            key={item.id}
            draggable={canManage}
            onDragStart={(event) => {
                setDraggedRecordId(item.id)
                event.dataTransfer.effectAllowed = "move"
                event.dataTransfer.setData("text/plain", item.id)
            }}
            onDragEnd={() => {
                setDraggedRecordId(null)
                setDragOverStatus(null)
            }}
            className={`min-w-0 rounded-2xl border border-glass-border/70 bg-white/55 p-4 shadow-sm transition hover:-translate-y-0.5 hover:bg-white/70 ${
                canManage ? "cursor-grab active:cursor-grabbing" : ""
            } ${draggedRecordId === item.id ? "opacity-60" : ""}`}
        >
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-foreground">{item.title}</div>
                    <div className="mt-1 text-xs text-muted-foreground">
                        {item.reportType}
                        {item.reference ? ` • ${item.reference}` : ""}
                    </div>
                </div>
                <StatusBadge status={getReviewBadgeTone(item.reviewStatus)}>
                    {formatReviewLabel(item.reviewStatus)}
                </StatusBadge>
            </div>
            <div className="mt-3 rounded-xl bg-white/50 p-3 text-xs text-muted-foreground">
                <div className="font-medium text-foreground">{item.customerName ?? "Customer"}</div>
                <div className="mt-1">
                    {item.siteName ?? "Site"}
                    {item.siteReference ? ` • ${item.siteReference}` : ""}
                </div>
                {item.jobTitle ? <div className="mt-1">Job: {item.jobTitle}</div> : null}
            </div>
            <div className="mt-3 grid gap-1.5 text-xs text-muted-foreground">
                <div>Reviewer: <span className="font-medium text-foreground">{item.reviewerName ?? "Unassigned"}</span></div>
                <div>Result: <span className="font-medium text-foreground">{item.outcome ?? "Not recorded"}</span></div>
                <div>Tested: {formatDate(item.testedAt)}</div>
                <div>Valid until: {formatDate(item.validUntil)}</div>
                <div>Expected renewal: <span className="font-medium text-foreground">{formatCurrency(item.expectedRenewalValue)}</span></div>
            </div>
            {item.reviewNote ? (
                <div className="mt-3 line-clamp-3 rounded-xl border border-glass-border/50 bg-white/45 p-3 text-xs text-muted-foreground">
                    {item.reviewNote}
                </div>
            ) : null}
            <div className="mt-4">
                {renderRecordActions(item, true)}
            </div>
        </div>
    )

    return (
        <PageContainer>
            {!canView ? (
                <GlassCard>
                    <GlassCardHeader>
                        <GlassCardTitle>Compliance</GlassCardTitle>
                    </GlassCardHeader>
                    <GlassCardContent>You do not have access to view the compliance queue.</GlassCardContent>
                </GlassCard>
            ) : !complianceReports ? (
                <GlassCard>
                    <GlassCardHeader>
                        <GlassCardTitle>Compliance</GlassCardTitle>
                        <GlassCardDescription>Enable the compliance reports feature from settings to use the review queue.</GlassCardDescription>
                    </GlassCardHeader>
                </GlassCard>
            ) : (
                <>
                    <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                        <div>
                            <h1 className="text-3xl font-bold tracking-tight text-foreground">Compliance Review Queue</h1>
                            <p className="mt-1 text-sm text-muted-foreground">
                                Review submitted compliance reports across the workspace, assign reviewers, approve or reject records, and control what reaches the customer portal.
                            </p>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                            <Button
                                variant="outline"
                                className="gap-2 bg-white/50"
                                disabled={!canManage}
                                onClick={() => setManageReportTypesOpen(true)}
                            >
                                Manage Report Types
                            </Button>
                            <Button variant="outline" className="gap-2 bg-white/50" onClick={() => void loadQueue(true)}>
                                <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
                                Refresh Queue
                            </Button>
                            <Link href="/admin/customers">
                                <Button className="gap-2">
                                    <ClipboardCheck className="h-4 w-4" />
                                    Open Customer Records
                                </Button>
                            </Link>
                        </div>
                    </div>

                    <div className="mb-6 grid gap-4 xl:grid-cols-3">
                        <GlassCard>
                            <GlassCardContent className="p-5">
                                <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Purpose</div>
                                <div className="mt-2 text-sm font-medium text-foreground">Review and governance control</div>
                                <p className="mt-2 text-xs text-muted-foreground">
                                    Use this screen to decide whether a submitted report is accepted, who reviewed it, and whether it is safe to release to the customer portal.
                                </p>
                            </GlassCardContent>
                        </GlassCard>
                        <GlassCard>
                            <GlassCardContent className="p-5">
                                <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Source</div>
                                <div className="mt-2 text-sm font-medium text-foreground">Submitted compliance records</div>
                                <p className="mt-2 text-xs text-muted-foreground">
                                    This queue is the review layer for source reports themselves. It is not the commercial tracker for the next recurring visit.
                                </p>
                            </GlassCardContent>
                        </GlassCard>
                        <GlassCard>
                            <GlassCardContent className="p-5">
                                <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Output</div>
                                <div className="mt-2 text-sm font-medium text-foreground">Approved records feed downstream renewals</div>
                                <p className="mt-2 text-xs text-muted-foreground">
                                    Once a report is approved here, related renewal work can be followed commercially in the Renewals module.
                                </p>
                            </GlassCardContent>
                        </GlassCard>
                    </div>

                    <div className="mb-6 grid gap-4 md:grid-cols-2 xl:grid-cols-6">
                        <GlassCard>
                            <GlassCardContent className="p-5">
                                <div className="text-sm text-muted-foreground">Total Records</div>
                                <div className="mt-3 text-3xl font-semibold">{queueData.summary.total}</div>
                            </GlassCardContent>
                        </GlassCard>
                        <GlassCard>
                            <GlassCardContent className="p-5">
                                <div className="flex items-center justify-between gap-3">
                                    <div>
                                        <div className="text-sm text-muted-foreground">Pending Review</div>
                                        <div className="mt-3 text-3xl font-semibold text-amber-600">{queueData.summary.pendingReview}</div>
                                    </div>
                                    <ShieldAlert className="h-8 w-8 text-amber-500" />
                                </div>
                            </GlassCardContent>
                        </GlassCard>
                        <GlassCard>
                            <GlassCardContent className="p-5">
                                <div className="text-sm text-muted-foreground">In Review</div>
                                <div className="mt-3 text-3xl font-semibold text-sky-600">{queueData.summary.inReview}</div>
                            </GlassCardContent>
                        </GlassCard>
                        <GlassCard>
                            <GlassCardContent className="p-5">
                                <div className="flex items-center justify-between gap-3">
                                    <div>
                                        <div className="text-sm text-muted-foreground">Approved</div>
                                        <div className="mt-3 text-3xl font-semibold text-emerald-600">{queueData.summary.approved}</div>
                                    </div>
                                    <CheckCircle2 className="h-8 w-8 text-emerald-500" />
                                </div>
                            </GlassCardContent>
                        </GlassCard>
                        <GlassCard>
                            <GlassCardContent className="p-5">
                                <div className="text-sm text-muted-foreground">Expired</div>
                                <div className="mt-3 text-3xl font-semibold text-orange-600">{queueData.summary.expired}</div>
                            </GlassCardContent>
                        </GlassCard>
                        <GlassCard>
                            <GlassCardContent className="p-5">
                                <div className="text-sm text-muted-foreground">Hidden from Portal</div>
                                <div className="mt-3 text-3xl font-semibold text-rose-600">{queueData.summary.hiddenFromPortal}</div>
                            </GlassCardContent>
                        </GlassCard>
                    </div>

                    <GlassCard>
                        <GlassCardHeader className="pb-4">
                            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                                <div>
                                    <GlassCardTitle className="text-2xl">Workspace Compliance Register</GlassCardTitle>
                                    <GlassCardDescription>
                                        {pendingItems.length > 0
                                            ? `${pendingItems.length} records are still waiting for approval decisions.`
                                            : "All visible records are currently processed or queued with an assigned reviewer."}
                                    </GlassCardDescription>
                                </div>
                                <div className="flex rounded-xl border border-glass-border/70 bg-white/45 p-1">
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
                        </GlassCardHeader>
                        <GlassCardContent className="space-y-5">
                            <div className="flex flex-col gap-3 xl:flex-row xl:flex-wrap">
                                <div className="relative w-full xl:min-w-[280px] xl:flex-1">
                                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                                    <Input
                                        className="bg-white/50 pl-9"
                                        placeholder="Search record, customer, site, reviewer..."
                                        value={searchQuery}
                                        onChange={(event) => setSearchQuery(event.target.value)}
                                    />
                                </div>
                                <Select value={reviewStatusFilter} onValueChange={setReviewStatusFilter}>
                                    <SelectTrigger className="w-full bg-white/50 xl:w-[190px]">
                                        <SelectValue placeholder="All reviews" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {REVIEW_STATUS_OPTIONS.map((option) => (
                                            <SelectItem key={option.value} value={option.value}>
                                                {option.label}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                <Select value={reportTypeFilter} onValueChange={setReportTypeFilter}>
                                    <SelectTrigger className="w-full bg-white/50 xl:w-[210px]">
                                        <SelectValue placeholder="All report types" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="__all__">All report types</SelectItem>
                                        {reportTypes.map((option) => (
                                            <SelectItem key={option.id} value={option.title}>
                                                {option.title}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                <Select value={reviewerFilter} onValueChange={setReviewerFilter}>
                                    <SelectTrigger className="w-full bg-white/50 xl:w-[210px]">
                                        <SelectValue placeholder="All reviewers" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="__all__">All reviewers</SelectItem>
                                        {users.map((user) => (
                                            <SelectItem key={user.id} value={user.id}>
                                                {user.fullName ?? user.email ?? "Reviewer"}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                <Button
                                    type="button"
                                    variant={currentUserId && reviewerFilter === currentUserId ? "default" : "outline"}
                                    className="gap-2"
                                    disabled={!currentUserId}
                                    onClick={() => setReviewerFilter(currentUserId)}
                                >
                                    <UserCheck className="h-4 w-4" />
                                    Assigned to me
                                </Button>
                                <Select
                                    value={customerFilter}
                                    onValueChange={(value) => {
                                        setCustomerFilter(value)
                                        setSiteFilter("__all__")
                                    }}
                                >
                                    <SelectTrigger className="w-full bg-white/50 xl:w-[220px]">
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
                                        <SelectTrigger className="w-full bg-white/50 xl:w-[240px]" disabled={customerFilter === "__all__"}>
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
                                <Select value={visibilityFilter} onValueChange={setVisibilityFilter}>
                                    <SelectTrigger className="w-full bg-white/50 xl:w-[220px]">
                                        <SelectValue placeholder="All visibility" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {VISIBILITY_OPTIONS.map((option) => (
                                            <SelectItem key={option.value} value={option.value}>
                                                {option.label}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>

                            {loading ? (
                                <div className="rounded-2xl border border-dashed border-glass-border bg-white/35 px-6 py-14 text-center text-sm text-muted-foreground">
                                    Loading compliance queue...
                                </div>
                            ) : queueData.items.length === 0 ? (
                                <div className="rounded-2xl border border-dashed border-glass-border bg-white/35 px-6 py-14 text-center text-sm text-muted-foreground">
                                    No compliance records match the current filters yet.
                                </div>
                            ) : viewMode === "board" ? (
                                <div className="-mx-1 overflow-x-auto px-1 pb-2">
                                    <div className="grid min-w-[1380px] grid-cols-5 gap-4">
                                    {orderedReviewBoardColumns.map((column) => {
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
                                                    if (dragOverStatus === column.value) {
                                                        setDragOverStatus(null)
                                                    }
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
                                                            {canManage ? " • Drag cards here to update status" : ""}
                                                        </div>
                                                    </div>
                                                    <span className="rounded-full bg-white/70 px-2 py-1 text-xs font-semibold text-muted-foreground">
                                                        {items.length}
                                                    </span>
                                                </div>
                                                <div className="grid gap-3">
                                                    {items.length === 0 ? (
                                                        <div className="rounded-2xl border border-dashed border-glass-border/70 bg-white/35 p-6 text-center text-xs text-muted-foreground">
                                                            No records in this stage.
                                                        </div>
                                                    ) : (
                                                        items.map((item) => renderRecordCard(item))
                                                    )}
                                                </div>
                                            </div>
                                        )
                                    })}
                                    </div>
                                </div>
                            ) : (
                                <div className="overflow-x-auto rounded-2xl border border-glass-border/60 bg-white/30">
                                    <Table>
                                        <TableHeader>
                                            <TableRow>
                                                <TableHead>Submitted Report</TableHead>
                                                <TableHead>Review Control</TableHead>
                                                <TableHead>Portal Release</TableHead>
                                                <TableHead>Linked Context</TableHead>
                                                <TableHead className="text-right">Actions</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {queueData.items.map((item) => (
                                                <TableRow key={item.id}>
                                                    <TableCell className="min-w-[310px]">
                                                        <div className="font-medium text-foreground">{item.title}</div>
                                                        <div className="mt-1 text-xs text-muted-foreground">
                                                            {item.reportType}
                                                            {item.reference ? ` • ${item.reference}` : ""}
                                                        </div>
                                                        <div className="mt-2 text-sm text-muted-foreground">
                                                            {item.customerName ?? "Customer"} • {item.siteName ?? "Site"}
                                                            {item.siteReference ? ` • ${item.siteReference}` : ""}
                                                        </div>
                                                        {item.siteAddress ? (
                                                            <div className="mt-1 text-xs text-muted-foreground">{item.siteAddress}</div>
                                                        ) : null}
                                                        <div className="mt-1 text-xs text-muted-foreground">Result: {item.outcome ?? "Not recorded"}</div>
                                                    </TableCell>
                                                    <TableCell className="min-w-[210px]">
                                                        <StatusBadge status={getReviewBadgeTone(item.reviewStatus)}>
                                                            {formatReviewLabel(item.reviewStatus)}
                                                        </StatusBadge>
                                                        <div className="mt-2 text-xs text-muted-foreground">Tested: {formatDate(item.testedAt)}</div>
                                                        <div className="mt-1 text-xs text-muted-foreground">Valid until: {formatDate(item.validUntil)}</div>
                                                        <div className="mt-1 text-xs text-muted-foreground">Expected renewal: {formatCurrency(item.expectedRenewalValue)}</div>
                                                        <div className="mt-1 text-xs text-muted-foreground">Reviewed: {formatDateTime(item.reviewedAt)}</div>
                                                        <div className="mt-2 text-xs text-muted-foreground">
                                                            Reviewer: {item.reviewerName ?? "Unassigned"}
                                                        </div>
                                                        {item.reviewNote ? (
                                                            <div className="mt-1 line-clamp-2 text-xs text-muted-foreground">{item.reviewNote}</div>
                                                        ) : null}
                                                    </TableCell>
                                                    <TableCell className="min-w-[180px]">
                                                        <StatusBadge status={item.customerVisible === false ? "Rejected" : "Open"}>
                                                            {item.customerVisible === false ? "Hidden" : "Visible"}
                                                        </StatusBadge>
                                                        <div className="mt-2 text-xs text-muted-foreground">
                                                            {item.customerVisible === false
                                                                ? "Customer portal cannot see this record."
                                                                : "Customer portal can use this record when rules allow it."}
                                                        </div>
                                                    </TableCell>
                                                    <TableCell className="min-w-[220px]">
                                                        <div className="text-sm font-medium text-foreground">
                                                            {item.jobTitle ?? "No linked job"}
                                                        </div>
                                                        <div className="mt-1 text-xs text-muted-foreground">
                                                            {item.documentName ?? "No linked document"}
                                                        </div>
                                                        {item.documentFileUrl ? (
                                                            <a
                                                                href={item.documentFileUrl}
                                                                target="_blank"
                                                                rel="noreferrer"
                                                                className="mt-2 inline-block text-xs font-medium text-primary hover:underline"
                                                            >
                                                                Open supporting document
                                                            </a>
                                                        ) : null}
                                                    </TableCell>
                                                    <TableCell className="min-w-[200px] text-right">
                                                        {renderRecordActions(item)}
                                                    </TableCell>
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                                </div>
                            )}
                        </GlassCardContent>
                    </GlassCard>

                    <GlassModal
                        open={manageReportTypesOpen}
                        onOpenChange={(open) => {
                            setManageReportTypesOpen(open)
                            if (!open) {
                                setNewReportType("")
                                cancelEditingReportType()
                            }
                        }}
                        title="Manage Report Types"
                        description="Add, rename, or remove the report/certificate types engineers can select in the field app."
                        footer={
                            <div className="flex w-full justify-end">
                                <Button variant="outline" onClick={() => setManageReportTypesOpen(false)}>
                                    Close
                                </Button>
                            </div>
                        }
                    >
                        <div className="space-y-5">
                            <div className="rounded-2xl border border-glass-border/60 bg-white/35 p-4">
                                <Label required>New Report Type</Label>
                                <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                                    <Input
                                        className="bg-white/50"
                                        placeholder="e.g. Fire Alarm Certificate"
                                        value={newReportType}
                                        onChange={(event) => setNewReportType(event.target.value)}
                                        onKeyDown={(event) => {
                                            if (event.key === "Enter") {
                                                event.preventDefault()
                                                void createReportType()
                                            }
                                        }}
                                        disabled={!canManage || savingReportType}
                                    />
                                    <Button
                                        type="button"
                                        onClick={() => void createReportType()}
                                        disabled={!canManage || savingReportType || !newReportType.trim()}
                                    >
                                        {savingReportType ? "Adding..." : "Add Type"}
                                    </Button>
                                </div>
                            </div>

                            <div className="space-y-2">
                                <div className="text-sm font-semibold text-foreground">Existing Report Types</div>
                                {reportTypes.length === 0 ? (
                                    <div className="rounded-2xl border border-dashed border-glass-border/70 bg-white/35 p-6 text-center text-sm text-muted-foreground">
                                        No report types added yet.
                                    </div>
                                ) : (
                                    <div className="max-h-[380px] space-y-2 overflow-y-auto pr-1">
                                        {reportTypes.map((option) => {
                                            const isEditing = editingReportTypeId === option.id
                                            return (
                                                <div
                                                    key={option.id}
                                                    className="rounded-2xl border border-glass-border/60 bg-white/35 p-3"
                                                >
                                                    {isEditing ? (
                                                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                                                            <Input
                                                                className="bg-white/60"
                                                                value={editingReportTypeTitle}
                                                                onChange={(event) => setEditingReportTypeTitle(event.target.value)}
                                                                onKeyDown={(event) => {
                                                                    if (event.key === "Enter") {
                                                                        event.preventDefault()
                                                                        void saveReportTypeEdit(option)
                                                                    }
                                                                    if (event.key === "Escape") {
                                                                        cancelEditingReportType()
                                                                    }
                                                                }}
                                                                autoFocus
                                                            />
                                                            <div className="flex gap-2">
                                                                <Button
                                                                    type="button"
                                                                    size="sm"
                                                                    onClick={() => void saveReportTypeEdit(option)}
                                                                    disabled={!canManage || savingReportType || !editingReportTypeTitle.trim()}
                                                                >
                                                                    Save
                                                                </Button>
                                                                <Button
                                                                    type="button"
                                                                    size="sm"
                                                                    variant="outline"
                                                                    onClick={cancelEditingReportType}
                                                                    disabled={savingReportType}
                                                                >
                                                                    Cancel
                                                                </Button>
                                                            </div>
                                                        </div>
                                                    ) : (
                                                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                                            <div className="text-sm font-medium text-foreground">{option.title}</div>
                                                            <div className="flex gap-2">
                                                                <Button
                                                                    type="button"
                                                                    size="sm"
                                                                    variant="outline"
                                                                    onClick={() => startEditingReportType(option)}
                                                                    disabled={!canManage || savingReportType}
                                                                >
                                                                    Edit
                                                                </Button>
                                                                <Button
                                                                    type="button"
                                                                    size="sm"
                                                                    variant="outline"
                                                                    className="text-destructive hover:text-destructive"
                                                                    onClick={() => void deleteReportType(option)}
                                                                    disabled={!canManage || savingReportType}
                                                                >
                                                                    Delete
                                                                </Button>
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            )
                                        })}
                                    </div>
                                )}
                            </div>
                        </div>
                    </GlassModal>

                    <GlassModal
                        open={editOpen}
                        onOpenChange={(open) => {
                            setEditOpen(open)
                            if (!open) {
                                setSelectedRecord(null)
                                setEditForm(DEFAULT_RECORD_EDIT_FORM)
                                setReplacementFile(null)
                                setUploadProgress(null)
                                setNewEditReportType("")
                            }
                        }}
                        title={selectedRecord ? `Edit Record: ${selectedRecord.title}` : "Edit compliance record"}
                        description="Correct the submitted report details without changing the office review decision."
                        footer={
                            <div className="flex w-full justify-end gap-2">
                                <Button variant="outline" onClick={() => setEditOpen(false)}>
                                    Cancel
                                </Button>
                                <Button onClick={saveRecordEdits} disabled={saving || !canManage}>
                                    {saving ? "Saving..." : "Save Record"}
                                </Button>
                            </div>
                        }
                    >
                        {selectedRecord ? (
                            <div className="space-y-5">
                                <div className="grid gap-4 rounded-2xl border border-glass-border/60 bg-white/35 p-4 md:grid-cols-2">
                                    <div>
                                        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Customer</div>
                                        <div className="mt-1 text-sm font-medium text-foreground">{selectedRecord.customerName ?? "Customer"}</div>
                                        <div className="mt-1 text-xs text-muted-foreground">
                                            {selectedRecord.siteName ?? "Site"}
                                            {selectedRecord.siteReference ? ` • ${selectedRecord.siteReference}` : ""}
                                        </div>
                                    </div>
                                    <div>
                                        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Current review</div>
                                        <div className="mt-1">
                                            <StatusBadge status={getReviewBadgeTone(selectedRecord.reviewStatus)}>
                                                {formatReviewLabel(selectedRecord.reviewStatus)}
                                            </StatusBadge>
                                        </div>
                                        <div className="mt-2 text-xs text-muted-foreground">
                                            Reviewer: {selectedRecord.reviewerName ?? "Unassigned"}
                                        </div>
                                    </div>
                                </div>

                                <div className="grid gap-4 md:grid-cols-2">
                                    <div className="space-y-2">
                                        <Label required>Report Title</Label>
                                        <Input
                                            className="bg-white/50"
                                            value={editForm.title}
                                            onChange={(event) => setEditForm((prev) => ({ ...prev, title: event.target.value }))}
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label required>Report Type</Label>
                                        <Select
                                            value={editReportTypeSelectValue}
                                            createOption={{
                                                label: "report type",
                                                onSelect: () => {
                                                    setNewEditReportType(editReportTypeSelectValue === "__custom__" ? editForm.reportType : "")
                                                    setAddReportTypeOpen(true)
                                                },
                                            }}
                                            onValueChange={(value) => setEditForm((prev) => ({ ...prev, reportType: value === "__custom__" ? "" : value }))}
                                        >
                                            <SelectTrigger className="bg-white/50">
                                                <SelectValue placeholder="Select report type" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {reportTypes.map((option) => (
                                                    <SelectItem key={option.id} value={option.title}>
                                                        {option.title}
                                                    </SelectItem>
                                                ))}
                                                <SelectItem value="__custom__">Custom / not listed</SelectItem>
                                            </SelectContent>
                                        </Select>
                                        {editReportTypeSelectValue === "__custom__" ? (
                                            <Input
                                                className="bg-white/50"
                                                placeholder="Type report type"
                                                value={editForm.reportType}
                                                onChange={(event) => setEditForm((prev) => ({ ...prev, reportType: event.target.value }))}
                                            />
                                        ) : null}
                                    </div>
                                    <div className="space-y-2">
                                        <Label optional>Reference</Label>
                                        <Input
                                            className="bg-white/50"
                                            value={editForm.reference}
                                            onChange={(event) => setEditForm((prev) => ({ ...prev, reference: event.target.value }))}
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label optional>Result</Label>
                                        <Select
                                            value={editForm.outcome || "__none__"}
                                            onValueChange={(value) => setEditForm((prev) => ({ ...prev, outcome: value === "__none__" ? "" : value }))}
                                        >
                                            <SelectTrigger className="bg-white/50">
                                                <SelectValue placeholder="Select result" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="__none__">Not recorded</SelectItem>
                                                <SelectItem value="Satisfactory">Satisfactory</SelectItem>
                                                <SelectItem value="Unsatisfactory">Unsatisfactory</SelectItem>
                                                <SelectItem value="Not Tested">Not Tested</SelectItem>
                                                <SelectItem value="Observation">Observation</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div className="space-y-2">
                                        <Label optional>Tested At</Label>
                                        <Input
                                            className="bg-white/50"
                                            type="datetime-local"
                                            value={editForm.testedAt}
                                            onChange={(event) => setEditForm((prev) => ({ ...prev, testedAt: event.target.value }))}
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label optional>Valid From</Label>
                                        <Input
                                            className="bg-white/50"
                                            type="datetime-local"
                                            value={editForm.validFrom}
                                            onChange={(event) => setEditForm((prev) => ({ ...prev, validFrom: event.target.value }))}
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label optional>Valid Until</Label>
                                        <Input
                                            className="bg-white/50"
                                            type="datetime-local"
                                            value={editForm.validUntil}
                                            onChange={(event) => setEditForm((prev) => ({ ...prev, validUntil: event.target.value }))}
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label optional>Expected Renewal Value</Label>
                                        <Input
                                            className="bg-white/50"
                                            type="number"
                                            min="0"
                                            step="0.01"
                                            placeholder="0.00"
                                            value={editForm.expectedRenewalValue}
                                            onChange={(event) => setEditForm((prev) => ({ ...prev, expectedRenewalValue: event.target.value }))}
                                        />
                                    </div>
                                    <div className="space-y-3 md:col-span-2">
                                        <Label optional>Supporting File</Label>
                                        <div className="rounded-2xl border border-glass-border/60 bg-white/35 p-4">
                                            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                                <div>
                                                    <div className="text-sm font-medium text-foreground">
                                                        {selectedRecord.documentName ?? "No file linked yet"}
                                                    </div>
                                                    <div className="mt-1 text-xs text-muted-foreground">
                                                        Select a replacement file if the uploaded certificate/report needs to be changed.
                                                    </div>
                                                </div>
                                                {selectedRecord.documentFileUrl ? (
                                                    <Button asChild type="button" variant="outline" size="sm">
                                                        <a href={selectedRecord.documentFileUrl} target="_blank" rel="noreferrer">
                                                            View Current File
                                                        </a>
                                                    </Button>
                                                ) : null}
                                            </div>
                                            <div className="mt-4 grid gap-2">
                                                <Input
                                                    className="bg-white/50"
                                                    type="file"
                                                    onChange={(event) => setReplacementFile(event.target.files?.[0] ?? null)}
                                                    disabled={!canManage || saving}
                                                />
                                                {replacementFile ? (
                                                    <div className="rounded-xl bg-primary/10 px-3 py-2 text-xs font-medium text-primary">
                                                        Replacement selected: {replacementFile.name}
                                                        {typeof uploadProgress === "number" ? ` (${uploadProgress}%)` : ""}
                                                    </div>
                                                ) : null}
                                            </div>
                                        </div>
                                    </div>
                                    <div className="space-y-2 md:col-span-2">
                                        <Label optional>Engineer / Report Notes</Label>
                                        <Textarea
                                            className="min-h-[110px] bg-white/50"
                                            value={editForm.notes}
                                            onChange={(event) => setEditForm((prev) => ({ ...prev, notes: event.target.value }))}
                                        />
                                    </div>
                                </div>
                            </div>
                        ) : null}
                    </GlassModal>

                    <GlassModal
                        open={addReportTypeOpen}
                        onOpenChange={(open) => {
                            setAddReportTypeOpen(open)
                            if (!open) setNewEditReportType("")
                        }}
                        title="Add Report Type"
                        description="Create a new compliance report type and apply it to this record."
                        footer={
                            <div className="flex w-full justify-end gap-2">
                                <Button variant="outline" onClick={() => setAddReportTypeOpen(false)}>
                                    Cancel
                                </Button>
                                <Button
                                    onClick={() => void createReportType(newEditReportType, { applyToEdit: true })}
                                    disabled={!canManage || savingReportType || !newEditReportType.trim()}
                                >
                                    {savingReportType ? "Adding..." : "Add Type"}
                                </Button>
                            </div>
                        }
                    >
                        <div className="space-y-2">
                            <Label required>Report Type Name</Label>
                            <Input
                                className="bg-white/50"
                                placeholder="e.g. Emergency Lighting Test"
                                value={newEditReportType}
                                onChange={(event) => setNewEditReportType(event.target.value)}
                                onKeyDown={(event) => {
                                    if (event.key === "Enter") {
                                        event.preventDefault()
                                        void createReportType(newEditReportType, { applyToEdit: true })
                                    }
                                }}
                                autoFocus
                            />
                        </div>
                    </GlassModal>

                    <GlassModal
                        open={reviewOpen}
                        onOpenChange={(open) => {
                            setReviewOpen(open)
                            if (!open) {
                                setSelectedRecord(null)
                                setReviewForm(DEFAULT_REVIEW_FORM)
                            }
                        }}
                        title={selectedRecord ? `Review: ${selectedRecord.title}` : "Compliance review"}
                        description="Keep the review decision, owner, and customer visibility aligned from the central compliance queue."
                        footer={
                            <div className="flex w-full justify-end gap-2">
                                <Button variant="outline" onClick={() => setReviewOpen(false)}>
                                    Cancel
                                </Button>
                                <Button onClick={saveReview} disabled={saving || !canManage}>
                                    {saving ? "Saving..." : "Save Review"}
                                </Button>
                            </div>
                        }
                    >
                        {selectedRecord ? (
                            <div className="space-y-5">
                                <div className="grid gap-4 rounded-2xl border border-glass-border/60 bg-white/35 p-4 md:grid-cols-2">
                                    <div>
                                        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Customer</div>
                                        <div className="mt-1 text-sm font-medium text-foreground">{selectedRecord.customerName ?? "Customer"}</div>
                                        <div className="mt-1 text-xs text-muted-foreground">
                                            {selectedRecord.siteName ?? "Site"}
                                            {selectedRecord.siteReference ? ` • ${selectedRecord.siteReference}` : ""}
                                        </div>
                                    </div>
                                    <div>
                                        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Supporting context</div>
                                        <div className="mt-1 text-sm text-foreground">{selectedRecord.reportType}</div>
                                        <div className="mt-1 text-xs text-muted-foreground">
                                            Result {selectedRecord.outcome ?? "Not recorded"} • Tested {formatDate(selectedRecord.testedAt)} • Valid until {formatDate(selectedRecord.validUntil)}
                                        </div>
                                    </div>
                                    <div>
                                        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Linked job</div>
                                        <div className="mt-1 text-sm text-foreground">{selectedRecord.jobTitle ?? "Not linked"}</div>
                                        {selectedRecord.jobStatus ? (
                                            <div className="mt-1">
                                                <StatusBadge status="Open">{selectedRecord.jobStatus}</StatusBadge>
                                            </div>
                                        ) : null}
                                    </div>
                                    <div>
                                        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Linked document</div>
                                        {selectedRecord.documentFileUrl ? (
                                            <a
                                                href={selectedRecord.documentFileUrl}
                                                target="_blank"
                                                rel="noreferrer"
                                                className="mt-1 inline-block text-sm font-medium text-primary hover:underline"
                                            >
                                                {selectedRecord.documentName ?? "Open document"}
                                            </a>
                                        ) : (
                                            <div className="mt-1 text-sm text-muted-foreground">No document attached</div>
                                        )}
                                    </div>
                                </div>

                                <div className="grid gap-4 md:grid-cols-2">
                                    <div className="space-y-2">
                                        <Label required>Review Status</Label>
                                        <Select
                                            value={reviewForm.reviewStatus}
                                            onValueChange={(value) => setReviewForm((prev) => ({ ...prev, reviewStatus: value }))}
                                        >
                                            <SelectTrigger className="bg-white/50">
                                                <SelectValue placeholder="Select review status" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="PENDING_REVIEW">Pending Review</SelectItem>
                                                <SelectItem value="IN_REVIEW">In Review</SelectItem>
                                                <SelectItem value="APPROVED">Approved</SelectItem>
                                                <SelectItem value="REJECTED">Rejected</SelectItem>
                                                <SelectItem value="EXPIRED">Expired</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div className="space-y-2">
                                        <Label optional>Review Owner</Label>
                                        <Select
                                            value={reviewForm.reviewerUserId || "__none__"}
                                            createOption={{ label: "employee", href: "/admin/team?create=employee" }}
                                            onValueChange={(value) =>
                                                setReviewForm((prev) => ({
                                                    ...prev,
                                                    reviewerUserId: value === "__none__" ? "" : value,
                                                }))
                                            }
                                        >
                                            <SelectTrigger className="bg-white/50">
                                                <SelectValue placeholder="Assign reviewer" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="__none__">Unassigned</SelectItem>
                                                {users.map((user) => (
                                                    <SelectItem key={user.id} value={user.id}>
                                                        {user.fullName ?? user.email ?? "Reviewer"}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div className="space-y-2 md:col-span-2">
                                        <Label optional>Expected Renewal Value</Label>
                                        <Input
                                            className="bg-white/50"
                                            type="number"
                                            min="0"
                                            step="0.01"
                                            placeholder="0.00"
                                            value={reviewForm.expectedRenewalValue}
                                            onChange={(event) => setReviewForm((prev) => ({ ...prev, expectedRenewalValue: event.target.value }))}
                                        />
                                        <p className="text-xs text-muted-foreground">
                                            If set, this value is copied to the Tests Due / Renewals pipeline when the record is approved or expires.
                                        </p>
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <Label optional>Review Note</Label>
                                    <Textarea
                                        className="min-h-[120px] bg-white/50"
                                        placeholder="Capture approval notes, exceptions, or what still needs to be corrected."
                                        value={reviewForm.reviewNote}
                                        onChange={(event) => setReviewForm((prev) => ({ ...prev, reviewNote: event.target.value }))}
                                    />
                                </div>

                                <div className="flex items-start justify-between gap-4 rounded-2xl border border-glass-border/60 bg-white/35 p-4">
                                    <div>
                                        <div className="text-sm font-medium text-foreground">Customer portal visibility</div>
                                        <div className="mt-1 text-xs text-muted-foreground">
                                            {reviewForm.customerVisible
                                                ? "The approved record can appear in the customer portal when portal rules allow it."
                                                : "The record stays internal even if it is approved."}
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        {reviewForm.customerVisible ? (
                                            <Eye className="h-4 w-4 text-emerald-600" />
                                        ) : (
                                            <EyeOff className="h-4 w-4 text-rose-600" />
                                        )}
                                        <Switch
                                            checked={reviewForm.customerVisible}
                                            onCheckedChange={(checked) =>
                                                setReviewForm((prev) => ({ ...prev, customerVisible: checked }))
                                            }
                                        />
                                    </div>
                                </div>

                                {selectedRecord.notes ? (
                                    <div className="rounded-2xl border border-glass-border/60 bg-white/35 p-4">
                                        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Internal notes</div>
                                        <div className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">{selectedRecord.notes}</div>
                                    </div>
                                ) : null}
                            </div>
                        ) : null}
                    </GlassModal>

                    {error ? <ErrorToast error={error} /> : null}
                </>
            )}
        </PageContainer>
    )
}

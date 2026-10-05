"use client";

import { use, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { PageContainer } from "@/components/layout/PageContainer"
import { GlassCard, GlassCardContent, GlassCardHeader, GlassCardTitle, GlassCardFooter } from "@/components/glass/GlassCard"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { StatusBadge } from "@/components/shared/StatusBadge"
import { RecordNumberBadge } from "@/components/shared/RecordNumberBadge"
import { apiDelete, apiGet, apiPost, apiPut, isDeleteCancelled } from "@/lib/api"
import { ErrorToast } from "@/components/shared/ErrorToast"
import { ArrowLeft, MapPin, Calendar, Clock, PenTool, CheckCircle, AlertTriangle, UserPlus, Image as ImageIcon, Receipt, File, FileText, FileArchive, FileSpreadsheet, ExternalLink, ChevronDown, Plus, XCircle, Trash2, Pencil } from "lucide-react"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { GlassModal } from "@/components/glass/GlassModal"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import DatePicker from "react-datepicker"
import { useToast } from "@/components/ui/toast"
import { useRouter } from "next/navigation"
import { getModulePermissions } from "@/lib/permission-ui"
import { formatInvoiceStatus, formatJobStatus, formatQuoteStatus, formatSplitInvoiceStatus } from "@/lib/status"
import { CustomerSiteOption, customerSiteToAddressValue, fetchCustomerSites, formatCustomerSiteAddress, formatCustomerSiteLabel } from "@/lib/customer-sites"
import { useTenantFeatures } from "@/components/layout/TenantFeaturesContext"
import { useTenantWorkflowConfig } from "@/components/layout/TenantWorkflowContext"
import { getWorkflowStageOptions, getWorkflowStatusLabel } from "@/lib/workflows"
import { useUrlSyncedTab } from "@/components/shared/useUrlSyncedTab"
import { AddressFields, emptyAddressValue, formatAddressValue, parseAddressValue, type AddressValue } from "@/components/shared/LocalizedFields"
import { AutocompleteOption, CreatableAutocomplete } from "@/components/shared/CreatableAutocomplete"
import { BrowserBackButton } from "@/components/shared/BrowserBackButton"

const hasJobAddress = (address: AddressValue) =>
    [
        address.addressLine1,
        address.addressLine2,
        address.city,
        address.state,
        address.postalCode,
    ].some((part) => part.trim())

const formatJobAddressForPayload = (address: AddressValue) =>
    hasJobAddress(address) ? formatAddressValue(address) : ""

const buildJobAddressPayload = (address: AddressValue) => ({
    addressLine1: address.addressLine1.trim() || undefined,
    addressLine2: address.addressLine2.trim() || undefined,
    city: address.city.trim() || undefined,
    state: address.state.trim() || undefined,
    postalCode: address.postalCode.trim() || undefined,
    country: address.country.trim() || undefined,
})

export default function JobDetailPage({ params }: { params: Promise<{ id: string }> }) {
    const resolvedParams = use(params)
    const router = useRouter()
    const { toast } = useToast()
    const { canView, canManage } = getModulePermissions("scheduling.view", "scheduling.manage")
    const { sites: sitesEnabled, complianceReports, complianceWorkflows, splitInvoicing } = useTenantFeatures()
    const workflowConfig = useTenantWorkflowConfig()
    const [job, setJob] = useState<any | null>(null)
    const [updates, setUpdates] = useState<any[]>([])
    const [attachments, setAttachments] = useState<any[]>([])
    const [expenses, setExpenses] = useState<any[]>([])
    const [timeEntries, setTimeEntries] = useState<any[]>([])
    const [jobQuotes, setJobQuotes] = useState<any[]>([])
    const [jobInvoices, setJobInvoices] = useState<any[]>([])
    const [splitInvoices, setSplitInvoices] = useState<any[]>([])
    const [complianceRecords, setComplianceRecords] = useState<any[]>([])
    const [activities, setActivities] = useState<any[]>([])
    const jobDetailTabs = useMemo(
        () => {
            const tabs = ["overview", "attachments", "updates", "quotes", "invoices"]
            if (complianceReports) tabs.push("compliance")
            if (splitInvoicing) tabs.push("split-invoices")
            tabs.push("expenses", "timesheets", "activity")
            return tabs
        },
        [complianceReports, splitInvoicing]
    )
    const [activeDetailsTab, setActiveDetailsTab] = useUrlSyncedTab({
        defaultTab: "overview",
        allowedTabs: jobDetailTabs,
    })
    const [error, setError] = useState<string | null>(null)
    const [users, setUsers] = useState<any[]>([])
    const [contractors, setContractors] = useState<any[]>([])
    const [selectedUserId, setSelectedUserId] = useState<string>("")
    const [assignmentType, setAssignmentType] = useState("INTERNAL")
    const [assignmentSource, setAssignmentSource] = useState<"INDIVIDUAL" | "TEAM">("INDIVIDUAL")
    const [selectedTeamId, setSelectedTeamId] = useState<string>("")
    const [assignedUsers, setAssignedUsers] = useState<any[]>([])
    const [teams, setTeams] = useState<any[]>([])
    const [allJobs, setAllJobs] = useState<any[]>([])
    const [allAssignments, setAllAssignments] = useState<any[]>([])
    const [customers, setCustomers] = useState<any[]>([])
    const [customerSites, setCustomerSites] = useState<CustomerSiteOption[]>([])
    const [isEditOpen, setIsEditOpen] = useState(false)
    const [editForm, setEditForm] = useState({
        title: "",
        customerId: "",
        siteId: "",
        location: "",
        address: emptyAddressValue(),
        addressManuallyEdited: false,
        description: "",
        priority: "Medium",
        amount: "",
        scheduledAt: null as Date | null,
        scheduledEndAt: null as Date | null
    })
    const [editErrors, setEditErrors] = useState<{ title?: string; customerId?: string; siteId?: string; location?: string; amount?: string; scheduledAt?: string; scheduledEndAt?: string }>({})
    const [assignError, setAssignError] = useState<string | null>(null)
    const [isAssignmentReviewOpen, setIsAssignmentReviewOpen] = useState(false)
    const [isAssigning, setIsAssigning] = useState(false)
    const [assignmentScheduleForm, setAssignmentScheduleForm] = useState({
        scheduledAt: null as Date | null,
        scheduledEndAt: null as Date | null,
    })
    const [assignmentHourlyRate, setAssignmentHourlyRate] = useState("")
    const [assignmentScheduleErrors, setAssignmentScheduleErrors] = useState<{ scheduledAt?: string; scheduledEndAt?: string; hourlyRate?: string }>({})
    const [isDeleteOpen, setIsDeleteOpen] = useState(false)
    const [isUpdateOpen, setIsUpdateOpen] = useState(false)
    const [updateUploadMode, setUpdateUploadMode] = useState<"attachment" | "field">("attachment")
    const [updateForm, setUpdateForm] = useState({ uploadLabel: "" })
    const [selectedFiles, setSelectedFiles] = useState<FileList | null>(null)
    const [updateError, setUpdateError] = useState<string | null>(null)
    const [expensePreview, setExpensePreview] = useState<{ url: string; name: string } | null>(null)
    const [isUploading, setIsUploading] = useState(false)
    const [isExpenseUploading, setIsExpenseUploading] = useState(false)
    const [isExpenseSaving, setIsExpenseSaving] = useState(false)
    const [isExpenseOpen, setIsExpenseOpen] = useState(false)
    const [editingExpenseId, setEditingExpenseId] = useState<string | null>(null)
    const [expenseCategoryOptions, setExpenseCategoryOptions] = useState<AutocompleteOption[]>([])
    const [deletingExpenseId, setDeletingExpenseId] = useState<string | null>(null)
    const [expenseForm, setExpenseForm] = useState({
        description: "",
        category: "",
        amount: "",
        expenseDate: new Date().toISOString().slice(0, 10),
        receiptUrl: ""
    })
    const [isTimeEntryOpen, setIsTimeEntryOpen] = useState(false)
    const [editingTimeEntryId, setEditingTimeEntryId] = useState<string | null>(null)
    const [deletingTimeEntryId, setDeletingTimeEntryId] = useState<string | null>(null)
    const [isTimeEntrySaving, setIsTimeEntrySaving] = useState(false)
    const [timeEntryForm, setTimeEntryForm] = useState({
        userId: "",
        startTime: null as Date | null,
        endTime: null as Date | null,
        hourlyRate: "",
        notes: "",
    })
    const [timeEntryErrors, setTimeEntryErrors] = useState<{ userId?: string; startTime?: string; endTime?: string; hourlyRate?: string }>({})
    const [isGeneratingInvoice, setIsGeneratingInvoice] = useState(false)
    const [invoiceCreateAction, setInvoiceCreateAction] = useState<"CREATE" | "CREATE_SEND" | null>(null)
    const [isCreateInvoiceOpen, setIsCreateInvoiceOpen] = useState(false)
    const [editingInvoiceId, setEditingInvoiceId] = useState<string | null>(null)
    const [deletingInvoiceId, setDeletingInvoiceId] = useState<string | null>(null)
    const [invoiceForm, setInvoiceForm] = useState<{
        title: string
        dueDate: Date | null
        vatNumber: string
        lineItems: Array<{ id: string; description: string; quantity: number; unitPrice: number; taxRate: number }>
    }>({
        title: "",
        dueDate: null,
        vatNumber: "",
        lineItems: [{ id: "1", description: "", quantity: 1, unitPrice: 0, taxRate: 20 }],
    })
    const [invoiceErrors, setInvoiceErrors] = useState<{ title?: string; dueDate?: string; lineItems?: string }>({})
    const [invoiceItemErrors, setInvoiceItemErrors] = useState<
        Record<string, { description?: string; quantity?: string; unitPrice?: string }>
    >({})
    const [isSplitInvoiceOpen, setIsSplitInvoiceOpen] = useState(false)
    const [editingSplitInvoiceId, setEditingSplitInvoiceId] = useState<string | null>(null)
    const [isSplitInvoiceSaving, setIsSplitInvoiceSaving] = useState(false)
    const [deletingSplitInvoiceId, setDeletingSplitInvoiceId] = useState<string | null>(null)
    const [splitInvoiceError, setSplitInvoiceError] = useState<string | null>(null)
    const [splitInvoiceForm, setSplitInvoiceForm] = useState({
        description: "",
        valueExVat: "",
        status: "TO_SEND",
        invoiceDate: "",
    })
    const [openTimesheetAssignee, setOpenTimesheetAssignee] = useState<string | null>(null)
    const [timesheetAutoOpened, setTimesheetAutoOpened] = useState(false)
    const [editingFieldUpdate, setEditingFieldUpdate] = useState<any | null>(null)
    const [fieldUpdateEditForm, setFieldUpdateEditForm] = useState({ notes: "" })
    const [isFieldUpdateSaving, setIsFieldUpdateSaving] = useState(false)
    const [deletingFieldUpdateId, setDeletingFieldUpdateId] = useState<string | null>(null)
    const [editingAttachment, setEditingAttachment] = useState<any | null>(null)
    const [attachmentEditForm, setAttachmentEditForm] = useState({ name: "", label: "" })
    const [isAttachmentSaving, setIsAttachmentSaving] = useState(false)
    const [deletingAttachmentId, setDeletingAttachmentId] = useState<string | null>(null)

    useEffect(() => {
        const loadSites = async () => {
            if (!sitesEnabled || !editForm.customerId) {
                setCustomerSites([])
                return
            }
            try {
                const sites = await fetchCustomerSites(editForm.customerId)
                setCustomerSites(sites)
                setEditForm((prev) => ({
                    ...prev,
                    siteId: sites.some((site) => site.id === prev.siteId) ? prev.siteId : "",
                }))
            } catch (err: any) {
                setError(err?.message ?? "Failed to load customer sites")
                setCustomerSites([])
            }
        }
        void loadSites()
    }, [editForm.customerId, sitesEnabled])

    const formatCurrency = (amount: number, currency = "GBP") => {
        try {
            return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(amount)
        } catch {
            return `${currency} ${amount.toFixed(2)}`
        }
    }

    const formatDurationMinutes = (minutes: number) => {
        const safe = Number.isFinite(minutes) ? Math.max(0, Math.round(minutes)) : 0
        const hrs = Math.floor(safe / 60)
        const mins = safe % 60
        return `${hrs}h ${String(mins).padStart(2, "0")}m`
    }

    const formatDateOnly = (value?: string) => {
        if (!value) return "—"
        const parsed = new Date(value)
        if (Number.isNaN(parsed.getTime())) return "—"
        return parsed.toLocaleDateString()
    }

    const formatDateTime = (value?: string) => {
        if (!value) return "—"
        const parsed = new Date(value)
        if (Number.isNaN(parsed.getTime())) return "—"
        return parsed.toLocaleString([], {
            day: "2-digit",
            month: "short",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
        })
    }

    const jobStageOptions = getWorkflowStageOptions("jobs", workflowConfig)
    const currentJobStatusLabel = job ? getWorkflowStatusLabel("jobs", job.status, job.workflowStageKey, workflowConfig, complianceWorkflows) : ""
    const normalizedJobStatus = String(job?.status ?? "").toUpperCase()
    const jobTimelineSteps = [
        {
            label: "Unassigned",
            date: job?.createdAt,
            complete: Boolean(job?.createdAt),
        },
        {
            label: "Assigned",
            date: job?.scheduledAt,
            complete: ["ASSIGNED", "LIVE", "FINISHED", "COMPLETED", "EN_ROUTE", "ON_SITE", "REQUIRES_FOLLOW_UP"].includes(normalizedJobStatus),
        },
        {
            label: "Live",
            date: job?.startedAt ?? job?.scheduledAt,
            complete: ["LIVE", "FINISHED", "COMPLETED", "EN_ROUTE", "ON_SITE", "REQUIRES_FOLLOW_UP"].includes(normalizedJobStatus),
        },
        ...(normalizedJobStatus === "REQUIRES_FOLLOW_UP"
            ? [{ label: "Needs Attention", date: job?.updatedAt, complete: true }]
            : []),
        { label: "Finished", date: job?.completedAt ?? job?.updatedAt, complete: ["FINISHED", "COMPLETED"].includes(normalizedJobStatus) },
        { label: "Closed", date: job?.completedAt ?? job?.updatedAt, complete: normalizedJobStatus === "COMPLETED" },
    ]

    const formatTimeOnly = (value?: string) => {
        if (!value) return "—"
        const parsed = new Date(value)
        if (Number.isNaN(parsed.getTime())) return "—"
        return parsed.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    }

    const formatSchedulePoint = (value?: string) => {
        if (!value) return "TBD"
        const parsed = new Date(value)
        if (Number.isNaN(parsed.getTime())) return "TBD"
        return parsed.toLocaleString([], {
            day: "2-digit",
            month: "short",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
        })
    }

    const addInvoiceLineItem = () => {
        setInvoiceForm((prev) => ({
            ...prev,
            lineItems: [...prev.lineItems, { id: Math.random().toString(), description: "", quantity: 1, unitPrice: 0, taxRate: 20 }],
        }))
    }

    const removeInvoiceLineItem = (id: string) => {
        setInvoiceForm((prev) => ({
            ...prev,
            lineItems: prev.lineItems.length > 1 ? prev.lineItems.filter((item) => item.id !== id) : prev.lineItems,
        }))
    }

    const resetSplitInvoiceForm = () => {
        setEditingSplitInvoiceId(null)
        setSplitInvoiceError(null)
        setSplitInvoiceForm({
            description: "",
            valueExVat: "",
            status: "TO_SEND",
            invoiceDate: "",
        })
    }

    const openCreateSplitInvoice = () => {
        resetSplitInvoiceForm()
        setIsSplitInvoiceOpen(true)
    }

    const openEditSplitInvoice = (splitInvoice: any) => {
        if (splitInvoice.linkedInvoiceId) {
            toast({
                title: "Controlled by linked invoice",
                description: `This split billing line is managed by ${splitInvoice.linkedInvoice?.invoiceNumber ?? "its linked invoice"} and cannot be edited here.`,
                variant: "error"
            })
            return
        }
        setEditingSplitInvoiceId(splitInvoice.id)
        setSplitInvoiceError(null)
        setSplitInvoiceForm({
            description: splitInvoice.description ?? "",
            valueExVat: splitInvoice.valueExVat != null ? String(splitInvoice.valueExVat) : "",
            status: String(splitInvoice.status ?? "TO_SEND"),
            invoiceDate: splitInvoice.invoiceDate ?? "",
        })
        setIsSplitInvoiceOpen(true)
    }

    const updateInvoiceLineItem = (id: string, field: "description" | "quantity" | "unitPrice" | "taxRate", value: any) => {
        setInvoiceForm((prev) => ({
            ...prev,
            lineItems: prev.lineItems.map((item) => (item.id === id ? { ...item, [field]: value } : item)),
        }))
    }

    const validateInvoiceForm = () => {
        const nextErrors: { title?: string; dueDate?: string; lineItems?: string } = {}
        const nextItemErrors: Record<string, { description?: string; quantity?: string; unitPrice?: string }> = {}
        if (!invoiceForm.title.trim()) nextErrors.title = "Invoice title is required."
        if (!invoiceForm.dueDate) nextErrors.dueDate = "Due date is required."
        if (invoiceForm.lineItems.length === 0) nextErrors.lineItems = "Add at least one line item."

        invoiceForm.lineItems.forEach((item) => {
            const itemError: { description?: string; quantity?: string; unitPrice?: string } = {}
            if (!item.description.trim()) itemError.description = "Description required."
            if (!item.quantity || Number(item.quantity) <= 0) itemError.quantity = "Qty must be > 0."
            if (Number(item.unitPrice) < 0) itemError.unitPrice = "Price must be >= 0."
            if (Object.keys(itemError).length > 0) nextItemErrors[item.id] = itemError
        })

        setInvoiceErrors(nextErrors)
        setInvoiceItemErrors(nextItemErrors)
        return Object.keys(nextErrors).length === 0 && Object.keys(nextItemErrors).length === 0
    }

    const getFileNameFromUrl = (url: string) => {
        try {
            const parsed = new URL(url)
            const pathname = parsed.pathname || ""
            const candidate = pathname.split("/").pop() || ""
            return decodeURIComponent(candidate || "Attachment")
        } catch {
            const candidate = url.split("?")[0]?.split("#")[0]?.split("/").pop() || ""
            return decodeURIComponent(candidate || "Attachment")
        }
    }

    const getFileExt = (nameOrUrl: string) => {
        const fileName = getFileNameFromUrl(nameOrUrl)
        const match = fileName.match(/\.([a-z0-9]+)$/i)
        return (match?.[1] || "").toLowerCase()
    }

    const isImageFile = (nameOrUrl: string) => {
        if (nameOrUrl.startsWith("data:image/")) return true
        const ext = getFileExt(nameOrUrl)
        return ["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp", "tif", "tiff", "heic"].includes(ext)
    }

    const renderFileIcon = (nameOrUrl: string) => {
        const ext = getFileExt(nameOrUrl)
        if (ext === "pdf") return <FileText className="h-8 w-8 text-red-500" />
        if (["xls", "xlsx", "csv"].includes(ext)) return <FileSpreadsheet className="h-8 w-8 text-emerald-600" />
        if (["zip", "rar", "7z", "tar", "gz"].includes(ext)) return <FileArchive className="h-8 w-8 text-amber-600" />
        if (["doc", "docx", "txt", "rtf"].includes(ext)) return <FileText className="h-8 w-8 text-sky-600" />
        return <File className="h-8 w-8 text-slate-500" />
    }

    const getUpdateUserRoleCodes = (update: any) => {
        const roles = Array.isArray(update?.user?.roles) ? update.user.roles : []
        return roles
            .map((role: any) => String(role?.code ?? role ?? "").toUpperCase())
            .filter(Boolean)
    }

    const isFieldSubmission = (update: any) => {
        const roleCodes = getUpdateUserRoleCodes(update)
        return roleCodes.includes("FIELD_WORKER") || roleCodes.includes("SUB_CONTRACTOR")
    }

    const getUpdateActorName = (update: any) => {
        const fullName = String(update?.user?.fullName ?? "").trim()
        const email = String(update?.user?.email ?? "").trim()
        return fullName || email || "Field User"
    }

    const getUpdateActorRole = (update: any) => {
        const roleCodes = getUpdateUserRoleCodes(update)
        if (roleCodes.includes("SUB_CONTRACTOR")) return "Sub-Contractor"
        if (roleCodes.includes("FIELD_WORKER")) return "Field Worker"
        return "Field User"
    }

    const getUserRoleCodes = (user: any) => {
        const roles = Array.isArray(user?.roles) ? user.roles : []
        return roles
            .map((role: any) => String(role?.code ?? role ?? "").toUpperCase())
            .filter(Boolean)
    }

    const isAssignableInternalUser = (user: any, contractorUserIds: Set<string>) => {
        if (!user || user.isActive === false) return false
        if (Boolean(user?.isPrimaryAdmin)) return false
        if (contractorUserIds.has(user.id)) return false
        const roleCodes = getUserRoleCodes(user)
        if (roleCodes.includes("SUB_CONTRACTOR") || roleCodes.includes("CUSTOMER")) return false
        return true
    }

    const contractorIds = new Set(contractors.map((contractor) => contractor.userId))
    const compliantContractors = contractors.filter(
        (contractor) => contractor.complianceStatus === "COMPLIANT" && contractor.user?.isActive !== false
    )
    const internalUsers = users.filter((user) => isAssignableInternalUser(user, contractorIds))
    const internalTeams = teams.filter((team) => !team.isDeleted && team.isActive !== false)

    const selectedTeam = useMemo(
        () => internalTeams.find((team) => team.id === selectedTeamId) ?? null,
        [internalTeams, selectedTeamId]
    )

    const selectedAssigneeIds = useMemo<string[]>(() => {
        if (assignmentType === "SUB_CONTRACTOR") {
            return selectedUserId ? [selectedUserId] : []
        }
        if (assignmentSource === "TEAM") {
            return Array.isArray(selectedTeam?.members)
                ? selectedTeam.members.map((member: any) => member.userId).filter(Boolean)
                : []
        }
        return selectedUserId ? [selectedUserId] : []
    }, [assignmentType, assignmentSource, selectedTeam, selectedUserId])

    const selectedAssigneeLabels = useMemo<string[]>(() => {
        const userMap = new Map(users.map((user) => [user.id, user.fullName ?? user.email ?? "Crew Member"]))
        const contractorMap = new Map(contractors.map((contractor) => [
            contractor.userId,
            contractor.user?.fullName ?? contractor.contactName ?? contractor.companyName ?? "Contractor",
        ]))
        return selectedAssigneeIds.map((id: string) => contractorMap.get(id) ?? userMap.get(id) ?? "Crew Member")
    }, [selectedAssigneeIds, users, contractors])

    const getDefaultAssignmentHourlyRate = () => {
        if (assignmentType === "INTERNAL" && assignmentSource === "TEAM") {
            const teamRate = Number(selectedTeam?.hourlyRate ?? 0)
            return Number.isFinite(teamRate) && teamRate > 0 ? teamRate : undefined
        }
        const selectedUser =
            assignmentType === "SUB_CONTRACTOR"
                ? compliantContractors.find((contractor) => contractor.userId === selectedUserId)?.user
                : users.find((user) => user.id === selectedUserId)
        const userRate = Number(selectedUser?.hourlyRate ?? 0)
        return Number.isFinite(userRate) && userRate > 0 ? userRate : undefined
    }

    const selectedAssignmentRateSource =
        assignmentType === "INTERNAL" && assignmentSource === "TEAM"
            ? getDefaultAssignmentHourlyRate()
                ? "Prefilled from the selected team rate. You can override it for this job."
                : "No team rate is set. Leave blank to use member/default rates, or enter a job-specific rate."
            : getDefaultAssignmentHourlyRate()
            ? "Prefilled from the selected person profile. You can override it for this job."
            : "No profile rate is set. Leave blank to use the workspace default, or enter a job-specific rate."

    useEffect(() => {
        if (!isAssignmentReviewOpen) return
        const defaultRate = getDefaultAssignmentHourlyRate()
        setAssignmentHourlyRate(defaultRate !== undefined ? String(defaultRate) : "")
        setAssignmentScheduleErrors((prev) => ({ ...prev, hourlyRate: undefined }))
    }, [isAssignmentReviewOpen, assignmentType, assignmentSource, selectedUserId, selectedTeamId])

    const availabilityRows = useMemo(() => {
        const selectedIds = new Set(selectedAssigneeIds)
        if (selectedIds.size === 0 || !job?.scheduledAt || !job?.scheduledEndAt) return []
        const currentStart = new Date(job.scheduledAt).getTime()
        const currentEnd = new Date(job.scheduledEndAt).getTime()
        if (Number.isNaN(currentStart) || Number.isNaN(currentEnd)) return []

        const activeAssignments = allAssignments.filter((assignment) => assignment.isActive !== false && assignment.isDeleted !== true)
        const jobsById = new Map(
            allJobs
                .filter((entry) => entry.id !== job.id)
                .map((entry) => [entry.id, entry])
        )

        const overlaps: Array<{ userId: string; userName: string; conflictJobId: string; conflictTitle: string; conflictLocation?: string; start?: string; end?: string }> = []
        for (const assignment of activeAssignments) {
            if (!selectedIds.has(assignment.userId)) continue
            const conflictJob = jobsById.get(assignment.jobId)
            if (!conflictJob?.scheduledAt || !conflictJob?.scheduledEndAt) continue
            const conflictStart = new Date(conflictJob.scheduledAt).getTime()
            const conflictEnd = new Date(conflictJob.scheduledEndAt).getTime()
            if (Number.isNaN(conflictStart) || Number.isNaN(conflictEnd)) continue
            const overlapsCurrent = conflictStart < currentEnd && conflictEnd > currentStart
            if (!overlapsCurrent) continue
            overlaps.push({
                userId: assignment.userId,
                userName:
                    users.find((entry) => entry.id === assignment.userId)?.fullName ||
                    contractors.find((entry) => entry.userId === assignment.userId)?.user?.fullName ||
                    "Crew Member",
                conflictJobId: conflictJob.id,
                conflictTitle: conflictJob.title ?? "Scheduled Job",
                conflictLocation: conflictJob.location,
                start: conflictJob.scheduledAt,
                end: conflictJob.scheduledEndAt,
            })
        }
        return overlaps.sort((a, b) => {
            if (a.userName !== b.userName) return a.userName.localeCompare(b.userName)
            return new Date(a.start ?? 0).getTime() - new Date(b.start ?? 0).getTime()
        })
    }, [selectedAssigneeIds, job, allAssignments, allJobs, users, contractors])

    const assignmentReviewAvailabilityRows = useMemo(() => {
        const selectedIds = new Set(selectedAssigneeIds)
        if (selectedIds.size === 0 || !assignmentScheduleForm.scheduledAt || !assignmentScheduleForm.scheduledEndAt || !job?.id) return []
        const currentStart = assignmentScheduleForm.scheduledAt.getTime()
        const currentEnd = assignmentScheduleForm.scheduledEndAt.getTime()
        if (Number.isNaN(currentStart) || Number.isNaN(currentEnd)) return []

        const activeAssignments = allAssignments.filter((assignment) => assignment.isActive !== false && assignment.isDeleted !== true)
        const jobsById = new Map(
            allJobs
                .filter((entry) => entry.id !== job.id)
                .map((entry) => [entry.id, entry])
        )

        const overlaps: Array<{ userId: string; userName: string; conflictJobId: string; conflictTitle: string; conflictLocation?: string; start?: string; end?: string }> = []
        for (const assignment of activeAssignments) {
            if (!selectedIds.has(assignment.userId)) continue
            const conflictJob = jobsById.get(assignment.jobId)
            if (!conflictJob?.scheduledAt || !conflictJob?.scheduledEndAt) continue
            const conflictStart = new Date(conflictJob.scheduledAt).getTime()
            const conflictEnd = new Date(conflictJob.scheduledEndAt).getTime()
            if (Number.isNaN(conflictStart) || Number.isNaN(conflictEnd)) continue
            const overlapsCurrent = conflictStart < currentEnd && conflictEnd > currentStart
            if (!overlapsCurrent) continue
            overlaps.push({
                userId: assignment.userId,
                userName:
                    users.find((entry) => entry.id === assignment.userId)?.fullName ||
                    contractors.find((entry) => entry.userId === assignment.userId)?.user?.fullName ||
                    "Crew Member",
                conflictJobId: conflictJob.id,
                conflictTitle: conflictJob.title ?? "Scheduled Job",
                conflictLocation: conflictJob.location,
                start: conflictJob.scheduledAt,
                end: conflictJob.scheduledEndAt,
            })
        }
        return overlaps.sort((a, b) => {
            if (a.userName !== b.userName) return a.userName.localeCompare(b.userName)
            return new Date(a.start ?? 0).getTime() - new Date(b.start ?? 0).getTime()
        })
    }, [selectedAssigneeIds, assignmentScheduleForm.scheduledAt, assignmentScheduleForm.scheduledEndAt, job?.id, allAssignments, allJobs, users, contractors])
    const timeEntriesByAssignee = useMemo(() => {
        const grouped = timeEntries.reduce((acc, entry) => {
            const key = String(entry.user?.id ?? entry.user?.email ?? "field-user")
            if (!acc[key]) {
                acc[key] = {
                    key,
                    name: String(entry.user?.fullName ?? entry.user?.email ?? "Field User"),
                    entries: [] as any[],
                    totalMinutes: 0
                }
            }
            acc[key].entries.push(entry)
            acc[key].totalMinutes += Number(entry.durationMinutes ?? 0)
            return acc
        }, {} as Record<string, { key: string; name: string; entries: any[]; totalMinutes: number }>)
        return (Object.values(grouped) as Array<{ key: string; name: string; entries: any[]; totalMinutes: number }>)
            .map((group) => ({
                ...group,
                entries: [...group.entries].sort(
                    (a, b) => new Date(b.startTime ?? 0).getTime() - new Date(a.startTime ?? 0).getTime()
                )
            }))
            .sort((a, b) => a.name.localeCompare(b.name))
    }, [timeEntries])

    const assignmentCombinationSummary = useMemo(() => {
        if (assignedUsers.length === 0) return []
        const grouped = new Map<string, { label: string; members: string[] }>()
        for (const user of assignedUsers) {
            const isSub = String(user.role ?? "").toLowerCase().includes("sub-contractor")
            const label = isSub
                ? "Sub-Contractor • Individual"
                : user.teamName
                ? `Internal • Team: ${user.teamName}`
                : "Internal • Individual"
            const key = `${label}`
            const current = grouped.get(key) ?? { label, members: [] }
            current.members.push(String(user.fullName ?? "User"))
            grouped.set(key, current)
        }
        return Array.from(grouped.values()).map((group) => ({
            ...group,
            count: group.members.length,
        }))
    }, [assignedUsers])

    const jobFinancials = useMemo(() => {
        const invoicedRevenue = jobInvoices
            .filter((inv) => inv.status !== "VOID" && inv.status !== "DRAFT")
            .reduce((sum, inv) => sum + Number(inv.total ?? 0), 0)
        
        const totalExpenses = expenses.reduce((sum, exp) => sum + Number(exp.amount ?? 0), 0)
        
        const totalLabourCost = timeEntries.reduce((sum, entry) => {
            const hours = Number(entry.durationMinutes ?? 0) / 60
            const rate = Number(entry.hourlyRate ?? 0)
            return sum + (hours * rate)
        }, 0)

        const estimatedRevenue = Number(job?.amount ?? 0)
        const revenue = invoicedRevenue > 0 ? invoicedRevenue : estimatedRevenue
        
        const totalCost = totalExpenses + totalLabourCost
        const netProfit = revenue - totalCost
        const profitMargin = revenue > 0 ? (netProfit / revenue) * 100 : 0

        return {
            invoicedRevenue,
            estimatedRevenue,
            revenue,
            totalExpenses,
            totalLabourCost,
            totalCost,
            netProfit,
            profitMargin
        }
    }, [jobInvoices, expenses, timeEntries, job])

    const splitInvoiceSummary = useMemo(() => {
        const totalExVat = splitInvoices.reduce((sum, item) => sum + Number(item.valueExVat ?? 0), 0)
        const invoicedExVat = splitInvoices
            .filter((item) => ["INVOICED", "PAID"].includes(String(item.status ?? "").toUpperCase()))
            .reduce((sum, item) => sum + Number(item.valueExVat ?? 0), 0)
        const paidExVat = splitInvoices
            .filter((item) => String(item.status ?? "").toUpperCase() === "PAID")
            .reduce((sum, item) => sum + Number(item.valueExVat ?? 0), 0)

        return {
            totalExVat,
            invoicedExVat,
            paidExVat,
            remainingExVat: Math.max(totalExVat - invoicedExVat, 0),
        }
    }, [splitInvoices])

    const refreshSplitInvoices = async () => {
        if (!splitInvoicing) {
            setSplitInvoices([])
            return
        }
        const res = await apiGet<any[]>(`/jobs/${resolvedParams.id}/split-invoices`)
        setSplitInvoices(Array.isArray(res.data) ? res.data : [])
    }

    useEffect(() => {
        if (timeEntriesByAssignee.length === 0) {
            setOpenTimesheetAssignee(null)
            setTimesheetAutoOpened(false)
            return
        }
        if (!timesheetAutoOpened) {
            setOpenTimesheetAssignee(timeEntriesByAssignee[0].key)
            setTimesheetAutoOpened(true)
            return
        }
        const stillExists = timeEntriesByAssignee.some((group) => group.key === openTimesheetAssignee)
        if (openTimesheetAssignee !== null && !stillExists) {
            setOpenTimesheetAssignee(timeEntriesByAssignee[0].key)
        }
    }, [timeEntriesByAssignee, openTimesheetAssignee, timesheetAutoOpened])

    useEffect(() => {
        if (!selectedUserId) return
        const exists = assignmentType === "SUB_CONTRACTOR"
            ? compliantContractors.some((contractor) => contractor.userId === selectedUserId)
            : internalUsers.some((user) => user.id === selectedUserId)
        if (!exists) {
            setSelectedUserId("")
        }
    }, [assignmentType, compliantContractors, internalUsers, selectedUserId])

    useEffect(() => {
        if (assignmentType === "SUB_CONTRACTOR") {
            setAssignmentSource("INDIVIDUAL")
            setSelectedTeamId("")
            return
        }
        if (assignmentSource === "TEAM") {
            setSelectedUserId("")
        } else {
            setSelectedTeamId("")
        }
    }, [assignmentType, assignmentSource])

    useEffect(() => {
        if (!selectedTeamId) return
        const exists = internalTeams.some((team) => team.id === selectedTeamId)
        if (!exists) {
            setSelectedTeamId("")
        }
    }, [internalTeams, selectedTeamId])

    useEffect(() => {
        const load = async () => {
            try {
                const [jobRes, updatesRes, attachmentsRes, usersRes, customersRes, assignmentsRes, expensesRes, timeRes, quotesRes, invoicesRes, teamsRes, jobsRes, allAssignmentsRes, splitInvoicesRes, expenseCategoriesRes, activitiesRes, complianceRes] = await Promise.all([
                    apiGet<any>(`/jobs/${resolvedParams.id}`),
                    apiGet<any[]>(`/jobs/${resolvedParams.id}/updates`),
                    apiGet<any[]>(`/jobs/${resolvedParams.id}/attachments`),
                    apiGet<any[]>(`/users`),
                    apiGet<any[]>(`/customers`),
                    apiGet<any[]>(`/jobs/${resolvedParams.id}/assignments`),
                    apiGet<any[]>(`/jobs/${resolvedParams.id}/expenses`),
                    apiGet<any[]>(`/jobs/${resolvedParams.id}/time-entries`),
                    apiGet<any[]>(`/jobs/${resolvedParams.id}/quotes`),
                    apiGet<any[]>(`/jobs/${resolvedParams.id}/invoices`).catch(() => ({ data: [] })),
                    apiGet<any[]>(`/teams`).catch(() => ({ data: [] })),
                    apiGet<any[]>(`/jobs`).catch(() => ({ data: [] })),
                    apiGet<any[]>(`/jobs/assignments`).catch(() => ({ data: [] })),
                    splitInvoicing
                        ? apiGet<any[]>(`/jobs/${resolvedParams.id}/split-invoices`).catch(() => ({ data: [] }))
                        : Promise.resolve({ data: [] as any[] }),
                    apiGet<AutocompleteOption[]>(`/lookups?type=job_expense_category`).catch(() => ({ data: [] })),
                    apiGet<any[]>(`/jobs/${resolvedParams.id}/activities`).catch(() => ({ data: [] })),
                    complianceReports
                        ? apiGet<{ items?: any[] }>(`/compliance/records?jobId=${resolvedParams.id}`).catch(() => ({ data: { items: [] as any[] } }))
                        : Promise.resolve({ data: { items: [] as any[] } }),
                ])
                let contractorsData: any[] = []
                try {
                    const contractorsRes = await apiGet<any[]>(`/contractors`)
                    contractorsData = Array.isArray(contractorsRes.data) ? contractorsRes.data : []
                } catch {
                    contractorsData = []
                }
                setContractors(contractorsData)
                const contractorMap = new Map(contractorsData.map((contractor) => [contractor.userId, contractor]))
                setJob(jobRes.data)
                setUpdates(Array.isArray(updatesRes.data) ? updatesRes.data : [])
                setAttachments(Array.isArray(attachmentsRes.data) ? attachmentsRes.data : [])
                setExpenses(Array.isArray(expensesRes.data) ? expensesRes.data : [])
                setTimeEntries(Array.isArray(timeRes.data) ? timeRes.data : [])
                setJobQuotes(Array.isArray(quotesRes.data) ? quotesRes.data : [])
                setJobInvoices(Array.isArray(invoicesRes.data) ? invoicesRes.data : [])
                setSplitInvoices(Array.isArray(splitInvoicesRes.data) ? splitInvoicesRes.data : [])
                setComplianceRecords(Array.isArray(complianceRes.data?.items) ? complianceRes.data.items : [])
                setTeams(Array.isArray(teamsRes.data) ? teamsRes.data : [])
                setAllJobs(Array.isArray(jobsRes.data) ? jobsRes.data : [])
                setAllAssignments(Array.isArray(allAssignmentsRes.data) ? allAssignmentsRes.data : [])
                setUsers(Array.isArray(usersRes.data) ? usersRes.data : [])
                setCustomers(Array.isArray(customersRes.data) ? customersRes.data : [])
                setExpenseCategoryOptions(Array.isArray(expenseCategoriesRes.data) ? expenseCategoriesRes.data : [])
                setActivities(Array.isArray(activitiesRes.data) ? activitiesRes.data : [])
                const assignments = Array.isArray(assignmentsRes.data) ? assignmentsRes.data : []
                setAssignedUsers(assignments.map((assignment) => ({
                    id: assignment.userId,
                    fullName: assignment.user?.fullName ?? assignment.user?.email ?? "User",
                    role: assignment.assignmentType === "SUB_CONTRACTOR" ? "Sub-Contractor" : "Internal",
                    complianceStatus: contractorMap.get(assignment.userId)?.complianceStatus,
                    teamName: assignment.team?.name,
                    teamId: assignment.team?.id,
                    assignmentType: assignment.assignmentType,
                    effectiveHourlyRate: assignment.effectiveHourlyRate,
                    contractorId: contractorMap.get(assignment.userId)?.id,
                })))

                // Pre-populate assignment dropdowns from current active assignment combination.
                const internalAssignments = assignments.filter((entry) => entry.assignmentType === "INTERNAL")
                const subAssignments = assignments.filter((entry) => entry.assignmentType === "SUB_CONTRACTOR")

                if (internalAssignments.length > 0) {
                    setAssignmentType("INTERNAL")
                    const internalTeamIds = Array.from(
                        new Set(
                            internalAssignments
                                .map((entry) => entry.team?.id ?? entry.teamId)
                                .filter((value): value is string => Boolean(value))
                        )
                    )
                    if (internalTeamIds.length === 1) {
                        setAssignmentSource("TEAM")
                        setSelectedTeamId(internalTeamIds[0])
                        setSelectedUserId("")
                    } else {
                        setAssignmentSource("INDIVIDUAL")
                        const primaryInternal =
                            internalAssignments.find((entry) => entry.isPrimary) ?? internalAssignments[0]
                        setSelectedUserId(primaryInternal?.userId ?? "")
                        setSelectedTeamId("")
                    }
                } else if (subAssignments.length > 0) {
                    setAssignmentType("SUB_CONTRACTOR")
                    setAssignmentSource("INDIVIDUAL")
                    const primarySub = subAssignments.find((entry) => entry.isPrimary) ?? subAssignments[0]
                    setSelectedUserId(primarySub?.userId ?? "")
                    setSelectedTeamId("")
                }
                setError(null)
            } catch (err: any) {
                setError(err?.message ?? "Failed to load job")
            }
        }
        load()
    }, [complianceReports, resolvedParams.id, splitInvoicing])

    const createExpenseCategoryOption = async (title: string) => {
        const response = await apiPost<AutocompleteOption>("/lookups", { title, type: "job_expense_category" })
        setExpenseCategoryOptions((prev) => {
            const existing = prev.filter((option) => option.title.toLowerCase() !== response.data.title.toLowerCase())
            return [...existing, response.data].sort((a, b) => a.title.localeCompare(b.title))
        })
        return response.data
    }

    const getPriorityColor = (priority: string) => {
        switch (priority) {
            case 'Emergency': return 'border-destructive text-destructive'
            case 'High': return 'border-warning text-warning'
            case 'Medium': return 'border-primary-light text-primary'
            default: return 'border-glass-border text-muted-foreground'
        }
    }

    const getCustomerName = (customerId?: string) => {
        const customer = customers.find((c) => c.id === customerId)
        return customer?.name ?? "Customer"
    }

    if (!canView) {
        return (
            <PageContainer>
                <GlassCard>
                    <GlassCardHeader>
                        <GlassCardTitle>Job Details</GlassCardTitle>
                    </GlassCardHeader>
                    <GlassCardContent>You do not have access to view scheduling.</GlassCardContent>
                </GlassCard>
            </PageContainer>
        )
    }

    if (!job) {
        return (
            <PageContainer>
                <div className="text-center p-12">Job not found</div>
                <ErrorToast error={error} onClear={() => setError(null)} />
            </PageContainer>
        )
    }

    const expenseReceiptInputId = `expense-receipt-${job?.id ?? "job"}`

    const fieldUpdates = updates.filter((entry) => isFieldSubmission(entry))
    const issueUpdates = updates
        .filter((entry) => String(entry?.status ?? "").toUpperCase() === "REQUIRES_FOLLOW_UP" && String(entry?.notes ?? "").trim())
        .sort((a, b) => new Date(b?.createdAt ?? 0).getTime() - new Date(a?.createdAt ?? 0).getTime())
    const latestIssueUpdate = issueUpdates[0]
    const latestIssueReason = String(latestIssueUpdate?.notes ?? "").trim()
    const showIssueAlert = normalizedJobStatus === "REQUIRES_FOLLOW_UP" && latestIssueReason
    const fieldUpdatesByUser = fieldUpdates.reduce((acc, entry) => {
        const actor = getUpdateActorName(entry)
        if (!acc[actor]) {
            acc[actor] = []
        }
        acc[actor].push(entry)
        return acc
    }, {} as Record<string, any[]>)
    const fieldUpdateUsers = Object.keys(fieldUpdatesByUser).sort((a, b) => a.localeCompare(b))

    const handleMarkComplete = async () => {
        if (!canManage) {
            toast({
                title: "Insufficient permissions",
                description: "You can view jobs but cannot close them.",
                variant: "error"
            })
            return
        }
        const confirmed = typeof window === "undefined" || window.confirm(
            "Before closing this job, please confirm you have reviewed all job details, field updates, finances, invoices, expenses, timesheets, and related information. Do you want to close this job now?"
        )
        if (!confirmed) {
            return
        }
        try {
            await apiPost(`/jobs/${job.id}/status`, { status: "COMPLETED" })
            setJob({ ...job, status: "COMPLETED" })
            await refreshActivities()
            toast({
                title: "Closed",
                description: "Job closed successfully.",
                variant: "success"
            })
        } catch (err: any) {
            toast({
                title: "Update Failed",
                description: err?.message ?? "Failed to update status.",
                variant: "error"
            })
        }
    }

    const handleGenerateInvoice = async () => {
        if (!canManage) {
            toast({
                title: "Insufficient permissions",
                description: "You can view jobs but cannot generate invoices.",
                variant: "error"
            })
            return
        }
        if (!job?.customerId) {
            toast({
                title: "Missing client",
                description: "Link a client to this job before creating an invoice.",
                variant: "error",
            })
            return
        }
        const quoteWithItems = [...jobQuotes]
            .sort((a, b) => new Date(b?.createdAt ?? 0).getTime() - new Date(a?.createdAt ?? 0).getTime())
            .find((quote) => Array.isArray(quote?.lineItems) && quote.lineItems.length > 0)
        const fallbackPrice = Number(job?.amount ?? 0)
        const lineItems =
            Array.isArray(quoteWithItems?.lineItems) && quoteWithItems.lineItems.length > 0
                ? quoteWithItems.lineItems.map((item: any, index: number) => ({
                    id: `${Date.now()}-${index}`,
                    description: String(item?.description ?? "").trim(),
                    quantity: Number(item?.quantity ?? 1) || 1,
                    unitPrice: Number(item?.unitPrice ?? 0) || 0,
                    taxRate: Number(item?.vatRate ?? 20) || 0,
                }))
                : [
                    {
                        id: `${Date.now()}-0`,
                        description: String(job?.description ?? job?.title ?? "Job work").trim(),
                        quantity: 1,
                        unitPrice: Number.isFinite(fallbackPrice) ? fallbackPrice : 0,
                        taxRate: 20,
                    },
                ]
        setInvoiceForm({
            title: `${job.title ?? "Job"} Invoice`,
            dueDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
            vatNumber: "",
            lineItems,
        })
        setEditingInvoiceId(null)
        setInvoiceErrors({})
        setInvoiceItemErrors({})
        setIsCreateInvoiceOpen(true)
    }

    const openEditInvoiceDialog = (invoice: any) => {
        setEditingInvoiceId(invoice.id)
        setInvoiceForm({
            title: invoice.title ?? "",
            dueDate: invoice.dueDate ? new Date(invoice.dueDate) : null,
            vatNumber: invoice.vatNumber ?? "",
            lineItems: Array.isArray(invoice.lineItems) && invoice.lineItems.length > 0
                ? invoice.lineItems.map((item: any, index: number) => ({
                    id: String(item.id ?? `${invoice.id}-${index}`),
                    description: String(item.description ?? "").trim(),
                    quantity: Number(item.quantity ?? 1) || 1,
                    unitPrice: Number(item.unitPrice ?? 0) || 0,
                    taxRate: Number(item.vatRate ?? item.taxRate ?? 0) || 0,
                }))
                : [{ id: `${invoice.id}-0`, description: invoice.title ?? "Invoice item", quantity: 1, unitPrice: Number(invoice.subTotal ?? invoice.total ?? 0) || 0, taxRate: 20 }],
        })
        setInvoiceErrors({})
        setInvoiceItemErrors({})
        setIsCreateInvoiceOpen(true)
    }

    const handleCreateInvoiceFromJob = async (sendNow = false) => {
        if (!canManage) {
            toast({
                title: "Insufficient permissions",
                description: "You can view jobs but cannot generate invoices.",
                variant: "error"
            })
            return
        }
        if (!validateInvoiceForm()) return
        setInvoiceCreateAction(sendNow ? "CREATE_SEND" : "CREATE")
        setIsGeneratingInvoice(true)
        try {
            const payload = {
                title: invoiceForm.title.trim(),
                customerId: job.customerId,
                jobId: job.id,
                dueDate: invoiceForm.dueDate ? invoiceForm.dueDate.toISOString().split("T")[0] : undefined,
                vatNumber: invoiceForm.vatNumber.trim() || undefined,
                lineItems: invoiceForm.lineItems.map((item) => ({
                    description: item.description.trim(),
                    quantity: Number(item.quantity),
                    unitPrice: Number(item.unitPrice),
                    vatRate: Number(item.taxRate),
                })),
            }
            if (editingInvoiceId) {
                const res = await apiPut<any>(`/invoices/${editingInvoiceId}`, payload)
                setJobInvoices((prev) => prev.map((invoice) => (invoice.id === editingInvoiceId ? res.data : invoice)))
                await refreshActivities()
                setIsCreateInvoiceOpen(false)
                setEditingInvoiceId(null)
                toast({
                    title: "Invoice updated",
                    description: "Invoice changes have been saved.",
                    variant: "success",
                })
                return
            }
            const res = await apiPost<any>(`/invoices/from-job/${job.id}`, payload)
            let createdInvoice = res.data
            const invoiceId = createdInvoice?.id
            if (invoiceId && sendNow) {
                try {
                    const sendRes = await apiPost<any>(`/invoices/${invoiceId}/send`)
                    if (sendRes?.data) {
                        createdInvoice = sendRes.data
                    }
                } catch (sendErr: any) {
                    setJobInvoices((prev) => [createdInvoice, ...prev.filter((item) => item.id !== createdInvoice.id)])
                    setActiveDetailsTab("invoices")
                    setIsCreateInvoiceOpen(false)
                    toast({
                        title: "Invoice created, send failed",
                        description: sendErr?.message ?? "Invoice was created but could not be sent.",
                        variant: "error"
                    })
                    return
                }
            }
            if (createdInvoice) {
                setJobInvoices((prev) => [createdInvoice, ...prev.filter((item) => item.id !== createdInvoice.id)])
            }
            toast({
                title: sendNow ? "Invoice created & sent" : "Invoice created",
                description: sendNow
                    ? "Invoice has been created and sent to the customer."
                    : "Invoice has been created for this job.",
                variant: "success"
            })
            setActiveDetailsTab("invoices")
            setIsCreateInvoiceOpen(false)
        } catch (err: any) {
            toast({
                title: "Failed to create invoice",
                description: err?.message ?? "Unable to create invoice.",
                variant: "error"
            })
        } finally {
            setIsGeneratingInvoice(false)
            setInvoiceCreateAction(null)
        }
    }

    const handleDeleteInvoice = async (invoice: any) => {
        if (!canManage) {
            toast({
                title: "Insufficient permissions",
                description: "You can view jobs but cannot delete invoices.",
                variant: "error",
            })
            return
        }
        const confirmed = typeof window === "undefined" || window.confirm(
            `Delete invoice ${invoice.invoiceNumber ?? invoice.title ?? invoice.id}? This cannot be undone.`
        )
        if (!confirmed) return
        setDeletingInvoiceId(invoice.id)
        try {
            await apiDelete(`/invoices/${invoice.id}`, { confirmed: true })
            setJobInvoices((prev) => prev.filter((entry) => entry.id !== invoice.id))
            await refreshActivities()
            toast({
                title: "Invoice deleted",
                description: "Invoice has been removed from this job.",
                variant: "success",
            })
        } catch (err: any) {
            toast({
                title: "Delete failed",
                description: err?.message ?? "Unable to delete invoice.",
                variant: "error",
            })
        } finally {
            setDeletingInvoiceId(null)
        }
    }

    const handleSaveSplitInvoice = async () => {
        if (!canManage) {
            toast({
                title: "Insufficient permissions",
                description: "You can view jobs but cannot manage split billing.",
                variant: "error"
            })
            return
        }

        const valueExVat = Number(splitInvoiceForm.valueExVat)
        if (!Number.isFinite(valueExVat) || valueExVat <= 0) {
            setSplitInvoiceError("Value ex VAT must be greater than 0.")
            return
        }

        setIsSplitInvoiceSaving(true)
        setSplitInvoiceError(null)
        try {
            const payload = {
                description: splitInvoiceForm.description.trim() || undefined,
                valueExVat,
                status: splitInvoiceForm.status,
                invoiceDate: splitInvoiceForm.invoiceDate || undefined,
            }

            if (editingSplitInvoiceId) {
                await apiPut(`/jobs/split-invoices/${editingSplitInvoiceId}`, payload)
            } else {
                await apiPost(`/jobs/${job.id}/split-invoices`, payload)
            }

            await refreshSplitInvoices()
            setIsSplitInvoiceOpen(false)
            resetSplitInvoiceForm()
            setActiveDetailsTab("split-invoices")
            toast({
                title: editingSplitInvoiceId ? "Split invoice updated" : "Split invoice added",
                description: editingSplitInvoiceId
                    ? "The split billing line has been updated."
                    : "A new split billing line has been added to this job.",
                variant: "success"
            })
        } catch (err: any) {
            setSplitInvoiceError(err?.message ?? "Unable to save split invoice.")
        } finally {
            setIsSplitInvoiceSaving(false)
        }
    }

    const handleDeleteSplitInvoice = async (splitInvoiceId: string) => {
        if (!canManage) {
            toast({
                title: "Insufficient permissions",
                description: "You can view jobs but cannot manage split billing.",
                variant: "error"
            })
            return
        }

        const splitInvoice = splitInvoices.find((item) => item.id === splitInvoiceId)
        if (splitInvoice?.linkedInvoiceId) {
            toast({
                title: "Cannot remove linked split line",
                description: `This split billing line is controlled by ${splitInvoice.linkedInvoice?.invoiceNumber ?? "a linked invoice"}. Remove or delete the invoice first.`,
                variant: "error"
            })
            return
        }

        setDeletingSplitInvoiceId(splitInvoiceId)
        try {
            await apiDelete(`/jobs/split-invoices/${splitInvoiceId}`)
            setSplitInvoices((prev) => prev.filter((item) => item.id !== splitInvoiceId))
            toast({
                title: "Split invoice removed",
                description: "The split billing line has been deleted.",
                variant: "success"
            })
        } catch (err: any) {
            if (isDeleteCancelled(err)) return
            toast({
                title: "Delete failed",
                description: err?.message ?? "Unable to delete split invoice.",
                variant: "error"
            })
        } finally {
            setDeletingSplitInvoiceId(null)
        }
    }

    const handleExpenseReceiptSelect = async (file?: File) => {
        if (!file) return
        setIsExpenseUploading(true)
        try {
            const formData = new FormData()
            formData.append("photos", file)
            const uploadRes = await apiPost<string[]>("/uploads/multiple-any", formData)
            const uploadedUrl = Array.isArray(uploadRes.data) ? uploadRes.data[0] : ""
            if (!uploadedUrl) {
                throw new Error("Receipt upload failed")
            }
            setExpenseForm((prev) => ({ ...prev, receiptUrl: uploadedUrl }))
            toast({
                title: "Receipt uploaded",
                description: "Expense invoice/receipt has been attached.",
                variant: "success"
            })
        } catch (err: any) {
            toast({
                title: "Upload failed",
                description: err?.message ?? "Unable to upload receipt.",
                variant: "error"
            })
        } finally {
            setIsExpenseUploading(false)
        }
    }

    const handleAddExpense = async () => {
        if (!canManage) {
            toast({
                title: "Insufficient permissions",
                description: "You can view jobs but cannot add expenses.",
                variant: "error"
            })
            return
        }
        const description = expenseForm.description.trim()
        const amount = Number(expenseForm.amount)
        if (!description) {
            toast({
                title: "Missing description",
                description: "Please add an expense description.",
                variant: "error"
            })
            return
        }
        if (!Number.isFinite(amount) || amount <= 0) {
            toast({
                title: "Invalid amount",
                description: "Please enter a valid amount greater than 0.",
                variant: "error"
            })
            return
        }
        setIsExpenseSaving(true)
        try {
            const payload = {
                description,
                category: expenseForm.category.trim() || undefined,
                amount,
                expenseDate: expenseForm.expenseDate,
                receiptUrl: expenseForm.receiptUrl || undefined,
            }
            const res = editingExpenseId
                ? await apiPut<any>(`/jobs/${job.id}/expenses/${editingExpenseId}`, payload)
                : await apiPost<any>(`/jobs/${job.id}/expenses`, payload)
            setExpenses((prev) =>
                editingExpenseId
                    ? prev.map((entry) => (entry.id === editingExpenseId ? res.data : entry))
                    : [res.data, ...prev]
            )
            await refreshActivities()
            setExpenseForm({
                description: "",
                category: "",
                amount: "",
                expenseDate: new Date().toISOString().slice(0, 10),
                receiptUrl: ""
            })
            setEditingExpenseId(null)
            setIsExpenseOpen(false)
            toast({
                title: editingExpenseId ? "Expense updated" : "Expense added",
                description: editingExpenseId ? "Expense has been updated." : "Expense has been added to this job.",
                variant: "success"
            })
        } catch (err: any) {
            toast({
                title: "Expense failed",
                description: err?.message ?? "Unable to add expense.",
                variant: "error"
            })
        } finally {
            setIsExpenseSaving(false)
        }
    }

    const openAddExpenseDialog = () => {
        setEditingExpenseId(null)
        setExpenseForm({
            description: "",
            category: "",
            amount: "",
            expenseDate: new Date().toISOString().slice(0, 10),
            receiptUrl: "",
        })
        setIsExpenseOpen(true)
    }

    const openEditExpenseDialog = (entry: any) => {
        setEditingExpenseId(entry.id)
        setExpenseForm({
            description: entry.description ?? "",
            category: entry.category ?? "",
            amount: entry.amount !== undefined && entry.amount !== null ? String(entry.amount) : "",
            expenseDate: entry.expenseDate ? String(entry.expenseDate).slice(0, 10) : new Date().toISOString().slice(0, 10),
            receiptUrl: entry.receiptUrl ?? "",
        })
        setIsExpenseOpen(true)
    }

    const refreshActivities = async () => {
        try {
            const response = await apiGet<any[]>(`/jobs/${job.id}/activities`)
            setActivities(Array.isArray(response.data) ? response.data : [])
        } catch {
            // Activity is supporting context; keep the main flow smooth if it cannot refresh.
        }
    }

    const handleDeleteExpense = async (expenseId: string) => {
        if (!canManage) {
            toast({
                title: "Insufficient permissions",
                description: "You can view jobs but cannot delete expenses.",
                variant: "error",
            })
            return
        }
        setDeletingExpenseId(expenseId)
        try {
            await apiDelete(`/jobs/${job.id}/expenses/${expenseId}`)
            setExpenses((prev) => prev.filter((entry) => entry.id !== expenseId))
            await refreshActivities()
            toast({
                title: "Expense deleted",
                description: "Expense has been removed from this job.",
                variant: "success",
            })
        } catch (err: any) {
            if (isDeleteCancelled(err)) return
            toast({
                title: "Delete failed",
                description: err?.message ?? "Unable to delete expense.",
                variant: "error",
            })
        } finally {
            setDeletingExpenseId(null)
        }
    }

    const openTimeEntryDialog = () => {
        const defaultUserId = assignedUsers[0]?.id ?? users[0]?.id ?? ""
        setEditingTimeEntryId(null)
        setTimeEntryForm({
            userId: defaultUserId,
            startTime: null,
            endTime: null,
            hourlyRate: "",
            notes: "",
        })
        setTimeEntryErrors({})
        setIsTimeEntryOpen(true)
    }

    const openEditTimeEntryDialog = (entry: any) => {
        setEditingTimeEntryId(entry.id)
        setTimeEntryForm({
            userId: entry.userId ?? entry.user?.id ?? "",
            startTime: entry.startTime ? new Date(entry.startTime) : null,
            endTime: entry.endTime ? new Date(entry.endTime) : null,
            hourlyRate: entry.hourlyRate !== undefined && entry.hourlyRate !== null ? String(entry.hourlyRate) : "",
            notes: entry.notes ?? "",
        })
        setTimeEntryErrors({})
        setIsTimeEntryOpen(true)
    }

    const handleCreateTimeEntry = async () => {
        if (!canManage) {
            toast({
                title: "Insufficient permissions",
                description: "You can view jobs but cannot add timesheets.",
                variant: "error",
            })
            return
        }
        const nextErrors: { userId?: string; startTime?: string; endTime?: string; hourlyRate?: string } = {}
        if (!timeEntryForm.userId) nextErrors.userId = "Select who this time entry belongs to."
        if (!timeEntryForm.startTime) nextErrors.startTime = "Start time is required."
        if (!timeEntryForm.endTime) nextErrors.endTime = "End time is required."
        if (timeEntryForm.startTime && timeEntryForm.endTime && timeEntryForm.endTime <= timeEntryForm.startTime) {
            nextErrors.endTime = "End time must be after start time."
        }
        const hourlyRate = timeEntryForm.hourlyRate.trim() ? Number(timeEntryForm.hourlyRate) : undefined
        if (hourlyRate !== undefined && (!Number.isFinite(hourlyRate) || hourlyRate < 0)) {
            nextErrors.hourlyRate = "Hourly rate must be zero or greater."
        }
        setTimeEntryErrors(nextErrors)
        if (Object.keys(nextErrors).length > 0) return

        setIsTimeEntrySaving(true)
        try {
            const payload = {
                userId: timeEntryForm.userId,
                startTime: timeEntryForm.startTime?.toISOString(),
                endTime: timeEntryForm.endTime?.toISOString(),
                hourlyRate,
                notes: timeEntryForm.notes.trim() || undefined,
            }
            const response = editingTimeEntryId
                ? await apiPut<any>(`/jobs/${job.id}/time-entries/${editingTimeEntryId}`, payload)
                : await apiPost<any>(`/jobs/${job.id}/time-entries`, payload)
            setTimeEntries((prev) =>
                editingTimeEntryId
                    ? prev.map((entry) => (entry.id === editingTimeEntryId ? response.data : entry))
                    : [response.data, ...prev]
            )
            await refreshActivities()
            setEditingTimeEntryId(null)
            setIsTimeEntryOpen(false)
            toast({
                title: editingTimeEntryId ? "Timesheet updated" : "Timesheet added",
                description: editingTimeEntryId ? "Time entry has been updated." : "Manual time entry has been saved.",
                variant: "success",
            })
        } catch (err: any) {
            toast({
                title: "Timesheet failed",
                description: err?.message ?? "Unable to add timesheet entry.",
                variant: "error",
            })
        } finally {
            setIsTimeEntrySaving(false)
        }
    }

    const handleDeleteTimeEntry = async (timeEntryId: string) => {
        if (!canManage) {
            toast({
                title: "Insufficient permissions",
                description: "You can view jobs but cannot delete timesheets.",
                variant: "error",
            })
            return
        }
        setDeletingTimeEntryId(timeEntryId)
        try {
            await apiDelete(`/jobs/${job.id}/time-entries/${timeEntryId}`)
            setTimeEntries((prev) => prev.filter((entry) => entry.id !== timeEntryId))
            await refreshActivities()
            toast({
                title: "Timesheet deleted",
                description: "Time entry has been removed from this job.",
                variant: "success",
            })
        } catch (err: any) {
            if (isDeleteCancelled(err)) return
            toast({
                title: "Delete failed",
                description: err?.message ?? "Unable to delete timesheet entry.",
                variant: "error",
            })
        } finally {
            setDeletingTimeEntryId(null)
        }
    }

    const openEditFieldUpdateDialog = (update: any) => {
        setEditingFieldUpdate(update)
        setFieldUpdateEditForm({ notes: update.notes ?? "" })
    }

    const handleUpdateFieldUpdate = async () => {
        if (!editingFieldUpdate || !canManage) return
        setIsFieldUpdateSaving(true)
        try {
            const response = await apiPut<any>(`/jobs/${job.id}/updates/${editingFieldUpdate.id}`, {
                notes: fieldUpdateEditForm.notes.trim() || undefined,
                photoUrls: Array.isArray(editingFieldUpdate.photoUrls) ? editingFieldUpdate.photoUrls : undefined,
                photoLabels: Array.isArray(editingFieldUpdate.photoLabels) ? editingFieldUpdate.photoLabels : undefined,
            })
            setUpdates((prev) => prev.map((entry) => (entry.id === editingFieldUpdate.id ? response.data : entry)))
            await refreshActivities()
            setEditingFieldUpdate(null)
            toast({
                title: "Field update saved",
                description: "Field update has been updated.",
                variant: "success",
            })
        } catch (err: any) {
            toast({
                title: "Update failed",
                description: err?.message ?? "Unable to update field update.",
                variant: "error",
            })
        } finally {
            setIsFieldUpdateSaving(false)
        }
    }

    const handleDeleteFieldUpdate = async (updateId: string) => {
        if (!canManage) return
        setDeletingFieldUpdateId(updateId)
        try {
            await apiDelete(`/jobs/${job.id}/updates/${updateId}`)
            setUpdates((prev) => prev.filter((entry) => entry.id !== updateId))
            await refreshActivities()
            toast({
                title: "Field update deleted",
                description: "Field update has been removed.",
                variant: "success",
            })
        } catch (err: any) {
            if (isDeleteCancelled(err)) return
            toast({
                title: "Delete failed",
                description: err?.message ?? "Unable to delete field update.",
                variant: "error",
            })
        } finally {
            setDeletingFieldUpdateId(null)
        }
    }

    const openEditAttachmentDialog = (attachment: any) => {
        setEditingAttachment(attachment)
        setAttachmentEditForm({
            name: attachment.name ?? "",
            label: attachment.label ?? "",
        })
    }

    const handleUpdateAttachment = async () => {
        if (!editingAttachment || !canManage) return
        setIsAttachmentSaving(true)
        try {
            const response = await apiPut<any>(`/jobs/${job.id}/attachments/${editingAttachment.id}`, {
                name: attachmentEditForm.name.trim() || undefined,
                label: attachmentEditForm.label.trim() || undefined,
            })
            setAttachments((prev) => prev.map((entry) => (entry.id === editingAttachment.id ? response.data : entry)))
            await refreshActivities()
            setEditingAttachment(null)
            toast({
                title: "Attachment updated",
                description: "Attachment details have been updated.",
                variant: "success",
            })
        } catch (err: any) {
            toast({
                title: "Update failed",
                description: err?.message ?? "Unable to update attachment.",
                variant: "error",
            })
        } finally {
            setIsAttachmentSaving(false)
        }
    }

    const handleDeleteAttachment = async (attachmentId: string) => {
        if (!canManage) return
        setDeletingAttachmentId(attachmentId)
        try {
            await apiDelete(`/jobs/${job.id}/attachments/${attachmentId}`)
            setAttachments((prev) => prev.filter((entry) => entry.id !== attachmentId))
            await refreshActivities()
            toast({
                title: "Attachment deleted",
                description: "Attachment has been removed.",
                variant: "success",
            })
        } catch (err: any) {
            if (isDeleteCancelled(err)) return
            toast({
                title: "Delete failed",
                description: err?.message ?? "Unable to delete attachment.",
                variant: "error",
            })
        } finally {
            setDeletingAttachmentId(null)
        }
    }

    const openEditJobDialog = () => {
        const parsedAddress = parseAddressValue(job.location ?? "")
        setEditForm({
            title: job.title ?? "",
            customerId: job.customerId ?? "",
            siteId: job.siteId ?? "",
            location: job.location ?? "",
            address: {
                ...emptyAddressValue(),
                ...parsedAddress,
                addressLine1: job.addressLine1 ?? parsedAddress.addressLine1,
                addressLine2: job.addressLine2 ?? parsedAddress.addressLine2,
                city: job.city ?? parsedAddress.city,
                state: job.state ?? parsedAddress.state,
                postalCode: job.postalCode ?? parsedAddress.postalCode,
                country: job.country ?? parsedAddress.country,
            },
            addressManuallyEdited: Boolean(job.addressManuallyEdited),
            description: job.description ?? "",
            priority: job.priority ?? "Medium",
            amount: job.amount !== undefined && job.amount !== null ? String(job.amount) : "",
            scheduledAt: job.scheduledAt ? new Date(job.scheduledAt) : null,
            scheduledEndAt: job.scheduledEndAt ? new Date(job.scheduledEndAt) : null,
        })
        setEditErrors({})
        setIsEditOpen(true)
    }

    const getSelectedAssignmentPayload = () => {
        const assigneeIds: string[] =
            assignmentType === "INTERNAL" && assignmentSource === "TEAM"
                ? (selectedTeam?.members ?? []).map((member: any) => member.userId).filter(Boolean)
                : selectedUserId
                ? [selectedUserId]
                : []

        if (assignmentType === "INTERNAL" && assignmentSource === "TEAM") {
            return {
                assignmentType,
                teamId: selectedTeamId,
                userIds: assigneeIds,
                hourlyRate: assignmentHourlyRate.trim() ? Number(assignmentHourlyRate) : undefined,
            }
        }

        return {
            assignmentType,
            userIds: assigneeIds,
            hourlyRate: assignmentHourlyRate.trim() ? Number(assignmentHourlyRate) : undefined,
        }
    }

    const openAssignmentReviewDialog = () => {
        if (!canManage) {
            toast({
                title: "Insufficient permissions",
                description: "You can view jobs but cannot assign workers.",
                variant: "error"
            })
            return
        }

        const payload = getSelectedAssignmentPayload()
        if (payload.userIds.length === 0) {
            setAssignError(
                assignmentType === "INTERNAL" && assignmentSource === "TEAM"
                    ? "Please select a team with at least one member."
                    : "Please select a crew member."
            )
            return
        }
        if (assignmentType === "SUB_CONTRACTOR" && !compliantContractors.some((contractor) => contractor.userId === selectedUserId)) {
            setAssignError("Only compliant sub-contractors can be assigned.")
            return
        }

        setAssignError(null)
        setAssignmentScheduleForm({
            scheduledAt: job.scheduledAt ? new Date(job.scheduledAt) : null,
            scheduledEndAt: job.scheduledEndAt ? new Date(job.scheduledEndAt) : null,
        })
        const defaultRate = getDefaultAssignmentHourlyRate()
        setAssignmentHourlyRate(defaultRate !== undefined ? String(defaultRate) : "")
        setAssignmentScheduleErrors({})
        setIsAssignmentReviewOpen(true)
    }

    const mapAssignmentsToAssignedUsers = (assignments: any[]) => {
        const contractorMap = new Map(contractors.map((contractor) => [contractor.userId, contractor]))
        const userMap = new Map(users.map((user) => [user.id, user]))
        return assignments.map((assignment) => {
            const contractorInfo = contractorMap.get(assignment.userId)
            const selected = contractorInfo?.user ?? userMap.get(assignment.userId)
            return {
                id: assignment.userId,
                fullName: selected?.fullName ?? selected?.email ?? "User",
                role: assignment.assignmentType === "SUB_CONTRACTOR" ? "Sub-Contractor" : "Internal",
                complianceStatus: contractorInfo?.complianceStatus,
                teamName: assignment.team?.name,
                effectiveHourlyRate: assignment.effectiveHourlyRate,
                contractorId: contractorInfo?.id,
            }
        })
    }

    const handleConfirmAssignment = async () => {
        const nextErrors: { scheduledAt?: string; scheduledEndAt?: string; hourlyRate?: string } = {}
        if (!assignmentScheduleForm.scheduledAt) {
            nextErrors.scheduledAt = "Start time is required."
        }
        if (!assignmentScheduleForm.scheduledEndAt) {
            nextErrors.scheduledEndAt = "End time is required."
        } else if (assignmentScheduleForm.scheduledAt && assignmentScheduleForm.scheduledEndAt <= assignmentScheduleForm.scheduledAt) {
            nextErrors.scheduledEndAt = "End time must be after start time."
        }
        if (assignmentHourlyRate.trim()) {
            const rate = Number(assignmentHourlyRate)
            if (!Number.isFinite(rate) || rate < 0) {
                nextErrors.hourlyRate = "Hourly rate must be 0 or more."
            }
        }
        setAssignmentScheduleErrors(nextErrors)
        if (Object.keys(nextErrors).length > 0) return

        setIsAssigning(true)
        try {
            const nextStart = assignmentScheduleForm.scheduledAt!.toISOString()
            const nextEnd = assignmentScheduleForm.scheduledEndAt!.toISOString()
            const currentStart = job.scheduledAt ? new Date(job.scheduledAt).toISOString() : ""
            const currentEnd = job.scheduledEndAt ? new Date(job.scheduledEndAt).toISOString() : ""
            if (nextStart !== currentStart || nextEnd !== currentEnd) {
                const updated = await apiPut<any>(`/jobs/${job.id}`, {
                    scheduledAt: nextStart,
                    scheduledEndAt: nextEnd,
                })
                setJob(updated.data)
            }

            const res = await apiPost<any>(`/jobs/${job.id}/assign`, getSelectedAssignmentPayload())
            const assignments = Array.isArray(res.data) ? res.data : []
            setAssignedUsers(mapAssignmentsToAssignedUsers(assignments))
            const refreshed = await apiGet<any>(`/jobs/${job.id}`)
            setJob(refreshed.data)
            setSelectedUserId("")
            if (assignmentSource === "TEAM") {
                setSelectedTeamId("")
            }
            await refreshActivities()
            setIsAssignmentReviewOpen(false)
            toast({
                title: "Crew reassigned",
                description:
                    assignmentType === "INTERNAL" && assignmentSource === "TEAM"
                        ? "Team assignment and schedule have been confirmed."
                        : "Crew assignment and schedule have been confirmed.",
                variant: "success"
            })
        } catch (err: any) {
            toast({
                title: "Assign Failed",
                description: err?.message ?? "Failed to assign worker.",
                variant: "error"
            })
        } finally {
            setIsAssigning(false)
        }
    }

    return (
        <PageContainer>
            <div className="mb-6 space-y-4">
                <BrowserBackButton className="text-sm font-medium text-primary hover:text-primary-dark transition-colors inline-flex items-center gap-1 mb-4">
                    <ArrowLeft className="h-3 w-3" /> Back to Jobs
                </BrowserBackButton>

                <GlassCard className="border-primary/10 bg-white/80">
                    <GlassCardContent className="p-5">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                    <div>
                        <h1 className="text-3xl font-bold tracking-tight text-foreground flex items-center gap-3">
                            {job.title}
                            <RecordNumberBadge value={job.jobNumber} className="text-sm" />
                            <div className="flex items-center gap-2">
                                <Select
                                    value={complianceWorkflows ? (job.workflowStageKey ?? job.status) : job.status}
                                    onValueChange={async (selectedStageKey) => {
                                        try {
                                            const selectedStage = complianceWorkflows
                                                ? jobStageOptions.find((stage) => stage.key === selectedStageKey) ?? null
                                                : null
                                            const newStatus = selectedStage?.baseStatus ?? selectedStageKey
                                            await apiPost(`/jobs/${job.id}/status`, {
                                                status: newStatus,
                                                workflowStageKey: selectedStage?.key,
                                            })
                                            setJob((prev: any) => prev ? { ...prev, status: newStatus, workflowStageKey: selectedStage?.key ?? prev.workflowStageKey } : prev)
                                            await refreshActivities()
                                            toast({
                                                title: "Status Updated",
                                                description: `Job status changed to ${selectedStage?.label ?? formatJobStatus(newStatus)}.`,
                                                variant: "success"
                                            })
                                        } catch (err: any) {
                                            toast({
                                                title: "Update Failed",
                                                description: err?.message ?? "Failed to update job status.",
                                                variant: "error"
                                            })
                                        }
                                    }}
                                >
                                    <SelectTrigger className="h-7 min-w-[120px] bg-white/40 text-[10px] font-semibold uppercase px-2">
                                        <SelectValue placeholder={currentJobStatusLabel} />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {jobStageOptions.map((stage) => (
                                            <SelectItem key={stage.key} value={complianceWorkflows ? stage.key : stage.baseStatus}>
                                                {stage.label}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        </h1>
                        <p className="text-muted-foreground mt-1 flex items-center gap-1.5">
                            <MapPin className="h-4 w-4" /> {job.location}
                        </p>
                    </div>

                    <div className="flex items-center gap-2">
                        <Button
                            variant="outline"
                            className="bg-white/40"
                            onClick={() => {
                                if (!canManage) {
                                    toast({
                                        title: "Insufficient permissions",
                                        description: "You can view jobs but cannot edit them.",
                                        variant: "error"
                                    })
                                    return
                                }
                                setEditForm({
                                    title: job.title ?? "",
                                    customerId: job.customerId ?? "",
                                    siteId: job.siteId ?? "",
                                    location: job.location ?? "",
                                    address: {
                                        ...emptyAddressValue(),
                                        ...parseAddressValue(job.location ?? ""),
                                        addressLine1: job.addressLine1 ?? parseAddressValue(job.location ?? "").addressLine1,
                                        addressLine2: job.addressLine2 ?? parseAddressValue(job.location ?? "").addressLine2,
                                        city: job.city ?? parseAddressValue(job.location ?? "").city,
                                        state: job.state ?? parseAddressValue(job.location ?? "").state,
                                        postalCode: job.postalCode ?? parseAddressValue(job.location ?? "").postalCode,
                                        country: job.country ?? parseAddressValue(job.location ?? "").country,
                                    },
                                    addressManuallyEdited: Boolean(job.addressManuallyEdited),
                                    description: job.description ?? "",
                                    priority: job.priority ?? "Medium",
                                    amount: job.amount !== undefined && job.amount !== null ? String(job.amount) : "",
                                    scheduledAt: job.scheduledAt ? new Date(job.scheduledAt) : null,
                                    scheduledEndAt: job.scheduledEndAt ? new Date(job.scheduledEndAt) : null
                                })
                                setEditErrors({})
                                setIsEditOpen(true)
                            }}
                            disabled={!canManage}
                        >
                            Edit Job
                        </Button>
                        <Button
                            variant="outline"
                            className="bg-white/40 text-destructive"
                            onClick={() => {
                                if (!canManage) {
                                    toast({
                                        title: "Insufficient permissions",
                                        description: "You can view jobs but cannot delete them.",
                                        variant: "error"
                                    })
                                    return
                                }
                                setIsDeleteOpen(true)
                            }}
                            disabled={!canManage}
                        >
                            Delete Job
                        </Button>
                        <Button className="gap-2" onClick={handleMarkComplete} disabled={!canManage || String(job.status ?? "").toUpperCase() === "COMPLETED"}>
                            Close Job <CheckCircle className="h-4 w-4" />
                        </Button>
                        <Button
                            variant="outline"
                            className="gap-2 bg-white/40"
                            onClick={handleGenerateInvoice}
                            disabled={!canManage || isGeneratingInvoice}
                        >
                            <Receipt className="h-4 w-4" />
                            {isGeneratingInvoice ? "Creating..." : "Create Invoice"}
                        </Button>
                    </div>
                </div>
                    </GlassCardContent>
                </GlassCard>

                <GlassCard className="border-primary/10 bg-white/75">
                    <GlassCardContent className="p-4">
                        <div className="grid grid-cols-1 sm:grid-cols-5 gap-3">
                            {jobTimelineSteps.map((step, index) => (
                                <div key={step.label} className="relative rounded-xl border border-glass-border bg-white/70 px-3 py-3 shadow-sm">
                                    {index < jobTimelineSteps.length - 1 ? (
                                        <div className="hidden sm:block absolute left-[calc(100%+0.25rem)] top-1/2 h-px w-2 bg-primary/30" />
                                    ) : null}
                                    <div className="flex items-center gap-2">
                                        <div className={`h-7 w-7 rounded-full flex items-center justify-center text-xs font-bold ${step.complete ? "bg-primary text-primary-foreground" : "bg-muted/15 text-muted-foreground"}`}>
                                            {step.complete ? <CheckCircle className="h-4 w-4" /> : index + 1}
                                        </div>
                                        <div>
                                            <p className="text-sm font-semibold text-foreground">{step.label}</p>
                                            <p className="text-xs text-muted-foreground">{formatSchedulePoint(step.date)}</p>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </GlassCardContent>
                </GlassCard>
            </div>

            {showIssueAlert ? (
                <GlassCard className="border-destructive/40 bg-red-50/90 shadow-lg shadow-red-950/5">
                    <GlassCardContent className="p-4">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
                            <div className="h-10 w-10 shrink-0 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center">
                                <AlertTriangle className="h-5 w-5" />
                            </div>
                            <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-center gap-2">
                                    <p className="text-sm font-bold uppercase tracking-wide text-destructive">Needs Attention</p>
                                    <Badge className="bg-destructive text-destructive-foreground hover:bg-destructive">Worker reported issue</Badge>
                                </div>
                                <p className="mt-2 text-base font-semibold leading-relaxed text-red-950 whitespace-pre-wrap">
                                    {latestIssueReason}
                                </p>
                                <p className="mt-2 text-xs font-medium text-red-900/80">
                                    Reported by {getUpdateActorName(latestIssueUpdate)} on {formatDateTime(latestIssueUpdate.createdAt)}
                                </p>
                            </div>
                        </div>
                    </GlassCardContent>
                </GlassCard>
            ) : null}

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 space-y-6">
                    <Tabs value={activeDetailsTab} onValueChange={setActiveDetailsTab}>
                        <TabsList variant="line" className="w-full overflow-x-auto justify-start bg-white/50 rounded-xl p-1">
                            <TabsTrigger value="overview">Overview</TabsTrigger>
                            <TabsTrigger value="attachments">Attachments ({attachments.length})</TabsTrigger>
                            <TabsTrigger value="updates">Field Updates ({fieldUpdates.length})</TabsTrigger>
                            <TabsTrigger value="quotes">Quotes ({jobQuotes.length})</TabsTrigger>
                            <TabsTrigger value="invoices">Invoices ({jobInvoices.length})</TabsTrigger>
                            {complianceReports ? (
                                <TabsTrigger value="compliance">Compliance Documents ({complianceRecords.length})</TabsTrigger>
                            ) : null}
                            {splitInvoicing ? (
                                <TabsTrigger value="split-invoices">Split Billing ({splitInvoices.length})</TabsTrigger>
                            ) : null}
                            <TabsTrigger value="expenses">Expenses ({expenses.length})</TabsTrigger>
                            <TabsTrigger value="timesheets">Timesheets ({timeEntries.length})</TabsTrigger>
                            <TabsTrigger value="activity">Activity ({activities.length})</TabsTrigger>
                        </TabsList>

                        <TabsContent value="overview" className="space-y-6">
                            <GlassCard>
                                <GlassCardHeader>
                                    <GlassCardTitle>Job Information</GlassCardTitle>
                                </GlassCardHeader>
                                <GlassCardContent>
                                    <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                                        <div>
                                            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Job ID</p>
                                            <RecordNumberBadge value={job.jobNumber ?? job.reference} fallback={job.id} />
                                        </div>
                                        <div>
                                            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Status</p>
                                            <StatusBadge status={currentJobStatusLabel || formatJobStatus(job.status)}>
                                                {currentJobStatusLabel || formatJobStatus(job.status)}
                                            </StatusBadge>
                                        </div>
                                        <div>
                                            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Client</p>
                                            {job.customerId ? (
                                                <Link className="font-medium text-sm text-primary hover:underline" href={`/admin/customers/${job.customerId}`}>
                                                    {getCustomerName(job.customerId)}
                                                </Link>
                                            ) : (
                                                <p className="font-medium text-sm text-foreground">—</p>
                                            )}
                                        </div>
                                        <div>
                                            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Site</p>
                                            {job.customerId && job.siteId ? (
                                                <Link className="font-medium text-sm text-primary hover:underline" href={`/admin/customers/${job.customerId}/sites/${job.siteId}`}>
                                                    {job.siteName ?? "Open site"}
                                                </Link>
                                            ) : (
                                                <p className="font-medium text-sm text-foreground">{job.siteName ?? "—"}</p>
                                            )}
                                        </div>
                                        <div>
                                            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">From</p>
                                            <p className="font-medium text-sm text-foreground flex items-center gap-1">
                                                <Calendar className="h-3.5 w-3.5 text-primary" /> {formatSchedulePoint(job.scheduledAt)}
                                            </p>
                                        </div>
                                        <div>
                                            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">To</p>
                                            <p className="font-medium text-sm text-foreground flex items-center gap-1">
                                                <Clock className="h-3.5 w-3.5 text-primary" /> {formatSchedulePoint(job.scheduledEndAt)}
                                            </p>
                                        </div>
                                        <div>
                                            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Priority</p>
                                            <p className={`font-bold text-sm flex items-center gap-1 ${getPriorityColor(job.priority)}`}>
                                                {job.priority === 'Emergency' && <AlertTriangle className="h-3.5 w-3.5" />}
                                                {job.priority}
                                            </p>
                                        </div>
                                        <div>
                                            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Amount</p>
                                            <p className="font-medium text-sm text-foreground">
                                                {job.amount !== undefined && job.amount !== null ? formatCurrency(Number(job.amount) || 0) : "—"}
                                            </p>
                                        </div>
                                        <div className="md:col-span-2">
                                            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Address</p>
                                            <p className="font-medium text-sm text-foreground">{job.location ?? job.siteAddress ?? "—"}</p>
                                        </div>
                                    </div>
                                    <div className="mt-5 border-t border-glass-border pt-4">
                                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Assigned Crew</p>
                                        {assignedUsers.length === 0 ? (
                                            <p className="text-sm text-muted-foreground">No crew assigned yet.</p>
                                        ) : (
                                            <div className="flex flex-wrap gap-2.5">
                                                {assignedUsers.map((user) => (
                                                    <div
                                                        key={user.id}
                                                        className="flex items-center gap-2 rounded-lg border border-glass-border bg-white/70 px-2.5 py-2"
                                                    >
                                                        <div className="h-7 w-7 rounded-full bg-primary/12 text-primary flex items-center justify-center text-[11px] font-bold">
                                                            {String(user.fullName ?? "U")
                                                                .split(" ")
                                                                .map((part) => part[0])
                                                                .join("")
                                                                .slice(0, 2)
                                                                .toUpperCase()}
                                                        </div>
                                                        <div className="leading-tight">
                                                            <Link
                                                                className="text-sm font-semibold text-primary hover:underline"
                                                                href={user.contractorId ? `/admin/contractors/${user.contractorId}` : `/admin/team/${user.id}`}
                                                            >
                                                                {user.fullName}
                                                            </Link>
                                                            <p className="text-[11px] text-muted-foreground">
                                                                {user.role}
                                                                {user.teamName ? ` • Team: ${user.teamName}` : ""}
                                                            </p>
                                                            {user.effectiveHourlyRate !== null && typeof user.effectiveHourlyRate !== "undefined" ? (
                                                                <p className="text-[11px] font-medium text-primary">
                                                                    {formatCurrency(Number(user.effectiveHourlyRate))}/hr
                                                                </p>
                                                            ) : null}
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                </GlassCardContent>
                            </GlassCard>

                            {job.leadId && (
                                <GlassCard>
                                    <GlassCardHeader>
                                        <GlassCardTitle>Lead Traceability</GlassCardTitle>
                                    </GlassCardHeader>
                                    <GlassCardContent className="space-y-3">
                                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                            <div>
                                                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Origin Lead</p>
                                                <Link href={`/admin/crm/${job.leadId}`} className="text-sm font-medium text-primary hover:underline">
                                                    Open Lead Record
                                                </Link>
                                            </div>
                                            <div>
                                                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Lead Source</p>
                                                <p className="font-medium text-sm text-foreground">{job.leadSource ?? "—"}</p>
                                            </div>
                                            <div>
                                                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Activities Carried</p>
                                                <p className="font-medium text-sm text-foreground">
                                                    {Array.isArray(job.leadActivitySnapshot) ? job.leadActivitySnapshot.length : 0}
                                                </p>
                                            </div>
                                        </div>
                                    </GlassCardContent>
                                </GlassCard>
                            )}

                            <GlassCard>
                                <GlassCardHeader>
                                    <GlassCardTitle>Instructions & Notes</GlassCardTitle>
                                </GlassCardHeader>
                                <GlassCardContent>
                                    <p className="text-sm leading-relaxed">{job.description ?? "No instructions provided."}</p>
                                </GlassCardContent>
                            </GlassCard>
                        </TabsContent>

                        <TabsContent value="attachments" className="space-y-6">
                            <GlassCard>
                                <GlassCardHeader className="flex flex-row items-center justify-between pb-2">
                                    <GlassCardTitle>Attachments</GlassCardTitle>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-8 gap-1"
                                        onClick={() => {
                                            setUpdateUploadMode("attachment")
                                            setUpdateForm({ uploadLabel: "" })
                                            setSelectedFiles(null)
                                            setUpdateError(null)
                                            setIsUpdateOpen(true)
                                        }}
                                    >
                                        <ImageIcon className="h-4 w-4" /> Add Attachment
                                    </Button>
                                </GlassCardHeader>
                                <GlassCardContent>
                                    {attachments.length === 0 ? (
                                        <div className="flex flex-col items-center gap-3 py-8 text-center border-2 border-dashed border-glass-border rounded-lg text-muted-foreground text-sm">
                                            <p>No tenant attachments yet.</p>
                                            {canManage ? (
                                                <Button
                                                    variant="outline"
                                                    size="sm"
                                                    className="gap-2 bg-white/70"
                                                    onClick={() => {
                                                        setUpdateUploadMode("attachment")
                                                        setUpdateForm({ uploadLabel: "" })
                                                        setSelectedFiles(null)
                                                        setUpdateError(null)
                                                        setIsUpdateOpen(true)
                                                    }}
                                                >
                                                    <ImageIcon className="h-4 w-4" /> Add Attachment
                                                </Button>
                                            ) : null}
                                        </div>
                                    ) : (
                                        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                                            {attachments.map((attachment) => {
                                                const url = String(attachment.fileUrl ?? "")
                                                const fileName = String(attachment.name ?? "").trim() || getFileNameFromUrl(url)
                                                const label = String(attachment.label ?? "").trim()
                                                const ext = getFileExt(fileName || url).toUpperCase() || "FILE"
                                                const imageFile = isImageFile(url || fileName)
                                                return (
                                                    <div
                                                        key={attachment.id}
                                                        className="rounded-lg border border-glass-border bg-white/60 overflow-hidden hover:border-primary/40 hover:shadow-sm transition-colors"
                                                    >
                                                        <a href={url} target="_blank" rel="noreferrer" className="block">
                                                            <div className="h-36 bg-slate-50/70 flex items-center justify-center">
                                                                {imageFile ? (
                                                                    // eslint-disable-next-line @next/next/no-img-element
                                                                    <img
                                                                        src={url}
                                                                        alt={label || fileName}
                                                                        className="h-full w-full object-cover"
                                                                    />
                                                                ) : (
                                                                    <div className="flex flex-col items-center gap-2 text-muted-foreground">
                                                                        {renderFileIcon(url || fileName)}
                                                                        <span className="text-[10px] font-semibold tracking-wide rounded border border-glass-border bg-white/80 px-2 py-0.5">
                                                                            {ext}
                                                                        </span>
                                                                    </div>
                                                                )}
                                                            </div>
                                                            <div className="px-3 py-2 border-t border-glass-border/70 bg-white/80">
                                                                <p className="text-sm font-semibold text-foreground truncate">
                                                                    {label || fileName}
                                                                </p>
                                                                {label ? (
                                                                    <p className="text-[11px] text-muted-foreground truncate mt-0.5">
                                                                        {fileName}
                                                                    </p>
                                                                ) : null}
                                                                <div className="flex items-center justify-between mt-1">
                                                                    <span className="text-[11px] text-muted-foreground truncate">
                                                                        {attachment.createdAt ? new Date(attachment.createdAt).toLocaleString() : "—"}
                                                                    </span>
                                                                    <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                                                                        <ExternalLink className="h-3 w-3" />
                                                                        Open
                                                                    </span>
                                                                </div>
                                                            </div>
                                                        </a>
                                                        {canManage ? (
                                                            <div className="flex items-center justify-end gap-2 border-t border-glass-border/70 bg-white/70 px-3 py-2">
                                                                <Button
                                                                    type="button"
                                                                    variant="outline"
                                                                    size="sm"
                                                                    className="h-8 bg-white/70"
                                                                    onClick={() => openEditAttachmentDialog(attachment)}
                                                                >
                                                                    <Pencil className="h-3.5 w-3.5" />
                                                                    Edit
                                                                </Button>
                                                                <Button
                                                                    type="button"
                                                                    variant="ghost"
                                                                    size="sm"
                                                                    className="h-8 text-muted-foreground hover:text-destructive"
                                                                    disabled={deletingAttachmentId === attachment.id}
                                                                    onClick={() => handleDeleteAttachment(attachment.id)}
                                                                >
                                                                    <Trash2 className="h-3.5 w-3.5" />
                                                                    {deletingAttachmentId === attachment.id ? "Deleting..." : "Delete"}
                                                                </Button>
                                                            </div>
                                                        ) : null}
                                                    </div>
                                                )
                                            })}
                                        </div>
                                    )}
                                </GlassCardContent>
                            </GlassCard>
                        </TabsContent>

                        <TabsContent value="updates" className="space-y-6">
                            <GlassCard>
                                <GlassCardHeader>
                                    <GlassCardTitle>Field Updates & Uploads</GlassCardTitle>
                                </GlassCardHeader>
                                <GlassCardContent>
                                    {fieldUpdates.length === 0 ? (
                                        <div className="flex flex-col items-center gap-3 py-8 text-center border-2 border-dashed border-glass-border rounded-lg text-muted-foreground text-sm">
                                            <p>No field submissions yet.</p>
                                            {canManage ? (
                                                <Button
                                                    variant="outline"
                                                    size="sm"
                                                    className="gap-2 bg-white/70"
                                                    onClick={() => {
                                                        setUpdateUploadMode("field")
                                                        setUpdateForm({ uploadLabel: "" })
                                                        setSelectedFiles(null)
                                                        setUpdateError(null)
                                                        setIsUpdateOpen(true)
                                                    }}
                                                >
                                                    <ImageIcon className="h-4 w-4" /> Add Supporting File
                                                </Button>
                                            ) : null}
                                        </div>
                                    ) : (
                                        <div className="space-y-5">
                                            {fieldUpdateUsers.map((actor) => (
                                                <div key={actor} className="space-y-3">
                                                    <div className="flex items-center justify-between">
                                                        <div className="flex items-center gap-2">
                                                            <p className="text-sm font-semibold text-foreground">{actor}</p>
                                                            <Badge variant="outline">
                                                                {getUpdateActorRole(fieldUpdatesByUser[actor]?.[0])}
                                                            </Badge>
                                                        </div>
                                                        <Badge variant="secondary">{fieldUpdatesByUser[actor]?.length ?? 0} updates</Badge>
                                                    </div>
                                                    <div className="space-y-3">
                                                        {fieldUpdatesByUser[actor].map((update: any) => {
                                                            const isReportedIssue = String(update?.status ?? "").toUpperCase() === "REQUIRES_FOLLOW_UP"
                                                            return (
                                                            <div
                                                                key={update.id}
                                                                className={`p-3 rounded-lg border ${
                                                                    isReportedIssue
                                                                        ? "border-destructive/40 bg-red-50/90 shadow-sm shadow-red-950/5"
                                                                        : "border-glass-border bg-white/40"
                                                                }`}
                                                            >
                                                                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                                                                    {isReportedIssue ? (
                                                                        <div className="flex items-center gap-2 text-destructive">
                                                                            <AlertTriangle className="h-4 w-4" />
                                                                            <span className="text-xs font-bold uppercase tracking-wide">Reported Issue</span>
                                                                        </div>
                                                                    ) : (
                                                                        <span />
                                                                    )}
                                                                    {canManage ? (
                                                                        <div className="flex items-center gap-2">
                                                                            <Button
                                                                                type="button"
                                                                                variant="outline"
                                                                                size="sm"
                                                                                className="h-8 bg-white/70"
                                                                                onClick={() => openEditFieldUpdateDialog(update)}
                                                                            >
                                                                                <Pencil className="h-3.5 w-3.5" />
                                                                                Edit
                                                                            </Button>
                                                                            <Button
                                                                                type="button"
                                                                                variant="ghost"
                                                                                size="sm"
                                                                                className="h-8 text-muted-foreground hover:text-destructive"
                                                                                disabled={deletingFieldUpdateId === update.id}
                                                                                onClick={() => handleDeleteFieldUpdate(update.id)}
                                                                            >
                                                                                <Trash2 className="h-3.5 w-3.5" />
                                                                                {deletingFieldUpdateId === update.id ? "Deleting..." : "Delete"}
                                                                            </Button>
                                                                        </div>
                                                                    ) : null}
                                                                </div>
                                                                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                                                                    {update.notes ? (
                                                                        <p className={`text-sm whitespace-pre-wrap ${isReportedIssue ? "font-semibold text-red-950" : "text-foreground"}`}>{update.notes}</p>
                                                                    ) : (
                                                                        <p className="text-sm text-muted-foreground">Field update submitted.</p>
                                                                    )}
                                                                    <span className="inline-flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
                                                                        <Calendar className="h-3.5 w-3.5" />
                                                                        {formatDateTime(update.createdAt)}
                                                                    </span>
                                                                </div>
                                                                {Array.isArray(update.photoUrls) && update.photoUrls.length > 0 && (
                                                                    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3 mt-3">
                                                                        {update.photoUrls.map((url: string, idx: number) => {
                                                                            const label =
                                                                                Array.isArray(update.photoLabels) &&
                                                                                typeof update.photoLabels[idx] === "string" &&
                                                                                update.photoLabels[idx].trim()
                                                                                    ? update.photoLabels[idx].trim()
                                                                                    : ""
                                                                            const fileName = getFileNameFromUrl(url)
                                                                            const ext = getFileExt(url).toUpperCase() || "FILE"
                                                                            const imageFile = isImageFile(url)
                                                                            return (
                                                                                <a
                                                                                    key={`${update.id}-${idx}`}
                                                                                    href={url}
                                                                                    target="_blank"
                                                                                    rel="noreferrer"
                                                                                    className="rounded-lg border border-glass-border bg-white/60 overflow-hidden hover:border-primary/40 hover:shadow-sm transition-colors"
                                                                                >
                                                                                    <div className="h-36 bg-slate-50/70 flex items-center justify-center">
                                                                                        {imageFile ? (
                                                                                            // eslint-disable-next-line @next/next/no-img-element
                                                                                            <img
                                                                                                src={url}
                                                                                                alt={label || fileName}
                                                                                                className="h-full w-full object-cover"
                                                                                            />
                                                                                        ) : (
                                                                                            <div className="flex flex-col items-center gap-2 text-muted-foreground">
                                                                                                {renderFileIcon(url)}
                                                                                                <span className="text-[10px] font-semibold tracking-wide rounded border border-glass-border bg-white/80 px-2 py-0.5">
                                                                                                    {ext}
                                                                                                </span>
                                                                                            </div>
                                                                                        )}
                                                                                    </div>
                                                                                    <div className="px-3 py-2 border-t border-glass-border/70 bg-white/80">
                                                                                        <p className="text-sm font-semibold text-foreground truncate">
                                                                                            {label || fileName}
                                                                                        </p>
                                                                                        {label ? (
                                                                                            <p className="text-[11px] text-muted-foreground truncate mt-0.5">
                                                                                                {fileName}
                                                                                            </p>
                                                                                        ) : null}
                                                                                        <div className="flex items-center justify-between gap-2 mt-1">
                                                                                            <span className="inline-flex min-w-0 items-center gap-1 text-[11px] text-muted-foreground">
                                                                                                <Clock className="h-3 w-3 shrink-0" />
                                                                                                <span className="truncate">{formatDateTime(update.createdAt)}</span>
                                                                                            </span>
                                                                                            <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                                                                                                <ExternalLink className="h-3 w-3" />
                                                                                                Open
                                                                                            </span>
                                                                                        </div>
                                                                                    </div>
                                                                                </a>
                                                                            )
                                                                        })}
                                                                    </div>
                                                                )}
                                                            </div>
                                                            )
                                                        })}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </GlassCardContent>
                            </GlassCard>
                        </TabsContent>

                        <TabsContent value="quotes" className="space-y-6">
                            <GlassCard>
                                <GlassCardHeader>
                                    <GlassCardTitle>Related Quotes</GlassCardTitle>
                                </GlassCardHeader>
                                <GlassCardContent>
                                    {jobQuotes.length === 0 ? (
                                        <div className="flex flex-col items-center gap-3 py-6 text-center border border-dashed border-glass-border rounded-lg text-muted-foreground text-sm">
                                            <p>No quotes linked to this job/lead yet.</p>
                                            {canManage ? (
                                                <Button variant="outline" size="sm" className="gap-2 bg-white/70" asChild>
                                                    <Link
                                                        href={`/admin/quotes/new?jobId=${job.id}&customerId=${job.customerId ?? ""}&siteId=${job.siteId ?? ""}`}
                                                    >
                                                        <Plus className="h-4 w-4" /> Create Quote
                                                    </Link>
                                                </Button>
                                            ) : null}
                                        </div>
                                    ) : (
                                        <div className="space-y-2">
                                            {jobQuotes.map((quote) => {
                                                const quoteStatusLabel = getWorkflowStatusLabel(
                                                    "quotes",
                                                    quote.status,
                                                    quote.workflowStageKey,
                                                    workflowConfig,
                                                    complianceWorkflows
                                                )

                                                return (
                                                    <div key={quote.id} className="rounded-lg border border-glass-border bg-white/40 p-3 flex items-center justify-between gap-3">
                                                        <div className="min-w-0">
                                                            <p className="text-sm font-semibold text-foreground truncate">
                                                                {quote.quoteNumber ?? `QT-${quote.id.slice(0, 6)}`}
                                                            </p>
                                                            <p className="text-xs text-muted-foreground truncate mt-0.5">{quote.title}</p>
                                                            <p className="text-[11px] text-muted-foreground mt-1">
                                                                {quote.createdAt ? new Date(quote.createdAt).toLocaleString() : "—"}
                                                            </p>
                                                        </div>
                                                        <div className="flex items-center gap-2 shrink-0">
                                                            <StatusBadge status={formatQuoteStatus(quote.status)}>
                                                                {quoteStatusLabel}
                                                            </StatusBadge>
                                                            <span className="text-xs font-semibold text-foreground">
                                                                {formatCurrency(Number(quote.total ?? 0))}
                                                            </span>
                                                            <Button variant="outline" size="sm" asChild className="bg-white/60">
                                                                <Link href={`/admin/quotes/${quote.id}`}>Open</Link>
                                                            </Button>
                                                        </div>
                                                    </div>
                                                )
                                            })}
                                        </div>
                                    )}
                                </GlassCardContent>
                            </GlassCard>
                        </TabsContent>

                        <TabsContent value="invoices" className="space-y-6">
                            <GlassCard>
                                <GlassCardHeader>
                                    <GlassCardTitle>Related Invoices</GlassCardTitle>
                                </GlassCardHeader>
                                <GlassCardContent>
                                    {jobInvoices.length === 0 ? (
                                        <div className="flex flex-col items-center gap-3 py-6 text-center border border-dashed border-glass-border rounded-lg text-muted-foreground text-sm">
                                            <p>No invoices created for this job yet.</p>
                                            {canManage ? (
                                                <Button
                                                    variant="outline"
                                                    size="sm"
                                                    className="gap-2 bg-white/70"
                                                    onClick={handleGenerateInvoice}
                                                    disabled={isGeneratingInvoice}
                                                >
                                                    <Receipt className="h-4 w-4" />
                                                    {isGeneratingInvoice ? "Creating..." : "Create Invoice"}
                                                </Button>
                                            ) : null}
                                        </div>
                                    ) : (
                                        <div className="space-y-2">
                                            {jobInvoices.map((invoice) => {
                                                const invoiceStatusLabel = getWorkflowStatusLabel(
                                                    "invoices",
                                                    invoice.status,
                                                    invoice.workflowStageKey,
                                                    workflowConfig,
                                                    complianceWorkflows
                                                )

                                                return (
                                                    <div key={invoice.id} className="rounded-lg border border-glass-border bg-white/40 p-3 flex items-center justify-between gap-3">
                                                        <div className="min-w-0">
                                                            <p className="text-sm font-semibold text-foreground truncate">
                                                                {invoice.invoiceNumber ?? `INV-${String(invoice.id).slice(0, 6)}`}
                                                            </p>
                                                            <p className="text-xs text-muted-foreground truncate mt-0.5">{invoice.title}</p>
                                                            <p className="text-[11px] text-muted-foreground mt-1">
                                                                {invoice.createdAt ? new Date(invoice.createdAt).toLocaleString() : "—"}
                                                            </p>
                                                        </div>
                                                        <div className="flex items-center gap-2 shrink-0">
                                                            <StatusBadge status={formatInvoiceStatus(invoice.status)}>
                                                                {invoiceStatusLabel}
                                                            </StatusBadge>
                                                            <span className="text-xs font-semibold text-foreground">
                                                                {formatCurrency(Number(invoice.total ?? 0))}
                                                            </span>
                                                            {canManage ? (
                                                                <>
                                                                    <Button
                                                                        variant="ghost"
                                                                        size="icon"
                                                                        className="h-8 w-8 text-muted-foreground hover:text-foreground"
                                                                        onClick={() => openEditInvoiceDialog(invoice)}
                                                                    >
                                                                        <Pencil className="h-4 w-4" />
                                                                    </Button>
                                                                    <Button
                                                                        variant="ghost"
                                                                        size="icon"
                                                                        className="h-8 w-8 text-muted-foreground hover:text-destructive"
                                                                        disabled={deletingInvoiceId === invoice.id}
                                                                        onClick={() => handleDeleteInvoice(invoice)}
                                                                    >
                                                                        <Trash2 className="h-4 w-4" />
                                                                    </Button>
                                                                </>
                                                            ) : null}
                                                            <Button variant="outline" size="sm" asChild className="bg-white/60">
                                                                <Link href={`/admin/finance/${invoice.id}`}>Open</Link>
                                                            </Button>
                                                        </div>
                                                    </div>
                                                )
                                            })}
                                        </div>
                                    )}
                                </GlassCardContent>
                            </GlassCard>
                        </TabsContent>

                        {complianceReports ? (
                            <TabsContent value="compliance" className="space-y-6">
                                <GlassCard>
                                    <GlassCardHeader>
                                        <GlassCardTitle>Compliance Documents</GlassCardTitle>
                                    </GlassCardHeader>
                                    <GlassCardContent>
                                        {complianceRecords.length === 0 ? (
                                            <div className="flex flex-col items-center gap-3 py-6 text-center border border-dashed border-glass-border rounded-lg text-muted-foreground text-sm">
                                                <FileText className="h-8 w-8 text-muted-foreground/40" />
                                                <p>No compliance documents linked to this job yet.</p>
                                                <Button variant="outline" size="sm" className="gap-2 bg-white/70" asChild>
                                                    <Link href="/admin/compliance">
                                                        <Plus className="h-4 w-4" /> Open Compliance Queue
                                                    </Link>
                                                </Button>
                                            </div>
                                        ) : (
                                            <div className="space-y-3">
                                                {complianceRecords.map((record) => {
                                                    const reviewStatus = String(record.reviewStatus ?? "PENDING_REVIEW").replace(/_/g, " ")
                                                    return (
                                                        <div key={record.id} className="rounded-2xl border border-glass-border bg-white/45 p-4">
                                                            <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                                                                <div className="min-w-0">
                                                                    <div className="flex flex-wrap items-center gap-2">
                                                                        <p className="font-semibold text-foreground">{record.title ?? "Compliance record"}</p>
                                                                        <StatusBadge status={reviewStatus}>{reviewStatus}</StatusBadge>
                                                                        <Badge variant="secondary">
                                                                            {record.customerVisible === false ? "Hidden from customer" : "Customer visible"}
                                                                        </Badge>
                                                                    </div>
                                                                    <p className="mt-1 text-sm text-muted-foreground">
                                                                        {record.reportType ?? "Report"}
                                                                        {record.reference ? ` • ${record.reference}` : ""}
                                                                    </p>
                                                                    <div className="mt-3 grid gap-3 text-xs text-muted-foreground sm:grid-cols-2 xl:grid-cols-4">
                                                                        <div>
                                                                            <span className="font-semibold text-foreground">Result: </span>
                                                                            {record.outcome ?? "Not recorded"}
                                                                        </div>
                                                                        <div>
                                                                            <span className="font-semibold text-foreground">Tested: </span>
                                                                            {formatDateOnly(record.testedAt)}
                                                                        </div>
                                                                        <div>
                                                                            <span className="font-semibold text-foreground">Valid until: </span>
                                                                            {formatDateOnly(record.validUntil)}
                                                                        </div>
                                                                        <div>
                                                                            <span className="font-semibold text-foreground">Expected renewal: </span>
                                                                            {record.expectedRenewalValue != null ? formatCurrency(Number(record.expectedRenewalValue)) : "Not set"}
                                                                        </div>
                                                                    </div>
                                                                    {record.notes ? (
                                                                        <p className="mt-3 whitespace-pre-wrap rounded-xl bg-white/60 p-3 text-sm text-muted-foreground">
                                                                            {record.notes}
                                                                        </p>
                                                                    ) : null}
                                                                </div>
                                                                <div className="flex shrink-0 flex-wrap gap-2">
                                                                    {record.documentFileUrl ? (
                                                                        <Button variant="outline" size="sm" className="gap-1 bg-white/70" asChild>
                                                                            <a href={record.documentFileUrl} target="_blank" rel="noreferrer">
                                                                                Open Document <ExternalLink className="h-3.5 w-3.5" />
                                                                            </a>
                                                                        </Button>
                                                                    ) : null}
                                                                    <Button variant="outline" size="sm" className="bg-white/70" asChild>
                                                                        <Link href="/admin/compliance">Review</Link>
                                                                    </Button>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    )
                                                })}
                                            </div>
                                        )}
                                    </GlassCardContent>
                                </GlassCard>
                            </TabsContent>
                        ) : null}

                        {splitInvoicing ? (
                            <TabsContent value="split-invoices" className="space-y-6">
                                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                                    <GlassCard>
                                        <GlassCardContent className="pt-6">
                                            <p className="text-sm text-muted-foreground">Split Total</p>
                                            <p className="mt-2 text-2xl font-semibold text-foreground">
                                                {formatCurrency(splitInvoiceSummary.totalExVat)}
                                            </p>
                                            <p className="mt-1 text-xs text-muted-foreground">Ex VAT across all billing lines</p>
                                        </GlassCardContent>
                                    </GlassCard>
                                    <GlassCard>
                                        <GlassCardContent className="pt-6">
                                            <p className="text-sm text-muted-foreground">Invoiced</p>
                                            <p className="mt-2 text-2xl font-semibold text-foreground">
                                                {formatCurrency(splitInvoiceSummary.invoicedExVat)}
                                            </p>
                                            <p className="mt-1 text-xs text-muted-foreground">Lines marked invoiced or paid</p>
                                        </GlassCardContent>
                                    </GlassCard>
                                    <GlassCard>
                                        <GlassCardContent className="pt-6">
                                            <p className="text-sm text-muted-foreground">Paid</p>
                                            <p className="mt-2 text-2xl font-semibold text-foreground">
                                                {formatCurrency(splitInvoiceSummary.paidExVat)}
                                            </p>
                                            <p className="mt-1 text-xs text-muted-foreground">Commercial value received</p>
                                        </GlassCardContent>
                                    </GlassCard>
                                    <GlassCard>
                                        <GlassCardContent className="pt-6">
                                            <p className="text-sm text-muted-foreground">Remaining</p>
                                            <p className="mt-2 text-2xl font-semibold text-foreground">
                                                {formatCurrency(splitInvoiceSummary.remainingExVat)}
                                            </p>
                                            <p className="mt-1 text-xs text-muted-foreground">Still to be invoiced</p>
                                        </GlassCardContent>
                                    </GlassCard>
                                </div>

                                <GlassCard>
                                    <GlassCardHeader className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                                        <div>
                                            <GlassCardTitle>Split Billing Register</GlassCardTitle>
                                            <p className="text-sm text-muted-foreground">
                                                Track staged commercial lines for this job without changing the core invoice flow.
                                            </p>
                                        </div>
                                        {canManage ? (
                                            <Button className="gap-2" onClick={openCreateSplitInvoice}>
                                                <Plus className="h-4 w-4" /> Add Split Line
                                            </Button>
                                        ) : null}
                                    </GlassCardHeader>
                                    <GlassCardContent>
                                        {splitInvoices.length === 0 ? (
                                            <div className="rounded-xl border border-dashed border-glass-border bg-white/40 px-4 py-10 text-center">
                                                <p className="text-sm font-medium text-foreground">No split billing lines yet.</p>
                                                <p className="mt-1 text-sm text-muted-foreground">
                                                    Add staged commercial values here when this job needs separate billing milestones.
                                                </p>
                                                {canManage ? (
                                                    <Button className="mt-4 gap-2" size="sm" onClick={openCreateSplitInvoice}>
                                                        <Plus className="h-4 w-4" /> Add Split Line
                                                    </Button>
                                                ) : null}
                                            </div>
                                        ) : (
                                            <div className="space-y-3">
                                                {splitInvoices.map((item) => (
                                                    <div
                                                        key={item.id}
                                                        className="rounded-xl border border-glass-border bg-white/50 p-4"
                                                    >
                                                        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                                                            <div className="min-w-0 space-y-2">
                                                                <div className="flex flex-wrap items-center gap-2">
                                                                    <p className="text-sm font-semibold text-foreground">
                                                                        {item.description?.trim() || "Untitled split line"}
                                                                    </p>
                                                                    <StatusBadge status={formatSplitInvoiceStatus(item.status)}>
                                                                        {formatSplitInvoiceStatus(item.status)}
                                                                    </StatusBadge>
                                                                </div>
                                                                <div className="grid grid-cols-1 gap-2 text-sm text-muted-foreground md:grid-cols-3">
                                                                    <div>
                                                                        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Value ex VAT</p>
                                                                        <p className="text-sm font-medium text-foreground">
                                                                            {formatCurrency(Number(item.valueExVat ?? 0))}
                                                                        </p>
                                                                    </div>
                                                                    <div>
                                                                        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Invoice Date</p>
                                                                        <p className="text-sm font-medium text-foreground">
                                                                            {formatDateOnly(item.invoiceDate)}
                                                                        </p>
                                                                    </div>
                                                                    <div>
                                                                        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Created</p>
                                                                        <p className="text-sm font-medium text-foreground">
                                                                            {formatDateOnly(item.createdAt)}
                                                                        </p>
                                                                    </div>
                                                                </div>
                                                                {item.linkedInvoiceId ? (
                                                                    <p className="text-xs text-muted-foreground">
                                                                        This split billing line is now controlled by the linked invoice and can no longer be edited here.
                                                                    </p>
                                                                ) : null}
                                                            </div>
                                                            {item.linkedInvoiceId ? (
                                                                <div className="shrink-0 rounded-xl border border-primary/20 bg-primary/5 px-4 py-3 text-right">
                                                                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary/80">
                                                                        Linked Invoice
                                                                    </p>
                                                                    {item.linkedInvoiceId ? (
                                                                        <Link
                                                                            href={`/admin/finance/${item.linkedInvoiceId}`}
                                                                            className="mt-1 block text-sm font-semibold text-primary hover:text-primary-dark hover:underline"
                                                                        >
                                                                            {item.linkedInvoice?.invoiceNumber ?? "Open Invoice"}
                                                                        </Link>
                                                                    ) : null}
                                                                    <p className="mt-1 text-xs text-muted-foreground">
                                                                        Controlled from the invoice record
                                                                    </p>
                                                                </div>
                                                            ) : canManage ? (
                                                                <div className="flex shrink-0 items-center gap-2">
                                                                    <Button
                                                                        variant="outline"
                                                                        size="sm"
                                                                        className="bg-white/70"
                                                                        onClick={() => openEditSplitInvoice(item)}
                                                                    >
                                                                        Edit
                                                                    </Button>
                                                                    <Button
                                                                        variant="outline"
                                                                        size="sm"
                                                                        className="bg-white/70 text-destructive"
                                                                        onClick={() => handleDeleteSplitInvoice(item.id)}
                                                                        disabled={deletingSplitInvoiceId === item.id}
                                                                    >
                                                                        {deletingSplitInvoiceId === item.id ? "Removing..." : "Remove"}
                                                                    </Button>
                                                                </div>
                                                            ) : null}
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </GlassCardContent>
                                </GlassCard>
                            </TabsContent>
                        ) : null}

                        <TabsContent value="expenses" className="space-y-6">
                            <GlassCard>
                                <GlassCardHeader className="flex flex-row items-center justify-between pb-2">
                                    <GlassCardTitle>Expense History</GlassCardTitle>
                                    {canManage ? (
                                        <Button size="sm" className="gap-2" onClick={openAddExpenseDialog}>
                                            <Plus className="h-4 w-4" /> Add Expense
                                        </Button>
                                    ) : null}
                                </GlassCardHeader>
                                <GlassCardContent>
                                    {expenses.length === 0 ? (
                                        <div className="flex flex-col items-center gap-3 py-6 text-center border border-dashed border-glass-border rounded-lg text-muted-foreground text-sm">
                                            <p>No expenses added yet.</p>
                                            {canManage ? (
                                                <Button
                                                    variant="outline"
                                                    size="sm"
                                                    className="gap-2 bg-white/70"
                                                    onClick={openAddExpenseDialog}
                                                >
                                                    <Plus className="h-4 w-4" /> Add First Expense
                                                </Button>
                                            ) : null}
                                        </div>
                                    ) : (
                                        <div className="space-y-3">
                                            <div className="text-xs text-muted-foreground">
                                                Total submitted:{" "}
                                                <span className="font-semibold text-foreground">
                                                    {formatCurrency(expenses.reduce((sum, entry) => sum + Number(entry.amount ?? 0), 0))}
                                                </span>
                                            </div>
                                            <div className="overflow-x-auto rounded-lg border border-glass-border bg-white/50">
                                                <table className="w-full min-w-[980px] text-sm">
                                                    <thead className="bg-white/70 text-[11px] uppercase tracking-wide text-muted-foreground">
                                                        <tr>
                                                            <th className="px-3 py-2 text-left font-semibold">Date</th>
                                                            <th className="px-3 py-2 text-left font-semibold">Added By</th>
                                                            <th className="px-3 py-2 text-left font-semibold">Description</th>
                                                            <th className="px-3 py-2 text-left font-semibold">Category</th>
                                                            <th className="px-3 py-2 text-right font-semibold">Amount</th>
                                                            <th className="px-3 py-2 text-left font-semibold">Signature</th>
                                                            <th className="px-3 py-2 text-left font-semibold">Invoice</th>
                                                            <th className="px-3 py-2 text-right font-semibold">Actions</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody className="divide-y divide-glass-border">
                                                        {expenses.map((entry) => (
                                                            <tr key={entry.id} className="align-top">
                                                                <td className="px-3 py-2.5 text-foreground">
                                                                    {entry.expenseDate ? new Date(entry.expenseDate).toLocaleDateString() : "—"}
                                                                </td>
                                                                <td className="px-3 py-2.5 text-foreground">
                                                                    {entry.user?.fullName ?? entry.user?.email ?? "Field User"}
                                                                </td>
                                                                <td className="px-3 py-2.5 text-foreground">
                                                                    <div className="max-w-[300px] truncate" title={entry.description}>
                                                                        {entry.description || "—"}
                                                                    </div>
                                                                </td>
                                                                <td className="px-3 py-2.5">
                                                                    {entry.category ? (
                                                                        <Badge variant="secondary">{entry.category}</Badge>
                                                                    ) : (
                                                                        <span className="text-muted-foreground">Uncategorised</span>
                                                                    )}
                                                                </td>
                                                                <td className="px-3 py-2.5 text-right font-semibold text-foreground">
                                                                    {formatCurrency(Number(entry.amount ?? 0), entry.currency ?? "GBP")}
                                                                </td>
                                                                <td className="px-3 py-2.5">
                                                                    {entry.customerSignatureData ? (
                                                                        <div className="space-y-1">
                                                                            <button
                                                                            type="button"
                                                                            className="rounded-md border border-glass-border bg-white/70 p-1 hover:bg-white transition-colors"
                                                                            onClick={() =>
                                                                                setExpensePreview({
                                                                                    url: entry.customerSignatureData,
                                                                                    name: entry.customerSignatureName
                                                                                        ? `Signature - ${entry.customerSignatureName}`
                                                                                        : "Customer Signature",
                                                                                })
                                                                            }
                                                                        >
                                                                            <img
                                                                                src={entry.customerSignatureData}
                                                                                alt={entry.customerSignatureName ? `Signature - ${entry.customerSignatureName}` : "Customer Signature"}
                                                                                className="h-10 w-28 object-contain"
                                                                            />
                                                                            </button>
                                                                            {entry.customerSignatureName ? (
                                                                                <p className="text-[11px] text-muted-foreground truncate max-w-[130px]" title={entry.customerSignatureName}>
                                                                                    {entry.customerSignatureName}
                                                                                </p>
                                                                            ) : null}
                                                                        </div>
                                                                    ) : (
                                                                        <span className="text-muted-foreground">—</span>
                                                                    )}
                                                                </td>
                                                                <td className="px-3 py-2.5">
                                                                    {entry.receiptUrl ? (
                                                                        <Button
                                                                            variant="outline"
                                                                            size="sm"
                                                                            className="bg-white/70"
                                                                            onClick={() =>
                                                                                setExpensePreview({
                                                                                    url: entry.receiptUrl,
                                                                                    name: entry.description || getFileNameFromUrl(entry.receiptUrl),
                                                                                })
                                                                            }
                                                                        >
                                                                            <Receipt className="h-3.5 w-3.5" />
                                                                            View invoice
                                                                        </Button>
                                                                    ) : (
                                                                        <span className="text-muted-foreground">—</span>
                                                                    )}
                                                                </td>
                                                                <td className="px-3 py-2.5 text-right">
                                                                    <Button
                                                                        variant="ghost"
                                                                        size="icon"
                                                                        className="h-8 w-8 text-muted-foreground hover:text-foreground"
                                                                        disabled={!canManage}
                                                                        onClick={() => openEditExpenseDialog(entry)}
                                                                    >
                                                                        <Pencil className="h-4 w-4" />
                                                                    </Button>
                                                                    <Button
                                                                        variant="ghost"
                                                                        size="icon"
                                                                        className="h-8 w-8 text-muted-foreground hover:text-destructive"
                                                                        disabled={!canManage || deletingExpenseId === entry.id}
                                                                        onClick={() => handleDeleteExpense(entry.id)}
                                                                    >
                                                                        <Trash2 className="h-4 w-4" />
                                                                    </Button>
                                                                </td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            </div>
                                        </div>
                                    )}
                                </GlassCardContent>
                            </GlassCard>
                        </TabsContent>

                        <TabsContent value="timesheets" className="space-y-6">
                            <GlassCard>
                                <GlassCardHeader className="flex flex-row items-center justify-between pb-2">
                                    <GlassCardTitle>Field Time Logs</GlassCardTitle>
                                    {canManage ? (
                                        <Button size="sm" className="gap-2" onClick={openTimeEntryDialog}>
                                            <Plus className="h-4 w-4" /> Add Time Entry
                                        </Button>
                                    ) : null}
                                </GlassCardHeader>
                                <GlassCardContent>
                                    {timeEntries.length === 0 ? (
                                        <div className="flex flex-col items-center gap-3 py-6 text-center border border-dashed border-glass-border rounded-lg text-muted-foreground text-sm">
                                            <p>No time entries submitted from field app yet.</p>
                                            {canManage ? (
                                                <Button
                                                    variant="outline"
                                                    size="sm"
                                                    className="gap-2 bg-white/70"
                                                    onClick={openTimeEntryDialog}
                                                >
                                                    <Plus className="h-4 w-4" /> Add First Time Entry
                                                </Button>
                                            ) : null}
                                        </div>
                                    ) : (
                                        <div className="space-y-3">
                                            <div className="text-xs text-muted-foreground">
                                                Total logged:{" "}
                                                <span className="font-semibold text-foreground">
                                                    {formatDurationMinutes(timeEntries.reduce((sum, entry) => sum + Number(entry.durationMinutes ?? 0), 0))}
                                                </span>
                                            </div>
                                            <div className="space-y-2">
                                                {timeEntriesByAssignee.map((group) => {
                                                    const isOpen = openTimesheetAssignee === group.key
                                                    return (
                                                        <div key={group.key} className="rounded-xl border border-glass-border bg-white/40 overflow-hidden">
                                                            <button
                                                                type="button"
                                                                className="w-full px-4 py-3 flex items-center justify-between gap-3 text-left hover:bg-white/55 transition-colors"
                                                                onClick={() => setOpenTimesheetAssignee(isOpen ? null : group.key)}
                                                            >
                                                                <div>
                                                                    <p className="text-sm font-semibold text-foreground">{group.name}</p>
                                                                    <p className="text-xs text-muted-foreground mt-0.5">
                                                                        {group.entries.length} {group.entries.length === 1 ? "entry" : "entries"} • {formatDurationMinutes(group.totalMinutes)}
                                                                    </p>
                                                                </div>
                                                                <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${isOpen ? "rotate-180" : ""}`} />
                                                            </button>
                                                            {isOpen && (
                                                                <div className="border-t border-glass-border p-3">
                                                                    <div className="rounded-lg border border-glass-border bg-white/50 overflow-hidden">
                                                                        <div className="grid grid-cols-14 gap-2 px-3 py-2 bg-white/70 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                                                                            <div className="col-span-2">Date</div>
                                                                            <div className="col-span-2">From</div>
                                                                            <div className="col-span-2">To</div>
                                                                            <div className="col-span-2">Type</div>
                                                                            <div className="col-span-2">Notes</div>
                                                                            <div className="col-span-2 text-right">Duration</div>
                                                                            <div className="col-span-2 text-right">Actions</div>
                                                                        </div>
                                                                        <div className="divide-y divide-glass-border">
                                                                            {group.entries.map((entry) => (
                                                                                <div key={entry.id} className="grid grid-cols-14 gap-2 px-3 py-2.5 text-sm">
                                                                                    <div className="col-span-2 text-foreground truncate">{formatDateOnly(entry.startTime)}</div>
                                                                                    <div className="col-span-2 text-foreground">{formatTimeOnly(entry.startTime)}</div>
                                                                                    <div className="col-span-2 text-foreground">{formatTimeOnly(entry.endTime)}</div>
                                                                                    <div className="col-span-2">
                                                                                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${entry.entryType === 'SYSTEM' ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'}`}>
                                                                                            {entry.entryType || 'MANUAL'}
                                                                                        </span>
                                                                                    </div>
                                                                                    <div className="col-span-2 text-muted-foreground truncate" title={entry.notes || ""}>
                                                                                        {entry.notes?.trim() ? entry.notes : "—"}
                                                                                    </div>
                                                                                    <div className="col-span-2 text-right font-semibold text-foreground">
                                                                                        {formatDurationMinutes(Number(entry.durationMinutes ?? 0))}
                                                                                    </div>
                                                                                    <div className="col-span-2 flex justify-end gap-1">
                                                                                        <Button
                                                                                            type="button"
                                                                                            variant="ghost"
                                                                                            size="icon"
                                                                                            className="h-8 w-8 text-muted-foreground hover:text-foreground"
                                                                                            disabled={!canManage}
                                                                                            onClick={() => openEditTimeEntryDialog(entry)}
                                                                                        >
                                                                                            <Pencil className="h-4 w-4" />
                                                                                        </Button>
                                                                                        <Button
                                                                                            type="button"
                                                                                            variant="ghost"
                                                                                            size="icon"
                                                                                            className="h-8 w-8 text-muted-foreground hover:text-destructive"
                                                                                            disabled={!canManage || deletingTimeEntryId === entry.id}
                                                                                            onClick={() => handleDeleteTimeEntry(entry.id)}
                                                                                        >
                                                                                            <Trash2 className="h-4 w-4" />
                                                                                        </Button>
                                                                                    </div>
                                                                                </div>
                                                                            ))}
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                            )}
                                                        </div>
                                                    )
                                                })}
                                            </div>
                                        </div>
                                    )}
                                </GlassCardContent>
                            </GlassCard>
                        </TabsContent>

                        <TabsContent value="activity" className="space-y-6">
                            <GlassCard>
                                <GlassCardHeader>
                                    <GlassCardTitle>Job Activity</GlassCardTitle>
                                </GlassCardHeader>
                                <GlassCardContent>
                                    {activities.length === 0 ? (
                                        <div className="py-8 text-center border border-dashed border-glass-border rounded-lg text-muted-foreground text-sm">
                                            No activity recorded yet.
                                        </div>
                                    ) : (
                                        <div className="space-y-3">
                                            {activities.map((activity) => (
                                                <div key={activity.id} className="rounded-xl border border-glass-border bg-white/50 p-3">
                                                    <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                                                        <p className="text-sm font-semibold text-foreground">{activity.type}</p>
                                                        <p className="text-xs text-muted-foreground">
                                                            {activity.createdAt ? new Date(activity.createdAt).toLocaleString() : "—"}
                                                        </p>
                                                    </div>
                                                    <p className="mt-1 text-sm text-muted-foreground">{activity.message}</p>
                                                    <p className="mt-1 text-[11px] text-muted-foreground">
                                                        Actor: {activity.actorName ?? activity.user?.fullName ?? activity.user?.email ?? "System"}
                                                    </p>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </GlassCardContent>
                            </GlassCard>
                        </TabsContent>
                    </Tabs>
                </div>

                <div className="space-y-6">
                    <GlassCard>
                        <GlassCardHeader className="flex flex-row items-center justify-between pb-2">
                            <GlassCardTitle>Job Financials</GlassCardTitle>
                        </GlassCardHeader>
                        <GlassCardContent className="space-y-4">
                            <div className="space-y-3 text-sm">
                                <div className="flex justify-between items-center text-muted-foreground">
                                    <span>Estimated Value:</span>
                                    <span>{jobFinancials.estimatedRevenue > 0 ? formatCurrency(jobFinancials.estimatedRevenue) : "—"}</span>
                                </div>
                                <div className="flex justify-between items-center font-medium text-foreground">
                                    <span>Invoiced Revenue:</span>
                                    <span>{jobFinancials.invoicedRevenue > 0 ? formatCurrency(jobFinancials.invoicedRevenue) : "—"}</span>
                                </div>
                                <div className="h-px w-full bg-glass-border"></div>
                                <div className="flex justify-between items-center text-muted-foreground">
                                    <span>Field Expenses:</span>
                                    <span>{formatCurrency(jobFinancials.totalExpenses)}</span>
                                </div>
                                <div className="flex justify-between items-center text-muted-foreground">
                                    <span>Labour / Payouts:</span>
                                    <span>{formatCurrency(jobFinancials.totalLabourCost)}</span>
                                </div>
                                <div className="flex justify-between items-center font-medium text-foreground">
                                    <span>Total Costs:</span>
                                    <span>{formatCurrency(jobFinancials.totalCost)}</span>
                                </div>
                                <div className="h-px w-full bg-glass-border"></div>
                                <div className={`flex justify-between items-center font-bold ${jobFinancials.netProfit >= 0 ? "text-emerald-600" : "text-destructive"}`}>
                                    <span>Net Profit:</span>
                                    <div className="flex flex-col items-end">
                                        <span>{formatCurrency(jobFinancials.netProfit)}</span>
                                        <span className="text-[11px] font-medium opacity-80">{jobFinancials.profitMargin.toFixed(1)}% margin</span>
                                    </div>
                                </div>
                            </div>
                        </GlassCardContent>
                    </GlassCard>

                    <GlassCard>
                        <GlassCardHeader className="flex flex-row items-center justify-between pb-2">
                            <GlassCardTitle>Assigned Crew</GlassCardTitle>
                        </GlassCardHeader>
                        <GlassCardContent className="space-y-4">
                            {assignmentCombinationSummary.length > 0 && (
                                <div className="rounded-lg border border-glass-border bg-white/40 p-2.5">
                                    <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                                        Current Assignment
                                    </p>
                                    <div className="space-y-1.5">
                                        {assignmentCombinationSummary.map((group) => (
                                            <div key={group.label} className="rounded-md border border-glass-border/80 bg-white/70 px-2 py-1.5">
                                                <p className="text-xs font-medium text-foreground">
                                                    {group.label} ({group.count})
                                                </p>
                                                <p className="text-[11px] text-muted-foreground truncate" title={group.members.join(", ")}>
                                                    {group.members.join(", ")}
                                                </p>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                            {assignmentType === "SUB_CONTRACTOR" && compliantContractors.length > 0 && (
                                <div className="rounded-lg border border-glass-border bg-white/40 p-3">
                                    <div className="mb-2">
                                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                                            Available Compliant Contractors
                                        </p>
                                        <p className="text-[11px] text-muted-foreground">
                                            Available for assignment (not added to the crew yet).
                                        </p>
                                    </div>
                                    <div className="flex flex-wrap gap-2">
                                        {compliantContractors.map((contractor) => (
                                            <Badge key={contractor.id} variant="success">
                                                {contractor.user?.fullName ?? contractor.contactName ?? contractor.companyName ?? "Contractor"}
                                            </Badge>
                                        ))}
                                    </div>
                                </div>
                            )}
                            <div className="space-y-2">
                                <div className={`grid grid-cols-1 ${assignmentType === "INTERNAL" ? "sm:grid-cols-3" : "sm:grid-cols-2"} gap-2`}>
                                    <Select value={assignmentType} onValueChange={setAssignmentType} disabled={!canManage}>
                                        <SelectTrigger className="bg-white/60 w-full min-w-0">
                                            <SelectValue className="truncate" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="INTERNAL">Internal Crew</SelectItem>
                                            <SelectItem value="SUB_CONTRACTOR">Sub-Contractor</SelectItem>
                                        </SelectContent>
                                    </Select>
                                    {assignmentType === "INTERNAL" ? (
                                        <>
                                            <Select value={assignmentSource} onValueChange={(value: "INDIVIDUAL" | "TEAM") => setAssignmentSource(value)} disabled={!canManage}>
                                                <SelectTrigger className="bg-white/60 w-full min-w-0">
                                                    <SelectValue />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="INDIVIDUAL">Individual</SelectItem>
                                                    <SelectItem value="TEAM">Team</SelectItem>
                                                </SelectContent>
                                            </Select>
                                            {assignmentSource === "TEAM" ? (
                                                <Select
                                                    value={selectedTeamId}
                                                    createOption={{ label: "team", href: "/admin/team?create=team" }}
                                                    onValueChange={setSelectedTeamId}
                                                    disabled={!canManage}
                                                >
                                                    <SelectTrigger className="bg-white/60 w-full min-w-0">
                                                        <SelectValue className="truncate" placeholder="Select team to assign" />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        {internalTeams.map((team) => (
                                                            <SelectItem key={team.id} value={team.id}>
                                                                {team.name} ({team.memberCount ?? team.members?.length ?? 0})
                                                            </SelectItem>
                                                        ))}
                                                    </SelectContent>
                                                </Select>
                                            ) : (
                                                <Select
                                                    value={selectedUserId}
                                                    createOption={{ label: "employee", href: "/admin/team?create=employee" }}
                                                    onValueChange={setSelectedUserId}
                                                    disabled={!canManage}
                                                >
                                                    <SelectTrigger className="bg-white/60 w-full min-w-0">
                                                        <SelectValue className="truncate" placeholder="Select crew member to add" />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        {internalUsers.map((user) => (
                                                            <SelectItem key={user.id} value={user.id}>{user.fullName}</SelectItem>
                                                        ))}
                                                    </SelectContent>
                                                </Select>
                                            )}
                                        </>
                                    ) : (
                                        <Select
                                            value={selectedUserId}
                                            createOption={{ label: "contractor", href: "/admin/contractors?create=contractor" }}
                                            onValueChange={setSelectedUserId}
                                            disabled={!canManage}
                                        >
                                            <SelectTrigger className="bg-white/60 w-full min-w-0">
                                                <SelectValue className="truncate" placeholder="Select compliant contractor to add" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {compliantContractors.map((contractor) => (
                                                    <SelectItem key={contractor.userId} value={contractor.userId}>
                                                        {contractor.user?.fullName ?? contractor.contactName ?? contractor.companyName ?? "Contractor"}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    )}
                                </div>
                                {assignmentType === "INTERNAL" && assignmentSource === "TEAM" && selectedTeam ? (
                                    <div className="rounded-lg border border-glass-border bg-white/40 px-3 py-2">
                                        <p className="text-xs font-medium text-muted-foreground">Team Members</p>
                                        <div className="mt-1 flex flex-wrap gap-1.5">
                                            {(selectedTeam.members ?? []).length === 0 ? (
                                                <span className="text-xs text-muted-foreground">No active members in this team.</span>
                                            ) : (
                                                (selectedTeam.members ?? []).map((member: any) => (
                                                    <Badge key={member.userId} variant="secondary" className="font-normal">
                                                        {member.fullName ?? member.email ?? "Worker"}
                                                    </Badge>
                                                ))
                                            )}
                                        </div>
                                    </div>
                                ) : null}
                                {selectedAssigneeIds.length > 0 && (
                                    <div className="rounded-lg border border-glass-border bg-white/40 px-3 py-2">
                                        <p className="text-xs font-medium text-muted-foreground">Schedule Preview (Overlapping Jobs)</p>
                                        {availabilityRows.length === 0 ? (
                                            <p className="mt-1 text-xs text-muted-foreground">No overlapping assignments found for selected assignee(s).</p>
                                        ) : (
                                            <div className="mt-1 space-y-1.5">
                                                {availabilityRows.map((row) => (
                                                    <div key={`${row.userId}-${row.conflictJobId}`} className="rounded-md border border-glass-border/80 bg-white/70 p-2">
                                                        <p className="text-xs font-semibold text-foreground">{row.userName}</p>
                                                        <p className="text-xs text-muted-foreground">
                                                            {row.conflictTitle}
                                                            {row.conflictLocation ? ` • ${row.conflictLocation}` : ""}
                                                        </p>
                                                        <p className="text-[11px] text-muted-foreground">
                                                            {formatSchedulePoint(row.start)} → {formatSchedulePoint(row.end)}
                                                        </p>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                )}
                                {assignError && <p className="text-xs text-destructive">{assignError}</p>}
                            </div>
                        </GlassCardContent>
                        <GlassCardFooter className="pt-0">
                            <Button
                                variant="outline"
                                className="w-full gap-2 bg-white/40 border-dashed"
                                onClick={openAssignmentReviewDialog}
                            disabled={!canManage}
                            >
                                <UserPlus className="h-4 w-4" /> {assignmentType === "INTERNAL" && assignmentSource === "TEAM" ? "Review Team Reassignment" : "Review Crew Reassignment"}
                            </Button>
                        </GlassCardFooter>
                    </GlassCard>

                    <GlassCard>
                        <GlassCardHeader>
                            <GlassCardTitle>Customer Signature</GlassCardTitle>
                        </GlassCardHeader>
                        <GlassCardContent className="flex flex-col items-center justify-center py-6">
                            {job.status === 'COMPLETED' && updates.some((u) => u.customerSignatureData) ? (
                                <div className="border border-glass-border bg-white/50 w-full h-32 rounded-lg flex items-center justify-center relative">
                                    <span className="font-[cursive] text-4xl text-primary/80 transform -rotate-6">Signed</span>
                                    <div className="absolute bottom-2 right-2 text-[10px] text-muted-foreground">
                                        Signed {job.scheduledAt ? new Date(job.scheduledAt).toLocaleDateString() : ""}
                                    </div>
                                </div>
                            ) : (
                                <div className="text-center text-sm text-muted-foreground">
                                    <PenTool className="h-8 w-8 mx-auto mb-2 opacity-50" />
                                    Signature required before closing.
                                </div>
                            )}
                        </GlassCardContent>
                    </GlassCard>
                </div>
            </div>
            <GlassModal
                open={isExpenseOpen}
                onOpenChange={(open) => {
                    setIsExpenseOpen(open)
                    if (!open) setEditingExpenseId(null)
                }}
                title={editingExpenseId ? "Edit Expense" : "Add Expense"}
                description={editingExpenseId ? "Update this job expense." : "Record a job expense and optionally attach the invoice or receipt."}
                footer={
                    <div className="flex justify-end gap-2 w-full">
                        <Button variant="outline" onClick={() => setIsExpenseOpen(false)}>
                            Cancel
                        </Button>
                        <Button onClick={handleAddExpense} disabled={!canManage || isExpenseSaving}>
                            {isExpenseSaving ? "Saving..." : editingExpenseId ? "Save Changes" : "Save Expense"}
                        </Button>
                    </div>
                }
            >
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2 md:col-span-2">
                        <Label required>Description</Label>
                        <Input
                            placeholder="Expense description"
                            value={expenseForm.description}
                            onChange={(e) => setExpenseForm((prev) => ({ ...prev, description: e.target.value }))}
                        />
                    </div>
                    <div className="space-y-2 md:col-span-2">
                        <Label optional>Category</Label>
                        <CreatableAutocomplete
                            value={expenseForm.category}
                            options={expenseCategoryOptions}
                            placeholder="Search or add category"
                            emptyLabel="No categories found"
                            onChange={(category) => setExpenseForm((prev) => ({ ...prev, category }))}
                            onCreateOption={createExpenseCategoryOption}
                            disabled={!canManage}
                        />
                    </div>
                    <div className="space-y-2">
                        <Label required>Amount</Label>
                        <Input
                            type="number"
                            min="0"
                            step="0.01"
                            placeholder="0.00"
                            value={expenseForm.amount}
                            onChange={(e) => setExpenseForm((prev) => ({ ...prev, amount: e.target.value }))}
                        />
                    </div>
                    <div className="space-y-2">
                        <Label required>Expense Date</Label>
                        <Input
                            type="date"
                            value={expenseForm.expenseDate}
                            onChange={(e) => setExpenseForm((prev) => ({ ...prev, expenseDate: e.target.value }))}
                        />
                    </div>
                    <div className="space-y-2 md:col-span-2">
                        <Label optional>Upload Invoice / Receipt</Label>
                        <div className="flex flex-wrap items-center gap-2">
                            <Input
                                id={expenseReceiptInputId}
                                type="file"
                                className="hidden"
                                onChange={(e) => handleExpenseReceiptSelect(e.target.files?.[0] ?? undefined)}
                            />
                            <Button asChild type="button" variant="outline" className="bg-white/60" disabled={isExpenseUploading}>
                                <label htmlFor={expenseReceiptInputId}>
                                    <Receipt className="h-4 w-4" />
                                    {isExpenseUploading ? "Uploading..." : "Upload File"}
                                </label>
                            </Button>
                            {expenseForm.receiptUrl ? (
                                <span className="text-xs text-emerald-700 font-medium">Receipt attached</span>
                            ) : (
                                <span className="text-xs text-muted-foreground">Optional</span>
                            )}
                        </div>
                    </div>
                </div>
            </GlassModal>
            <GlassModal
                open={Boolean(editingFieldUpdate)}
                onOpenChange={(open) => {
                    if (!open) setEditingFieldUpdate(null)
                }}
                title="Edit Field Update"
                description="Update the field note text. Existing uploaded files remain attached to this update."
                footer={
                    <div className="flex justify-end gap-2 w-full">
                        <Button variant="outline" onClick={() => setEditingFieldUpdate(null)} disabled={isFieldUpdateSaving}>
                            Cancel
                        </Button>
                        <Button onClick={handleUpdateFieldUpdate} disabled={!canManage || isFieldUpdateSaving}>
                            {isFieldUpdateSaving ? "Saving..." : "Save Changes"}
                        </Button>
                    </div>
                }
            >
                <div className="space-y-2">
                    <Label optional>Notes</Label>
                    <Textarea
                        rows={5}
                        placeholder="Update field notes..."
                        value={fieldUpdateEditForm.notes}
                        onChange={(event) => setFieldUpdateEditForm({ notes: event.target.value })}
                    />
                </div>
            </GlassModal>
            <GlassModal
                open={Boolean(editingAttachment)}
                onOpenChange={(open) => {
                    if (!open) setEditingAttachment(null)
                }}
                title="Edit Attachment"
                description="Update the attachment display name or label."
                footer={
                    <div className="flex justify-end gap-2 w-full">
                        <Button variant="outline" onClick={() => setEditingAttachment(null)} disabled={isAttachmentSaving}>
                            Cancel
                        </Button>
                        <Button onClick={handleUpdateAttachment} disabled={!canManage || isAttachmentSaving}>
                            {isAttachmentSaving ? "Saving..." : "Save Changes"}
                        </Button>
                    </div>
                }
            >
                <div className="grid grid-cols-1 gap-4">
                    <div className="space-y-2">
                        <Label optional>Display Name</Label>
                        <Input
                            placeholder="Attachment file name"
                            value={attachmentEditForm.name}
                            onChange={(event) => setAttachmentEditForm((prev) => ({ ...prev, name: event.target.value }))}
                        />
                    </div>
                    <div className="space-y-2">
                        <Label optional>Label</Label>
                        <Input
                            placeholder="Visible label"
                            value={attachmentEditForm.label}
                            onChange={(event) => setAttachmentEditForm((prev) => ({ ...prev, label: event.target.value }))}
                        />
                    </div>
                </div>
            </GlassModal>
            <GlassModal
                open={isAssignmentReviewOpen}
                onOpenChange={(open) => {
                    if (!isAssigning) setIsAssignmentReviewOpen(open)
                }}
                title="Confirm Crew Reassignment"
                description="Review the selected crew and confirm the job time before saving this reassignment."
                footer={
                    <div className="flex justify-end gap-2 w-full">
                        <Button variant="outline" onClick={() => setIsAssignmentReviewOpen(false)} disabled={isAssigning}>
                            Cancel
                        </Button>
                        <Button onClick={handleConfirmAssignment} disabled={!canManage || isAssigning}>
                            {isAssigning ? "Confirming..." : "Confirm Reassignment"}
                        </Button>
                    </div>
                }
            >
                <div className="space-y-5">
                    <div className="rounded-xl border border-glass-border bg-white/50 p-4">
                        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                            Crew Selection
                        </p>
                        <div className={`grid grid-cols-1 ${assignmentType === "INTERNAL" ? "md:grid-cols-3" : "md:grid-cols-2"} gap-3`}>
                            <Select value={assignmentType} onValueChange={setAssignmentType} disabled={!canManage || isAssigning}>
                                <SelectTrigger className="bg-white/70 w-full min-w-0">
                                    <SelectValue className="truncate" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="INTERNAL">Internal Crew</SelectItem>
                                    <SelectItem value="SUB_CONTRACTOR">Sub-Contractor</SelectItem>
                                </SelectContent>
                            </Select>
                            {assignmentType === "INTERNAL" ? (
                                <>
                                    <Select value={assignmentSource} onValueChange={(value: "INDIVIDUAL" | "TEAM") => setAssignmentSource(value)} disabled={!canManage || isAssigning}>
                                        <SelectTrigger className="bg-white/70 w-full min-w-0">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="INDIVIDUAL">Individual</SelectItem>
                                            <SelectItem value="TEAM">Team</SelectItem>
                                        </SelectContent>
                                    </Select>
                                    {assignmentSource === "TEAM" ? (
                                        <Select
                                            value={selectedTeamId}
                                            createOption={{ label: "team", href: "/admin/team?create=team" }}
                                            onValueChange={setSelectedTeamId}
                                            disabled={!canManage || isAssigning}
                                        >
                                            <SelectTrigger className="bg-white/70 w-full min-w-0">
                                                <SelectValue className="truncate" placeholder="Select team" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {internalTeams.map((team) => (
                                                    <SelectItem key={team.id} value={team.id}>
                                                        {team.name} ({team.memberCount ?? team.members?.length ?? 0})
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    ) : (
                                        <Select
                                            value={selectedUserId}
                                            createOption={{ label: "employee", href: "/admin/team?create=employee" }}
                                            onValueChange={setSelectedUserId}
                                            disabled={!canManage || isAssigning}
                                        >
                                            <SelectTrigger className="bg-white/70 w-full min-w-0">
                                                <SelectValue className="truncate" placeholder="Select crew member" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {internalUsers.map((user) => (
                                                    <SelectItem key={user.id} value={user.id}>{user.fullName}</SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    )}
                                </>
                            ) : (
                                <Select
                                    value={selectedUserId}
                                    createOption={{ label: "contractor", href: "/admin/contractors?create=contractor" }}
                                    onValueChange={setSelectedUserId}
                                    disabled={!canManage || isAssigning}
                                >
                                    <SelectTrigger className="bg-white/70 w-full min-w-0">
                                        <SelectValue className="truncate" placeholder="Select compliant contractor" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {compliantContractors.map((contractor) => (
                                            <SelectItem key={contractor.userId} value={contractor.userId}>
                                                {contractor.user?.fullName ?? contractor.contactName ?? contractor.companyName ?? "Contractor"}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            )}
                        </div>
                        {assignmentType === "INTERNAL" && assignmentSource === "TEAM" && selectedTeam ? (
                            <div className="mt-3 rounded-lg border border-glass-border bg-white/50 px-3 py-2">
                                <p className="text-xs font-medium text-muted-foreground">Team Members</p>
                                <div className="mt-1 flex flex-wrap gap-1.5">
                                    {(selectedTeam.members ?? []).length === 0 ? (
                                        <span className="text-xs text-muted-foreground">No active members in this team.</span>
                                    ) : (
                                        (selectedTeam.members ?? []).map((member: any) => (
                                            <Badge key={member.userId} variant="secondary" className="font-normal">
                                                {member.fullName ?? member.email ?? "Worker"}
                                            </Badge>
                                        ))
                                    )}
                                </div>
                            </div>
                        ) : null}
                        <p className="mt-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                            Selected Crew
                        </p>
                        <div className="flex flex-wrap gap-2">
                            {selectedAssigneeLabels.length > 0 ? (
                                selectedAssigneeLabels.map((label, index) => (
                                    <Badge key={`${label}-${index}`} variant="secondary">
                                        {label}
                                    </Badge>
                                ))
                            ) : (
                                <span className="text-sm text-muted-foreground">No crew selected.</span>
                            )}
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label required>Job Start</Label>
                            <DatePicker
                                selected={assignmentScheduleForm.scheduledAt}
                                onChange={(date: Date | null) => setAssignmentScheduleForm((prev) => ({ ...prev, scheduledAt: date }))}
                                showTimeSelect
                                timeFormat="HH:mm"
                                timeIntervals={15}
                                dateFormat="MMM d, yyyy h:mm aa"
                                className={`h-9 w-full rounded-md border border-input bg-white/60 px-3 text-sm shadow-sm ${assignmentScheduleErrors.scheduledAt ? "border-destructive focus-visible:ring-destructive/50" : ""}`}
                                placeholderText="Select start time"
                                preventOpenOnFocus
                                popperClassName="z-[10000]"
                                popperPlacement="bottom-start"
                            />
                            {assignmentScheduleErrors.scheduledAt && <p className="text-xs text-destructive">{assignmentScheduleErrors.scheduledAt}</p>}
                        </div>
                        <div className="space-y-2">
                            <Label required>Job End</Label>
                            <DatePicker
                                selected={assignmentScheduleForm.scheduledEndAt}
                                onChange={(date: Date | null) => setAssignmentScheduleForm((prev) => ({ ...prev, scheduledEndAt: date }))}
                                showTimeSelect
                                timeFormat="HH:mm"
                                timeIntervals={15}
                                dateFormat="MMM d, yyyy h:mm aa"
                                className={`h-9 w-full rounded-md border border-input bg-white/60 px-3 text-sm shadow-sm ${assignmentScheduleErrors.scheduledEndAt ? "border-destructive focus-visible:ring-destructive/50" : ""}`}
                                placeholderText="Select end time"
                                preventOpenOnFocus
                                popperClassName="z-[10000]"
                                popperPlacement="bottom-start"
                            />
                            {assignmentScheduleErrors.scheduledEndAt && <p className="text-xs text-destructive">{assignmentScheduleErrors.scheduledEndAt}</p>}
                        </div>
                    </div>

                    <div className="space-y-2">
                        <Label optional>Hourly Rate For This Job</Label>
                        <Input
                            type="number"
                            min="0"
                            step="0.01"
                            placeholder="Leave blank to use profile/default rate"
                            value={assignmentHourlyRate}
                            onChange={(event) => setAssignmentHourlyRate(event.target.value)}
                            className={`bg-white/60 ${assignmentScheduleErrors.hourlyRate ? "border-destructive focus-visible:ring-destructive/50" : ""}`}
                            disabled={!canManage || isAssigning}
                        />
                        {assignmentScheduleErrors.hourlyRate ? (
                            <p className="text-xs text-destructive">{assignmentScheduleErrors.hourlyRate}</p>
                        ) : (
                            <p className="text-xs text-muted-foreground">{selectedAssignmentRateSource}</p>
                        )}
                    </div>

                    <div className="rounded-xl border border-glass-border bg-white/40 p-4">
                        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                            Availability Preview
                        </p>
                        {assignmentReviewAvailabilityRows.length === 0 ? (
                            <p className="mt-2 text-sm text-muted-foreground">No overlapping assignments found for this crew and time window.</p>
                        ) : (
                            <div className="mt-3 space-y-2">
                                {assignmentReviewAvailabilityRows.map((row) => (
                                    <div key={`${row.userId}-${row.conflictJobId}`} className="rounded-lg border border-amber-200 bg-amber-50/80 p-3">
                                        <p className="text-sm font-semibold text-amber-900">{row.userName}</p>
                                        <p className="text-xs text-amber-800">
                                            {row.conflictTitle}
                                            {row.conflictLocation ? ` • ${row.conflictLocation}` : ""}
                                        </p>
                                        <p className="text-[11px] text-amber-700">
                                            {formatSchedulePoint(row.start)} → {formatSchedulePoint(row.end)}
                                        </p>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </GlassModal>
            <GlassModal
                open={isTimeEntryOpen}
                onOpenChange={(open) => {
                    setIsTimeEntryOpen(open)
                    if (!open) setEditingTimeEntryId(null)
                }}
                title={editingTimeEntryId ? "Edit Time Entry" : "Add Time Entry"}
                description={editingTimeEntryId ? "Update logged hours for this job." : "Manually add hours to this job for an assigned or workspace user."}
                footer={
                    <div className="flex justify-end gap-2 w-full">
                        <Button variant="outline" onClick={() => setIsTimeEntryOpen(false)}>
                            Cancel
                        </Button>
                        <Button onClick={handleCreateTimeEntry} disabled={!canManage || isTimeEntrySaving}>
                            {isTimeEntrySaving ? "Saving..." : editingTimeEntryId ? "Save Changes" : "Save Time Entry"}
                        </Button>
                    </div>
                }
            >
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2 md:col-span-2">
                        <Label required>Worker</Label>
                        <Select value={timeEntryForm.userId} onValueChange={(userId) => setTimeEntryForm((prev) => ({ ...prev, userId }))}>
                            <SelectTrigger className={`w-full bg-white/60 ${timeEntryErrors.userId ? "border-destructive focus-visible:ring-destructive/50" : ""}`}>
                                <SelectValue placeholder="Select worker" />
                            </SelectTrigger>
                            <SelectContent>
                                {users.map((user) => (
                                    <SelectItem key={user.id} value={user.id}>
                                        {user.fullName ?? user.email}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        {timeEntryErrors.userId && <p className="text-xs text-destructive">{timeEntryErrors.userId}</p>}
                    </div>
                    <div className="space-y-2">
                        <Label required>From</Label>
                        <DatePicker
                            selected={timeEntryForm.startTime}
                            onChange={(date: Date | null) => setTimeEntryForm((prev) => ({ ...prev, startTime: date }))}
                            showTimeSelect
                            timeFormat="HH:mm"
                            timeIntervals={15}
                            dateFormat="MMM d, yyyy h:mm aa"
                            className={`h-9 w-full rounded-md border border-input bg-white/60 px-3 text-sm shadow-sm ${timeEntryErrors.startTime ? "border-destructive focus-visible:ring-destructive/50" : ""}`}
                            placeholderText="Select start time"
                        />
                        {timeEntryErrors.startTime && <p className="text-xs text-destructive">{timeEntryErrors.startTime}</p>}
                    </div>
                    <div className="space-y-2">
                        <Label required>To</Label>
                        <DatePicker
                            selected={timeEntryForm.endTime}
                            onChange={(date: Date | null) => setTimeEntryForm((prev) => ({ ...prev, endTime: date }))}
                            showTimeSelect
                            timeFormat="HH:mm"
                            timeIntervals={15}
                            dateFormat="MMM d, yyyy h:mm aa"
                            className={`h-9 w-full rounded-md border border-input bg-white/60 px-3 text-sm shadow-sm ${timeEntryErrors.endTime ? "border-destructive focus-visible:ring-destructive/50" : ""}`}
                            placeholderText="Select end time"
                        />
                        {timeEntryErrors.endTime && <p className="text-xs text-destructive">{timeEntryErrors.endTime}</p>}
                    </div>
                    <div className="space-y-2">
                        <Label optional>Hourly Rate</Label>
                        <Input
                            type="number"
                            min="0"
                            step="0.01"
                            value={timeEntryForm.hourlyRate}
                            onChange={(e) => setTimeEntryForm((prev) => ({ ...prev, hourlyRate: e.target.value }))}
                            className={timeEntryErrors.hourlyRate ? "border-destructive focus-visible:ring-destructive/50" : ""}
                            placeholder="Optional"
                        />
                        {timeEntryErrors.hourlyRate && <p className="text-xs text-destructive">{timeEntryErrors.hourlyRate}</p>}
                    </div>
                    <div className="space-y-2 md:col-span-2">
                        <Label optional>Notes</Label>
                        <Input
                            value={timeEntryForm.notes}
                            onChange={(e) => setTimeEntryForm((prev) => ({ ...prev, notes: e.target.value }))}
                            placeholder="Reason or work summary"
                        />
                    </div>
                </div>
            </GlassModal>
            <GlassModal
                open={isSplitInvoiceOpen}
                onOpenChange={(open) => {
                    setIsSplitInvoiceOpen(open)
                    if (!open) {
                        resetSplitInvoiceForm()
                    }
                }}
                title={editingSplitInvoiceId ? "Edit Split Billing Line" : "Add Split Billing Line"}
                description="Track a staged commercial amount for this job while keeping the main invoice workflow unchanged."
                footer={
                    <div className="flex justify-end gap-2 w-full">
                        <Button
                            variant="outline"
                            onClick={() => {
                                setIsSplitInvoiceOpen(false)
                                resetSplitInvoiceForm()
                            }}
                        >
                            Cancel
                        </Button>
                        <Button
                            onClick={handleSaveSplitInvoice}
                            disabled={!canManage || isSplitInvoiceSaving}
                        >
                            {isSplitInvoiceSaving
                                ? editingSplitInvoiceId
                                    ? "Saving..."
                                    : "Adding..."
                                : editingSplitInvoiceId
                                ? "Save Changes"
                                : "Add Split Line"}
                        </Button>
                    </div>
                }
            >
                <div className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-2 md:col-span-2">
                            <Label required>Description</Label>
                            <Input
                                value={splitInvoiceForm.description}
                                onChange={(e) => setSplitInvoiceForm((prev) => ({ ...prev, description: e.target.value }))}
                                placeholder="Example: Stage 1 mobilisation or first test visit"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label required>Value ex VAT</Label>
                            <Input
                                type="number"
                                min="0"
                                step="0.01"
                                value={splitInvoiceForm.valueExVat}
                                onChange={(e) => setSplitInvoiceForm((prev) => ({ ...prev, valueExVat: e.target.value }))}
                                placeholder="0.00"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label required>Status</Label>
                            <Select
                                value={splitInvoiceForm.status}
                                onValueChange={(value) => setSplitInvoiceForm((prev) => ({ ...prev, status: value }))}
                            >
                                <SelectTrigger className="w-full bg-white/60">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="TO_SEND">To Send</SelectItem>
                                    <SelectItem value="INVOICED">Invoiced</SelectItem>
                                    <SelectItem value="PAID">Paid</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <Label optional>Invoice Date</Label>
                            <Input
                                type="date"
                                value={splitInvoiceForm.invoiceDate}
                                onChange={(e) => setSplitInvoiceForm((prev) => ({ ...prev, invoiceDate: e.target.value }))}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label optional>Linked Context</Label>
                            <Input
                                readOnly
                                className="bg-white/50"
                                value={job?.siteName ? `${getCustomerName(job.customerId)} • ${job.siteName}` : getCustomerName(job.customerId)}
                            />
                        </div>
                    </div>
                    {splitInvoiceError ? (
                        <div className="rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                            {splitInvoiceError}
                        </div>
                    ) : null}
                </div>
            </GlassModal>
            <GlassModal
                open={isCreateInvoiceOpen}
                onOpenChange={(open) => {
                    setIsCreateInvoiceOpen(open)
                    if (!open) {
                        setEditingInvoiceId(null)
                        setInvoiceErrors({})
                        setInvoiceItemErrors({})
                    }
                }}
                title={editingInvoiceId ? "Edit Invoice" : "Create Invoice"}
                description={editingInvoiceId ? "Update invoice details and line items." : "Create a new invoice for this job."}
                footer={
                    <div className="flex justify-end gap-2">
                        <Button variant="ghost" onClick={() => setIsCreateInvoiceOpen(false)}>
                            Cancel
                        </Button>
                        {editingInvoiceId ? (
                            <Button
                                onClick={() => handleCreateInvoiceFromJob(false)}
                                disabled={!canManage || isGeneratingInvoice}
                            >
                                {isGeneratingInvoice ? "Saving..." : "Save Changes"}
                            </Button>
                        ) : (
                            <>
                                <Button
                                    variant="outline"
                                    onClick={() => handleCreateInvoiceFromJob(false)}
                                    disabled={!canManage || isGeneratingInvoice}
                                >
                                    {isGeneratingInvoice && invoiceCreateAction === "CREATE" ? "Creating..." : "Create"}
                                </Button>
                                <Button
                                    onClick={() => handleCreateInvoiceFromJob(true)}
                                    disabled={!canManage || isGeneratingInvoice}
                                >
                                    {isGeneratingInvoice && invoiceCreateAction === "CREATE_SEND" ? "Creating & Sending..." : "Create & Send"}
                                </Button>
                            </>
                        )}
                    </div>
                }
            >
                <div className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label required>Invoice Title</Label>
                            <Input
                                value={invoiceForm.title}
                                className={invoiceErrors.title ? "border-destructive" : ""}
                                onChange={(e) => setInvoiceForm((prev) => ({ ...prev, title: e.target.value }))}
                                placeholder="Invoice title"
                            />
                            {invoiceErrors.title && <p className="text-xs text-destructive">{invoiceErrors.title}</p>}
                        </div>
                        <div className="space-y-2">
                            <Label required>Client</Label>
                            <Input value={getCustomerName(job.customerId)} readOnly className="bg-white/50" />
                        </div>
                        {sitesEnabled ? (
                            <div className="space-y-2">
                                <Label optional>Customer Site</Label>
                                <Input
                                    value={job?.siteName ? `${job.siteName}${job.siteAddress ? ` • ${job.siteAddress}` : ""}` : "No linked site"}
                                    readOnly
                                    className="bg-white/50"
                                />
                            </div>
                        ) : null}
                        <div className="space-y-2">
                            <Label required>Due Date</Label>
                            <DatePicker
                                selected={invoiceForm.dueDate}
                                onChange={(date: Date | null) => setInvoiceForm((prev) => ({ ...prev, dueDate: date }))}
                                className={`w-full rounded-md border border-glass-border bg-white/50 px-3 py-2 text-sm ${invoiceErrors.dueDate ? "border-destructive" : ""}`}
                                dateFormat="dd/MM/yyyy"
                            />
                            {invoiceErrors.dueDate && <p className="text-xs text-destructive">{invoiceErrors.dueDate}</p>}
                        </div>
                        <div className="space-y-2">
                            <Label optional>VAT Number</Label>
                            <Input
                                value={invoiceForm.vatNumber}
                                onChange={(e) => setInvoiceForm((prev) => ({ ...prev, vatNumber: e.target.value }))}
                                placeholder="GB123456789"
                            />
                        </div>
                    </div>

                    <div className="border-t border-glass-border pt-4 space-y-3">
                        <div className="flex items-center justify-between">
                            <Label required>Line Items</Label>
                            <Button variant="outline" size="sm" onClick={addInvoiceLineItem}>
                                <Plus className="h-4 w-4" /> Add Item
                            </Button>
                        </div>
                        {invoiceErrors.lineItems && <p className="text-xs text-destructive">{invoiceErrors.lineItems}</p>}
                        <div className="space-y-3">
                            {invoiceForm.lineItems.map((item) => {
                                const errs = invoiceItemErrors[item.id] ?? {}
                                return (
                                    <div key={item.id} className="grid grid-cols-1 md:grid-cols-12 gap-3 p-3 border border-glass-border rounded-lg bg-white/40">
                                        <div className="md:col-span-5 space-y-1">
                                                <Label required className="text-xs">Description</Label>
                                                <Input
                                                    value={item.description}
                                                    className={errs.description ? "border-destructive" : ""}
                                                    onChange={(e) => updateInvoiceLineItem(item.id, "description", e.target.value)}
                                                    placeholder="Item description"
                                                />
                                                {errs.description && <p className="text-xs text-destructive">{errs.description}</p>}
                                            </div>
                                            <div className="md:col-span-2 space-y-1">
                                                <Label required className="text-xs">Qty</Label>
                                                <Input
                                                    type="number"
                                                    min="1"
                                                    value={item.quantity}
                                                    className={errs.quantity ? "border-destructive" : ""}
                                                    onChange={(e) => updateInvoiceLineItem(item.id, "quantity", Number(e.target.value))}
                                                />
                                                {errs.quantity && <p className="text-xs text-destructive">{errs.quantity}</p>}
                                            </div>
                                            <div className="md:col-span-2 space-y-1">
                                                <Label required className="text-xs">Unit Price</Label>
                                                <Input
                                                    type="number"
                                                    min="0"
                                                    step="0.01"
                                                    value={item.unitPrice}
                                                    className={errs.unitPrice ? "border-destructive" : ""}
                                                    onChange={(e) => updateInvoiceLineItem(item.id, "unitPrice", Number(e.target.value))}
                                                />
                                                {errs.unitPrice && <p className="text-xs text-destructive">{errs.unitPrice}</p>}
                                            </div>
                                            <div className="md:col-span-2 space-y-1">
                                                <Label optional className="text-xs">VAT %</Label>
                                                <Input
                                                    type="number"
                                                    min="0"
                                                    step="0.01"
                                                    value={item.taxRate}
                                                    onChange={(e) => updateInvoiceLineItem(item.id, "taxRate", Number(e.target.value))}
                                                />
                                            </div>
                                            <div className="md:col-span-1 flex items-end">
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    onClick={() => removeInvoiceLineItem(item.id)}
                                                    disabled={invoiceForm.lineItems.length === 1}
                                                >
                                                    <XCircle className="h-4 w-4 text-destructive" />
                                                </Button>
                                            </div>
                                    </div>
                                )
                            })}
                        </div>
                    </div>
                </div>
            </GlassModal>
            <GlassModal
                open={isEditOpen}
                onOpenChange={setIsEditOpen}
                title="Edit Job"
                description="Update job details and schedule."
                footer={
                    <div className="flex justify-end gap-2 w-full">
                        <Button variant="outline" onClick={() => setIsEditOpen(false)}>Cancel</Button>
                        <Button
                            onClick={async () => {
                                if (!canManage) {
                                    toast({
                                        title: "Insufficient permissions",
                                        description: "You can view jobs but cannot edit them.",
                                        variant: "error"
                                    })
                                    return
                                }
                                const nextErrors: { title?: string; customerId?: string; siteId?: string; location?: string; amount?: string; scheduledAt?: string; scheduledEndAt?: string } = {}
                                if (!editForm.title.trim()) {
                                    nextErrors.title = "Job title is required."
                                }
                                if (!editForm.customerId) {
                                    nextErrors.customerId = "Please select a client."
                                }
                                if (sitesEnabled && !editForm.siteId) {
                                    nextErrors.siteId = "Please select a customer site."
                                }
                                const formattedJobAddress = formatJobAddressForPayload(editForm.address)
                                if (!sitesEnabled && !formattedJobAddress) {
                                    nextErrors.location = "Job location is required."
                                }
                                if (editForm.amount.trim() && (!Number.isFinite(Number(editForm.amount)) || Number(editForm.amount) < 0)) {
                                    nextErrors.amount = "Amount must be a valid number greater than or equal to 0."
                                }
                                if (!editForm.scheduledAt) {
                                    nextErrors.scheduledAt = "Start time is required."
                                }
                                if (!editForm.scheduledEndAt) {
                                    nextErrors.scheduledEndAt = "End time is required."
                                } else if (editForm.scheduledAt && editForm.scheduledEndAt <= editForm.scheduledAt) {
                                    nextErrors.scheduledEndAt = "End time must be after start time."
                                }
                                setEditErrors(nextErrors)
                                if (Object.keys(nextErrors).length > 0) {
                                    return
                                }
                                try {
                                    const response = await apiPut<any>(`/jobs/${job.id}`, {
                                        title: editForm.title.trim(),
                                        customerId: editForm.customerId,
                                        siteId: editForm.siteId || undefined,
                                        location: formattedJobAddress || editForm.location || undefined,
                                        ...buildJobAddressPayload(editForm.address),
                                        addressManuallyEdited: editForm.addressManuallyEdited,
                                        description: editForm.description || undefined,
                                        priority: editForm.priority,
                                        amount: editForm.amount.trim() ? Number(editForm.amount) : undefined,
                                        scheduledAt: editForm.scheduledAt ? editForm.scheduledAt.toISOString() : undefined,
                                        scheduledEndAt: editForm.scheduledEndAt ? editForm.scheduledEndAt.toISOString() : undefined
                                    })
                                    setJob(response.data)
                                    toast({
                                        title: "Job Updated",
                                        description: "Changes saved successfully.",
                                        variant: "success"
                                    })
                                    setIsEditOpen(false)
                                    setEditErrors({})
                                } catch (err: any) {
                                    toast({
                                        title: "Update Failed",
                                        description: err?.message ?? "Failed to update job.",
                                        variant: "error"
                                    })
                                }
                            }}
                        disabled={!canManage}>
                            Save Changes
                        </Button>
                    </div>
                }
            >
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                        <Label required>Job Title</Label>
                        <Input
                            value={editForm.title}
                            className={editErrors.title ? "border-destructive focus-visible:ring-destructive/50" : ""}
                            onChange={(e) => setEditForm((prev) => ({ ...prev, title: e.target.value }))}
                        />
                        {editErrors.title && <p className="text-xs text-destructive">{editErrors.title}</p>}
                    </div>
                    <div className="space-y-2">
                        <Label required>Client</Label>
                        <Select
                            value={editForm.customerId}
                            createOption={{ label: "customer", href: "/admin/customers?create=customer" }}
                            onValueChange={(value) => setEditForm((prev) => ({ ...prev, customerId: value, siteId: "", location: "", address: emptyAddressValue(), addressManuallyEdited: false }))}
                        >
                            <SelectTrigger className="w-full bg-white/60">
                                <SelectValue placeholder="Select customer" />
                            </SelectTrigger>
                            <SelectContent>
                                {customers.map((customer) => (
                                    <SelectItem key={customer.id} value={customer.id}>{customer.name}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        {editErrors.customerId && <p className="text-xs text-destructive">{editErrors.customerId}</p>}
                    </div>
                    {sitesEnabled ? <div className="space-y-2">
                        <Label required>Customer Site</Label>
                        <Select
                            value={editForm.siteId}
                            createOption={editForm.customerId ? { label: "site", href: `/admin/customers/${editForm.customerId}?create=site` } : undefined}
                            onValueChange={(value) => {
                                const nextSiteId = value
                                const selectedSite = customerSites.find((site) => site.id === nextSiteId)
                                setEditForm((prev) => ({
                                    ...prev,
                                    siteId: nextSiteId,
                                    address: selectedSite ? customerSiteToAddressValue(selectedSite) : prev.address,
                                    addressManuallyEdited: selectedSite ? false : prev.addressManuallyEdited,
                                    location: selectedSite
                                        ? formatJobAddressForPayload(customerSiteToAddressValue(selectedSite)) || formatCustomerSiteAddress(selectedSite) || prev.location
                                        : prev.location,
                                }))
                            }}
                            disabled={!editForm.customerId}
                        >
                            <SelectTrigger className={`w-full bg-white/60 ${editErrors.siteId ? "border-destructive focus-visible:ring-destructive/50" : ""}`}>
                                <SelectValue placeholder={editForm.customerId ? "Select site" : "Select customer first"} />
                            </SelectTrigger>
                            <SelectContent>
                                {customerSites.map((site) => (
                                    <SelectItem key={site.id} value={site.id}>{formatCustomerSiteLabel(site)}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        {editErrors.siteId && <p className="text-xs text-destructive">{editErrors.siteId}</p>}
                        <p className="text-xs text-muted-foreground">
                            {editForm.siteId
                                ? formatCustomerSiteAddress(customerSites.find((site) => site.id === editForm.siteId)) || "No address saved for this site."
                                : "Required for site-based operational work."}
                        </p>
                    </div> : null}
                    <div className="space-y-3 md:col-span-2">
                        <div className="space-y-1">
                            <Label required={!sitesEnabled} optional={sitesEnabled}>Job Address</Label>
                            <p className="text-xs text-muted-foreground">
                                {sitesEnabled
                                    ? "Defaults from the selected site, but is saved on this job for historical records."
                                    : "Enter the job address in a printable structured format."}
                            </p>
                        </div>
                        <AddressFields
                            value={editForm.address}
                            onChange={(address) => setEditForm((prev) => ({
                                ...prev,
                                address,
                                addressManuallyEdited: true,
                                location: formatJobAddressForPayload(address),
                            }))}
                        />
                        {editErrors.location && <p className="text-xs text-destructive">{editErrors.location}</p>}
                    </div>
                    <div className="space-y-2">
                        <Label required>Priority</Label>
                        <Select value={editForm.priority} onValueChange={(value) => setEditForm((prev) => ({ ...prev, priority: value }))}>
                            <SelectTrigger className="w-full bg-white/60">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="Low">Low</SelectItem>
                                <SelectItem value="Medium">Medium</SelectItem>
                                <SelectItem value="High">High</SelectItem>
                                <SelectItem value="Emergency">Emergency</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="space-y-2">
                        <Label optional>Amount</Label>
                        <Input
                            type="number"
                            min="0"
                            step="0.01"
                            value={editForm.amount}
                            className={editErrors.amount ? "border-destructive focus-visible:ring-destructive/50" : ""}
                            onChange={(e) => setEditForm((prev) => ({ ...prev, amount: e.target.value }))}
                            placeholder="0.00"
                        />
                        {editErrors.amount && <p className="text-xs text-destructive">{editErrors.amount}</p>}
                    </div>
                    <div className="space-y-2">
                        <Label required>Start</Label>
                        <DatePicker
                            selected={editForm.scheduledAt}
                            onChange={(date: Date | null) => setEditForm((prev) => ({ ...prev, scheduledAt: date }))}
                            showTimeSelect
                            timeFormat="HH:mm"
                            timeIntervals={15}
                            dateFormat="MMM d, yyyy h:mm aa"
                            className={`h-9 w-full rounded-md border border-input bg-white/60 px-3 text-sm shadow-sm ${editErrors.scheduledAt ? "border-destructive focus-visible:ring-destructive/50" : ""}`}
                            placeholderText="Select start time"
                        />
                        {editErrors.scheduledAt && <p className="text-xs text-destructive">{editErrors.scheduledAt}</p>}
                    </div>
                    <div className="space-y-2">
                        <Label required>End</Label>
                        <DatePicker
                            selected={editForm.scheduledEndAt}
                            onChange={(date: Date | null) => setEditForm((prev) => ({ ...prev, scheduledEndAt: date }))}
                            showTimeSelect
                            timeFormat="HH:mm"
                            timeIntervals={15}
                            dateFormat="MMM d, yyyy h:mm aa"
                            className={`h-9 w-full rounded-md border border-input bg-white/60 px-3 text-sm shadow-sm ${editErrors.scheduledEndAt ? "border-destructive focus-visible:ring-destructive/50" : ""}`}
                            placeholderText="Select end time"
                        />
                        {editErrors.scheduledEndAt && <p className="text-xs text-destructive">{editErrors.scheduledEndAt}</p>}
                    </div>
                    <div className="space-y-2 md:col-span-2">
                        <Label optional>Description</Label>
                        <Input value={editForm.description} onChange={(e) => setEditForm((prev) => ({ ...prev, description: e.target.value }))} />
                    </div>
                </div>
            </GlassModal>

            <GlassModal
                open={isUpdateOpen}
                onOpenChange={setIsUpdateOpen}
                title={updateUploadMode === "field" ? "Add Field Update" : "Add Attachment"}
                description={
                    updateUploadMode === "field"
                        ? "Upload files or notes that should stay under field updates."
                        : "Upload tenant-managed files for this job."
                }
                footer={
                    <div className="flex justify-end gap-2 w-full">
                        <Button variant="outline" onClick={() => setIsUpdateOpen(false)}>Cancel</Button>
                        <Button
                            disabled={isUploading || !canManage}
                            onClick={async () => {
                                if (!canManage) {
                                    toast({
                                        title: "Insufficient permissions",
                                        description: updateUploadMode === "field"
                                            ? "You can view jobs but cannot add field updates."
                                            : "You can view jobs but cannot add attachments.",
                                        variant: "error"
                                    })
                                    return
                                }
                                if (!selectedFiles || selectedFiles.length === 0) {
                                    setUpdateError("Please select at least one file.")
                                    return
                                }
                                setUpdateError(null)
                                setIsUploading(true)
                                try {
                                    let photoUrls: string[] = []
                                    let photoLabels: string[] = []
                                    if (selectedFiles && selectedFiles.length > 0) {
                                        const formData = new FormData()
                                        const files = Array.from(selectedFiles)
                                        files.forEach(file => formData.append("photos", file))
                                        const uploadRes = await apiPost<string[]>("/uploads/multiple-any", formData)
                                        photoUrls = uploadRes.data
                                        const customLabel = updateForm.uploadLabel.trim()
                                        if (customLabel) {
                                            photoLabels = files.map((_, index) =>
                                                files.length > 1 ? `${customLabel} (${index + 1})` : customLabel
                                            )
                                        }
                                    }

                                    if (updateUploadMode === "field") {
                                        const res = await apiPost<any>(`/jobs/${job.id}/updates`, {
                                            notes: updateForm.uploadLabel.trim() || "Supporting file uploaded.",
                                            photoUrls: photoUrls.length > 0 ? photoUrls : undefined,
                                            photoLabels: photoLabels.length > 0 ? photoLabels : undefined,
                                        })
                                        setUpdates((prev) => [...prev, res.data])
                                    } else {
                                        const res = await apiPost<any[]>(`/jobs/${job.id}/attachments`, {
                                            photoUrls: photoUrls.length > 0 ? photoUrls : undefined,
                                            photoLabels: photoLabels.length > 0 ? photoLabels : undefined,
                                        })
                                        const createdAttachments = Array.isArray(res.data) ? res.data : []
                                        setAttachments((prev) => {
                                            const merged = [...createdAttachments, ...prev]
                                            const unique = new Map<string, any>()
                                            merged.forEach((entry) => {
                                                if (entry?.id && !unique.has(entry.id)) {
                                                    unique.set(entry.id, entry)
                                                }
                                            })
                                            return Array.from(unique.values())
                                        })
                                    }
                                    await refreshActivities()
                                    toast({
                                        title: updateUploadMode === "field" ? "Field update added" : "Attachment Added",
                                        description: updateUploadMode === "field"
                                            ? "Field update saved."
                                            : "Job attachment saved.",
                                        variant: "success"
                                    })
                                    setUpdateForm({ uploadLabel: "" })
                                    setSelectedFiles(null)
                                    setIsUpdateOpen(false)
                                } catch (err: any) {
                                    toast({
                                        title: "Upload Failed",
                                        description: err?.message ?? (
                                            updateUploadMode === "field"
                                                ? "Failed to save field update."
                                                : "Failed to save attachment."
                                        ),
                                        variant: "error"
                                    })
                                } finally {
                                    setIsUploading(false)
                                }
                            }}
                        >
                            {isUploading ? "Uploading..." : "Save Attachment"}
                        </Button>
                    </div>
                }
            >
                <div className="space-y-4">
                    <div className="space-y-2">
                        <Label optional>Upload Label</Label>
                        <Input
                            placeholder="Label to identify this attachment (file name remains unchanged)"
                            value={updateForm.uploadLabel}
                            onChange={(e) => setUpdateForm((prev) => ({ ...prev, uploadLabel: e.target.value }))}
                        />
                    </div>
                    <div className="space-y-2">
                        <Label required>Files</Label>
                        <Input
                            type="file"
                            multiple
                            onChange={(e) => setSelectedFiles(e.target.files)}
                            className="bg-white/60"
                        />
                        {selectedFiles && (
                            <p className="text-[10px] text-muted-foreground">{selectedFiles.length} files selected</p>
                        )}
                    </div>
                    {updateError && <p className="text-xs text-destructive">{updateError}</p>}
                </div>
            </GlassModal>

            <GlassModal
                open={isDeleteOpen}
                onOpenChange={setIsDeleteOpen}
                title="Delete Job?"
                description="This will remove the job from the schedule."
                footer={
                    <div className="flex justify-end gap-2 w-full">
                        <Button variant="outline" onClick={() => setIsDeleteOpen(false)}>Cancel</Button>
                        <Button
                            variant="destructive"
                            onClick={async () => {
                                if (!canManage) {
                                    toast({
                                        title: "Insufficient permissions",
                                        description: "You can view jobs but cannot delete them.",
                                        variant: "error"
                                    })
                                    return
                                }
                                try {
                                    await apiDelete(`/jobs/${job.id}`, { confirmed: true })
                                    toast({
                                        title: "Deleted",
                                        description: "Job removed.",
                                        variant: "success"
                                    })
                                    router.push("/admin/schedule")
                                } catch (err: any) {
                                    toast({
                                        title: "Delete Failed",
                                        description: err?.message ?? "Failed to delete job.",
                                        variant: "error"
                                    })
                                }
                            }}
                        disabled={!canManage}>
                            Delete
                        </Button>
                    </div>
                }
            >
                <p className="text-sm text-muted-foreground">Are you sure you want to delete this job? This action cannot be undone.</p>
            </GlassModal>
            <GlassModal
                open={Boolean(expensePreview)}
                onOpenChange={(open) => {
                    if (!open) setExpensePreview(null)
                }}
                title="Expense Receipt"
                description={expensePreview?.name ?? "Receipt preview"}
                footer={
                    <div className="flex justify-end gap-2 w-full">
                        <Button variant="outline" onClick={() => setExpensePreview(null)}>
                            Close
                        </Button>
                        {expensePreview?.url ? (
                            <Button asChild>
                                <a href={expensePreview.url} target="_blank" rel="noreferrer">
                                    Open in New Tab
                                </a>
                            </Button>
                        ) : null}
                    </div>
                }
            >
                {expensePreview?.url ? (
                    isImageFile(expensePreview.url) ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                            src={expensePreview.url}
                            alt={expensePreview.name}
                            className="max-h-[70vh] w-full rounded-lg border border-glass-border object-contain bg-white/70"
                        />
                    ) : getFileExt(expensePreview.url) === "pdf" ? (
                        <iframe
                            src={expensePreview.url}
                            title={expensePreview.name}
                            className="h-[70vh] w-full rounded-lg border border-glass-border bg-white"
                        />
                    ) : (
                        <div className="rounded-lg border border-glass-border bg-white/70 p-6 text-center">
                            <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full border border-glass-border bg-white">
                                {renderFileIcon(expensePreview.url)}
                            </div>
                            <p className="text-sm font-semibold text-foreground">{expensePreview.name}</p>
                            <p className="mt-1 text-xs text-muted-foreground">
                                Preview is not available for this file type. Use &quot;Open in New Tab&quot;.
                            </p>
                        </div>
                    )
                ) : null}
            </GlassModal>
            <ErrorToast error={error} onClear={() => setError(null)} />
        </PageContainer>
    )
}

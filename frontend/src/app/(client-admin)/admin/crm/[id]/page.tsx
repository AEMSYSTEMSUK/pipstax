"use client"

import { use, useEffect, useState, type DragEvent } from "react"
import { useRouter } from "next/navigation"
import { PageContainer } from "@/components/layout/PageContainer"
import { GlassCard, GlassCardContent, GlassCardHeader, GlassCardTitle } from "@/components/glass/GlassCard"
import { GlassPanel } from "@/components/glass/GlassPanel"
import { GlassModal } from "@/components/glass/GlassModal"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
type Lead = {
    id: string
    name: string
    company: string
    email: string
    phone: string
    source: string
    status: string
    value: number
    createdAt?: string
    industry?: string
    tags?: string[]
    assignedUserId?: string | null
    assignedUserName?: string | null
}
type LeadDocument = {
    id: string
    name: string
    fileUrl: string
    category?: string
    status?: string
    syncStatus?: string
    relatedEntityType?: string
    relatedEntityId?: string
}
type LeadQuote = {
    id: string
    quoteNumber?: string
    title: string
    status: string
    customerId?: string
    siteId?: string
    workflowStageKey?: string
    total?: number
    createdAt?: string
}
type LeadTask = {
    id: string
    title: string
    taskType: string
    description?: string
    status: string
    assigneeUserId?: string | null
    reminderAt?: string | null
    assignee?: { id: string; fullName: string; email: string } | null
    createdAt?: string
}
type QuoteComposerItem = {
    id: string
    description: string
    quantity: number
    unitPrice: number
    taxRate: number
}

const TASK_STATUS_COLUMNS = [
    { value: "OPEN", label: "Open" },
    { value: "IN_PROGRESS", label: "In Progress" },
    { value: "COMPLETED", label: "Completed" },
    { value: "CANCELLED", label: "Cancelled" },
]

const isSameCalendarDay = (left: Date, right: Date) =>
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()

const isFutureReminderDate = (date: Date | null) => !date || date.getTime() > Date.now()

const isSelectableReminderTime = (selectedDate: Date | null, time: Date) => {
    if (!selectedDate) return true
    const now = new Date()
    if (!isSameCalendarDay(selectedDate, now)) return true
    const candidate = new Date(selectedDate)
    candidate.setHours(time.getHours(), time.getMinutes(), 0, 0)
    return candidate.getTime() > now.getTime()
}

import { ArrowLeft, Phone, Mail, Building2, Clock, UploadCloud, ArrowRight, ExternalLink, Trash2, Pencil, FileText, Plus, LayoutGrid, List, CalendarDays, CheckCircle, Target, UserRound, Paperclip } from "lucide-react"
import Link from "next/link"
import { format } from "date-fns"
import { apiDelete, apiGet, apiPost, apiPut, uploadWithProgress, isDeleteCancelled } from "@/lib/api"
import { getAuth } from "@/lib/auth"
import { ErrorToast } from "@/components/shared/ErrorToast"
import { StatusBadge } from "@/components/shared/StatusBadge"
import DatePicker from "react-datepicker"
import { useToast } from "@/components/ui/toast"
import { getModulePermissions } from "@/lib/permission-ui"
import { formatLeadStatus, formatQuoteStatus } from "@/lib/status"
import { CustomerSiteOption, customerSiteToAddressValue, fetchCustomerSites, formatCustomerSiteAddress, formatCustomerSiteLabel } from "@/lib/customer-sites"
import { useTenantFeatures } from "@/components/layout/TenantFeaturesContext"
import { useTenantWorkflowConfig } from "@/components/layout/TenantWorkflowContext"
import { getWorkflowStatusLabel } from "@/lib/workflows"
import { AssignableUser, LeadFormDialog, LeadSubmitPayload } from "@/components/crm/LeadFormDialog"
import { AutocompleteOption } from "@/components/shared/CreatableAutocomplete"
import { useUrlSyncedTab } from "@/components/shared/useUrlSyncedTab"
import { quickCreatedEventName } from "@/components/shared/QuickCreateProvider"
import { AddressFields, emptyAddressValue, formatAddressValue, type AddressValue } from "@/components/shared/LocalizedFields"
import { BrowserBackButton } from "@/components/shared/BrowserBackButton"
import { useSavedColumnOrder } from "@/components/shared/useSavedColumnOrder"
import { useSavedViewMode } from "@/components/shared/useSavedViewMode"

const LEAD_TASK_VIEW_MODES = ["list", "kanban"] as const

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

export default function LeadDetailPage({ params }: { params: Promise<{ id: string }> }) {
    const resolvedParams = use(params)
    const router = useRouter()
    const { toast } = useToast()
    const { canView, canManage } = getModulePermissions("crm.view", "crm.manage")
    const { canManage: canManageQuotes } = getModulePermissions("quotes.view", "quotes.manage")
    const { sites: sitesEnabled, complianceWorkflows } = useTenantFeatures()
    const workflowConfig = useTenantWorkflowConfig()
    const [lead, setLead] = useState<Lead | null>(null)
    const [error, setError] = useState<string | null>(null)
    const [currentUser, setCurrentUser] = useState<{ id: string; fullName?: string; email?: string } | null>(null)
    const [customers, setCustomers] = useState<any[]>([])
    const [quoteCustomerSites, setQuoteCustomerSites] = useState<CustomerSiteOption[]>([])
    const [convertCustomerSites, setConvertCustomerSites] = useState<CustomerSiteOption[]>([])
    const [activities, setActivities] = useState<any[]>([])
    const [activityType, setActivityType] = useState("Note")
    const [activityMessage, setActivityMessage] = useState("")
    const [noteMessage, setNoteMessage] = useState("")
    const [assignableUsers, setAssignableUsers] = useState<AssignableUser[]>([])
    const [industryOptions, setIndustryOptions] = useState<AutocompleteOption[]>([])
    const [activeTab, setActiveTab] = useUrlSyncedTab({
        defaultTab: "overview",
        allowedTabs: ["overview", "tasks", "quotes", "attachments", "activity"],
    })
    const [leadTasks, setLeadTasks] = useState<LeadTask[]>([])
    const [taskForm, setTaskForm] = useState({
        title: "",
        taskType: "FOLLOW_UP",
        description: "",
        assigneeUserId: "",
        reminderAt: null as Date | null,
    })
    const [taskFormErrors, setTaskFormErrors] = useState<{ title?: string; assigneeUserId?: string; reminderAt?: string }>({})
    const [taskError, setTaskError] = useState<string | null>(null)
    const [isTaskOpen, setIsTaskOpen] = useState(false)
    const [taskView, setTaskView] = useSavedViewMode("pipstack:view-mode:admin-lead-tasks", "list", LEAD_TASK_VIEW_MODES)
    const [editingTask, setEditingTask] = useState<LeadTask | null>(null)
    const [editTaskForm, setEditTaskForm] = useState({
        title: "",
        taskType: "FOLLOW_UP",
        description: "",
        assigneeUserId: "",
        reminderAt: null as Date | null,
        status: "OPEN",
    })
    const [editTaskFormErrors, setEditTaskFormErrors] = useState<{ title?: string; reminderAt?: string }>({})
    const [editTaskError, setEditTaskError] = useState<string | null>(null)
    const [documents, setDocuments] = useState<LeadDocument[]>([])
    const [leadQuotes, setLeadQuotes] = useState<LeadQuote[]>([])
    const [isUploadOpen, setIsUploadOpen] = useState(false)
    const [uploadForm, setUploadForm] = useState({ name: "", file: null as File | null })
    const [isEditOpen, setIsEditOpen] = useState(false)
    const [uploadErrors, setUploadErrors] = useState<{ name?: string; file?: string }>({})
    const [noteError, setNoteError] = useState<string | null>(null)
    const [activityError, setActivityError] = useState<string | null>(null)
    const [isConvertOpen, setIsConvertOpen] = useState(false)
    const [isCreatingQuote, setIsCreatingQuote] = useState(false)
    const [isCreateQuoteOpen, setIsCreateQuoteOpen] = useState(false)
    const [createQuoteForm, setCreateQuoteForm] = useState({
        customerId: "",
        siteId: "",
        projectName: "",
        validUntil: null as Date | null,
        notes: "",
        terms: "",
    })
    const [createQuoteItems, setCreateQuoteItems] = useState<QuoteComposerItem[]>([
        { id: Math.random().toString(), description: "", quantity: 1, unitPrice: 0, taxRate: 20 }
    ])
    const [createQuoteErrors, setCreateQuoteErrors] = useState<{ projectName?: string; items?: string }>({})
    const [createQuoteItemErrors, setCreateQuoteItemErrors] = useState<Record<string, { description?: string; quantity?: string; unitPrice?: string }>>({})
    const [convertForm, setConvertForm] = useState({
        customerId: "",
        siteId: "",
        location: "",
        address: emptyAddressValue(),
        addressManuallyEdited: false,
        priority: "Medium",
        amount: "",
        scheduledAt: null as Date | null,
        scheduledEndAt: null as Date | null
    })
    const [convertErrors, setConvertErrors] = useState<{ customerId?: string; siteId?: string; location?: string; amount?: string; scheduledAt?: string; scheduledEndAt?: string }>({})
    const [isDeleteDocOpen, setIsDeleteDocOpen] = useState(false)
    const [deleteDocId, setDeleteDocId] = useState<string | null>(null)
    const { orderedColumns: orderedTaskColumns, getColumnDragProps } = useSavedColumnOrder(
        TASK_STATUS_COLUMNS,
        "pipstack:board-columns:admin-lead-tasks",
        (column) => column.value
    )

    const calcQuoteTotals = (items: QuoteComposerItem[]) => {
        const subtotal = items.reduce((acc, item) => acc + (Number(item.quantity) * Number(item.unitPrice)), 0)
        const taxTotal = items.reduce((acc, item) => {
            const line = Number(item.quantity) * Number(item.unitPrice)
            return acc + (line * (Number(item.taxRate) / 100))
        }, 0)
        return {
            subtotal,
            taxTotal,
            total: subtotal + taxTotal,
        }
    }

    const acceptedQuote = leadQuotes.find((quote) => String(quote.status ?? "").toUpperCase() === "SIGNED")
    const canConvertLeadToJob = Boolean(acceptedQuote) && lead?.status !== "Lost"

    const toApiLeadStatus = (status?: string) => {
        const normalized = (status ?? "").toUpperCase()
        if (["NEW", "CONTACTED", "QUALIFIED", "CONVERTED", "LOST"].includes(normalized)) {
            return normalized
        }
        switch ((status ?? "").toLowerCase()) {
            case "new": return "NEW"
            case "contacted": return "CONTACTED"
            case "qualified": return "QUALIFIED"
            case "won": return "CONVERTED"
            case "lost": return "LOST"
            default: return "NEW"
        }
    }

    const toSourceLabel = (source?: string) => {
        const normalized = String(source ?? "").trim().toLowerCase().replace(/[_\s]+/g, "-")
        if (!normalized) return "Other"
        if (normalized === "web" || normalized === "web-form") return "Web form"
        if (normalized === "phone" || normalized === "phone-call") return "Phone"
        if (normalized === "referral") return "Referral"
        if (normalized === "angi") return "Angi"
        if (normalized === "thumbtack") return "Thumbtack"
        if (normalized === "walk-in" || normalized === "walkin") return "Walk-in"
        return "Other"
    }

    const formatSyncStatus = (value?: string) => {
        const normalized = String(value ?? "").trim().toUpperCase()
        if (normalized === "SYNCED") return "SYNCED"
        if (normalized === "ERROR") return "ERROR"
        return "PENDING"
    }

    const formatTaskType = (value?: string) => {
        const raw = String(value ?? "").trim()
        if (!raw) return "General"
        return raw
            .replace(/_/g, " ")
            .toLowerCase()
            .replace(/\b\w/g, (letter) => letter.toUpperCase())
    }

    const formatTaskStatus = (value?: string) => {
        const normalized = String(value ?? "").trim().toUpperCase()
        if (normalized === "IN_PROGRESS") return "In Progress"
        if (normalized === "COMPLETED") return "Completed"
        if (normalized === "CANCELLED") return "Cancelled"
        return "Open"
    }

    const getFileExtension = (fileUrl?: string, fallbackName?: string) => {
        const fromUrl = String(fileUrl ?? "").split("?")[0]
        const urlExt = fromUrl.includes(".") ? fromUrl.split(".").pop() : ""
        const nameExt = String(fallbackName ?? "").includes(".") ? String(fallbackName).split(".").pop() : ""
        return String(urlExt || nameExt || "").trim().toLowerCase()
    }

    const isImageFile = (fileUrl?: string, fallbackName?: string) => {
        const ext = getFileExtension(fileUrl, fallbackName)
        return ["jpg", "jpeg", "png", "gif", "webp", "svg", "bmp", "avif"].includes(ext)
    }

    const getPreviewDocumentLabel = (doc: LeadDocument) => {
        const name = String(doc.name ?? "").trim()
        if (name) return name
        const fileRef = String(doc.fileUrl ?? "").trim()
        if (!fileRef) return "File"
        try {
            const parsed = new URL(fileRef)
            return decodeURIComponent(parsed.pathname || fileRef)
        } catch {
            return decodeURIComponent(fileRef.split("?")[0] || fileRef)
        }
    }

    const getDefaultTaskAssigneeId = () => {
        const self = currentUser?.id
            ? assignableUsers.find((user) => user.id === currentUser.id)
            : null
        return self?.id ?? assignableUsers[0]?.id ?? ""
    }

    const resetTaskForm = () => {
        setTaskForm({
            title: "",
            taskType: "FOLLOW_UP",
            description: "",
            assigneeUserId: getDefaultTaskAssigneeId(),
            reminderAt: null,
        })
        setTaskFormErrors({})
        setTaskError(null)
    }

    useEffect(() => {
        setCurrentUser(getAuth()?.user ?? null)
    }, [])

    useEffect(() => {
        if (taskForm.assigneeUserId || assignableUsers.length === 0) return
        const defaultAssigneeId = getDefaultTaskAssigneeId()
        if (defaultAssigneeId) {
            setTaskForm((prev) => ({ ...prev, assigneeUserId: defaultAssigneeId }))
        }
    }, [assignableUsers, currentUser, taskForm.assigneeUserId])

    useEffect(() => {
        const load = async () => {
            try {
                const [response, activityRes, docsRes, usersRes, quotesRes, tasksRes, customersRes, industriesRes] = await Promise.all([
                    apiGet<any>(`/leads/${resolvedParams.id}`),
                    apiGet<any[]>(`/leads/${resolvedParams.id}/activities`),
                    apiGet<any[]>(`/leads/${resolvedParams.id}/documents`),
                    apiGet<AssignableUser[]>(`/leads/assignable-users`),
                    apiGet<LeadQuote[]>(`/leads/${resolvedParams.id}/quotes`),
                    apiGet<LeadTask[]>(`/leads/${resolvedParams.id}/tasks`),
                    apiGet<any[]>(`/customers`),
                    apiGet<AutocompleteOption[]>(`/lookups?type=lead_industry`),
                ])
                const data = response.data
                setLead({
                    id: data.id,
                    name: data.name,
                    company: data.notes ?? "—",
                    email: data.email,
                    phone: data.phone ?? "",
                    source: toSourceLabel(data.source),
                    status: formatLeadStatus(data.status),
                    value: 0,
                    createdAt: data.createdAt,
                    industry: data.industry,
                    tags: data.tags,
                    assignedUserId: data.assignedUserId ?? null,
                    assignedUserName: data.assignedUserName ?? null,
                } as any)
                setActivities(Array.isArray(activityRes.data) ? activityRes.data : [])
                setAssignableUsers(Array.isArray(usersRes.data) ? usersRes.data : [])
                setLeadQuotes(Array.isArray(quotesRes.data) ? quotesRes.data : [])
                setLeadTasks(Array.isArray(tasksRes.data) ? tasksRes.data : [])
                setCustomers(Array.isArray(customersRes.data) ? customersRes.data : [])
                const lookupIndustries = Array.isArray(industriesRes.data) ? industriesRes.data : []
                const currentIndustry = String(data.industry ?? "").trim()
                const industryByTitle = new Map(
                    [
                        ...lookupIndustries,
                        ...(currentIndustry ? [{ title: currentIndustry }] : []),
                    ].map((option) => [option.title.toLowerCase(), option])
                )
                setIndustryOptions(Array.from(industryByTitle.values()).sort((a, b) => a.title.localeCompare(b.title)))
                const docs = Array.isArray(docsRes.data) ? docsRes.data : []
                setDocuments(
                    docs
                        .map((doc) => ({
                            id: doc.id,
                            name: doc.name,
                            fileUrl: doc.fileUrl,
                            category: doc.category,
                            status: doc.status,
                            syncStatus: doc.syncStatus,
                            relatedEntityType: doc.relatedEntityType,
                            relatedEntityId: doc.relatedEntityId
                        }))
                )
            } catch (err: any) {
                setError(err?.message ?? "Failed to load lead")
            }
        }
        load()
    }, [resolvedParams.id])

    useEffect(() => {
        const handleQuickCreated = (event: Event) => {
            const customEvent = event as CustomEvent<{ type?: string; data?: any }>
            if (customEvent.detail?.type !== "employee" || !customEvent.detail.data?.id) return

            const created = customEvent.detail.data
            const nextUser: AssignableUser = {
                id: created.id,
                fullName: created.fullName || created.email || "Employee",
                email: created.email,
            }
            setAssignableUsers((prev) => [nextUser, ...prev.filter((user) => user.id !== nextUser.id)])
            setTaskForm((prev) => ({ ...prev, assigneeUserId: nextUser.id }))
        }

        window.addEventListener(quickCreatedEventName, handleQuickCreated)
        return () => window.removeEventListener(quickCreatedEventName, handleQuickCreated)
    }, [])

    useEffect(() => {
        const loadQuoteSites = async () => {
            if (!sitesEnabled || !createQuoteForm.customerId) {
                setQuoteCustomerSites([])
                setCreateQuoteForm((prev) => ({ ...prev, siteId: "" }))
                return
            }
            try {
                const sites = await fetchCustomerSites(createQuoteForm.customerId)
                setQuoteCustomerSites(sites)
                setCreateQuoteForm((prev) => ({
                    ...prev,
                    siteId: sites.some((site) => site.id === prev.siteId) ? prev.siteId : "",
                }))
            } catch (err: any) {
                setError(err?.message ?? "Failed to load customer sites")
                setQuoteCustomerSites([])
                setCreateQuoteForm((prev) => ({ ...prev, siteId: "" }))
            }
        }
        void loadQuoteSites()
    }, [createQuoteForm.customerId, sitesEnabled])

    useEffect(() => {
        const loadConvertSites = async () => {
            if (!sitesEnabled || !convertForm.customerId) {
                setConvertCustomerSites([])
                setConvertForm((prev) => ({ ...prev, siteId: "" }))
                return
            }
            try {
                const sites = await fetchCustomerSites(convertForm.customerId)
                setConvertCustomerSites(sites)
                setConvertForm((prev) => ({
                    ...prev,
                    siteId: sites.some((site) => site.id === prev.siteId) ? prev.siteId : "",
                    ...(() => {
                        const selectedSite = sites.find((site) => site.id === prev.siteId)
                        const selectedAddress = selectedSite ? customerSiteToAddressValue(selectedSite) : prev.address
                        return selectedSite && !hasJobAddress(prev.address)
                            ? {
                                address: selectedAddress,
                                addressManuallyEdited: false,
                                location: formatJobAddressForPayload(selectedAddress) || formatCustomerSiteAddress(selectedSite) || prev.location,
                            }
                            : {}
                    })(),
                }))
            } catch (err: any) {
                setError(err?.message ?? "Failed to load customer sites")
                setConvertCustomerSites([])
                setConvertForm((prev) => ({ ...prev, siteId: "" }))
            }
        }
        void loadConvertSites()
    }, [convertForm.customerId, sitesEnabled])

    const createIndustryOption = async (title: string) => {
        const response = await apiPost<AutocompleteOption>("/lookups", { title, type: "lead_industry" })
        const option = response.data
        setIndustryOptions((prev) =>
            prev.some((item) => item.title.toLowerCase() === option.title.toLowerCase())
                ? prev
                : [...prev, option].sort((a, b) => a.title.localeCompare(b.title))
        )
        return option
    }

    const updateLead = async (payload: LeadSubmitPayload) => {
        if (!lead) return
        const response = await apiPut<any>(`/leads/${lead.id}`, payload)
        const updated = response.data
        setLead((prev) => prev ? {
            ...prev,
            name: updated.name,
            email: updated.email,
            phone: updated.phone ?? "",
            company: updated.notes ?? "—",
            source: toSourceLabel(updated.source),
            status: formatLeadStatus(updated.status),
            industry: updated.industry ?? "",
            tags: Array.isArray(updated.tags) ? updated.tags : [],
            assignedUserId: updated.assignedUserId ?? null,
            assignedUserName: updated.assignedUserName ?? null
        } : prev)
        toast({
            title: "Lead Updated",
            description: "Lead details saved.",
            variant: "success"
        })
    }

    if (!canView) {
        return (
            <PageContainer>
                <GlassCard>
                    <GlassCardHeader>
                        <GlassCardTitle>Lead Details</GlassCardTitle>
                    </GlassCardHeader>
                    <GlassCardContent>You do not have access to view this lead.</GlassCardContent>
                </GlassCard>
            </PageContainer>
        )
    }

    if (!lead) {
        return (
            <PageContainer>
                <div className="text-center p-12">Lead not found</div>
                <ErrorToast error={error} onClear={() => setError(null)} />
            </PageContainer>
        )
    }

    const reloadActivities = async () => {
        try {
            const res = await apiGet<any[]>(`/leads/${resolvedParams.id}/activities`)
            setActivities(Array.isArray(res.data) ? res.data : [])
        } catch {
            // ignore background refresh failures
        }
    }

    const openCreateQuoteModal = () => {
        if (!canManage) {
            toast({
                title: "Insufficient permissions",
                description: "You can view leads but cannot create quotes.",
                variant: "error"
            })
            return
        }
        if (!canManageQuotes) {
            toast({
                title: "Insufficient permissions",
                description: "You can view leads but cannot create quotes.",
                variant: "error"
            })
            return
        }
        const baseDate = new Date()
        baseDate.setDate(baseDate.getDate() + 30)
        setCreateQuoteForm({
            customerId: "",
            siteId: "",
            projectName: `${lead.name} Quote`,
            validUntil: baseDate,
            notes: "",
            terms: "",
        })
        setCreateQuoteItems([
            {
                id: Math.random().toString(),
                description: "",
                quantity: 1,
                unitPrice: 0,
                taxRate: 20,
            },
        ])
        setCreateQuoteErrors({})
        setCreateQuoteItemErrors({})
        setIsCreateQuoteOpen(true)
    }

    const createLeadTask = async () => {
        const nextErrors: { title?: string; assigneeUserId?: string; reminderAt?: string } = {}
        if (!taskForm.title.trim()) {
            nextErrors.title = "Task title is required."
        }
        if (!taskForm.assigneeUserId) {
            nextErrors.assigneeUserId = "Assign this task to a workspace member."
        }
        if (!isFutureReminderDate(taskForm.reminderAt)) {
            nextErrors.reminderAt = "Reminder must be a future date and time."
        }
        setTaskFormErrors(nextErrors)
        if (Object.keys(nextErrors).length > 0) return
        try {
            const response = await apiPost<LeadTask>(`/leads/${lead.id}/tasks`, {
                title: taskForm.title.trim(),
                taskType: taskForm.taskType,
                description: taskForm.description.trim() || undefined,
                assigneeUserId: taskForm.assigneeUserId,
                reminderAt: taskForm.reminderAt ? taskForm.reminderAt.toISOString() : undefined,
            })
            setLeadTasks((prev) => [response.data, ...prev])
            resetTaskForm()
            setIsTaskOpen(false)
            toast({
                title: "Task Assigned",
                description: "Lead task has been assigned.",
                variant: "success",
            })
            await reloadActivities()
        } catch (err: any) {
            setTaskError(err?.message ?? "Failed to assign task.")
            toast({
                title: "Task Assignment Failed",
                description: err?.message ?? "Failed to assign task.",
                variant: "error",
            })
        }
    }

    const updateLeadTask = async (taskId: string, patch: Record<string, unknown>) => {
        if (typeof patch.reminderAt === "string" && !isFutureReminderDate(new Date(patch.reminderAt))) {
            toast({
                title: "Invalid Reminder",
                description: "Reminder must be a future date and time.",
                variant: "error",
            })
            return false
        }
        try {
            const response = await apiPut<LeadTask>(`/leads/${lead.id}/tasks/${taskId}`, patch)
            setLeadTasks((prev) => prev.map((task) => (task.id === taskId ? response.data : task)))
            await reloadActivities()
            return true
        } catch (err: any) {
            toast({
                title: "Task Update Failed",
                description: err?.message ?? "Failed to update task.",
                variant: "error",
            })
            return false
        }
    }

    const openTaskEditor = (task: LeadTask) => {
        setEditingTask(task)
        setEditTaskForm({
            title: task.title ?? "",
            taskType: task.taskType || "FOLLOW_UP",
            description: task.description ?? "",
            assigneeUserId: task.assigneeUserId ?? "",
            reminderAt: task.reminderAt ? new Date(task.reminderAt) : null,
            status: task.status || "OPEN",
        })
        setEditTaskFormErrors({})
        setEditTaskError(null)
    }

    const closeTaskEditor = () => {
        setEditingTask(null)
        setEditTaskFormErrors({})
        setEditTaskError(null)
    }

    const saveTaskEdit = async () => {
        if (!editingTask) return
        const nextErrors: { title?: string; reminderAt?: string } = {}
        if (!editTaskForm.title.trim()) {
            nextErrors.title = "Task title is required."
        }
        if (!isFutureReminderDate(editTaskForm.reminderAt)) {
            nextErrors.reminderAt = "Reminder must be a future date and time."
        }
        setEditTaskFormErrors(nextErrors)
        if (Object.keys(nextErrors).length > 0) return

        setEditTaskError(null)
        const saved = await updateLeadTask(editingTask.id, {
            title: editTaskForm.title.trim(),
            taskType: editTaskForm.taskType,
            description: editTaskForm.description.trim() || null,
            assigneeUserId: editTaskForm.assigneeUserId || null,
            reminderAt: editTaskForm.reminderAt ? editTaskForm.reminderAt.toISOString() : null,
            status: editTaskForm.status,
        })
        if (saved) {
            toast({
                title: "Task Updated",
                description: "Task details saved.",
                variant: "success",
            })
            closeTaskEditor()
        } else {
            setEditTaskError("Failed to save task changes.")
        }
    }

    const handleTaskDrop = async (event: DragEvent<HTMLDivElement>, status: string) => {
        event.preventDefault()
        const taskId = event.dataTransfer.getData("application/x-lead-task-id") || event.dataTransfer.getData("text/plain")
        if (!taskId || !canManage) return
        const task = leadTasks.find((item) => item.id === taskId)
        if (!task || task.status === status) return
        await updateLeadTask(taskId, { status })
    }

    const getTasksForStatus = (status: string) => leadTasks.filter((task) => task.status === status)

    const deleteLeadTask = async (taskId: string) => {
        try {
            await apiDelete(`/leads/${lead.id}/tasks/${taskId}`)
            setLeadTasks((prev) => prev.filter((task) => task.id !== taskId))
            toast({
                title: "Task Deleted",
                description: "Lead task removed.",
                variant: "success",
            })
            await reloadActivities()
        } catch (err: any) {
            if (isDeleteCancelled(err)) return
            toast({
                title: "Delete Failed",
                description: err?.message ?? "Failed to delete task.",
                variant: "error",
            })
        }
    }

    const openTasks = leadTasks.filter((task) => task.status !== "COMPLETED" && task.status !== "CANCELLED").length
    const acceptedQuotes = leadQuotes.filter((quote) => String(quote.status ?? "").toUpperCase() === "SIGNED").length
    const quoteValue = leadQuotes.reduce((sum, quote) => sum + Number(quote.total ?? 0), 0)
    const latestActivity = activities[0]

    return (
        <PageContainer>
            <div className="mb-6">
                <BrowserBackButton className="text-sm font-medium text-primary hover:text-primary-dark transition-colors inline-flex items-center gap-1 mb-4">
                    <ArrowLeft className="h-3 w-3" /> Back to Pipeline
                </BrowserBackButton>

                <div className="rounded-[32px] border border-glass-border/70 bg-gradient-to-br from-white/90 via-white/65 to-primary/10 p-6 shadow-xl shadow-slate-200/40">
                    <div className="flex flex-col gap-6 xl:flex-row xl:items-center xl:justify-between">
                        <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
                            <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-3xl border border-primary/15 bg-primary/10 text-primary shadow-sm">
                                <UserRound className="h-10 w-10" />
                            </div>
                            <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-3">
                                    <h1 className="text-3xl font-semibold tracking-tight text-foreground">{lead.name}</h1>
                                    <Select
                                        value={toApiLeadStatus(lead.status)}
                                        onValueChange={async (newStatus) => {
                                            try {
                                                await apiPut(`/leads/${lead.id}`, { status: newStatus })
                                                setLead((prev) => prev ? { ...prev, status: formatLeadStatus(newStatus) } : prev)
                                                toast({
                                                    title: "Status Updated",
                                                    description: `Lead status changed to ${formatLeadStatus(newStatus)}.`,
                                                    variant: "success"
                                                })
                                            } catch (err: any) {
                                                toast({
                                                    title: "Update Failed",
                                                    description: err?.message ?? "Failed to update lead status.",
                                                    variant: "error"
                                                })
                                            }
                                        }}
                                    >
                                        <SelectTrigger className="h-8 w-[140px] bg-white/70 text-xs font-semibold">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="NEW">New</SelectItem>
                                            <SelectItem value="CONTACTED">Contacted</SelectItem>
                                            <SelectItem value="QUALIFIED">Qualified</SelectItem>
                                            <SelectItem value="CONVERTED">Won</SelectItem>
                                            <SelectItem value="LOST">Lost</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="mt-3 grid gap-2 text-sm text-muted-foreground sm:grid-cols-2">
                                    <div className="flex items-center gap-2">
                                        <Building2 className="h-4 w-4 shrink-0 text-primary" />
                                        <span className="truncate">{lead.company && lead.company !== "—" ? lead.company : "No company notes saved"}</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <Mail className="h-4 w-4 shrink-0 text-primary" />
                                        <span className="truncate">{lead.email || "No email saved"}</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <Phone className="h-4 w-4 shrink-0 text-primary" />
                                        <span>{lead.phone || "No phone saved"}</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <CalendarDays className="h-4 w-4 shrink-0 text-primary" />
                                        <span>Created {lead.createdAt ? format(new Date(lead.createdAt), "dd MMM yyyy") : "date unavailable"}</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div className="flex flex-wrap gap-2">
                            <Button
                                variant="outline"
                                className="gap-2 bg-white/70"
                                onClick={openCreateQuoteModal}
                                disabled={!canManage || !canManageQuotes || lead.status === "Lost" || isCreatingQuote}
                            >
                                <Plus className="h-4 w-4" />
                                Create Quote
                            </Button>
                            <Button
                                className="gap-2"
                                onClick={() => {
                                    if (!canManage) {
                                        toast({
                                            title: "Insufficient permissions",
                                            description: "You can view leads but cannot edit them.",
                                            variant: "error"
                                        })
                                        return
                                    }
                                    setIsEditOpen(true)
                                }}
                                disabled={!canManage}
                            >
                                <Pencil className="h-4 w-4" /> Edit Lead
                            </Button>
                        </div>
                    </div>
                </div>
            </div>

            <div className="mb-6 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
                {[
                    { label: "Open Tasks", value: openTasks, icon: Clock, tone: "bg-amber-100 text-amber-700" },
                    { label: "Quotes", value: leadQuotes.length, icon: FileText, tone: "bg-pink-100 text-pink-700" },
                    { label: "Accepted", value: acceptedQuotes, icon: CheckCircle, tone: "bg-emerald-100 text-emerald-700" },
                    { label: "Quote Value", value: `£${quoteValue.toLocaleString(undefined, { minimumFractionDigits: 2 })}`, icon: Target, tone: "bg-primary/10 text-primary" },
                    { label: "Attachments", value: documents.length, icon: Paperclip, tone: "bg-slate-100 text-slate-700" },
                ].map((item) => (
                    <GlassCard key={item.label} className="bg-white/65 transition hover:-translate-y-0.5 hover:shadow-lg">
                        <GlassCardContent className="flex items-center gap-3 p-4">
                            <div className={`flex h-11 w-11 items-center justify-center rounded-2xl ${item.tone}`}>
                                <item.icon className="h-5 w-5" />
                            </div>
                            <div>
                                <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{item.label}</div>
                                <div className="text-xl font-bold text-foreground">{item.value}</div>
                            </div>
                        </GlassCardContent>
                    </GlassCard>
                ))}
            </div>

            <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-5">
                <TabsList variant="line" className="w-full overflow-x-auto justify-start rounded-2xl bg-white/60 p-1 shadow-sm">
                    <TabsTrigger value="overview">Overview</TabsTrigger>
                    <TabsTrigger value="tasks">Tasks ({leadTasks.length})</TabsTrigger>
                    <TabsTrigger value="quotes">Quotes ({leadQuotes.length})</TabsTrigger>
                    <TabsTrigger value="attachments">Attachments ({documents.length})</TabsTrigger>
                    <TabsTrigger value="activity">Activity ({activities.length})</TabsTrigger>
                </TabsList>

                <TabsContent value="overview" className="space-y-6">
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                        <GlassCard className="lg:col-span-1">
                            <GlassCardHeader>
                                <GlassCardTitle className="text-base">Contact Information</GlassCardTitle>
                            </GlassCardHeader>
                            <GlassCardContent className="space-y-4">
                                <div className="flex flex-col gap-1">
                                    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Email</span>
                                    <span className="text-sm flex items-center gap-2 text-foreground font-medium">
                                        <Mail className="h-4 w-4 text-primary" /> {lead.email}
                                    </span>
                                </div>
                                <div className="flex flex-col gap-1">
                                    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Phone</span>
                                    <span className="text-sm flex items-center gap-2 text-foreground font-medium">
                                        <Phone className="h-4 w-4 text-primary" /> {lead.phone || "N/A"}
                                    </span>
                                </div>
                                <div className="flex flex-col gap-1 border-t border-glass-border pt-4">
                                    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Lead Source</span>
                                    <span className="text-sm text-foreground">{lead.source}</span>
                                </div>
                                <div className="flex flex-col gap-1 border-t border-glass-border pt-4">
                                    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Assigned To</span>
                                    <span className="text-sm text-foreground">{lead.assignedUserName || "Unassigned"}</span>
                                </div>
                                <div className="flex flex-col gap-1 border-t border-glass-border pt-4">
                                    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Industry</span>
                                    <span className="text-sm text-foreground">{lead.industry || "N/A"}</span>
                                </div>
                                <div className="flex flex-col gap-1 border-t border-glass-border pt-4">
                                    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Tags</span>
                                    {Array.isArray(lead.tags) && lead.tags.length > 0 ? (
                                        <div className="flex flex-wrap gap-2">
                                            {lead.tags.map((tag) => (
                                                <Badge key={tag} variant="secondary" className="border border-glass-border bg-white/70">
                                                    {tag}
                                                </Badge>
                                            ))}
                                        </div>
                                    ) : (
                                        <span className="text-sm text-foreground">N/A</span>
                                    )}
                                </div>
                            </GlassCardContent>
                        </GlassCard>

                        <GlassCard className="lg:col-span-2">
                            <GlassCardHeader>
                                <GlassCardTitle className="text-base">Lead Snapshot</GlassCardTitle>
                            </GlassCardHeader>
                            <GlassCardContent className="space-y-4">
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                    <div className="rounded-lg border border-glass-border bg-white/40 p-3">
                                        <p className="text-xs uppercase tracking-wide text-muted-foreground">Status</p>
                                        <div className="mt-2"><StatusBadge status={formatLeadStatus(lead.status)} /></div>
                                    </div>
                                    <div className="rounded-lg border border-glass-border bg-white/40 p-3">
                                        <p className="text-xs uppercase tracking-wide text-muted-foreground">Open Tasks</p>
                                        <p className="mt-2 text-lg font-semibold text-foreground">
                                            {leadTasks.filter((task) => task.status !== "COMPLETED" && task.status !== "CANCELLED").length}
                                        </p>
                                    </div>
                                    <div className="rounded-lg border border-glass-border bg-white/40 p-3">
                                        <p className="text-xs uppercase tracking-wide text-muted-foreground">Quotes</p>
                                        <p className="mt-2 text-lg font-semibold text-foreground">{leadQuotes.length}</p>
                                    </div>
                                </div>
                                <div className="rounded-lg border border-glass-border bg-white/40 p-4">
                                    <p className="text-sm font-semibold text-foreground mb-1">Latest Activity</p>
                                    {latestActivity ? (
                                        <div className="text-sm text-muted-foreground">
                                            <p className="font-medium text-foreground">{latestActivity.type ?? "Activity"}</p>
                                            <p className="mt-1 whitespace-pre-wrap">{latestActivity.message ?? "No activity message saved."}</p>
                                        </div>
                                    ) : (
                                        <p className="text-sm text-muted-foreground">No activity recorded yet.</p>
                                    )}
                                </div>
                                <div className="rounded-lg border border-glass-border bg-white/40 p-4">
                                    <p className="text-sm font-semibold text-foreground mb-1">Notes</p>
                                    <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                                        {lead.company && lead.company !== "—" ? lead.company : "No lead notes available."}
                                    </p>
                                </div>
                            </GlassCardContent>
                        </GlassCard>
                    </div>
                </TabsContent>

                <TabsContent value="tasks" className="space-y-6">
                    <GlassCard>
                        <GlassCardHeader className="flex flex-row items-center justify-between pb-2">
                            <GlassCardTitle className="text-base">Task Assignments</GlassCardTitle>
                            <div className="flex items-center gap-2">
                                <Badge variant="secondary">{leadTasks.length}</Badge>
                                <div className="flex rounded-lg border border-glass-border bg-white/50 p-1">
                                    <Button
                                        size="sm"
                                        variant={taskView === "list" ? "default" : "ghost"}
                                        className="h-8 gap-1.5"
                                        onClick={() => setTaskView("list")}
                                    >
                                        <List className="h-4 w-4" />
                                        List
                                    </Button>
                                    <Button
                                        size="sm"
                                        variant={taskView === "kanban" ? "default" : "ghost"}
                                        className="h-8 gap-1.5"
                                        onClick={() => setTaskView("kanban")}
                                    >
                                        <LayoutGrid className="h-4 w-4" />
                                        Kanban
                                    </Button>
                                </div>
                                <Button
                                    size="sm"
                                    className="gap-2"
                                    onClick={() => {
                                        resetTaskForm()
                                        setIsTaskOpen(true)
                                    }}
                                    disabled={!canManage}
                                >
                                    <Plus className="h-4 w-4" />
                                    New Task
                                </Button>
                            </div>
                        </GlassCardHeader>
                        <GlassCardContent className="space-y-3">
                            {leadTasks.length === 0 ? (
                                <div className="py-6 text-center border border-dashed border-glass-border rounded-lg text-muted-foreground text-sm">
                                    No lead tasks assigned yet.
                                </div>
                            ) : taskView === "kanban" ? (
                                <div className="grid grid-cols-1 lg:grid-cols-4 gap-3">
                                    {orderedTaskColumns.map((column) => {
                                        const columnTasks = getTasksForStatus(column.value)
                                        return (
                                            <div
                                                key={column.value}
                                                className="min-h-[220px] rounded-xl border border-glass-border bg-white/30 p-3"
                                                onDragOver={(event) => {
                                                    if (canManage) event.preventDefault()
                                                }}
                                                onDrop={(event) => handleTaskDrop(event, column.value)}
                                            >
                                                <div
                                                    className="mb-3 flex cursor-grab items-center justify-between rounded-lg active:cursor-grabbing"
                                                    title="Drag to rearrange columns"
                                                    {...getColumnDragProps(column)}
                                                >
                                                    <h3 className="text-sm font-semibold text-foreground">{column.label}</h3>
                                                    <Badge variant="secondary">{columnTasks.length}</Badge>
                                                </div>
                                                <div className="space-y-3">
                                                    {columnTasks.length === 0 ? (
                                                        <div className="rounded-lg border border-dashed border-glass-border bg-white/40 p-4 text-center text-xs text-muted-foreground">
                                                            Drop tasks here
                                                        </div>
                                                    ) : (
                                                        columnTasks.map((task) => (
                                                            <div
                                                                key={task.id}
                                                                draggable={canManage}
                                                                onDragStart={(event) => {
                                                                    event.dataTransfer.setData("application/x-lead-task-id", task.id)
                                                                    event.dataTransfer.setData("text/plain", task.id)
                                                                    event.dataTransfer.effectAllowed = "move"
                                                                }}
                                                                className="rounded-lg border border-glass-border bg-white/75 p-3 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
                                                            >
                                                                <div className="flex items-start justify-between gap-2">
                                                                    <div className="min-w-0">
                                                                        <p className="text-sm font-semibold text-foreground line-clamp-2">{task.title}</p>
                                                                        <p className="mt-1 text-xs text-muted-foreground">
                                                                            {formatTaskType(task.taskType)}
                                                                        </p>
                                                                    </div>
                                                                    <Button
                                                                        size="icon"
                                                                        variant="ghost"
                                                                        className="h-8 w-8 shrink-0"
                                                                        onClick={() => openTaskEditor(task)}
                                                                        disabled={!canManage}
                                                                    >
                                                                        <Pencil className="h-4 w-4" />
                                                                    </Button>
                                                                </div>
                                                                <div className="mt-3 space-y-1 text-xs text-muted-foreground">
                                                                    <p>Assigned to {task.assignee?.fullName ?? "Unassigned"}</p>
                                                                    <p>{task.reminderAt ? `Reminder ${format(new Date(task.reminderAt), "MMM d, h:mm a")}` : "No reminder"}</p>
                                                                </div>
                                                            </div>
                                                        ))
                                                    )}
                                                </div>
                                            </div>
                                        )
                                    })}
                                </div>
                            ) : (
                                leadTasks.map((task) => (
                                    <div key={task.id} className="rounded-lg border border-glass-border bg-white/40 p-3">
                                        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
                                            <div className="min-w-0">
                                                <p className="text-sm font-semibold text-foreground truncate">{task.title}</p>
                                                <p className="text-xs text-muted-foreground mt-1">
                                                    {formatTaskType(task.taskType)} • Assigned to {task.assignee?.fullName ?? "Unassigned"}
                                                </p>
                                                <p className="text-xs text-muted-foreground mt-1">
                                                    {task.reminderAt ? `Reminder ${format(new Date(task.reminderAt), "MMM d, h:mm a")}` : "No reminder set"}
                                                </p>
                                                {task.description ? (
                                                    <p className="text-xs text-muted-foreground mt-1">{task.description}</p>
                                                ) : null}
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <StatusBadge status={formatTaskStatus(task.status)} />
                                                <Button
                                                    size="sm"
                                                    variant="ghost"
                                                    onClick={() => openTaskEditor(task)}
                                                    disabled={!canManage}
                                                >
                                                    <Pencil className="h-4 w-4" />
                                                </Button>
                                                <Button
                                                    size="sm"
                                                    variant="ghost"
                                                    className="text-destructive hover:text-destructive"
                                                    onClick={() => deleteLeadTask(task.id)}
                                                    disabled={!canManage}
                                                >
                                                    <Trash2 className="h-4 w-4" />
                                                </Button>
                                            </div>
                                        </div>
                                    </div>
                                ))
                            )}
                        </GlassCardContent>
                    </GlassCard>
                </TabsContent>

                <TabsContent value="quotes" className="space-y-6">
                    <GlassCard>
                        <GlassCardHeader className="flex flex-row items-center justify-between pb-2">
                            <GlassCardTitle className="text-base">Quotes for This Lead</GlassCardTitle>
                            <div className="flex items-center gap-2">
                                <Badge variant="secondary">{leadQuotes.length}</Badge>
                                <Button
                                    size="sm"
                                    className="gap-2"
                                    onClick={openCreateQuoteModal}
                                    disabled={!canManage || !canManageQuotes || lead.status === "Lost" || isCreatingQuote}
                                >
                                    <Plus className="h-4 w-4" />
                                    Create Quote
                                </Button>
                            </div>
                        </GlassCardHeader>
                        <GlassCardContent>
                            {leadQuotes.length === 0 ? (
                                <div className="flex flex-col items-center gap-3 py-8 text-center border border-dashed border-glass-border rounded-lg text-muted-foreground text-sm">
                                    <div>
                                        <p className="font-medium text-foreground">No quotes created from this lead yet.</p>
                                        <p className="mt-1 text-xs text-muted-foreground">Create a quote directly from this lead and send it to the customer.</p>
                                    </div>
                                    <Button
                                        size="sm"
                                        className="gap-2"
                                        onClick={openCreateQuoteModal}
                                        disabled={!canManage || !canManageQuotes || lead.status === "Lost" || isCreatingQuote}
                                    >
                                        <Plus className="h-4 w-4" />
                                        Create Quote
                                    </Button>
                                </div>
                            ) : (
                                <div className="space-y-2">
                                    {leadQuotes.map((quote) => {
                                        const rawStatusLabel = getWorkflowStatusLabel(
                                            "quotes",
                                            quote.status,
                                            quote.workflowStageKey,
                                            workflowConfig,
                                            complianceWorkflows
                                        )
                                        const statusLabel = String(quote.status).toUpperCase() === "SIGNED" && rawStatusLabel === "Signed"
                                            ? "Accepted"
                                            : rawStatusLabel
                                        return (
                                            <div
                                                key={quote.id}
                                                className="rounded-lg border border-glass-border bg-white/40 p-3 flex items-center justify-between gap-3"
                                            >
                                                <div className="min-w-0">
                                                    <p className="text-sm font-semibold text-foreground truncate">
                                                        {quote.quoteNumber ?? `QT-${quote.id.slice(0, 6)}`}
                                                    </p>
                                                    <p className="text-xs text-muted-foreground truncate mt-0.5">{quote.title}</p>
                                                    <p className="text-[11px] text-muted-foreground mt-1">
                                                        {quote.createdAt ? format(new Date(quote.createdAt), "MMM d, yyyy h:mm a") : "—"}
                                                    </p>
                                                </div>
                                                <div className="flex items-center gap-2 shrink-0">
                                                    <StatusBadge status={formatQuoteStatus(quote.status)}>
                                                        {statusLabel}
                                                    </StatusBadge>
                                                    <span className="text-xs font-semibold text-foreground">
                                                        £{Number(quote.total ?? 0).toFixed(2)}
                                                    </span>
                                                    <Button variant="outline" size="sm" asChild className="bg-white/60 gap-1">
                                                        <Link href={`/admin/quotes/${quote.id}`}>
                                                            <FileText className="h-3.5 w-3.5" />
                                                            Open
                                                        </Link>
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

                <TabsContent value="attachments" className="space-y-6">
                    <GlassCard>
                        <GlassCardHeader>
                            <GlassCardTitle className="text-base">Lead Attachments</GlassCardTitle>
                        </GlassCardHeader>
                        <GlassCardContent className="space-y-4">
                            <button
                                type="button"
                                className="w-full rounded-xl border border-dashed border-glass-border bg-white/40 hover:bg-white/55 transition-colors p-6 text-left"
                                onClick={() => {
                                    if (!canManage) {
                                        toast({
                                            title: "Insufficient permissions",
                                            description: "You can view documents but cannot upload.",
                                            variant: "error",
                                        })
                                        return
                                    }
                                    setIsUploadOpen(true)
                                }}
                                disabled={!canManage}
                            >
                                <div className="flex items-center gap-3">
                                    <span className="h-10 w-10 rounded-lg bg-white/80 border border-glass-border flex items-center justify-center">
                                        <UploadCloud className="h-5 w-5 text-primary" />
                                    </span>
                                    <div className="flex flex-col">
                                        <span className="text-sm font-semibold text-foreground">Upload Document</span>
                                        <span className="text-xs text-muted-foreground">Click to add files for this lead.</span>
                                    </div>
                                </div>
                            </button>

                            {documents.length === 0 ? (
                                <div className="text-sm text-muted-foreground">No attachments yet.</div>
                            ) : (
                                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                                    {documents.map((doc) => {
                                        const imageFile = isImageFile(doc.fileUrl, doc.name)
                                        const extension = getFileExtension(doc.fileUrl, doc.name).toUpperCase() || "FILE"
                                        const previewLabel = getPreviewDocumentLabel(doc)
                                        return (
                                            <div key={doc.id} className="rounded-xl border border-glass-border bg-white/40 p-3 space-y-3">
                                                <a
                                                    href={doc.fileUrl}
                                                    target="_blank"
                                                    rel="noreferrer"
                                                    className="block rounded-lg overflow-hidden border border-glass-border bg-white/70"
                                                >
                                                    {imageFile ? (
                                                        <img
                                                            src={doc.fileUrl}
                                                            alt={previewLabel}
                                                            className="h-36 w-full object-cover"
                                                        />
                                                    ) : (
                                                        <div className="h-36 w-full flex flex-col items-center justify-center gap-2 px-3 text-muted-foreground">
                                                            <FileText className="h-8 w-8" />
                                                            <span className="text-xs font-semibold tracking-wide text-center break-all">{previewLabel || extension}</span>
                                                        </div>
                                                    )}
                                                </a>
                                                <div className="flex items-center justify-center gap-2">
                                                    <StatusBadge status={formatSyncStatus(doc.syncStatus)} className="text-[11px]" />
                                                    <Button variant="outline" size="icon" asChild className="bg-white/60 h-8 w-8">
                                                        <a href={doc.fileUrl} target="_blank" rel="noreferrer">
                                                            <ExternalLink className="h-4 w-4" />
                                                        </a>
                                                    </Button>
                                                    <Button
                                                        variant="outline"
                                                        size="icon"
                                                        className="bg-white/60 text-destructive h-8 w-8"
                                                        onClick={() => {
                                                            if (!canManage) {
                                                                toast({
                                                                    title: "Insufficient permissions",
                                                                    description: "You can view documents but cannot delete them.",
                                                                    variant: "error",
                                                                })
                                                                return
                                                            }
                                                            setDeleteDocId(doc.id)
                                                            setIsDeleteDocOpen(true)
                                                        }}
                                                        disabled={!canManage}
                                                    >
                                                        <Trash2 className="h-4 w-4" />
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

                <TabsContent value="activity" className="space-y-6">
                    <GlassPanel>
                        <h3 className="text-lg font-semibold mb-4">Internal Notes</h3>
                        <div className="bg-white/60 border border-glass-border rounded-xl p-4 mb-4 focus-within:ring-1 focus-within:ring-primary focus-within:border-primary transition-all">
                            <textarea
                                className="w-full bg-transparent border-none outline-none resize-none text-sm placeholder:text-muted-foreground min-h-[80px]"
                                placeholder="Log a call, summarize a meeting, or leave a note..."
                                value={noteMessage}
                                onChange={(e) => setNoteMessage(e.target.value)}
                            />
                            <div className="flex justify-between items-center mt-2 border-t border-glass-border/50 pt-2">
                                <div className="flex gap-2">
                                    <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-primary"><Phone className="h-4 w-4" /></Button>
                                    <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-primary"><Mail className="h-4 w-4" /></Button>
                                </div>
                                <Button
                                    size="sm"
                                    onClick={async () => {
                                        if (!noteMessage.trim()) {
                                            setNoteError("Please enter a note before saving.")
                                            return
                                        }
                                        setNoteError(null)
                                        try {
                                            const res = await apiPost<any>(`/leads/${lead.id}/activities`, {
                                                type: "Note",
                                                message: noteMessage.trim()
                                            })
                                            setActivities((prev) => [res.data, ...prev])
                                            setNoteMessage("")
                                            toast({
                                                title: "Note Saved",
                                                description: "Your note was added.",
                                                variant: "success"
                                            })
                                        } catch (err: any) {
                                            toast({
                                                title: "Save Failed",
                                                description: err?.message ?? "Failed to save note.",
                                                variant: "error"
                                            })
                                        }
                                    }}
                                >
                                    Save Note
                                </Button>
                            </div>
                            {noteError && <p className="text-xs text-destructive mt-2">{noteError}</p>}
                        </div>

                        <h3 className="text-lg font-semibold mb-4 mt-8">Activity Timeline</h3>
                        <div className="flex flex-col md:flex-row gap-2 mb-4">
                            <select
                                className="h-9 rounded-md border border-input bg-white/50 px-3 text-sm"
                                value={activityType}
                                onChange={(e) => setActivityType(e.target.value)}
                            >
                                <option value="Note">Note</option>
                                <option value="Call">Call</option>
                                <option value="Email">Email</option>
                                <option value="Status Change">Status Change</option>
                                <option value="Task">Task</option>
                            </select>
                            <Input
                                placeholder="Add an activity..."
                                className="bg-white/50"
                                value={activityMessage}
                                onChange={(e) => setActivityMessage(e.target.value)}
                            />
                            <Button
                                onClick={async () => {
                                    if (!activityMessage.trim()) {
                                        setActivityError("Please enter an activity message.")
                                        return
                                    }
                                    setActivityError(null)
                                    try {
                                        const res = await apiPost<any>(`/leads/${lead.id}/activities`, {
                                            type: activityType,
                                            message: activityMessage.trim()
                                        })
                                        setActivities((prev) => [res.data, ...prev])
                                        setActivityMessage("")
                                        toast({
                                            title: "Activity Added",
                                            description: "Activity added to timeline.",
                                            variant: "success"
                                        })
                                    } catch (err: any) {
                                        toast({
                                            title: "Activity Failed",
                                            description: err?.message ?? "Failed to add activity.",
                                            variant: "error"
                                        })
                                    }
                                }}
                            >
                                Add
                            </Button>
                        </div>
                        {activityError && <p className="text-xs text-destructive">{activityError}</p>}
                        <div className="space-y-4 relative before:absolute before:inset-0 before:ml-4 before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-glass-border before:to-transparent">
                            {activities.length === 0 ? (
                                <div className="text-sm text-muted-foreground">No activity yet.</div>
                            ) : (
                                activities.map((activity, idx) => (
                                    <div key={activity.id ?? idx} className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group">
                                        <div className="flex items-center justify-center w-8 h-8 rounded-full bg-secondary text-primary-dark border-4 border-background shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 shadow-sm z-10">
                                            <Clock className="w-3.5 h-3.5" />
                                        </div>
                                        <div className="w-[calc(100%-3rem)] md:w-[calc(50%-2rem)] p-4 rounded-xl border border-glass-border bg-white/40">
                                            <div className="flex items-center justify-between mb-1">
                                                <div className="flex flex-col">
                                                    <span className="font-semibold text-sm">{activity.type}</span>
                                                    <span className="text-[11px] text-muted-foreground">
                                                        by {activity.actorName ?? (activity.userId ? "Unknown User" : "Automated")}
                                                    </span>
                                                </div>
                                                <span className="text-xs text-muted-foreground">{format(new Date(activity.createdAt ?? Date.now()), 'MMM d, h:mm a')}</span>
                                            </div>
                                            <p className="text-sm text-muted-foreground line-clamp-2">{activity.message}</p>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </GlassPanel>
                </TabsContent>
            </Tabs>
            <GlassModal
                open={isTaskOpen}
                onOpenChange={(open) => {
                    setIsTaskOpen(open)
                    if (!open) {
                        resetTaskForm()
                    }
                }}
                title="Assign New Task"
                description="Create a follow-up task and assign it to a workspace member."
                className="overflow-visible"
                footer={
                    <div className="flex justify-end gap-2 w-full">
                        <Button variant="outline" onClick={() => setIsTaskOpen(false)}>
                            Cancel
                        </Button>
                        <Button onClick={createLeadTask} disabled={!canManage}>
                            Create Task
                        </Button>
                    </div>
                }
            >
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                            <Label required>Task Title</Label>
                            <Input
                                className={`bg-white/50 ${taskFormErrors.title ? "border-destructive focus-visible:ring-destructive/50" : ""}`}
                                value={taskForm.title}
                                onChange={(e) => setTaskForm((prev) => ({ ...prev, title: e.target.value }))}
                                placeholder="e.g. Collect compliance documents"
                            />
                            {taskFormErrors.title && <p className="text-xs text-destructive">{taskFormErrors.title}</p>}
                        </div>
                    <div className="space-y-2">
                            <Label required>Task Type</Label>
                            <Select
                                value={taskForm.taskType}
                                onValueChange={(value) => setTaskForm((prev) => ({ ...prev, taskType: value }))}
                            >
                                <SelectTrigger className="w-full bg-white/50">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="FOLLOW_UP">Follow Up</SelectItem>
                                    <SelectItem value="QUOTE">Quote</SelectItem>
                                    <SelectItem value="DOCUMENTS">Documents</SelectItem>
                                    <SelectItem value="CALL">Call</SelectItem>
                                    <SelectItem value="EMAIL">Email</SelectItem>
                                    <SelectItem value="GENERAL">General</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    <div className="space-y-2">
                            <Label required>Assign To</Label>
                            <Select
                                value={taskForm.assigneeUserId || "unassigned"}
                                createOption={{ label: "employee", href: "/admin/team?create=employee" }}
                                onValueChange={(value) =>
                                    setTaskForm((prev) => ({
                                        ...prev,
                                        assigneeUserId: value === "unassigned" ? "" : value,
                                    }))
                                }
                            >
                                <SelectTrigger className={`w-full bg-white/50 ${taskFormErrors.assigneeUserId ? "border-destructive focus-visible:ring-destructive/50" : ""}`}>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="unassigned">Select assignee</SelectItem>
                                    {assignableUsers.map((user) => (
                                        <SelectItem key={user.id} value={user.id}>
                                            {user.fullName}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            {taskFormErrors.assigneeUserId && <p className="text-xs text-destructive">{taskFormErrors.assigneeUserId}</p>}
                        </div>
                    <div className="space-y-2">
                            <Label optional>Reminder</Label>
                            <DatePicker
                                selected={taskForm.reminderAt}
                                onChange={(date: Date | null) => {
                                    if (!isFutureReminderDate(date)) {
                                        setTaskFormErrors((prev) => ({ ...prev, reminderAt: "Reminder must be a future date and time." }))
                                        return
                                    }
                                    setTaskFormErrors((prev) => ({ ...prev, reminderAt: undefined }))
                                    setTaskForm((prev) => ({ ...prev, reminderAt: date }))
                                }}
                                showTimeSelect
                                timeFormat="HH:mm"
                                timeIntervals={15}
                                minDate={new Date()}
                                filterTime={(time) => isSelectableReminderTime(taskForm.reminderAt, time)}
                                dateFormat="MMM d, yyyy h:mm aa"
                                className="h-9 w-full rounded-md border border-input bg-white/50 px-3 text-sm shadow-sm"
                                placeholderText="Set reminder"
                                popperClassName="z-[10000]"
                                popperPlacement="bottom-start"
                            />
                            {taskFormErrors.reminderAt && <p className="text-xs text-destructive">{taskFormErrors.reminderAt}</p>}
                        </div>
                    <div className="space-y-2 md:col-span-2">
                        <Label optional>Description</Label>
                        <Textarea
                            rows={3}
                            className="bg-white/50 resize-none"
                            placeholder="Add context for the assigned task..."
                            value={taskForm.description}
                            onChange={(e) => setTaskForm((prev) => ({ ...prev, description: e.target.value }))}
                        />
                    </div>
                    {taskError && <p className="text-xs text-destructive md:col-span-2">{taskError}</p>}
                </div>
            </GlassModal>
            <GlassModal
                open={Boolean(editingTask)}
                onOpenChange={(open) => {
                    if (!open) closeTaskEditor()
                }}
                title="Edit Task"
                description="Update task details from one consistent place."
                className="overflow-visible"
                footer={
                    <div className="flex justify-end gap-2 w-full">
                        <Button variant="outline" onClick={closeTaskEditor}>
                            Cancel
                        </Button>
                        <Button onClick={saveTaskEdit} disabled={!canManage}>
                            Save Changes
                        </Button>
                    </div>
                }
            >
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                        <Label required>Task Title</Label>
                        <Input
                            className={`bg-white/50 ${editTaskFormErrors.title ? "border-destructive focus-visible:ring-destructive/50" : ""}`}
                            value={editTaskForm.title}
                            onChange={(e) => setEditTaskForm((prev) => ({ ...prev, title: e.target.value }))}
                            placeholder="e.g. Collect compliance documents"
                        />
                        {editTaskFormErrors.title && <p className="text-xs text-destructive">{editTaskFormErrors.title}</p>}
                    </div>
                    <div className="space-y-2">
                        <Label required>Task Type</Label>
                        <Select
                            value={editTaskForm.taskType}
                            onValueChange={(value) => setEditTaskForm((prev) => ({ ...prev, taskType: value }))}
                        >
                            <SelectTrigger className="w-full bg-white/50">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="FOLLOW_UP">Follow Up</SelectItem>
                                <SelectItem value="QUOTE">Quote</SelectItem>
                                <SelectItem value="DOCUMENTS">Documents</SelectItem>
                                <SelectItem value="CALL">Call</SelectItem>
                                <SelectItem value="EMAIL">Email</SelectItem>
                                <SelectItem value="GENERAL">General</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="space-y-2">
                        <Label optional>Assign To</Label>
                        <Select
                            value={editTaskForm.assigneeUserId || "unassigned"}
                            createOption={{ label: "employee", href: "/admin/team?create=employee" }}
                            onValueChange={(value) =>
                                setEditTaskForm((prev) => ({
                                    ...prev,
                                    assigneeUserId: value === "unassigned" ? "" : value,
                                }))
                            }
                        >
                            <SelectTrigger className="w-full bg-white/50">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="unassigned">Unassigned</SelectItem>
                                {assignableUsers.map((user) => (
                                    <SelectItem key={user.id} value={user.id}>
                                        {user.fullName}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="space-y-2">
                        <Label required>Status</Label>
                        <Select
                            value={editTaskForm.status}
                            onValueChange={(value) => setEditTaskForm((prev) => ({ ...prev, status: value }))}
                        >
                            <SelectTrigger className="w-full bg-white/50">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {TASK_STATUS_COLUMNS.map((column) => (
                                    <SelectItem key={column.value} value={column.value}>
                                        {column.label}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="space-y-2">
                        <Label optional>Reminder</Label>
                        <DatePicker
                            selected={editTaskForm.reminderAt}
                            onChange={(date: Date | null) => {
                                if (!isFutureReminderDate(date)) {
                                    setEditTaskFormErrors((prev) => ({ ...prev, reminderAt: "Reminder must be a future date and time." }))
                                    return
                                }
                                setEditTaskFormErrors((prev) => ({ ...prev, reminderAt: undefined }))
                                setEditTaskForm((prev) => ({ ...prev, reminderAt: date }))
                            }}
                            showTimeSelect
                            timeFormat="HH:mm"
                            timeIntervals={15}
                            minDate={new Date()}
                            filterTime={(time) => isSelectableReminderTime(editTaskForm.reminderAt, time)}
                            dateFormat="MMM d, yyyy h:mm aa"
                            className="h-9 w-full rounded-md border border-input bg-white/50 px-3 text-sm shadow-sm"
                            placeholderText="Set reminder"
                            popperClassName="z-[10000]"
                            popperPlacement="bottom-start"
                        />
                        {editTaskFormErrors.reminderAt && <p className="text-xs text-destructive">{editTaskFormErrors.reminderAt}</p>}
                    </div>
                    <div className="space-y-2 md:col-span-2">
                        <Label optional>Description</Label>
                        <Textarea
                            rows={3}
                            className="bg-white/50 resize-none"
                            placeholder="Add context for the assigned task..."
                            value={editTaskForm.description}
                            onChange={(e) => setEditTaskForm((prev) => ({ ...prev, description: e.target.value }))}
                        />
                    </div>
                    {editTaskError && <p className="text-xs text-destructive md:col-span-2">{editTaskError}</p>}
                </div>
            </GlassModal>
            <GlassModal
                open={isCreateQuoteOpen}
                onOpenChange={setIsCreateQuoteOpen}
                title="Create Quote"
                description="Prepare line items and send this quote to the lead email."
                footer={
                    <div className="flex justify-end gap-2 w-full">
                        <Button variant="outline" onClick={() => setIsCreateQuoteOpen(false)}>Cancel</Button>
                        <Button
                            onClick={async () => {
                                if (!canManage || !canManageQuotes) {
                                    toast({
                                        title: "Insufficient permissions",
                                        description: "You can view leads but cannot send quotes.",
                                        variant: "error"
                                    })
                                    return
                                }

                                const nextErrors: { projectName?: string; items?: string } = {}
                                const nextItemErrors: Record<string, { description?: string; quantity?: string; unitPrice?: string }> = {}
                                if (!createQuoteForm.projectName.trim()) nextErrors.projectName = "Project name is required."
                                if (createQuoteItems.length === 0) nextErrors.items = "Add at least one line item."
                                createQuoteItems.forEach((item) => {
                                    const itemError: { description?: string; quantity?: string; unitPrice?: string } = {}
                                    if (!item.description.trim()) itemError.description = "Description required."
                                    if (!item.quantity || Number(item.quantity) <= 0) itemError.quantity = "Qty must be > 0."
                                    if (Number(item.unitPrice) < 0) itemError.unitPrice = "Price must be >= 0."
                                    if (Object.keys(itemError).length > 0) {
                                        nextItemErrors[item.id] = itemError
                                    }
                                })
                                setCreateQuoteErrors(nextErrors)
                                setCreateQuoteItemErrors(nextItemErrors)
                                if (Object.keys(nextErrors).length > 0 || Object.keys(nextItemErrors).length > 0) return

                                const totals = calcQuoteTotals(createQuoteItems)
                                try {
                                    setIsCreatingQuote(true)
                                    const response = await apiPost<any>(`/leads/${lead.id}/create-quote`, {
                                        customerId: createQuoteForm.customerId || undefined,
                                        siteId: createQuoteForm.siteId || undefined,
                                        title: createQuoteForm.projectName.trim(),
                                        validUntil: createQuoteForm.validUntil ? createQuoteForm.validUntil.toISOString() : undefined,
                                        notes: createQuoteForm.notes.trim() || undefined,
                                        termsAndConditions: createQuoteForm.terms.trim() || undefined,
                                        lineItems: createQuoteItems.map((item) => ({
                                            description: item.description.trim(),
                                            quantity: Number(item.quantity),
                                            unitPrice: Number(item.unitPrice),
                                            vatRate: Number(item.taxRate),
                                        })),
                                        total: totals.total,
                                        sendNow: true,
                                    })
                                    const createdQuote = response?.data?.quote
                                    const createdQuoteId = createdQuote?.id
                                    if (!createdQuoteId) {
                                        throw new Error("Quote sent but id missing.")
                                    }
                                    setLeadQuotes((prev) => ([
                                        {
                                            id: createdQuoteId,
                                            quoteNumber: createdQuote.quoteNumber,
                                            title: createdQuote.title,
                                            status: createdQuote.status,
                                            total: createdQuote.total,
                                            createdAt: createdQuote.createdAt,
                                        },
                                        ...prev,
                                    ]))
                                    toast({
                                        title: "Quote Sent",
                                        description: "Quote sent to lead email successfully.",
                                        variant: "success"
                                    })
                                    setIsCreateQuoteOpen(false)
                                    router.push(`/admin/quotes/${createdQuoteId}`)
                                } catch (err: any) {
                                    toast({
                                        title: "Quote Send Failed",
                                        description: err?.message ?? "Failed to create and send quote.",
                                        variant: "error"
                                    })
                                } finally {
                                    setIsCreatingQuote(false)
                                }
                            }}
                            disabled={!canManage || !canManageQuotes || isCreatingQuote}
                        >
                            {isCreatingQuote ? "Sending..." : "Send Quote"}
                        </Button>
                    </div>
                }
            >
                <div className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label optional>Customer</Label>
                            <Select
                                value={createQuoteForm.customerId || "__none__"}
                                createOption={{
                                    label: "customer",
                                    href: "/admin/customers?create=customer",
                                    onCreated: (created) => {
                                        const customer = created as any
                                        if (!customer?.id) return
                                        setCustomers((prev) => [customer, ...prev.filter((item) => item.id !== customer.id)])
                                        setCreateQuoteForm((prev) => ({ ...prev, customerId: customer.id, siteId: "" }))
                                    },
                                }}
                                onValueChange={(value) => setCreateQuoteForm((prev) => ({ ...prev, customerId: value === "__none__" ? "" : value, siteId: "" }))}
                            >
                                <SelectTrigger className="w-full bg-white/60">
                                    <SelectValue placeholder="Select customer" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="__none__">No linked customer</SelectItem>
                                    {customers.map((customer) => (
                                        <SelectItem key={customer.id} value={customer.id}>{customer.name}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        {sitesEnabled ? <div className="space-y-2">
                            <Label optional>Customer Site</Label>
                            <Select
                                value={createQuoteForm.siteId || "__none__"}
                                createOption={createQuoteForm.customerId ? {
                                    label: "site",
                                    href: `/admin/customers/${createQuoteForm.customerId}?create=site`,
                                    onCreated: (created) => {
                                        const site = created as CustomerSiteOption
                                        if (!site?.id) return
                                        setQuoteCustomerSites((prev) => [site, ...prev.filter((item) => item.id !== site.id)])
                                        setCreateQuoteForm((prev) => ({ ...prev, siteId: site.id }))
                                    },
                                } : undefined}
                                onValueChange={(value) => setCreateQuoteForm((prev) => ({ ...prev, siteId: value === "__none__" ? "" : value }))}
                                disabled={!createQuoteForm.customerId}
                            >
                                <SelectTrigger className="w-full bg-white/60">
                                    <SelectValue placeholder={createQuoteForm.customerId ? "Select site (optional)" : "Select customer first"} />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="__none__">No linked site</SelectItem>
                                    {quoteCustomerSites.map((site) => (
                                        <SelectItem key={site.id} value={site.id}>{formatCustomerSiteLabel(site)}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            <p className="text-xs text-muted-foreground">
                                {createQuoteForm.siteId
                                    ? formatCustomerSiteAddress(quoteCustomerSites.find((site) => site.id === createQuoteForm.siteId)) || "No address saved for this site."
                                    : "Optional, but recommended when the quote belongs to a specific site."}
                            </p>
                        </div> : null}
                        <div className="space-y-2">
                            <Label required>Project Name</Label>
                            <Input
                                className={createQuoteErrors.projectName ? "border-destructive focus-visible:ring-destructive/50" : ""}
                                value={createQuoteForm.projectName}
                                onChange={(e) => setCreateQuoteForm((prev) => ({ ...prev, projectName: e.target.value }))}
                            />
                            {createQuoteErrors.projectName && <p className="text-xs text-destructive">{createQuoteErrors.projectName}</p>}
                        </div>
                        <div className="space-y-2">
                            <Label optional>Valid Until</Label>
                            <DatePicker
                                selected={createQuoteForm.validUntil}
                                onChange={(date: Date | null) => setCreateQuoteForm((prev) => ({ ...prev, validUntil: date }))}
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
                        {createQuoteItems.map((item) => (
                            <div key={item.id} className="grid grid-cols-1 md:grid-cols-12 gap-4 items-start md:items-center bg-white/30 p-3 rounded-lg border border-glass-border">
                                <div className="md:col-span-6 space-y-1">
                                    <Label required className="md:hidden text-xs text-muted-foreground">Description</Label>
                                    <Input
                                        placeholder="Item description..."
                                        className={`bg-white/60 h-9 ${createQuoteItemErrors[item.id]?.description ? "border-destructive focus-visible:ring-destructive/50" : ""}`}
                                        value={item.description}
                                        onChange={(e) =>
                                            setCreateQuoteItems((prev) =>
                                                prev.map((lineItem) =>
                                                    lineItem.id === item.id ? { ...lineItem, description: e.target.value } : lineItem,
                                                ),
                                            )
                                        }
                                    />
                                    {createQuoteItemErrors[item.id]?.description && <p className="text-xs text-destructive">{createQuoteItemErrors[item.id]?.description}</p>}
                                </div>
                                <div className="grid grid-cols-3 md:col-span-5 gap-4">
                                    <div className="space-y-1">
                                        <Label required className="md:hidden text-xs text-muted-foreground">Qty</Label>
                                        <Input
                                            type="number"
                                            min="1"
                                            className={`bg-white/60 h-9 text-center ${createQuoteItemErrors[item.id]?.quantity ? "border-destructive focus-visible:ring-destructive/50" : ""}`}
                                            value={item.quantity}
                                            onChange={(e) =>
                                                setCreateQuoteItems((prev) =>
                                                    prev.map((lineItem) =>
                                                        lineItem.id === item.id
                                                            ? { ...lineItem, quantity: parseInt(e.target.value || "0", 10) || 0 }
                                                            : lineItem,
                                                    ),
                                                )
                                            }
                                        />
                                        {createQuoteItemErrors[item.id]?.quantity && <p className="text-xs text-destructive">{createQuoteItemErrors[item.id]?.quantity}</p>}
                                    </div>
                                    <div className="space-y-1 col-span-2">
                                        <Label required className="md:hidden text-xs text-muted-foreground">Unit Price</Label>
                                        <Input
                                            type="number"
                                            min="0"
                                            step="0.01"
                                            className={`bg-white/60 h-9 text-right ${createQuoteItemErrors[item.id]?.unitPrice ? "border-destructive focus-visible:ring-destructive/50" : ""}`}
                                            value={item.unitPrice}
                                            onChange={(e) =>
                                                setCreateQuoteItems((prev) =>
                                                    prev.map((lineItem) =>
                                                        lineItem.id === item.id
                                                            ? { ...lineItem, unitPrice: parseFloat(e.target.value || "0") || 0 }
                                                            : lineItem,
                                                    ),
                                                )
                                            }
                                        />
                                        {createQuoteItemErrors[item.id]?.unitPrice && <p className="text-xs text-destructive">{createQuoteItemErrors[item.id]?.unitPrice}</p>}
                                    </div>
                                </div>
                                <div className="md:col-span-1 flex justify-end md:justify-center">
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        onClick={() => setCreateQuoteItems((prev) => prev.filter((lineItem) => lineItem.id !== item.id))}
                                        disabled={createQuoteItems.length === 1}
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
                            onClick={() =>
                                setCreateQuoteItems((prev) => [
                                    ...prev,
                                    { id: Math.random().toString(), description: "", quantity: 1, unitPrice: 0, taxRate: 20 },
                                ])
                            }
                        >
                            <Plus className="h-4 w-4" /> Add Line Item
                        </Button>
                        {createQuoteErrors.items && <p className="text-xs text-destructive">{createQuoteErrors.items}</p>}
                    </div>

                    <div className="space-y-4">
                        <div className="space-y-2">
                            <Label optional>Notes</Label>
                            <Textarea
                                rows={3}
                                className="w-full bg-white/60 resize-none"
                                value={createQuoteForm.notes}
                                onChange={(e) => setCreateQuoteForm((prev) => ({ ...prev, notes: e.target.value }))}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label optional>Terms</Label>
                            <Textarea
                                rows={3}
                                className="w-full bg-white/60 resize-none"
                                value={createQuoteForm.terms}
                                onChange={(e) => setCreateQuoteForm((prev) => ({ ...prev, terms: e.target.value }))}
                            />
                        </div>
                    </div>
                </div>
            </GlassModal>

            <LeadFormDialog
                open={isEditOpen}
                onOpenChange={setIsEditOpen}
                mode="edit"
                assignableUsers={assignableUsers}
                currentUser={currentUser}
                industryOptions={industryOptions}
                initialValues={{
                    name: lead.name,
                    email: lead.email,
                    phone: lead.phone ?? "",
                    company: lead.company ?? "",
                    source: lead.source ?? "Other",
                    status: toApiLeadStatus(lead.status),
                    industry: lead.industry ?? "",
                    tags: Array.isArray(lead.tags) ? lead.tags : [],
                    assignedUserId: lead.assignedUserId ?? null
                }}
                onCreateIndustry={createIndustryOption}
                onSubmit={updateLead}
            />

            <GlassModal
                open={isUploadOpen}
                onOpenChange={setIsUploadOpen}
                title="Upload Document"
                description="Attach a document to this lead."
                footer={
                    <div className="flex justify-end gap-2 w-full">
                        <Button variant="outline" onClick={() => setIsUploadOpen(false)}>Cancel</Button>
                        <Button
                            onClick={async () => {
                                if (!canManage) {
                                    toast({
                                        title: "Insufficient permissions",
                                        description: "You can view leads but cannot upload documents.",
                                        variant: "error"
                                    })
                                    return
                                }
                                const nextErrors: { name?: string; file?: string } = {}
                                if (!uploadForm.name.trim()) {
                                    nextErrors.name = "Please enter a document name."
                                }
                                if (!uploadForm.file) {
                                    nextErrors.file = "Please select a file."
                                }
                                setUploadErrors(nextErrors)
                                if (Object.keys(nextErrors).length > 0) {
                                    return
                                }
                                try {
                                    const formData = new FormData()
                                    formData.append("file", uploadForm.file as File)
                                    formData.append("name", uploadForm.name.trim())
                                    const response = await uploadWithProgress<any>(`/leads/${lead.id}/attachments`, formData)
                                    const created = response.data
                                    setDocuments((prev) => [
                                        ...prev,
                                        {
                                            id: created.id,
                                            name: created.name,
                                            fileUrl: created.fileUrl,
                                            category: created.category,
                                            status: created.status,
                                            syncStatus: created.syncStatus,
                                            relatedEntityType: created.relatedEntityType,
                                            relatedEntityId: created.relatedEntityId
                                        }
                                    ])
                                    setUploadForm({ name: "", file: null })
                                    setUploadErrors({})
                                    setIsUploadOpen(false)
                                    toast({
                                        title: "Uploaded",
                                        description: "Document attached to lead.",
                                        variant: "success"
                                    })
                                } catch (err: any) {
                                    toast({
                                        title: "Upload Failed",
                                        description: err?.message ?? "Failed to upload document.",
                                        variant: "error"
                                    })
                                }
                            }}
                        disabled={!canManage}>
                            Upload
                        </Button>
                    </div>
                }
            >
                        <div className="space-y-4">
                            <div className="space-y-2">
                                <Label required>Document Name</Label>
                                <Input
                                    className={`bg-white/50 ${uploadErrors.name ? "border-destructive focus-visible:ring-destructive/50" : ""}`}
                                    value={uploadForm.name}
                                    onChange={(e) => setUploadForm((prev) => ({ ...prev, name: e.target.value }))}
                                />
                                {uploadErrors.name && <p className="text-xs text-destructive">{uploadErrors.name}</p>}
                            </div>
                            <div className="space-y-2">
                                <Label required>File</Label>
                                <Input
                                    type="file"
                                    className={`bg-white/50 ${uploadErrors.file ? "border-destructive focus-visible:ring-destructive/50" : ""}`}
                                    onChange={(e) => setUploadForm((prev) => ({ ...prev, file: e.target.files?.[0] ?? null }))}
                                />
                                {uploadErrors.file && <p className="text-xs text-destructive">{uploadErrors.file}</p>}
                            </div>
                </div>
            </GlassModal>

            <GlassModal
                open={isConvertOpen}
                onOpenChange={setIsConvertOpen}
                title="Convert Lead to Job"
                description="Provide job details to convert this lead."
                footer={
                    <div className="flex justify-end gap-2 w-full">
                        <Button variant="outline" onClick={() => setIsConvertOpen(false)}>Cancel</Button>
                        <Button
                            onClick={async () => {
                                if (!canManage) {
                                    toast({
                                        title: "Insufficient permissions",
                                        description: "You can view leads but cannot convert them.",
                                        variant: "error"
                                    })
                                    return
                                }
                                const nextErrors: { customerId?: string; siteId?: string; location?: string; amount?: string; scheduledAt?: string; scheduledEndAt?: string } = {}
                                if (!convertForm.customerId) {
                                    nextErrors.customerId = "Please select a customer."
                                }
                                if (sitesEnabled && !convertForm.siteId) {
                                    nextErrors.siteId = "Please select a customer site."
                                }
                                const formattedJobAddress = formatJobAddressForPayload(convertForm.address)
                                if (!sitesEnabled && !formattedJobAddress) {
                                    nextErrors.location = "Job location is required."
                                }
                                if (!convertForm.amount.trim()) {
                                    nextErrors.amount = "Job amount is required."
                                } else if (!Number.isFinite(Number(convertForm.amount)) || Number(convertForm.amount) < 0) {
                                    nextErrors.amount = "Enter a valid amount greater than or equal to 0."
                                }
                                if (!convertForm.scheduledAt) {
                                    nextErrors.scheduledAt = "Start time is required."
                                }
                                if (!convertForm.scheduledEndAt) {
                                    nextErrors.scheduledEndAt = "End time is required."
                                } else if (convertForm.scheduledAt && convertForm.scheduledEndAt <= convertForm.scheduledAt) {
                                    nextErrors.scheduledEndAt = "End time must be after start time."
                                }
                                setConvertErrors(nextErrors)
                                if (Object.keys(nextErrors).length > 0) {
                                    return
                                }
                                try {
                                    await apiPost(`/leads/${lead.id}/convert`, {
                                        customerId: convertForm.customerId || undefined,
                                        siteId: convertForm.siteId || undefined,
                                        location: formattedJobAddress || convertForm.location || undefined,
                                        ...buildJobAddressPayload(convertForm.address),
                                        addressManuallyEdited: convertForm.addressManuallyEdited,
                                        priority: convertForm.priority,
                                        amount: Number(convertForm.amount),
                                        scheduledAt: convertForm.scheduledAt?.toISOString(),
                                        scheduledEndAt: convertForm.scheduledEndAt?.toISOString(),
                                    })
                                    setLead((prev) => prev ? { ...prev, status: "Won" } : prev)
                                    toast({
                                        title: "Converted",
                                        description: "Lead converted to job.",
                                        variant: "success"
                                    })
                                    setLead((prev) => prev ? { ...prev, status: "Won" } : prev)
                                    setIsConvertOpen(false)
                                } catch (err: any) {
                                    toast({
                                        title: "Conversion Failed",
                                        description: err?.message ?? "Failed to convert lead.",
                                        variant: "error"
                                    })
                                }
                            }}
                        disabled={!canManage}>
                            Convert
                        </Button>
                    </div>
                }
            >
                <div className="space-y-4">
                    <div className="space-y-2">
                        <Label required>Customer</Label>
                        <Select
                            value={convertForm.customerId}
                            createOption={{
                                label: "customer",
                                href: "/admin/customers?create=customer",
                                onCreated: (created) => {
                                    const customer = created as any
                                    if (!customer?.id) return
                                    setCustomers((prev) => [customer, ...prev.filter((item) => item.id !== customer.id)])
                                    setConvertForm((prev) => ({ ...prev, customerId: customer.id, siteId: "", location: "", address: emptyAddressValue(), addressManuallyEdited: false }))
                                },
                            }}
                            onValueChange={(value) => setConvertForm((prev) => ({ ...prev, customerId: value, siteId: "", location: "", address: emptyAddressValue(), addressManuallyEdited: false }))}
                        >
                            <SelectTrigger className={`w-full bg-white/50 ${convertErrors.customerId ? "border-destructive focus-visible:ring-destructive/50" : ""}`}>
                                <SelectValue placeholder="Select customer" />
                            </SelectTrigger>
                            <SelectContent>
                                {customers.map((customer) => (
                                    <SelectItem key={customer.id} value={customer.id}>{customer.name}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        {convertErrors.customerId && <p className="text-xs text-destructive">{convertErrors.customerId}</p>}
                    </div>
                    {sitesEnabled ? <div className="space-y-2">
                        <Label required>Customer Site</Label>
                        <Select
                            value={convertForm.siteId}
                            createOption={convertForm.customerId ? {
                                label: "site",
                                href: `/admin/customers/${convertForm.customerId}?create=site`,
                                onCreated: (created) => {
                                    const site = created as CustomerSiteOption
                                    if (!site?.id) return
                                    setConvertCustomerSites((prev) => [site, ...prev.filter((item) => item.id !== site.id)])
                                    const nextAddress = customerSiteToAddressValue(site)
                                    setConvertForm((prev) => ({
                                        ...prev,
                                        siteId: site.id,
                                        address: nextAddress,
                                        addressManuallyEdited: false,
                                        location: formatJobAddressForPayload(nextAddress) || formatCustomerSiteAddress(site) || prev.location,
                                    }))
                                },
                            } : undefined}
                            onValueChange={(value) => {
                                const nextSiteId = value
                                const selectedSite = convertCustomerSites.find((site) => site.id === nextSiteId)
                                setConvertForm((prev) => ({
                                    ...prev,
                                    siteId: nextSiteId,
                                    address: selectedSite ? customerSiteToAddressValue(selectedSite) : prev.address,
                                    addressManuallyEdited: selectedSite ? false : prev.addressManuallyEdited,
                                    location: selectedSite
                                        ? formatJobAddressForPayload(customerSiteToAddressValue(selectedSite)) || formatCustomerSiteAddress(selectedSite) || prev.location
                                        : prev.location,
                                }))
                            }}
                            disabled={!convertForm.customerId}
                        >
                            <SelectTrigger className={`w-full bg-white/50 ${convertErrors.siteId ? "border-destructive focus-visible:ring-destructive/50" : ""}`}>
                                <SelectValue placeholder={convertForm.customerId ? "Select site" : "Select customer first"} />
                            </SelectTrigger>
                            <SelectContent>
                                {convertCustomerSites.map((site) => (
                                    <SelectItem key={site.id} value={site.id}>{formatCustomerSiteLabel(site)}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        {convertErrors.siteId && <p className="text-xs text-destructive">{convertErrors.siteId}</p>}
                    </div> : null}
                    <div className="space-y-3">
                        <div className="space-y-1">
                            <Label required={!sitesEnabled} optional={sitesEnabled}>Job Address</Label>
                            <p className="text-xs text-muted-foreground">
                                {sitesEnabled
                                    ? "Defaults from the selected site, but is saved on this job for historical records."
                                    : "Enter the job address in a printable structured format."}
                            </p>
                        </div>
                        <AddressFields
                            value={convertForm.address}
                            onChange={(address) => setConvertForm((prev) => ({
                                ...prev,
                                address,
                                addressManuallyEdited: true,
                                location: formatJobAddressForPayload(address),
                            }))}
                        />
                        {convertErrors.location && <p className="text-xs text-destructive">{convertErrors.location}</p>}
                    </div>
                    <div className="space-y-2">
                        <Label required>Priority</Label>
                        <Select
                            value={convertForm.priority}
                            onValueChange={(value) => setConvertForm((prev) => ({ ...prev, priority: value }))}
                        >
                            <SelectTrigger className="w-full bg-white/50">
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
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="space-y-2">
                            <Label required>Job Amount</Label>
                            <Input
                                type="number"
                                min="0"
                                step="0.01"
                                className={`bg-white/50 ${convertErrors.amount ? "border-destructive focus-visible:ring-destructive/50" : ""}`}
                                value={convertForm.amount}
                                onChange={(e) => setConvertForm((prev) => ({ ...prev, amount: e.target.value }))}
                                placeholder="0.00"
                            />
                            {convertErrors.amount && <p className="text-xs text-destructive">{convertErrors.amount}</p>}
                        </div>
                        <div className="space-y-2">
                            <Label required>Start</Label>
                            <DatePicker
                                selected={convertForm.scheduledAt}
                                onChange={(date: Date | null) => setConvertForm((prev) => ({ ...prev, scheduledAt: date }))}
                                showTimeSelect
                                timeFormat="HH:mm"
                                timeIntervals={15}
                                dateFormat="MMM d, yyyy h:mm aa"
                                className={`h-9 w-full rounded-md border border-input bg-white/60 px-3 text-sm shadow-sm ${convertErrors.scheduledAt ? "border-destructive focus-visible:ring-destructive/50" : ""}`}
                                placeholderText="Select start time"
                            />
                            {convertErrors.scheduledAt && <p className="text-xs text-destructive">{convertErrors.scheduledAt}</p>}
                        </div>
                        <div className="space-y-2">
                            <Label required>End</Label>
                            <DatePicker
                                selected={convertForm.scheduledEndAt}
                                onChange={(date: Date | null) => setConvertForm((prev) => ({ ...prev, scheduledEndAt: date }))}
                                showTimeSelect
                                timeFormat="HH:mm"
                                timeIntervals={15}
                                dateFormat="MMM d, yyyy h:mm aa"
                                className={`h-9 w-full rounded-md border border-input bg-white/60 px-3 text-sm shadow-sm ${convertErrors.scheduledEndAt ? "border-destructive focus-visible:ring-destructive/50" : ""}`}
                                placeholderText="Select end time"
                            />
                            {convertErrors.scheduledEndAt && <p className="text-xs text-destructive">{convertErrors.scheduledEndAt}</p>}
                        </div>
                    </div>
                </div>
            </GlassModal>

            <GlassModal
                open={isDeleteDocOpen}
                onOpenChange={setIsDeleteDocOpen}
                title="Remove Document?"
                description="This will delete the attachment."
                footer={
                    <div className="flex justify-end gap-2 w-full">
                        <Button variant="outline" onClick={() => setIsDeleteDocOpen(false)}>Cancel</Button>
                        <Button
                            variant="destructive"
                            onClick={async () => {
                                if (!canManage) {
                                    toast({
                                        title: "Insufficient permissions",
                                        description: "You can view documents but cannot delete them.",
                                        variant: "error"
                                    })
                                    return
                                }
                                if (!deleteDocId) return
                                try {
                                    await apiDelete(`/documents/${deleteDocId}`, { confirmed: true })
                                    setDocuments((prev) => prev.filter((d) => d.id !== deleteDocId))
                                    toast({
                                        title: "Deleted",
                                        description: "Document removed.",
                                        variant: "success"
                                    })
                                    setIsDeleteDocOpen(false)
                                    setDeleteDocId(null)
                                } catch (err: any) {
                                    toast({
                                        title: "Delete Failed",
                                        description: err?.message ?? "Failed to delete document.",
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
                <p className="text-sm text-muted-foreground">
                    This action removes the selected attachment from CRM and synced storage.
                </p>
            </GlassModal>
            <ErrorToast error={error} onClear={() => setError(null)} />
        </PageContainer>
    )
}

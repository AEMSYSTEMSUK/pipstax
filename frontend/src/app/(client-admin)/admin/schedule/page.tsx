"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { PageContainer } from "@/components/layout/PageContainer"
import { GlassCard, GlassCardContent, GlassCardHeader, GlassCardTitle } from "@/components/glass/GlassCard"
import { GlassPanel } from "@/components/glass/GlassPanel"
import { GlassModal } from "@/components/glass/GlassModal"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { StatusBadge } from "@/components/shared/StatusBadge"
import { RecordNumberBadge } from "@/components/shared/RecordNumberBadge"
import { Briefcase, CalendarDays, ChevronLeft, ChevronRight, Plus, MapPin, AlertTriangle, Search, Pencil, Trash2, Users } from "lucide-react"
import { apiDelete, apiGet, apiPost, apiPut } from "@/lib/api"
import { ErrorToast } from "@/components/shared/ErrorToast"
import { DataPagination, useClientPagination } from "@/components/shared/DataPagination"
import { useSavedColumnOrder } from "@/components/shared/useSavedColumnOrder"
import { useSavedViewMode } from "@/components/shared/useSavedViewMode"
import { format, addDays, startOfWeek } from "date-fns"
import { useRouter, useSearchParams } from "next/navigation"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Checkbox } from "@/components/ui/checkbox"
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { useToast } from "@/components/ui/toast"
import DatePicker from "react-datepicker"
import { getModulePermissions } from "@/lib/permission-ui"
import { formatJobStatus } from "@/lib/status"
import { findWorkflowStage, getWorkflowStageOptions, getWorkflowStatusLabel } from "@/lib/workflows"
import { CustomerSiteOption, customerSiteToAddressValue, fetchCustomerSites, formatCustomerSiteAddress, formatCustomerSiteLabel } from "@/lib/customer-sites"
import { useTenantFeatures } from "@/components/layout/TenantFeaturesContext"
import { useTenantWorkflowConfig } from "@/components/layout/TenantWorkflowContext"
import { Textarea } from "@/components/ui/textarea"
import { AddressFields, emptyAddressValue, formatAddressValue, type AddressValue } from "@/components/shared/LocalizedFields"

type PlannerNote = {
    id: string
    title: string
    userId: string
    userName: string
    userEmail?: string | null
    date: string
    endDate?: string | null
    kind?: string | null
    notes?: string | null
}

type PlannerUser = {
    id: string
    fullName: string
    email?: string | null
}

type PlannerEntry = {
    id: string
    jobId: string
    userId: string
    userName?: string | null
    userEmail?: string | null
    date: string
    note?: string | null
    jobTitle: string
    jobNumber?: string | null
    jobStatus?: string | null
    priority?: string | null
    scheduledAt?: string | null
    scheduledEndAt?: string | null
    isMultiDay?: boolean
    customerName?: string | null
    siteName?: string | null
    siteAddress?: string | null
}

type PlannerSettings = {
    workingDays: number[]
    usePublicHolidays: boolean
    holidayCountryCode: string
    holidaySubdivisionCode?: string | null
    includeRegionalHolidays: boolean
    customHolidays: Array<{ date: string; title: string }>
}

type BankHoliday = {
    date: string
    title: string
    source?: string
    countryCode?: string
    nationalHoliday?: boolean
    subdivisionCodes?: string[] | null
    holidayTypes?: string[]
}

type ScheduleCalendarEntry =
    | { type: "job"; item: any }
    | { type: "planner-note"; item: PlannerNote }

const plannerNoteKinds = [
    { value: "HOLIDAY", label: "Holiday" },
    { value: "TRAINING", label: "Training" },
    { value: "UNAVAILABLE", label: "Unavailable" },
    { value: "MEETING", label: "Meeting" },
    { value: "ADMIN", label: "Admin" },
    { value: "REMINDER", label: "Reminder" },
] as const

const SCHEDULE_VIEW_MODES = ["calendar", "kanban", "list"] as const
const PLANNER_VIEW_MODES = ["grid", "month", "week", "day", "list"] as const

const DEFAULT_PLANNER_SETTINGS: PlannerSettings = {
    workingDays: [1, 2, 3, 4, 5],
    usePublicHolidays: true,
    holidayCountryCode: "GB",
    holidaySubdivisionCode: null,
    includeRegionalHolidays: true,
    customHolidays: [],
}

const plannerMonths = Array.from({ length: 12 }).map((_, index) => ({
    value: String(index),
    label: new Date(2026, index, 1).toLocaleString([], { month: "long" }),
}))

const parsePlannerDate = (value?: string | null) => {
    if (!value) return null
    const [year, month, day] = value.split("-").map(Number)
    if (!year || !month || !day) return null
    const parsed = new Date(year, month - 1, day)
    return Number.isNaN(parsed.getTime()) ? null : parsed
}

const formatPlannerDate = (value?: string | null) => {
    const parsed = parsePlannerDate(value)
    return parsed ? format(parsed, "dd MMM yyyy") : "—"
}

const toPlannerDateValue = (value: Date | null) => (value ? format(value, "yyyy-MM-dd") : "")

const formatPlannerKind = (kind?: string | null) => {
    const normalized = String(kind ?? "ADMIN").trim().toUpperCase()
    const matched = plannerNoteKinds.find((option) => option.value === normalized)
    return matched?.label ?? normalized.replace(/_/g, " ")
}

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

type DayColumnProps = {
    day: Date
    dayEntries: ScheduleCalendarEntry[]
    onJobClick: (jobId: string) => void
    onPlannerNoteClick: (plannerNote: PlannerNote) => void
    getJobVisualClass: (job: any) => string
    getPlannerNoteVisualClass: (note: PlannerNote) => string
    emptyMessage?: string
}

function DayColumn({
    day,
    dayEntries,
    onJobClick,
    onPlannerNoteClick,
    getJobVisualClass,
    getPlannerNoteVisualClass,
    emptyMessage = "No jobs scheduled",
}: DayColumnProps) {
    const formatTime = (value: Date) =>
        value.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })

    const dayStart = new Date(day)
    dayStart.setHours(0, 0, 0, 0)
    const dayEnd = new Date(dayStart)
    dayEnd.setDate(dayEnd.getDate() + 1)

    const segments = dayEntries
        .map((entry) => {
            if (entry.type === "planner-note") {
                const note = entry.item
                const start = parsePlannerDate(note.date)
                if (!start) return null
                const inclusiveEnd = parsePlannerDate(note.endDate ?? note.date) ?? start
                const end = new Date(inclusiveEnd)
                end.setDate(end.getDate() + 1)
                const visibleStart = start < dayStart ? dayStart : start
                const visibleEnd = end > dayEnd ? dayEnd : end
                const fullSpanLabel =
                    note.endDate && note.endDate !== note.date
                        ? `${formatPlannerDate(note.date)} - ${formatPlannerDate(note.endDate)}`
                        : formatPlannerDate(note.date)

                return {
                    entry,
                    sortTime: visibleStart.getTime(),
                    periodLabel: "Planner block",
                    fullSpanLabel,
                }
            }

            const job = entry.item
            const start = job.scheduledAt ? new Date(job.scheduledAt) : null
            if (!start || Number.isNaN(start.getTime())) return null
            const rawEnd = job.scheduledEndAt ? new Date(job.scheduledEndAt) : new Date(start.getTime() + 60 * 60 * 1000)
            if (Number.isNaN(rawEnd.getTime())) return null
            const end = rawEnd > start ? rawEnd : new Date(start.getTime() + 60 * 60 * 1000)
            const visibleStart = start < dayStart ? dayStart : start
            const visibleEnd = end > dayEnd ? dayEnd : end
            const startsBeforeDay = start < dayStart
            const endsAfterDay = end > dayEnd
            const isAllDaySlice =
                startsBeforeDay &&
                endsAfterDay &&
                visibleStart.getHours() === 0 &&
                visibleStart.getMinutes() === 0 &&
                visibleEnd.getHours() === 0 &&
                visibleEnd.getMinutes() === 0

            const periodLabel = (() => {
                if (isAllDaySlice) {
                    const dayEndMinute = new Date(visibleEnd.getTime() - 60 * 1000)
                    return `${formatTime(visibleStart)} - ${formatTime(dayEndMinute)}`
                }
                if (startsBeforeDay && !endsAfterDay) return `Until ${formatTime(visibleEnd)}`
                if (!startsBeforeDay && endsAfterDay) return `From ${formatTime(visibleStart)}`
                return `${formatTime(visibleStart)} - ${formatTime(visibleEnd)}`
            })()

            const fullSpanLabel =
                startsBeforeDay || endsAfterDay
                    ? `${start.toLocaleDateString([], { day: "2-digit", month: "short" })} ${formatTime(start)} → ${end.toLocaleDateString([], {
                          day: "2-digit",
                          month: "short",
                      })} ${formatTime(end)}`
                    : null

            return {
                entry,
                sortTime: visibleStart.getTime(),
                periodLabel,
                fullSpanLabel,
            }
        })
        .filter(Boolean)
        .sort((a: any, b: any) => a.sortTime - b.sortTime) as Array<{
        entry: ScheduleCalendarEntry
        sortTime: number
        periodLabel: string
        fullSpanLabel: string | null
    }>

    return (
        <div className="border-l first:border-l-0 border-glass-border min-h-[560px] bg-white/10">
            <div className="space-y-3 p-3">
                {segments.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-glass-border/70 bg-white/30 px-3 py-4 text-xs text-muted-foreground">
                        {emptyMessage}
                    </div>
                ) : (
                    segments.map((segment) => (
                        <button
                            key={`${segment.entry.type}-${segment.entry.item.id}`}
                            type="button"
                            onClick={() =>
                                segment.entry.type === "job"
                                    ? onJobClick(segment.entry.item.id)
                                    : onPlannerNoteClick(segment.entry.item)
                            }
                            className={`w-full rounded-xl border p-3 text-left shadow-sm hover:shadow-md transition-all ${
                                segment.entry.type === "job"
                                    ? getJobVisualClass(segment.entry.item)
                                    : getPlannerNoteVisualClass(segment.entry.item)
                            }`}
                        >
                            <div className="text-[11px] font-semibold opacity-75">
                                {segment.periodLabel}
                            </div>
                            {segment.fullSpanLabel ? (
                                <div className="mt-1 text-[10px] text-muted-foreground truncate" title={segment.fullSpanLabel}>
                                    {segment.fullSpanLabel}
                                </div>
                            ) : null}
                            <div className="mt-2 flex items-start justify-between gap-2">
                                <div className="min-w-0">
                                    {segment.entry.type === "job" ? (
                                        <>
                                            <div className="truncate text-sm font-semibold">
                                                {segment.entry.item.jobNumber ? `${segment.entry.item.jobNumber} • ` : ""}
                                                {segment.entry.item.title ?? segment.entry.item.clientName ?? "Job"}
                                            </div>
                                            <div className="mt-1 flex items-center gap-1 text-[11px] text-muted-foreground">
                                                <span className="inline-block h-2 w-2 rounded-full bg-current opacity-80 shrink-0" />
                                                <MapPin className="h-3 w-3 shrink-0" />
                                                <span className="truncate">
                                                    {segment.entry.item.siteName
                                                        ? `${segment.entry.item.siteName}${segment.entry.item.location ? ` • ${segment.entry.item.location}` : ""}`
                                                        : segment.entry.item.location ?? "TBD"}
                                                </span>
                                            </div>
                                        </>
                                    ) : (
                                        <>
                                            <div className="truncate text-sm font-semibold">
                                                {segment.entry.item.title}
                                            </div>
                                            <div className="mt-1 text-[11px] text-muted-foreground">
                                                {formatPlannerKind(segment.entry.item.kind)} • {segment.entry.item.userName}
                                            </div>
                                        </>
                                    )}
                                </div>
                                {segment.entry.type === "job" && segment.entry.item.priority === 'Emergency' ? (
                                    <AlertTriangle className="h-4 w-4 shrink-0 text-destructive" />
                                ) : null}
                            </div>
                        </button>
                    ))
                )}
            </div>
        </div>
    )
}

export default function SchedulePage() {
    const router = useRouter()
    const searchParams = useSearchParams()
    const { toast } = useToast()
    const { canView, canManage } = getModulePermissions("scheduling.view", "scheduling.manage")
    const { sites: sitesEnabled, complianceWorkflows, plannerNotes } = useTenantFeatures()
    const workflowConfig = useTenantWorkflowConfig()
    const sectionParam = searchParams.get("section")
    const activeSection = plannerNotes && (sectionParam === "planner" || sectionParam === "planner-notes") ? "planner-notes" : "jobs"
    const [jobView, setJobView] = useSavedViewMode("pipstack:view-mode:admin-schedule-jobs", "list", SCHEDULE_VIEW_MODES)
    const [plannerView, setPlannerView] = useSavedViewMode("pipstack:view-mode:admin-planner", "grid", PLANNER_VIEW_MODES)
    const view: "calendar" | "kanban" | "list" | "grid" | "month" | "week" | "day" = activeSection === "planner-notes" ? plannerView : jobView
    const setView = (nextView: "calendar" | "kanban" | "list" | "grid" | "month" | "week" | "day") => {
        if (activeSection === "planner-notes") {
            if (nextView !== "kanban" && nextView !== "calendar") setPlannerView(nextView)
            return
        }
        if (nextView === "calendar" || nextView === "kanban" || nextView === "list") setJobView(nextView)
    }
    const [currentDate, setCurrentDate] = useState(new Date())
    const [jobs, setJobs] = useState<any[]>([])
    const [plannerNoteItems, setPlannerNoteItems] = useState<PlannerNote[]>([])
    const [plannerEntries, setPlannerEntries] = useState<PlannerEntry[]>([])
    const [plannerSettings, setPlannerSettings] = useState<PlannerSettings>(DEFAULT_PLANNER_SETTINGS)
    const [bankHolidays, setBankHolidays] = useState<BankHoliday[]>([])
    const [plannerUsers, setPlannerUsers] = useState<PlannerUser[]>([])
    const [error, setError] = useState<string | null>(null)
    const [customers, setCustomers] = useState<any[]>([])
    const [customerSites, setCustomerSites] = useState<CustomerSiteOption[]>([])
    const [searchQuery, setSearchQuery] = useState("")
    const [selectedCustomerId, setSelectedCustomerId] = useState("__all__")
    const [selectedSiteId, setSelectedSiteId] = useState("__all__")
    const [selectedPlannerUserIds, setSelectedPlannerUserIds] = useState<string[]>([])
    const [filterSites, setFilterSites] = useState<CustomerSiteOption[]>([])
    const [isNewJobOpen, setIsNewJobOpen] = useState(false)
    const [isPlannerNoteOpen, setIsPlannerNoteOpen] = useState(false)
    const [editingPlannerNoteId, setEditingPlannerNoteId] = useState<string | null>(null)
    const [jobForm, setJobForm] = useState({
        title: "",
        customerId: "",
        siteId: "",
        location: "",
        address: emptyAddressValue(),
        addressManuallyEdited: false,
        description: "",
        priority: "Medium",
        scheduledAt: null as Date | null,
        scheduledEndAt: null as Date | null
    })
    const [plannerNoteForm, setPlannerNoteForm] = useState({
        title: "",
        userId: "",
        kind: "ADMIN",
        date: new Date(),
        endDate: null as Date | null,
        notes: "",
        remindAssignee: false,
    })
    const [jobErrors, setJobErrors] = useState<{ title?: string; customerId?: string; siteId?: string; location?: string; scheduledAt?: string; scheduledEndAt?: string }>({})
    const [plannerNoteErrors, setPlannerNoteErrors] = useState<{ title?: string; userId?: string; date?: string; endDate?: string }>({})
    const weekStart = startOfWeek(currentDate, { weekStartsOn: 1 })
    const days = Array.from({ length: 7 }).map((_, i) => addDays(weekStart, i))
    const showDateNavigator = activeSection === "jobs" && view === "calendar"
    const dateNavigatorLabel =
        activeSection === "jobs"
            ? `${format(weekStart, "MMM d")} - ${format(addDays(weekStart, 6), "MMM d, yyyy")}`
            : view === "day"
                ? format(currentDate, "dd MMM yyyy")
                : view === "week"
                    ? `${format(startOfWeek(currentDate, { weekStartsOn: 1 }), "MMM d")} - ${format(addDays(startOfWeek(currentDate, { weekStartsOn: 1 }), 6), "MMM d, yyyy")}`
                    : format(currentDate, "MMMM yyyy")
    const shiftVisibleDate = (direction: -1 | 1) => {
        setCurrentDate((prev) => {
            const next = new Date(prev)
            if (activeSection === "jobs" || view === "week") {
                next.setDate(next.getDate() + direction * 7)
                return next
            }
            if (view === "day") {
                next.setDate(next.getDate() + direction)
                return next
            }
            next.setMonth(next.getMonth() + direction, 1)
            return next
        })
    }
    const goToToday = () => setCurrentDate(new Date())
    const renderInlineDateNavigator = (label = dateNavigatorLabel) => (
        <div className="flex w-fit items-center gap-1 rounded-full bg-primary/10 px-1.5 py-1 text-primary">
            <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-6 w-6 rounded-full p-0 text-primary hover:bg-primary/10"
                aria-label="Previous date range"
                onClick={() => shiftVisibleDate(-1)}
            >
                <ChevronLeft className="h-3.5 w-3.5" />
            </Button>
            <span className="min-w-[110px] px-1 text-center text-xs font-semibold sm:min-w-[140px]">{label}</span>
            <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-6 w-6 rounded-full p-0 text-primary hover:bg-primary/10"
                aria-label="Next date range"
                onClick={() => shiftVisibleDate(1)}
            >
                <ChevronRight className="h-3.5 w-3.5" />
            </Button>
            <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-6 rounded-full px-2 text-[11px] font-semibold text-primary hover:bg-primary/10"
                onClick={goToToday}
            >
                Today
            </Button>
        </div>
    )

    const statusOrder = ['Not Assigned', 'Assigned', 'Live', 'Needs Attention', 'Finished', 'Closed']
    const jobStageOptions = getWorkflowStageOptions("jobs", workflowConfig)

    useEffect(() => {
        if (searchParams.get("create") === "job" && canManage) {
            const customerId = searchParams.get("customerId") ?? ""
            const siteId = searchParams.get("siteId") ?? ""
            if (customerId) {
                setJobForm((prev) => ({ ...prev, customerId, siteId }))
            }
            setIsNewJobOpen(true)
        }
        if (searchParams.get("create") === "planner-note" && canManage && plannerNotes) {
            setIsPlannerNoteOpen(true)
        }
    }, [canManage, plannerNotes, searchParams])

    useEffect(() => {
        const load = async () => {
            try {
                const [jobsRes, customersRes] = await Promise.all([
                    apiGet<any[]>(`/jobs`),
                    apiGet<any[]>(`/customers`)
                ])
                setJobs(Array.isArray(jobsRes.data) ? jobsRes.data : [])
                setCustomers(Array.isArray(customersRes.data) ? customersRes.data : [])
                setError(null)
            } catch (err: any) {
                setError(err?.message ?? "Failed to load schedule")
            }
        }
        load()
    }, [])

    useEffect(() => {
        const loadPlannerNotes = async () => {
            if (!plannerNotes) {
                setPlannerNoteItems([])
                setPlannerEntries([])
                setPlannerUsers([])
                setBankHolidays([])
                return
            }
            try {
                const [notesRes, usersRes, entriesRes, settingsRes] = await Promise.all([
                    apiGet<PlannerNote[]>("/planner-notes"),
                    apiGet<PlannerUser[]>("/planner-notes/users"),
                    apiGet<PlannerEntry[]>("/planner-notes/entries"),
                    apiGet<PlannerSettings>("/planner-notes/settings"),
                ])
                setPlannerNoteItems(Array.isArray(notesRes.data) ? notesRes.data : [])
                setPlannerUsers(Array.isArray(usersRes.data) ? usersRes.data : [])
                setPlannerEntries(Array.isArray(entriesRes.data) ? entriesRes.data : [])
                setPlannerSettings(settingsRes.data ?? DEFAULT_PLANNER_SETTINGS)
            } catch (err: any) {
                setError(err?.message ?? "Failed to load planner notes")
            }
        }
        void loadPlannerNotes()
    }, [plannerNotes])

    useEffect(() => {
        const loadBankHolidays = async () => {
            if (!plannerNotes || !plannerSettings.usePublicHolidays) {
                setBankHolidays([])
                return
            }
            try {
                const response = await apiGet<BankHoliday[]>(`/planner-notes/bank-holidays?year=${currentDate.getFullYear()}`)
                setBankHolidays(Array.isArray(response.data) ? response.data : [])
            } catch {
                setBankHolidays([])
            }
        }
        void loadBankHolidays()
    }, [currentDate, plannerNotes, plannerSettings.usePublicHolidays, plannerSettings.holidayCountryCode, plannerSettings.holidaySubdivisionCode, plannerSettings.includeRegionalHolidays])

    useEffect(() => {
        const loadSites = async () => {
            if (!sitesEnabled || !jobForm.customerId) {
                setCustomerSites([])
                setJobForm((prev) => ({ ...prev, siteId: "" }))
                return
            }
            try {
                const sites = await fetchCustomerSites(jobForm.customerId)
                setCustomerSites(sites)
                setJobForm((prev) => ({
                    ...prev,
                    siteId: sites.some((site) => site.id === prev.siteId) ? prev.siteId : "",
                }))
            } catch (err: any) {
                setError(err?.message ?? "Failed to load customer sites")
                setCustomerSites([])
                setJobForm((prev) => ({ ...prev, siteId: "" }))
            }
        }
        void loadSites()
    }, [jobForm.customerId, sitesEnabled])

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

    useEffect(() => {
        if (activeSection === "planner-notes" && view === "kanban") {
            setView("list")
        }
    }, [activeSection, view])

    const getJobVisualClass = (job: any) => {
        const status = getJobBaseStatusLabel(job)
        let base = "border-primary/30 bg-primary/10 text-primary"

        switch (status) {
            case "Not Assigned":
                base = "border-orange-300 bg-orange-100/70 text-orange-800"
                break
            case "Assigned":
                base = "border-indigo-300 bg-indigo-100/70 text-indigo-800"
                break
            case "Live":
                base = "border-emerald-300 bg-emerald-100/70 text-emerald-800"
                break
            case "Needs Attention":
                base = "border-red-300 bg-red-100/70 text-red-800"
                break
            case "Finished":
                base = "border-violet-300 bg-violet-100/70 text-violet-800"
                break
            case "Closed":
                base = "border-green-300 bg-green-100/70 text-green-800"
                break
            default:
                break
        }

        if (job?.priority === "Emergency") {
            return `${base} ring-1 ring-destructive/40`
        }
        return base
    }

    const getDurationMinutes = (job: any) => {
        if (job.scheduledAt && job.scheduledEndAt) {
            const start = new Date(job.scheduledAt).getTime()
            const end = new Date(job.scheduledEndAt).getTime()
            return Math.max(Math.round((end - start) / (1000 * 60)), 60)
        }
        return 60
    }

    const getClientName = (job: any) => {
        const direct = job.customerName ?? job.customer?.name ?? job.clientName
        if (direct) return direct
        const matched = customers.find((customer) => customer.id === job.customerId)
        return matched?.name ?? "—"
    }

    const getJobSiteLine = (job: any) => {
        if (!job?.siteName) return job.location ?? "TBD"
        return `${job.siteName}${job.location ? ` • ${job.location}` : ""}`
    }

    const getJobBaseStatusLabel = (job: any) => {
        if (complianceWorkflows) {
            const stage = findWorkflowStage(workflowConfig, "jobs", job.workflowStageKey)
            if (stage?.baseStatus) {
                return formatJobStatus(stage.baseStatus)
            }
        }
        return formatJobStatus(job.status)
    }

    const getJobWorkflowStatusLabel = (job: any) =>
        getWorkflowStatusLabel("jobs", job.status, job.workflowStageKey, workflowConfig, complianceWorkflows)

    const getDefaultJobStageForStatus = (status: string) =>
        jobStageOptions.find((stage) => stage.key === stage.baseStatus && stage.baseStatus === status) ??
        jobStageOptions.find((stage) => stage.baseStatus === status)

    const getJobBoardKey = (job: any) => {
        if (!complianceWorkflows) {
            return getJobBaseStatusLabel(job)
        }
        const stage = findWorkflowStage(workflowConfig, "jobs", job.workflowStageKey)
        return stage?.key ?? getDefaultJobStageForStatus(String(job.status ?? "").toUpperCase())?.key ?? String(job.status ?? "UNKNOWN")
    }

    const getPlannerNoteVisualClass = (note: PlannerNote) => {
        switch (String(note.kind ?? "ADMIN").toUpperCase()) {
            case "HOLIDAY":
                return "border-rose-300 bg-rose-100/80 text-rose-900"
            case "TRAINING":
                return "border-amber-300 bg-amber-100/80 text-amber-900"
            case "UNAVAILABLE":
                return "border-slate-300 bg-slate-100/80 text-slate-900"
            case "MEETING":
                return "border-rose-300 bg-rose-100/80 text-rose-900"
            case "REMINDER":
                return "border-cyan-300 bg-cyan-100/80 text-cyan-900"
            default:
                return "border-teal-300 bg-teal-100/80 text-teal-900"
        }
    }

    const formatSchedulePoint = (value?: string | null) => {
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

    const filteredJobs = useMemo(() => {
        const query = searchQuery.trim().toLowerCase()
        const createdTime = (job: any) => {
            const parsed = new Date(job.createdAt ?? job.updatedAt ?? 0).getTime()
            return Number.isNaN(parsed) ? 0 : parsed
        }
        return jobs
            .filter((job) => {
                if (selectedCustomerId !== "__all__" && job.customerId !== selectedCustomerId) return false
                if (selectedSiteId !== "__all__" && job.siteId !== selectedSiteId) return false
                if (!query) return true
                return (
                    String(job.title ?? "").toLowerCase().includes(query) ||
                    String(job.jobNumber ?? "").toLowerCase().includes(query) ||
                    getClientName(job).toLowerCase().includes(query) ||
                    String(job.location ?? "").toLowerCase().includes(query) ||
                    String(job.siteName ?? "").toLowerCase().includes(query) ||
                    String(job.siteAddress ?? "").toLowerCase().includes(query) ||
                    String(job.status ?? "").toLowerCase().includes(query) ||
                    getJobBaseStatusLabel(job).toLowerCase().includes(query) ||
                    getJobWorkflowStatusLabel(job).toLowerCase().includes(query)
                )
            })
            .sort((a, b) => createdTime(b) - createdTime(a) || String(b.id ?? "").localeCompare(String(a.id ?? "")))
    }, [jobs, searchQuery, selectedCustomerId, selectedSiteId, customers, workflowConfig, complianceWorkflows])

    const plannerNotesVisible = plannerNotes && activeSection === "planner-notes"

    const filteredPlannerNotes = useMemo(() => {
        if (!plannerNotesVisible) return []
        const query = searchQuery.trim().toLowerCase()
        return plannerNoteItems.filter((note) => {
            if (!query) return true
            return (
                String(note.title ?? "").toLowerCase().includes(query) ||
                String(note.userName ?? "").toLowerCase().includes(query) ||
                String(note.kind ?? "").toLowerCase().includes(query) ||
                String(note.notes ?? "").toLowerCase().includes(query)
            )
        })
    }, [plannerNoteItems, plannerNotesVisible, searchQuery])
    const jobsPagination = useClientPagination(filteredJobs)
    const plannerNotesPagination = useClientPagination(filteredPlannerNotes)

    const plannerYearOptions = useMemo(() => {
        const currentYear = new Date().getFullYear()
        const years = new Set<number>([currentYear - 1, currentYear, currentYear + 1, currentYear + 2])
        plannerEntries.forEach((entry) => {
            const year = Number(String(entry.date ?? "").slice(0, 4))
            if (Number.isFinite(year)) years.add(year)
        })
        plannerNoteItems.forEach((note) => {
            const year = Number(String(note.date ?? "").slice(0, 4))
            if (Number.isFinite(year)) years.add(year)
        })
        return Array.from(years).sort((a, b) => a - b)
    }, [plannerEntries, plannerNoteItems])

    const plannerMonthDays = useMemo(() => {
        const year = currentDate.getFullYear()
        const month = currentDate.getMonth()
        const lastDay = new Date(year, month + 1, 0).getDate()
        return Array.from({ length: lastDay }).map((_, index) => new Date(year, month, index + 1))
    }, [currentDate])

    const plannerWeekDays = useMemo(() => {
        const start = startOfWeek(currentDate, { weekStartsOn: 1 })
        return Array.from({ length: 7 }).map((_, index) => addDays(start, index))
    }, [currentDate])

    const plannerGridDays = plannerView === "day" ? [currentDate] : plannerView === "week" ? plannerWeekDays : plannerMonthDays

    const plannerMonthCalendarDays = useMemo(() => {
        const firstOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1)
        const calendarStart = startOfWeek(firstOfMonth, { weekStartsOn: 1 })
        return Array.from({ length: 42 }).map((_, index) => addDays(calendarStart, index))
    }, [currentDate])

    const holidayByDate = useMemo(() => {
        const map = new Map<string, string[]>()
        ;[...bankHolidays, ...plannerSettings.customHolidays].forEach((holiday) => {
            const list = map.get(holiday.date) ?? []
            list.push(holiday.title)
            map.set(holiday.date, list)
        })
        return map
    }, [bankHolidays, plannerSettings.customHolidays])

    const isWorkingDay = (day: Date) => plannerSettings.workingDays.includes(day.getDay())
    const getHolidayTitles = (day: Date) => holidayByDate.get(format(day, "yyyy-MM-dd")) ?? []

    const visiblePlannerUsers = useMemo(() => {
        if (selectedPlannerUserIds.length === 0) return plannerUsers
        const selected = new Set(selectedPlannerUserIds)
        return plannerUsers.filter((user) => selected.has(user.id))
    }, [plannerUsers, selectedPlannerUserIds])

    const plannerUserFilterLabel =
        selectedPlannerUserIds.length === 0
            ? "All engineers"
            : `${selectedPlannerUserIds.length} engineer${selectedPlannerUserIds.length === 1 ? "" : "s"}`

    const togglePlannerUser = (userId: string) => {
        setSelectedPlannerUserIds((prev) =>
            prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId],
        )
    }

    const plannerSelectedUserSet = useMemo(() => new Set(selectedPlannerUserIds), [selectedPlannerUserIds])

    const filteredPlannerEntries = useMemo(() => {
        const query = searchQuery.trim().toLowerCase()
        return plannerEntries.filter((entry) => {
            if (plannerSelectedUserSet.size > 0 && !plannerSelectedUserSet.has(entry.userId)) return false
            if (!query) return true
            return (
                String(entry.jobTitle ?? "").toLowerCase().includes(query) ||
                String(entry.jobNumber ?? "").toLowerCase().includes(query) ||
                String(entry.customerName ?? "").toLowerCase().includes(query) ||
                String(entry.siteName ?? "").toLowerCase().includes(query) ||
                String(entry.siteAddress ?? "").toLowerCase().includes(query) ||
                String(entry.userName ?? "").toLowerCase().includes(query) ||
                String(entry.note ?? "").toLowerCase().includes(query)
            )
        })
    }, [plannerEntries, plannerSelectedUserSet, searchQuery])

    const plannerEntriesByCell = useMemo(() => {
        const map = new Map<string, PlannerEntry[]>()
        filteredPlannerEntries.forEach((entry) => {
            const key = `${entry.date}:${entry.userId}`
            const list = map.get(key) ?? []
            list.push(entry)
            map.set(key, list)
        })
        return map
    }, [filteredPlannerEntries])

    const plannerNotesByCell = useMemo(() => {
        const query = searchQuery.trim().toLowerCase()
        const map = new Map<string, PlannerNote[]>()
        filteredPlannerNotes.forEach((note) => {
            if (plannerSelectedUserSet.size > 0 && !plannerSelectedUserSet.has(note.userId)) return
            if (
                query &&
                !String(note.title ?? "").toLowerCase().includes(query) &&
                !String(note.userName ?? "").toLowerCase().includes(query) &&
                !String(note.kind ?? "").toLowerCase().includes(query) &&
                !String(note.notes ?? "").toLowerCase().includes(query)
            ) {
                return
            }
            const start = parsePlannerDate(note.date)
            if (!start) return
            const end = parsePlannerDate(note.endDate ?? note.date) ?? start
            const cursor = new Date(start)
            while (cursor <= end) {
                const key = `${format(cursor, "yyyy-MM-dd")}:${note.userId}`
                const list = map.get(key) ?? []
                list.push(note)
                map.set(key, list)
                cursor.setDate(cursor.getDate() + 1)
            }
        })
        return map
    }, [filteredPlannerNotes, plannerSelectedUserSet, searchQuery])

    const openCreatePlannerNote = (defaults: { userId?: string; date?: Date } = {}) => {
        setEditingPlannerNoteId(null)
        setPlannerNoteErrors({})
        setPlannerNoteForm({
            title: "",
            userId: defaults.userId ?? plannerUsers[0]?.id ?? "",
            kind: "ADMIN",
            date: defaults.date ?? currentDate,
            endDate: null,
            notes: "",
            remindAssignee: false,
        })
        setIsPlannerNoteOpen(true)
    }

    const openEditPlannerNote = (note: PlannerNote) => {
        setEditingPlannerNoteId(note.id)
        setPlannerNoteErrors({})
        setPlannerNoteForm({
            title: note.title ?? "",
            userId: note.userId ?? "",
            kind: String(note.kind ?? "ADMIN").toUpperCase(),
            date: parsePlannerDate(note.date) ?? new Date(),
            endDate: parsePlannerDate(note.endDate ?? null),
            notes: note.notes ?? "",
            remindAssignee: false,
        })
        setIsPlannerNoteOpen(true)
    }

    const closePlannerNoteModal = () => {
        setIsPlannerNoteOpen(false)
        setEditingPlannerNoteId(null)
        setPlannerNoteErrors({})
    }

    const kanbanBuckets = filteredJobs.reduce((acc: Record<string, any[]>, job) => {
        const columnKey = getJobBoardKey(job)
        if (!acc[columnKey]) {
            acc[columnKey] = []
        }
        acc[columnKey].push(job)
        return acc
    }, {})
    const workflowKanbanColumns = complianceWorkflows
        ? jobStageOptions.map((stage) => ({ key: stage.key, label: stage.label, tone: formatJobStatus(stage.baseStatus) }))
        : statusOrder.map((status) => ({ key: status, label: status, tone: status }))
    workflowKanbanColumns.forEach((column) => {
        if (!kanbanBuckets[column.key]) {
            kanbanBuckets[column.key] = []
        }
    })
    const baseKanbanColumns = [
        ...workflowKanbanColumns,
        ...Object.keys(kanbanBuckets)
            .filter((key) => !workflowKanbanColumns.some((column) => column.key === key))
            .map((key) => ({ key, label: key, tone: key })),
    ]
    const { orderedColumns: orderedKanbanColumns, getColumnDragProps } = useSavedColumnOrder(
        baseKanbanColumns,
        "pipstack:board-columns:admin-schedule-jobs"
    )

    return (
        <PageContainer>
            {!canView ? (
                <GlassCard>
                    <GlassCardHeader>
                        <GlassCardTitle>Jobs</GlassCardTitle>
                    </GlassCardHeader>
                    <GlassCardContent>You do not have access to view scheduling.</GlassCardContent>
                </GlassCard>
            ) : (
            <>
            <div className="flex flex-col xl:flex-row justify-between items-start xl:items-start mb-6 gap-4">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-foreground">
                        {activeSection === "planner-notes" ? "Planner" : "Jobs"}
                    </h1>
                    <p className="text-muted-foreground mt-1 text-sm">
                        {activeSection === "planner-notes"
                            ? "Plan engineer work by date, assigned job, and non-job entries like holiday or training."
                            : "Create, schedule, assign, and track job lifecycle."}
                    </p>
                </div>

                <div className="w-full xl:w-auto xl:min-w-0 xl:flex-1 xl:max-w-[calc(100%-15rem)]">
                        <div className="flex items-center gap-4 flex-wrap xl:justify-end">
                        {activeSection === "jobs" ? (
                            <div className="flex items-center bg-white/50 backdrop-blur-md rounded-lg border border-glass-border p-1 shadow-sm">
                                <Button variant={view === 'calendar' ? 'default' : 'ghost'} size="sm" onClick={() => setView('calendar')}>
                                    Calendar
                                </Button>
                                <Button variant={view === 'kanban' ? 'default' : 'ghost'} size="sm" onClick={() => setView('kanban')}>
                                    Kanban
                                </Button>
                                <Button variant={view === 'list' ? 'default' : 'ghost'} size="sm" onClick={() => setView('list')}>
                                    List
                                </Button>
                            </div>
                        ) : plannerNotes && activeSection === "planner-notes" ? (
                            <div className="flex items-center bg-white/50 backdrop-blur-md rounded-lg border border-glass-border p-1 shadow-sm">
                                <Button variant={view === 'grid' ? 'default' : 'ghost'} size="sm" onClick={() => setView('grid')}>
                                    Grid
                                </Button>
                                <Button variant={view === 'month' ? 'default' : 'ghost'} size="sm" onClick={() => setView('month')}>
                                    Month
                                </Button>
                                <Button variant={view === 'week' ? 'default' : 'ghost'} size="sm" onClick={() => setView('week')}>
                                    Week
                                </Button>
                                <Button variant={view === 'day' ? 'default' : 'ghost'} size="sm" onClick={() => setView('day')}>
                                    Day
                                </Button>
                                <Button variant={view === 'list' ? 'default' : 'ghost'} size="sm" onClick={() => setView('list')}>
                                    Notes
                                </Button>
                            </div>
                        ) : null}
                        {showDateNavigator ? (
                            <div className="flex w-full items-center gap-1 rounded-lg border border-glass-border bg-white/50 p-1 shadow-sm backdrop-blur-md sm:w-auto">
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    className="h-8 px-2"
                                    aria-label="Previous date range"
                                    onClick={() => shiftVisibleDate(-1)}
                                >
                                    <ChevronLeft className="h-4 w-4" />
                                </Button>
                                <div className="min-w-0 flex-1 px-2 text-center text-sm font-semibold text-foreground sm:min-w-[190px]">
                                    {dateNavigatorLabel}
                                </div>
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    className="h-8 px-2"
                                    aria-label="Next date range"
                                    onClick={() => shiftVisibleDate(1)}
                                >
                                    <ChevronRight className="h-4 w-4" />
                                </Button>
                                <Button type="button" variant="outline" size="sm" className="h-8 bg-white/70" onClick={goToToday}>
                                    Today
                                </Button>
                            </div>
                        ) : null}
                        <div className="relative w-full sm:w-64">
                            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                            <Input
                                placeholder={activeSection === "planner-notes" ? "Search planner notes, people, types..." : "Search jobs, clients, sites..."}
                                className="pl-9 bg-white/40 h-9"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                            />
                        </div>
                        {activeSection === "jobs" ? (
                            <>
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
                            </>
                        ) : null}

                        {plannerNotes && activeSection === "planner-notes" ? (
                            <>
                                <Select
                                    value={String(currentDate.getMonth())}
                                    onValueChange={(value) => {
                                        const next = new Date(currentDate)
                                        next.setMonth(Number(value), 1)
                                        setCurrentDate(next)
                                    }}
                                >
                                    <SelectTrigger className="w-full sm:w-[150px] bg-white/40 h-9">
                                        <SelectValue placeholder="Month" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {plannerMonths.map((month) => (
                                            <SelectItem key={month.value} value={month.value}>{month.label}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                <Select
                                    value={String(currentDate.getFullYear())}
                                    onValueChange={(value) => {
                                        const next = new Date(currentDate)
                                        next.setFullYear(Number(value), next.getMonth(), 1)
                                        setCurrentDate(next)
                                    }}
                                >
                                    <SelectTrigger className="w-full sm:w-[120px] bg-white/40 h-9">
                                        <SelectValue placeholder="Year" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {plannerYearOptions.map((year) => (
                                            <SelectItem key={year} value={String(year)}>{year}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                        <Button variant="outline" size="sm" className="gap-2 bg-white/40">
                                            <Users className="h-4 w-4" /> {plannerUserFilterLabel}
                                        </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="end" className="w-64 bg-white/95">
                                        <DropdownMenuLabel>Engineers</DropdownMenuLabel>
                                        <DropdownMenuSeparator />
                                        <DropdownMenuCheckboxItem
                                            checked={selectedPlannerUserIds.length === 0}
                                            onCheckedChange={() => setSelectedPlannerUserIds([])}
                                        >
                                            All engineers
                                        </DropdownMenuCheckboxItem>
                                        {plannerUsers.map((user) => (
                                            <DropdownMenuCheckboxItem
                                                key={user.id}
                                                checked={selectedPlannerUserIds.includes(user.id)}
                                                onCheckedChange={() => togglePlannerUser(user.id)}
                                            >
                                                {user.fullName}
                                            </DropdownMenuCheckboxItem>
                                        ))}
                                    </DropdownMenuContent>
                                </DropdownMenu>
                                <Button className="gap-2 shadow-sm" disabled={!canManage} onClick={() => openCreatePlannerNote()}>
                                    <Plus className="h-4 w-4" /> Planner Note
                                </Button>
                            </>
                        ) : null}
                        {activeSection === "jobs" ? (
                        <GlassModal
                            open={isNewJobOpen}
                            onOpenChange={setIsNewJobOpen}
                            trigger={
                                <Button className="gap-2 shadow-sm xl:ml-auto" disabled={!canManage}>
                                    <Plus className="h-4 w-4" /> New Job
                                </Button>
                            }
                            title="Create New Job"
                            description="Add a job to the schedule and assign a client."
                            footer={
                                <div className="flex justify-end gap-2 w-full">
                                    <Button variant="outline" onClick={() => setIsNewJobOpen(false)}>Cancel</Button>
                                    <Button
                                        onClick={async () => {
                                            try {
                                                if (!canManage) {
                                                    toast({
                                                        title: "Insufficient permissions",
                                                        description: "You can view jobs but cannot create them.",
                                                        variant: "error"
                                                    })
                                                    return
                                                }
                                                const nextErrors: { title?: string; customerId?: string; siteId?: string; location?: string; scheduledAt?: string; scheduledEndAt?: string } = {}
                                                if (!jobForm.title.trim()) {
                                                    nextErrors.title = "Job title is required."
                                                }
                                                if (!jobForm.customerId) {
                                                    nextErrors.customerId = "Please select a client."
                                                }
                                                if (sitesEnabled && !jobForm.siteId) {
                                                    nextErrors.siteId = "Please select a customer site."
                                                }
                                                const formattedJobAddress = formatJobAddressForPayload(jobForm.address)
                                                if (!sitesEnabled && !formattedJobAddress) {
                                                    nextErrors.location = "Job location is required."
                                                }
                                                if (!jobForm.scheduledAt) {
                                                    nextErrors.scheduledAt = "Start time is required."
                                                }
                                                if (!jobForm.scheduledEndAt) {
                                                    nextErrors.scheduledEndAt = "End time is required."
                                                } else if (jobForm.scheduledAt && jobForm.scheduledEndAt <= jobForm.scheduledAt) {
                                                    nextErrors.scheduledEndAt = "End time must be after start time."
                                                }
                                                setJobErrors(nextErrors)
                                                if (Object.keys(nextErrors).length > 0) {
                                                    return
                                                }
                                                const payload = {
                                                    title: jobForm.title,
                                                    customerId: jobForm.customerId,
                                                    siteId: jobForm.siteId || undefined,
                                                    location: formattedJobAddress || jobForm.location || undefined,
                                                    ...buildJobAddressPayload(jobForm.address),
                                                    addressManuallyEdited: jobForm.addressManuallyEdited,
                                                    description: jobForm.description || undefined,
                                                    priority: jobForm.priority,
                                                    scheduledAt: jobForm.scheduledAt ? jobForm.scheduledAt.toISOString() : undefined,
                                                    scheduledEndAt: jobForm.scheduledEndAt ? jobForm.scheduledEndAt.toISOString() : undefined
                                                }
                                                const created = await apiPost<any>("/jobs", payload)
                                                setJobs((prev) => [created.data, ...prev])
                                                setIsNewJobOpen(false)
                                                setJobForm({
                                                    title: "",
                                                    customerId: "",
                                                    siteId: "",
                                                    location: "",
                                                    address: emptyAddressValue(),
                                                    addressManuallyEdited: false,
                                                    description: "",
                                                    priority: "Medium",
                                                    scheduledAt: null,
                                                    scheduledEndAt: null
                                                })
                                                setJobErrors({})
                                                toast({
                                                    title: "Job Created",
                                                    description: "Job added to schedule.",
                                                    variant: "success"
                                                })
                                            } catch (err: any) {
                                                toast({
                                                    title: "Create Failed",
                                                    description: err?.message ?? "Failed to create job.",
                                                    variant: "error"
                                                })
                                            }
                                        }}
                                    >
                                        Create Job
                                    </Button>
                                </div>
                            }
                        >
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label required>Job Title</Label>
                                <Input
                                    value={jobForm.title}
                                    className={jobErrors.title ? "border-destructive focus-visible:ring-destructive/50" : ""}
                                    onChange={(e) => setJobForm((prev) => ({ ...prev, title: e.target.value }))}
                                />
                                {jobErrors.title && <p className="text-xs text-destructive">{jobErrors.title}</p>}
                            </div>
                            <div className="space-y-2">
                                <Label required>Client</Label>
                                <Select
                                    value={jobForm.customerId}
                                    createOption={{ label: "customer", href: "/admin/customers?create=customer" }}
                                    onValueChange={(value) => setJobForm((prev) => ({ ...prev, customerId: value, siteId: "", location: "", address: emptyAddressValue(), addressManuallyEdited: false }))}
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
                                {jobErrors.customerId && <p className="text-xs text-destructive">{jobErrors.customerId}</p>}
                            </div>
                            {sitesEnabled ? <div className="space-y-2">
                                <Label required>Customer Site</Label>
                                <Select
                                    value={jobForm.siteId}
                                    createOption={jobForm.customerId ? { label: "site", href: `/admin/customers/${jobForm.customerId}?create=site` } : undefined}
                                    onValueChange={(value) => {
                                        const nextSiteId = value
                                        const selectedSite = customerSites.find((site) => site.id === nextSiteId)
                                        setJobForm((prev) => ({
                                            ...prev,
                                            siteId: nextSiteId,
                                            address: selectedSite ? customerSiteToAddressValue(selectedSite) : prev.address,
                                            addressManuallyEdited: selectedSite ? false : prev.addressManuallyEdited,
                                            location: selectedSite
                                                ? formatJobAddressForPayload(customerSiteToAddressValue(selectedSite)) || formatCustomerSiteAddress(selectedSite) || prev.location
                                                : prev.location,
                                        }))
                                    }}
                                    disabled={!jobForm.customerId}
                                >
                                    <SelectTrigger className={`w-full bg-white/60 ${jobErrors.siteId ? "border-destructive focus-visible:ring-destructive/50" : ""}`}>
                                        <SelectValue placeholder={jobForm.customerId ? "Select site" : "Select customer first"} />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {customerSites.map((site) => (
                                            <SelectItem key={site.id} value={site.id}>{formatCustomerSiteLabel(site)}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                {jobErrors.siteId && <p className="text-xs text-destructive">{jobErrors.siteId}</p>}
                                <p className="text-xs text-muted-foreground">
                                    {jobForm.siteId
                                        ? formatCustomerSiteAddress(customerSites.find((site) => site.id === jobForm.siteId)) || "No address saved for this site."
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
                                    value={jobForm.address}
                                    onChange={(address) => setJobForm((prev) => ({
                                        ...prev,
                                        address,
                                        addressManuallyEdited: true,
                                        location: formatJobAddressForPayload(address),
                                    }))}
                                />
                                {jobErrors.location && <p className="text-xs text-destructive">{jobErrors.location}</p>}
                            </div>
                            <div className="space-y-2">
                                <Label required>Priority</Label>
                                <Select value={jobForm.priority} onValueChange={(value) => setJobForm((prev) => ({ ...prev, priority: value }))}>
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
                                <Label required>Start</Label>
                                <DatePicker
                                    selected={jobForm.scheduledAt}
                                    onChange={(date: Date | null) => setJobForm((prev) => ({ ...prev, scheduledAt: date }))}
                                    showTimeSelect
                                    timeFormat="HH:mm"
                                    timeIntervals={15}
                                    dateFormat="MMM d, yyyy h:mm aa"
                                    className={`h-9 w-full rounded-md border border-input bg-white/60 px-3 text-sm shadow-sm ${jobErrors.scheduledAt ? "border-destructive focus-visible:ring-destructive/50" : ""}`}
                                    placeholderText="Select start time"
                                />
                                {jobErrors.scheduledAt && <p className="text-xs text-destructive">{jobErrors.scheduledAt}</p>}
                            </div>
                            <div className="space-y-2">
                                <Label required>End</Label>
                                <DatePicker
                                    selected={jobForm.scheduledEndAt}
                                    onChange={(date: Date | null) => setJobForm((prev) => ({ ...prev, scheduledEndAt: date }))}
                                    showTimeSelect
                                    timeFormat="HH:mm"
                                    timeIntervals={15}
                                    dateFormat="MMM d, yyyy h:mm aa"
                                    className={`h-9 w-full rounded-md border border-input bg-white/60 px-3 text-sm shadow-sm ${jobErrors.scheduledEndAt ? "border-destructive focus-visible:ring-destructive/50" : ""}`}
                                    placeholderText="Select end time"
                                />
                                {jobErrors.scheduledEndAt && <p className="text-xs text-destructive">{jobErrors.scheduledEndAt}</p>}
                            </div>
                            <div className="space-y-2 md:col-span-2">
                                <Label optional>Description</Label>
                                <Input value={jobForm.description} onChange={(e) => setJobForm((prev) => ({ ...prev, description: e.target.value }))} />
                            </div>
                        </div>
                        </GlassModal>
                        ) : null}
                        </div>
                </div>
            </div>

            {plannerNotes ? (
                <GlassModal
                    open={isPlannerNoteOpen}
                    onOpenChange={(open) => {
                        if (!open) {
                            closePlannerNoteModal()
                            return
                        }
                        setIsPlannerNoteOpen(true)
                    }}
                    title={editingPlannerNoteId ? "Edit Planner Note" : "Create Planner Note"}
                    description="Add internal non-job schedule blocks such as holiday, training, meeting, or unavailable time."
                    footer={
                        <div className="flex w-full items-center justify-between gap-2">
                            <div>
                                {editingPlannerNoteId ? (
                                    <Button
                                        variant="outline"
                                        className="border-destructive/30 text-destructive hover:bg-destructive/10"
                                        onClick={async () => {
                                            if (!editingPlannerNoteId) return
                                            if (typeof window !== "undefined" && !window.confirm("Remove this planner note from the schedule?")) {
                                                return
                                            }
                                            try {
                                                await apiDelete(`/planner-notes/${editingPlannerNoteId}`, { confirmed: true })
                                                setPlannerNoteItems((prev) => prev.filter((note) => note.id !== editingPlannerNoteId))
                                                closePlannerNoteModal()
                                                toast({
                                                    title: "Planner Note Removed",
                                                    description: "The internal schedule block has been deleted.",
                                                    variant: "success",
                                                })
                                            } catch (err: any) {
                                                toast({
                                                    title: "Delete Failed",
                                                    description: err?.message ?? "Failed to delete planner note.",
                                                    variant: "error",
                                                })
                                            }
                                        }}
                                    >
                                        <Trash2 className="mr-2 h-4 w-4" /> Remove
                                    </Button>
                                ) : <span />}
                            </div>
                            <div className="flex gap-2">
                                <Button variant="outline" onClick={closePlannerNoteModal}>Cancel</Button>
                                <Button
                                    onClick={async () => {
                                        try {
                                            if (!canManage) {
                                                toast({
                                                    title: "Insufficient permissions",
                                                    description: "You can view scheduling but cannot manage planner notes.",
                                                    variant: "error",
                                                })
                                                return
                                            }

                                            const nextErrors: { title?: string; userId?: string; date?: string; endDate?: string } = {}
                                            if (!plannerNoteForm.title.trim()) {
                                                nextErrors.title = "Title is required."
                                            }
                                            if (!plannerNoteForm.userId) {
                                                nextErrors.userId = "Please select a team member."
                                            }
                                            if (!plannerNoteForm.date) {
                                                nextErrors.date = "Date is required."
                                            }
                                            if (plannerNoteForm.endDate && plannerNoteForm.date && plannerNoteForm.endDate < plannerNoteForm.date) {
                                                nextErrors.endDate = "End date cannot be before the start date."
                                            }
                                            setPlannerNoteErrors(nextErrors)
                                            if (Object.keys(nextErrors).length > 0) {
                                                return
                                            }

                                            const payload: {
                                                title: string
                                                userId: string
                                                kind: string
                                                date: string
                                                endDate: string | null
                                                notes?: string
                                                remindAssignee?: boolean
                                            } = {
                                                title: plannerNoteForm.title.trim(),
                                                userId: plannerNoteForm.userId,
                                                kind: plannerNoteForm.kind,
                                                date: toPlannerDateValue(plannerNoteForm.date),
                                                endDate: plannerNoteForm.endDate ? toPlannerDateValue(plannerNoteForm.endDate) : null,
                                                notes: plannerNoteForm.notes.trim() || undefined,
                                            }
                                            if (!editingPlannerNoteId) {
                                                payload.remindAssignee = plannerNoteForm.remindAssignee
                                            }

                                            if (editingPlannerNoteId) {
                                                const updated = await apiPut<PlannerNote>(`/planner-notes/${editingPlannerNoteId}`, payload)
                                                setPlannerNoteItems((prev) =>
                                                    prev.map((note) => (note.id === editingPlannerNoteId ? updated.data : note)),
                                                )
                                                toast({
                                                    title: "Planner Note Updated",
                                                    description: "The internal schedule block has been saved.",
                                                    variant: "success",
                                                })
                                            } else {
                                                const created = await apiPost<PlannerNote>("/planner-notes", payload)
                                                setPlannerNoteItems((prev) =>
                                                    [...prev, created.data].sort((a, b) => String(a.date).localeCompare(String(b.date))),
                                                )
                                                toast({
                                                    title: "Planner Note Added",
                                                    description: "The internal schedule block is now visible in planning views.",
                                                    variant: "success",
                                                })
                                            }

                                            closePlannerNoteModal()
                                        } catch (err: any) {
                                            toast({
                                                title: editingPlannerNoteId ? "Update Failed" : "Create Failed",
                                                description: err?.message ?? "Failed to save planner note.",
                                                variant: "error",
                                            })
                                        }
                                    }}
                                >
                                    {editingPlannerNoteId ? "Save Changes" : "Create Planner Note"}
                                </Button>
                            </div>
                        </div>
                    }
                >
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                        <div className="space-y-2">
                            <Label required>Title</Label>
                            <Input
                                value={plannerNoteForm.title}
                                className={plannerNoteErrors.title ? "border-destructive focus-visible:ring-destructive/50" : ""}
                                onChange={(e) => setPlannerNoteForm((prev) => ({ ...prev, title: e.target.value }))}
                                placeholder="Holiday, training, meeting..."
                            />
                            {plannerNoteErrors.title ? <p className="text-xs text-destructive">{plannerNoteErrors.title}</p> : null}
                        </div>
                        <div className="space-y-2">
                            <Label required>Team Member</Label>
                            <Select
                                value={plannerNoteForm.userId}
                                createOption={{ label: "employee", href: "/admin/team?create=employee" }}
                                onValueChange={(value) => setPlannerNoteForm((prev) => ({ ...prev, userId: value }))}
                            >
                                <SelectTrigger className="w-full bg-white/60">
                                    <SelectValue placeholder="Select team member" />
                                </SelectTrigger>
                                <SelectContent>
                                    {plannerUsers.map((user) => (
                                        <SelectItem key={user.id} value={user.id}>
                                            {user.fullName}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            {plannerNoteErrors.userId ? <p className="text-xs text-destructive">{plannerNoteErrors.userId}</p> : null}
                        </div>
                        <div className="space-y-2">
                            <Label required>Type</Label>
                            <Select value={plannerNoteForm.kind} onValueChange={(value) => setPlannerNoteForm((prev) => ({ ...prev, kind: value }))}>
                                <SelectTrigger className="w-full bg-white/60">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {plannerNoteKinds.map((option) => (
                                        <SelectItem key={option.value} value={option.value}>
                                            {option.label}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <Label required>Start Date</Label>
                            <DatePicker
                                selected={plannerNoteForm.date}
                                onChange={(date: Date | null) => setPlannerNoteForm((prev) => ({ ...prev, date: date ?? new Date() }))}
                                dateFormat="MMM d, yyyy"
                                className={`h-9 w-full rounded-md border border-input bg-white/60 px-3 text-sm shadow-sm ${plannerNoteErrors.date ? "border-destructive focus-visible:ring-destructive/50" : ""}`}
                                placeholderText="Select start date"
                            />
                            {plannerNoteErrors.date ? <p className="text-xs text-destructive">{plannerNoteErrors.date}</p> : null}
                        </div>
                        <div className="space-y-2">
                            <Label optional>End Date</Label>
                            <DatePicker
                                selected={plannerNoteForm.endDate}
                                onChange={(date: Date | null) => setPlannerNoteForm((prev) => ({ ...prev, endDate: date }))}
                                minDate={plannerNoteForm.date}
                                isClearable
                                dateFormat="MMM d, yyyy"
                                className={`h-9 w-full rounded-md border border-input bg-white/60 px-3 text-sm shadow-sm ${plannerNoteErrors.endDate ? "border-destructive focus-visible:ring-destructive/50" : ""}`}
                                placeholderText="Optional end date"
                            />
                            {plannerNoteErrors.endDate ? <p className="text-xs text-destructive">{plannerNoteErrors.endDate}</p> : null}
                        </div>
                        {!editingPlannerNoteId ? (
                            <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-glass-border bg-white/45 p-3 md:col-span-2">
                                <Checkbox
                                    checked={plannerNoteForm.remindAssignee}
                                    onCheckedChange={(checked) =>
                                        setPlannerNoteForm((prev) => ({ ...prev, remindAssignee: Boolean(checked) }))
                                    }
                                />
                                <span className="space-y-1">
                                    <span className="block text-sm font-medium text-foreground">Remind assignee on start date</span>
                                    <span className="block text-xs text-muted-foreground">
                                        Send an in-app notification to the selected team member when this planner entry date arrives.
                                    </span>
                                </span>
                            </label>
                        ) : null}
                        <div className="space-y-2 md:col-span-2">
                            <Label optional>Notes</Label>
                            <Textarea
                                value={plannerNoteForm.notes}
                                onChange={(e) => setPlannerNoteForm((prev) => ({ ...prev, notes: e.target.value }))}
                                className="min-h-24 bg-white/60"
                                placeholder="Optional internal details for planners."
                            />
                        </div>
                    </div>
                </GlassModal>
            ) : null}

            {activeSection === 'planner-notes' && view === 'list' ? (
                <GlassPanel className="p-0 overflow-hidden">
                    <div className="border-b border-glass-border bg-white/35 px-4 py-3">
                        <div className="text-base font-semibold text-foreground">Planner Notes</div>
                        <div className="text-sm text-muted-foreground">Internal holiday, training, meeting, and unavailable blocks for the planning team.</div>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead className="bg-white/30">
                                <tr className="text-left text-muted-foreground">
                                    <th className="px-4 py-3 font-semibold">Note</th>
                                    <th className="px-4 py-3 font-semibold">Team Member</th>
                                    <th className="px-4 py-3 font-semibold">Type</th>
                                    <th className="px-4 py-3 font-semibold">Date</th>
                                    <th className="px-4 py-3 font-semibold">Notes</th>
                                    <th className="px-4 py-3 font-semibold text-right">Action</th>
                                </tr>
                            </thead>
                            <tbody>
                                {plannerNotesPagination.paginatedItems.map((note) => (
                                    <tr key={note.id} className="border-t border-glass-border/60 hover:bg-white/40 transition-colors">
                                        <td className="px-4 py-3 font-medium text-foreground">{note.title}</td>
                                        <td className="px-4 py-3">
                                            <div className="flex flex-col">
                                                <span>{note.userName}</span>
                                                <span className="text-xs text-muted-foreground">{note.userEmail ?? "—"}</span>
                                            </div>
                                        </td>
                                        <td className="px-4 py-3">
                                            <Badge variant="secondary" className={getPlannerNoteVisualClass(note)}>{formatPlannerKind(note.kind)}</Badge>
                                        </td>
                                        <td className="px-4 py-3">
                                            <div className="font-medium">{formatPlannerDate(note.date)}</div>
                                            <div className="text-xs text-muted-foreground">
                                                {note.endDate && note.endDate !== note.date ? `to ${formatPlannerDate(note.endDate)}` : "Single day"}
                                            </div>
                                        </td>
                                        <td className="px-4 py-3 text-muted-foreground">{note.notes ?? "—"}</td>
                                        <td className="px-4 py-3 text-right">
                                            <Button variant="outline" size="sm" className="gap-2 bg-white/50" onClick={() => openEditPlannerNote(note)}>
                                                <Pencil className="h-4 w-4" /> Edit
                                            </Button>
                                        </td>
                                    </tr>
                                ))}
                                {filteredPlannerNotes.length === 0 ? (
                                    <tr>
                                        <td className="px-4 py-6 text-muted-foreground" colSpan={6}>No planner notes match the current search.</td>
                                    </tr>
                                ) : null}
                            </tbody>
	                            </table>
	                    </div>
	                    <DataPagination {...plannerNotesPagination} onPageChange={plannerNotesPagination.setPage} />
	                </GlassPanel>
            ) : null}

            {activeSection === 'planner-notes' && (view === 'grid' || view === 'week' || view === 'day') ? (
                <GlassPanel className="p-0 overflow-hidden">
                    <div className="flex flex-col gap-2 border-b border-glass-border bg-white/35 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                            <div className="text-base font-semibold text-foreground">Engineer Planner</div>
                            <div className="text-sm text-muted-foreground">
                                Rows are dates, columns are engineers. Job entries and non-job planner notes appear in the same cell.
                            </div>
                        </div>
                        {renderInlineDateNavigator(
                            view === "day"
                                ? format(currentDate, "dd MMM yyyy")
                                : view === "week"
                                    ? `${format(plannerGridDays[0], "dd MMM")} - ${format(plannerGridDays[plannerGridDays.length - 1], "dd MMM yyyy")}`
                                    : format(currentDate, "MMMM yyyy")
                        )}
                    </div>
                    <div className="overflow-auto">
                        <table className="min-w-full border-separate border-spacing-0 text-sm">
                            <thead>
                                <tr>
                                    <th className="sticky left-0 top-0 z-30 w-36 min-w-36 border-b border-r border-glass-border bg-white/90 px-3 py-3 text-left font-semibold text-muted-foreground backdrop-blur">
                                        Date
                                    </th>
                                    {visiblePlannerUsers.map((user) => (
                                        <th
                                            key={user.id}
                                            className="sticky top-0 z-20 min-w-[260px] border-b border-r border-glass-border bg-white/90 px-3 py-3 text-left backdrop-blur"
                                        >
                                            <div className="font-semibold text-foreground">{user.fullName}</div>
                                            <div className="text-xs text-muted-foreground">{user.email ?? "Engineer"}</div>
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {plannerGridDays.map((day) => {
                                    const dayKey = format(day, "yyyy-MM-dd")
                                    const holidays = getHolidayTitles(day)
                                    const nonWorking = !isWorkingDay(day) || holidays.length > 0
                                    return (
                                        <tr key={dayKey}>
                                            <td className={`sticky left-0 z-10 border-b border-r border-glass-border px-3 py-3 align-top backdrop-blur ${nonWorking ? "bg-amber-50/90" : "bg-white/85"}`}>
                                                <div className="font-semibold text-foreground">{format(day, "dd MMM")}</div>
                                                <div className="text-xs text-muted-foreground">{format(day, "EEEE")}</div>
                                                {holidays.length > 0 ? (
                                                    <div className="mt-1 text-[11px] font-semibold text-amber-700">{holidays.join(", ")}</div>
                                                ) : !isWorkingDay(day) ? (
                                                    <div className="mt-1 text-[11px] font-semibold text-amber-700">Non-working day</div>
                                                ) : null}
                                            </td>
                                            {visiblePlannerUsers.map((user) => {
                                                const cellKey = `${dayKey}:${user.id}`
                                                const cellEntries = plannerEntriesByCell.get(cellKey) ?? []
                                                const cellNotes = plannerNotesByCell.get(cellKey) ?? []
                                                return (
                                                    <td key={cellKey} className={`min-w-[260px] border-b border-r border-glass-border p-2 align-top ${nonWorking ? "bg-amber-50/35" : "bg-white/35"}`}>
                                                        <div className="min-h-[92px] space-y-2">
                                                            {cellEntries.map((entry) => (
                                                                <button
                                                                    key={entry.id}
                                                                    type="button"
                                                                    className={`w-full rounded-xl border bg-white/85 p-2 text-left shadow-sm transition hover:border-primary/40 hover:bg-white ${
                                                                        entry.isMultiDay ? "border-l-4 border-l-red-500" : "border-glass-border"
                                                                    }`}
                                                                    onClick={() => router.push(`/admin/schedule/${entry.jobId}`)}
                                                                >
                                                                    <div className="mb-1 flex items-center justify-between gap-2">
                                                                        <RecordNumberBadge value={entry.jobNumber ?? undefined} />
                                                                        <Briefcase className="h-3.5 w-3.5 text-muted-foreground" />
                                                                    </div>
                                                                    <div className="line-clamp-2 font-semibold text-foreground">{entry.jobTitle}</div>
                                                                    <div className="mt-1 text-xs text-muted-foreground">
                                                                        {[entry.siteName, entry.customerName].filter(Boolean).join(" • ") || "Job"}
                                                                    </div>
                                                                    {entry.isMultiDay ? (
                                                                        <div className="mt-1 text-[11px] font-semibold text-red-700">Multi-day job</div>
                                                                    ) : null}
                                                                </button>
                                                            ))}
                                                            {cellNotes.map((note) => (
                                                                <button
                                                                    key={`${note.id}-${dayKey}`}
                                                                    type="button"
                                                                    className={`w-full rounded-xl border p-2 text-left shadow-sm transition hover:brightness-105 ${getPlannerNoteVisualClass(note)}`}
                                                                    onClick={() => openEditPlannerNote(note)}
                                                                >
                                                                    <div className="text-xs font-semibold uppercase tracking-wide">{formatPlannerKind(note.kind)}</div>
                                                                    <div className="mt-0.5 line-clamp-2 font-semibold">{note.title}</div>
                                                                    {note.notes ? <div className="mt-1 line-clamp-2 text-xs opacity-80">{note.notes}</div> : null}
                                                                </button>
                                                            ))}
                                                            {cellEntries.length === 0 && cellNotes.length === 0 ? (
                                                                <button
                                                                    type="button"
                                                                    className="flex w-full items-center justify-center rounded-xl border border-dashed border-glass-border bg-white/30 px-2 py-3 text-xs font-medium text-muted-foreground transition hover:border-primary/40 hover:text-primary"
                                                                    onClick={() => openCreatePlannerNote({ userId: user.id, date: day })}
                                                                    disabled={!canManage}
                                                                >
                                                                    <Plus className="mr-1 h-3.5 w-3.5" /> Add entry
                                                                </button>
                                                            ) : (
                                                                <Button
                                                                    variant="ghost"
                                                                    size="sm"
                                                                    className="h-7 w-full gap-1 text-xs"
                                                                    onClick={() => openCreatePlannerNote({ userId: user.id, date: day })}
                                                                    disabled={!canManage}
                                                                >
                                                                    <Plus className="h-3.5 w-3.5" /> Add note
                                                                </Button>
                                                            )}
                                                        </div>
                                                    </td>
                                                )
                                            })}
                                        </tr>
                                    )
                                })}
                                {visiblePlannerUsers.length === 0 ? (
                                    <tr>
                                        <td className="px-4 py-8 text-muted-foreground" colSpan={2}>
                                            No engineers match the current planner filter.
                                        </td>
                                    </tr>
                                ) : null}
                            </tbody>
                        </table>
                    </div>
                    <div className="flex items-center gap-2 border-t border-glass-border bg-white/35 px-4 py-3 text-xs text-muted-foreground">
                        <CalendarDays className="h-4 w-4" />
                        Red left border means the job spans multiple days.
                    </div>
                </GlassPanel>
            ) : null}

            {activeSection === 'planner-notes' && view === 'month' ? (
                <GlassPanel className="p-0 overflow-hidden">
                    <div className="flex flex-col gap-2 border-b border-glass-border bg-white/35 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                            <div className="text-base font-semibold text-foreground">Planner Month</div>
                            <div className="text-sm text-muted-foreground">Calendar-style month view showing all selected engineers.</div>
                        </div>
                        {renderInlineDateNavigator(format(currentDate, "MMMM yyyy"))}
                    </div>
                    <div className="grid grid-cols-7 border-b border-glass-border bg-white/50 text-center text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day) => (
                            <div key={day} className="border-r border-glass-border px-2 py-2 last:border-r-0">{day}</div>
                        ))}
                    </div>
                    <div className="grid grid-cols-7">
                        {plannerMonthCalendarDays.map((day) => {
                            const dayKey = format(day, "yyyy-MM-dd")
                            const inCurrentMonth = day.getMonth() === currentDate.getMonth()
                            const holidays = getHolidayTitles(day)
                            const nonWorking = !isWorkingDay(day) || holidays.length > 0
                            const visibleUserSet = new Set(visiblePlannerUsers.map((user) => user.id))
                            const dayEntries = filteredPlannerEntries.filter((entry) => entry.date === dayKey && visibleUserSet.has(entry.userId))
                            const dayNotes = filteredPlannerNotes.filter((note) => {
                                if (!visibleUserSet.has(note.userId)) return false
                                const start = parsePlannerDate(note.date)
                                if (!start) return false
                                const end = parsePlannerDate(note.endDate ?? note.date) ?? start
                                return day >= start && day <= end
                            })
                            return (
                                <div
                                    key={dayKey}
                                    className={`min-h-[170px] border-b border-r border-glass-border p-2 ${inCurrentMonth ? nonWorking ? "bg-amber-50/35" : "bg-white/35" : "bg-slate-100/40 text-muted-foreground"}`}
                                >
                                    <div className="mb-2 flex items-start justify-between gap-2">
                                        <div>
                                            <div className="font-semibold">{format(day, "d")}</div>
                                            {holidays.length > 0 ? <div className="text-[11px] font-semibold text-amber-700">{holidays[0]}</div> : null}
                                        </div>
                                        {canManage && inCurrentMonth ? (
                                            <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => openCreatePlannerNote({ date: day })}>
                                                <Plus className="h-3.5 w-3.5" />
                                            </Button>
                                        ) : null}
                                    </div>
                                    <div className="space-y-1.5">
                                        {dayEntries.slice(0, 4).map((entry) => (
                                            <button
                                                key={entry.id}
                                                type="button"
                                                className={`w-full rounded-lg border bg-white/85 px-2 py-1.5 text-left text-xs shadow-sm hover:border-primary/40 ${entry.isMultiDay ? "border-l-4 border-l-red-500" : "border-glass-border"}`}
                                                onClick={() => router.push(`/admin/schedule/${entry.jobId}`)}
                                            >
                                                <div className="truncate font-semibold">{entry.jobNumber ?? entry.jobTitle}</div>
                                                <div className="truncate text-muted-foreground">{entry.userName}</div>
                                            </button>
                                        ))}
                                        {dayNotes.slice(0, Math.max(0, 4 - dayEntries.length)).map((note) => (
                                            <button
                                                key={`${note.id}-${dayKey}`}
                                                type="button"
                                                className={`w-full rounded-lg border px-2 py-1.5 text-left text-xs ${getPlannerNoteVisualClass(note)}`}
                                                onClick={() => openEditPlannerNote(note)}
                                            >
                                                <div className="truncate font-semibold">{note.title}</div>
                                                <div className="truncate opacity-80">{note.userName}</div>
                                            </button>
                                        ))}
                                        {dayEntries.length + dayNotes.length > 4 ? (
                                            <div className="text-[11px] font-medium text-muted-foreground">
                                                +{dayEntries.length + dayNotes.length - 4} more
                                            </div>
                                        ) : null}
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                </GlassPanel>
            ) : null}

            {activeSection === 'jobs' && view === 'calendar' && (
                <GlassPanel className="p-0 overflow-hidden flex flex-col h-[calc(100vh-12rem)] min-h-[600px]">
                    {/* Calendar Header */}
                    <div className="grid grid-cols-7 border-b border-glass-border bg-white/40">
                        {days.map((day, i) => (
                            <div key={i} className={`p-3 text-center border-l first:border-l-0 border-glass-border ${format(day, 'yyyy-MM-dd') === format(currentDate, 'yyyy-MM-dd') ? 'bg-primary/5' : ''}`}>
                                <div className="text-xs font-semibold text-muted-foreground uppercase">{format(day, 'EEE')}</div>
                                <div className={`text-xl font-bold mt-1 ${format(day, 'yyyy-MM-dd') === format(currentDate, 'yyyy-MM-dd') ? 'text-primary' : 'text-foreground'}`}>
                                    {format(day, 'd')}
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Calendar Body Area */}
                    <div className="flex-1 overflow-y-auto bg-grid-slate-100/[0.04]">
                        <div className="grid grid-cols-7 min-h-max">
                            {days.map((day) => {
                                const dayString = format(day, 'yyyy-MM-dd')
                                const dayStart = new Date(day)
                                dayStart.setHours(0, 0, 0, 0)
                                const dayEnd = new Date(dayStart)
                                dayEnd.setDate(dayEnd.getDate() + 1)
                                const dayJobs = filteredJobs.filter((job) => {
                                    if (!job?.scheduledAt) return false
                                    const start = new Date(job.scheduledAt)
                                    if (Number.isNaN(start.getTime())) return false
                                    const rawEnd = job.scheduledEndAt ? new Date(job.scheduledEndAt) : new Date(start.getTime() + 60 * 60 * 1000)
                                    if (Number.isNaN(rawEnd.getTime())) return false
                                    const end = rawEnd > start ? rawEnd : new Date(start.getTime() + 60 * 60 * 1000)
                                    return end > dayStart && start < dayEnd
                                })
                                const dayEntries: ScheduleCalendarEntry[] = [
                                    ...dayJobs.map((job) => ({ type: "job" as const, item: job })),
                                ]

                                return (
                                    <DayColumn
                                        key={dayString}
                                        day={day}
                                        dayEntries={dayEntries}
                                        onJobClick={(jobId) => router.push(`/admin/schedule/${jobId}`)}
                                        onPlannerNoteClick={openEditPlannerNote}
                                        getJobVisualClass={getJobVisualClass}
                                        getPlannerNoteVisualClass={getPlannerNoteVisualClass}
                                        emptyMessage="No jobs scheduled"
                                    />
                                )
                            })}
                        </div>
                    </div>
                </GlassPanel>
            )}

            {activeSection === 'jobs' && view === 'list' && (
                <div className="space-y-4">
                    <GlassPanel className="p-0 overflow-hidden">
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead className="bg-white/40">
                                    <tr className="text-left text-muted-foreground">
                                        <th className="px-4 py-3 font-semibold">Job</th>
                                        <th className="px-4 py-3 font-semibold">Client</th>
                                        <th className="px-4 py-3 font-semibold">{sitesEnabled ? "Site & Location" : "Location"}</th>
                                        <th className="px-4 py-3 font-semibold">Status</th>
                                        <th className="px-4 py-3 font-semibold">Scheduled</th>
                                        <th className="px-4 py-3 font-semibold">Priority</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {jobsPagination.paginatedItems.map((job) => (
                                        <tr key={job.id} className="border-t border-glass-border/60 hover:bg-white/40 transition-colors">
                                            <td className="px-4 py-3">
                                                <button
                                                    type="button"
                                                    className="text-left space-y-1"
                                                    onClick={() => router.push(`/admin/schedule/${job.id}`)}
                                                >
                                                    <RecordNumberBadge value={job.jobNumber} />
                                                    <div className="font-semibold text-primary hover:underline">{job.title ?? job.clientName ?? "Job"}</div>
                                                </button>
                                            </td>
                                            <td className="px-4 py-3">{getClientName(job)}</td>
                                            <td className="px-4 py-3">
                                                {sitesEnabled ? (
                                                    <div className="flex flex-col">
                                                        <span>{job.siteName ?? "No linked site"}</span>
                                                        <span className="text-xs text-muted-foreground">{job.location ?? "—"}</span>
                                                    </div>
                                                ) : (
                                                    <span>{job.location ?? "—"}</span>
                                                )}
                                            </td>
                                            <td className="px-4 py-3">
                                                <StatusBadge status={getJobBaseStatusLabel(job)}>
                                                    {getJobWorkflowStatusLabel(job)}
                                                </StatusBadge>
                                            </td>
                                            <td className="px-4 py-3">
                                                <div className="text-xs text-muted-foreground">From</div>
                                                <div className="font-medium">{formatSchedulePoint(job.scheduledAt)}</div>
                                                <div className="mt-1 text-xs text-muted-foreground">To</div>
                                                <div className="font-medium">{formatSchedulePoint(job.scheduledEndAt)}</div>
                                            </td>
                                            <td className="px-4 py-3">
                                                <Badge className="capitalize" variant="secondary">{job.priority ?? "Medium"}</Badge>
                                            </td>
                                        </tr>
                                    ))}
                                    {filteredJobs.length === 0 && (
                                        <tr>
                                            <td className="px-4 py-6 text-muted-foreground" colSpan={6}>
                                                <div className="flex flex-col items-center gap-3">
                                                    <span>{jobs.length === 0 ? "No jobs yet." : "No jobs match the current filters."}</span>
                                                    {jobs.length === 0 && canManage ? (
                                                        <Button size="sm" className="gap-2" onClick={() => setIsNewJobOpen(true)}>
                                                            <Plus className="h-4 w-4" /> Create Job
                                                        </Button>
                                                    ) : null}
                                                </div>
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
	                            </table>
	                        </div>
	                        <DataPagination {...jobsPagination} onPageChange={jobsPagination.setPage} />
	                    </GlassPanel>
                </div>
            )}

            {activeSection === 'jobs' && view === 'kanban' && (
                <div className="space-y-4">
                    <GlassPanel className="p-3 sm:p-4">
                        <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                            <div>
                                <h2 className="text-base font-semibold text-foreground">Job Board</h2>
                                <p className="text-xs text-muted-foreground">
                                    Drag-style lifecycle overview with all statuses kept in one row for easier scanning.
                                </p>
                            </div>
                            <Badge variant="secondary" className="w-fit">
                                {filteredJobs.length} job{filteredJobs.length === 1 ? "" : "s"}
                            </Badge>
                        </div>
                        <div className="-mx-3 overflow-x-auto px-3 pb-2 sm:-mx-4 sm:px-4">
                            <div className="flex min-w-max gap-4">
                                {orderedKanbanColumns.map((column) => {
                                    const columnJobs = kanbanBuckets[column.key] ?? []
                                    return (
                                        <section
                                            key={column.key}
                                            className="flex h-[calc(100vh-19rem)] min-h-[520px] w-[310px] shrink-0 flex-col rounded-2xl border border-glass-border bg-white/45 shadow-sm"
                                        >
                                            <div
                                                className="sticky top-0 z-10 cursor-grab rounded-t-2xl border-b border-glass-border bg-white/85 px-4 py-3 backdrop-blur active:cursor-grabbing"
                                                title="Drag to rearrange columns"
                                                {...getColumnDragProps(column)}
                                            >
                                                <div className="flex items-center justify-between gap-3">
                                                    <StatusBadge status={column.tone}>{column.label}</StatusBadge>
                                                    <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-semibold text-muted-foreground">
                                                        {columnJobs.length}
                                                    </span>
                                                </div>
                                            </div>
                                            <div className="flex-1 space-y-3 overflow-y-auto p-3">
                                                {columnJobs.map((job) => (
                                                    <button
                                                        key={job.id}
                                                        type="button"
                                                        className="group w-full rounded-2xl border border-glass-border bg-white/80 p-3 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-primary/40 hover:bg-white hover:shadow-md"
                                                        onClick={() => router.push(`/admin/schedule/${job.id}`)}
                                                    >
                                                        <div className="flex items-start justify-between gap-3">
                                                            <div className="min-w-0">
                                                                <RecordNumberBadge value={job.jobNumber} className="mb-2" />
                                                                <div className="line-clamp-2 text-sm font-semibold leading-snug text-foreground">
                                                                    {job.title ?? job.clientName ?? "Job"}
                                                                </div>
                                                            </div>
                                                            <Badge
                                                                variant={job.priority === "Emergency" ? "destructive" : "secondary"}
                                                                className="shrink-0 text-[10px] capitalize"
                                                            >
                                                                {job.priority ?? "Medium"}
                                                            </Badge>
                                                        </div>
                                                        <div className="mt-3 flex items-start gap-2 rounded-xl bg-slate-50/80 px-2.5 py-2 text-xs text-muted-foreground">
                                                            <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                                                            <span className="line-clamp-2">{getJobSiteLine(job)}</span>
                                                        </div>
                                                        <div className="mt-3 grid gap-1.5 text-xs text-muted-foreground">
                                                            <div className="flex items-center justify-between gap-2">
                                                                <span>Start</span>
                                                                <strong className="text-right font-medium text-foreground">{formatSchedulePoint(job.scheduledAt)}</strong>
                                                            </div>
                                                            <div className="flex items-center justify-between gap-2">
                                                                <span>End</span>
                                                                <strong className="text-right font-medium text-foreground">{formatSchedulePoint(job.scheduledEndAt)}</strong>
                                                            </div>
                                                        </div>
                                                        <div className="mt-3">
                                                            <StatusBadge status={getJobBaseStatusLabel(job)} className="text-[10px]">
                                                                {getJobWorkflowStatusLabel(job)}
                                                            </StatusBadge>
                                                        </div>
                                                    </button>
                                                ))}
                                                {columnJobs.length === 0 && (
                                                    <div className="rounded-2xl border border-dashed border-glass-border bg-white/45 px-4 py-8 text-center text-xs text-muted-foreground">
                                                        No jobs in this stage
                                                    </div>
                                                )}
                                            </div>
                                        </section>
                                    )
                                })}
                            </div>
                        </div>
                    </GlassPanel>
                </div>
            )}
            <ErrorToast error={error} onClear={() => setError(null)} />
            </>
            )}
        </PageContainer>
    )
}

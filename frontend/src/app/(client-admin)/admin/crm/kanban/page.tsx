"use client"

import Link from "next/link"
import { useEffect, useMemo, useState } from "react"
import { PageContainer } from "@/components/layout/PageContainer"
import { GlassCard } from "@/components/glass/GlassCard"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { List, Search, Plus, Phone, UserRound } from "lucide-react"
import { apiGet, apiPost, apiPut } from "@/lib/api"
import { getAuth } from "@/lib/auth"
import { ErrorToast } from "@/components/shared/ErrorToast"
import { useSavedColumnOrder } from "@/components/shared/useSavedColumnOrder"
import { useToast } from "@/components/ui/toast"
import { getModulePermissions } from "@/lib/permission-ui"
import {
    DndContext,
    DragCancelEvent,
    DragEndEvent,
    DragOverlay,
    DragStartEvent,
    PointerSensor,
    useDraggable,
    useDroppable,
    useSensor,
    useSensors,
} from "@dnd-kit/core"
import { CSS } from "@dnd-kit/utilities"
import { AssignableUser, LEAD_SOURCE_OPTIONS, LeadFormDialog, LeadSubmitPayload } from "@/components/crm/LeadFormDialog"
import { AutocompleteOption } from "@/components/shared/CreatableAutocomplete"

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

const STATUS_COLUMNS: Array<{ id: "NEW" | "CONTACTED" | "QUALIFIED" | "CONVERTED" | "LOST"; title: string; color: string }> = [
    { id: "NEW", title: "New Lead", color: "bg-blue-500" },
    { id: "CONTACTED", title: "Contacted", color: "bg-amber-500" },
    { id: "QUALIFIED", title: "Qualified", color: "bg-violet-500" },
    { id: "CONVERTED", title: "Won", color: "bg-emerald-500" },
    { id: "LOST", title: "Lost", color: "bg-rose-500" },
]

const formatLeadStatus = (status?: string) => {
    const normalized = (status ?? "").toUpperCase()
    switch (normalized) {
        case "NEW":
            return "NEW"
        case "CONTACTED":
            return "CONTACTED"
        case "QUALIFIED":
            return "QUALIFIED"
        case "CONVERTED":
        case "WON":
            return "CONVERTED"
        case "LOST":
            return "LOST"
        default:
            return "NEW"
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
    return LEAD_SOURCE_OPTIONS.find((item) => item.toLowerCase() === normalized) ?? "Other"
}

function DraggableLeadCard({
    lead,
    canManage,
}: {
    lead: Lead
    canManage: boolean
}) {
    const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
        id: lead.id,
        data: { leadId: lead.id, fromStatus: lead.status },
        disabled: !canManage,
    })

    return (
        <GlassCard
            ref={setNodeRef}
            {...attributes}
            {...listeners}
            className={`p-3 shadow-sm hover:shadow-md border-white/60 transition-[box-shadow,opacity,transform] duration-200 ease-out ${
                canManage ? "cursor-grab active:cursor-grabbing" : "cursor-default"
            } ${isDragging ? "opacity-25 scale-[0.98]" : "opacity-100"}`}
            style={{
                transform: CSS.Translate.toString(transform),
                transition: isDragging ? undefined : "transform 200ms cubic-bezier(0.22, 1, 0.36, 1)",
            }}
        >
            <Link href={`/admin/crm/${lead.id}`}>
                <div className="flex justify-between items-start mb-2">
                    <span className="text-xs font-semibold text-primary">{lead.company}</span>
                    <span className="text-xs font-medium bg-white/50 px-1.5 py-0.5 rounded border border-glass-border">
                        £{(lead.value / 1000).toFixed(1)}k
                    </span>
                </div>
                <h4 className="font-medium text-sm leading-tight mb-2">{lead.name}</h4>
                <div className="flex flex-col gap-1.5">
                    <div className="flex items-center text-xs text-muted-foreground gap-1.5">
                        <Phone className="h-3 w-3" /> {lead.phone || "No phone"}
                    </div>
                    <div className="flex items-center text-xs text-muted-foreground gap-1.5">
                        <UserRound className="h-3 w-3" /> {lead.assignedUserName || "Unassigned"}
                    </div>
                    {Array.isArray(lead.tags) && lead.tags.length > 0 ? (
                        <div className="mt-1 flex flex-wrap gap-1">
                            {lead.tags.slice(0, 3).map((tag) => (
                                <span key={tag} className="rounded-full border border-glass-border bg-white/60 px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                                    {tag}
                                </span>
                            ))}
                            {lead.tags.length > 3 ? (
                                <span className="rounded-full bg-black/5 px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                                    +{lead.tags.length - 3}
                                </span>
                            ) : null}
                        </div>
                    ) : null}
                    <div className="flex items-center justify-between mt-1">
                        <span className="text-[10px] uppercase font-semibold text-muted-foreground tracking-wider">
                            {lead.source}
                        </span>
                        <div className="h-5 w-5 rounded-full bg-primary/10 text-primary flex items-center justify-center text-[10px] font-bold">
                            {lead.name.charAt(0)}
                        </div>
                    </div>
                </div>
            </Link>
        </GlassCard>
    )
}

function DragLeadOverlay({ lead }: { lead: Lead }) {
    return (
        <GlassCard className="p-3 border-white/80 shadow-2xl ring-1 ring-primary/25 w-80 cursor-grabbing">
            <div className="flex justify-between items-start mb-2">
                <span className="text-xs font-semibold text-primary">{lead.company}</span>
                <span className="text-xs font-medium bg-white/50 px-1.5 py-0.5 rounded border border-glass-border">
                    £{(lead.value / 1000).toFixed(1)}k
                </span>
            </div>
            <h4 className="font-medium text-sm leading-tight mb-2">{lead.name}</h4>
            <div className="flex flex-col gap-1.5">
                <div className="flex items-center text-xs text-muted-foreground gap-1.5">
                    <Phone className="h-3 w-3" /> {lead.phone || "No phone"}
                </div>
                <div className="flex items-center justify-between mt-1">
                    <span className="text-[10px] uppercase font-semibold text-muted-foreground tracking-wider">
                        {lead.source}
                    </span>
                    <div className="h-5 w-5 rounded-full bg-primary/10 text-primary flex items-center justify-center text-[10px] font-bold">
                        {lead.name.charAt(0)}
                    </div>
                </div>
            </div>
        </GlassCard>
    )
}

function DroppableColumn({
    status,
    leads,
    canManage,
}: {
    status: string
    leads: Lead[]
    canManage: boolean
}) {
    const { setNodeRef, isOver } = useDroppable({
        id: status,
        disabled: !canManage,
    })

    return (
        <div
            ref={setNodeRef}
            className={`flex-1 bg-black/5 rounded-xl border border-glass-border/40 p-2 overflow-y-auto min-h-[440px] ${
                isOver ? "ring-1 ring-primary/40 bg-primary/5" : ""
            }`}
        >
            {leads.length === 0 ? (
                <div className="h-full w-full min-h-[420px] border-2 border-dashed border-glass-border rounded-lg flex items-center justify-center text-sm font-semibold tracking-wide text-foreground/80">
                    Drag & Drop
                </div>
            ) : (
                <div className="space-y-2">
                    {leads.map((lead) => (
                        <DraggableLeadCard key={lead.id} lead={lead} canManage={canManage} />
                    ))}
                </div>
            )}
        </div>
    )
}

export default function KanbanPage() {
    const { toast } = useToast()
    const { canView, canManage } = getModulePermissions("crm.view", "crm.manage")
    const [leads, setLeads] = useState<Lead[]>([])
    const [error, setError] = useState<string | null>(null)
    const [assignableUsers, setAssignableUsers] = useState<AssignableUser[]>([])
    const [currentUser, setCurrentUser] = useState<{ id: string; fullName?: string; email?: string } | null>(null)
    const [industryOptions, setIndustryOptions] = useState<AutocompleteOption[]>([])
    const [searchQuery, setSearchQuery] = useState("")
    const [sourceFilter, setSourceFilter] = useState<string>("all")
    const [isAddModalOpen, setIsAddModalOpen] = useState(false)
    const [isUpdatingStatus, setIsUpdatingStatus] = useState(false)
    const [activeLeadId, setActiveLeadId] = useState<string | null>(null)
    const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }))

    const loadLeads = async () => {
        try {
            const [response, usersRes, industriesRes] = await Promise.all([
                apiGet<any[]>("/leads"),
                apiGet<AssignableUser[]>("/leads/assignable-users"),
                apiGet<AutocompleteOption[]>("/lookups?type=lead_industry"),
            ])
            const mapped = response.data.map((lead) => ({
                id: lead.id,
                name: lead.name,
                company: lead.company ?? lead.notes ?? "—",
                email: lead.email,
                phone: lead.phone ?? "",
                source: toSourceLabel(lead.source),
                status: formatLeadStatus(lead.status),
                value: 0,
                createdAt: lead.createdAt,
                industry: lead.industry ?? "",
                tags: Array.isArray(lead.tags) ? lead.tags : [],
                assignedUserId: lead.assignedUserId ?? null,
                assignedUserName: lead.assignedUserName ?? null,
            })) as Lead[]
            setLeads(mapped)
            setAssignableUsers(Array.isArray(usersRes.data) ? usersRes.data : [])
            const existingIndustries = mapped
                .map((lead) => lead.industry?.trim())
                .filter((industry): industry is string => Boolean(industry))
                .map((title) => ({ title }))
            const industryByTitle = new Map(
                [...(Array.isArray(industriesRes.data) ? industriesRes.data : []), ...existingIndustries]
                    .map((option) => [option.title.toLowerCase(), option])
            )
            setIndustryOptions(Array.from(industryByTitle.values()).sort((a, b) => a.title.localeCompare(b.title)))
        } catch (err: any) {
            setError(err?.message ?? "Failed to load leads")
        }
    }

    useEffect(() => {
        setCurrentUser(getAuth()?.user ?? null)
        void loadLeads()
    }, [])

    const visibleLeads = useMemo(() => {
        const query = searchQuery.trim().toLowerCase()
        return leads.filter((lead) => {
            const sourceOk = sourceFilter === "all" || lead.source === sourceFilter
            if (!sourceOk) return false
            if (!query) return true
            return (
                lead.name.toLowerCase().includes(query) ||
                lead.company.toLowerCase().includes(query) ||
                lead.source.toLowerCase().includes(query) ||
                (lead.assignedUserName ?? "").toLowerCase().includes(query) ||
                (lead.industry ?? "").toLowerCase().includes(query)
            )
        })
    }, [leads, searchQuery, sourceFilter])

    const getLeadsByStatus = (status: string) =>
        visibleLeads.filter((lead) => lead.status === status)
    const { orderedColumns: orderedStatusColumns, getColumnDragProps } = useSavedColumnOrder(
        STATUS_COLUMNS,
        "pipstack:board-columns:admin-crm-pipeline",
        (column) => column.id
    )

    const mapLead = (lead: any): Lead => ({
        id: lead.id,
        name: lead.name,
        company: lead.company ?? lead.notes ?? "—",
        email: lead.email,
        phone: lead.phone ?? "",
        source: toSourceLabel(lead.source),
        status: formatLeadStatus(lead.status),
        value: 0,
        createdAt: lead.createdAt,
        industry: lead.industry ?? "",
        tags: Array.isArray(lead.tags) ? lead.tags : [],
        assignedUserId: lead.assignedUserId ?? null,
        assignedUserName: lead.assignedUserName ?? null,
    })

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

    const createLead = async (payload: LeadSubmitPayload) => {
        if (!canManage) {
            toast({
                title: "Insufficient permissions",
                description: "You can view leads but cannot create them.",
                variant: "error"
            })
            return
        }
        const response = await apiPost<any>("/leads", payload)
        setLeads((prev) => [mapLead(response.data), ...prev])
        toast({
            title: "Lead created",
            description: "Lead added to the pipeline.",
            variant: "success"
        })
    }

    const activeLead = useMemo(
        () => (activeLeadId ? leads.find((lead) => lead.id === activeLeadId) ?? null : null),
        [activeLeadId, leads],
    )

    const handleDragStart = (event: DragStartEvent) => {
        setActiveLeadId(String(event.active.id))
    }

    const handleDragCancel = (_event: DragCancelEvent) => {
        setActiveLeadId(null)
    }

    const handleDragEnd = async (event: DragEndEvent) => {
        setActiveLeadId(null)
        const leadId = String(event.active.id)
        const targetStatus = typeof event.over?.id === "string" ? event.over.id : null
        if (!targetStatus) return
        const currentLead = leads.find((lead) => lead.id === leadId)
        if (!currentLead || currentLead.status === targetStatus) return

        if (!canManage) {
            toast({
                title: "Insufficient permissions",
                description: "You can view leads but cannot change status.",
                variant: "error",
            })
            return
        }

        const previousStatus = currentLead.status
        setLeads((prev) =>
            prev.map((lead) => (lead.id === leadId ? { ...lead, status: targetStatus } : lead)),
        )
        setIsUpdatingStatus(true)
        try {
            await apiPut(`/leads/${leadId}`, { status: targetStatus })
            toast({
                title: "Status updated",
                description: `Lead moved to ${STATUS_COLUMNS.find((col) => col.id === targetStatus)?.title ?? targetStatus}.`,
                variant: "success",
            })
        } catch (err: any) {
            setLeads((prev) =>
                prev.map((lead) => (lead.id === leadId ? { ...lead, status: previousStatus } : lead)),
            )
            toast({
                title: "Update failed",
                description: err?.message ?? "Unable to update lead status.",
                variant: "error",
            })
        } finally {
            setIsUpdatingStatus(false)
        }
    }

    return (
        <PageContainer className="h-[calc(100vh-4rem)] flex flex-col">
            {!canView ? (
                <GlassCard className="p-6">You do not have access to view CRM leads.</GlassCard>
            ) : (
                <>
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4 shrink-0">
                        <div>
                            <h1 className="text-3xl font-bold tracking-tight text-foreground">Pipeline Board</h1>
                            <p className="text-muted-foreground mt-1 text-sm">Visual overview of all active deals.</p>
                        </div>

                        <div className="flex items-center gap-2 flex-wrap justify-end">
                            <div className="relative w-52">
                                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                                <Input
                                    placeholder="Search..."
                                    className="pl-9 bg-white/40 h-9"
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                />
                            </div>
                            <Select value={sourceFilter} onValueChange={setSourceFilter}>
                                <SelectTrigger className="w-[170px] bg-white/40 h-9">
                                    <SelectValue placeholder="Source" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">All sources</SelectItem>
                                    {LEAD_SOURCE_OPTIONS.map((option) => (
                                        <SelectItem key={option} value={option}>
                                            {option}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            <Button variant="outline" className="gap-2 bg-white/40" asChild>
                                <Link href="/admin/crm">
                                    <List className="h-4 w-4" /> List View
                                </Link>
                            </Button>

                            <LeadFormDialog
                                open={isAddModalOpen}
                                onOpenChange={setIsAddModalOpen}
                                mode="create"
                                assignableUsers={assignableUsers}
                                currentUser={currentUser}
                                industryOptions={industryOptions}
                                onCreateIndustry={createIndustryOption}
                                onSubmit={createLead}
                                trigger={
                                    <Button className="gap-2" disabled={!canManage}>
                                        <Plus className="h-4 w-4" /> Add Lead
                                    </Button>
                                }
                            />
                        </div>
                    </div>

                    <div className="flex-1 overflow-x-auto pb-4">
                        <DndContext
                            sensors={sensors}
                            onDragStart={handleDragStart}
                            onDragCancel={handleDragCancel}
                            onDragEnd={handleDragEnd}
                        >
                            <div className="flex gap-4 h-full min-w-max">
                                {orderedStatusColumns.map((column) => {
                                    const columnLeads = getLeadsByStatus(column.id)
                                    return (
                                        <div key={column.id} className="w-80 flex flex-col h-full">
                                            <div
                                                className="mb-3 flex shrink-0 cursor-grab items-center justify-between rounded-xl px-1 active:cursor-grabbing"
                                                title="Drag to rearrange columns"
                                                {...getColumnDragProps(column)}
                                            >
                                                <div className="flex items-center gap-2">
                                                    <div className={`w-2.5 h-2.5 rounded-full ${column.color}`} />
                                                    <h3 className="font-semibold text-sm">{column.title}</h3>
                                                </div>
                                                <span className="bg-black/5 text-muted-foreground text-xs font-semibold px-2 py-0.5 rounded-full">
                                                    {columnLeads.length}
                                                </span>
                                            </div>
                                            <DroppableColumn
                                                status={column.id}
                                                leads={columnLeads}
                                                canManage={canManage && !isUpdatingStatus}
                                            />
                                        </div>
                                    )
                                })}
                            </div>
                            <DragOverlay
                                dropAnimation={{
                                    duration: 220,
                                    easing: "cubic-bezier(0.22, 1, 0.36, 1)",
                                }}
                            >
                                {activeLead ? <DragLeadOverlay lead={activeLead} /> : null}
                            </DragOverlay>
                        </DndContext>
                    </div>
                    <ErrorToast error={error} onClear={() => setError(null)} />
                </>
            )}
        </PageContainer>
    )
}

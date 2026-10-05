"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { PageContainer } from "@/components/layout/PageContainer"
import { GlassCard, GlassCardContent, GlassCardHeader, GlassCardTitle } from "@/components/glass/GlassCard"
import { GlassModal } from "@/components/glass/GlassModal"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Search, Plus, MoreHorizontal, Phone, Globe, Users, ArrowRight, Kanban } from "lucide-react"
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
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { formatDistanceToNow } from "date-fns"
import { useRouter, useSearchParams } from "next/navigation"
import { apiGet, apiPost, apiPut } from "@/lib/api"
import { getAuth } from "@/lib/auth"
import { ErrorToast } from "@/components/shared/ErrorToast"
import { StatusBadge } from "@/components/shared/StatusBadge"
import { useToast } from "@/components/ui/toast"
import { getModulePermissions } from "@/lib/permission-ui"
import { formatLeadStatus } from "@/lib/status"
import { CustomerSiteOption, customerSiteToAddressValue, fetchCustomerSites, formatCustomerSiteAddress, formatCustomerSiteLabel } from "@/lib/customer-sites"
import { DataPagination, useClientPagination } from "@/components/shared/DataPagination"
import { useTenantFeatures } from "@/components/layout/TenantFeaturesContext"
import { AssignableUser, LEAD_SOURCE_OPTIONS, LeadFormDialog, LeadSubmitPayload } from "@/components/crm/LeadFormDialog"
import { AutocompleteOption } from "@/components/shared/CreatableAutocomplete"
import { AddressFields, emptyAddressValue, formatAddressValue, type AddressValue } from "@/components/shared/LocalizedFields"

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

export default function CRMLeadsPage() {
    const router = useRouter()
    const searchParams = useSearchParams()
    const { toast } = useToast()
    const { canView, canManage } = getModulePermissions("crm.view", "crm.manage")
    const { sites: sitesEnabled } = useTenantFeatures()
    const [leads, setLeads] = useState<Lead[]>([])
    const [error, setError] = useState<string | null>(null)
    const [customers, setCustomers] = useState<any[]>([])
    const [customerSites, setCustomerSites] = useState<CustomerSiteOption[]>([])
    const [assignableUsers, setAssignableUsers] = useState<AssignableUser[]>([])
    const [currentUser, setCurrentUser] = useState<{ id: string; fullName?: string; email?: string } | null>(null)
    const [industryOptions, setIndustryOptions] = useState<AutocompleteOption[]>([])
    const [searchQuery, setSearchQuery] = useState("")
    const [isAddModalOpen, setIsAddModalOpen] = useState(false)
    const [isConvertOpen, setIsConvertOpen] = useState(false)
    const [convertLeadId, setConvertLeadId] = useState<string | null>(null)
    const [convertForm, setConvertForm] = useState({
        customerId: "",
        siteId: "",
        location: "",
        address: emptyAddressValue(),
        addressManuallyEdited: false,
        priority: "Medium",
    })
    const [convertErrors, setConvertErrors] = useState<{ siteId?: string; location?: string }>({})
    const [isMarkLostOpen, setIsMarkLostOpen] = useState(false)
    const [markLostLeadId, setMarkLostLeadId] = useState<string | null>(null)
    const [statusFilter, setStatusFilter] = useState<string>("all")
    const [sourceFilter, setSourceFilter] = useState<string>("all")
    const [industryFilter, setIndustryFilter] = useState<string>("all")
    const [tagFilter, setTagFilter] = useState("")

    useEffect(() => {
        setCurrentUser(getAuth()?.user ?? null)
    }, [])

    useEffect(() => {
        if (searchParams.get("create") === "lead" && canManage) {
            setIsAddModalOpen(true)
        }
    }, [canManage, searchParams])

    const formatLeadStatus = (status?: string) => {
        switch ((status ?? "").toUpperCase()) {
            case "NEW": return "New"
            case "CONTACTED": return "Contacted"
            case "QUALIFIED": return "Qualified"
            case "CONVERTED": return "Won"
            case "LOST": return "Lost"
            default: return status ?? "New"
        }
    }

    useEffect(() => {
        const load = async () => {
            try {
                const [response, customersRes, usersRes, industriesRes] = await Promise.all([
                    apiGet<any[]>("/leads"),
                    apiGet<any[]>("/customers"),
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
                    assignedUserName: lead.assignedUserName ?? null
                })) as Lead[]
                setLeads(mapped)
                setCustomers(Array.isArray(customersRes.data) ? customersRes.data : [])
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
        load()
    }, [])

    useEffect(() => {
        const loadSites = async () => {
            if (!sitesEnabled || !convertForm.customerId) {
                setCustomerSites([])
                setConvertForm((prev) => ({ ...prev, siteId: "" }))
                return
            }
            try {
                const sites = await fetchCustomerSites(convertForm.customerId)
                setCustomerSites(sites)
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
                setCustomerSites([])
                setConvertForm((prev) => ({ ...prev, siteId: "" }))
            }
        }
        void loadSites()
    }, [convertForm.customerId, sitesEnabled])

    const industries = Array.from(
        new Set(
            leads
                .map((lead) => lead.industry?.trim())
                .filter((industry): industry is string => Boolean(industry))
        )
    ).sort()
    const filteredLeads = leads.filter((lead) => {
        const query = searchQuery.trim().toLowerCase()
        const tagQuery = tagFilter.trim().toLowerCase()
        const matchesSearch =
            !query ||
            lead.name.toLowerCase().includes(query) ||
            lead.company.toLowerCase().includes(query) ||
            lead.source.toLowerCase().includes(query) ||
            (lead.assignedUserName ?? "").toLowerCase().includes(query) ||
            (lead.industry ?? "").toLowerCase().includes(query)
        const matchesStatus = statusFilter === "all" || lead.status === statusFilter
        const matchesSource = sourceFilter === "all" || lead.source === sourceFilter
        const matchesIndustry = industryFilter === "all" || (lead.industry ?? "") === industryFilter
        const leadTags = Array.isArray(lead.tags) ? lead.tags : []
        const matchesTag =
            !tagQuery || leadTags.some((tag) => String(tag).toLowerCase().includes(tagQuery))
        return matchesSearch && matchesStatus && matchesSource && matchesIndustry && matchesTag
    })
    const leadsPagination = useClientPagination(filteredLeads)

    const isConverted = (status: string) => status.toLowerCase() === "won" || status.toLowerCase() === "converted"
    const isLost = (status: string) => status.toLowerCase() === "lost"
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
        assignedUserName: lead.assignedUserName ?? null
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
            title: "Lead Created",
            description: "Lead added to the pipeline.",
            variant: "success"
        })
    }

    const getSourceIcon = (source: string) => {
        switch (source) {
            case 'Web form': return <Globe className="h-3 w-3" />
            case 'Phone': return <Phone className="h-3 w-3" />
            case 'Referral': return <Users className="h-3 w-3" />
            default: return <Globe className="h-3 w-3" />
        }
    }

    return (
        <PageContainer>
            {!canView ? (
                <GlassCard>
                    <GlassCardHeader>
                        <GlassCardTitle>Leads Pipeline</GlassCardTitle>
                    </GlassCardHeader>
                    <GlassCardContent>You do not have access to view CRM leads.</GlassCardContent>
                </GlassCard>
            ) : (
            <>
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-foreground">Leads Pipeline</h1>
                    <p className="text-muted-foreground mt-1 text-sm">Manage incoming inquiries and prospect tracking.</p>
                </div>

                <div className="flex items-center gap-2">
                    <Button variant="outline" className="gap-2 bg-white/40" asChild>
                        <Link href="/admin/crm/kanban">
                            <Kanban className="h-4 w-4" /> Board View
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

            <GlassCard>
                <GlassCardHeader className="pb-3 border-b border-glass-border/50">
                    <div className="flex flex-col gap-3">
                        <div className="flex items-center justify-between">
                        <GlassCardTitle className="text-lg">Recent Inquiries</GlassCardTitle>
                        <div className="relative w-64">
                            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                            <Input
                                placeholder="Search leads..."
                                className="pl-9 bg-white/40 h-9"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                            />
                        </div>
                    </div>
                        <div className="flex flex-wrap items-center gap-2 justify-start">
                            <Select value={statusFilter} onValueChange={setStatusFilter}>
                                <SelectTrigger className="h-9 w-[170px] bg-white/40">
                                    <SelectValue placeholder="Status" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">All statuses</SelectItem>
                                    <SelectItem value="New">New</SelectItem>
                                    <SelectItem value="Contacted">Contacted</SelectItem>
                                    <SelectItem value="Qualified">Qualified</SelectItem>
                                    <SelectItem value="Won">Won</SelectItem>
                                    <SelectItem value="Lost">Lost</SelectItem>
                                </SelectContent>
                            </Select>
                            <Select value={sourceFilter} onValueChange={setSourceFilter}>
                                <SelectTrigger className="h-9 w-[170px] bg-white/40">
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
                            <Select value={industryFilter} onValueChange={setIndustryFilter}>
                                <SelectTrigger className="h-9 w-[170px] bg-white/40">
                                    <SelectValue placeholder="Industry" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">All industries</SelectItem>
                                    {industries.map((industry) => (
                                        <SelectItem key={industry} value={industry}>
                                            {industry}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            <Input
                                className="h-9 w-[220px] bg-white/40"
                                placeholder="Filter by tag..."
                                value={tagFilter}
                                onChange={(e) => setTagFilter(e.target.value)}
                            />
                        </div>
                    </div>
                </GlassCardHeader>
                <GlassCardContent className="p-0">
                    <Table>
                        <TableHeader className="bg-black/5">
                            <TableRow className="hover:bg-transparent border-glass-border">
                                <TableHead>Contact / Company</TableHead>
                                <TableHead>Assigned To</TableHead>
                                <TableHead>Source</TableHead>
                                <TableHead>Added</TableHead>
                                <TableHead>Value</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead className="w-[50px]"></TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {filteredLeads.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={7} className="h-32 text-center text-muted-foreground">
                                        <div className="flex flex-col items-center gap-3">
                                            <span>{leads.length === 0 ? "No leads yet." : "No leads match your search."}</span>
                                            {leads.length === 0 && canManage ? (
                                                <Button size="sm" className="gap-2" onClick={() => setIsAddModalOpen(true)}>
                                                    <Plus className="h-4 w-4" /> Add Lead
                                                </Button>
                                            ) : null}
                                        </div>
                                    </TableCell>
                                </TableRow>
                            ) : (
                                leadsPagination.paginatedItems.map((lead) => (
                                    <TableRow
                                        key={lead.id}
                                        className="border-glass-border hover:bg-black/5 transition-colors cursor-pointer"
                                        onClick={() => router.push(`/admin/crm/${lead.id}`)}
                                    >
                                        <TableCell>
                                            <div className="flex flex-col">
                                                <span className="font-medium text-sm">{lead.name}</span>
                                                <span className="text-xs text-muted-foreground">{lead.company}</span>
                                                {Array.isArray(lead.tags) && lead.tags.length > 0 ? (
                                                    <div className="mt-2 flex flex-wrap gap-1.5">
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
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            <div className="flex items-center gap-2 text-sm">
                                                <div className="h-7 w-7 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-semibold">
                                                    {(lead.assignedUserName ?? "U").charAt(0).toUpperCase()}
                                                </div>
                                                <span className="text-muted-foreground">{lead.assignedUserName ?? "Unassigned"}</span>
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground bg-white/50 border border-glass-border px-2 py-1 rounded-md shadow-sm">
                                                {getSourceIcon(lead.source)} {lead.source}
                                            </span>
                                        </TableCell>
                                        <TableCell className="text-sm text-muted-foreground">
                                            {lead.createdAt
                                                ? formatDistanceToNow(new Date(lead.createdAt), { addSuffix: true })
                                                : "—"}
                                        </TableCell>
                                        <TableCell className="font-medium">
                                            £{lead.value.toLocaleString()}
                                        </TableCell>
                                        <TableCell>
                                            <StatusBadge status={formatLeadStatus(lead.status)} className="shadow-sm font-medium" />
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
                                                    <DropdownMenuLabel>Lead Actions</DropdownMenuLabel>
                                                    <DropdownMenuSeparator />
                                                    <DropdownMenuItem onClick={() => router.push(`/admin/crm/${lead.id}`)}>
                                                        View Lead Details
                                                    </DropdownMenuItem>
                                                    <DropdownMenuItem
                                                        className="text-primary focus:text-primary"
                                                        onClick={async (e) => {
                                                            e.stopPropagation()
                                                            if (!canManage) {
                                                                toast({
                                                                    title: "Insufficient permissions",
                                                                    description: "You can view leads but cannot convert them.",
                                                                    variant: "error"
                                                                })
                                                                return
                                                            }
                                                            setConvertLeadId(lead.id)
                                                            setConvertForm({ customerId: "", siteId: "", location: "", address: emptyAddressValue(), addressManuallyEdited: false, priority: "Medium" })
                                                            setConvertErrors({})
                                                            setIsConvertOpen(true)
                                                        }}
                                                        disabled={isConverted(lead.status) || isLost(lead.status)}
                                                    >
                                                        <ArrowRight className="h-4 w-4 mr-2" /> Convert to Job
                                                    </DropdownMenuItem>
                                                    <DropdownMenuSeparator />
                                                    <DropdownMenuItem
                                                        className="text-destructive focus:bg-destructive focus:text-destructive-foreground"
                                                        onClick={async (e) => {
                                                            e.stopPropagation()
                                                            if (!canManage) {
                                                                toast({
                                                                    title: "Insufficient permissions",
                                                                    description: "You can view leads but cannot mark them lost.",
                                                                    variant: "error"
                                                                })
                                                                return
                                                            }
                                                            setMarkLostLeadId(lead.id)
                                                            setIsMarkLostOpen(true)
                                                        }}
                                                        disabled={isConverted(lead.status) || isLost(lead.status)}
                                                    >
                                                        Mark as Lost
                                                    </DropdownMenuItem>
                                                </DropdownMenuContent>
                                            </DropdownMenu>
                                        </TableCell>
                                    </TableRow>
                                ))
                            )}
                        </TableBody>
                    </Table>
                    <DataPagination {...leadsPagination} onPageChange={leadsPagination.setPage} />
                </GlassCardContent>
            </GlassCard>
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
                                const nextErrors: { siteId?: string; location?: string } = {}
                                const formattedJobAddress = formatJobAddressForPayload(convertForm.address)
                                if (sitesEnabled && !convertForm.siteId) {
                                    nextErrors.siteId = "Please select a customer site."
                                }
                                if (!sitesEnabled && !formattedJobAddress) {
                                    nextErrors.location = "Job location is required."
                                }
                                setConvertErrors(nextErrors)
                                if (Object.keys(nextErrors).length > 0 || !convertLeadId) {
                                    return
                                }
                                try {
                                    await apiPost(`/leads/${convertLeadId}/convert`, {
                                        customerId: convertForm.customerId || undefined,
                                        siteId: convertForm.siteId || undefined,
                                        location: formattedJobAddress || convertForm.location || undefined,
                                        ...buildJobAddressPayload(convertForm.address),
                                        addressManuallyEdited: convertForm.addressManuallyEdited,
                                        priority: convertForm.priority,
                                    })
                                    setLeads((prev) => prev.map((l) => l.id === convertLeadId ? { ...l, status: "Won" } : l))
                                    toast({
                                        title: "Converted",
                                        description: "Lead converted to job.",
                                        variant: "success"
                                    })
                                    setIsConvertOpen(false)
                                    setConvertLeadId(null)
                                } catch (err: any) {
                                    toast({
                                        title: "Conversion Failed",
                                        description: err?.message ?? "Failed to convert lead.",
                                        variant: "error"
                                    })
                                }
                            }}
                        >
                            Convert
                        </Button>
                    </div>
                }
            >
                <div className="space-y-4">
                    <div className="space-y-2">
                        <Label optional>Customer</Label>
                        <Select
                            value={convertForm.customerId || "__none__"}
                            createOption={{ label: "customer", href: "/admin/customers?create=customer" }}
                            onValueChange={(value) => setConvertForm((prev) => ({
                                ...prev,
                                customerId: value === "__none__" ? "" : value,
                                siteId: "",
                                location: "",
                                address: emptyAddressValue(),
                                addressManuallyEdited: false,
                            }))}
                        >
                            <SelectTrigger className="w-full bg-white/50">
                                <SelectValue placeholder="Select customer" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="__none__">Auto-create from lead</SelectItem>
                                {customers.map((customer) => (
                                    <SelectItem key={customer.id} value={customer.id}>{customer.name}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    {sitesEnabled ? <div className="space-y-2">
                        <Label required>Customer Site</Label>
                        <Select
                            value={convertForm.siteId}
                            createOption={convertForm.customerId ? { label: "site", href: `/admin/customers/${convertForm.customerId}?create=site` } : undefined}
                            onValueChange={(value) => {
                                const selectedSite = customerSites.find((site) => site.id === value)
                                setConvertForm((prev) => ({
                                    ...prev,
                                    siteId: value,
                                    address: selectedSite ? customerSiteToAddressValue(selectedSite) : prev.address,
                                    addressManuallyEdited: selectedSite ? false : prev.addressManuallyEdited,
                                    location: selectedSite
                                        ? formatJobAddressForPayload(customerSiteToAddressValue(selectedSite)) || formatCustomerSiteAddress(selectedSite) || prev.location
                                        : prev.location,
                                }))
                            }}
                            disabled={!convertForm.customerId}
                        >
                            <SelectTrigger className="w-full bg-white/50">
                                <SelectValue placeholder={convertForm.customerId ? "Select site" : "Select customer first"} />
                            </SelectTrigger>
                            <SelectContent>
                                {customerSites.map((site) => (
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
                </div>
            </GlassModal>

            <GlassModal
                open={isMarkLostOpen}
                onOpenChange={setIsMarkLostOpen}
                title="Mark Lead as Lost?"
                description="This will move the lead to lost."
                footer={
                    <div className="flex justify-end gap-2 w-full">
                        <Button variant="outline" onClick={() => setIsMarkLostOpen(false)}>Cancel</Button>
                        <Button
                            variant="destructive"
                            onClick={async () => {
                                if (!canManage) {
                                    toast({
                                        title: "Insufficient permissions",
                                        description: "You can view leads but cannot mark them lost.",
                                        variant: "error"
                                    })
                                    return
                                }
                                if (!markLostLeadId) return
                                try {
                                    await apiPut(`/leads/${markLostLeadId}`, { status: "LOST" } as any)
                                    setLeads((prev) => prev.map((l) => l.id === markLostLeadId ? { ...l, status: "Lost" } : l))
                                    toast({
                                        title: "Updated",
                                        description: "Lead marked as lost.",
                                        variant: "success"
                                    })
                                    setIsMarkLostOpen(false)
                                    setMarkLostLeadId(null)
                                } catch (err: any) {
                                    toast({
                                        title: "Update Failed",
                                        description: err?.message ?? "Failed to update lead.",
                                        variant: "error"
                                    })
                                }
                            }}
                        >
                            Mark Lost
                        </Button>
                    </div>
                }
            >
                <p className="text-sm text-muted-foreground">
                    This action updates lead status to lost and records it in the activity timeline.
                </p>
            </GlassModal>
            <ErrorToast error={error} onClear={() => setError(null)} />
            </>
            )}
        </PageContainer>
    )
}

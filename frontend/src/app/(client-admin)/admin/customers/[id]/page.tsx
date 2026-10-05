"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useParams, useSearchParams } from "next/navigation"
import { PageContainer } from "@/components/layout/PageContainer"
import { GlassCard, GlassCardContent, GlassCardHeader, GlassCardTitle, GlassCardDescription } from "@/components/glass/GlassCard"
import { GlassModal } from "@/components/glass/GlassModal"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Checkbox } from "@/components/ui/checkbox"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { Mail, Phone, MapPin, CalendarDays, ArrowLeft, Plus, SquarePen, Trash2, Send, Eye, CheckCircle, AlertTriangle, Clock3, FileText, UserPlus, CalendarClock, PlayCircle, CircleCheck, Hourglass, Building2, BriefcaseBusiness, UsersRound, Quote, CircleDollarSign, FolderOpen, LockKeyhole } from "lucide-react"
import { apiDelete, apiGet, apiPost, apiPut } from "@/lib/api"
import { ErrorToast } from "@/components/shared/ErrorToast"
import { AddressFields, AddressValue, CountrySelect, emptyAddressValue, formatAddressValue, getDefaultCountry, parseAddressValue, PhoneInput } from "@/components/shared/LocalizedFields"
import { StatusBadge } from "@/components/shared/StatusBadge"
import { RecordNumberBadge } from "@/components/shared/RecordNumberBadge"
import { useToast } from "@/components/ui/toast"
import { getModulePermissions } from "@/lib/permission-ui"
import { useTenantFeatures } from "@/components/layout/TenantFeaturesContext"
import { useTenantWorkflowConfig } from "@/components/layout/TenantWorkflowContext"
import { formatInvoiceStatus, formatJobStatus, formatQuoteStatus } from "@/lib/status"
import { getWorkflowStatusLabel } from "@/lib/workflows"
import { BrowserBackButton } from "@/components/shared/BrowserBackButton"
import { useUrlSyncedTab } from "@/components/shared/useUrlSyncedTab"
import { quickCreatedEventName } from "@/components/shared/QuickCreateProvider"

type CustomerProfile = {
    id: string
    name?: string | null
    email?: string | null
    phone?: string | null
    address?: string | null
    createdAt?: string | null
    portalAllowedSiteIds?: string[] | null
}

type CustomerContact = {
    id: string
    name: string
    email: string
    phone?: string | null
    address?: string | null
}

type CustomerSiteGroup = {
    id: string
    name: string
    description?: string | null
    sortOrder?: number | null
}

type CustomerSite = {
    id: string
    name: string
    siteGroupId?: string | null
    category?: string | null
    reference?: string | null
    status?: string | null
    addressLine1?: string | null
    addressLine2?: string | null
    city?: string | null
    state?: string | null
    postalCode?: string | null
    country?: string | null
    mainContactId?: string | null
    tags?: string[] | null
    additionalInformation?: string | null
    primaryContactName?: string | null
    primaryContactEmail?: string | null
    primaryContactPhone?: string | null
    notes?: string | null
}

type CustomerSiteContact = {
    id: string
    customerId: string
    siteId: string
    name: string
    email?: string | null
    phone?: string | null
    role?: string | null
    notes?: string | null
}

type ComplianceRecord = {
    id: string
    customerId: string
    siteId: string
    title: string
    reportType: string
    reference?: string | null
    outcome?: string | null
    reviewStatus?: string | null
    testedAt?: string | null
    validFrom?: string | null
    validUntil?: string | null
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
}

type CustomerJob = {
    id: string
    jobNumber?: string | null
    title?: string | null
    siteId?: string | null
    scheduledAt?: string | null
    scheduledEndAt?: string | null
    status?: string | null
    workflowStageKey?: string | null
    amount?: number | null
}

type CustomerInvoice = {
    id: string
    invoiceNumber?: string | null
    title?: string | null
    createdAt?: string | null
    dueDate?: string | null
    status?: string | null
    workflowStageKey?: string | null
    total?: number | null
}

type CustomerQuote = {
    id: string
    quoteNumber?: string | null
    customerId?: string | null
    customerName?: string | null
    siteId?: string | null
    siteName?: string | null
    title?: string | null
    status?: string | null
    workflowStageKey?: string | null
    workflowStatusLabel?: string | null
    total?: number | null
    createdAt?: string | null
    validUntil?: string | null
}

type CustomerRenewal = {
    id: string
    title: string
    reportType?: string | null
    reference?: string | null
    status?: string | null
    dueDate?: string | null
    renewalWindowStart?: string | null
    estimatedValue?: number | null
    lastQuotedAt?: string | null
    lastChasedAt?: string | null
    notes?: string | null
    ownerUserId?: string | null
    ownerName?: string | null
    siteId: string
    siteName?: string | null
    customerName?: string | null
    siteReference?: string | null
    siteCategory?: string | null
    quoteId?: string | null
    quoteNumber?: string | null
    quoteStatus?: string | null
    quoteWorkflowStatusLabel?: string | null
    timingState?: string | null
}

type CustomerDetailsResponse = {
    customer: CustomerProfile
    contacts: CustomerContact[]
    siteGroups: CustomerSiteGroup[]
    sites: CustomerSite[]
    siteContacts: CustomerSiteContact[]
    complianceRecords: ComplianceRecord[]
    renewals: CustomerRenewal[]
    jobs: CustomerJob[]
    invoices: CustomerInvoice[]
    summary: {
        siteGroupsCount: number
        sitesCount: number
        jobsCount: number
        invoicesCount: number
        invoicesTotal: number
        invoicesPaid: number
    }
}

type ContactForm = {
    name: string
    email: string
    phone: string
    address: AddressValue
}

type SiteGroupForm = {
    name: string
    description: string
    sortOrder: string
}

type SiteForm = {
    name: string
    siteGroupId: string
    category: string
    reference: string
    status: string
    addressLine1: string
    addressLine2: string
    city: string
    state: string
    postalCode: string
    country: string
    mainContactId: string
    tags: string
    additionalInformation: string
    primaryContactName: string
    primaryContactEmail: string
    primaryContactPhone: string
    notes: string
}

type SiteContactForm = {
    siteId: string
    name: string
    email: string
    phone: string
    role: string
    notes: string
}

type ComplianceRecordForm = {
    siteId: string
    title: string
    reportType: string
    reference: string
    outcome: string
    reviewStatus: string
    testedAt: string
    validFrom: string
    validUntil: string
    reviewerUserId: string
    reviewNote: string
    customerVisible: boolean
    notes: string
    documentId: string
    jobId: string
}

type RenewalDetailForm = {
    status: string
    ownerUserId: string
    estimatedValue: string
    lastQuotedAt: string
    lastChasedAt: string
    notes: string
}

type TenantUserOption = {
    id: string
    fullName?: string | null
    email?: string | null
}

type TenantDocumentOption = {
    id: string
    name: string
    category?: string | null
}

type SiteWorkspaceView = "sites" | "groups" | "siteContacts" | "compliance" | "renewals" | "portal"

const DEFAULT_SITE_GROUP_FORM: SiteGroupForm = {
    name: "",
    description: "",
    sortOrder: "0",
}

const DEFAULT_SITE_FORM: SiteForm = {
    name: "",
    siteGroupId: "",
    category: "",
    reference: "",
    status: "ACTIVE",
    addressLine1: "",
    addressLine2: "",
    city: "",
    state: "",
    postalCode: "",
    country: getDefaultCountry(),
    mainContactId: "",
    tags: "",
    additionalInformation: "",
    primaryContactName: "",
    primaryContactEmail: "",
    primaryContactPhone: "",
    notes: "",
}

const DEFAULT_SITE_CONTACT_FORM: SiteContactForm = {
    siteId: "",
    name: "",
    email: "",
    phone: "",
    role: "",
    notes: "",
}

const DEFAULT_COMPLIANCE_RECORD_FORM: ComplianceRecordForm = {
    siteId: "",
    title: "",
    reportType: "",
    reference: "",
    outcome: "",
    reviewStatus: "PENDING_REVIEW",
    testedAt: "",
    validFrom: "",
    validUntil: "",
    reviewerUserId: "",
    reviewNote: "",
    customerVisible: true,
    notes: "",
    documentId: "",
    jobId: "",
}

const DEFAULT_RENEWAL_DETAIL_FORM: RenewalDetailForm = {
    status: "OPEN",
    ownerUserId: "",
    estimatedValue: "",
    lastQuotedAt: "",
    lastChasedAt: "",
    notes: "",
}

const parseTagInput = (value: string) =>
    value
        .split(",")
        .map((entry) => entry.trim())
        .filter(Boolean)

const getErrorMessage = (error: unknown, fallback: string) => {
    if (error && typeof error === "object" && "message" in error && typeof error.message === "string") {
        return error.message
    }
    return fallback
}

export default function CustomerDetailsPage() {
    const { toast } = useToast()
    const { canView, canManage } = getModulePermissions("crm.view", "crm.manage")
    const { sites: sitesEnabled, complianceReports, renewals, siteScopedPortal, complianceWorkflows } = useTenantFeatures()
    const workflowConfig = useTenantWorkflowConfig()
    const params = useParams<{ id: string }>()
    const searchParams = useSearchParams()
    const customerId = String(params?.id ?? "")
    const [loading, setLoading] = useState(true)
    const customerTabs = useMemo(
        () => sitesEnabled ? ["overview", "sites", "contacts", "jobs", "quotes", "invoices"] : ["overview", "contacts", "jobs", "quotes", "invoices"],
        [sitesEnabled]
    )
    const [activeTab, setActiveTab] = useUrlSyncedTab({
        defaultTab: "overview",
        allowedTabs: customerTabs,
    })
    const [error, setError] = useState<string | null>(null)
    const [payload, setPayload] = useState<CustomerDetailsResponse | null>(null)
    const [quotes, setQuotes] = useState<CustomerQuote[]>([])
    const [contactOpen, setContactOpen] = useState(false)
    const [contactSaving, setContactSaving] = useState(false)
    const [editingContactId, setEditingContactId] = useState<string | null>(null)
    const [deleteContactId, setDeleteContactId] = useState<string | null>(null)
    const [contactForm, setContactForm] = useState<ContactForm>({
        name: "",
        email: "",
        phone: "",
        address: emptyAddressValue(),
    })
    const [siteGroupOpen, setSiteGroupOpen] = useState(false)
    const [siteGroupSaving, setSiteGroupSaving] = useState(false)
    const [editingSiteGroupId, setEditingSiteGroupId] = useState<string | null>(null)
    const [deleteSiteGroupId, setDeleteSiteGroupId] = useState<string | null>(null)
    const [siteGroupForm, setSiteGroupForm] = useState<SiteGroupForm>(DEFAULT_SITE_GROUP_FORM)
    const [siteOpen, setSiteOpen] = useState(false)
    const [siteSaving, setSiteSaving] = useState(false)
    const [editingSiteId, setEditingSiteId] = useState<string | null>(null)
    const [deleteSiteId, setDeleteSiteId] = useState<string | null>(null)
    const [siteForm, setSiteForm] = useState<SiteForm>(DEFAULT_SITE_FORM)
    const [siteContactOpen, setSiteContactOpen] = useState(false)
    const [siteContactSaving, setSiteContactSaving] = useState(false)
    const [editingSiteContactId, setEditingSiteContactId] = useState<string | null>(null)
    const [deleteSiteContactTarget, setDeleteSiteContactTarget] = useState<{ siteId: string; contactId: string } | null>(null)
    const [siteContactForm, setSiteContactForm] = useState<SiteContactForm>(DEFAULT_SITE_CONTACT_FORM)
    const [complianceRecordOpen, setComplianceRecordOpen] = useState(false)
    const [complianceRecordSaving, setComplianceRecordSaving] = useState(false)
    const [editingComplianceRecordId, setEditingComplianceRecordId] = useState<string | null>(null)
    const [deleteComplianceRecordTarget, setDeleteComplianceRecordTarget] = useState<{ siteId: string; recordId: string } | null>(null)
    const [complianceRecordForm, setComplianceRecordForm] = useState<ComplianceRecordForm>(DEFAULT_COMPLIANCE_RECORD_FORM)
    const [renewalOpen, setRenewalOpen] = useState(false)
    const [renewalSaving, setRenewalSaving] = useState(false)
    const [selectedRenewal, setSelectedRenewal] = useState<CustomerRenewal | null>(null)
    const [renewalForm, setRenewalForm] = useState<RenewalDetailForm>(DEFAULT_RENEWAL_DETAIL_FORM)
    const [tenantUsers, setTenantUsers] = useState<TenantUserOption[]>([])
    const [tenantDocuments, setTenantDocuments] = useState<TenantDocumentOption[]>([])
    const [portalScopeSaving, setPortalScopeSaving] = useState(false)
    const [portalScopedBySite, setPortalScopedBySite] = useState(false)
    const [portalAllowedSiteIds, setPortalAllowedSiteIds] = useState<string[]>([])
    const [siteWorkspaceView, setSiteWorkspaceView] = useState<SiteWorkspaceView>("sites")
    const [resetPasswordOpen, setResetPasswordOpen] = useState(false)
    const [resetPasswordLoading, setResetPasswordLoading] = useState(false)
    const [resetPassword, setResetPassword] = useState("")
    const [resetPasswordError, setResetPasswordError] = useState<string | null>(null)

    useEffect(() => {
        const createTarget = searchParams.get("create")
        if (createTarget === "contact") setContactOpen(true)
        if (createTarget === "site-group" && sitesEnabled) setSiteGroupOpen(true)
        if (createTarget === "site" && sitesEnabled) setSiteOpen(true)
        if (createTarget === "site-contact" && sitesEnabled) {
            setSiteContactForm({ ...DEFAULT_SITE_CONTACT_FORM, siteId: searchParams.get("siteId") ?? "" })
            setSiteContactOpen(true)
        }
        if (createTarget === "compliance-record" && sitesEnabled && complianceReports) {
            setComplianceRecordForm({ ...DEFAULT_COMPLIANCE_RECORD_FORM, siteId: searchParams.get("siteId") ?? "" })
            setComplianceRecordOpen(true)
        }
    }, [complianceReports, searchParams, sitesEnabled])

    const loadCustomerDetails = useCallback(async (showLoader = true) => {
        if (!customerId) return
        if (showLoader) {
            setLoading(true)
        }
        try {
            const [detailsRes, quotesRes] = await Promise.all([
                apiGet<CustomerDetailsResponse>(`/customers/${customerId}/details`),
                apiGet<CustomerQuote[]>("/quotes").catch(() => ({ data: [] as CustomerQuote[] })),
            ])
            setPayload(detailsRes.data ?? null)
            setQuotes(
                (Array.isArray(quotesRes.data) ? quotesRes.data : []).filter((quote) => quote.customerId === customerId)
            )
            setError(null)
        } catch (err: unknown) {
            setError(getErrorMessage(err, "Failed to load customer details"))
        } finally {
            if (showLoader) {
                setLoading(false)
            }
        }
    }, [customerId])

    useEffect(() => {
        loadCustomerDetails()
    }, [loadCustomerDetails])

    useEffect(() => {
        const handleQuickCreated = (event: Event) => {
            const customEvent = event as CustomEvent<{ type?: string; data?: CustomerSiteGroup }>
            if (customEvent.detail?.type !== "site-group") return

            const createdSiteGroup = customEvent.detail.data
            void loadCustomerDetails(false)
            if (createdSiteGroup?.id) {
                setSiteForm((prev) => ({ ...prev, siteGroupId: createdSiteGroup.id }))
            }
        }

        window.addEventListener(quickCreatedEventName, handleQuickCreated)
        return () => window.removeEventListener(quickCreatedEventName, handleQuickCreated)
    }, [loadCustomerDetails])

    useEffect(() => {
        if (!complianceReports && !renewals) {
            setTenantUsers([])
            setTenantDocuments([])
            return
        }

        const loadComplianceLookups = async () => {
            try {
                const [usersRes, documentsRes] = await Promise.all([
                    apiGet<TenantUserOption[]>("/users").catch(() => null),
                    apiGet<TenantDocumentOption[]>("/documents").catch(() => null),
                ])
                setTenantUsers(Array.isArray(usersRes?.data) ? usersRes?.data : [])
                setTenantDocuments(Array.isArray(documentsRes?.data) ? documentsRes?.data : [])
            } catch {
                setTenantUsers([])
                setTenantDocuments([])
            }
        }

        void loadComplianceLookups()
    }, [complianceReports, renewals])

    useEffect(() => {
        const allowedSiteIds = Array.isArray(payload?.customer?.portalAllowedSiteIds)
            ? payload?.customer?.portalAllowedSiteIds.filter(Boolean)
            : []
        setPortalScopedBySite(allowedSiteIds.length > 0)
        setPortalAllowedSiteIds(allowedSiteIds)
    }, [payload?.customer?.id, payload?.customer?.portalAllowedSiteIds])

    const customer = payload?.customer
    const contacts = useMemo(() => payload?.contacts ?? [], [payload])
    const siteGroups = useMemo(() => payload?.siteGroups ?? [], [payload])
    const sites = useMemo(() => payload?.sites ?? [], [payload])
    const siteContacts = useMemo(() => payload?.siteContacts ?? [], [payload])
    const complianceRecords = useMemo(() => payload?.complianceRecords ?? [], [payload])
    const customerRenewals = useMemo(() => payload?.renewals ?? [], [payload])
    const jobs = useMemo(() => payload?.jobs ?? [], [payload])
    const invoices = useMemo(() => payload?.invoices ?? [], [payload])
    const summary = payload?.summary

    const openJobs = useMemo(
        () => jobs.filter((job) => !["COMPLETED", "CLOSED", "FINISHED", "CANCELLED"].includes(String(job.status ?? "").toUpperCase())),
        [jobs]
    )

    const recentJobs = useMemo(
        () => [...jobs].sort((a, b) => new Date(b.scheduledAt ?? 0).getTime() - new Date(a.scheduledAt ?? 0).getTime()).slice(0, 5),
        [jobs]
    )

    const recentQuotes = useMemo(
        () => [...quotes].sort((a, b) => new Date(b.createdAt ?? 0).getTime() - new Date(a.createdAt ?? 0).getTime()).slice(0, 5),
        [quotes]
    )

    const acceptedQuotes = useMemo(
        () => quotes.filter((quote) => ["ACCEPTED", "SIGNED"].includes(String(quote.status ?? quote.workflowStatusLabel ?? "").toUpperCase())),
        [quotes]
    )

    const primaryContacts = useMemo(() => contacts.slice(0, 3), [contacts])

    const overdueInvoices = useMemo(
        () => invoices.filter((invoice) => String(invoice.status ?? "").toUpperCase() === "OVERDUE").length,
        [invoices]
    )

    const siteGroupMap = useMemo(
        () => new Map(siteGroups.map((siteGroup) => [siteGroup.id, siteGroup])),
        [siteGroups]
    )

    const siteMap = useMemo(
        () => new Map(sites.map((site) => [site.id, site])),
        [sites]
    )

    const siteCountByGroup = useMemo(() => {
        const counts = new Map<string, number>()
        sites.forEach((site) => {
            if (!site.siteGroupId) return
            counts.set(site.siteGroupId, (counts.get(site.siteGroupId) ?? 0) + 1)
        })
        return counts
    }, [sites])

    const siteContactsBySite = useMemo(() => {
        const bucket = new Map<string, CustomerSiteContact[]>()
        siteContacts.forEach((contact) => {
            const current = bucket.get(contact.siteId) ?? []
            current.push(contact)
            bucket.set(contact.siteId, current)
        })
        return bucket
    }, [siteContacts])

    const complianceRecordsBySite = useMemo(() => {
        const bucket = new Map<string, ComplianceRecord[]>()
        complianceRecords.forEach((record) => {
            const current = bucket.get(record.siteId) ?? []
            current.push(record)
            bucket.set(record.siteId, current)
        })
        return bucket
    }, [complianceRecords])

    const renewalsBySite = useMemo(() => {
        const bucket = new Map<string, CustomerRenewal[]>()
        customerRenewals.forEach((renewal) => {
            const current = bucket.get(renewal.siteId) ?? []
            current.push(renewal)
            bucket.set(renewal.siteId, current)
        })
        return bucket
    }, [customerRenewals])

    const siteWorkspaceSections = useMemo(
        () =>
            [
                {
                    key: "sites" as SiteWorkspaceView,
                    label: "Sites",
                    count: sites.length,
                    meta: "Locations and site profiles",
                },
                {
                    key: "groups" as SiteWorkspaceView,
                    label: "Site Groups",
                    count: siteGroups.length,
                    meta: "Regions, portfolios, and lots",
                },
                ...(complianceReports
                    ? [{
                        key: "compliance" as SiteWorkspaceView,
                        label: "Compliance",
                        count: complianceRecords.length,
                        meta: "Reports and certificates",
                    }]
                    : []),
                ...(renewals
                    ? [{
                        key: "renewals" as SiteWorkspaceView,
                        label: "Renewals",
                        count: customerRenewals.length,
                        meta: "Tests due and commercial follow-up",
                    }]
                    : []),
                ...(siteScopedPortal
                    ? [{
                        key: "portal" as SiteWorkspaceView,
                        label: "Portal Access",
                        count: portalScopedBySite ? portalAllowedSiteIds.length : sites.length,
                        meta: portalScopedBySite ? "Restricted by selected sites" : "All customer sites visible",
                    }]
                    : []),
            ],
        [sites.length, siteGroups.length, complianceReports, complianceRecords.length, renewals, customerRenewals.length, siteScopedPortal, portalScopedBySite, portalAllowedSiteIds.length]
    )

    useEffect(() => {
        if (siteWorkspaceView === "compliance" && !complianceReports) {
            setSiteWorkspaceView("sites")
        }
        if (siteWorkspaceView === "renewals" && !renewals) {
            setSiteWorkspaceView("sites")
        }
        if (siteWorkspaceView === "portal" && !siteScopedPortal) {
            setSiteWorkspaceView("sites")
        }
    }, [siteWorkspaceView, complianceReports, renewals, siteScopedPortal])

    const getInvoiceStatusIcon = (status: string | null | undefined) => {
        const label = formatInvoiceStatus(status)
        switch (label) {
            case "Paid":
                return <CheckCircle className="h-3.5 w-3.5" />
            case "Overdue":
                return <AlertTriangle className="h-3.5 w-3.5" />
            case "Partially Paid":
                return <Clock3 className="h-3.5 w-3.5" />
            case "Sent":
                return <Send className="h-3.5 w-3.5" />
            case "Viewed":
                return <Eye className="h-3.5 w-3.5" />
            default:
                return <FileText className="h-3.5 w-3.5" />
        }
    }

    const getJobStatusIcon = (status: string | null | undefined) => {
        const label = formatJobStatus(status)
        switch (label) {
            case "Assigned":
                return <UserPlus className="h-3.5 w-3.5" />
            case "Scheduled":
                return <CalendarClock className="h-3.5 w-3.5" />
            case "Live":
                return <PlayCircle className="h-3.5 w-3.5" />
            case "Finished":
                return <Hourglass className="h-3.5 w-3.5" />
            case "Completed":
                return <CircleCheck className="h-3.5 w-3.5" />
            default:
                return <FileText className="h-3.5 w-3.5" />
        }
    }

    const resetContactForm = () => {
        setContactForm({
            name: "",
            email: "",
            phone: "",
            address: emptyAddressValue(),
        })
        setEditingContactId(null)
    }

    const resetSiteGroupForm = () => {
        setSiteGroupForm(DEFAULT_SITE_GROUP_FORM)
        setEditingSiteGroupId(null)
    }

    const resetSiteForm = () => {
        setSiteForm(DEFAULT_SITE_FORM)
        setEditingSiteId(null)
    }

    const resetSiteContactForm = () => {
        setSiteContactForm(DEFAULT_SITE_CONTACT_FORM)
        setEditingSiteContactId(null)
    }

    const resetComplianceRecordForm = () => {
        setComplianceRecordForm(DEFAULT_COMPLIANCE_RECORD_FORM)
        setEditingComplianceRecordId(null)
    }

    const openCreateContact = () => {
        resetContactForm()
        setContactOpen(true)
    }

    const openEditContact = (contact: CustomerContact) => {
        setEditingContactId(contact.id)
        setContactForm({
            name: String(contact?.name ?? ""),
            email: String(contact?.email ?? ""),
            phone: String(contact?.phone ?? ""),
            address: parseAddressValue(contact?.address),
        })
        setContactOpen(true)
    }

    const openCreateSiteGroup = () => {
        resetSiteGroupForm()
        setSiteGroupOpen(true)
    }

    const openEditSiteGroup = (siteGroup: CustomerSiteGroup) => {
        setEditingSiteGroupId(siteGroup.id)
        setSiteGroupForm({
            name: String(siteGroup.name ?? ""),
            description: String(siteGroup.description ?? ""),
            sortOrder: String(siteGroup.sortOrder ?? 0),
        })
        setSiteGroupOpen(true)
    }

    const openCreateSite = () => {
        resetSiteForm()
        setSiteOpen(true)
    }

    const openEditSite = (site: CustomerSite) => {
        setEditingSiteId(site.id)
        setSiteForm({
            name: String(site.name ?? ""),
            siteGroupId: String(site.siteGroupId ?? ""),
            category: String(site.category ?? ""),
            reference: String(site.reference ?? ""),
            status: String(site.status ?? "ACTIVE"),
            addressLine1: String(site.addressLine1 ?? ""),
            addressLine2: String(site.addressLine2 ?? ""),
            city: String(site.city ?? ""),
            state: String(site.state ?? ""),
            postalCode: String(site.postalCode ?? ""),
            country: String(site.country ?? getDefaultCountry()),
            mainContactId: String(site.mainContactId ?? ""),
            tags: Array.isArray(site.tags) ? site.tags.join(", ") : "",
            additionalInformation: String(site.additionalInformation ?? ""),
            primaryContactName: String(site.primaryContactName ?? ""),
            primaryContactEmail: String(site.primaryContactEmail ?? ""),
            primaryContactPhone: String(site.primaryContactPhone ?? ""),
            notes: String(site.notes ?? ""),
        })
        setSiteOpen(true)
    }

    const openCreateSiteContact = (siteId: string) => {
        resetSiteContactForm()
        setSiteContactForm((prev) => ({ ...prev, siteId }))
        setSiteContactOpen(true)
    }

    const openEditSiteContact = (contact: CustomerSiteContact) => {
        setEditingSiteContactId(contact.id)
        setSiteContactForm({
            siteId: String(contact.siteId ?? ""),
            name: String(contact.name ?? ""),
            email: String(contact.email ?? ""),
            phone: String(contact.phone ?? ""),
            role: String(contact.role ?? ""),
            notes: String(contact.notes ?? ""),
        })
        setSiteContactOpen(true)
    }

    const openCreateComplianceRecord = (siteId: string) => {
        resetComplianceRecordForm()
        setComplianceRecordForm((prev) => ({ ...prev, siteId }))
        setComplianceRecordOpen(true)
    }

    const openEditComplianceRecord = (record: ComplianceRecord) => {
        setEditingComplianceRecordId(record.id)
        setComplianceRecordForm({
            siteId: String(record.siteId ?? ""),
            title: String(record.title ?? ""),
            reportType: String(record.reportType ?? ""),
            reference: String(record.reference ?? ""),
            outcome: String(record.outcome ?? ""),
            reviewStatus: String(record.reviewStatus ?? "PENDING_REVIEW"),
            testedAt: record.testedAt ? new Date(record.testedAt).toISOString().slice(0, 10) : "",
            validFrom: record.validFrom ? new Date(record.validFrom).toISOString().slice(0, 10) : "",
            validUntil: record.validUntil ? new Date(record.validUntil).toISOString().slice(0, 10) : "",
            reviewerUserId: String(record.reviewerUserId ?? ""),
            reviewNote: String(record.reviewNote ?? ""),
            customerVisible: Boolean(record.customerVisible ?? true),
            notes: String(record.notes ?? ""),
            documentId: String(record.documentId ?? ""),
            jobId: String(record.jobId ?? ""),
        })
        setComplianceRecordOpen(true)
    }

    const openEditRenewal = (renewal: CustomerRenewal) => {
        setSelectedRenewal(renewal)
        setRenewalForm({
            status: String(renewal.status ?? "OPEN"),
            ownerUserId: String(renewal.ownerUserId ?? ""),
            estimatedValue: renewal.estimatedValue != null ? String(renewal.estimatedValue) : "",
            lastQuotedAt: renewal.lastQuotedAt ? new Date(renewal.lastQuotedAt).toISOString().slice(0, 10) : "",
            lastChasedAt: renewal.lastChasedAt ? new Date(renewal.lastChasedAt).toISOString().slice(0, 10) : "",
            notes: String(renewal.notes ?? ""),
        })
        setRenewalOpen(true)
    }

    const saveContact = async () => {
        if (!canManage) {
            setError("Insufficient permissions.")
            return
        }
        if (!contactForm.name.trim() || !contactForm.email.trim()) {
            setError("Contact name and email are required.")
            return
        }
        setContactSaving(true)
        try {
            const body = {
                name: contactForm.name.trim(),
                email: contactForm.email.trim(),
                phone: contactForm.phone.trim(),
                address: formatAddressValue(contactForm.address),
            }
            if (editingContactId) {
                await apiPut(`/customers/${customerId}/contacts/${editingContactId}`, body)
                toast({ title: "Contact updated", description: "Customer contact updated successfully.", variant: "success" })
            } else {
                await apiPost(`/customers/${customerId}/contacts`, body)
                toast({ title: "Contact added", description: "Customer contact added successfully.", variant: "success" })
            }
            setContactOpen(false)
            resetContactForm()
            await loadCustomerDetails(false)
        } catch (err: unknown) {
            setError(getErrorMessage(err, "Failed to save contact"))
        } finally {
            setContactSaving(false)
        }
    }

    const saveRenewal = async () => {
        if (!canManage || !selectedRenewal) {
            return
        }

        setRenewalSaving(true)
        try {
            await apiPut(`/reports/renewals/${selectedRenewal.id}`, {
                status: renewalForm.status,
                ownerUserId: renewalForm.ownerUserId || undefined,
                estimatedValue: renewalForm.estimatedValue || undefined,
                lastQuotedAt: renewalForm.lastQuotedAt || undefined,
                lastChasedAt: renewalForm.lastChasedAt || undefined,
                notes: renewalForm.notes || undefined,
                quoteId: selectedRenewal.quoteId || undefined,
            })
            toast({
                title: "Renewal updated",
                description: "Renewal register changes have been saved.",
                variant: "success",
            })
            setRenewalOpen(false)
            setSelectedRenewal(null)
            setRenewalForm(DEFAULT_RENEWAL_DETAIL_FORM)
            await loadCustomerDetails(false)
        } catch (err: unknown) {
            setError(getErrorMessage(err, "Failed to update renewal"))
        } finally {
            setRenewalSaving(false)
        }
    }

    const createQuoteFromCustomerRenewal = async (renewal: CustomerRenewal) => {
        if (!canManage) {
            setError("Insufficient permissions.")
            return
        }

        try {
            await apiPost(`/reports/renewals/${renewal.id}/create-quote`, {})
            toast({
                title: "Quote created",
                description: "A draft quote has been created from this renewal.",
                variant: "success",
            })
            await loadCustomerDetails(false)
        } catch (err: unknown) {
            setError(getErrorMessage(err, "Failed to create quote from renewal"))
        }
    }

    const saveSiteGroup = async () => {
        if (!canManage) {
            setError("Insufficient permissions.")
            return
        }
        if (!siteGroupForm.name.trim()) {
            setError("Site group name is required.")
            return
        }
        setSiteGroupSaving(true)
        try {
            const body = {
                name: siteGroupForm.name.trim(),
                description: siteGroupForm.description.trim(),
                sortOrder: Number.isFinite(Number(siteGroupForm.sortOrder)) ? Number(siteGroupForm.sortOrder) : 0,
            }
            if (editingSiteGroupId) {
                await apiPut(`/customers/${customerId}/site-groups/${editingSiteGroupId}`, body)
                toast({ title: "Site group updated", description: "Site group changes saved successfully.", variant: "success" })
            } else {
                await apiPost(`/customers/${customerId}/site-groups`, body)
                toast({ title: "Site group added", description: "New site group created successfully.", variant: "success" })
            }
            setSiteGroupOpen(false)
            resetSiteGroupForm()
            await loadCustomerDetails(false)
        } catch (err: unknown) {
            setError(getErrorMessage(err, "Failed to save site group"))
        } finally {
            setSiteGroupSaving(false)
        }
    }

    const deleteSiteGroup = async () => {
        if (!canManage || !deleteSiteGroupId) {
            setDeleteSiteGroupId(null)
            return
        }
        try {
            await apiDelete(`/customers/${customerId}/site-groups/${deleteSiteGroupId}`, { confirmed: true })
            toast({ title: "Site group removed", description: "Site group removed successfully.", variant: "success" })
            setDeleteSiteGroupId(null)
            await loadCustomerDetails(false)
        } catch (err: unknown) {
            setError(getErrorMessage(err, "Failed to remove site group"))
        }
    }

    const saveSite = async () => {
        if (!canManage) {
            setError("Insufficient permissions.")
            return
        }
        if (!siteForm.name.trim()) {
            setError("Site name is required.")
            return
        }
        setSiteSaving(true)
        try {
            const body = {
                name: siteForm.name.trim(),
                siteGroupId: siteForm.siteGroupId || undefined,
                category: siteForm.category.trim(),
                reference: siteForm.reference.trim(),
                status: siteForm.status,
                addressLine1: siteForm.addressLine1.trim(),
                addressLine2: siteForm.addressLine2.trim(),
                city: siteForm.city.trim(),
                state: siteForm.state.trim(),
                postalCode: siteForm.postalCode.trim(),
                country: (siteForm.country || getDefaultCountry()).trim(),
                mainContactId: siteForm.mainContactId || undefined,
                tags: parseTagInput(siteForm.tags),
                additionalInformation: siteForm.additionalInformation.trim(),
                primaryContactName: siteForm.primaryContactName.trim(),
                primaryContactEmail: siteForm.primaryContactEmail.trim(),
                primaryContactPhone: siteForm.primaryContactPhone.trim(),
                notes: siteForm.notes.trim(),
            }
            if (editingSiteId) {
                await apiPut(`/customers/${customerId}/sites/${editingSiteId}`, body)
                toast({ title: "Site updated", description: "Site changes saved successfully.", variant: "success" })
            } else {
                await apiPost(`/customers/${customerId}/sites`, body)
                toast({ title: "Site added", description: "New site created successfully.", variant: "success" })
            }
            setSiteOpen(false)
            resetSiteForm()
            await loadCustomerDetails(false)
        } catch (err: unknown) {
            setError(getErrorMessage(err, "Failed to save site"))
        } finally {
            setSiteSaving(false)
        }
    }

    const saveSiteContact = async () => {
        if (!canManage) {
            setError("Insufficient permissions.")
            return
        }
        if (!siteContactForm.siteId || !siteContactForm.name.trim()) {
            setError("Site contact name is required.")
            return
        }

        setSiteContactSaving(true)
        try {
            const body = {
                name: siteContactForm.name.trim(),
                email: siteContactForm.email.trim(),
                phone: siteContactForm.phone.trim(),
                role: siteContactForm.role.trim(),
                notes: siteContactForm.notes.trim(),
            }
            if (editingSiteContactId) {
                await apiPut(`/customers/${customerId}/sites/${siteContactForm.siteId}/contacts/${editingSiteContactId}`, body)
                toast({ title: "Site contact updated", description: "Site contact updated successfully.", variant: "success" })
            } else {
                await apiPost(`/customers/${customerId}/sites/${siteContactForm.siteId}/contacts`, body)
                toast({ title: "Site contact added", description: "Site contact added successfully.", variant: "success" })
            }
            setSiteContactOpen(false)
            resetSiteContactForm()
            await loadCustomerDetails(false)
        } catch (err: unknown) {
            setError(getErrorMessage(err, "Failed to save site contact"))
        } finally {
            setSiteContactSaving(false)
        }
    }

    const saveComplianceRecord = async () => {
        if (!canManage) {
            setError("Insufficient permissions.")
            return
        }
        if (!complianceRecordForm.siteId || !complianceRecordForm.title.trim() || !complianceRecordForm.reportType.trim()) {
            setError("Record title and report type are required.")
            return
        }

        setComplianceRecordSaving(true)
        try {
            const body = {
                title: complianceRecordForm.title.trim(),
                reportType: complianceRecordForm.reportType.trim(),
                reference: complianceRecordForm.reference.trim(),
                outcome: complianceRecordForm.outcome.trim(),
                reviewStatus: complianceRecordForm.reviewStatus,
                testedAt: complianceRecordForm.testedAt || undefined,
                validFrom: complianceRecordForm.validFrom || undefined,
                validUntil: complianceRecordForm.validUntil || undefined,
                reviewerUserId: complianceRecordForm.reviewerUserId || undefined,
                reviewNote: complianceRecordForm.reviewNote.trim(),
                customerVisible: complianceRecordForm.customerVisible,
                notes: complianceRecordForm.notes.trim(),
                documentId: complianceRecordForm.documentId || undefined,
                jobId: complianceRecordForm.jobId || undefined,
            }

            if (editingComplianceRecordId) {
                await apiPut(`/customers/${customerId}/sites/${complianceRecordForm.siteId}/compliance-records/${editingComplianceRecordId}`, body)
                toast({ title: "Compliance record updated", description: "Compliance record saved successfully.", variant: "success" })
            } else {
                await apiPost(`/customers/${customerId}/sites/${complianceRecordForm.siteId}/compliance-records`, body)
                toast({ title: "Compliance record created", description: "Compliance record added successfully.", variant: "success" })
            }

            setComplianceRecordOpen(false)
            resetComplianceRecordForm()
            await loadCustomerDetails(false)
        } catch (err: unknown) {
            setError(getErrorMessage(err, "Failed to save compliance record"))
        } finally {
            setComplianceRecordSaving(false)
        }
    }

    const savePortalScope = async () => {
        if (!canManage) {
            setError("Insufficient permissions.")
            return
        }
        if (portalScopedBySite && portalAllowedSiteIds.length === 0) {
            setError("Select at least one site or switch portal access back to all sites.")
            return
        }

        setPortalScopeSaving(true)
        try {
            await apiPut(`/customers/${customerId}`, {
                portalAllowedSiteIds: portalScopedBySite ? portalAllowedSiteIds : [],
            })
            toast({
                title: "Portal access updated",
                description: portalScopedBySite
                    ? "Customer portal access is now limited to the selected sites."
                    : "Customer portal access now covers all sites for this customer.",
                variant: "success",
            })
            await loadCustomerDetails(false)
        } catch (err: unknown) {
            setError(getErrorMessage(err, "Failed to update portal site access"))
        } finally {
            setPortalScopeSaving(false)
        }
    }

    const deleteSite = async () => {
        if (!canManage || !deleteSiteId) {
            setDeleteSiteId(null)
            return
        }
        try {
            await apiDelete(`/customers/${customerId}/sites/${deleteSiteId}`, { confirmed: true })
            toast({ title: "Site removed", description: "Site removed successfully.", variant: "success" })
            setDeleteSiteId(null)
            await loadCustomerDetails(false)
        } catch (err: unknown) {
            setError(getErrorMessage(err, "Failed to remove site"))
        }
    }

    const formatSiteAddress = (site: CustomerSite) => {
        const parts = [
            site.addressLine1,
            site.addressLine2,
            site.city,
            site.state,
            site.postalCode,
            site.country,
        ]
            .map((part) => String(part ?? "").trim())
            .filter(Boolean)
        return parts.length > 0 ? parts.join(", ") : "—"
    }

    const formatSiteTags = (site: CustomerSite) => {
        const tags = Array.isArray(site.tags) ? site.tags.filter(Boolean) : []
        return tags.length > 0 ? tags.join(", ") : "—"
    }

    const getPrimarySiteContactLabel = (site: CustomerSite) => {
        if (site.mainContactId) {
            const mainContact = (siteContactsBySite.get(site.id) ?? []).find((contact) => contact.id === site.mainContactId)
            if (mainContact) {
                return {
                    name: mainContact.name,
                    meta: mainContact.email || mainContact.phone || mainContact.role || "Dedicated site contact",
                }
            }
        }
        return {
            name: site.primaryContactName || "—",
            meta: site.primaryContactEmail || site.primaryContactPhone || "No direct contact",
        }
    }

    const formatComplianceDate = (value?: string | null) => {
        if (!value) return "—"
        const parsed = new Date(value)
        return Number.isNaN(parsed.getTime()) ? "—" : parsed.toLocaleDateString("en-GB")
    }

    const formatMoney = (value?: number | null) =>
        `£${Number(value ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

    const formatDisplayDate = (value?: string | null, includeTime = false) => {
        if (!value) return "—"
        const parsed = new Date(value)
        if (Number.isNaN(parsed.getTime())) return "—"
        return includeTime ? parsed.toLocaleString("en-GB") : parsed.toLocaleDateString("en-GB")
    }

    const getQuoteDisplayStatus = (quote: CustomerQuote) =>
        quote.workflowStatusLabel || getWorkflowStatusLabel("quotes", quote.status, quote.workflowStageKey, workflowConfig, complianceWorkflows) || formatQuoteStatus(quote.status)

    const formatComplianceStatus = (status?: string | null) =>
        String(status ?? "PENDING_REVIEW").replace(/_/g, " ")

    const getComplianceRenewalState = (record: ComplianceRecord) => {
        const reviewStatus = String(record.reviewStatus ?? "").toUpperCase()
        if (reviewStatus !== "APPROVED" && reviewStatus !== "EXPIRED") {
            return { label: "Pending Review", meta: "Approve this record to make it eligible for renewals." }
        }
        if (!record.validUntil) {
            return { label: "Needs Date", meta: "Add a valid until date to track this record in renewals." }
        }

        const dueDate = new Date(record.validUntil)
        if (Number.isNaN(dueDate.getTime())) {
            return { label: "Needs Date", meta: "Valid until date is not readable for renewals." }
        }

        const today = new Date()
        today.setHours(0, 0, 0, 0)
        const dueMidnight = new Date(dueDate.getFullYear(), dueDate.getMonth(), dueDate.getDate())
        const diffDays = Math.ceil((dueMidnight.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))

        if (diffDays < 0) {
            return { label: "Overdue", meta: `Renewal due ${formatComplianceDate(record.validUntil)}.` }
        }
        if (diffDays <= 30) {
            return { label: "Due Soon", meta: `Renewal due ${formatComplianceDate(record.validUntil)}.` }
        }
        return { label: "Tracked", meta: `Renewal due ${formatComplianceDate(record.validUntil)}.` }
    }

    const deleteContact = async () => {
        if (!canManage || !deleteContactId) {
            setDeleteContactId(null)
            return
        }
        try {
            await apiDelete(`/customers/${customerId}/contacts/${deleteContactId}`, { confirmed: true })
            toast({ title: "Contact removed", description: "Customer contact removed successfully.", variant: "success" })
            setDeleteContactId(null)
            await loadCustomerDetails(false)
        } catch (err: unknown) {
            setError(getErrorMessage(err, "Failed to remove contact"))
        }
    }

    const deleteSiteContact = async () => {
        if (!canManage || !deleteSiteContactTarget) {
            setDeleteSiteContactTarget(null)
            return
        }
        try {
            await apiDelete(`/customers/${customerId}/sites/${deleteSiteContactTarget.siteId}/contacts/${deleteSiteContactTarget.contactId}`, { confirmed: true })
            toast({ title: "Site contact removed", description: "Site contact removed successfully.", variant: "success" })
            setDeleteSiteContactTarget(null)
            await loadCustomerDetails(false)
        } catch (err: unknown) {
            setError(getErrorMessage(err, "Failed to remove site contact"))
        }
    }

    const deleteComplianceRecord = async () => {
        if (!canManage || !deleteComplianceRecordTarget) {
            setDeleteComplianceRecordTarget(null)
            return
        }
        try {
            await apiDelete(`/customers/${customerId}/sites/${deleteComplianceRecordTarget.siteId}/compliance-records/${deleteComplianceRecordTarget.recordId}`, { confirmed: true })
            toast({ title: "Compliance record removed", description: "Compliance record removed successfully.", variant: "success" })
            setDeleteComplianceRecordTarget(null)
            await loadCustomerDetails(false)
        } catch (err: unknown) {
            setError(getErrorMessage(err, "Failed to remove compliance record"))
        }
    }

    const handleResetCustomerPassword = async () => {
        if (!canManage || !customer) return
        if (resetPassword.trim() && resetPassword.trim().length < 6) {
            setResetPasswordError("Password must be at least 6 characters.")
            return
        }
        setResetPasswordLoading(true)
        setResetPasswordError(null)
        try {
            const response = await apiPost<any>(`/customers/${customer.id}/reset-password`, {
                password: resetPassword.trim() || undefined,
            })
            const authDetails = response.data?.authDetails ?? response.data ?? {}
            setResetPasswordOpen(false)
            setResetPassword("")
            toast({
                title: "Customer password reset",
                description: authDetails.tempPassword
                    ? `Temporary password: ${authDetails.tempPassword}`
                    : "Portal credentials have been updated and emailed to the customer.",
                variant: "success",
            })
        } catch (err: any) {
            setResetPasswordError(err?.message ?? "Failed to reset customer password.")
        } finally {
            setResetPasswordLoading(false)
        }
    }

    return (
        <PageContainer>
            {!canView ? (
                <GlassCard>
                    <GlassCardHeader>
                        <GlassCardTitle>Customer Details</GlassCardTitle>
                    </GlassCardHeader>
                    <GlassCardContent>You do not have access to view customer details.</GlassCardContent>
                </GlassCard>
            ) : (
                <>
                    <div className="mb-6">
                        <Button asChild variant="ghost" className="px-0 hover:bg-transparent">
                            <BrowserBackButton>
                                <ArrowLeft className="h-4 w-4" />
                                Back to Customers
                            </BrowserBackButton>
                        </Button>
                    </div>

                    {loading ? (
                        <GlassCard>
                            <GlassCardContent className="py-10 text-center text-muted-foreground">Loading customer details...</GlassCardContent>
                        </GlassCard>
                    ) : (
                        <>
                            <div className="mb-6 space-y-5">
                                <div className="rounded-[32px] border border-glass-border/70 bg-gradient-to-br from-white/85 via-white/60 to-primary/10 p-6 shadow-xl shadow-slate-200/40">
                                    <div className="flex flex-col gap-6 xl:flex-row xl:items-center xl:justify-between">
                                        <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
                                            <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-3xl border border-primary/15 bg-primary/10 text-primary shadow-sm">
                                                <Building2 className="h-10 w-10" />
                                            </div>
                                            <div className="min-w-0">
                                                <div className="flex flex-wrap items-center gap-3">
                                                    <h1 className="text-3xl font-semibold tracking-tight text-foreground">{customer?.name ?? "Customer"}</h1>
                                                    <StatusBadge status="Active">Active</StatusBadge>
                                                </div>
                                                <div className="mt-3 grid gap-2 text-sm text-muted-foreground sm:grid-cols-2">
                                                    <div className="flex items-center gap-2">
                                                        <MapPin className="h-4 w-4 shrink-0 text-primary" />
                                                        <span className="truncate">{customer?.address || "No address saved"}</span>
                                                    </div>
                                                    <div className="flex items-center gap-2">
                                                        <Mail className="h-4 w-4 shrink-0 text-primary" />
                                                        <span className="truncate">{customer?.email ?? "No email saved"}</span>
                                                    </div>
                                                    <div className="flex items-center gap-2">
                                                        <Phone className="h-4 w-4 shrink-0 text-primary" />
                                                        <span>{customer?.phone || "No phone saved"}</span>
                                                    </div>
                                                    <div className="flex items-center gap-2">
                                                        <CalendarDays className="h-4 w-4 shrink-0 text-primary" />
                                                        <span>Customer since {formatDisplayDate(customer?.createdAt)}</span>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                        <div className="flex flex-wrap gap-2">
                                            <Button
                                                variant="outline"
                                                className="gap-2 bg-white/70"
                                                disabled={!canManage}
                                                onClick={() => {
                                                    setResetPassword("")
                                                    setResetPasswordError(null)
                                                    setResetPasswordOpen(true)
                                                }}
                                            >
                                                <LockKeyhole className="h-4 w-4" />
                                                Reset Password
                                            </Button>
                                            <Button variant="outline" className="gap-2 bg-white/70" disabled={!canManage} onClick={openCreateContact}>
                                                <UserPlus className="h-4 w-4" />
                                                Add Contact
                                            </Button>
                                            <Button className="gap-2" disabled={!canManage} asChild>
                                                <Link href={`/admin/schedule?create=job&customerId=${customerId}`}>
                                                    <Plus className="h-4 w-4" />
                                                    New Job
                                                </Link>
                                            </Button>
                                            <Button variant="outline" className="gap-2 bg-white/70" disabled={!canManage} asChild>
                                                <Link href={`/admin/quotes/new?customerId=${customerId}`}>
                                                    <Plus className="h-4 w-4" />
                                                    New Quote
                                                </Link>
                                            </Button>
                                        </div>
                                    </div>
                                </div>

                                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
                                    {[
                                        ...(sitesEnabled ? [
                                            { label: "Site Groups", value: summary?.siteGroupsCount ?? siteGroups.length, icon: FolderOpen, tone: "bg-primary/10 text-primary" },
                                            { label: "Sites", value: summary?.sitesCount ?? sites.length, icon: Building2, tone: "bg-sky-100 text-sky-700" },
                                        ] : []),
                                        { label: "Contacts", value: contacts.length, icon: UsersRound, tone: "bg-violet-100 text-violet-700" },
                                        { label: "Jobs", value: summary?.jobsCount ?? jobs.length, icon: BriefcaseBusiness, tone: "bg-orange-100 text-orange-700" },
                                        { label: "Quotes", value: quotes.length, icon: Quote, tone: "bg-pink-100 text-pink-700" },
                                        { label: "Invoices", value: summary?.invoicesCount ?? invoices.length, icon: CircleDollarSign, tone: "bg-emerald-100 text-emerald-700" },
                                    ].map((stat) => {
                                        const Icon = stat.icon
                                        return (
                                            <div key={stat.label} className="rounded-3xl border border-glass-border/70 bg-white/60 p-4 shadow-sm">
                                                <div className={`mb-3 flex h-11 w-11 items-center justify-center rounded-2xl ${stat.tone}`}>
                                                    <Icon className="h-5 w-5" />
                                                </div>
                                                <div className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">{stat.label}</div>
                                                <div className="mt-1 text-2xl font-semibold text-foreground">{stat.value}</div>
                                            </div>
                                        )
                                    })}
                                </div>
                            </div>

                            <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
                                <TabsList variant="line" className="w-full justify-start border-b border-border/40 rounded-none p-0 gap-0">
                                    <TabsTrigger value="overview" className="h-11 px-5 rounded-none">Overview</TabsTrigger>
                                    {sitesEnabled ? <TabsTrigger value="sites" className="h-11 px-5 rounded-none">Sites ({sites.length})</TabsTrigger> : null}
                                    <TabsTrigger value="contacts" className="h-11 px-5 rounded-none">Contacts ({contacts.length})</TabsTrigger>
                                    <TabsTrigger value="jobs" className="h-11 px-5 rounded-none">Jobs ({jobs.length})</TabsTrigger>
                                    <TabsTrigger value="quotes" className="h-11 px-5 rounded-none">Quotes ({quotes.length})</TabsTrigger>
                                    <TabsTrigger value="invoices" className="h-11 px-5 rounded-none">Invoices ({invoices.length})</TabsTrigger>
                                </TabsList>

                                <TabsContent value="overview" className="space-y-6">
                                    <div className="grid gap-6 xl:grid-cols-[340px_minmax(0,1fr)_320px]">
                                        <div className="space-y-6">
                                            <GlassCard>
                                                <GlassCardHeader className="pb-4">
                                                    <GlassCardTitle className="text-lg">Client Information</GlassCardTitle>
                                                </GlassCardHeader>
                                                <GlassCardContent className="space-y-3 text-sm">
                                                    {[
                                                        ["Name", customer?.name ?? "—"],
                                                        ["Email", customer?.email ?? "—"],
                                                        ["Phone", customer?.phone || "—"],
                                                        ["Address", customer?.address || "—"],
                                                        ["Created On", formatDisplayDate(customer?.createdAt)],
                                                    ].map(([label, value]) => (
                                                        <div key={label} className="flex items-start justify-between gap-4">
                                                            <span className="shrink-0 text-muted-foreground">{label}</span>
                                                            <span className="text-right font-medium text-foreground">{value}</span>
                                                        </div>
                                                    ))}
                                                    <Button variant="outline" className="mt-3 w-full bg-white/70" onClick={openCreateContact} disabled={!canManage}>
                                                        Add Contact
                                                    </Button>
                                                </GlassCardContent>
                                            </GlassCard>

                                            <GlassCard>
                                                <GlassCardHeader className="pb-4">
                                                    <div className="flex items-center justify-between">
                                                        <GlassCardTitle className="text-lg">Key Contacts</GlassCardTitle>
                                                        <button type="button" className="text-xs font-semibold text-primary" onClick={() => setActiveTab("contacts")}>
                                                            View all
                                                        </button>
                                                    </div>
                                                </GlassCardHeader>
                                                <GlassCardContent className="space-y-4">
                                                    {primaryContacts.length === 0 ? (
                                                        <div className="rounded-2xl border border-dashed border-glass-border/70 bg-white/40 p-5 text-center text-sm text-muted-foreground">
                                                            No contacts added yet.
                                                        </div>
                                                    ) : (
                                                        primaryContacts.map((contact) => (
                                                            <div key={contact.id} className="flex gap-3 border-b border-glass-border/50 pb-4 last:border-0 last:pb-0">
                                                                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
                                                                    {contact.name.slice(0, 2).toUpperCase()}
                                                                </div>
                                                                <div className="min-w-0 flex-1">
                                                                    <div className="font-semibold text-foreground">{contact.name}</div>
                                                                    <div className="truncate text-xs text-muted-foreground">{contact.email}</div>
                                                                    {contact.phone ? <div className="text-xs text-muted-foreground">{contact.phone}</div> : null}
                                                                </div>
                                                            </div>
                                                        ))
                                                    )}
                                                </GlassCardContent>
                                            </GlassCard>
                                        </div>

                                        <div className="space-y-6">
                                            {sitesEnabled ? (
                                                <GlassCard>
                                                    <GlassCardHeader className="pb-4">
                                                        <div className="flex flex-wrap items-center justify-between gap-3">
                                                            <div>
                                                                <GlassCardTitle className="text-lg">Site Groups & Sites</GlassCardTitle>
                                                                <GlassCardDescription>Grouped locations and operational site records for this customer.</GlassCardDescription>
                                                            </div>
                                                            <Button size="sm" className="gap-2" onClick={openCreateSite} disabled={!canManage}>
                                                                <Plus className="h-3.5 w-3.5" />
                                                                New Site
                                                            </Button>
                                                        </div>
                                                    </GlassCardHeader>
                                                    <GlassCardContent className="space-y-4">
                                                        {sites.length === 0 ? (
                                                            <div className="rounded-2xl border border-dashed border-glass-border/70 bg-white/40 p-6 text-center text-sm text-muted-foreground">
                                                                No sites added yet.
                                                            </div>
                                                        ) : (
                                                            <div className="space-y-3">
                                                                {(siteGroups.length > 0 ? siteGroups.slice(0, 3) : [{ id: "__ungrouped__", name: "Ungrouped Sites" } as CustomerSiteGroup]).map((group) => {
                                                                    const groupedSites = group.id === "__ungrouped__"
                                                                        ? sites.filter((site) => !site.siteGroupId).slice(0, 3)
                                                                        : sites.filter((site) => site.siteGroupId === group.id).slice(0, 3)
                                                                    if (groupedSites.length === 0) return null
                                                                    return (
                                                                        <div key={group.id} className="rounded-3xl border border-glass-border/70 bg-white/45 p-4">
                                                                            <div className="mb-4 flex items-center justify-between gap-3">
                                                                                <div className="flex items-center gap-3">
                                                                                    <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                                                                                        <FolderOpen className="h-5 w-5" />
                                                                                    </div>
                                                                                    <div>
                                                                                        <div className="font-semibold text-foreground">{group.name}</div>
                                                                                        <div className="text-xs text-muted-foreground">{groupedSites.length} site(s) shown</div>
                                                                                    </div>
                                                                                </div>
                                                                                <button type="button" className="text-xs font-semibold text-primary" onClick={() => setActiveTab("sites")}>
                                                                                    Manage
                                                                                </button>
                                                                            </div>
                                                                            <div className="grid gap-3 lg:grid-cols-3">
                                                                                {groupedSites.map((site) => (
                                                                                    <Link
                                                                                        key={site.id}
                                                                                        href={`/admin/customers/${customerId}/sites/${site.id}`}
                                                                                        className="rounded-2xl border border-glass-border/60 bg-white/60 p-4 transition hover:bg-white/85"
                                                                                    >
                                                                                        <div className="flex items-start gap-3">
                                                                                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                                                                                                <Building2 className="h-5 w-5" />
                                                                                            </div>
                                                                                            <div className="min-w-0">
                                                                                                <div className="truncate font-semibold text-foreground">{site.name}</div>
                                                                                                <div className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">{formatSiteAddress(site)}</div>
                                                                                                <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-muted-foreground">
                                                                                                    <span>{siteContactsBySite.get(site.id)?.length ?? 0} contacts</span>
                                                                                                    <span>{jobs.filter((job) => job.siteId === site.id).length} jobs</span>
                                                                                                    <span>{quotes.filter((quote) => quote.siteId === site.id).length} quotes</span>
                                                                                                </div>
                                                                                            </div>
                                                                                        </div>
                                                                                    </Link>
                                                                                ))}
                                                                            </div>
                                                                        </div>
                                                                    )
                                                                })}
                                                            </div>
                                                        )}
                                                    </GlassCardContent>
                                                </GlassCard>
                                            ) : null}

                                            <div className="grid gap-6 lg:grid-cols-2">
                                                <GlassCard>
                                                    <GlassCardHeader className="pb-4">
                                                        <div className="flex items-center justify-between">
                                                            <GlassCardTitle className="text-lg">Recent Jobs</GlassCardTitle>
                                                            <button type="button" className="text-xs font-semibold text-primary" onClick={() => setActiveTab("jobs")}>
                                                                View all
                                                            </button>
                                                        </div>
                                                    </GlassCardHeader>
                                                    <GlassCardContent className="space-y-3">
                                                        {recentJobs.length === 0 ? (
                                                            <div className="rounded-2xl border border-dashed border-glass-border/70 bg-white/40 p-5 text-center text-sm text-muted-foreground">No jobs linked yet.</div>
                                                        ) : (
                                                            recentJobs.map((job) => (
                                                                <Link key={job.id} href={`/admin/schedule/${job.id}`} className="block rounded-2xl border border-glass-border/60 bg-white/55 p-4 transition hover:bg-white/80">
                                                                    <div className="flex items-start justify-between gap-3">
                                                                        <div className="min-w-0">
                                                                            <RecordNumberBadge value={job.jobNumber} fallback={job.title ?? "Job"} />
                                                                            <div className="mt-2 truncate font-semibold text-foreground">{job.title ?? "Untitled job"}</div>
                                                                            <div className="text-xs text-muted-foreground">{formatDisplayDate(job.scheduledAt, true)}</div>
                                                                        </div>
                                                                        <StatusBadge status={formatJobStatus(job.status)}>
                                                                            {getWorkflowStatusLabel("jobs", job.status, job.workflowStageKey, workflowConfig, complianceWorkflows)}
                                                                        </StatusBadge>
                                                                    </div>
                                                                </Link>
                                                            ))
                                                        )}
                                                    </GlassCardContent>
                                                </GlassCard>

                                                <GlassCard>
                                                    <GlassCardHeader className="pb-4">
                                                        <div className="flex items-center justify-between">
                                                            <GlassCardTitle className="text-lg">Recent Quotes</GlassCardTitle>
                                                            <button type="button" className="text-xs font-semibold text-primary" onClick={() => setActiveTab("quotes")}>
                                                                View all
                                                            </button>
                                                        </div>
                                                    </GlassCardHeader>
                                                    <GlassCardContent className="space-y-3">
                                                        {recentQuotes.length === 0 ? (
                                                            <div className="rounded-2xl border border-dashed border-glass-border/70 bg-white/40 p-5 text-center text-sm text-muted-foreground">No quotes linked yet.</div>
                                                        ) : (
                                                            recentQuotes.map((quote) => {
                                                                const quoteStatus = getQuoteDisplayStatus(quote)
                                                                return (
                                                                    <Link key={quote.id} href={`/admin/quotes/${quote.id}`} className="block rounded-2xl border border-glass-border/60 bg-white/55 p-4 transition hover:bg-white/80">
                                                                        <div className="flex items-start justify-between gap-3">
                                                                            <div className="min-w-0">
                                                                                <RecordNumberBadge value={quote.quoteNumber} fallback="Quote" />
                                                                                <div className="mt-2 truncate font-semibold text-foreground">{quote.title ?? "Quote"}</div>
                                                                                <div className="text-xs text-muted-foreground">{formatMoney(quote.total)}</div>
                                                                            </div>
                                                                            <StatusBadge status={quoteStatus}>{quoteStatus}</StatusBadge>
                                                                        </div>
                                                                    </Link>
                                                                )
                                                            })
                                                        )}
                                                    </GlassCardContent>
                                                </GlassCard>
                                            </div>
                                        </div>

                                        <div className="space-y-6">
                                            <GlassCard>
                                                <GlassCardHeader className="pb-4">
                                                    <GlassCardTitle className="text-lg">At a Glance</GlassCardTitle>
                                                </GlassCardHeader>
                                                <GlassCardContent className="space-y-3 text-sm">
                                                    {[
                                                        ["Open Jobs", openJobs.length],
                                                        ["Accepted Quotes", acceptedQuotes.length],
                                                        ["Total Quotes", quotes.length],
                                                        ["Invoices", summary?.invoicesCount ?? invoices.length],
                                                        ["Overdue Invoices", overdueInvoices],
                                                    ].map(([label, value]) => (
                                                        <div key={label} className="flex items-center justify-between gap-4 border-b border-glass-border/50 pb-3 last:border-0 last:pb-0">
                                                            <span className="text-muted-foreground">{label}</span>
                                                            <span className="font-semibold text-foreground">{value}</span>
                                                        </div>
                                                    ))}
                                                </GlassCardContent>
                                            </GlassCard>

                                            <GlassCard>
                                                <GlassCardHeader className="pb-4">
                                                    <GlassCardTitle className="text-lg">Financial Summary</GlassCardTitle>
                                                </GlassCardHeader>
                                                <GlassCardContent className="space-y-3 text-sm">
                                                    <div className="flex items-center justify-between gap-4">
                                                        <span className="text-muted-foreground">Total Invoiced</span>
                                                        <span className="font-semibold text-foreground">{formatMoney(summary?.invoicesTotal)}</span>
                                                    </div>
                                                    <div className="flex items-center justify-between gap-4">
                                                        <span className="text-muted-foreground">Total Paid</span>
                                                        <span className="font-semibold text-foreground">{formatMoney(summary?.invoicesPaid)}</span>
                                                    </div>
                                                    <div className="rounded-2xl bg-primary/10 p-4">
                                                        <div className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">Outstanding</div>
                                                        <div className="mt-1 text-2xl font-semibold text-foreground">
                                                            {formatMoney(Number(summary?.invoicesTotal ?? 0) - Number(summary?.invoicesPaid ?? 0))}
                                                        </div>
                                                    </div>
                                                </GlassCardContent>
                                            </GlassCard>
                                        </div>
                                    </div>
                                </TabsContent>

                                {sitesEnabled ? <TabsContent value="sites">
                                    <div className="grid grid-cols-1 xl:grid-cols-[260px_minmax(0,1fr)] gap-6">
                                        <GlassCard className="xl:sticky xl:top-24 self-start">
                                            <GlassCardHeader className="pb-3 border-b border-glass-border/50">
                                                <GlassCardTitle className="text-lg">Site Workspace</GlassCardTitle>
                                            </GlassCardHeader>
                                            <GlassCardContent className="space-y-2">
                                                {siteWorkspaceSections.map((section) => {
                                                    const isActive = siteWorkspaceView === section.key
                                                    return (
                                                        <button
                                                            key={section.key}
                                                            type="button"
                                                            onClick={() => setSiteWorkspaceView(section.key)}
                                                            className={`w-full rounded-2xl border px-4 py-3 text-left transition-all ${isActive
                                                                ? "border-primary/30 bg-primary/10 shadow-sm"
                                                                : "border-glass-border/60 bg-white/35 hover:bg-white/55"
                                                                }`}
                                                        >
                                                            <div className="flex items-start justify-between gap-3">
                                                                <div className="min-w-0">
                                                                    <div className="text-sm font-semibold text-foreground">{section.label}</div>
                                                                    <div className="mt-1 text-xs leading-5 text-muted-foreground">{section.meta}</div>
                                                                </div>
                                                                <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${isActive ? "bg-primary text-primary-foreground" : "bg-slate-100 text-slate-700"}`}>
                                                                    {section.count}
                                                                </span>
                                                            </div>
                                                        </button>
                                                    )
                                                })}
                                            </GlassCardContent>
                                        </GlassCard>

                                        <div className="space-y-6">
                                            {siteWorkspaceView === "sites" ? (
                                                <GlassCard>
                                                    <GlassCardHeader className="pb-3 border-b border-glass-border/50">
                                                        <div className="flex items-center justify-between gap-3">
                                                            <div>
                                                                <GlassCardTitle className="text-lg">Sites</GlassCardTitle>
                                                                <GlassCardDescription>Operational locations, categories, and site-level contacts.</GlassCardDescription>
                                                            </div>
                                                            <Button size="sm" className="gap-2" onClick={openCreateSite} disabled={!canManage}>
                                                                <Plus className="h-3.5 w-3.5" />
                                                                Add Site
                                                            </Button>
                                                        </div>
                                                    </GlassCardHeader>
                                                    <GlassCardContent className="space-y-4">
                                                        {sites.length === 0 ? (
                                                            <div className="rounded-2xl border border-dashed border-glass-border/70 bg-white/40 p-6 text-center text-sm text-muted-foreground">
                                                                No sites added yet.
                                                            </div>
                                                        ) : (
                                                            sites.map((site) => {
                                                                const sitePrimaryContact = getPrimarySiteContactLabel(site)
                                                                const siteGroupName = site.siteGroupId ? siteGroupMap.get(site.siteGroupId)?.name ?? "—" : "Ungrouped"
                                                                return (
                                                                    <div key={site.id} className="rounded-[28px] border border-glass-border/70 bg-white/45 p-5 shadow-sm shadow-slate-200/30">
                                                                        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                                                                            <div className="min-w-0 space-y-3">
                                                                                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                                                                                    <div className="min-w-0">
                                                                                        <div className="flex flex-wrap items-center gap-2">
                                                                                            <h3 className="text-lg font-semibold leading-tight text-foreground">{site.name}</h3>
                                                                                            <StatusBadge status={String(site.status ?? "ACTIVE").replace(/_/g, " ")}>
                                                                                                {String(site.status ?? "ACTIVE").replace(/_/g, " ")}
                                                                                            </StatusBadge>
                                                                                        </div>
                                                                                        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                                                                                            <span>{site.reference || "No reference"}</span>
                                                                                            {site.category ? <span className="rounded-full bg-slate-100 px-2.5 py-1 font-medium text-slate-700">{site.category}</span> : null}
                                                                                            <span className="rounded-full bg-sky-50 px-2.5 py-1 font-medium text-sky-700">{siteGroupName}</span>
                                                                                        </div>
                                                                                    </div>
                                                                                </div>

                                                                                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                                                                                    <div className="rounded-2xl border border-glass-border/50 bg-white/55 p-3">
                                                                                        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Location</div>
                                                                                        <div className="mt-2 text-sm leading-6 text-foreground">{formatSiteAddress(site)}</div>
                                                                                    </div>
                                                                                    <div className="rounded-2xl border border-glass-border/50 bg-white/55 p-3">
                                                                                        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Primary Contact</div>
                                                                                        <div className="mt-2 text-sm font-medium text-foreground break-words">{sitePrimaryContact.name}</div>
                                                                                        <div className="text-xs leading-5 text-muted-foreground break-all">{sitePrimaryContact.meta}</div>
                                                                                    </div>
                                                                                    <div className="rounded-2xl border border-glass-border/50 bg-white/55 p-3">
                                                                                        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Tags</div>
                                                                                        <div className="mt-2 text-sm leading-6 text-foreground">{formatSiteTags(site)}</div>
                                                                                    </div>
                                                                                </div>

                                                                                {site.additionalInformation || site.notes ? (
                                                                                    <div className="grid gap-3 xl:grid-cols-2">
                                                                                        {site.additionalInformation ? (
                                                                                            <div className="rounded-2xl border border-glass-border/50 bg-white/35 p-3">
                                                                                                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Additional Information</div>
                                                                                                <p className="mt-2 text-sm leading-6 text-foreground">{site.additionalInformation}</p>
                                                                                            </div>
                                                                                        ) : null}
                                                                                        {site.notes ? (
                                                                                            <div className="rounded-2xl border border-glass-border/50 bg-white/35 p-3">
                                                                                                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Operational Notes</div>
                                                                                                <p className="mt-2 text-sm leading-6 text-foreground">{site.notes}</p>
                                                                                            </div>
                                                                                        ) : null}
                                                                                    </div>
                                                                                ) : null}
                                                                            </div>

                                                                            <div className="flex flex-wrap gap-2 lg:w-[180px] lg:flex-col lg:items-stretch">
                                                                                <Button variant="outline" size="sm" className="gap-1 bg-white/70" asChild>
                                                                                    <Link href={`/admin/customers/${customerId}/sites/${site.id}`}>
                                                                                        <Eye className="h-3.5 w-3.5" />
                                                                                        View Details
                                                                                    </Link>
                                                                                </Button>
                                                                                <Button variant="outline" size="sm" className="gap-1 bg-white/70" disabled={!canManage} onClick={() => openEditSite(site)}>
                                                                                    <SquarePen className="h-3.5 w-3.5" />
                                                                                    Edit Site
                                                                                </Button>
                                                                                <Button variant="outline" size="sm" className="gap-1 border-red-200 bg-white/70 text-red-600 hover:text-red-700" disabled={!canManage} onClick={() => setDeleteSiteId(site.id)}>
                                                                                    <Trash2 className="h-3.5 w-3.5" />
                                                                                    Remove
                                                                                </Button>
                                                                            </div>
                                                                        </div>
                                                                    </div>
                                                                )
                                                            })
                                                        )}
                                                    </GlassCardContent>
                                                </GlassCard>
                                            ) : null}

                                            {siteWorkspaceView === "groups" ? (
                                                <GlassCard>
                                                    <GlassCardHeader className="pb-3 border-b border-glass-border/50">
                                                        <div className="flex items-center justify-between gap-3">
                                                            <div>
                                                                <GlassCardTitle className="text-lg">Site Groups</GlassCardTitle>
                                                                <GlassCardDescription>Logical groupings like region, portfolio, or contract lot.</GlassCardDescription>
                                                            </div>
                                                            <Button size="sm" className="gap-2" onClick={openCreateSiteGroup} disabled={!canManage}>
                                                                <Plus className="h-3.5 w-3.5" />
                                                                Add Group
                                                            </Button>
                                                        </div>
                                                    </GlassCardHeader>
                                                    <GlassCardContent className="p-0">
                                                        <Table>
                                                            <TableHeader className="bg-black/5">
                                                                <TableRow className="border-glass-border">
                                                                    <TableHead>Group</TableHead>
                                                                    <TableHead>Sites</TableHead>
                                                                    <TableHead className="text-right">Actions</TableHead>
                                                                </TableRow>
                                                            </TableHeader>
                                                            <TableBody>
                                                                {siteGroups.length === 0 ? (
                                                                    <TableRow>
                                                                        <TableCell colSpan={3} className="h-24 text-center text-muted-foreground">
                                                                            No site groups yet.
                                                                        </TableCell>
                                                                    </TableRow>
                                                                ) : (
                                                                    siteGroups.map((siteGroup) => (
                                                                        <TableRow key={siteGroup.id} className="border-glass-border hover:bg-black/5 transition-colors">
                                                                            <TableCell>
                                                                                <div className="flex flex-col">
                                                                                    <span className="font-semibold">{siteGroup.name}</span>
                                                                                    <span className="text-xs text-muted-foreground">{siteGroup.description || "No description"}</span>
                                                                                </div>
                                                                            </TableCell>
                                                                            <TableCell>{siteCountByGroup.get(siteGroup.id) ?? 0}</TableCell>
                                                                            <TableCell className="text-right">
                                                                                <div className="flex justify-end gap-2">
                                                                                    <Button variant="outline" size="sm" className="gap-1" disabled={!canManage} onClick={() => openEditSiteGroup(siteGroup)}>
                                                                                        <SquarePen className="h-3.5 w-3.5" />
                                                                                        Edit
                                                                                    </Button>
                                                                                    <Button variant="outline" size="sm" className="gap-1 text-red-600 hover:text-red-700" disabled={!canManage} onClick={() => setDeleteSiteGroupId(siteGroup.id)}>
                                                                                        <Trash2 className="h-3.5 w-3.5" />
                                                                                        Delete
                                                                                    </Button>
                                                                                </div>
                                                                            </TableCell>
                                                                        </TableRow>
                                                                    ))
                                                                )}
                                                            </TableBody>
                                                        </Table>
                                                    </GlassCardContent>
                                                </GlassCard>
                                            ) : null}

                                            {siteWorkspaceView === "compliance" && complianceReports ? (
                                                <GlassCard>
                                                    <GlassCardHeader className="pb-3 border-b border-glass-border/50">
                                                        <GlassCardTitle className="text-lg">Compliance Records</GlassCardTitle>
                                                        <GlassCardDescription>Structured reports, certificates, review states, validity dates, and portal visibility per site.</GlassCardDescription>
                                                    </GlassCardHeader>
                                                    <GlassCardContent className="space-y-4">
                                                        {sites.length === 0 ? (
                                                            <div className="rounded-2xl border border-dashed border-glass-border/70 bg-white/40 p-6 text-sm text-muted-foreground">
                                                                Add a site first to start tracking compliance records.
                                                            </div>
                                                        ) : (
                                                            sites.map((site) => {
                                                                const recordsForSite = complianceRecordsBySite.get(site.id) ?? []
                                                                return (
                                                                    <div key={site.id} className="rounded-2xl border border-glass-border/60 bg-white/35 overflow-hidden">
                                                                        <div className="flex flex-col gap-3 border-b border-glass-border/50 px-5 py-4 md:flex-row md:items-start md:justify-between">
                                                                            <div>
                                                                                <h3 className="text-base font-semibold text-foreground">{site.name}</h3>
                                                                                <p className="text-sm text-muted-foreground">{formatSiteAddress(site)}</p>
                                                                                <p className="text-xs text-muted-foreground mt-1">
                                                                                    {recordsForSite.length} compliance record(s)
                                                                                </p>
                                                                            </div>
                                                                            <Button size="sm" className="gap-2 self-start" disabled={!canManage} onClick={() => openCreateComplianceRecord(site.id)}>
                                                                                <Plus className="h-3.5 w-3.5" />
                                                                                Add Record
                                                                            </Button>
                                                                        </div>
                                                                        <Table>
                                                                            <TableHeader className="bg-black/5">
                                                                                <TableRow className="border-glass-border">
                                                                                    <TableHead>Submitted Report</TableHead>
                                                                                    <TableHead>Review Control</TableHead>
                                                                                    <TableHead>Portal Release</TableHead>
                                                                                    <TableHead>Linked Context</TableHead>
                                                                                    <TableHead className="text-right">Actions</TableHead>
                                                                                </TableRow>
                                                                            </TableHeader>
                                                                            <TableBody>
                                                                                {recordsForSite.length === 0 ? (
                                                                                    <TableRow>
                                                                                        <TableCell colSpan={5} className="h-20 text-center text-muted-foreground">
                                                                                            No compliance records added yet.
                                                                                        </TableCell>
                                                                                    </TableRow>
                                                                                ) : (
                                                                                    recordsForSite.map((record) => {
                                                                                        const renewalState = getComplianceRenewalState(record)
                                                                                        return (
                                                                                            <TableRow key={record.id} className="border-glass-border hover:bg-black/5 transition-colors">
                                                                                                <TableCell className="align-top">
                                                                                                    <div className="flex flex-col">
                                                                                                        <span className="font-semibold">{record.title}</span>
                                                                                                        <span className="text-xs text-muted-foreground">
                                                                                                            {record.reportType}
                                                                                                            {record.reference ? ` • ${record.reference}` : ""}
                                                                                                        </span>
                                                                                                        {record.outcome ? (
                                                                                                            <div className="mt-1 text-xs text-muted-foreground">Outcome: {record.outcome}</div>
                                                                                                        ) : null}
                                                                                                    </div>
                                                                                                </TableCell>
                                                                                                <TableCell className="align-top">
                                                                                                    <div className="space-y-1">
                                                                                                        <StatusBadge status={formatComplianceStatus(record.reviewStatus)}>
                                                                                                            {formatComplianceStatus(record.reviewStatus)}
                                                                                                        </StatusBadge>
                                                                                                        <div className="text-xs text-muted-foreground">
                                                                                                            Tested: {formatComplianceDate(record.testedAt)}
                                                                                                        </div>
                                                                                                        <div className="text-xs text-muted-foreground">
                                                                                                            Valid until: {formatComplianceDate(record.validUntil)}
                                                                                                        </div>
                                                                                                        <div className="text-xs text-muted-foreground">
                                                                                                            Reviewer: {record.reviewerName || "No reviewer"}
                                                                                                        </div>
                                                                                                    </div>
                                                                                                </TableCell>
                                                                                                <TableCell className="align-top">
                                                                                                    <StatusBadge status={record.customerVisible ? "Open" : "Rejected"}>
                                                                                                        {record.customerVisible ? "Visible" : "Hidden"}
                                                                                                    </StatusBadge>
                                                                                                    <div className="mt-2 text-xs text-muted-foreground">
                                                                                                        {record.customerVisible
                                                                                                            ? "Customer portal can use this record when rules allow it."
                                                                                                            : "Customer portal cannot see this record."}
                                                                                                    </div>
                                                                                                </TableCell>
                                                                                                <TableCell className="align-top">
                                                                                                    <div className="text-sm font-medium text-foreground">
                                                                                                        {record.jobTitle ?? "No linked job"}
                                                                                                    </div>
                                                                                                    <div className="mt-1 text-xs text-muted-foreground">
                                                                                                        {record.documentName ?? "No linked document"}
                                                                                                    </div>
                                                                                                    <div className="mt-2 text-xs text-muted-foreground">
                                                                                                        {renewalState.meta}
                                                                                                    </div>
                                                                                                </TableCell>
                                                                                                <TableCell className="text-right">
                                                                                                    <div className="flex justify-end gap-2">
                                                                                                        {record.documentFileUrl ? (
                                                                                                            <a href={record.documentFileUrl} target="_blank" rel="noreferrer">
                                                                                                                <Button variant="outline" size="sm" className="gap-2">
                                                                                                                    <Eye className="h-4 w-4" />
                                                                                                                    Open
                                                                                                                </Button>
                                                                                                            </a>
                                                                                                        ) : (
                                                                                                            <Button variant="outline" size="sm" className="gap-2" disabled>
                                                                                                                <Eye className="h-4 w-4" />
                                                                                                                Open
                                                                                                            </Button>
                                                                                                        )}
                                                                                                        <Button variant="outline" size="sm" className="gap-2" disabled={!canManage} onClick={() => openEditComplianceRecord(record)}>
                                                                                                            <SquarePen className="h-4 w-4" />
                                                                                                            Review
                                                                                                        </Button>
                                                                                                    </div>
                                                                                                </TableCell>
                                                                                            </TableRow>
                                                                                        )
                                                                                    })
                                                                                )}
                                                                            </TableBody>
                                                                        </Table>
                                                                    </div>
                                                                )
                                                            })
                                                        )}
                                                    </GlassCardContent>
                                                </GlassCard>
                                            ) : null}

                                            {siteWorkspaceView === "renewals" && renewals ? (
                                                <GlassCard>
                                                    <GlassCardHeader className="pb-3 border-b border-glass-border/50">
                                                        <GlassCardTitle className="text-lg">Site Renewals</GlassCardTitle>
                                                        <GlassCardDescription>Upcoming tests due, quote linkage, and site-level recurring work generated from approved records.</GlassCardDescription>
                                                    </GlassCardHeader>
                                                    <GlassCardContent className="space-y-4">
                                                        {sites.length === 0 ? (
                                                            <div className="rounded-2xl border border-dashed border-glass-border/70 bg-white/40 p-6 text-sm text-muted-foreground">
                                                                Add a site first to start tracking recurring renewal work.
                                                            </div>
                                                        ) : (
                                                            sites.map((site) => {
                                                                const renewalsForSite = renewalsBySite.get(site.id) ?? []
                                                                return (
                                                                    <div key={site.id} className="rounded-2xl border border-glass-border/60 bg-white/35 overflow-hidden">
                                                                        <div className="flex flex-col gap-2 border-b border-glass-border/50 px-5 py-4 md:flex-row md:items-start md:justify-between">
                                                                            <div>
                                                                                <h3 className="text-base font-semibold text-foreground">{site.name}</h3>
                                                                                <p className="text-sm text-muted-foreground">{formatSiteAddress(site)}</p>
                                                                                <p className="text-xs text-muted-foreground mt-1">
                                                                                    {renewalsForSite.length} renewal item(s)
                                                                                </p>
                                                                            </div>
                                                                        </div>
                                                                        <Table>
                                                                            <TableHeader className="bg-black/5">
                                                                                <TableRow className="border-glass-border">
                                                                                    <TableHead>Next Due Work</TableHead>
                                                                                    <TableHead>Due Window</TableHead>
                                                                                    <TableHead>Commercial Pipeline</TableHead>
                                                                                    <TableHead>Owner</TableHead>
                                                                                    <TableHead>Quote &amp; Value</TableHead>
                                                                                    <TableHead className="text-right">Action</TableHead>
                                                                                </TableRow>
                                                                            </TableHeader>
                                                                            <TableBody>
                                                                                {renewalsForSite.length === 0 ? (
                                                                                    <TableRow>
                                                                                        <TableCell colSpan={6} className="h-20 text-center text-muted-foreground">
                                                                                            No renewal opportunities tracked for this site yet.
                                                                                        </TableCell>
                                                                                    </TableRow>
                                                                                ) : (
                                                                                    renewalsForSite.map((renewal) => (
                                                                                        <TableRow key={renewal.id} className="border-glass-border hover:bg-black/5 transition-colors">
                                                                                            <TableCell className="align-top">
                                                                                                <div className="flex flex-col">
                                                                                                    <span className="font-semibold">{renewal.title}</span>
                                                                                                    <span className="text-xs text-muted-foreground">
                                                                                                        {renewal.reportType || "Renewal"}
                                                                                                        {renewal.reference ? ` • ${renewal.reference}` : ""}
                                                                                                    </span>
                                                                                                </div>
                                                                                            </TableCell>
                                                                                            <TableCell className="align-top">
                                                                                                <div className="text-sm font-medium text-foreground">{formatComplianceDate(renewal.dueDate)}</div>
                                                                                                <div className="mt-2">
                                                                                                    <StatusBadge status={String(renewal.timingState ?? "OPEN").replace(/_/g, " ")}>
                                                                                                        {String(renewal.timingState ?? "OPEN").replace(/_/g, " ")}
                                                                                                    </StatusBadge>
                                                                                                </div>
                                                                                                <div className="mt-2 text-xs text-muted-foreground">
                                                                                                    Window opens {formatComplianceDate(renewal.renewalWindowStart)}
                                                                                                </div>
                                                                                            </TableCell>
                                                                                            <TableCell className="align-top">
                                                                                                <StatusBadge status={String(renewal.status ?? "OPEN").replace(/_/g, " ")}>
                                                                                                    {String(renewal.status ?? "OPEN").replace(/_/g, " ")}
                                                                                                </StatusBadge>
                                                                                                <div className="mt-2 text-xs text-muted-foreground">
                                                                                                    Quoted: {formatComplianceDate(renewal.lastQuotedAt)}
                                                                                                </div>
                                                                                                <div className="mt-1 text-xs text-muted-foreground">
                                                                                                    Chased: {formatComplianceDate(renewal.lastChasedAt)}
                                                                                                </div>
                                                                                            </TableCell>
                                                                                            <TableCell className="align-top">
                                                                                                <div className="font-medium">{renewal.ownerName || "Unassigned"}</div>
                                                                                            </TableCell>
                                                                                            <TableCell className="align-top">
                                                                                                {renewal.quoteId ? (
                                                                                                    <div className="flex flex-col">
                                                                                                        <div className="font-medium">{renewal.quoteNumber || "Linked quote"}</div>
                                                                                                        <span className="text-xs text-muted-foreground">
                                                                                                            {renewal.quoteWorkflowStatusLabel ?? renewal.quoteStatus ?? "Linked quote"}
                                                                                                        </span>
                                                                                                        <div className="mt-1 text-xs font-medium text-foreground">
                                                                                                            {renewal.estimatedValue != null ? formatMoney(renewal.estimatedValue) : "Value not set"}
                                                                                                        </div>
                                                                                                    </div>
                                                                                                ) : (
                                                                                                    <>
                                                                                                        <span className="text-sm text-muted-foreground">Not linked</span>
                                                                                                        <div className="mt-1 text-xs font-medium text-foreground">
                                                                                                            {renewal.estimatedValue != null ? formatMoney(renewal.estimatedValue) : "Value not set"}
                                                                                                        </div>
                                                                                                    </>
                                                                                                )}
                                                                                            </TableCell>
                                                                                            <TableCell className="text-right align-top">
                                                                                                <div className="flex justify-end gap-2">
                                                                                                    {renewal.quoteId ? (
                                                                                                        <Link href={`/admin/quotes/${renewal.quoteId}`}>
                                                                                                            <Button variant="outline" size="sm" className="bg-white/40">
                                                                                                                Edit Quote
                                                                                                            </Button>
                                                                                                        </Link>
                                                                                                    ) : (
                                                                                                        <Button
                                                                                                            variant="outline"
                                                                                                            size="sm"
                                                                                                            className="bg-white/40"
                                                                                                            onClick={() => void createQuoteFromCustomerRenewal(renewal)}
                                                                                                            disabled={!canManage}
                                                                                                        >
                                                                                                            Create Quote
                                                                                                        </Button>
                                                                                                    )}
                                                                                                    {renewal.quoteId ? (
                                                                                                        <Link href={`/admin/quotes/${renewal.quoteId}`} target="_blank" rel="noreferrer">
                                                                                                            <Button variant="outline" size="sm" className="bg-white/40">
                                                                                                                Open Quote
                                                                                                            </Button>
                                                                                                        </Link>
                                                                                                    ) : null}
                                                                                                    <Button
                                                                                                        variant="outline"
                                                                                                        size="sm"
                                                                                                        className="bg-white/40"
                                                                                                        onClick={() => openEditRenewal(renewal)}
                                                                                                        disabled={!canManage}
                                                                                                    >
                                                                                                        <SquarePen className="mr-2 h-4 w-4" />
                                                                                                        Update
                                                                                                    </Button>
                                                                                                </div>
                                                                                            </TableCell>
                                                                                        </TableRow>
                                                                                    ))
                                                                                )}
                                                                            </TableBody>
                                                                        </Table>
                                                                    </div>
                                                                )
                                                            })
                                                        )}
                                                    </GlassCardContent>
                                                </GlassCard>
                                            ) : null}

                                            {siteWorkspaceView === "portal" && siteScopedPortal ? (
                                                <GlassCard>
                                                    <GlassCardHeader className="pb-3 border-b border-glass-border/50">
                                                        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                                                            <div>
                                                                <GlassCardTitle className="text-lg">Portal Site Access</GlassCardTitle>
                                                                <GlassCardDescription>Choose whether this customer portal can see all customer records or only records tied to selected sites.</GlassCardDescription>
                                                            </div>
                                                            <div className="flex items-center gap-3 rounded-xl border border-glass-border/60 bg-white/35 px-4 py-2">
                                                                <div className="text-right">
                                                                    <div className="text-sm font-medium text-foreground">Restrict by site</div>
                                                                    <div className="text-xs text-muted-foreground">
                                                                        {portalScopedBySite ? "Only selected sites visible" : "All customer sites visible"}
                                                                    </div>
                                                                </div>
                                                                <Switch
                                                                    checked={portalScopedBySite}
                                                                    onCheckedChange={(checked) => {
                                                                        setPortalScopedBySite(checked)
                                                                        if (!checked) {
                                                                            setPortalAllowedSiteIds([])
                                                                        }
                                                                    }}
                                                                    disabled={!canManage}
                                                                />
                                                            </div>
                                                        </div>
                                                    </GlassCardHeader>
                                                    <GlassCardContent className="space-y-4">
                                                        {!portalScopedBySite ? (
                                                            <div className="rounded-2xl border border-dashed border-glass-border/70 bg-white/35 p-4 text-sm text-muted-foreground">
                                                                The customer can currently see all quotes, invoices, and jobs for this workspace customer record.
                                                            </div>
                                                        ) : (
                                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                                                {sites.length === 0 ? (
                                                                    <div className="rounded-2xl border border-dashed border-glass-border/70 bg-white/35 p-4 text-sm text-muted-foreground md:col-span-2">
                                                                        Add sites first before restricting portal visibility by site.
                                                                    </div>
                                                                ) : (
                                                                    sites.map((site) => (
                                                                        <label key={site.id} className="flex items-start gap-3 rounded-2xl border border-glass-border/60 bg-white/35 px-4 py-3 cursor-pointer">
                                                                            <Checkbox
                                                                                checked={portalAllowedSiteIds.includes(site.id)}
                                                                                onCheckedChange={(checked) => {
                                                                                    setPortalAllowedSiteIds((prev) =>
                                                                                        checked
                                                                                            ? Array.from(new Set([...prev, site.id]))
                                                                                            : prev.filter((siteId) => siteId !== site.id)
                                                                                    )
                                                                                }}
                                                                                disabled={!canManage}
                                                                            />
                                                                            <div className="min-w-0">
                                                                                <div className="font-medium text-foreground">{site.name}</div>
                                                                                <div className="text-xs text-muted-foreground">
                                                                                    {site.reference || "No reference"}
                                                                                    {site.category ? ` • ${site.category}` : ""}
                                                                                </div>
                                                                                <div className="text-xs text-muted-foreground mt-1">
                                                                                    {formatSiteAddress(site)}
                                                                                </div>
                                                                            </div>
                                                                        </label>
                                                                    ))
                                                                )}
                                                            </div>
                                                        )}
                                                        <div className="flex justify-end">
                                                            <Button onClick={savePortalScope} disabled={!canManage || portalScopeSaving}>
                                                                {portalScopeSaving ? "Saving..." : "Save Portal Access"}
                                                            </Button>
                                                        </div>
                                                    </GlassCardContent>
                                                </GlassCard>
                                            ) : null}
                                        </div>
                                    </div>
                                </TabsContent> : null}

                                <TabsContent value="contacts">
                                    <GlassCard>
                                        <GlassCardHeader className="pb-3 border-b border-glass-border/50">
                                            <div className="flex items-center justify-between gap-3">
                                                <div>
                                                    <GlassCardTitle className="text-lg">Contacts</GlassCardTitle>
                                                    <GlassCardDescription>General contact persons for this customer.</GlassCardDescription>
                                                </div>
                                                <Button
                                                    size="sm"
                                                    className="gap-2"
                                                    onClick={openCreateContact}
                                                    disabled={!canManage}
                                                >
                                                    <Plus className="h-3.5 w-3.5" />
                                                    Add Contact
                                                </Button>
                                            </div>
                                        </GlassCardHeader>
                                        <GlassCardContent className="p-0">
                                            <Table>
                                                <TableHeader className="bg-black/5">
                                                    <TableRow className="border-glass-border">
                                                        <TableHead>Name</TableHead>
                                                        <TableHead>Email</TableHead>
                                                        <TableHead>Phone</TableHead>
                                                        <TableHead>Address</TableHead>
                                                        <TableHead className="text-right">Actions</TableHead>
                                                    </TableRow>
                                                </TableHeader>
                                                <TableBody>
                                                    {contacts.length === 0 ? (
                                                        <TableRow>
                                                            <TableCell colSpan={5} className="h-20 text-center text-muted-foreground">
                                                                No contacts added yet.
                                                            </TableCell>
                                                        </TableRow>
                                                    ) : (
                                                        contacts.map((contact) => (
                                                            <TableRow key={contact.id} className="border-glass-border hover:bg-black/5 transition-colors">
                                                                <TableCell className="font-semibold">{contact.name}</TableCell>
                                                                <TableCell>{contact.email}</TableCell>
                                                                <TableCell>{contact.phone || "N/A"}</TableCell>
                                                                <TableCell>{contact.address || "—"}</TableCell>
                                                                <TableCell className="text-right">
                                                                    <div className="flex justify-end gap-2">
                                                                        <Button
                                                                            variant="outline"
                                                                            size="sm"
                                                                            className="gap-1"
                                                                            disabled={!canManage}
                                                                            onClick={() => openEditContact(contact)}
                                                                        >
                                                                            <SquarePen className="h-3.5 w-3.5" />
                                                                            Edit
                                                                        </Button>
                                                                        <Button
                                                                            variant="outline"
                                                                            size="sm"
                                                                            className="gap-1 text-red-600 hover:text-red-700"
                                                                            disabled={!canManage}
                                                                            onClick={() => setDeleteContactId(String(contact.id))}
                                                                        >
                                                                            <Trash2 className="h-3.5 w-3.5" />
                                                                            Delete
                                                                        </Button>
                                                                    </div>
                                                                </TableCell>
                                                            </TableRow>
                                                        ))
                                                    )}
                                                </TableBody>
                                            </Table>
                                        </GlassCardContent>
                                    </GlassCard>
                                </TabsContent>

                                <TabsContent value="jobs">
                                    <GlassCard>
                                        <GlassCardHeader className="pb-3 border-b border-glass-border/50">
                                            <GlassCardTitle className="text-lg">Jobs</GlassCardTitle>
                                            <GlassCardDescription>All jobs linked to this customer.</GlassCardDescription>
                                        </GlassCardHeader>
                                        <GlassCardContent className="p-0">
                                            <Table>
                                                <TableHeader className="bg-black/5">
                                                    <TableRow className="border-glass-border">
                                                        <TableHead>Job</TableHead>
                                                        <TableHead>From</TableHead>
                                                        <TableHead>To</TableHead>
                                                        <TableHead>Status</TableHead>
                                                        <TableHead className="text-right">Amount</TableHead>
                                                        <TableHead className="text-right">Open</TableHead>
                                                    </TableRow>
                                                </TableHeader>
                                                <TableBody>
                                                    {jobs.length === 0 ? (
                                                        <TableRow>
                                                            <TableCell colSpan={6} className="h-28 text-center text-muted-foreground">
                                                                <div className="flex flex-col items-center gap-3">
                                                                    <span>No jobs linked yet.</span>
                                                                    {canManage ? (
                                                                        <Button size="sm" className="gap-2" asChild>
                                                                            <Link href={`/admin/schedule?create=job&customerId=${customerId}`}><Plus className="h-4 w-4" /> Create Job</Link>
                                                                        </Button>
                                                                    ) : null}
                                                                </div>
                                                            </TableCell>
                                                        </TableRow>
                                                    ) : (
                                                        jobs.map((job) => (
                                                            <TableRow key={job.id} className="border-glass-border hover:bg-black/5 transition-colors">
                                                                <TableCell className="font-semibold">{job.title}</TableCell>
                                                                <TableCell>{job.scheduledAt ? new Date(job.scheduledAt).toLocaleString("en-GB") : "—"}</TableCell>
                                                                <TableCell>{job.scheduledEndAt ? new Date(job.scheduledEndAt).toLocaleString("en-GB") : "—"}</TableCell>
                                                                <TableCell>
                                                                    <StatusBadge status={formatJobStatus(job.status)} className="gap-1.5">
                                                                        {getJobStatusIcon(job.status)}
                                                                        {getWorkflowStatusLabel(
                                                                            "jobs",
                                                                            job.status,
                                                                            job.workflowStageKey,
                                                                            workflowConfig,
                                                                            complianceWorkflows
                                                                        )}
                                                                    </StatusBadge>
                                                                </TableCell>
                                                                <TableCell className="text-right">£{Number(job.amount ?? 0).toFixed(2)}</TableCell>
                                                                <TableCell className="text-right">
                                                                    <Button asChild size="sm" variant="outline">
                                                                        <Link href={`/admin/schedule/${job.id}`}>View</Link>
                                                                    </Button>
                                                                </TableCell>
                                                            </TableRow>
                                                        ))
                                                    )}
                                                </TableBody>
                                            </Table>
                                        </GlassCardContent>
                                    </GlassCard>
                                </TabsContent>

                                <TabsContent value="quotes">
                                    <GlassCard>
                                        <GlassCardHeader className="pb-3 border-b border-glass-border/50">
                                            <div className="flex items-center justify-between gap-3">
                                                <div>
                                                    <GlassCardTitle className="text-lg">Quotes</GlassCardTitle>
                                                    <GlassCardDescription>All quotes linked to this customer.</GlassCardDescription>
                                                </div>
                                                {canManage ? (
                                                    <Button size="sm" className="gap-2" asChild>
                                                        <Link href={`/admin/quotes/new?customerId=${customerId}`}>
                                                            <Plus className="h-4 w-4" />
                                                            Create Quote
                                                        </Link>
                                                    </Button>
                                                ) : null}
                                            </div>
                                        </GlassCardHeader>
                                        <GlassCardContent className="p-0">
                                            <Table>
                                                <TableHeader className="bg-black/5">
                                                    <TableRow className="border-glass-border">
                                                        <TableHead>Quote</TableHead>
                                                        {sitesEnabled ? <TableHead>Site</TableHead> : null}
                                                        <TableHead>Created</TableHead>
                                                        <TableHead>Valid Until</TableHead>
                                                        <TableHead>Status</TableHead>
                                                        <TableHead className="text-right">Total</TableHead>
                                                        <TableHead className="text-right">Open</TableHead>
                                                    </TableRow>
                                                </TableHeader>
                                                <TableBody>
                                                    {quotes.length === 0 ? (
                                                        <TableRow>
                                                            <TableCell colSpan={sitesEnabled ? 7 : 6} className="h-28 text-center text-muted-foreground">
                                                                <div className="flex flex-col items-center gap-3">
                                                                    <span>No quotes linked yet.</span>
                                                                    {canManage ? (
                                                                        <Button size="sm" className="gap-2" asChild>
                                                                            <Link href={`/admin/quotes/new?customerId=${customerId}`}><Plus className="h-4 w-4" /> Create Quote</Link>
                                                                        </Button>
                                                                    ) : null}
                                                                </div>
                                                            </TableCell>
                                                        </TableRow>
                                                    ) : (
                                                        quotes.map((quote) => {
                                                            const quoteStatus = getQuoteDisplayStatus(quote)
                                                            return (
                                                                <TableRow key={quote.id} className="border-glass-border hover:bg-black/5 transition-colors">
                                                                    <TableCell>
                                                                        <div className="flex flex-col gap-1">
                                                                            <RecordNumberBadge value={quote.quoteNumber} fallback="Quote" />
                                                                            <span className="font-semibold">{quote.title ?? "Quote"}</span>
                                                                        </div>
                                                                    </TableCell>
                                                                    {sitesEnabled ? <TableCell>{quote.siteName || "—"}</TableCell> : null}
                                                                    <TableCell>{formatDisplayDate(quote.createdAt)}</TableCell>
                                                                    <TableCell>{formatDisplayDate(quote.validUntil)}</TableCell>
                                                                    <TableCell>
                                                                        <StatusBadge status={quoteStatus}>{quoteStatus}</StatusBadge>
                                                                    </TableCell>
                                                                    <TableCell className="text-right">{formatMoney(quote.total)}</TableCell>
                                                                    <TableCell className="text-right">
                                                                        <Button asChild size="sm" variant="outline">
                                                                            <Link href={`/admin/quotes/${quote.id}`}>View</Link>
                                                                        </Button>
                                                                    </TableCell>
                                                                </TableRow>
                                                            )
                                                        })
                                                    )}
                                                </TableBody>
                                            </Table>
                                        </GlassCardContent>
                                    </GlassCard>
                                </TabsContent>

                                <TabsContent value="invoices">
                                    <GlassCard>
                                        <GlassCardHeader className="pb-3 border-b border-glass-border/50">
                                            <GlassCardTitle className="text-lg">Invoices</GlassCardTitle>
                                            <GlassCardDescription>All invoices linked to this customer.</GlassCardDescription>
                                        </GlassCardHeader>
                                        <GlassCardContent className="p-0">
                                            <Table>
                                                <TableHeader className="bg-black/5">
                                                    <TableRow className="border-glass-border">
                                                        <TableHead>Invoice</TableHead>
                                                        <TableHead>Issue Date</TableHead>
                                                        <TableHead>Due Date</TableHead>
                                                        <TableHead>Status</TableHead>
                                                        <TableHead className="text-right">Total</TableHead>
                                                        <TableHead className="text-right">Open</TableHead>
                                                    </TableRow>
                                                </TableHeader>
                                                <TableBody>
                                                    {invoices.length === 0 ? (
                                                        <TableRow>
                                                            <TableCell colSpan={6} className="h-28 text-center text-muted-foreground">
                                                                <div className="flex flex-col items-center gap-3">
                                                                    <span>No invoices linked yet.</span>
                                                                    {canManage ? (
                                                                        <Button size="sm" className="gap-2" asChild>
                                                                            <Link href={`/admin/finance?create=invoice&customerId=${customerId}`}><Plus className="h-4 w-4" /> Create Invoice</Link>
                                                                        </Button>
                                                                    ) : null}
                                                                </div>
                                                            </TableCell>
                                                        </TableRow>
                                                    ) : (
                                                        invoices.map((invoice) => (
                                                            <TableRow key={invoice.id} className="border-glass-border hover:bg-black/5 transition-colors">
                                                                <TableCell className="font-semibold">{invoice.invoiceNumber || invoice.title}</TableCell>
                                                                <TableCell>{invoice.createdAt ? new Date(invoice.createdAt).toLocaleDateString("en-GB") : "—"}</TableCell>
                                                                <TableCell>{invoice.dueDate ? new Date(invoice.dueDate).toLocaleDateString("en-GB") : "—"}</TableCell>
                                                                <TableCell>
                                                                    <StatusBadge status={formatInvoiceStatus(invoice.status)} className="gap-1.5">
                                                                        {getInvoiceStatusIcon(invoice.status)}
                                                                        {getWorkflowStatusLabel(
                                                                            "invoices",
                                                                            invoice.status,
                                                                            invoice.workflowStageKey,
                                                                            workflowConfig,
                                                                            complianceWorkflows
                                                                        )}
                                                                    </StatusBadge>
                                                                </TableCell>
                                                                <TableCell className="text-right">£{Number(invoice.total ?? 0).toFixed(2)}</TableCell>
                                                                <TableCell className="text-right">
                                                                    <Button asChild size="sm" variant="outline">
                                                                        <Link href={`/admin/finance/${invoice.id}`}>View</Link>
                                                                    </Button>
                                                                </TableCell>
                                                            </TableRow>
                                                        ))
                                                    )}
                                                </TableBody>
                                            </Table>
                                        </GlassCardContent>
                                    </GlassCard>
                                </TabsContent>
                            </Tabs>
                        </>
                    )}

                    <GlassModal
                        open={resetPasswordOpen}
                        onOpenChange={(open) => {
                            setResetPasswordOpen(open)
                            if (!open) {
                                setResetPassword("")
                                setResetPasswordError(null)
                            }
                        }}
                        title="Reset Customer Password"
                        description="Set a password manually or leave it blank to generate and email a temporary password."
                        footer={
                            <div className="flex justify-end gap-2">
                                <Button variant="ghost" onClick={() => setResetPasswordOpen(false)}>
                                    Cancel
                                </Button>
                                <Button onClick={handleResetCustomerPassword} disabled={resetPasswordLoading || !canManage}>
                                    {resetPasswordLoading ? "Saving..." : "Reset Password"}
                                </Button>
                            </div>
                        }
                    >
                        <div className="space-y-4">
                            <div className="rounded-xl border border-glass-border bg-white/50 p-3">
                                <p className="font-semibold text-foreground">{customer?.name ?? "Customer"}</p>
                                <p className="text-sm text-muted-foreground">{customer?.email ?? "No email saved"}</p>
                            </div>
                            <div className="space-y-2">
                                <Label optional>New Password</Label>
                                <Input
                                    type="password"
                                    autoComplete="new-password"
                                    placeholder="Leave blank to auto-generate"
                                    value={resetPassword}
                                    onChange={(event) => {
                                        setResetPassword(event.target.value)
                                        setResetPasswordError(null)
                                    }}
                                />
                                {resetPasswordError ? <p className="text-xs text-destructive">{resetPasswordError}</p> : null}
                            </div>
                        </div>
                    </GlassModal>

                    <GlassModal
                        open={contactOpen}
                        onOpenChange={(open) => {
                            setContactOpen(open)
                            if (!open) {
                                resetContactForm()
                            }
                        }}
                        title={editingContactId ? "Edit Contact" : "Add Contact"}
                        description="Store general customer contact information."
                        footer={
                            <div className="flex justify-end gap-2">
                                <Button variant="ghost" onClick={() => setContactOpen(false)}>
                                    Cancel
                                </Button>
                                <Button onClick={saveContact} disabled={contactSaving}>
                                    {contactSaving ? "Saving..." : editingContactId ? "Save Changes" : "Add Contact"}
                                </Button>
                            </div>
                        }
                    >
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label required>Name</Label>
                                <Input
                                    placeholder="Contact full name"
                                    value={contactForm.name}
                                    onChange={(e) => setContactForm((prev) => ({ ...prev, name: e.target.value }))}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label required>Email</Label>
                                <Input
                                    type="email"
                                    placeholder="contact@email.com"
                                    value={contactForm.email}
                                    onChange={(e) => setContactForm((prev) => ({ ...prev, email: e.target.value }))}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label optional>Phone</Label>
                                <PhoneInput
                                    value={contactForm.phone}
                                    onChange={(phone) => setContactForm((prev) => ({ ...prev, phone }))}
                                />
                            </div>
                            <div className="md:col-span-2">
                                <AddressFields
                                    value={contactForm.address}
                                    onChange={(address) => setContactForm((prev) => ({ ...prev, address }))}
                                />
                            </div>
                        </div>
                    </GlassModal>

                    <GlassModal
                        open={siteGroupOpen}
                        onOpenChange={(open) => {
                            setSiteGroupOpen(open)
                            if (!open) {
                                resetSiteGroupForm()
                            }
                        }}
                        title={editingSiteGroupId ? "Edit Site Group" : "Add Site Group"}
                        description="Group related sites together for cleaner customer management."
                        footer={
                            <div className="flex justify-end gap-2">
                                <Button variant="ghost" onClick={() => setSiteGroupOpen(false)}>
                                    Cancel
                                </Button>
                                <Button onClick={saveSiteGroup} disabled={siteGroupSaving}>
                                    {siteGroupSaving ? "Saving..." : editingSiteGroupId ? "Save Changes" : "Add Site Group"}
                                </Button>
                            </div>
                        }
                    >
                        <div className="grid grid-cols-1 gap-4">
                            <div className="space-y-2">
                                <Label required>Group Name</Label>
                                <Input
                                    placeholder="North Region"
                                    value={siteGroupForm.name}
                                    onChange={(e) => setSiteGroupForm((prev) => ({ ...prev, name: e.target.value }))}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label optional>Description</Label>
                                <Textarea
                                    placeholder="Optional notes about the purpose of this site group"
                                    className="bg-white/50 min-h-[96px]"
                                    value={siteGroupForm.description}
                                    onChange={(e) => setSiteGroupForm((prev) => ({ ...prev, description: e.target.value }))}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label optional>Sort Order</Label>
                                <Input
                                    type="number"
                                    placeholder="0"
                                    value={siteGroupForm.sortOrder}
                                    onChange={(e) => setSiteGroupForm((prev) => ({ ...prev, sortOrder: e.target.value }))}
                                />
                            </div>
                        </div>
                    </GlassModal>

                    <GlassModal
                        open={siteOpen}
                        onOpenChange={(open) => {
                            setSiteOpen(open)
                            if (!open) {
                                resetSiteForm()
                            }
                        }}
                        title={editingSiteId ? "Edit Site" : "Add Site"}
                        description="Store site-level location and operational contact information."
                        footer={
                            <div className="flex justify-end gap-2">
                                <Button variant="ghost" onClick={() => setSiteOpen(false)}>
                                    Cancel
                                </Button>
                                <Button onClick={saveSite} disabled={siteSaving}>
                                    {siteSaving ? "Saving..." : editingSiteId ? "Save Changes" : "Add Site"}
                                </Button>
                            </div>
                        }
                    >
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label required>Site Name</Label>
                                <Input
                                    placeholder="Manchester Office"
                                    value={siteForm.name}
                                    onChange={(e) => setSiteForm((prev) => ({ ...prev, name: e.target.value }))}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label optional>Category</Label>
                                <Input
                                    placeholder="Commercial, Residential, Healthcare..."
                                    value={siteForm.category}
                                    onChange={(e) => setSiteForm((prev) => ({ ...prev, category: e.target.value }))}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label optional>Reference</Label>
                                <Input
                                    placeholder="SITE-001"
                                    value={siteForm.reference}
                                    onChange={(e) => setSiteForm((prev) => ({ ...prev, reference: e.target.value }))}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label optional>Site Group</Label>
                                <Select
                                    value={siteForm.siteGroupId || "ungrouped"}
                                    createOption={{ label: "site group", href: `/admin/customers/${customerId}?create=site-group` }}
                                    onValueChange={(value) => setSiteForm((prev) => ({ ...prev, siteGroupId: value === "ungrouped" ? "" : value }))}
                                >
                                    <SelectTrigger className="w-full bg-white/50">
                                        <SelectValue placeholder="Select a site group" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="ungrouped">Ungrouped</SelectItem>
                                        {siteGroups.map((siteGroup) => (
                                            <SelectItem key={siteGroup.id} value={siteGroup.id}>{siteGroup.name}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-2">
                                <Label required>Status</Label>
                                <Select value={siteForm.status} onValueChange={(value) => setSiteForm((prev) => ({ ...prev, status: value }))}>
                                    <SelectTrigger className="w-full bg-white/50">
                                        <SelectValue placeholder="Select a status" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="ACTIVE">Active</SelectItem>
                                        <SelectItem value="INACTIVE">Inactive</SelectItem>
                                        <SelectItem value="PROSPECT">Prospect</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-2 md:col-span-2">
                                <Label optional>Address Line 1</Label>
                                <Input
                                    placeholder="Street address"
                                    value={siteForm.addressLine1}
                                    onChange={(e) => setSiteForm((prev) => ({ ...prev, addressLine1: e.target.value }))}
                                />
                            </div>
                            <div className="space-y-2 md:col-span-2">
                                <Label optional>Address Line 2</Label>
                                <Input
                                    placeholder="Suite, floor, or building"
                                    value={siteForm.addressLine2}
                                    onChange={(e) => setSiteForm((prev) => ({ ...prev, addressLine2: e.target.value }))}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label optional>City</Label>
                                <Input
                                    placeholder="City"
                                    value={siteForm.city}
                                    onChange={(e) => setSiteForm((prev) => ({ ...prev, city: e.target.value }))}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label optional>State / County</Label>
                                <Input
                                    placeholder="State or county"
                                    value={siteForm.state}
                                    onChange={(e) => setSiteForm((prev) => ({ ...prev, state: e.target.value }))}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label optional>Postal Code</Label>
                                <Input
                                    placeholder="Postal code"
                                    value={siteForm.postalCode}
                                    onChange={(e) => setSiteForm((prev) => ({ ...prev, postalCode: e.target.value }))}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label optional>Country</Label>
                                <CountrySelect
                                    value={siteForm.country}
                                    onValueChange={(country) => setSiteForm((prev) => ({ ...prev, country }))}
                                />
                            </div>
                            <div className="space-y-2 md:col-span-2">
                                <Label optional>Tags</Label>
                                <Input
                                    placeholder="High priority, Key account, Out of hours"
                                    value={siteForm.tags}
                                    onChange={(e) => setSiteForm((prev) => ({ ...prev, tags: e.target.value }))}
                                />
                            </div>
                            <div className="space-y-2 md:col-span-2">
                                <Label optional>Main Site Contact</Label>
                                <Select
                                    value={siteForm.mainContactId || "manual"}
                                    createOption={editingSiteId ? { label: "site contact", href: `/admin/customers/${customerId}?create=site-contact&siteId=${editingSiteId}` } : undefined}
                                    onValueChange={(value) => setSiteForm((prev) => ({ ...prev, mainContactId: value === "manual" ? "" : value }))}
                                >
                                    <SelectTrigger className="w-full bg-white/50">
                                        <SelectValue placeholder="Select a main site contact" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="manual">Use manual primary contact fields</SelectItem>
                                        {(editingSiteId ? siteContactsBySite.get(editingSiteId) ?? [] : []).map((contact) => (
                                            <SelectItem key={contact.id} value={contact.id}>
                                                {contact.name}{contact.role ? ` • ${contact.role}` : ""}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                {!editingSiteId ? (
                                    <p className="text-xs text-muted-foreground">Create the site first, then add dedicated site contacts and assign the main contact.</p>
                                ) : null}
                            </div>
                            <div className="space-y-2">
                                <Label optional>Primary Contact Name</Label>
                                <Input
                                    placeholder="On-site contact"
                                    value={siteForm.primaryContactName}
                                    disabled={Boolean(siteForm.mainContactId)}
                                    onChange={(e) => setSiteForm((prev) => ({ ...prev, primaryContactName: e.target.value }))}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label optional>Primary Contact Email</Label>
                                <Input
                                    type="email"
                                    placeholder="site-contact@email.com"
                                    value={siteForm.primaryContactEmail}
                                    disabled={Boolean(siteForm.mainContactId)}
                                    onChange={(e) => setSiteForm((prev) => ({ ...prev, primaryContactEmail: e.target.value }))}
                                />
                            </div>
                            <div className="space-y-2 md:col-span-2">
                                <Label optional>Primary Contact Phone</Label>
                                <PhoneInput
                                    value={siteForm.primaryContactPhone}
                                    disabled={Boolean(siteForm.mainContactId)}
                                    onChange={(phone) => setSiteForm((prev) => ({ ...prev, primaryContactPhone: phone }))}
                                />
                            </div>
                            <div className="space-y-2 md:col-span-2">
                                <Label optional>Additional Information</Label>
                                <Textarea
                                    placeholder="Access windows, permit rules, escalation notes, or other site-specific operating context"
                                    className="bg-white/50 min-h-[96px]"
                                    value={siteForm.additionalInformation}
                                    onChange={(e) => setSiteForm((prev) => ({ ...prev, additionalInformation: e.target.value }))}
                                />
                            </div>
                            <div className="space-y-2 md:col-span-2">
                                <Label optional>Notes</Label>
                                <Textarea
                                    placeholder="Access notes, service constraints, or other important site context"
                                    className="bg-white/50 min-h-[120px]"
                                    value={siteForm.notes}
                                    onChange={(e) => setSiteForm((prev) => ({ ...prev, notes: e.target.value }))}
                                />
                            </div>
                        </div>
                    </GlassModal>

                    <GlassModal
                        open={siteContactOpen}
                        onOpenChange={(open) => {
                            setSiteContactOpen(open)
                            if (!open) {
                                resetSiteContactForm()
                            }
                        }}
                        title={editingSiteContactId ? "Edit Site Contact" : "Add Site Contact"}
                        description={`Store dedicated contact information for ${siteMap.get(siteContactForm.siteId)?.name ?? "this site"}.`}
                        footer={
                            <div className="flex justify-end gap-2">
                                <Button variant="ghost" onClick={() => setSiteContactOpen(false)}>
                                    Cancel
                                </Button>
                                <Button onClick={saveSiteContact} disabled={siteContactSaving}>
                                    {siteContactSaving ? "Saving..." : editingSiteContactId ? "Save Changes" : "Add Site Contact"}
                                </Button>
                            </div>
                        }
                    >
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="space-y-2 md:col-span-2">
                                <Label required>Site</Label>
                                <Input value={siteMap.get(siteContactForm.siteId)?.name ?? "Unknown site"} disabled />
                            </div>
                            <div className="space-y-2">
                                <Label required>Name</Label>
                                <Input
                                    placeholder="Site contact name"
                                    value={siteContactForm.name}
                                    onChange={(e) => setSiteContactForm((prev) => ({ ...prev, name: e.target.value }))}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label optional>Role</Label>
                                <Input
                                    placeholder="Facilities Manager"
                                    value={siteContactForm.role}
                                    onChange={(e) => setSiteContactForm((prev) => ({ ...prev, role: e.target.value }))}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label optional>Email</Label>
                                <Input
                                    type="email"
                                    placeholder="site.contact@email.com"
                                    value={siteContactForm.email}
                                    onChange={(e) => setSiteContactForm((prev) => ({ ...prev, email: e.target.value }))}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label optional>Phone</Label>
                                <PhoneInput
                                    value={siteContactForm.phone}
                                    onChange={(phone) => setSiteContactForm((prev) => ({ ...prev, phone }))}
                                />
                            </div>
                            <div className="space-y-2 md:col-span-2">
                                <Label optional>Notes</Label>
                                <Textarea
                                    placeholder="Availability, authority level, or other context for this site contact"
                                    className="bg-white/50 min-h-[120px]"
                                    value={siteContactForm.notes}
                                    onChange={(e) => setSiteContactForm((prev) => ({ ...prev, notes: e.target.value }))}
                                />
                            </div>
                        </div>
                    </GlassModal>

                    <GlassModal
                        open={complianceRecordOpen}
                        onOpenChange={(open) => {
                            setComplianceRecordOpen(open)
                            if (!open) {
                                resetComplianceRecordForm()
                            }
                        }}
                        title={editingComplianceRecordId ? "Edit Compliance Record" : "Add Compliance Record"}
                        description={`Track structured report and certificate data for ${siteMap.get(complianceRecordForm.siteId)?.name ?? "this site"}.`}
                        footer={
                            <div className="flex justify-end gap-2">
                                <Button variant="ghost" onClick={() => setComplianceRecordOpen(false)}>
                                    Cancel
                                </Button>
                                <Button onClick={saveComplianceRecord} disabled={complianceRecordSaving}>
                                    {complianceRecordSaving ? "Saving..." : editingComplianceRecordId ? "Save Changes" : "Add Record"}
                                </Button>
                            </div>
                        }
                    >
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="space-y-2 md:col-span-2">
                                <Label required>Site</Label>
                                <Input value={siteMap.get(complianceRecordForm.siteId)?.name ?? "Unknown site"} disabled />
                            </div>
                            <div className="space-y-2 md:col-span-2">
                                <Label required>Record Title</Label>
                                <Input
                                    placeholder="EICR Certificate - Main Building"
                                    value={complianceRecordForm.title}
                                    onChange={(e) => setComplianceRecordForm((prev) => ({ ...prev, title: e.target.value }))}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label required>Report Type</Label>
                                <Input
                                    placeholder="Electrical, Fire Alarm, Emergency Lighting..."
                                    value={complianceRecordForm.reportType}
                                    onChange={(e) => setComplianceRecordForm((prev) => ({ ...prev, reportType: e.target.value }))}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label optional>Reference</Label>
                                <Input
                                    placeholder="CERT-2026-001"
                                    value={complianceRecordForm.reference}
                                    onChange={(e) => setComplianceRecordForm((prev) => ({ ...prev, reference: e.target.value }))}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label optional>Outcome</Label>
                                <Input
                                    placeholder="Pass, Fail, Advisory..."
                                    value={complianceRecordForm.outcome}
                                    onChange={(e) => setComplianceRecordForm((prev) => ({ ...prev, outcome: e.target.value }))}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label required>Review Status</Label>
                                <Select value={complianceRecordForm.reviewStatus} onValueChange={(value) => setComplianceRecordForm((prev) => ({ ...prev, reviewStatus: value }))}>
                                    <SelectTrigger className="w-full bg-white/50">
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
                                <Label optional>Tested At</Label>
                                <Input
                                    type="date"
                                    value={complianceRecordForm.testedAt}
                                    onChange={(e) => setComplianceRecordForm((prev) => ({ ...prev, testedAt: e.target.value }))}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label optional>Valid From</Label>
                                <Input
                                    type="date"
                                    value={complianceRecordForm.validFrom}
                                    onChange={(e) => setComplianceRecordForm((prev) => ({ ...prev, validFrom: e.target.value }))}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label optional>Valid Until</Label>
                                <Input
                                    type="date"
                                    value={complianceRecordForm.validUntil}
                                    onChange={(e) => setComplianceRecordForm((prev) => ({ ...prev, validUntil: e.target.value }))}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label optional>Reviewer</Label>
                                <Select
                                    value={complianceRecordForm.reviewerUserId || "__none__"}
                                    createOption={{ label: "employee", href: "/admin/team?create=employee" }}
                                    onValueChange={(value) => setComplianceRecordForm((prev) => ({ ...prev, reviewerUserId: value === "__none__" ? "" : value }))}
                                >
                                    <SelectTrigger className="w-full bg-white/50">
                                        <SelectValue placeholder="Assign reviewer" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="__none__">Unassigned</SelectItem>
                                        {tenantUsers.map((user) => (
                                            <SelectItem key={user.id} value={user.id}>
                                                {user.fullName || user.email || "User"}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-2">
                                <Label optional>Linked Job</Label>
                                <Select
                                    value={complianceRecordForm.jobId || "__none__"}
                                    createOption={{ label: "job", href: "/admin/schedule?create=job" }}
                                    onValueChange={(value) => setComplianceRecordForm((prev) => ({ ...prev, jobId: value === "__none__" ? "" : value }))}
                                >
                                    <SelectTrigger className="w-full bg-white/50">
                                        <SelectValue placeholder="Link a job" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="__none__">No linked job</SelectItem>
                                        {jobs
                                            .filter((job) => job.siteId === complianceRecordForm.siteId)
                                            .map((job) => (
                                                <SelectItem key={job.id} value={job.id}>
                                                    {job.title || job.id}
                                                </SelectItem>
                                            ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-2">
                                <Label optional>Linked Document</Label>
                                <Select
                                    value={complianceRecordForm.documentId || "__none__"}
                                    createOption={{ label: "document", href: "/admin/documents?create=document" }}
                                    onValueChange={(value) => setComplianceRecordForm((prev) => ({ ...prev, documentId: value === "__none__" ? "" : value }))}
                                >
                                    <SelectTrigger className="w-full bg-white/50">
                                        <SelectValue placeholder="Link a document" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="__none__">No linked document</SelectItem>
                                        {tenantDocuments.map((document) => (
                                            <SelectItem key={document.id} value={document.id}>
                                                {document.name}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-2 md:col-span-2">
                                <Label optional>Review Note</Label>
                                <Textarea
                                    placeholder="Office review comments or approval notes"
                                    className="bg-white/50 min-h-[96px]"
                                    value={complianceRecordForm.reviewNote}
                                    onChange={(e) => setComplianceRecordForm((prev) => ({ ...prev, reviewNote: e.target.value }))}
                                />
                            </div>
                            <div className="space-y-2 md:col-span-2">
                                <Label optional>Notes</Label>
                                <Textarea
                                    placeholder="Testing details, limitations, or record context"
                                    className="bg-white/50 min-h-[120px]"
                                    value={complianceRecordForm.notes}
                                    onChange={(e) => setComplianceRecordForm((prev) => ({ ...prev, notes: e.target.value }))}
                                />
                            </div>
                            <div className="md:col-span-2 rounded-2xl border border-glass-border/60 bg-white/35 px-4 py-3 flex items-center justify-between gap-4">
                                <div>
                                    <div className="font-medium text-foreground">Customer Portal Visibility</div>
                                    <div className="text-xs text-muted-foreground">Allow this approved record to appear in the customer portal and future certificate views.</div>
                                </div>
                                <Switch
                                    checked={complianceRecordForm.customerVisible}
                                    onCheckedChange={(checked) => setComplianceRecordForm((prev) => ({ ...prev, customerVisible: checked }))}
                                />
                            </div>
                        </div>
                    </GlassModal>

                    <GlassModal
                        open={renewalOpen}
                        onOpenChange={(open) => {
                            setRenewalOpen(open)
                            if (!open) {
                                setSelectedRenewal(null)
                                setRenewalForm(DEFAULT_RENEWAL_DETAIL_FORM)
                            }
                        }}
                        title="Update Renewal"
                        description="Manage owner, commercial stage, and quote follow-up for this recurring opportunity."
                        footer={
                            <div className="flex justify-end gap-2 w-full">
                                <Button variant="outline" onClick={() => setRenewalOpen(false)} disabled={renewalSaving}>
                                    Cancel
                                </Button>
                                <Button onClick={() => void saveRenewal()} disabled={renewalSaving || !canManage}>
                                    {renewalSaving ? "Saving..." : "Save Changes"}
                                </Button>
                            </div>
                        }
                    >
                        {selectedRenewal ? (
                            <div className="space-y-4">
                                <div className="rounded-xl border border-glass-border/60 bg-white/40 px-4 py-3">
                                    <div className="font-medium">{selectedRenewal.title}</div>
                                    <div className="text-xs text-muted-foreground mt-1">
                                        {selectedRenewal.siteName ?? "Site"} • {selectedRenewal.customerName ?? customer?.name ?? "Customer"} • Due {formatComplianceDate(selectedRenewal.dueDate)}
                                    </div>
                                </div>
                                <div className="grid gap-4 md:grid-cols-2">
                                    <div className="space-y-2">
                                        <Label required>Status</Label>
                                        <Select value={renewalForm.status} onValueChange={(value) => setRenewalForm((prev) => ({ ...prev, status: value }))}>
                                            <SelectTrigger className="bg-white/50">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="OPEN">Open</SelectItem>
                                                <SelectItem value="OVERDUE">Overdue</SelectItem>
                                                <SelectItem value="DUE_SOON">Due Soon</SelectItem>
                                                <SelectItem value="ON_HOLD">On Hold</SelectItem>
                                                <SelectItem value="QUOTED">Quoted</SelectItem>
                                                <SelectItem value="CHASED">Chased</SelectItem>
                                                <SelectItem value="WON">Won</SelectItem>
                                                <SelectItem value="LOST">Lost</SelectItem>
                                                <SelectItem value="COMPLETED">Completed</SelectItem>
                                                <SelectItem value="CLOSED">Closed</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div className="space-y-2">
                                        <Label optional>Owner</Label>
                                        <Select
                                            value={renewalForm.ownerUserId || "__unassigned__"}
                                            createOption={{ label: "employee", href: "/admin/team?create=employee" }}
                                            onValueChange={(value) => setRenewalForm((prev) => ({ ...prev, ownerUserId: value === "__unassigned__" ? "" : value }))}
                                        >
                                            <SelectTrigger className="bg-white/50">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="__unassigned__">Unassigned</SelectItem>
                                                {tenantUsers.map((user) => (
                                                    <SelectItem key={user.id} value={user.id}>
                                                        {user.fullName || user.email || "User"}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div className="space-y-2">
                                        <Label optional>Estimated Value</Label>
                                        <Input
                                            value={renewalForm.estimatedValue}
                                            onChange={(e) => setRenewalForm((prev) => ({ ...prev, estimatedValue: e.target.value }))}
                                            placeholder="e.g. 1250.00"
                                            inputMode="decimal"
                                            className="bg-white/50"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label optional>Last Quoted</Label>
                                        <Input
                                            type="date"
                                            value={renewalForm.lastQuotedAt}
                                            onChange={(e) => setRenewalForm((prev) => ({ ...prev, lastQuotedAt: e.target.value }))}
                                            className="bg-white/50"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label optional>Last Chased</Label>
                                        <Input
                                            type="date"
                                            value={renewalForm.lastChasedAt}
                                            onChange={(e) => setRenewalForm((prev) => ({ ...prev, lastChasedAt: e.target.value }))}
                                            className="bg-white/50"
                                        />
                                    </div>
                                    <div className="space-y-2 md:col-span-2">
                                        <Label optional>Notes</Label>
                                        <Textarea
                                            value={renewalForm.notes}
                                            onChange={(e) => setRenewalForm((prev) => ({ ...prev, notes: e.target.value }))}
                                            placeholder="Internal follow-up notes"
                                            className="bg-white/50 min-h-[120px]"
                                        />
                                    </div>
                                </div>
                            </div>
                        ) : null}
                    </GlassModal>

                    <GlassModal
                        open={Boolean(deleteContactId)}
                        onOpenChange={(open) => {
                            if (!open) {
                                setDeleteContactId(null)
                            }
                        }}
                        title="Delete Contact"
                        description="Are you sure you want to remove this contact?"
                        footer={
                            <div className="flex justify-end gap-2">
                                <Button variant="ghost" onClick={() => setDeleteContactId(null)}>
                                    Cancel
                                </Button>
                                <Button variant="destructive" onClick={deleteContact}>
                                    Delete
                                </Button>
                            </div>
                        }
                    />

                    <GlassModal
                        open={Boolean(deleteSiteGroupId)}
                        onOpenChange={(open) => {
                            if (!open) {
                                setDeleteSiteGroupId(null)
                            }
                        }}
                        title="Delete Site Group"
                        description="Are you sure you want to remove this site group? Groups with linked sites cannot be deleted."
                        footer={
                            <div className="flex justify-end gap-2">
                                <Button variant="ghost" onClick={() => setDeleteSiteGroupId(null)}>
                                    Cancel
                                </Button>
                                <Button variant="destructive" onClick={deleteSiteGroup}>
                                    Delete
                                </Button>
                            </div>
                        }
                    />

                    <GlassModal
                        open={Boolean(deleteSiteContactTarget)}
                        onOpenChange={(open) => {
                            if (!open) {
                                setDeleteSiteContactTarget(null)
                            }
                        }}
                        title="Delete Site Contact"
                        description="Are you sure you want to remove this site contact?"
                        footer={
                            <div className="flex justify-end gap-2">
                                <Button variant="ghost" onClick={() => setDeleteSiteContactTarget(null)}>
                                    Cancel
                                </Button>
                                <Button variant="destructive" onClick={deleteSiteContact}>
                                    Delete
                                </Button>
                            </div>
                        }
                    />

                    <GlassModal
                        open={Boolean(deleteComplianceRecordTarget)}
                        onOpenChange={(open) => {
                            if (!open) {
                                setDeleteComplianceRecordTarget(null)
                            }
                        }}
                        title="Delete Compliance Record"
                        description="Are you sure you want to remove this compliance record?"
                        footer={
                            <div className="flex justify-end gap-2">
                                <Button variant="ghost" onClick={() => setDeleteComplianceRecordTarget(null)}>
                                    Cancel
                                </Button>
                                <Button variant="destructive" onClick={deleteComplianceRecord}>
                                    Delete
                                </Button>
                            </div>
                        }
                    />

                    <GlassModal
                        open={Boolean(deleteSiteId)}
                        onOpenChange={(open) => {
                            if (!open) {
                                setDeleteSiteId(null)
                            }
                        }}
                        title="Delete Site"
                        description="Are you sure you want to remove this site?"
                        footer={
                            <div className="flex justify-end gap-2">
                                <Button variant="ghost" onClick={() => setDeleteSiteId(null)}>
                                    Cancel
                                </Button>
                                <Button variant="destructive" onClick={deleteSite}>
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

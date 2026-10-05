"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import type { ReactNode } from "react"
import Link from "next/link"
import { useParams } from "next/navigation"
import {
    Activity,
    AlertTriangle,
    BriefcaseBusiness,
    Building2,
    CalendarDays,
    CheckCircle2,
    ChevronRight,
    CircleDollarSign,
    ClipboardList,
    FileText,
    FolderOpen,
    Mail,
    MapPin,
    Phone,
    Plus,
    Quote,
    SquarePen,
    Trash2,
    UserRound,
    UsersRound,
} from "lucide-react"
import { PageContainer } from "@/components/layout/PageContainer"
import { GlassCard, GlassCardContent, GlassCardHeader, GlassCardTitle, GlassCardDescription } from "@/components/glass/GlassCard"
import { GlassModal } from "@/components/glass/GlassModal"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { CountrySelect, PhoneInput, getDefaultCountry } from "@/components/shared/LocalizedFields"
import { StatusBadge } from "@/components/shared/StatusBadge"
import { RecordNumberBadge } from "@/components/shared/RecordNumberBadge"
import { BrowserBackButton } from "@/components/shared/BrowserBackButton"
import { ErrorToast } from "@/components/shared/ErrorToast"
import { useUrlSyncedTab } from "@/components/shared/useUrlSyncedTab"
import { useToast } from "@/components/ui/toast"
import { apiDelete, apiGet, apiPost, apiPut } from "@/lib/api"
import { getModulePermissions } from "@/lib/permission-ui"
import { useTenantFeatures } from "@/components/layout/TenantFeaturesContext"
import { formatInvoiceStatus, formatJobStatus, formatQuoteStatus } from "@/lib/status"

type CustomerProfile = {
    id: string
    name?: string | null
    email?: string | null
    phone?: string | null
    address?: string | null
}

type CustomerSiteGroup = {
    id: string
    name: string
    description?: string | null
}

type CustomerSite = {
    id: string
    customerId?: string | null
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
    createdAt?: string | null
    updatedAt?: string | null
}

type CustomerSiteContact = {
    id: string
    siteId: string
    name: string
    email?: string | null
    phone?: string | null
    role?: string | null
    notes?: string | null
    createdAt?: string | null
}

type ComplianceRecord = {
    id: string
    siteId: string
    jobId?: string | null
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
    reviewerName?: string | null
    reviewNote?: string | null
    jobTitle?: string | null
    jobStatus?: string | null
    documentName?: string | null
    documentFileUrl?: string | null
    customerVisible?: boolean | null
    notes?: string | null
    createdAt?: string | null
}

type CustomerJob = {
    id: string
    jobNumber?: string | null
    title?: string | null
    siteId?: string | null
    status?: string | null
    workflowStageKey?: string | null
    workflowStatusLabel?: string | null
    scheduledAt?: string | null
    scheduledEndAt?: string | null
    amount?: number | null
    location?: string | null
    createdAt?: string | null
}

type CustomerInvoice = {
    id: string
    invoiceNumber?: string | null
    title?: string | null
    siteId?: string | null
    status?: string | null
    workflowStageKey?: string | null
    workflowStatusLabel?: string | null
    total?: number | null
    createdAt?: string | null
    dueDate?: string | null
}

type CustomerRenewal = {
    id: string
    siteId: string
    title: string
    status?: string | null
    dueDate?: string | null
    estimatedValue?: number | null
    createdAt?: string | null
}

type CustomerDetailsResponse = {
    customer: CustomerProfile
    siteGroups: CustomerSiteGroup[]
    sites: CustomerSite[]
    siteContacts: CustomerSiteContact[]
    complianceRecords: ComplianceRecord[]
    jobs: CustomerJob[]
    invoices: CustomerInvoice[]
    renewals: CustomerRenewal[]
}

type QuoteRecord = {
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

type DeleteTarget =
    | { type: "job"; id: string; label: string }
    | { type: "quote"; id: string; label: string; locked?: boolean }
    | { type: "contact"; id: string; label: string }
    | { type: "compliance"; id: string; label: string }

const DEFAULT_JOB_FORM = {
    title: "",
    priority: "Medium",
    scheduledAt: "",
    scheduledEndAt: "",
    description: "",
}

const DEFAULT_QUOTE_FORM = {
    title: "",
    validUntil: "",
    lineDescription: "",
    quantity: "1",
    unitPrice: "",
    vatRate: "20",
    notes: "",
}

const DEFAULT_CONTACT_FORM = {
    name: "",
    email: "",
    phone: "",
    role: "",
    notes: "",
}

const DEFAULT_COMPLIANCE_FORM = {
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

const DEFAULT_SITE_FORM = {
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

const SITE_DETAIL_TABS = ["overview", "jobs", "quotes", "contacts", "documents", "activity"] as const
type SiteDetailTab = (typeof SITE_DETAIL_TABS)[number]

const formatDate = (value?: string | null, includeTime = false) => {
    if (!value) return "—"
    const parsed = new Date(value)
    if (Number.isNaN(parsed.getTime())) return "—"
    return parsed.toLocaleDateString(undefined, {
        day: "2-digit",
        month: "short",
        year: "numeric",
        ...(includeTime ? { hour: "2-digit", minute: "2-digit" } : {}),
    })
}

const formatCurrency = (value?: number | null) =>
    new Intl.NumberFormat(undefined, { style: "currency", currency: "GBP" }).format(Number(value ?? 0))

const normalizeStatus = (value?: string | null) =>
    String(value ?? "Pending")
        .replace(/_/g, " ")
        .toLowerCase()
        .replace(/\b\w/g, (char) => char.toUpperCase())

const parseTagInput = (value: string) =>
    value
        .split(",")
        .map((entry) => entry.trim())
        .filter(Boolean)

const formatAddress = (site?: CustomerSite | null) =>
    [
        site?.addressLine1,
        site?.addressLine2,
        site?.city,
        site?.state,
        site?.postalCode,
        site?.country,
    ]
        .map((part) => String(part ?? "").trim())
        .filter(Boolean)
        .join(", ")

const getJobDisplayStatus = (job: CustomerJob) =>
    job.workflowStatusLabel ?? formatJobStatus(job.status)

const getQuoteDisplayStatus = (quote: QuoteRecord) =>
    quote.workflowStatusLabel ?? formatQuoteStatus(quote.status)

const getInvoiceDisplayStatus = (invoice: CustomerInvoice) =>
    invoice.workflowStatusLabel ?? formatInvoiceStatus(invoice.status)

const isOpenJob = (job: CustomerJob) => {
    const status = getJobDisplayStatus(job).toLowerCase()
    return !["completed", "closed", "finished", "cancelled"].includes(status)
}

const getQuoteTotal = (quote: QuoteRecord) => Number(quote.total ?? 0)

function StatTile({
    icon: Icon,
    label,
    value,
    tone,
    href,
}: {
    icon: typeof BriefcaseBusiness
    label: string
    value: number | string
    tone: string
    href?: string
}) {
    const content = (
        <div className="group rounded-3xl border border-glass-border/70 bg-white/50 p-4 shadow-sm shadow-slate-200/40 transition-all hover:-translate-y-0.5 hover:bg-white/70">
            <div className="flex items-start justify-between gap-3">
                <div className={`rounded-2xl p-3 ${tone}`}>
                    <Icon className="h-5 w-5" />
                </div>
                {href ? <ChevronRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" /> : null}
            </div>
            <div className="mt-4 text-2xl font-semibold text-foreground">{value}</div>
            <div className="text-sm text-muted-foreground">{label}</div>
        </div>
    )

    return href ? <Link href={href}>{content}</Link> : content
}

function EmptyState({ title, description, action }: { title: string; description: string; action?: ReactNode }) {
    return (
        <div className="rounded-3xl border border-dashed border-glass-border/70 bg-white/40 p-8 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <FolderOpen className="h-5 w-5" />
            </div>
            <h3 className="mt-4 font-semibold text-foreground">{title}</h3>
            <p className="mt-1 text-sm text-muted-foreground">{description}</p>
            {action ? <div className="mt-5 flex justify-center">{action}</div> : null}
        </div>
    )
}

function DetailTile({ label, value }: { label: string; value: ReactNode }) {
    return (
        <div className="rounded-2xl border border-glass-border/60 bg-white/55 p-3">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</div>
            <div className="mt-1 text-sm font-semibold text-foreground">{value || "—"}</div>
        </div>
    )
}

export default function SiteDetailsPage() {
    const params = useParams<{ id: string; siteId: string }>()
    const { toast } = useToast()
    const customerId = String(params?.id ?? "")
    const siteId = String(params?.siteId ?? "")
    const { canView, canManage } = getModulePermissions("crm.view", "crm.manage")
    const { sites: sitesEnabled, complianceReports } = useTenantFeatures()
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [payload, setPayload] = useState<CustomerDetailsResponse | null>(null)
    const [quotes, setQuotes] = useState<QuoteRecord[]>([])
    const [jobOpen, setJobOpen] = useState(false)
    const [quoteOpen, setQuoteOpen] = useState(false)
    const [siteEditOpen, setSiteEditOpen] = useState(false)
    const [contactOpen, setContactOpen] = useState(false)
    const [complianceOpen, setComplianceOpen] = useState(false)
    const [savingJob, setSavingJob] = useState(false)
    const [savingQuote, setSavingQuote] = useState(false)
    const [savingSite, setSavingSite] = useState(false)
    const [savingContact, setSavingContact] = useState(false)
    const [savingCompliance, setSavingCompliance] = useState(false)
    const [deleting, setDeleting] = useState(false)
    const [editingContactId, setEditingContactId] = useState<string | null>(null)
    const [editingComplianceId, setEditingComplianceId] = useState<string | null>(null)
    const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null)
    const [jobForm, setJobForm] = useState(DEFAULT_JOB_FORM)
    const [quoteForm, setQuoteForm] = useState(DEFAULT_QUOTE_FORM)
    const [siteForm, setSiteForm] = useState(DEFAULT_SITE_FORM)
    const [contactForm, setContactForm] = useState(DEFAULT_CONTACT_FORM)
    const [complianceForm, setComplianceForm] = useState(DEFAULT_COMPLIANCE_FORM)
    const [activeTab, setActiveTab] = useUrlSyncedTab<SiteDetailTab>({
        defaultTab: "overview",
        allowedTabs: SITE_DETAIL_TABS,
    })

    const load = useCallback(async () => {
        if (!customerId || !siteId || !canView) return
        setLoading(true)
        try {
            const [detailsRes, quotesRes] = await Promise.all([
                apiGet<CustomerDetailsResponse>(`/customers/${customerId}/details`),
                apiGet<QuoteRecord[]>("/quotes").catch(() => ({ data: [] as QuoteRecord[] })),
            ])
            setPayload(detailsRes.data ?? null)
            setQuotes(Array.isArray(quotesRes.data) ? quotesRes.data : [])
            setError(null)
        } catch (err: any) {
            setError(err?.message ?? "Failed to load site details")
        } finally {
            setLoading(false)
        }
    }, [canView, customerId, siteId])

    useEffect(() => {
        void load()
    }, [load])

    const customer = payload?.customer
    const site = useMemo(() => payload?.sites.find((item) => item.id === siteId) ?? null, [payload, siteId])
    const siteGroup = useMemo(
        () => payload?.siteGroups.find((group) => group.id === site?.siteGroupId) ?? null,
        [payload, site?.siteGroupId],
    )
    const siteContacts = useMemo(() => (payload?.siteContacts ?? []).filter((contact) => contact.siteId === siteId), [payload, siteId])
    const siteJobs = useMemo(() => (payload?.jobs ?? []).filter((job) => job.siteId === siteId), [payload, siteId])
    const siteInvoices = useMemo(() => (payload?.invoices ?? []).filter((invoice) => invoice.siteId === siteId), [payload, siteId])
    const siteComplianceRecords = useMemo(
        () => (payload?.complianceRecords ?? []).filter((record) => record.siteId === siteId),
        [payload, siteId],
    )
    const siteRenewals = useMemo(() => (payload?.renewals ?? []).filter((renewal) => renewal.siteId === siteId), [payload, siteId])
    const siteQuotes = useMemo(
        () => quotes.filter((quote) => quote.siteId === siteId || (quote.customerId === customerId && quote.siteName && quote.siteName === site?.name)),
        [customerId, quotes, site?.name, siteId],
    )
    const primaryContact = useMemo(
        () => siteContacts.find((contact) => contact.id === site?.mainContactId) ?? siteContacts[0] ?? null,
        [site?.mainContactId, siteContacts],
    )
    const recentJobs = siteJobs.slice(0, 5)
    const recentQuotes = siteQuotes.slice(0, 5)
    const openJobs = siteJobs.filter(isOpenJob)
    const overdueJobs = siteJobs.filter((job) => {
        const scheduled = job.scheduledAt ? new Date(job.scheduledAt) : null
        return Boolean(scheduled && scheduled < new Date() && isOpenJob(job))
    })
    const acceptedQuotes = siteQuotes.filter((quote) => getQuoteDisplayStatus(quote).toLowerCase() === "accepted")
    const relatedDocuments = siteComplianceRecords
    const activityItems = useMemo(() => {
        const items = [
            ...siteJobs.map((job) => ({
                id: `job-${job.id}`,
                label: `${job.jobNumber ?? job.title ?? "Job"} is ${getJobDisplayStatus(job)}`,
                meta: formatDate(job.createdAt ?? job.scheduledAt, true),
                tone: "bg-primary",
            })),
            ...siteQuotes.map((quote) => ({
                id: `quote-${quote.id}`,
                label: `${quote.quoteNumber ?? quote.title ?? "Quote"} is ${getQuoteDisplayStatus(quote)}`,
                meta: formatDate(quote.createdAt, true),
                tone: "bg-success",
            })),
            ...siteComplianceRecords.map((record) => ({
                id: `record-${record.id}`,
                label: `${record.title} recorded for ${record.reportType}`,
                meta: formatDate(record.createdAt ?? record.testedAt, true),
                tone: "bg-warning",
            })),
            ...siteInvoices.map((invoice) => ({
                id: `invoice-${invoice.id}`,
                label: `${invoice.invoiceNumber ?? invoice.title ?? "Invoice"} is ${getInvoiceDisplayStatus(invoice)}`,
                meta: formatDate(invoice.createdAt, true),
                tone: "bg-sky-500",
            })),
        ]
        return items
            .sort((a, b) => new Date(b.meta).getTime() - new Date(a.meta).getTime())
            .slice(0, 8)
    }, [siteComplianceRecords, siteInvoices, siteJobs, siteQuotes])

    const siteAddress = formatAddress(site)
    const contextSummary = `${customer?.name ?? "Customer"} • ${site?.name ?? "Site"}`

    const openEditSite = () => {
        if (!site) return
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
        setSiteEditOpen(true)
    }

    const openEditContact = (contact: CustomerSiteContact) => {
        setEditingContactId(contact.id)
        setContactForm({
            name: contact.name ?? "",
            email: contact.email ?? "",
            phone: contact.phone ?? "",
            role: contact.role ?? "",
            notes: contact.notes ?? "",
        })
        setContactOpen(true)
    }

    const openEditComplianceRecord = (record: ComplianceRecord) => {
        setEditingComplianceId(record.id)
        setComplianceForm({
            title: record.title ?? "",
            reportType: record.reportType ?? "",
            reference: record.reference ?? "",
            outcome: record.outcome ?? "",
            testedAt: record.testedAt ? new Date(record.testedAt).toISOString().slice(0, 10) : "",
            validFrom: record.validFrom ? new Date(record.validFrom).toISOString().slice(0, 10) : "",
            validUntil: record.validUntil ? new Date(record.validUntil).toISOString().slice(0, 10) : "",
            expectedRenewalValue: record.expectedRenewalValue != null ? String(record.expectedRenewalValue) : "",
            notes: record.notes ?? "",
        })
        setComplianceOpen(true)
    }

    const createJob = async () => {
        if (!site || !customer) return
        if (!jobForm.title.trim()) {
            setError("Job title is required.")
            return
        }
        if (!jobForm.scheduledAt || !jobForm.scheduledEndAt) {
            setError("Job start and end time are required.")
            return
        }
        if (new Date(jobForm.scheduledEndAt) <= new Date(jobForm.scheduledAt)) {
            setError("Job end time must be after start time.")
            return
        }
        try {
            setSavingJob(true)
            await apiPost("/jobs", {
                title: jobForm.title.trim(),
                customerId,
                siteId,
                location: siteAddress || undefined,
                addressLine1: site.addressLine1 || undefined,
                addressLine2: site.addressLine2 || undefined,
                city: site.city || undefined,
                state: site.state || undefined,
                postalCode: site.postalCode || undefined,
                country: site.country || undefined,
                addressManuallyEdited: false,
                description: jobForm.description.trim() || undefined,
                priority: jobForm.priority,
                scheduledAt: new Date(jobForm.scheduledAt).toISOString(),
                scheduledEndAt: new Date(jobForm.scheduledEndAt).toISOString(),
            })
            setJobOpen(false)
            setJobForm(DEFAULT_JOB_FORM)
            setActiveTab("jobs")
            toast({ title: "Job created", description: "The job was created for this customer site.", variant: "success" })
            await load()
        } catch (err: any) {
            setError(err?.message ?? "Failed to create job")
        } finally {
            setSavingJob(false)
        }
    }

    const saveSite = async () => {
        if (!site || !customer) return
        if (!siteForm.name.trim()) {
            setError("Site name is required.")
            return
        }
        try {
            setSavingSite(true)
            await apiPut(`/customers/${customerId}/sites/${siteId}`, {
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
            })
            setSiteEditOpen(false)
            setSiteForm(DEFAULT_SITE_FORM)
            toast({ title: "Site updated", description: "Site changes saved successfully.", variant: "success" })
            await load()
        } catch (err: any) {
            setError(err?.message ?? "Failed to update site")
        } finally {
            setSavingSite(false)
        }
    }

    const createQuote = async () => {
        if (!site || !customer) return
        if (!quoteForm.title.trim()) {
            setError("Quote title is required.")
            return
        }
        if (!quoteForm.lineDescription.trim()) {
            setError("At least one quote line description is required.")
            return
        }
        const quantity = Number(quoteForm.quantity || 0)
        const unitPrice = Number(quoteForm.unitPrice || 0)
        const vatRate = Number(quoteForm.vatRate || 0)
        if (!Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(unitPrice) || unitPrice < 0) {
            setError("Quote quantity and unit price must be valid numbers.")
            return
        }
        const total = quantity * unitPrice * (1 + vatRate / 100)
        try {
            setSavingQuote(true)
            await apiPost("/quotes", {
                title: quoteForm.title.trim(),
                customerId,
                siteId,
                lineItems: [{
                    description: quoteForm.lineDescription.trim(),
                    quantity,
                    unitPrice,
                    vatRate,
                }],
                total,
                validUntil: quoteForm.validUntil ? new Date(quoteForm.validUntil).toISOString() : undefined,
                notes: quoteForm.notes.trim() || undefined,
            })
            setQuoteOpen(false)
            setQuoteForm(DEFAULT_QUOTE_FORM)
            setActiveTab("quotes")
            toast({ title: "Quote created", description: "The quote was created for this customer site.", variant: "success" })
            await load()
        } catch (err: any) {
            setError(err?.message ?? "Failed to create quote")
        } finally {
            setSavingQuote(false)
        }
    }

    const createContact = async () => {
        if (!site || !customer) return
        if (!contactForm.name.trim()) {
            setError("Contact name is required.")
            return
        }
        try {
            setSavingContact(true)
            const body = {
                name: contactForm.name.trim(),
                email: contactForm.email.trim(),
                phone: contactForm.phone.trim(),
                role: contactForm.role.trim(),
                notes: contactForm.notes.trim(),
            }
            if (editingContactId) {
                await apiPut(`/customers/${customerId}/sites/${siteId}/contacts/${editingContactId}`, body)
            } else {
                await apiPost(`/customers/${customerId}/sites/${siteId}/contacts`, body)
            }
            setContactOpen(false)
            setEditingContactId(null)
            setContactForm(DEFAULT_CONTACT_FORM)
            setActiveTab("contacts")
            toast({
                title: editingContactId ? "Contact updated" : "Contact added",
                description: editingContactId ? "The site contact was updated." : "The site contact was added.",
                variant: "success"
            })
            await load()
        } catch (err: any) {
            setError(err?.message ?? "Failed to save site contact")
        } finally {
            setSavingContact(false)
        }
    }

    const createComplianceRecord = async () => {
        if (!site || !customer) return
        if (!complianceForm.title.trim() || !complianceForm.reportType.trim()) {
            setError("Compliance title and report type are required.")
            return
        }
        try {
            setSavingCompliance(true)
            const body = {
                title: complianceForm.title.trim(),
                reportType: complianceForm.reportType.trim(),
                reference: complianceForm.reference.trim(),
                outcome: complianceForm.outcome.trim(),
                reviewStatus: "PENDING_REVIEW",
                testedAt: complianceForm.testedAt || undefined,
                validFrom: complianceForm.validFrom || undefined,
                validUntil: complianceForm.validUntil || undefined,
                expectedRenewalValue: complianceForm.expectedRenewalValue || undefined,
                customerVisible: true,
                notes: complianceForm.notes.trim(),
            }
            if (editingComplianceId) {
                await apiPut(`/customers/${customerId}/sites/${siteId}/compliance-records/${editingComplianceId}`, body)
            } else {
                await apiPost(`/customers/${customerId}/sites/${siteId}/compliance-records`, body)
            }
            setComplianceOpen(false)
            setEditingComplianceId(null)
            setComplianceForm(DEFAULT_COMPLIANCE_FORM)
            setActiveTab("documents")
            toast({
                title: editingComplianceId ? "Compliance record updated" : "Compliance record added",
                description: editingComplianceId ? "The site compliance record was updated." : "The site compliance record was created.",
                variant: "success"
            })
            await load()
        } catch (err: any) {
            setError(err?.message ?? "Failed to save compliance record")
        } finally {
            setSavingCompliance(false)
        }
    }

    const confirmDelete = async () => {
        if (!deleteTarget) return
        if (deleteTarget.type === "quote" && deleteTarget.locked) {
            setError("Accepted quotes cannot be deleted.")
            return
        }
        try {
            setDeleting(true)
            if (deleteTarget.type === "job") {
                await apiDelete(`/jobs/${deleteTarget.id}`, { confirmed: true })
                setActiveTab("jobs")
            }
            if (deleteTarget.type === "quote") {
                await apiDelete(`/quotes/${deleteTarget.id}`, { confirmed: true })
                setActiveTab("quotes")
            }
            if (deleteTarget.type === "contact") {
                await apiDelete(`/customers/${customerId}/sites/${siteId}/contacts/${deleteTarget.id}`, { confirmed: true })
                setActiveTab("contacts")
            }
            if (deleteTarget.type === "compliance") {
                await apiDelete(`/customers/${customerId}/sites/${siteId}/compliance-records/${deleteTarget.id}`, { confirmed: true })
                setActiveTab("documents")
            }
            toast({ title: "Deleted", description: `${deleteTarget.label} was deleted.`, variant: "success" })
            setDeleteTarget(null)
            await load()
        } catch (err: any) {
            setError(err?.message ?? "Failed to delete record")
        } finally {
            setDeleting(false)
        }
    }

    if (!sitesEnabled) {
        return (
            <PageContainer>
                <GlassCard>
                    <GlassCardHeader>
                        <GlassCardTitle>Sites module is disabled</GlassCardTitle>
                        <GlassCardDescription>Enable the Sites module to view site detail pages.</GlassCardDescription>
                    </GlassCardHeader>
                </GlassCard>
            </PageContainer>
        )
    }

    return (
        <PageContainer>
            <div className="space-y-6">
                <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                    <BrowserBackButton className="text-sm font-medium text-muted-foreground hover:text-foreground">
                        Back
                    </BrowserBackButton>
                    <ChevronRight className="h-4 w-4" />
                    <Link href="/admin/customers" className="hover:text-foreground">Customers</Link>
                    <ChevronRight className="h-4 w-4" />
                    <Link href={`/admin/customers/${customerId}`} className="hover:text-foreground">{customer?.name ?? "Customer"}</Link>
                    <ChevronRight className="h-4 w-4" />
                    <span className="font-medium text-foreground">{site?.name ?? "Site"}</span>
                </div>

                {loading ? (
                    <GlassCard>
                        <GlassCardContent className="p-8 text-sm text-muted-foreground">Loading site details...</GlassCardContent>
                    </GlassCard>
                ) : !site ? (
                    <GlassCard>
                        <GlassCardHeader>
                            <GlassCardTitle>Site not found</GlassCardTitle>
                            <GlassCardDescription>This site may have been deleted or moved to another customer.</GlassCardDescription>
                        </GlassCardHeader>
                    </GlassCard>
                ) : (
                    <>
                        <div className="rounded-[32px] border border-glass-border/70 bg-gradient-to-br from-white/80 via-white/55 to-primary/10 p-6 shadow-xl shadow-slate-200/40">
                            <div className="flex flex-col gap-6 xl:flex-row xl:items-center xl:justify-between">
                                <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
                                    <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-3xl border border-primary/15 bg-primary/10 text-primary shadow-sm">
                                        <Building2 className="h-10 w-10" />
                                    </div>
                                    <div className="min-w-0">
                                        <div className="flex flex-wrap items-center gap-3">
                                            <h1 className="text-3xl font-semibold tracking-tight text-foreground">{site.name}</h1>
                                            <StatusBadge status={normalizeStatus(site.status)}>{normalizeStatus(site.status)}</StatusBadge>
                                        </div>
                                        <div className="mt-3 flex max-w-3xl items-start gap-2 text-sm leading-6 text-muted-foreground">
                                            <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                                            <span>{siteAddress || "No address saved for this site."}</span>
                                        </div>
                                        <div className="mt-4 flex flex-wrap gap-6 text-sm">
                                            <div>
                                                <div className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Site Code</div>
                                                <RecordNumberBadge value={site.reference} fallback="No reference" className="mt-1" />
                                            </div>
                                            <div>
                                                <div className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Site Group</div>
                                                <div className="mt-1 font-semibold text-primary">{siteGroup?.name ?? "Ungrouped"}</div>
                                            </div>
                                            <div>
                                                <div className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Customer</div>
                                                <Link href={`/admin/customers/${customerId}`} className="mt-1 block font-semibold text-primary hover:underline">
                                                    {customer?.name ?? "Customer"}
                                                </Link>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                                <div className="flex flex-wrap gap-2">
                                    <Button variant="outline" className="bg-white/70" onClick={openEditSite} disabled={!canManage}>
                                        Edit Site
                                    </Button>
                                    <Button className="gap-2" disabled={!canManage} onClick={() => setJobOpen(true)}>
                                        <Plus className="h-4 w-4" />
                                        New Job
                                    </Button>
                                    <Button variant="outline" className="gap-2 bg-white/70" disabled={!canManage} onClick={() => setQuoteOpen(true)}>
                                        <Plus className="h-4 w-4" />
                                        New Quote
                                    </Button>
                                </div>
                            </div>
                        </div>

                        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
                            <StatTile icon={BriefcaseBusiness} label="Jobs" value={siteJobs.length} tone="bg-primary/10 text-primary" href={`/admin/schedule?customerId=${customerId}&siteId=${siteId}`} />
                            <StatTile icon={Quote} label="Quotes" value={siteQuotes.length} tone="bg-pink-100 text-pink-700" href="/admin/quotes" />
                            <StatTile icon={UsersRound} label="Contacts" value={siteContacts.length} tone="bg-violet-100 text-violet-700" />
                            <StatTile icon={ClipboardList} label="Open Jobs" value={openJobs.length} tone="bg-sky-100 text-sky-700" />
                            <StatTile icon={AlertTriangle} label="Overdue Jobs" value={overdueJobs.length} tone="bg-orange-100 text-orange-700" />
                            <StatTile icon={CircleDollarSign} label="Invoices" value={siteInvoices.length} tone="bg-emerald-100 text-emerald-700" href="/admin/finance" />
                        </div>

                        <div className="grid gap-6 xl:grid-cols-[320px_minmax(0,1fr)_340px]">
                            <div className="space-y-6">
                                <GlassCard>
                                    <GlassCardHeader className="pb-4">
                                        <GlassCardTitle className="text-lg">Site Details</GlassCardTitle>
                                    </GlassCardHeader>
                                    <GlassCardContent className="space-y-3 text-sm">
                                        {[
                                            ["Client", customer?.name ?? "—"],
                                            ["Site Code", site.reference ?? "—"],
                                            ["Site Group", siteGroup?.name ?? "Ungrouped"],
                                            ["Status", normalizeStatus(site.status)],
                                            ["Type", site.category ?? "—"],
                                            ["Created On", formatDate(site.createdAt)],
                                            ["Last Updated", formatDate(site.updatedAt)],
                                        ].map(([label, value]) => (
                                            <div key={label} className="flex items-center justify-between gap-4">
                                                <span className="text-muted-foreground">{label}</span>
                                                <span className="text-right font-medium text-foreground">{value}</span>
                                            </div>
                                        ))}
                                        <Button variant="outline" className="mt-3 w-full bg-white/70" onClick={openEditSite} disabled={!canManage}>
                                            Manage Site
                                        </Button>
                                    </GlassCardContent>
                                </GlassCard>

                                <GlassCard>
                                    <GlassCardHeader className="pb-4">
                                        <div className="flex items-center justify-between">
                                            <GlassCardTitle className="text-lg">Key Contacts</GlassCardTitle>
                                            <Link href="#contacts" className="text-xs font-semibold text-primary">View all</Link>
                                        </div>
                                    </GlassCardHeader>
                                    <GlassCardContent className="space-y-4">
                                        {siteContacts.length === 0 ? (
                                            <p className="text-sm text-muted-foreground">No site contacts added yet.</p>
                                        ) : (
                                            siteContacts.slice(0, 3).map((contact) => (
                                                <div key={contact.id} className="flex gap-3 border-b border-glass-border/50 pb-4 last:border-0 last:pb-0">
                                                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
                                                        {contact.name.slice(0, 2).toUpperCase()}
                                                    </div>
                                                    <div className="min-w-0 flex-1">
                                                        <div className="flex flex-wrap items-center gap-2">
                                                            <div className="font-semibold text-foreground">{contact.name}</div>
                                                            {contact.id === site.mainContactId ? <StatusBadge status="Active">Primary</StatusBadge> : null}
                                                        </div>
                                                        <div className="text-xs text-muted-foreground">{contact.role || "Site contact"}</div>
                                                        {contact.email ? <div className="truncate text-xs text-muted-foreground">{contact.email}</div> : null}
                                                        {contact.phone ? <div className="text-xs text-muted-foreground">{contact.phone}</div> : null}
                                                    </div>
                                                </div>
                                            ))
                                        )}
                                    </GlassCardContent>
                                </GlassCard>
                            </div>

                            <GlassCard>
                                <GlassCardContent className="p-4">
                                    <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
                                        <TabsList className="grid w-full grid-cols-3 lg:grid-cols-6">
                                            <TabsTrigger value="overview">Overview</TabsTrigger>
                                            <TabsTrigger value="jobs">Jobs ({siteJobs.length})</TabsTrigger>
                                            <TabsTrigger value="quotes">Quotes ({siteQuotes.length})</TabsTrigger>
                                            <TabsTrigger value="contacts">Contacts ({siteContacts.length})</TabsTrigger>
                                            <TabsTrigger value="documents">Compliance ({siteComplianceRecords.length})</TabsTrigger>
                                            <TabsTrigger value="activity">Activity</TabsTrigger>
                                        </TabsList>

                                        <TabsContent value="overview" className="space-y-4">
                                            <div className="rounded-3xl border border-glass-border/70 bg-white/45 p-5">
                                                <div className="text-sm font-semibold text-foreground">Site Group</div>
                                                <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                                                    <div className="flex items-center gap-3">
                                                        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                                                            <FolderOpen className="h-6 w-6" />
                                                        </div>
                                                        <div>
                                                            <div className="font-semibold text-foreground">{siteGroup?.name ?? "Ungrouped"}</div>
                                                            <div className="text-sm text-muted-foreground">
                                                                {siteGroup?.description || "No group description saved."}
                                                            </div>
                                                        </div>
                                                    </div>
                                                    <Button variant="outline" className="bg-white/70" asChild>
                                                        <Link href={`/admin/customers/${customerId}?tab=sites`}>View Group</Link>
                                                    </Button>
                                                </div>
                                            </div>

                                            <div className="grid gap-4 lg:grid-cols-2">
                                                <GlassCard className="bg-white/35">
                                                    <GlassCardHeader className="pb-3">
                                                        <div className="flex items-center justify-between">
                                                            <GlassCardTitle className="text-base">Recent Jobs</GlassCardTitle>
                                                            <Link href="/admin/schedule" className="text-xs font-semibold text-primary">View all</Link>
                                                        </div>
                                                    </GlassCardHeader>
                                                    <GlassCardContent className="space-y-3">
                                                        {recentJobs.length === 0 ? (
                                                            <EmptyState
                                                                title="No jobs yet"
                                                                description="Jobs linked to this site will appear here."
                                                                action={
                                                                    <Button size="sm" className="gap-2" disabled={!canManage} onClick={() => setJobOpen(true)}>
                                                                        <Plus className="h-4 w-4" />Create Job
                                                                    </Button>
                                                                }
                                                            />
                                                        ) : (
                                                            recentJobs.map((job) => (
                                                                <Link key={job.id} href={`/admin/schedule/${job.id}`} className="block rounded-2xl border border-glass-border/60 bg-white/55 p-4 transition hover:bg-white/80">
                                                                    <div className="flex items-start justify-between gap-3">
                                                                        <div>
                                                                            <RecordNumberBadge value={job.jobNumber} fallback={job.title ?? "Job"} />
                                                                            <div className="mt-2 font-semibold text-foreground">{job.title ?? "Untitled job"}</div>
                                                                            <div className="text-xs text-muted-foreground">{formatDate(job.scheduledAt, true)}</div>
                                                                        </div>
                                                                        <StatusBadge status={getJobDisplayStatus(job)}>{getJobDisplayStatus(job)}</StatusBadge>
                                                                    </div>
                                                                </Link>
                                                            ))
                                                        )}
                                                    </GlassCardContent>
                                                </GlassCard>

                                                <GlassCard className="bg-white/35">
                                                    <GlassCardHeader className="pb-3">
                                                        <div className="flex items-center justify-between">
                                                            <GlassCardTitle className="text-base">Recent Quotes</GlassCardTitle>
                                                            <Link href="/admin/quotes" className="text-xs font-semibold text-primary">View all</Link>
                                                        </div>
                                                    </GlassCardHeader>
                                                    <GlassCardContent className="space-y-3">
                                                        {recentQuotes.length === 0 ? (
                                                            <EmptyState
                                                                title="No quotes yet"
                                                                description="Quotes created for this site will appear here."
                                                                action={
                                                                    <Button size="sm" className="gap-2" disabled={!canManage} onClick={() => setQuoteOpen(true)}>
                                                                        <Plus className="h-4 w-4" />Create Quote
                                                                    </Button>
                                                                }
                                                            />
                                                        ) : (
                                                            recentQuotes.map((quote) => (
                                                                <Link key={quote.id} href={`/admin/quotes/${quote.id}`} className="block rounded-2xl border border-glass-border/60 bg-white/55 p-4 transition hover:bg-white/80">
                                                                    <div className="flex items-start justify-between gap-3">
                                                                        <div>
                                                                            <RecordNumberBadge value={quote.quoteNumber} fallback="Quote" />
                                                                            <div className="mt-2 font-semibold text-foreground">{quote.title ?? "Quote"}</div>
                                                                            <div className="text-xs text-muted-foreground">{formatCurrency(getQuoteTotal(quote))}</div>
                                                                        </div>
                                                                        <StatusBadge status={getQuoteDisplayStatus(quote)}>{getQuoteDisplayStatus(quote)}</StatusBadge>
                                                                    </div>
                                                                </Link>
                                                            ))
                                                        )}
                                                    </GlassCardContent>
                                                </GlassCard>
                                            </div>
                                        </TabsContent>

                                        <TabsContent value="jobs">
                                            <div className="mb-4 flex justify-end">
                                                <Button size="sm" className="gap-2" disabled={!canManage} onClick={() => setJobOpen(true)}>
                                                    <Plus className="h-4 w-4" />Create Job
                                                </Button>
                                            </div>
                                            <div className="space-y-3">
                                                {siteJobs.length === 0 ? (
                                                    <EmptyState
                                                        title="No jobs linked"
                                                        description="Create a job against this site to start tracking work."
                                                        action={
                                                            <Button className="gap-2" disabled={!canManage} onClick={() => setJobOpen(true)}>
                                                                <Plus className="h-4 w-4" />Create Job
                                                            </Button>
                                                        }
                                                    />
                                                ) : siteJobs.map((job) => (
                                                    <div key={job.id} className="flex flex-col gap-3 rounded-2xl border border-glass-border/60 bg-white/50 p-4 transition hover:bg-white/75 md:flex-row md:items-center md:justify-between">
                                                        <div>
                                                            <RecordNumberBadge value={job.jobNumber} fallback={job.title ?? "Job"} />
                                                            <div className="mt-2 font-semibold text-foreground">{job.title ?? "Untitled job"}</div>
                                                            <div className="text-sm text-muted-foreground">{formatDate(job.scheduledAt, true)}</div>
                                                        </div>
                                                        <div className="flex flex-wrap items-center gap-2">
                                                            <span className="font-semibold">{formatCurrency(job.amount)}</span>
                                                            <StatusBadge status={getJobDisplayStatus(job)}>{getJobDisplayStatus(job)}</StatusBadge>
                                                            <Button variant="outline" size="sm" className="gap-1 bg-white/70" asChild>
                                                                <Link href={`/admin/schedule/${job.id}`}>
                                                                    <SquarePen className="h-3.5 w-3.5" />
                                                                    Open/Edit
                                                                </Link>
                                                            </Button>
                                                            <Button
                                                                variant="outline"
                                                                size="sm"
                                                                className="gap-1 border-red-200 bg-white/70 text-red-600 hover:text-red-700"
                                                                disabled={!canManage}
                                                                onClick={() => setDeleteTarget({ type: "job", id: job.id, label: job.jobNumber ?? job.title ?? "this job" })}
                                                            >
                                                                <Trash2 className="h-3.5 w-3.5" />
                                                                Delete
                                                            </Button>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </TabsContent>

                                        <TabsContent value="quotes">
                                            <div className="mb-4 flex justify-end">
                                                <Button size="sm" className="gap-2" disabled={!canManage} onClick={() => setQuoteOpen(true)}>
                                                    <Plus className="h-4 w-4" />Create Quote
                                                </Button>
                                            </div>
                                            <div className="space-y-3">
                                                {siteQuotes.length === 0 ? (
                                                    <EmptyState
                                                        title="No quotes linked"
                                                        description="Create a quote against this site to keep commercial history here."
                                                        action={
                                                            <Button className="gap-2" disabled={!canManage} onClick={() => setQuoteOpen(true)}>
                                                                <Plus className="h-4 w-4" />Create Quote
                                                            </Button>
                                                        }
                                                    />
                                                ) : siteQuotes.map((quote) => {
                                                    const quoteStatus = getQuoteDisplayStatus(quote)
                                                    const isAcceptedQuote = quoteStatus.toLowerCase() === "accepted" || String(quote.status ?? "").toUpperCase() === "SIGNED"
                                                    return (
                                                    <div key={quote.id} className="flex flex-col gap-3 rounded-2xl border border-glass-border/60 bg-white/50 p-4 transition hover:bg-white/75 md:flex-row md:items-center md:justify-between">
                                                        <div>
                                                            <RecordNumberBadge value={quote.quoteNumber} fallback="Quote" />
                                                            <div className="mt-2 font-semibold text-foreground">{quote.title ?? "Quote"}</div>
                                                            <div className="text-sm text-muted-foreground">Valid until {formatDate(quote.validUntil)}</div>
                                                        </div>
                                                        <div className="flex flex-wrap items-center gap-2">
                                                            <span className="font-semibold">{formatCurrency(getQuoteTotal(quote))}</span>
                                                            <StatusBadge status={quoteStatus}>{quoteStatus}</StatusBadge>
                                                            <Button variant="outline" size="sm" className="gap-1 bg-white/70" asChild>
                                                                <Link href={`/admin/quotes/${quote.id}`}>
                                                                    <SquarePen className="h-3.5 w-3.5" />
                                                                    Open/Edit
                                                                </Link>
                                                            </Button>
                                                            <Button
                                                                variant="outline"
                                                                size="sm"
                                                                className="gap-1 border-red-200 bg-white/70 text-red-600 hover:text-red-700"
                                                                disabled={!canManage || isAcceptedQuote}
                                                                onClick={() => setDeleteTarget({ type: "quote", id: quote.id, label: quote.quoteNumber ?? quote.title ?? "this quote", locked: isAcceptedQuote })}
                                                            >
                                                                <Trash2 className="h-3.5 w-3.5" />
                                                                Delete
                                                            </Button>
                                                        </div>
                                                    </div>
                                                )})}
                                            </div>
                                        </TabsContent>

                                        <TabsContent value="contacts" id="contacts">
                                            <div className="mb-4 flex justify-end">
                                                <Button size="sm" className="gap-2" disabled={!canManage} onClick={() => setContactOpen(true)}>
                                                    <Plus className="h-4 w-4" />Add Contact
                                                </Button>
                                            </div>
                                            <div className="space-y-3">
                                                {siteContacts.length === 0 ? (
                                                    <EmptyState
                                                        title="No contacts linked"
                                                        description="Add site-specific contacts from the customer site workspace."
                                                        action={
                                                            <Button className="gap-2" disabled={!canManage} onClick={() => setContactOpen(true)}>
                                                                <Plus className="h-4 w-4" />Add Contact
                                                            </Button>
                                                        }
                                                    />
                                                ) : siteContacts.map((contact) => (
                                                    <div key={contact.id} className="rounded-2xl border border-glass-border/60 bg-white/50 p-4">
                                                        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                                                            <div>
                                                                <div className="flex flex-wrap items-center gap-2">
                                                                    <div className="font-semibold text-foreground">{contact.name}</div>
                                                                    {contact.id === site.mainContactId ? <StatusBadge status="Active">Primary</StatusBadge> : null}
                                                                </div>
                                                                <div className="text-sm text-muted-foreground">{contact.role || "Site contact"}</div>
                                                            </div>
                                                            <div className="space-y-2 text-sm text-muted-foreground md:text-right">
                                                                {contact.email ? <div className="flex items-center gap-2 md:justify-end"><Mail className="h-3.5 w-3.5" />{contact.email}</div> : null}
                                                                {contact.phone ? <div className="flex items-center gap-2 md:justify-end"><Phone className="h-3.5 w-3.5" />{contact.phone}</div> : null}
                                                                <div className="flex flex-wrap gap-2 md:justify-end">
                                                                    <Button variant="outline" size="sm" className="gap-1 bg-white/70" disabled={!canManage} onClick={() => openEditContact(contact)}>
                                                                        <SquarePen className="h-3.5 w-3.5" />
                                                                        Edit
                                                                    </Button>
                                                                    <Button
                                                                        variant="outline"
                                                                        size="sm"
                                                                        className="gap-1 border-red-200 bg-white/70 text-red-600 hover:text-red-700"
                                                                        disabled={!canManage}
                                                                        onClick={() => setDeleteTarget({ type: "contact", id: contact.id, label: contact.name })}
                                                                    >
                                                                        <Trash2 className="h-3.5 w-3.5" />
                                                                        Delete
                                                                    </Button>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </TabsContent>

                                        <TabsContent value="documents">
                                            {complianceReports ? (
                                                <div className="mb-4 flex justify-end">
                                                    <Button size="sm" className="gap-2" disabled={!canManage} onClick={() => setComplianceOpen(true)}>
                                                        <Plus className="h-4 w-4" />Add Compliance Record
                                                    </Button>
                                                </div>
                                            ) : null}
                                            <div className="space-y-3">
                                                {siteComplianceRecords.length === 0 ? (
                                                    <EmptyState
                                                        title="No compliance documents"
                                                        description="Compliance records and documents linked to this site will appear here."
                                                        action={complianceReports ? (
                                                            <Button className="gap-2" disabled={!canManage} onClick={() => setComplianceOpen(true)}>
                                                                <Plus className="h-4 w-4" />Add Compliance Record
                                                            </Button>
                                                        ) : undefined}
                                                    />
                                                ) : siteComplianceRecords.map((record) => (
                                                    <div key={record.id} className="rounded-3xl border border-glass-border/70 bg-white/55 p-5 shadow-sm">
                                                        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                                                            <div className="flex min-w-0 items-start gap-4">
                                                                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                                                                    <FileText className="h-6 w-6" />
                                                                </div>
                                                                <div className="min-w-0">
                                                                    <div className="flex flex-wrap items-center gap-2">
                                                                        <h3 className="text-base font-semibold text-foreground">{record.title}</h3>
                                                                        <StatusBadge status={normalizeStatus(record.reviewStatus)}>
                                                                            {normalizeStatus(record.reviewStatus)}
                                                                        </StatusBadge>
                                                                        <StatusBadge status={record.customerVisible === false ? "Draft" : "Accepted"}>
                                                                            {record.customerVisible === false ? "Hidden from customer" : "Customer visible"}
                                                                        </StatusBadge>
                                                                    </div>
                                                                    <p className="mt-1 text-sm text-muted-foreground">
                                                                        {record.reportType}
                                                                        {record.reference ? ` • Ref: ${record.reference}` : ""}
                                                                    </p>
                                                                    {record.documentName ? (
                                                                        <p className="mt-1 text-xs text-muted-foreground">Attached file: {record.documentName}</p>
                                                                    ) : null}
                                                                </div>
                                                            </div>
                                                            <div className="flex shrink-0 flex-wrap gap-2">
                                                                {record.documentFileUrl ? (
                                                                    <Button variant="outline" size="sm" className="bg-white/70" asChild>
                                                                        <a href={record.documentFileUrl} target="_blank" rel="noreferrer">Open File</a>
                                                                    </Button>
                                                                ) : null}
                                                                {record.jobId ? (
                                                                    <Button variant="outline" size="sm" className="bg-white/70" asChild>
                                                                        <Link href={`/admin/schedule/${record.jobId}`}>Open Job</Link>
                                                                    </Button>
                                                                ) : null}
                                                                <Button variant="outline" size="sm" className="gap-1 bg-white/70" disabled={!canManage} onClick={() => openEditComplianceRecord(record)}>
                                                                    <SquarePen className="h-3.5 w-3.5" />
                                                                    Edit
                                                                </Button>
                                                                <Button
                                                                    variant="outline"
                                                                    size="sm"
                                                                    className="gap-1 border-red-200 bg-white/70 text-red-600 hover:text-red-700"
                                                                    disabled={!canManage}
                                                                    onClick={() => setDeleteTarget({ type: "compliance", id: record.id, label: record.title })}
                                                                >
                                                                    <Trash2 className="h-3.5 w-3.5" />
                                                                    Delete
                                                                </Button>
                                                            </div>
                                                        </div>

                                                        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                                                            <DetailTile label="Result" value={record.outcome ?? "Not recorded"} />
                                                            <DetailTile label="Tested" value={formatDate(record.testedAt)} />
                                                            <DetailTile label="Valid From" value={formatDate(record.validFrom)} />
                                                            <DetailTile label="Valid Until" value={formatDate(record.validUntil)} />
                                                            <DetailTile label="Expected Renewal Value" value={record.expectedRenewalValue != null ? formatCurrency(Number(record.expectedRenewalValue)) : "Not set"} />
                                                            <DetailTile label="Reviewer" value={record.reviewerName ?? "Unassigned"} />
                                                            <DetailTile label="Reviewed" value={formatDate(record.reviewedAt, true)} />
                                                            <DetailTile label="Linked Job" value={record.jobTitle ?? "Not linked"} />
                                                            <DetailTile label="Added" value={formatDate(record.createdAt, true)} />
                                                        </div>

                                                        {(record.notes || record.reviewNote) ? (
                                                            <div className="mt-4 grid gap-3 lg:grid-cols-2">
                                                                {record.notes ? (
                                                                    <div className="rounded-2xl border border-glass-border/60 bg-white/55 p-4">
                                                                        <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Record Notes</div>
                                                                        <p className="mt-2 whitespace-pre-wrap text-sm text-foreground">{record.notes}</p>
                                                                    </div>
                                                                ) : null}
                                                                {record.reviewNote ? (
                                                                    <div className="rounded-2xl border border-glass-border/60 bg-white/55 p-4">
                                                                        <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Review Note</div>
                                                                        <p className="mt-2 whitespace-pre-wrap text-sm text-foreground">{record.reviewNote}</p>
                                                                    </div>
                                                                ) : null}
                                                            </div>
                                                        ) : null}
                                                    </div>
                                                ))}
                                            </div>
                                        </TabsContent>

                                        <TabsContent value="activity">
                                            <div className="space-y-4">
                                                {activityItems.length === 0 ? <EmptyState title="No activity yet" description="Jobs, quotes, invoices, and records will build this site timeline." /> : activityItems.map((item) => (
                                                    <div key={item.id} className="flex gap-3">
                                                        <div className="flex flex-col items-center">
                                                            <span className={`mt-1 h-3 w-3 rounded-full ${item.tone}`} />
                                                            <span className="mt-2 h-full min-h-8 w-px bg-glass-border/70" />
                                                        </div>
                                                        <div className="pb-3">
                                                            <div className="text-sm font-medium text-foreground">{item.label}</div>
                                                            <div className="text-xs text-muted-foreground">{item.meta}</div>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </TabsContent>
                                    </Tabs>
                                </GlassCardContent>
                            </GlassCard>

                            <div className="space-y-6">
                                <GlassCard>
                                    <GlassCardHeader className="pb-4">
                                        <GlassCardTitle className="text-lg">At a Glance</GlassCardTitle>
                                    </GlassCardHeader>
                                    <GlassCardContent className="space-y-3 text-sm">
                                        {[
                                            ["Total Jobs", siteJobs.length, BriefcaseBusiness],
                                            ["Open Jobs", openJobs.length, ClipboardList],
                                            ["Overdue Jobs", overdueJobs.length, AlertTriangle],
                                            ["Completed Jobs", siteJobs.length - openJobs.length, CheckCircle2],
                                            ["Total Quotes", siteQuotes.length, Quote],
                                            ["Accepted Quotes", `${acceptedQuotes.length}${siteQuotes.length ? ` (${Math.round((acceptedQuotes.length / siteQuotes.length) * 100)}%)` : ""}`, Activity],
                                            ["Total Contacts", siteContacts.length, UserRound],
                                        ].map(([label, value, Icon]) => {
                                            const IconComponent = Icon as typeof BriefcaseBusiness
                                            return (
                                                <div key={String(label)} className="flex items-center justify-between border-b border-glass-border/50 pb-2 last:border-0">
                                                    <span className="flex items-center gap-2 text-muted-foreground">
                                                        <IconComponent className="h-4 w-4 text-primary" />
                                                        {String(label)}
                                                    </span>
                                                    <span className="font-semibold text-foreground">{String(value)}</span>
                                                </div>
                                            )
                                        })}
                                    </GlassCardContent>
                                </GlassCard>

                                <GlassCard>
                                    <GlassCardHeader className="pb-4">
                                        <div className="flex items-center justify-between">
                                            <GlassCardTitle className="text-lg">Compliance Documents</GlassCardTitle>
                                            <button type="button" onClick={() => setActiveTab("documents")} className="text-xs font-semibold text-primary">View all</button>
                                        </div>
                                    </GlassCardHeader>
                                    <GlassCardContent className="space-y-3">
                                        {relatedDocuments.length === 0 ? (
                                            <p className="text-sm text-muted-foreground">No documents linked yet.</p>
                                        ) : (
                                            relatedDocuments.slice(0, 4).map((record) => (
                                                <div key={record.id} className="flex items-start gap-3">
                                                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                                                        <FileText className="h-4 w-4" />
                                                    </div>
                                                    <div className="min-w-0">
                                                        <div className="truncate text-sm font-semibold text-foreground">{record.documentName ?? record.title}</div>
                                                        <div className="text-xs text-muted-foreground">
                                                            {record.reportType} • {normalizeStatus(record.reviewStatus)}
                                                        </div>
                                                        <div className="text-xs text-muted-foreground">Added {formatDate(record.createdAt ?? record.testedAt)}</div>
                                                    </div>
                                                </div>
                                            ))
                                        )}
                                    </GlassCardContent>
                                </GlassCard>

                                <GlassCard>
                                    <GlassCardHeader className="pb-4">
                                        <GlassCardTitle className="text-lg">Renewals</GlassCardTitle>
                                    </GlassCardHeader>
                                    <GlassCardContent className="space-y-3">
                                        {siteRenewals.length === 0 ? (
                                            <p className="text-sm text-muted-foreground">No renewals scheduled for this site.</p>
                                        ) : (
                                            siteRenewals.slice(0, 4).map((renewal) => (
                                                <div key={renewal.id} className="rounded-2xl border border-glass-border/60 bg-white/45 p-3">
                                                    <div className="font-semibold text-foreground">{renewal.title}</div>
                                                    <div className="mt-1 flex items-center justify-between text-xs text-muted-foreground">
                                                        <span className="flex items-center gap-1"><CalendarDays className="h-3.5 w-3.5" />{formatDate(renewal.dueDate)}</span>
                                                        <StatusBadge status={normalizeStatus(renewal.status)}>{normalizeStatus(renewal.status)}</StatusBadge>
                                                    </div>
                                                </div>
                                            ))
                                        )}
                                    </GlassCardContent>
                                </GlassCard>
                            </div>
                        </div>
                    </>
                )}
            </div>
            <GlassModal
                open={jobOpen}
                onOpenChange={(open) => {
                    setJobOpen(open)
                    if (!open) setJobForm(DEFAULT_JOB_FORM)
                }}
                title="Create Job"
                description={`Customer and site are auto-selected: ${contextSummary}`}
                footer={
                    <div className="flex w-full justify-end gap-2">
                        <Button variant="outline" onClick={() => setJobOpen(false)} disabled={savingJob}>Cancel</Button>
                        <Button onClick={createJob} disabled={savingJob || !canManage}>{savingJob ? "Creating..." : "Create Job"}</Button>
                    </div>
                }
            >
                <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                        <Label>Customer</Label>
                        <Input value={customer?.name ?? ""} disabled className="bg-white/50" />
                    </div>
                    <div className="space-y-2">
                        <Label>Site</Label>
                        <Input value={site?.name ?? ""} disabled className="bg-white/50" />
                    </div>
                    <div className="space-y-2 md:col-span-2">
                        <Label required>Job Title</Label>
                        <Input value={jobForm.title} onChange={(event) => setJobForm((prev) => ({ ...prev, title: event.target.value }))} placeholder="e.g. Annual inspection" />
                    </div>
                    <div className="space-y-2">
                        <Label required>Start Time</Label>
                        <Input type="datetime-local" value={jobForm.scheduledAt} onChange={(event) => setJobForm((prev) => ({ ...prev, scheduledAt: event.target.value }))} />
                    </div>
                    <div className="space-y-2">
                        <Label required>End Time</Label>
                        <Input type="datetime-local" value={jobForm.scheduledEndAt} onChange={(event) => setJobForm((prev) => ({ ...prev, scheduledEndAt: event.target.value }))} />
                    </div>
                    <div className="space-y-2">
                        <Label>Priority</Label>
                        <select
                            value={jobForm.priority}
                            onChange={(event) => setJobForm((prev) => ({ ...prev, priority: event.target.value }))}
                            className="flex h-9 w-full rounded-md border border-input bg-white/60 px-3 py-1 text-sm shadow-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
                        >
                            <option value="Low">Low</option>
                            <option value="Medium">Medium</option>
                            <option value="High">High</option>
                            <option value="Emergency">Emergency</option>
                        </select>
                    </div>
                    <div className="space-y-2 md:col-span-2">
                        <Label>Site Address</Label>
                        <Input value={siteAddress || "No address saved for this site"} disabled className="bg-white/50" />
                    </div>
                    <div className="space-y-2 md:col-span-2">
                        <Label optional>Description</Label>
                        <Textarea value={jobForm.description} onChange={(event) => setJobForm((prev) => ({ ...prev, description: event.target.value }))} placeholder="Add job notes or instructions..." className="min-h-[100px] bg-white/50" />
                    </div>
                </div>
            </GlassModal>

            <GlassModal
                open={siteEditOpen}
                onOpenChange={(open) => {
                    setSiteEditOpen(open)
                    if (!open) setSiteForm(DEFAULT_SITE_FORM)
                }}
                title="Edit Site"
                description={`Update site details for ${customer?.name ?? "this customer"}.`}
                footer={
                    <div className="flex w-full justify-end gap-2">
                        <Button variant="outline" onClick={() => setSiteEditOpen(false)} disabled={savingSite}>Cancel</Button>
                        <Button onClick={saveSite} disabled={savingSite || !canManage}>{savingSite ? "Saving..." : "Save Site"}</Button>
                    </div>
                }
            >
                <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                        <Label required>Site Name</Label>
                        <Input value={siteForm.name} onChange={(event) => setSiteForm((prev) => ({ ...prev, name: event.target.value }))} placeholder="Site name" />
                    </div>
                    <div className="space-y-2">
                        <Label required>Status</Label>
                        <Select value={siteForm.status} onValueChange={(value) => setSiteForm((prev) => ({ ...prev, status: value }))}>
                            <SelectTrigger className="w-full bg-white/50">
                                <SelectValue placeholder="Select status" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="ACTIVE">Active</SelectItem>
                                <SelectItem value="INACTIVE">Inactive</SelectItem>
                                <SelectItem value="PROSPECT">Prospect</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="space-y-2">
                        <Label optional>Category</Label>
                        <Input value={siteForm.category} onChange={(event) => setSiteForm((prev) => ({ ...prev, category: event.target.value }))} placeholder="Commercial, Residential..." />
                    </div>
                    <div className="space-y-2">
                        <Label optional>Reference</Label>
                        <Input value={siteForm.reference} onChange={(event) => setSiteForm((prev) => ({ ...prev, reference: event.target.value }))} placeholder="SITE-001" />
                    </div>
                    <div className="space-y-2 md:col-span-2">
                        <Label optional>Site Group</Label>
                        <Select value={siteForm.siteGroupId || "ungrouped"} onValueChange={(value) => setSiteForm((prev) => ({ ...prev, siteGroupId: value === "ungrouped" ? "" : value }))}>
                            <SelectTrigger className="w-full bg-white/50">
                                <SelectValue placeholder="Select a site group" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="ungrouped">Ungrouped</SelectItem>
                                {(payload?.siteGroups ?? []).map((group) => (
                                    <SelectItem key={group.id} value={group.id}>{group.name}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="space-y-2 md:col-span-2">
                        <Label optional>Address Line 1</Label>
                        <Input value={siteForm.addressLine1} onChange={(event) => setSiteForm((prev) => ({ ...prev, addressLine1: event.target.value }))} placeholder="Street address" />
                    </div>
                    <div className="space-y-2 md:col-span-2">
                        <Label optional>Address Line 2</Label>
                        <Input value={siteForm.addressLine2} onChange={(event) => setSiteForm((prev) => ({ ...prev, addressLine2: event.target.value }))} placeholder="Suite, floor, or building" />
                    </div>
                    <div className="space-y-2">
                        <Label optional>City</Label>
                        <Input value={siteForm.city} onChange={(event) => setSiteForm((prev) => ({ ...prev, city: event.target.value }))} placeholder="City" />
                    </div>
                    <div className="space-y-2">
                        <Label optional>County / State</Label>
                        <Input value={siteForm.state} onChange={(event) => setSiteForm((prev) => ({ ...prev, state: event.target.value }))} placeholder="County or state" />
                    </div>
                    <div className="space-y-2">
                        <Label optional>Postcode / ZIP</Label>
                        <Input value={siteForm.postalCode} onChange={(event) => setSiteForm((prev) => ({ ...prev, postalCode: event.target.value }))} placeholder="Postcode" />
                    </div>
                    <div className="space-y-2">
                        <Label optional>Country</Label>
                        <CountrySelect value={siteForm.country} onValueChange={(country) => setSiteForm((prev) => ({ ...prev, country }))} />
                    </div>
                    <div className="space-y-2 md:col-span-2">
                        <Label optional>Main Site Contact</Label>
                        <Select value={siteForm.mainContactId || "manual"} onValueChange={(value) => setSiteForm((prev) => ({ ...prev, mainContactId: value === "manual" ? "" : value }))}>
                            <SelectTrigger className="w-full bg-white/50">
                                <SelectValue placeholder="Select main site contact" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="manual">Use manual primary contact fields</SelectItem>
                                {siteContacts.map((contact) => (
                                    <SelectItem key={contact.id} value={contact.id}>{contact.name}{contact.role ? ` • ${contact.role}` : ""}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="space-y-2">
                        <Label optional>Primary Contact Name</Label>
                        <Input value={siteForm.primaryContactName} disabled={Boolean(siteForm.mainContactId)} onChange={(event) => setSiteForm((prev) => ({ ...prev, primaryContactName: event.target.value }))} placeholder="On-site contact" />
                    </div>
                    <div className="space-y-2">
                        <Label optional>Primary Contact Email</Label>
                        <Input type="email" value={siteForm.primaryContactEmail} disabled={Boolean(siteForm.mainContactId)} onChange={(event) => setSiteForm((prev) => ({ ...prev, primaryContactEmail: event.target.value }))} placeholder="site-contact@email.com" />
                    </div>
                    <div className="space-y-2 md:col-span-2">
                        <Label optional>Primary Contact Phone</Label>
                        <PhoneInput value={siteForm.primaryContactPhone} disabled={Boolean(siteForm.mainContactId)} onChange={(phone) => setSiteForm((prev) => ({ ...prev, primaryContactPhone: phone }))} />
                    </div>
                    <div className="space-y-2 md:col-span-2">
                        <Label optional>Tags</Label>
                        <Input value={siteForm.tags} onChange={(event) => setSiteForm((prev) => ({ ...prev, tags: event.target.value }))} placeholder="High priority, Key account, Out of hours" />
                    </div>
                    <div className="space-y-2 md:col-span-2">
                        <Label optional>Additional Information</Label>
                        <Textarea value={siteForm.additionalInformation} onChange={(event) => setSiteForm((prev) => ({ ...prev, additionalInformation: event.target.value }))} placeholder="Access windows, permit rules, escalation notes..." className="min-h-[96px] bg-white/50" />
                    </div>
                    <div className="space-y-2 md:col-span-2">
                        <Label optional>Notes</Label>
                        <Textarea value={siteForm.notes} onChange={(event) => setSiteForm((prev) => ({ ...prev, notes: event.target.value }))} placeholder="Access notes, service constraints, or other important site context" className="min-h-[110px] bg-white/50" />
                    </div>
                </div>
            </GlassModal>

            <GlassModal
                open={quoteOpen}
                onOpenChange={(open) => {
                    setQuoteOpen(open)
                    if (!open) setQuoteForm(DEFAULT_QUOTE_FORM)
                }}
                title="Create Quote"
                description={`Customer and site are auto-selected: ${contextSummary}`}
                footer={
                    <div className="flex w-full justify-end gap-2">
                        <Button variant="outline" onClick={() => setQuoteOpen(false)} disabled={savingQuote}>Cancel</Button>
                        <Button onClick={createQuote} disabled={savingQuote || !canManage}>{savingQuote ? "Creating..." : "Create Quote"}</Button>
                    </div>
                }
            >
                <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                        <Label>Customer</Label>
                        <Input value={customer?.name ?? ""} disabled className="bg-white/50" />
                    </div>
                    <div className="space-y-2">
                        <Label>Site</Label>
                        <Input value={site?.name ?? ""} disabled className="bg-white/50" />
                    </div>
                    <div className="space-y-2 md:col-span-2">
                        <Label required>Quote Title</Label>
                        <Input value={quoteForm.title} onChange={(event) => setQuoteForm((prev) => ({ ...prev, title: event.target.value }))} placeholder="e.g. Site maintenance quote" />
                    </div>
                    <div className="space-y-2 md:col-span-2">
                        <Label required>Line Item</Label>
                        <Input value={quoteForm.lineDescription} onChange={(event) => setQuoteForm((prev) => ({ ...prev, lineDescription: event.target.value }))} placeholder="Description of work or product" />
                    </div>
                    <div className="space-y-2">
                        <Label required>Quantity</Label>
                        <Input type="number" min="0" step="0.01" value={quoteForm.quantity} onChange={(event) => setQuoteForm((prev) => ({ ...prev, quantity: event.target.value }))} />
                    </div>
                    <div className="space-y-2">
                        <Label required>Unit Price</Label>
                        <Input type="number" min="0" step="0.01" value={quoteForm.unitPrice} onChange={(event) => setQuoteForm((prev) => ({ ...prev, unitPrice: event.target.value }))} placeholder="0.00" />
                    </div>
                    <div className="space-y-2">
                        <Label>VAT %</Label>
                        <Input type="number" min="0" step="0.01" value={quoteForm.vatRate} onChange={(event) => setQuoteForm((prev) => ({ ...prev, vatRate: event.target.value }))} />
                    </div>
                    <div className="space-y-2">
                        <Label optional>Valid Until</Label>
                        <Input type="date" value={quoteForm.validUntil} onChange={(event) => setQuoteForm((prev) => ({ ...prev, validUntil: event.target.value }))} />
                    </div>
                    <div className="space-y-2 md:col-span-2">
                        <Label optional>Notes</Label>
                        <Textarea value={quoteForm.notes} onChange={(event) => setQuoteForm((prev) => ({ ...prev, notes: event.target.value }))} placeholder="Optional quote notes..." className="min-h-[100px] bg-white/50" />
                    </div>
                </div>
            </GlassModal>

            <GlassModal
                open={contactOpen}
                onOpenChange={(open) => {
                    setContactOpen(open)
                    if (!open) {
                        setContactForm(DEFAULT_CONTACT_FORM)
                        setEditingContactId(null)
                    }
                }}
                title={editingContactId ? "Edit Site Contact" : "Add Site Contact"}
                description={editingContactId ? `Update this contact for ${contextSummary}.` : `This contact will be added to ${contextSummary}.`}
                footer={
                    <div className="flex w-full justify-end gap-2">
                        <Button variant="outline" onClick={() => setContactOpen(false)} disabled={savingContact}>Cancel</Button>
                        <Button onClick={createContact} disabled={savingContact || !canManage}>
                            {savingContact ? "Saving..." : editingContactId ? "Save Contact" : "Add Contact"}
                        </Button>
                    </div>
                }
            >
                <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2 md:col-span-2">
                        <Label>Site</Label>
                        <Input value={site?.name ?? ""} disabled className="bg-white/50" />
                    </div>
                    <div className="space-y-2">
                        <Label required>Name</Label>
                        <Input value={contactForm.name} onChange={(event) => setContactForm((prev) => ({ ...prev, name: event.target.value }))} placeholder="Contact name" />
                    </div>
                    <div className="space-y-2">
                        <Label optional>Role</Label>
                        <Input value={contactForm.role} onChange={(event) => setContactForm((prev) => ({ ...prev, role: event.target.value }))} placeholder="e.g. Site manager" />
                    </div>
                    <div className="space-y-2">
                        <Label optional>Email</Label>
                        <Input type="email" value={contactForm.email} onChange={(event) => setContactForm((prev) => ({ ...prev, email: event.target.value }))} placeholder="contact@example.com" />
                    </div>
                    <div className="space-y-2">
                        <Label optional>Phone</Label>
                        <PhoneInput value={contactForm.phone} onChange={(phone) => setContactForm((prev) => ({ ...prev, phone }))} />
                    </div>
                    <div className="space-y-2 md:col-span-2">
                        <Label optional>Notes</Label>
                        <Textarea value={contactForm.notes} onChange={(event) => setContactForm((prev) => ({ ...prev, notes: event.target.value }))} placeholder="Optional contact notes..." className="min-h-[90px] bg-white/50" />
                    </div>
                </div>
            </GlassModal>

            <GlassModal
                open={complianceOpen}
                onOpenChange={(open) => {
                    setComplianceOpen(open)
                    if (!open) {
                        setComplianceForm(DEFAULT_COMPLIANCE_FORM)
                        setEditingComplianceId(null)
                    }
                }}
                title={editingComplianceId ? "Edit Compliance Record" : "Add Compliance Record"}
                description={editingComplianceId ? `Update this record for ${contextSummary}.` : `This record will be added to ${contextSummary}.`}
                footer={
                    <div className="flex w-full justify-end gap-2">
                        <Button variant="outline" onClick={() => setComplianceOpen(false)} disabled={savingCompliance}>Cancel</Button>
                        <Button onClick={createComplianceRecord} disabled={savingCompliance || !canManage}>
                            {savingCompliance ? "Saving..." : editingComplianceId ? "Save Record" : "Add Record"}
                        </Button>
                    </div>
                }
            >
                <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2 md:col-span-2">
                        <Label>Site</Label>
                        <Input value={site?.name ?? ""} disabled className="bg-white/50" />
                    </div>
                    <div className="space-y-2">
                        <Label required>Title</Label>
                        <Input value={complianceForm.title} onChange={(event) => setComplianceForm((prev) => ({ ...prev, title: event.target.value }))} placeholder="e.g. Fire alarm inspection" />
                    </div>
                    <div className="space-y-2">
                        <Label required>Report Type</Label>
                        <Input value={complianceForm.reportType} onChange={(event) => setComplianceForm((prev) => ({ ...prev, reportType: event.target.value }))} placeholder="e.g. Inspection" />
                    </div>
                    <div className="space-y-2">
                        <Label optional>Reference</Label>
                        <Input value={complianceForm.reference} onChange={(event) => setComplianceForm((prev) => ({ ...prev, reference: event.target.value }))} placeholder="Optional reference" />
                    </div>
                    <div className="space-y-2">
                        <Label optional>Outcome</Label>
                        <Input value={complianceForm.outcome} onChange={(event) => setComplianceForm((prev) => ({ ...prev, outcome: event.target.value }))} placeholder="Pass, fail, observation..." />
                    </div>
                    <div className="space-y-2">
                        <Label optional>Tested At</Label>
                        <Input type="date" value={complianceForm.testedAt} onChange={(event) => setComplianceForm((prev) => ({ ...prev, testedAt: event.target.value }))} />
                    </div>
                    <div className="space-y-2">
                        <Label optional>Valid From</Label>
                        <Input type="date" value={complianceForm.validFrom} onChange={(event) => setComplianceForm((prev) => ({ ...prev, validFrom: event.target.value }))} />
                    </div>
                    <div className="space-y-2">
                        <Label optional>Valid Until</Label>
                        <Input type="date" value={complianceForm.validUntil} onChange={(event) => setComplianceForm((prev) => ({ ...prev, validUntil: event.target.value }))} />
                    </div>
                    <div className="space-y-2">
                        <Label optional>Expected Renewal Value</Label>
                        <Input
                            type="number"
                            min="0"
                            step="0.01"
                            value={complianceForm.expectedRenewalValue}
                            onChange={(event) => setComplianceForm((prev) => ({ ...prev, expectedRenewalValue: event.target.value }))}
                            placeholder="0.00"
                        />
                    </div>
                    <div className="space-y-2 md:col-span-2">
                        <Label optional>Notes</Label>
                        <Textarea value={complianceForm.notes} onChange={(event) => setComplianceForm((prev) => ({ ...prev, notes: event.target.value }))} placeholder="Optional record notes..." className="min-h-[100px] bg-white/50" />
                    </div>
                </div>
            </GlassModal>
            <GlassModal
                open={Boolean(deleteTarget)}
                onOpenChange={(open) => {
                    if (!open) setDeleteTarget(null)
                }}
                title="Confirm Delete"
                description={
                    deleteTarget?.type === "quote" && deleteTarget.locked
                        ? "Accepted quotes cannot be deleted."
                        : `Are you sure you want to delete ${deleteTarget?.label ?? "this record"}? This action cannot be undone.`
                }
                footer={
                    <div className="flex w-full justify-end gap-2">
                        <Button variant="outline" onClick={() => setDeleteTarget(null)} disabled={deleting}>Cancel</Button>
                        <Button
                            variant="destructive"
                            onClick={confirmDelete}
                            disabled={deleting || (deleteTarget?.type === "quote" && deleteTarget.locked)}
                        >
                            {deleting ? "Deleting..." : "Delete"}
                        </Button>
                    </div>
                }
            />
            <ErrorToast error={error} onClear={() => setError(null)} />
        </PageContainer>
    )
}

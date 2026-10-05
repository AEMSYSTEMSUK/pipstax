"use client"

import { use, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { PageContainer } from "@/components/layout/PageContainer"
import { GlassCard, GlassCardContent, GlassCardHeader, GlassCardTitle } from "@/components/glass/GlassCard"
import { Button } from "@/components/ui/button"
type Quote = {
    id: string
    quoteNumber: string
    clientId: string
    siteId?: string
    siteName?: string
    siteAddress?: string
    clientName: string
    clientEmail: string
    projectName: string
    dateCreated: string
    validUntil: string
    subtotal: number
    taxTotal: number
    total: number
    status: string
    lineItems: Array<{ id?: string; description?: string; quantity?: number; unitPrice?: number; taxRate?: number; total?: number }>
    notes?: string
    termsAndConditions?: string
    sentAt?: string
    viewedAt?: string
    signedAt?: string
    declinedAt?: string
    expiredAt?: string
    workflowStageKey?: string
    signedByName?: string
    signedByEmail?: string
    signatureData?: string
    publicToken?: string
    publicLink?: string
    jobId?: string
    leadId?: string
}
type Tenant = {
    name?: string
    tradingName?: string
    logoUrl?: string
    address?: string
    contactEmail?: string
    contactPhone?: string
}
import { ArrowLeft, Download, Send, PenTool, CheckCircle, Mail, Plus, Trash2, Copy, Link2, BriefcaseBusiness } from "lucide-react"
import { apiDelete, apiGet, apiPost, apiPut, downloadFile } from "@/lib/api"
import { ErrorToast } from "@/components/shared/ErrorToast"
import { StatusBadge } from "@/components/shared/StatusBadge"
import { GlassModal } from "@/components/glass/GlassModal"
import { useToast } from "@/components/ui/toast"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Checkbox } from "@/components/ui/checkbox"
import DatePicker from "react-datepicker"
import { formatQuoteStatus } from "@/lib/status"
import { useRouter } from "next/navigation"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { getModulePermissions } from "@/lib/permission-ui"
import { CustomerSiteOption, customerSiteToAddressValue, fetchCustomerSites, formatCustomerSiteAddress, formatCustomerSiteLabel } from "@/lib/customer-sites"
import { useTenantFeatures } from "@/components/layout/TenantFeaturesContext"
import { useTenantWorkflowConfig } from "@/components/layout/TenantWorkflowContext"
import { getWorkflowStageOptions, getWorkflowStatusLabel } from "@/lib/workflows"
import { AddressFields, emptyAddressValue, formatAddressValue, parseAddressValue, type AddressValue } from "@/components/shared/LocalizedFields"
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

export default function QuoteDetailPage({ params }: { params: Promise<{ id: string }> }) {
    const resolvedParams = use(params)
    const router = useRouter()
    const { toast } = useToast()
    const { canView, canManage } = getModulePermissions("quotes.view", "quotes.manage")
    const { canManage: canManageJobs } = getModulePermissions("scheduling.view", "scheduling.manage")
    const { sites: sitesEnabled, complianceWorkflows } = useTenantFeatures()
    const workflowConfig = useTenantWorkflowConfig()
    const [quote, setQuote] = useState<Quote | null>(null)
    const [tenant, setTenant] = useState<Tenant | null>(null)
    const [error, setError] = useState<string | null>(null)
    const [customers, setCustomers] = useState<any[]>([])
    const [customerSites, setCustomerSites] = useState<CustomerSiteOption[]>([])
    const [jobCustomerSites, setJobCustomerSites] = useState<CustomerSiteOption[]>([])
    const [editOpen, setEditOpen] = useState(false)
    const [editForm, setEditForm] = useState({
        customerId: "",
        siteId: "",
        projectName: "",
        validUntil: null as Date | null,
        notes: "",
        terms: ""
    })
    const [editItems, setEditItems] = useState<Array<{ id: string; description: string; quantity: number; unitPrice: number; taxRate: number }>>([])
    const [editErrors, setEditErrors] = useState<{ projectName?: string; items?: string }>({})
    const [editItemErrors, setEditItemErrors] = useState<Record<string, { description?: string; quantity?: string; unitPrice?: string }>>({})
    const [deleteOpen, setDeleteOpen] = useState(false)
    const [logoUnavailable, setLogoUnavailable] = useState(false)
    const [savingMode, setSavingMode] = useState<"save" | "send" | null>(null)
    const [sendOptionsOpen, setSendOptionsOpen] = useState(false)
    const [sendEmailOpen, setSendEmailOpen] = useState(false)
    const [sendEmailForm, setSendEmailForm] = useState({
        email: "",
        message: "",
        markAsSent: true
    })
    const [sendActionLoading, setSendActionLoading] = useState<"email" | "copy" | "download" | null>(null)
    const [createJobOpen, setCreateJobOpen] = useState(false)
    const [creatingJob, setCreatingJob] = useState(false)
    const [jobForm, setJobForm] = useState({
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
        scheduledEndAt: null as Date | null,
    })
    const [jobErrors, setJobErrors] = useState<{ title?: string; customerId?: string; siteId?: string; location?: string; scheduledEndAt?: string }>({})

    const calcTotals = (items: Array<{ quantity: number; unitPrice: number; taxRate: number }>) => {
        const subtotal = items.reduce((acc, item) => acc + (item.quantity * item.unitPrice), 0)
        const taxTotal = items.reduce((acc, item) => acc + ((item.quantity * item.unitPrice) * (item.taxRate / 100)), 0)
        return { subtotal, taxTotal, total: subtotal + taxTotal }
    }

    useEffect(() => {
        const load = async () => {
            try {
                const [response, customersRes, tenantRes] = await Promise.all([
                    apiGet<any>(`/quotes/${resolvedParams.id}`),
                    apiGet<any[]>(`/customers`),
                    apiGet<Tenant>("/settings/tenant")
                ])
                const data = response.data
                const customerList = Array.isArray(customersRes.data) ? customersRes.data : []
                setCustomers(customerList)
                setTenant(tenantRes.data ?? null)
                setLogoUnavailable(false)
                const customer = customerList.find((c) => c.id === data.customerId)
                const lineItems = Array.isArray(data.lineItems) ? data.lineItems : []
                const subtotal = lineItems.reduce((acc: number, item: any) => acc + (Number(item.quantity ?? 0) * Number(item.unitPrice ?? 0)), 0)
                const taxTotal = lineItems.reduce((acc: number, item: any) => acc + ((Number(item.quantity ?? 0) * Number(item.unitPrice ?? 0)) * (Number(item.vatRate ?? 0) / 100)), 0)
                setQuote({
                    id: data.id,
                    quoteNumber: data.quoteNumber ?? "QT-PENDING",
                    clientId: data.customerId ?? "",
                    siteId: data.siteId ?? "",
                    siteName: data.siteName ?? undefined,
                    siteAddress: data.siteAddress ?? undefined,
                    clientName: data.customerName ?? customer?.name ?? data.recipientName ?? "Customer",
                    clientEmail: data.customerEmail ?? customer?.email ?? data.recipientEmail ?? "",
                    projectName: data.title ?? "Quote",
                    dateCreated: data.createdAt ?? new Date().toISOString(),
                    validUntil: data.validUntil ?? data.createdAt ?? new Date().toISOString(),
                    subtotal,
                    taxTotal,
                    total: Number(data.total ?? subtotal + taxTotal),
                    status: (data.status ?? "DRAFT").toString().toUpperCase(),
                    lineItems: (lineItems ?? []).map((item: any, idx: number) => ({
                        id: `${data.id}-${idx}`,
                        description: item.description,
                        quantity: item.quantity,
                        unitPrice: item.unitPrice,
                        taxRate: item.vatRate ?? 0,
                        total: item.quantity * item.unitPrice
                    })),
                    sentAt: data.sentAt,
                    viewedAt: data.viewedAt,
                    signedAt: data.signedAt,
                    declinedAt: data.declinedAt,
                    expiredAt: data.expiredAt,
                    workflowStageKey: data.workflowStageKey ?? undefined,
                    signedByName: data.signedByName,
                    signedByEmail: data.signedByEmail,
                    signatureData: data.signatureData,
                    publicToken: data.publicToken,
                    publicLink: data.publicLink,
                    jobId: data.jobId,
                    leadId: data.leadId,
                    notes: data.notes,
                    termsAndConditions: data.termsAndConditions
                })
            } catch (err: any) {
                setError(err?.message ?? "Failed to load quote")
            }
        }
        load()
    }, [resolvedParams.id])

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

    useEffect(() => {
        const loadJobSites = async () => {
            if (!sitesEnabled || !jobForm.customerId) {
                setJobCustomerSites([])
                setJobForm((prev) => ({ ...prev, siteId: "" }))
                return
            }
            try {
                const sites = await fetchCustomerSites(jobForm.customerId)
                setJobCustomerSites(sites)
                setJobForm((prev) => {
                    const siteId = sites.some((site) => site.id === prev.siteId) ? prev.siteId : ""
                    const selectedSite = sites.find((site) => site.id === siteId)
                    const selectedAddress = selectedSite ? customerSiteToAddressValue(selectedSite) : prev.address
                    return {
                        ...prev,
                        siteId,
                        address: selectedSite && !hasJobAddress(prev.address) ? selectedAddress : prev.address,
                        addressManuallyEdited: selectedSite && !hasJobAddress(prev.address) ? false : prev.addressManuallyEdited,
                        location:
                            selectedSite && !prev.location
                                ? formatJobAddressForPayload(selectedAddress) || formatCustomerSiteAddress(selectedSite) || prev.location
                                : prev.location,
                    }
                })
            } catch (err: any) {
                setError(err?.message ?? "Failed to load customer sites")
                setJobCustomerSites([])
                setJobForm((prev) => ({ ...prev, siteId: "" }))
            }
        }
        void loadJobSites()
    }, [jobForm.customerId, sitesEnabled])

    const validUntilDate = (() => {
        if (quote?.validUntil) {
            return new Date(quote.validUntil)
        }
        const base = new Date(quote?.dateCreated ?? new Date().toISOString())
        base.setDate(base.getDate() + 30)
        return base
    })()
    const tenantName = tenant?.tradingName ?? tenant?.name ?? "Tenant"
    const brandAddress = [tenant?.address, tenant?.contactEmail, tenant?.contactPhone].filter(Boolean).join("\n")
    const displayStatus = quote?.expiredAt && quote.status !== "SIGNED" ? "EXPIRED" : quote?.status
    const quoteStageOptions = getWorkflowStageOptions("quotes", workflowConfig)
    const rawQuoteStatusLabel = quote?.expiredAt && quote.status !== "SIGNED"
        ? "Expired"
        : getWorkflowStatusLabel("quotes", quote?.status, quote?.workflowStageKey, workflowConfig, complianceWorkflows)
    const quoteStatusLabel = quote?.status === "SIGNED" && rawQuoteStatusLabel === "Signed" ? "Accepted" : rawQuoteStatusLabel
    const selectedCustomer = customers.find((c) => c.id === editForm.customerId)

    if (!canView) {
        return (
            <PageContainer>
                <GlassCard>
                    <GlassCardHeader>
                        <GlassCardTitle>Quote Details</GlassCardTitle>
                    </GlassCardHeader>
                    <GlassCardContent>You do not have access to view quotes.</GlassCardContent>
                </GlassCard>
            </PageContainer>
        )
    }

    if (!quote) {
        return (
            <PageContainer>
                <div className="text-center p-12">Quote not found</div>
                <ErrorToast error={error} onClear={() => setError(null)} />
            </PageContainer>
        )
    }

    const saveQuoteChanges = async (sendAfterSave: boolean) => {
        if (!canManage) {
            toast({
                title: "Insufficient permissions",
                description: "You can view quotes but cannot edit them.",
                variant: "error"
            })
            return
        }
        const nextErrors: { projectName?: string; items?: string } = {}
        const nextItemErrors: Record<string, { description?: string; quantity?: string; unitPrice?: string }> = {}
        if (!editForm.projectName.trim()) nextErrors.projectName = "Project name is required."
        if (editItems.length === 0) nextErrors.items = "Add at least one line item."
        editItems.forEach((item) => {
            const itemError: { description?: string; quantity?: string; unitPrice?: string } = {}
            if (!item.description.trim()) itemError.description = "Description required."
            if (!item.quantity || item.quantity <= 0) itemError.quantity = "Qty must be > 0."
            if (item.unitPrice < 0) itemError.unitPrice = "Price must be >= 0."
            if (Object.keys(itemError).length > 0) {
                nextItemErrors[item.id] = itemError
            }
        })
        setEditErrors(nextErrors)
        setEditItemErrors(nextItemErrors)
        if (Object.keys(nextErrors).length > 0 || Object.keys(nextItemErrors).length > 0) return

        const totals = calcTotals(editItems)
        try {
            setSavingMode(sendAfterSave ? "send" : "save")
            const res = await apiPut<any>(`/quotes/${quote.id}`, {
                title: editForm.projectName,
                customerId: editForm.customerId || undefined,
                siteId: editForm.siteId || undefined,
                validUntil: editForm.validUntil ? editForm.validUntil.toISOString() : undefined,
                notes: editForm.notes || undefined,
                termsAndConditions: editForm.terms || undefined,
                lineItems: editItems.map((item) => ({
                    description: item.description,
                    quantity: item.quantity,
                    unitPrice: item.unitPrice,
                    vatRate: item.taxRate
                })),
                total: totals.total
            })

            let finalData = res.data
            if (sendAfterSave) {
                const sentRes = await apiPost<any>(`/quotes/${quote.id}/send`)
                finalData = sentRes.data
            }

            setQuote((prev) => prev ? {
                ...prev,
                status: (finalData.status ?? prev.status)?.toString().toUpperCase(),
                sentAt: finalData.sentAt ?? prev.sentAt,
                clientId: finalData.customerId ?? editForm.customerId ?? prev.clientId,
                siteId: finalData.siteId ?? editForm.siteId ?? prev.siteId,
                siteName: finalData.siteName ?? customerSites.find((site) => site.id === editForm.siteId)?.name ?? prev.siteName,
                siteAddress: finalData.siteAddress ?? formatCustomerSiteAddress(customerSites.find((site) => site.id === editForm.siteId)) ?? prev.siteAddress,
                clientName: finalData.customerName ?? selectedCustomer?.name ?? prev.clientName,
                clientEmail: finalData.customerEmail ?? selectedCustomer?.email ?? prev.clientEmail,
                projectName: finalData.title ?? editForm.projectName,
                validUntil: finalData.validUntil ?? editForm.validUntil?.toISOString(),
                notes: finalData.notes ?? editForm.notes,
                termsAndConditions: finalData.termsAndConditions ?? editForm.terms,
                lineItems: editItems.map((item) => ({
                    id: item.id,
                    description: item.description,
                    quantity: item.quantity,
                    unitPrice: item.unitPrice,
                    taxRate: item.taxRate,
                    total: item.quantity * item.unitPrice
                })),
                subtotal: totals.subtotal,
                taxTotal: totals.taxTotal,
                total: totals.total
            } : prev)
            toast({
                title: sendAfterSave ? "Saved & Sent" : "Updated",
                description: sendAfterSave
                    ? "Quote updated and sent successfully."
                    : "Quote updated successfully.",
                variant: "success"
            })
            setEditOpen(false)
        } catch (err: any) {
            toast({
                title: sendAfterSave ? "Send Failed" : "Update Failed",
                description: err?.message ?? (sendAfterSave ? "Failed to send quote." : "Failed to update quote."),
                variant: "error"
            })
        } finally {
            setSavingMode(null)
        }
    }

    const downloadQuotePdf = async () => {
        try {
            setSendActionLoading("download")
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
        } finally {
            setSendActionLoading(null)
        }
    }

    const defaultQuoteEmailMessage = () =>
        `Please review the attached quote for ${quote.projectName}. You can open the secure link below to view, accept, and sign it.`

    const openSendEmailDialog = () => {
        setSendEmailForm({
            email: quote.clientEmail ?? "",
            message: defaultQuoteEmailMessage(),
            markAsSent: true
        })
        setSendOptionsOpen(false)
        setSendEmailOpen(true)
    }

    const handleSendQuoteEmail = async () => {
        if (!canManage) {
            toast({
                title: "Insufficient permissions",
                description: "You can view quotes but cannot send them.",
                variant: "error"
            })
            return
        }
        const email = sendEmailForm.email.trim()
        if (!email || !email.includes("@")) {
            toast({
                title: "Email Required",
                description: "Enter a valid recipient email before sending.",
                variant: "error"
            })
            return
        }
        try {
            setSendActionLoading("email")
            const response = await apiPost<any>(`/quotes/${quote.id}/send`, {
                email,
                message: sendEmailForm.message,
                markAsSent: sendEmailForm.markAsSent
            })
            const data = response.data
            setQuote((prev) => prev ? {
                ...prev,
                status: (data.status ?? prev.status)?.toString().toUpperCase(),
                sentAt: data.sentAt ?? prev.sentAt,
                clientEmail: data.customerEmail ?? data.recipientEmail ?? email,
                publicToken: data.publicToken ?? prev.publicToken,
                publicLink: data.publicLink ?? prev.publicLink,
                workflowStageKey: data.workflowStageKey ?? prev.workflowStageKey
            } : prev)
            toast({
                title: "Quote Sent",
                description: sendEmailForm.markAsSent
                    ? "Email sent and quote marked as sent."
                    : "Email sent without changing the quote status.",
                variant: "success"
            })
            setSendEmailOpen(false)
        } catch (err: any) {
            toast({
                title: "Send Failed",
                description: err?.message ?? "Failed to send quote email.",
                variant: "error"
            })
        } finally {
            setSendActionLoading(null)
        }
    }

    const handleCopyQuoteLink = async () => {
        try {
            setSendActionLoading("copy")
            const response = await apiPost<any>(`/quotes/${quote.id}/send`, {
                sendEmail: false,
                markAsSent: false
            })
            const data = response.data
            const publicLink = data.publicLink
            if (!publicLink) {
                throw new Error("Quote link was not returned by the server.")
            }
            await navigator.clipboard.writeText(publicLink)
            setQuote((prev) => prev ? {
                ...prev,
                publicToken: data.publicToken ?? prev.publicToken,
                publicLink
            } : prev)
            toast({
                title: "Link Copied",
                description: "Quote link copied to clipboard.",
                variant: "success"
            })
        } catch (err: any) {
            toast({
                title: "Copy Failed",
                description: err?.message ?? "Failed to copy quote link.",
                variant: "error"
            })
        } finally {
            setSendActionLoading(null)
        }
    }

    const openCreateJobDialog = () => {
        const quoteLineItems = quote.lineItems
            .filter((item) => String(item.description ?? "").trim())
            .map((item) => `- ${item.description}`)
            .filter(Boolean)
            .join("\n")
        setJobForm({
            title: "",
            customerId: quote.clientId ?? "",
            siteId: quote.siteId ?? "",
            location: quote.siteAddress ?? "",
            address: quote.siteAddress ? parseAddressValue(quote.siteAddress) : emptyAddressValue(),
            addressManuallyEdited: false,
            description: quoteLineItems,
            priority: "Medium",
            amount: String(Number(quote.total ?? 0)),
            scheduledAt: null,
            scheduledEndAt: null,
        })
        setJobErrors({})
        setCreateJobOpen(true)
    }

    const handleCreateJobFromQuote = async () => {
        if (!canManageJobs) {
            toast({
                title: "Insufficient permissions",
                description: "You can view quotes but cannot create jobs.",
                variant: "error"
            })
            return
        }
        const nextErrors: { title?: string; customerId?: string; siteId?: string; location?: string; scheduledEndAt?: string } = {}
        if (!jobForm.title.trim()) nextErrors.title = "Job title is required."
        if (!jobForm.customerId) nextErrors.customerId = "Please select a customer."
        if (sitesEnabled && !jobForm.siteId) nextErrors.siteId = "Please select a customer site."
        const formattedJobAddress = formatJobAddressForPayload(jobForm.address)
        if (!sitesEnabled && !formattedJobAddress) nextErrors.location = "Job location is required."
        if (jobForm.scheduledAt && jobForm.scheduledEndAt && jobForm.scheduledEndAt <= jobForm.scheduledAt) {
            nextErrors.scheduledEndAt = "End time must be after start time."
        }
        setJobErrors(nextErrors)
        if (Object.keys(nextErrors).length > 0) return

        try {
            setCreatingJob(true)
            const created = await apiPost<any>("/jobs", {
                title: jobForm.title,
                customerId: jobForm.customerId,
                siteId: jobForm.siteId || undefined,
                location: formattedJobAddress || jobForm.location || undefined,
                ...buildJobAddressPayload(jobForm.address),
                addressManuallyEdited: jobForm.addressManuallyEdited,
                description: jobForm.description || undefined,
                priority: jobForm.priority,
                amount: jobForm.amount ? Number(jobForm.amount) : undefined,
                scheduledAt: jobForm.scheduledAt ? jobForm.scheduledAt.toISOString() : undefined,
                scheduledEndAt: jobForm.scheduledEndAt ? jobForm.scheduledEndAt.toISOString() : undefined,
                sourceQuoteId: quote.id,
                leadId: quote.leadId,
            })
            const jobId = created.data?.id
            if (jobId) {
                await apiPut(`/quotes/${quote.id}`, { jobId })
                setQuote((prev) => prev ? { ...prev, jobId } : prev)
            }
            toast({
                title: "Job Created",
                description: "Accepted quote has been converted into a job.",
                variant: "success"
            })
            setCreateJobOpen(false)
            if (jobId) {
                router.push(`/admin/schedule/${jobId}`)
            }
        } catch (err: any) {
            toast({
                title: "Create Failed",
                description: err?.message ?? "Failed to create job from quote.",
                variant: "error"
            })
        } finally {
            setCreatingJob(false)
        }
    }

    return (
        <PageContainer>
            <div className="mb-6">
                <BrowserBackButton className="text-sm font-medium text-primary hover:text-primary-dark transition-colors inline-flex items-center gap-1 mb-4">
                    <ArrowLeft className="h-3 w-3" /> Back to Quotes
                </BrowserBackButton>

                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                    <div>
                        <h1 className="text-3xl font-bold tracking-tight text-foreground flex items-center gap-3">
                            Proposal {quote.quoteNumber}
                            <StatusBadge status={formatQuoteStatus(displayStatus)}>{quoteStatusLabel}</StatusBadge>
                        </h1>
                        <p className="text-muted-foreground mt-1 flex items-center gap-1.5 font-medium">
                            {quote.clientName} • {quote.projectName}
                        </p>
                        {quote.siteName ? (
                            <p className="text-xs text-muted-foreground mt-1">
                                Site: {quote.siteName}{quote.siteAddress ? ` • ${quote.siteAddress}` : ""}
                            </p>
                        ) : null}
                    </div>

                    <div className="flex items-center gap-2">
                        <Button
                            variant="outline"
                            className="gap-2 bg-white/40"
                            onClick={() => {
                                if (!canManage) {
                                    toast({
                                        title: "Insufficient permissions",
                                        description: "You can view quotes but cannot edit them.",
                                        variant: "error"
                                    })
                                    return
                                }
                                setEditForm({
                                    customerId: quote.clientId,
                                    siteId: quote.siteId ?? "",
                                    projectName: quote.projectName,
                                    validUntil: quote.validUntil ? new Date(quote.validUntil) : null,
                                    notes: quote.notes ?? "",
                                    terms: quote.termsAndConditions ?? ""
                                })
                                setEditItems(
                                    quote.lineItems.map((item, idx) => ({
                                        id: item.id ?? `${quote.id}-${idx}`,
                                        description: item.description ?? "",
                                        quantity: Number(item.quantity ?? 1),
                                        unitPrice: Number(item.unitPrice ?? 0),
                                        taxRate: Number(item.taxRate ?? 0)
                                    }))
                                )
                                setEditErrors({})
                                setEditItemErrors({})
                                setEditOpen(true)
                            }}
                            disabled={!canManage}
                        >
                            Edit Quote
                        </Button>
                        <Button
                            className="gap-2"
                            onClick={() => setSendOptionsOpen(true)}
                        >
                            <Send className="h-4 w-4" /> Share Quote
                        </Button>
                        {quote.status === "SIGNED" ? (
                            quote.jobId ? (
                                <Button className="gap-2" asChild>
                                    <Link href={`/admin/schedule/${quote.jobId}`}>
                                        <BriefcaseBusiness className="h-4 w-4" /> Open Job
                                    </Link>
                                </Button>
                            ) : (
                                <Button className="gap-2" onClick={openCreateJobDialog} disabled={!canManageJobs}>
                                    <BriefcaseBusiness className="h-4 w-4" /> Create Job
                                </Button>
                            )
                        ) : null}
                        {canManage && !quote.expiredAt && (
                            <div className="flex items-center gap-2">
                                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Status:</span>
                                <Select
                                    value={complianceWorkflows ? (quote.workflowStageKey ?? quote.status) : quote.status}
                                    onValueChange={async (selectedStageKey) => {
                                        try {
                                            const selectedStage = complianceWorkflows
                                                ? quoteStageOptions.find((stage) => stage.key === selectedStageKey) ?? null
                                                : null
                                            const newStatus = selectedStage?.baseStatus ?? selectedStageKey
                                            const updatePayload: any = { status: newStatus, workflowStageKey: selectedStage?.key }
                                            if (newStatus === 'SIGNED' && !quote.signedAt) {
                                                updatePayload.signedAt = new Date().toISOString()
                                            }
                                            await apiPut(`/quotes/${quote.id}`, updatePayload)
                                            setQuote((prev) => prev ? { ...prev, status: newStatus, workflowStageKey: selectedStage?.key ?? prev.workflowStageKey, signedAt: updatePayload.signedAt || prev.signedAt } : prev)
                                            toast({
                                                title: "Status Updated",
                                                description: `Quote status changed to ${selectedStage?.label ?? formatQuoteStatus(newStatus)}.`,
                                                variant: "success"
                                            })
                                        } catch (err: any) {
                                            toast({
                                                title: "Update Failed",
                                                description: err?.message ?? "Failed to update quote status.",
                                                variant: "error"
                                            })
                                        }
                                    }}
                                >
                                    <SelectTrigger className="w-[140px] h-9 bg-white/40">
                                        <SelectValue placeholder={quoteStatusLabel} />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {quoteStageOptions.map((stage) => (
                                            <SelectItem key={stage.key} value={complianceWorkflows ? stage.key : stage.baseStatus}>
                                                {stage.label}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        )}
                        <Button
                            variant="outline"
                            className="gap-2 bg-white/40 text-destructive"
                            onClick={() => {
                                if (!canManage) {
                                    toast({
                                        title: "Insufficient permissions",
                                        description: "You can view quotes but cannot delete them.",
                                        variant: "error"
                                    })
                                    return
                                }
                                setDeleteOpen(true)
                            }}
                            disabled={!canManage || quote.status === "SIGNED"}
                        >
                            Delete
                        </Button>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 space-y-6">
                    <div className="bg-white rounded-xl shadow-sm border border-glass-border p-8 min-h-[800px] relative overflow-hidden">
                        {/* PDF Preview Styling inside */}
                        <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 rounded-bl-[100px] -z-10" />

                        <div className="flex justify-between items-start mb-12">
                            <div>
                                {tenant?.logoUrl && !logoUnavailable ? (
                                    <img
                                        src={tenant.logoUrl}
                                        alt={`${tenantName} logo`}
                                        className="h-10 max-w-[220px] object-contain mb-4"
                                        onError={() => setLogoUnavailable(true)}
                                    />
                                ) : (
                                    <div className="min-h-10 max-w-[280px] px-3 py-2 bg-black/5 rounded flex items-center justify-center font-semibold text-primary mb-4 border border-black/10 text-sm">
                                        {tenantName}
                                    </div>
                                )}
                                <h3 className="text-sm font-semibold text-foreground">{tenantName}</h3>
                                {brandAddress && (
                                    <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                                        {brandAddress}
                                    </p>
                                )}
                            </div>
                            <div className="text-right">
                                <h2 className="text-4xl font-light text-primary tracking-tight mb-2">QUOTATION</h2>
                                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm text-left inline-grid">
                                    <span className="text-muted-foreground font-medium">Quote No:</span>
                                    <span className="font-semibold">{quote.quoteNumber}</span>
                                    <span className="text-muted-foreground font-medium">Date:</span>
                                    <span className="font-semibold">{new Date(quote.dateCreated).toLocaleDateString('en-GB')}</span>
                                    <span className="text-muted-foreground font-medium">Valid Until:</span>
                                    <span className="font-semibold">{validUntilDate.toLocaleDateString('en-GB')}</span>
                                </div>
                            </div>
                        </div>

                        <div className="mb-12">
                            <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-2">Prepared For</h3>
                            <p className="text-sm font-semibold">{quote.clientName}</p>
                            <p className="text-sm text-muted-foreground">{quote.clientEmail}</p>
                        </div>

                        <div className="mb-12">
                            <div className="w-full">
                                <div className="grid grid-cols-12 pb-2 border-b-2 border-primary/20 text-xs font-bold uppercase tracking-wider text-primary-dark">
                                    <div className="col-span-7">Description</div>
                                    <div className="col-span-2 text-center">Qty</div>
                                    <div className="col-span-3 text-right">Ext. Price</div>
                                </div>

                                <div className="py-2 space-y-2 min-h-[200px]">
                                    {quote.lineItems.map(item => (
                                        <div key={item.id} className="grid grid-cols-12 py-2 border-b border-black/5 text-sm">
                                            <div className="col-span-7 font-medium text-foreground">{item.description}</div>
                                            <div className="col-span-2 text-center text-muted-foreground">{item.quantity}</div>
                                            <div className="col-span-3 text-right font-semibold">
                                                £{Number(item.total ?? (Number(item.quantity ?? 0) * Number(item.unitPrice ?? 0))).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                            </div>
                                        </div>
                                    ))}
                                </div>

                                <div className="mt-4 flex justify-end">
                                    <div className="w-1/2 min-w-[250px] space-y-2">
                                        <div className="flex justify-between text-sm text-muted-foreground py-1">
                                            <span>Subtotal</span>
                                            <span>£{quote.subtotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                                        </div>
                                        <div className="flex justify-between text-sm text-muted-foreground py-1 border-b border-black/10 pb-2">
                                            <span>VAT (20%)</span>
                                            <span>£{quote.taxTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                                        </div>
                                        <div className="flex justify-between text-lg font-bold text-primary py-2">
                                            <span>Total (GBP)</span>
                                            <span>£{quote.total.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="space-y-6">
                            {quote.notes && (
                                <div>
                                    <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-1">Notes</h3>
                                    <p className="text-xs text-muted-foreground leading-relaxed">{quote.notes}</p>
                                </div>
                            )}
                            {quote.termsAndConditions && (
                                <div>
                                    <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-1">Terms & Conditions</h3>
                                    <p className="text-xs text-muted-foreground leading-relaxed">{quote.termsAndConditions}</p>
                                </div>
                            )}
                        </div>

                        {quote.status === 'SIGNED' && (
                            <div className="mt-12 pt-8 border-t border-black/10">
                                <div className="w-64">
                                    <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-2">Electronically Signed By</h3>
                                    {quote.signatureData ? (
                                        <div className="h-20 border border-black/10 rounded-md bg-white p-2 flex items-center justify-center">
                                            <img src={quote.signatureData} alt="Customer signature" className="h-16 object-contain" />
                                        </div>
                                    ) : (
                                        <div className="h-16 flex items-center">
                                            <span className="font-[cursive] text-3xl text-primary/80 transform -rotate-2">
                                                {quote.signedByName || quote.clientName}
                                            </span>
                                        </div>
                                    )}
                                    <div className="text-xs text-muted-foreground mt-1 border-t border-black/20 pt-1">
                                        Date: {quote.signedAt ? new Date(quote.signedAt).toLocaleDateString('en-GB') : new Date().toLocaleDateString('en-GB')}
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                <div className="space-y-6">
                    <GlassCard>
                        <GlassCardHeader>
                            <GlassCardTitle>Digital Signature</GlassCardTitle>
                        </GlassCardHeader>
                        <GlassCardContent>
                            {quote.status === 'SIGNED' ? (
                                <div className="flex flex-col items-center justify-center text-center p-4 bg-success/5 border border-success/20 rounded-lg">
                                    <CheckCircle className="h-8 w-8 text-emerald-600 mb-2" />
                                    <p className="font-semibold text-emerald-800 bg-emerald-100 px-3 py-1 rounded-md">Digitally Signed</p>
                                    {quote.signatureData ? (
                                        <div className="mt-3 w-full rounded-md border border-success/20 bg-white p-2 flex justify-center">
                                            <img src={quote.signatureData} alt="Client signature" className="h-20 object-contain" />
                                        </div>
                                    ) : null}
                                    {(quote.signedByName || quote.signedByEmail) ? (
                                        <p className="text-xs text-muted-foreground mt-2">
                                            Signed by {quote.signedByName || quote.clientName}{quote.signedByEmail ? ` (${quote.signedByEmail})` : ""}
                                        </p>
                                    ) : null}
                                    <p className="text-xs text-muted-foreground mt-1">Legally binding signature captured on {quote.signedAt ? new Date(quote.signedAt).toLocaleDateString() : new Date().toLocaleDateString()}</p>
                                </div>
                            ) : quote.expiredAt ? (
                                <div className="flex flex-col items-center justify-center text-center p-4 bg-warning/10 border border-warning/20 rounded-lg">
                                    <CheckCircle className="h-8 w-8 text-amber-700 mb-2" />
                                    <p className="font-semibold text-amber-800 bg-amber-100 px-3 py-1 rounded-md">Quote Expired</p>
                                    <p className="text-xs text-muted-foreground mt-2 px-4">
                                        Validity ended on {new Date(quote.expiredAt).toLocaleDateString('en-GB')}. Extend valid until and resend if needed.
                                    </p>
                                </div>
                            ) : (
                                <div className="flex flex-col items-center justify-center text-center p-4 bg-black/5 border border-glass-border border-dashed rounded-lg">
                                    <PenTool className="h-8 w-8 text-muted-foreground opacity-50 mb-2" />
                                    <p className="text-sm font-medium text-muted-foreground">Awaiting Signature</p>
                                    <p className="text-xs text-muted-foreground mt-1 px-4">Client has not yet signed this proposal electronically.</p>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        className="mt-4 w-full bg-white/50"
                                        onClick={async () => {
                                            try {
                                                await apiPost(`/quotes/${quote.id}/send`)
                                                toast({
                                                    title: "Reminder Sent",
                                                    description: "Reminder email sent to client.",
                                                    variant: "success"
                                                })
                                            } catch (err: any) {
                                                toast({
                                                    title: "Reminder Failed",
                                                    description: err?.message ?? "Failed to send reminder.",
                                                    variant: "error"
                                                })
                                            }
                                        }}
                                    >
                                        Send Reminder
                                    </Button>
                                </div>
                            )}
                        </GlassCardContent>
                    </GlassCard>

                    <GlassCard>
                        <GlassCardHeader className="pb-3">
                            <GlassCardTitle>Activity Log</GlassCardTitle>
                        </GlassCardHeader>
                        <GlassCardContent>
                            <div className="space-y-4 relative before:absolute before:inset-0 before:ml-2 before:-translate-x-px before:h-full before:w-0.5 before:bg-gradient-to-b before:from-primary/20 before:to-transparent">

                                {quote.signedAt && (
                                    <div className="relative flex items-start gap-4">
                                        <div className="absolute left-0 top-1 w-4 h-4 rounded-full bg-success border-2 border-background shadow-sm z-10" />
                                        <div className="ml-6 w-full">
                                            <p className="text-sm font-semibold">Quote Accepted & Signed</p>
                                            <p className="text-xs text-muted-foreground">{new Date(quote.signedAt).toLocaleString()}</p>
                                        </div>
                                    </div>
                                )}

                                {quote.viewedAt && (
                                    <div className="relative flex items-start gap-4">
                                        <div className="absolute left-0 top-1 w-4 h-4 rounded-full bg-primary/40 border-2 border-background shadow-sm z-10" />
                                        <div className="ml-6 w-full">
                                            <p className="text-sm font-semibold">Viewed by Client</p>
                                            <p className="text-xs text-muted-foreground">{new Date(quote.viewedAt).toLocaleString()}</p>
                                        </div>
                                    </div>
                                )}

                                {quote.sentAt && (
                                    <div className="relative flex items-start gap-4">
                                        <div className="absolute left-0 top-1 w-4 h-4 rounded-full bg-primary/40 border-2 border-background shadow-sm z-10" />
                                        <div className="ml-6 w-full">
                                            <p className="text-sm font-semibold">Sent to Client</p>
                                            <p className="text-xs text-muted-foreground">{new Date(quote.sentAt).toLocaleString()}</p>
                                        </div>
                                    </div>
                                )}
                                {quote.expiredAt && (
                                    <div className="relative flex items-start gap-4">
                                        <div className="absolute left-0 top-1 w-4 h-4 rounded-full bg-warning border-2 border-background shadow-sm z-10" />
                                        <div className="ml-6 w-full">
                                            <p className="text-sm font-semibold">Quote Expired</p>
                                            <p className="text-xs text-muted-foreground">{new Date(quote.expiredAt).toLocaleString()}</p>
                                        </div>
                                    </div>
                                )}

                                <div className="relative flex items-start gap-4">
                                    <div className="absolute left-0 top-1 w-4 h-4 rounded-full bg-primary border-2 border-background shadow-sm z-10" />
                                    <div className="ml-6 w-full">
                                        <p className="text-sm font-semibold">Draft Created</p>
                                        <p className="text-xs text-muted-foreground">{new Date(quote.dateCreated).toLocaleDateString()} by System Admin</p>
                                    </div>
                                </div>

                            </div>
                        </GlassCardContent>
                    </GlassCard>
                </div>
            </div>
            <GlassModal
                open={sendOptionsOpen}
                onOpenChange={setSendOptionsOpen}
                title="Share Quote"
                description="Choose how you want to share this quote with the client."
                footer={
                    <div className="flex justify-end gap-2 w-full">
                        <Button variant="outline" onClick={() => setSendOptionsOpen(false)}>Close</Button>
                    </div>
                }
            >
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <button
                        type="button"
                        className="rounded-2xl border border-glass-border bg-white/60 p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:bg-white hover:shadow-md"
                        onClick={openSendEmailDialog}
                        disabled={!canManage}
                    >
                        <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                            <Mail className="h-5 w-5" />
                        </div>
                        <p className="font-semibold text-foreground">Send email to client</p>
                        <p className="mt-1 text-sm text-muted-foreground">
                            {quote.clientEmail ? `Prefilled with ${quote.clientEmail}.` : "Enter the client email before sending."}
                        </p>
                    </button>
                    <div className="rounded-2xl border border-glass-border bg-white/60 p-4 shadow-sm">
                        <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-black/5 text-foreground">
                            <Link2 className="h-5 w-5" />
                        </div>
                        <p className="font-semibold text-foreground">Download PDF or copy link</p>
                        <p className="mt-1 text-sm text-muted-foreground">Share manually without sending an email from Pipstack.</p>
                        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                            <Button
                                type="button"
                                variant="outline"
                                className="gap-2 bg-white/60"
                                onClick={downloadQuotePdf}
                                disabled={sendActionLoading !== null}
                            >
                                <Download className="h-4 w-4" />
                                {sendActionLoading === "download" ? "Downloading..." : "Download PDF"}
                            </Button>
                            <Button
                                type="button"
                                variant="outline"
                                className="gap-2 bg-white/60"
                                onClick={handleCopyQuoteLink}
                                disabled={!canManage || sendActionLoading !== null}
                            >
                                <Copy className="h-4 w-4" />
                                {sendActionLoading === "copy" ? "Copying..." : "Copy Link"}
                            </Button>
                        </div>
                    </div>
                </div>
            </GlassModal>
            <GlassModal
                open={sendEmailOpen}
                onOpenChange={setSendEmailOpen}
                title="Send Quote Email"
                description="Review the recipient and email body before sending."
                footer={
                    <div className="flex justify-end gap-2 w-full">
                        <Button variant="outline" onClick={() => setSendEmailOpen(false)}>Cancel</Button>
                        <Button
                            className="gap-2"
                            onClick={handleSendQuoteEmail}
                            disabled={!canManage || sendActionLoading !== null}
                        >
                            <Send className="h-4 w-4" />
                            {sendActionLoading === "email" ? "Sending..." : "Send Email"}
                        </Button>
                    </div>
                }
            >
                <div className="space-y-4">
                    <div className="space-y-2">
                        <Label required>Client Email</Label>
                        <Input
                            type="email"
                            className="bg-white/60"
                            placeholder="client@example.com"
                            value={sendEmailForm.email}
                            onChange={(e) => setSendEmailForm((prev) => ({ ...prev, email: e.target.value }))}
                        />
                    </div>
                    <div className="space-y-2">
                        <Label optional>Email Body</Label>
                        <Textarea
                            rows={6}
                            className="bg-white/60"
                            value={sendEmailForm.message}
                            onChange={(e) => setSendEmailForm((prev) => ({ ...prev, message: e.target.value }))}
                        />
                        <p className="text-xs text-muted-foreground">
                            The secure quote link button is added automatically below this message.
                        </p>
                    </div>
                    <label className="flex items-start gap-3 rounded-xl border border-glass-border bg-white/40 p-3 text-sm">
                        <Checkbox
                            checked={sendEmailForm.markAsSent}
                            onCheckedChange={(checked) => setSendEmailForm((prev) => ({ ...prev, markAsSent: Boolean(checked) }))}
                        />
                        <span>
                            <span className="block font-medium text-foreground">Mark quote status as sent</span>
                            <span className="block text-xs text-muted-foreground">
                                Enabled by default. Turn this off if you are only testing or do not want the quote pipeline status changed.
                            </span>
                        </span>
                    </label>
                </div>
            </GlassModal>
            <GlassModal
                open={editOpen}
                onOpenChange={setEditOpen}
                title="Edit Quote"
                description="Update quote details and line items."
                footer={
                    <div className="flex justify-end gap-2 w-full">
                        <Button variant="outline" onClick={() => setEditOpen(false)}>Cancel</Button>
                        <Button
                            variant="outline"
                            onClick={() => void saveQuoteChanges(false)}
                            disabled={!canManage || savingMode !== null}
                        >
                            {savingMode === "save" ? "Saving..." : "Save Changes"}
                        </Button>
                        <Button
                            onClick={() => void saveQuoteChanges(true)}
                            disabled={!canManage || savingMode !== null}
                        >
                            {savingMode === "send" ? "Sending..." : "Save & Send"}
                        </Button>
                    </div>
                }
            >
                <div className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label optional>Client</Label>
                            <Select
                                value={editForm.customerId || "__none__"}
                                createOption={{ label: "customer", href: "/admin/customers?create=customer" }}
                                onValueChange={(value) =>
                                    setEditForm((prev) => ({ ...prev, customerId: value === "__none__" ? "" : value, siteId: "" }))
                                }
                            >
                                <SelectTrigger className="w-full bg-white/60">
                                    <SelectValue placeholder="No linked customer" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="__none__">No linked customer (use quote recipient)</SelectItem>
                                    {customers.map((customer) => (
                                        <SelectItem key={customer.id} value={customer.id}>{customer.name}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            <p className="text-xs text-muted-foreground">
                                Keep this empty to send quote directly to lead recipient email.
                            </p>
                        </div>
                        {sitesEnabled ? <div className="space-y-2">
                            <Label optional>Customer Site</Label>
                            <Select
                                value={editForm.siteId || "__none__"}
                                createOption={editForm.customerId ? { label: "site", href: `/admin/customers/${editForm.customerId}?create=site` } : undefined}
                                onValueChange={(value) => setEditForm((prev) => ({ ...prev, siteId: value === "__none__" ? "" : value }))}
                                disabled={!editForm.customerId}
                            >
                                <SelectTrigger className="w-full bg-white/60">
                                    <SelectValue placeholder={editForm.customerId ? "Select site (optional)" : "Select customer first"} />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="__none__">No linked site</SelectItem>
                                    {customerSites.map((site) => (
                                        <SelectItem key={site.id} value={site.id}>{formatCustomerSiteLabel(site)}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            <p className="text-xs text-muted-foreground">
                                {editForm.siteId
                                    ? formatCustomerSiteAddress(customerSites.find((site) => site.id === editForm.siteId)) || "No address saved for this site."
                                    : "Optional, but recommended when the quote belongs to a specific site."}
                            </p>
                        </div> : null}
                        <div className="space-y-2">
                            <Label required>Project Name</Label>
                            <Input
                                className={editErrors.projectName ? "border-destructive focus-visible:ring-destructive/50" : ""}
                                value={editForm.projectName}
                                onChange={(e) => setEditForm((prev) => ({ ...prev, projectName: e.target.value }))}
                            />
                            {editErrors.projectName && <p className="text-xs text-destructive">{editErrors.projectName}</p>}
                        </div>
                        <div className="space-y-2">
                            <Label optional>Valid Until</Label>
                            <DatePicker
                                selected={editForm.validUntil}
                                onChange={(date: Date | null) => setEditForm((prev) => ({ ...prev, validUntil: date }))}
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
                        {editItems.map((item) => (
                            <div key={item.id} className="grid grid-cols-1 md:grid-cols-12 gap-4 items-start md:items-center bg-white/30 p-3 rounded-lg border border-glass-border">
                                <div className="md:col-span-6 space-y-1">
                                    <Label required className="md:hidden text-xs text-muted-foreground">Description</Label>
                                    <Input
                                        placeholder="Item description..."
                                        className={`bg-white/60 h-9 ${editItemErrors[item.id]?.description ? "border-destructive focus-visible:ring-destructive/50" : ""}`}
                                        value={item.description}
                                        onChange={(e) => setEditItems((prev) => prev.map((li) => li.id === item.id ? { ...li, description: e.target.value } : li))}
                                    />
                                    {editItemErrors[item.id]?.description && <p className="text-xs text-destructive">{editItemErrors[item.id]?.description}</p>}
                                </div>
                                <div className="grid grid-cols-3 md:col-span-5 gap-4">
                                    <div className="space-y-1">
                                        <Label required className="md:hidden text-xs text-muted-foreground">Qty</Label>
                                        <Input
                                            type="number"
                                            min="1"
                                            className={`bg-white/60 h-9 text-center ${editItemErrors[item.id]?.quantity ? "border-destructive focus-visible:ring-destructive/50" : ""}`}
                                            value={item.quantity}
                                            onChange={(e) => setEditItems((prev) => prev.map((li) => li.id === item.id ? { ...li, quantity: parseInt(e.target.value) || 0 } : li))}
                                        />
                                        {editItemErrors[item.id]?.quantity && <p className="text-xs text-destructive">{editItemErrors[item.id]?.quantity}</p>}
                                    </div>
                                    <div className="space-y-1 col-span-2">
                                        <Label required className="md:hidden text-xs text-muted-foreground">Unit Price</Label>
                                        <Input
                                            type="number"
                                            min="0"
                                            step="0.01"
                                            className={`bg-white/60 h-9 text-right ${editItemErrors[item.id]?.unitPrice ? "border-destructive focus-visible:ring-destructive/50" : ""}`}
                                            value={item.unitPrice}
                                            onChange={(e) => setEditItems((prev) => prev.map((li) => li.id === item.id ? { ...li, unitPrice: parseFloat(e.target.value) || 0 } : li))}
                                        />
                                        {editItemErrors[item.id]?.unitPrice && <p className="text-xs text-destructive">{editItemErrors[item.id]?.unitPrice}</p>}
                                    </div>
                                </div>
                                <div className="md:col-span-1 flex justify-end md:justify-center">
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        onClick={() => setEditItems((prev) => prev.filter((li) => li.id !== item.id))}
                                        disabled={editItems.length === 1}
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
                            onClick={() => setEditItems((prev) => [...prev, { id: Math.random().toString(), description: "", quantity: 1, unitPrice: 0, taxRate: 20 }])}
                        >
                            <Plus className="h-4 w-4" /> Add Line Item
                        </Button>
                        {editErrors.items && <p className="text-xs text-destructive">{editErrors.items}</p>}
                    </div>

                    <div className="space-y-4">
                        <div className="space-y-2">
                            <Label optional>Notes</Label>
                            <Textarea
                                rows={3}
                                className="w-full bg-white/60 resize-none"
                                value={editForm.notes}
                                onChange={(e) => setEditForm((prev) => ({ ...prev, notes: e.target.value }))}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label optional>Terms</Label>
                            <Textarea
                                rows={3}
                                className="w-full bg-white/60 resize-none"
                                value={editForm.terms}
                                onChange={(e) => setEditForm((prev) => ({ ...prev, terms: e.target.value }))}
                            />
                        </div>
                    </div>
                </div>
            </GlassModal>

            <GlassModal
                open={createJobOpen}
                onOpenChange={setCreateJobOpen}
                title="Create Job from Accepted Quote"
                description="Prefilled from the accepted quote. Confirm customer, site, address, and schedule before creating the job."
                footer={
                    <div className="flex justify-end gap-2 w-full">
                        <Button variant="outline" onClick={() => setCreateJobOpen(false)}>Cancel</Button>
                        <Button onClick={handleCreateJobFromQuote} disabled={!canManageJobs || creatingJob}>
                            {creatingJob ? "Creating..." : "Create Job"}
                        </Button>
                    </div>
                }
            >
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                        <Label required>Job Title</Label>
                        <Input
                            value={jobForm.title}
                            className={`bg-white/60 ${jobErrors.title ? "border-destructive focus-visible:ring-destructive/50" : ""}`}
                            onChange={(e) => setJobForm((prev) => ({ ...prev, title: e.target.value }))}
                        />
                        {jobErrors.title && <p className="text-xs text-destructive">{jobErrors.title}</p>}
                    </div>
                    <div className="space-y-2">
                        <Label required>Customer</Label>
                        <Select
                            value={jobForm.customerId}
                            createOption={{
                                label: "customer",
                                href: "/admin/customers?create=customer",
                                onCreated: (created) => {
                                    const customer = created as any
                                    if (!customer?.id) return
                                    setCustomers((prev) => [customer, ...prev.filter((item) => item.id !== customer.id)])
                                    setJobForm((prev) => ({ ...prev, customerId: customer.id, siteId: "", location: "", address: emptyAddressValue(), addressManuallyEdited: false }))
                                },
                            }}
                            onValueChange={(value) => setJobForm((prev) => ({ ...prev, customerId: value, siteId: "", location: "", address: emptyAddressValue(), addressManuallyEdited: false }))}
                        >
                            <SelectTrigger className={`w-full bg-white/60 ${jobErrors.customerId ? "border-destructive focus-visible:ring-destructive/50" : ""}`}>
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
                    {sitesEnabled ? (
                        <div className="space-y-2">
                            <Label required>Customer Site</Label>
                            <Select
                                value={jobForm.siteId}
                                createOption={jobForm.customerId ? {
                                    label: "site",
                                    href: `/admin/customers/${jobForm.customerId}?create=site`,
                                    onCreated: (created) => {
                                        const site = created as CustomerSiteOption
                                        if (!site?.id) return
                                        setJobCustomerSites((prev) => [site, ...prev.filter((item) => item.id !== site.id)])
                                        const nextAddress = customerSiteToAddressValue(site)
                                        setJobForm((prev) => ({
                                            ...prev,
                                            siteId: site.id,
                                            address: nextAddress,
                                            addressManuallyEdited: false,
                                            location: formatJobAddressForPayload(nextAddress) || formatCustomerSiteAddress(site) || prev.location,
                                        }))
                                    },
                                } : undefined}
                                onValueChange={(value) => {
                                    const selectedSite = jobCustomerSites.find((site) => site.id === value)
                                    const nextAddress = selectedSite ? customerSiteToAddressValue(selectedSite) : jobForm.address
                                    setJobForm((prev) => ({
                                        ...prev,
                                        siteId: value,
                                        address: selectedSite ? nextAddress : prev.address,
                                        addressManuallyEdited: selectedSite ? false : prev.addressManuallyEdited,
                                        location: selectedSite ? formatJobAddressForPayload(nextAddress) || formatCustomerSiteAddress(selectedSite) || prev.location : prev.location,
                                    }))
                                }}
                                disabled={!jobForm.customerId}
                            >
                                <SelectTrigger className={`w-full bg-white/60 ${jobErrors.siteId ? "border-destructive focus-visible:ring-destructive/50" : ""}`}>
                                    <SelectValue placeholder={jobForm.customerId ? "Select site" : "Select customer first"} />
                                </SelectTrigger>
                                <SelectContent>
                                    {jobCustomerSites.map((site) => (
                                        <SelectItem key={site.id} value={site.id}>{formatCustomerSiteLabel(site)}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            {jobErrors.siteId && <p className="text-xs text-destructive">{jobErrors.siteId}</p>}
                        </div>
                    ) : null}
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
                        <Label optional>Amount</Label>
                        <Input
                            type="number"
                            min="0"
                            step="0.01"
                            value={jobForm.amount}
                            className="bg-white/60"
                            onChange={(e) => setJobForm((prev) => ({ ...prev, amount: e.target.value }))}
                        />
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
                        <Label optional>Start</Label>
                        <DatePicker
                            selected={jobForm.scheduledAt}
                            onChange={(date: Date | null) => setJobForm((prev) => ({ ...prev, scheduledAt: date }))}
                            showTimeSelect
                            timeFormat="HH:mm"
                            timeIntervals={15}
                            dateFormat="MMM d, yyyy h:mm aa"
                            className="h-9 w-full rounded-md border border-input bg-white/60 px-3 text-sm shadow-sm"
                            wrapperClassName="w-full"
                            placeholderText="Select start time"
                        />
                    </div>
                    <div className="space-y-2">
                        <Label optional>End</Label>
                        <DatePicker
                            selected={jobForm.scheduledEndAt}
                            onChange={(date: Date | null) => setJobForm((prev) => ({ ...prev, scheduledEndAt: date }))}
                            showTimeSelect
                            timeFormat="HH:mm"
                            timeIntervals={15}
                            dateFormat="MMM d, yyyy h:mm aa"
                            className={`h-9 w-full rounded-md border border-input bg-white/60 px-3 text-sm shadow-sm ${jobErrors.scheduledEndAt ? "border-destructive focus-visible:ring-destructive/50" : ""}`}
                            wrapperClassName="w-full"
                            placeholderText="Select end time"
                        />
                        {jobErrors.scheduledEndAt && <p className="text-xs text-destructive">{jobErrors.scheduledEndAt}</p>}
                    </div>
                    <div className="space-y-2 md:col-span-2">
                        <Label optional>Description</Label>
                        <Textarea
                            rows={4}
                            value={jobForm.description}
                            className="bg-white/60"
                            onChange={(e) => setJobForm((prev) => ({ ...prev, description: e.target.value }))}
                        />
                    </div>
                </div>
            </GlassModal>

            <GlassModal
                open={deleteOpen}
                onOpenChange={setDeleteOpen}
                title="Delete Quote?"
                description={quote.status === "SIGNED" ? "Accepted quotes cannot be deleted." : "This will permanently remove the quote."}
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
                                if (quote.status === "SIGNED") {
                                    toast({
                                        title: "Cannot Delete",
                                        description: "Accepted quotes cannot be deleted.",
                                        variant: "error"
                                    })
                                    return
                                }
                                try {
                                    await apiDelete(`/quotes/${quote.id}`, { confirmed: true })
                                    toast({
                                        title: "Deleted",
                                        description: "Quote removed.",
                                        variant: "success"
                                    })
                                    router.push("/admin/quotes")
                                } catch (err: any) {
                                    toast({
                                        title: "Delete Failed",
                                        description: err?.message ?? "Failed to delete quote.",
                                        variant: "error"
                                    })
                                } finally {
                                    setDeleteOpen(false)
                                }
                            }}
                        disabled={!canManage || quote.status === "SIGNED"}>
                            Delete
                        </Button>
                    </div>
                }
            />
            <ErrorToast error={error} onClear={() => setError(null)} />
        </PageContainer>
    )
}

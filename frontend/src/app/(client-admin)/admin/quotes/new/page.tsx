"use client"

import { useEffect, useState } from "react"
import { PageContainer } from "@/components/layout/PageContainer"
import { GlassCard, GlassCardContent, GlassCardHeader, GlassCardTitle, GlassCardFooter } from "@/components/glass/GlassCard"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { ArrowLeft, Plus, Trash2, FileText, Send, Save } from "lucide-react"
import { apiPost } from "@/lib/api"
import { apiGet } from "@/lib/api"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ErrorToast } from "@/components/shared/ErrorToast"
import { useRouter, useSearchParams } from "next/navigation"
import { useToast } from "@/components/ui/toast"
import { getModulePermissions } from "@/lib/permission-ui"
import { useTenantFeatures } from "@/components/layout/TenantFeaturesContext"
import { CustomerSiteOption, fetchCustomerSites, formatCustomerSiteAddress, formatCustomerSiteLabel } from "@/lib/customer-sites"
import { BrowserBackButton } from "@/components/shared/BrowserBackButton"

interface LineItem {
    id: string
    description: string
    quantity: number
    unitPrice: number
    taxRate: number
}

export default function NewQuotePage() {
    const router = useRouter()
    const searchParams = useSearchParams()
    const { toast } = useToast()
    const { canView, canManage } = getModulePermissions("quotes.view", "quotes.manage")
    const { sites: sitesEnabled } = useTenantFeatures()
    const [clientName, setClientName] = useState("")
    const [customerId, setCustomerId] = useState("")
    const [customers, setCustomers] = useState<any[]>([])
    const [customerSites, setCustomerSites] = useState<CustomerSiteOption[]>([])
    const [siteId, setSiteId] = useState("")
    const [sourceJobId, setSourceJobId] = useState("")
    const [error, setError] = useState<string | null>(null)
    const [projectName, setProjectName] = useState("")
    const [validUntil, setValidUntil] = useState("")
    const [notes, setNotes] = useState("")
    const [terms, setTerms] = useState("Payment due within 14 days of invoice. Quotes valid for 30 days.")
    const [formErrors, setFormErrors] = useState<{ customerId?: string; projectName?: string; lineItems?: string }>({})
    const [itemErrors, setItemErrors] = useState<Record<string, { description?: string; quantity?: string; unitPrice?: string }>>({})
    const [lineItems, setLineItems] = useState<LineItem[]>([
        { id: '1', description: '', quantity: 1, unitPrice: 0, taxRate: 20 }
    ])

    useEffect(() => {
        const load = async () => {
            try {
                const res = await apiGet<any[]>(`/customers`)
                setCustomers(Array.isArray(res.data) ? res.data : [])
            } catch (err: any) {
                setError(err?.message ?? "Failed to load customers")
            }
        }
        load()
    }, [])

    useEffect(() => {
        const nextCustomerId = searchParams.get("customerId") ?? ""
        const nextSiteId = searchParams.get("siteId") ?? ""
        const nextJobId = searchParams.get("jobId") ?? ""

        if (nextCustomerId) setCustomerId(nextCustomerId)
        if (nextSiteId) setSiteId(nextSiteId)
        if (nextJobId) setSourceJobId(nextJobId)
    }, [searchParams])

    useEffect(() => {
        const loadSites = async () => {
            if (!sitesEnabled || !customerId) {
                setCustomerSites([])
                setSiteId("")
                return
            }
            try {
                const sites = await fetchCustomerSites(customerId)
                setCustomerSites(sites)
                setSiteId((prev) => (sites.some((site) => site.id === prev) ? prev : ""))
            } catch (err: any) {
                setError(err?.message ?? "Failed to load customer sites")
                setCustomerSites([])
                setSiteId("")
            }
        }
        void loadSites()
    }, [customerId, sitesEnabled])

    const addLineItem = () => {
        setLineItems([...lineItems, { id: Math.random().toString(), description: '', quantity: 1, unitPrice: 0, taxRate: 20 }])
    }

    const removeLineItem = (id: string) => {
        if (lineItems.length > 1) {
            setLineItems(lineItems.filter(item => item.id !== id))
        }
    }

    const updateLineItem = (id: string, field: keyof LineItem, value: any) => {
        setLineItems(lineItems.map(item =>
            item.id === id ? { ...item, [field]: value } : item
        ))
    }

    const subtotal = lineItems.reduce((acc, item) => acc + (item.quantity * item.unitPrice), 0)
    const taxTotal = lineItems.reduce((acc, item) => acc + ((item.quantity * item.unitPrice) * (item.taxRate / 100)), 0)
    const total = subtotal + taxTotal

    const validateForm = () => {
        const nextErrors: { customerId?: string; projectName?: string; lineItems?: string } = {}
        const nextItemErrors: Record<string, { description?: string; quantity?: string; unitPrice?: string }> = {}

        if (!customerId) {
            nextErrors.customerId = "Please select a client."
        }
        if (!projectName.trim()) {
            nextErrors.projectName = "Project name is required."
        }
        if (lineItems.length === 0) {
            nextErrors.lineItems = "Add at least one line item."
        }

        lineItems.forEach((item) => {
            const itemError: { description?: string; quantity?: string; unitPrice?: string } = {}
            if (!item.description.trim()) itemError.description = "Description required."
            if (!item.quantity || item.quantity <= 0) itemError.quantity = "Qty must be > 0."
            if (item.unitPrice < 0) itemError.unitPrice = "Price must be >= 0."
            if (Object.keys(itemError).length > 0) {
                nextItemErrors[item.id] = itemError
            }
        })

        setFormErrors(nextErrors)
        setItemErrors(nextItemErrors)
        return Object.keys(nextErrors).length === 0 && Object.keys(nextItemErrors).length === 0
    }

    if (!canView) {
        return (
            <PageContainer>
                <GlassCard>
                    <GlassCardHeader>
                        <GlassCardTitle>New Quote</GlassCardTitle>
                    </GlassCardHeader>
                    <GlassCardContent>You do not have access to view quotes.</GlassCardContent>
                </GlassCard>
            </PageContainer>
        )
    }

    if (!canManage) {
        return (
            <PageContainer>
                <GlassCard>
                    <GlassCardHeader>
                        <GlassCardTitle>New Quote</GlassCardTitle>
                    </GlassCardHeader>
                    <GlassCardContent>You do not have permission to create quotes.</GlassCardContent>
                </GlassCard>
            </PageContainer>
        )
    }

    return (
        <PageContainer>
            <div className="mb-6">
                <BrowserBackButton className="text-sm font-medium text-primary hover:text-primary-dark transition-colors inline-flex items-center gap-1 mb-4">
                    <ArrowLeft className="h-3 w-3" /> Back to Quotes
                </BrowserBackButton>

                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                    <div>
                        <h1 className="text-3xl font-bold tracking-tight text-foreground">Create New Quote</h1>
                        <p className="text-muted-foreground mt-1 text-sm">Draft a new proposal for a client.</p>
                    </div>

                    <div className="flex items-center gap-2">
                        <Button variant="outline" className="gap-2 bg-white/40"><FileText className="h-4 w-4" /> Preview PDF</Button>
                        <Button
                            variant="outline"
                            className="gap-2 bg-white/40"
                            onClick={async () => {
                                if (!validateForm()) return
                                try {
                                    const created = await apiPost<any>("/quotes", {
                                        title: projectName || "Quote",
                                        customerId,
                                        siteId: sitesEnabled ? siteId || undefined : undefined,
                                        jobId: sourceJobId || undefined,
                                        lineItems: lineItems.map((item) => ({
                                            description: item.description,
                                            quantity: item.quantity,
                                            unitPrice: item.unitPrice,
                                            vatRate: item.taxRate
                                        })),
                                        total,
                                        validUntil: validUntil ? new Date(validUntil).toISOString() : undefined,
                                        notes: notes || undefined,
                                        termsAndConditions: terms || undefined
                                    })
                                    toast({
                                        title: "Draft Saved",
                                        description: "Quote saved as draft.",
                                        variant: "success"
                                    })
                                    router.push(`/admin/quotes/${created.data.id}`)
                                } catch (err: any) {
                                    toast({
                                        title: "Save Failed",
                                        description: err?.message ?? "Failed to save quote.",
                                        variant: "error"
                                    })
                                }
                            }}
                        >
                            <Save className="h-4 w-4" /> Save Draft
                        </Button>
                        <Button
                            className="gap-2"
                            onClick={async () => {
                                if (!validateForm()) return
                                try {
                                    const created = await apiPost<any>("/quotes", {
                                        title: projectName || "Quote",
                                        customerId,
                                        siteId: siteId || undefined,
                                        jobId: sourceJobId || undefined,
                                        lineItems: lineItems.map((item) => ({
                                            description: item.description,
                                            quantity: item.quantity,
                                            unitPrice: item.unitPrice,
                                            vatRate: item.taxRate
                                        })),
                                        total,
                                        validUntil: validUntil ? new Date(validUntil).toISOString() : undefined,
                                        notes: notes || undefined,
                                        termsAndConditions: terms || undefined
                                    })
                                    await apiPost(`/quotes/${created.data.id}/send`)
                                    toast({
                                        title: "Sent",
                                        description: "Quote sent to client.",
                                        variant: "success"
                                    })
                                    router.push(`/admin/quotes/${created.data.id}`)
                                } catch (err: any) {
                                    toast({
                                        title: "Send Failed",
                                        description: err?.message ?? "Failed to send quote.",
                                        variant: "error"
                                    })
                                }
                            }}
                        >
                            <Send className="h-4 w-4" /> Send to Client
                        </Button>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 space-y-6">
                    <GlassCard>
                        <GlassCardHeader>
                            <GlassCardTitle>Client & Project Details</GlassCardTitle>
                        </GlassCardHeader>
                        <GlassCardContent className="space-y-4">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label required>Client / Lead</Label>
                                <Select
                                    value={customerId}
                                    createOption={{ label: "customer", href: "/admin/customers?create=customer" }}
                                    onValueChange={(value) => {
                                    setCustomerId(value)
                                    const selected = customers.find((c) => c.id === value)
                                    setClientName(selected?.name ?? "")
                                }}>
                                    <SelectTrigger className="w-full bg-white/50">
                                        <SelectValue placeholder="Select client" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {customers.map((customer) => (
                                            <SelectItem key={customer.id} value={customer.id}>{customer.name}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                {formErrors.customerId && <p className="text-xs text-destructive">{formErrors.customerId}</p>}
                            </div>
                            <div className="space-y-2">
                                <Label required>Project Name</Label>
                                <Input
                                    placeholder="e.g. Bathroom Renovation"
                                    className="bg-white/50"
                                    value={projectName}
                                    onChange={(e) => setProjectName(e.target.value)}
                                />
                                {formErrors.projectName && <p className="text-xs text-destructive">{formErrors.projectName}</p>}
                            </div>
                                {sitesEnabled ? <div className="space-y-2">
                                    <Label optional>Customer Site</Label>
                                    <Select
                                        value={siteId || "__none__"}
                                        createOption={customerId ? { label: "site", href: `/admin/customers/${customerId}?create=site` } : undefined}
                                        onValueChange={(value) => setSiteId(value === "__none__" ? "" : value)}
                                        disabled={!customerId}
                                    >
                                        <SelectTrigger className="w-full bg-white/50">
                                            <SelectValue placeholder={customerId ? "Select site (optional)" : "Select client first"} />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="__none__">No linked site</SelectItem>
                                            {customerSites.map((site) => (
                                                <SelectItem key={site.id} value={site.id}>{formatCustomerSiteLabel(site)}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                    <p className="text-xs text-muted-foreground">
                                        {siteId
                                            ? formatCustomerSiteAddress(customerSites.find((site) => site.id === siteId)) || "No address saved for this site."
                                            : "Optional, but recommended when the quote belongs to a specific site."}
                                    </p>
                                </div> : null}
                                <div className="space-y-2">
                                    <Label optional>Valid Until</Label>
                                    <Input type="date" className="bg-white/50" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} />
                                </div>
                                <div className="space-y-2">
                                    <Label optional>Quote Reference (Auto-generated)</Label>
                                    <Input value="Will be generated after save" disabled className="bg-white/30 text-muted-foreground" />
                                </div>
                            </div>
                        </GlassCardContent>
                    </GlassCard>

                    <GlassCard>
                        <GlassCardHeader>
                            <GlassCardTitle>Line Items</GlassCardTitle>
                        </GlassCardHeader>
                        <GlassCardContent className="space-y-4">
                            {/* Header row for larger screens */}
                            <div className="hidden md:grid grid-cols-12 gap-4 pb-2 border-b border-glass-border text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                                <div className="col-span-6">Description</div>
                                <div className="col-span-2 text-center">Qty</div>
                                <div className="col-span-2 text-right">Unit Price</div>
                                <div className="col-span-1 text-right">Tax</div>
                                <div className="col-span-1"></div>
                            </div>

                            <div className="space-y-3">
                                {lineItems.map((item, index) => (
                                    <div key={item.id} className="grid grid-cols-1 md:grid-cols-12 gap-4 items-start md:items-center bg-white/30 p-3 rounded-lg border border-glass-border">
                                        <div className="md:col-span-6 space-y-1">
                                            <Label required className="md:hidden text-xs">Description</Label>
                                            <Input
                                                placeholder="Item description..."
                                                className={`bg-white/60 h-9 ${itemErrors[item.id]?.description ? "border-destructive focus-visible:ring-destructive/50" : ""}`}
                                                value={item.description}
                                                onChange={(e) => updateLineItem(item.id, 'description', e.target.value)}
                                            />
                                            {itemErrors[item.id]?.description && <p className="text-xs text-destructive">{itemErrors[item.id]?.description}</p>}
                                        </div>

                                        <div className="grid grid-cols-3 md:col-span-5 gap-4">
                                            <div className="space-y-1">
                                                <Label required className="md:hidden text-xs">Qty</Label>
                                                <Input
                                                    type="number"
                                                    min="1"
                                                    className={`bg-white/60 h-9 text-center ${itemErrors[item.id]?.quantity ? "border-destructive focus-visible:ring-destructive/50" : ""}`}
                                                    value={item.quantity}
                                                    onChange={(e) => updateLineItem(item.id, 'quantity', parseInt(e.target.value) || 0)}
                                                />
                                                {itemErrors[item.id]?.quantity && <p className="text-xs text-destructive">{itemErrors[item.id]?.quantity}</p>}
                                            </div>

                                            <div className="space-y-1 col-span-2">
                                                <Label required className="md:hidden text-xs">Unit Price (£)</Label>
                                                <Input
                                                    type="number"
                                                    min="0"
                                                    step="0.01"
                                                    className={`bg-white/60 h-9 text-right ${itemErrors[item.id]?.unitPrice ? "border-destructive focus-visible:ring-destructive/50" : ""}`}
                                                    value={item.unitPrice}
                                                    onChange={(e) => updateLineItem(item.id, 'unitPrice', parseFloat(e.target.value) || 0)}
                                                />
                                                {itemErrors[item.id]?.unitPrice && <p className="text-xs text-destructive">{itemErrors[item.id]?.unitPrice}</p>}
                                            </div>
                                        </div>

                                        <div className="md:col-span-1 flex justify-end md:justify-center">
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                onClick={() => removeLineItem(item.id)}
                                                disabled={lineItems.length === 1}
                                                className="text-muted-foreground hover:text-destructive h-9 w-9"
                                            >
                                                <Trash2 className="h-4 w-4" />
                                            </Button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                            {formErrors.lineItems && <p className="text-xs text-destructive">{formErrors.lineItems}</p>}

                            <Button variant="outline" size="sm" onClick={addLineItem} className="gap-2 bg-white/40 mt-2 border-dashed w-full sm:w-auto">
                                <Plus className="h-4 w-4" /> Add Line Item
                            </Button>
                        </GlassCardContent>
                    </GlassCard>

                    <GlassCard>
                        <GlassCardHeader>
                            <GlassCardTitle>Notes & Terms</GlassCardTitle>
                        </GlassCardHeader>
                        <GlassCardContent className="space-y-4">
                            <div className="space-y-2">
                                <Label optional>Notes to Client</Label>
                                <Textarea
                                    placeholder="Thank you for your business..."
                                    className="bg-white/50 min-h-[100px]"
                                    value={notes}
                                    onChange={(e) => setNotes(e.target.value)}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label optional>Terms and Conditions</Label>
                                <Textarea
                                    placeholder="Standard T&Cs apply..."
                                    className="bg-white/50 min-h-[100px]"
                                    value={terms}
                                    onChange={(e) => setTerms(e.target.value)}
                                />
                            </div>
                        </GlassCardContent>
                    </GlassCard>
                </div>

                <div className="space-y-6">
                    <GlassCard className="sticky top-24">
                        <GlassCardHeader>
                            <GlassCardTitle>Quote Summary</GlassCardTitle>
                        </GlassCardHeader>
                        <GlassCardContent>
                            <div className="space-y-3">
                                <div className="flex justify-between text-sm text-muted-foreground">
                                    <span>Subtotal</span>
                                    <span>£{subtotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                                </div>
                                <div className="flex justify-between text-sm text-muted-foreground border-b border-glass-border pb-3">
                                    <span>VAT (20%)</span>
                                    <span>£{taxTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                                </div>
                                <div className="flex justify-between font-bold text-lg pt-1">
                                    <span>Total Gross</span>
                                    <span className="text-primary">£{total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                                </div>
                            </div>
                        </GlassCardContent>
                        <GlassCardFooter className="flex-col gap-2 pt-0">
                            <Button
                                className="w-full gap-2"
                                onClick={async () => {
                                    if (!validateForm()) return
                                    try {
                                        const created = await apiPost<any>("/quotes", {
                                            title: projectName || "Quote",
                                            customerId,
                                            siteId: siteId || undefined,
                                            jobId: sourceJobId || undefined,
                                            lineItems: lineItems.map((item) => ({
                                                description: item.description,
                                                quantity: item.quantity,
                                                unitPrice: item.unitPrice,
                                                vatRate: item.taxRate
                                            })),
                                            total
                                        })
                                        await apiPost(`/quotes/${created.data.id}/send`)
                                        toast({
                                            title: "Sent",
                                            description: "Quote sent to client.",
                                            variant: "success"
                                        })
                                        router.push(`/admin/quotes/${created.data.id}`)
                                    } catch (err: any) {
                                        toast({
                                            title: "Send Failed",
                                            description: err?.message ?? "Failed to send quote.",
                                            variant: "error"
                                        })
                                    }
                                }}
                            >
                                <Send className="h-4 w-4" /> Send Quote
                            </Button>
                            <Button variant="outline" className="w-full bg-white/40">Preview PDF</Button>
                        </GlassCardFooter>
                    </GlassCard>
                </div>
            </div>
            <ErrorToast error={error} onClear={() => setError(null)} />
        </PageContainer>
    )
}

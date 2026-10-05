"use client"

import { use, useEffect, useRef, useState } from "react"
import { PageContainer } from "@/components/layout/PageContainer"
import { GlassCard, GlassCardContent, GlassCardHeader, GlassCardTitle, GlassCardDescription } from "@/components/glass/GlassCard"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { apiGet, apiPost, downloadFile } from "@/lib/api"
import { getPortalToken } from "@/lib/auth"
import { ArrowLeft, Download, CheckCircle2, Eraser, FileSignature, AlertCircle } from "lucide-react"
import SignatureCanvas from 'react-signature-canvas'
import { ErrorToast } from "@/components/shared/ErrorToast"
import { BrowserBackButton } from "@/components/shared/BrowserBackButton"

type TenantProfile = {
    name?: string
    tradingName?: string
    logoUrl?: string
    address?: string
    contactEmail?: string
    contactPhone?: string
    vatNumber?: string
}

export default function PortalQuoteDetail({ params }: { params: Promise<{ id: string }> }) {
    const resolvedParams = use(params)
    const [quote, setQuote] = useState<any | null>(null)
    const [error, setError] = useState<string | null>(null)
    const [customerName, setCustomerName] = useState("")
    const [customerEmail, setCustomerEmail] = useState("")
    const [tenant, setTenant] = useState<TenantProfile | null>(null)
    const [logoUnavailable, setLogoUnavailable] = useState(false)

    const sigCanvas = useRef<SignatureCanvas>(null);
    const [signatureData, setSignatureData] = useState<string | null>(null);
    const [isAccepted, setIsAccepted] = useState(false);

    const portalToken = getPortalToken()

    useEffect(() => {
        if (!portalToken) return
        const load = async () => {
            try {
                const [quotesRes, profileRes] = await Promise.all([
                    apiGet<any[]>(`/portal/${portalToken}/quotes`),
                    apiGet<any>(`/portal/${portalToken}/profile`)
                ])
                const found = (quotesRes.data || []).find((q: any) => q.id === resolvedParams.id)
                setQuote(found || null)
                const normalizedStatus = String(found?.status ?? "").toUpperCase()
                setIsAccepted(normalizedStatus === "SIGNED")
                setSignatureData(found?.signatureData ?? null)
                const profileData: any = profileRes.data as any
                setCustomerName(profileData.customer?.name ?? profileData?.name ?? "")
                setCustomerEmail(profileData.customer?.email ?? profileData?.email ?? "")
                setTenant(profileData?.tenant ?? null)
                setLogoUnavailable(false)
                setError(null)
            } catch (err: any) {
                setError(err?.message ?? "Failed to load quote")
            }
        }
        load()
    }, [portalToken, resolvedParams.id])

    if (!quote) {
        return (
            <PageContainer>
                <div className="text-center p-12">Quote not found</div>
                <ErrorToast error={error} onClear={() => setError(null)} />
            </PageContainer>
        )
    }

    const clearSignature = () => {
        sigCanvas.current?.clear();
        setSignatureData(null);
    };

    const saveSignature = () => {
        if (sigCanvas.current?.isEmpty()) return;
        const dataUrl = sigCanvas.current?.getTrimmedCanvas().toDataURL('image/png');
        setSignatureData(dataUrl || null);
    };

    const handleAccept = async () => {
        if (!signatureData || !quote.publicToken) return
        try {
            const response = await apiPost<any>(`/public/quotes/${quote.publicToken}/sign`, {
                fullName: customerName,
                email: customerEmail,
                signatureData
            })
            const signed = response.data
            setIsAccepted(true)
            setSignatureData(signed?.signatureData ?? signatureData)
            setQuote({
                ...quote,
                ...signed,
                status: String(signed?.status ?? "SIGNED").toUpperCase(),
                signedAt: signed?.signedAt ?? new Date().toISOString(),
                signedByName: signed?.signedByName ?? customerName,
                signedByEmail: signed?.signedByEmail ?? customerEmail
            })
        } catch (err: any) {
            setError(err?.message ?? "Failed to accept quote")
        }
    }

    const handleDownload = async () => {
        if (!quote.publicToken) return
        const blob = await downloadFile(`/public/quotes/${quote.publicToken}/pdf`)
        const url = window.URL.createObjectURL(blob)
        const a = document.createElement("a")
        a.href = url
        a.download = `quote-${quote.quoteNumber ?? quote.publicToken}.pdf`
        a.click()
        window.URL.revokeObjectURL(url)
    }

    const subtotal = Array.isArray(quote.lineItems)
        ? quote.lineItems.reduce((acc: number, item: any) => acc + Number(item.unitPrice ?? 0) * Number(item.quantity ?? 0), 0)
        : 0
    const taxTotal = subtotal * 0.2
    const total = Number(quote.total ?? subtotal + taxTotal)

    const quoteNumber = quote.quoteNumber ?? "QT-PENDING"
    const storedSignature = signatureData || quote.signatureData || null
    const tenantName = tenant?.tradingName ?? tenant?.name ?? "Workspace"
    const tenantAddressLines = [tenant?.address, tenant?.contactEmail, tenant?.contactPhone].filter(Boolean)
    const vatText = tenant?.vatNumber ? `VAT: ${tenant.vatNumber}` : null
    const quoteTerms = String(quote.termsAndConditions ?? "").trim()

    return (
        <PageContainer>
            <div className="mb-6">
                <BrowserBackButton className="text-sm font-medium text-primary hover:text-primary-dark transition-colors inline-flex items-center gap-1 mb-4">
                    <ArrowLeft className="h-3 w-3" /> Back to Quotes
                </BrowserBackButton>
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                    <div>
                        <h1 className="text-3xl font-bold tracking-tight text-foreground">{quote.title ?? "Quote"}</h1>
                        <p className="text-muted-foreground mt-1 flex items-center gap-2">
                            Quote {quoteNumber} • Issued {new Date(quote.createdAt ?? Date.now()).toLocaleDateString()}
                        </p>
                        {quote.siteName ? (
                            <div className="mt-2 text-sm text-muted-foreground">
                                Site: {quote.siteName}{quote.siteReference ? ` • ${quote.siteReference}` : ""}
                                {quote.siteAddress ? ` • ${quote.siteAddress}` : ""}
                            </div>
                        ) : null}
                    </div>

                    <div className="flex items-center gap-2 w-full sm:w-auto">
                        <Button variant="outline" className="bg-white/40 gap-2" onClick={handleDownload}>
                            <Download className="h-4 w-4" /> Download PDF
                        </Button>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 space-y-6">
                    <GlassCard className="bg-white">
                        <GlassCardContent className="p-8">
                            {/* PDF-like Preview */}
                            <div className="flex justify-between items-start mb-12 border-b border-gray-200 pb-8">
                                <div>
                                    {tenant?.logoUrl && !logoUnavailable ? (
                                        <img
                                            src={tenant.logoUrl}
                                            alt={`${tenantName} logo`}
                                            className="h-12 max-w-[220px] object-contain mb-4"
                                            onError={() => setLogoUnavailable(true)}
                                        />
                                    ) : (
                                        <div className="min-h-12 max-w-[280px] px-3 py-2 rounded bg-black/5 flex items-center justify-center text-primary font-semibold mb-4 border border-black/10 text-sm">
                                            {tenantName}
                                        </div>
                                    )}
                                    <h2 className="font-bold text-lg text-foreground">{tenantName}</h2>
                                    {tenantAddressLines.map((line, idx) => (
                                        <p key={`${line}-${idx}`} className="text-sm text-muted-foreground">{line}</p>
                                    ))}
                                    {vatText && <p className="text-sm text-muted-foreground">{vatText}</p>}
                                </div>
                                <div className="text-right">
                                    <h2 className="text-3xl font-light text-muted-foreground mb-4">QUOTE</h2>
                                    <p className="text-sm font-semibold">Quote Reference: <span className="font-normal">{quoteNumber}</span></p>
                                    <p className="text-sm font-semibold">Date: <span className="font-normal">{new Date(quote.createdAt ?? Date.now()).toLocaleDateString()}</span></p>
                                    <p className="text-sm font-semibold">Valid Until: <span className="font-normal">30 days</span></p>
                                </div>
                            </div>

                            <div className="mb-12">
                                <h3 className="font-semibold text-sm text-muted-foreground uppercase mb-2">Quote For:</h3>
                                <p className="font-bold text-foreground">{customerName || "Customer"}</p>
                                <p className="text-sm text-foreground">Project: {quote.title ?? "Quote"}</p>
                                {quote.siteName ? (
                                    <div className="mt-4 rounded-2xl border border-gray-200 bg-slate-50 px-4 py-3 text-sm">
                                        <div className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Service Site</div>
                                        <div className="mt-1 font-semibold text-foreground">
                                            {quote.siteName}{quote.siteReference ? ` • ${quote.siteReference}` : ""}
                                        </div>
                                        {quote.siteAddress ? <div className="text-muted-foreground mt-1">{quote.siteAddress}</div> : null}
                                    </div>
                                ) : null}
                            </div>

                            <table className="w-full mb-8 text-sm">
                                <thead>
                                    <tr className="border-b-2 border-gray-200 text-left">
                                        <th className="pb-3 font-semibold text-muted-foreground uppercase">Description</th>
                                        <th className="pb-3 font-semibold text-muted-foreground uppercase text-center w-24">Qty</th>
                                        <th className="pb-3 font-semibold text-muted-foreground uppercase text-right w-32">Unit Price</th>
                                        <th className="pb-3 font-semibold text-muted-foreground uppercase text-right w-32">Amount</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {(quote.lineItems || []).map((item: any, index: number) => (
                                        <tr key={index}>
                                            <td className="py-4">
                                                <p className="font-medium text-foreground">{item.description}</p>
                                            </td>
                                            <td className="py-4 text-center text-foreground">{item.quantity}</td>
                                            <td className="py-4 text-right text-foreground">£{item.unitPrice.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                                            <td className="py-4 text-right font-medium text-foreground">£{(Number(item.unitPrice ?? 0) * Number(item.quantity ?? 0)).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>

                            <div className="flex justify-end mb-12">
                                <div className="w-64 space-y-3 text-sm">
                                    <div className="flex justify-between font-medium text-muted-foreground">
                                        <span>Subtotal</span>
                                        <span>£{subtotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                                    </div>
                                    <div className="flex justify-between font-medium text-muted-foreground">
                                        <span>VAT (20%)</span>
                                        <span>£{taxTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                                    </div>
                                    <div className="flex justify-between font-bold text-lg text-foreground border-t-2 border-gray-200 pt-3">
                                        <span>Total</span>
                                        <span>£{total.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                                    </div>
                                </div>
                            </div>
                        </GlassCardContent>
                    </GlassCard>
                </div>

                <div className="lg:col-span-1 space-y-6">
                    <GlassCard className={isAccepted ? "border-success/30 bg-success/5" : "border-primary/20"}>
                        <GlassCardHeader className={isAccepted ? "bg-success/10 pb-4 border-b border-success/20" : "bg-primary/5 pb-4 border-b border-primary/20"}>
                            <GlassCardTitle className={`text-lg flex items-center gap-2 ${isAccepted ? 'text-success-dark' : 'text-primary-dark'}`}>
                                {isAccepted ? <CheckCircle2 className="h-5 w-5" /> : <FileSignature className="h-5 w-5" />}
                                {isAccepted ? "Quote Accepted" : "Sign & Accept"}
                            </GlassCardTitle>
                            {!isAccepted && <GlassCardDescription>Please sign below to proceed.</GlassCardDescription>}
                        </GlassCardHeader>
                        <GlassCardContent className="pt-6">
                            {isAccepted ? (
                                <div className="space-y-4">
                                    {storedSignature ? (
                                        <div className="bg-white rounded-lg p-2 max-w-sm border border-glass-border flex justify-center">
                                            <img src={storedSignature} alt="Stored Signature" className="h-24 object-contain" />
                                        </div>
                                    ) : (
                                        <div className="bg-white rounded-lg p-3 border border-glass-border text-xs text-muted-foreground">Signature file unavailable.</div>
                                    )}
                                    <AlertCircle className="h-5 w-5 text-success inline-block mr-2" />
                                    <span className="text-sm font-medium text-success-dark">This quote is legally binding.</span>
                                </div>
                            ) : (
                                <div className="space-y-4">
                                    {signatureData ? (
                                        <div className="space-y-4">
                                            <div className="bg-white rounded-lg p-2 w-full border border-glass-border flex justify-center">
                                                <img src={signatureData} alt="Customer Signature" className="h-24 object-contain" />
                                            </div>
                                            <Button variant="outline" size="sm" onClick={() => setSignatureData(null)} className="text-destructive gap-2 border-destructive/20 hover:bg-destructive/10 w-full mb-2">
                                                <Eraser className="h-3 w-3" /> Clear Signature
                                            </Button>
                                            <div className="space-y-3">
                                                <Input
                                                    placeholder="Full name"
                                                    className="bg-white"
                                                    value={customerName}
                                                    onChange={(e) => setCustomerName(e.target.value)}
                                                />
                                                <Input
                                                    placeholder="Email"
                                                    type="email"
                                                    className="bg-white"
                                                    value={customerEmail}
                                                    onChange={(e) => setCustomerEmail(e.target.value)}
                                                />
                                            </div>
                                            <Button className="w-full bg-primary hover:bg-primary-dark text-white font-semibold" onClick={handleAccept} disabled={!customerName || !customerEmail}>
                                                Confirm & Accept Quote
                                            </Button>
                                        </div>
                                    ) : (
                                        <div className="space-y-4">
                                            <div className="border-2 border-dashed border-primary/30 rounded-xl bg-white overflow-hidden relative cursor-crosshair">
                                                <SignatureCanvas
                                                    ref={sigCanvas}
                                                    canvasProps={{ className: 'sigCanvas w-full h-[200px]' }}
                                                />
                                                <div className="absolute bottom-2 right-2 flex gap-2">
                                                    <Button variant="ghost" size="sm" onClick={clearSignature} className="bg-white/80 h-7 text-xs shadow-sm">Clear</Button>
                                                    <Button size="sm" onClick={saveSignature} className="bg-primary text-white h-7 text-xs shadow-sm shadow-primary/20">Save</Button>
                                                </div>
                                            </div>
                                            <p className="text-xs text-muted-foreground text-center">Sign inside the box to accept these terms.</p>
                                        </div>
                                    )}
                                </div>
                            )}
                        </GlassCardContent>
                    </GlassCard>

                    <GlassCard>
                        <GlassCardHeader>
                            <GlassCardTitle className="text-base">Terms & Conditions</GlassCardTitle>
                        </GlassCardHeader>
                        <GlassCardContent>
                            {quoteTerms ? (
                                <div className="text-xs text-muted-foreground whitespace-pre-wrap leading-relaxed max-h-[220px] overflow-y-auto pr-2 custom-scrollbar">
                                    {quoteTerms}
                                </div>
                            ) : (
                                <p className="text-xs text-muted-foreground">
                                    No specific terms and conditions have been added to this quote.
                                </p>
                            )}
                        </GlassCardContent>
                    </GlassCard>
                </div>
            </div>
            <ErrorToast error={error} onClear={() => setError(null)} />
        </PageContainer>
    )
}

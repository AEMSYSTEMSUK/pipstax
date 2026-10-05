"use client"

import { use, useEffect, useMemo, useRef, useState } from "react"
import SignatureCanvas from "react-signature-canvas"
import { PageContainer } from "@/components/layout/PageContainer"
import { GlassCard, GlassCardContent, GlassCardDescription, GlassCardHeader, GlassCardTitle } from "@/components/glass/GlassCard"
import { GlassModal } from "@/components/glass/GlassModal"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ErrorToast } from "@/components/shared/ErrorToast"
import { apiGet, apiPost, downloadFile } from "@/lib/api"
import { useToast } from "@/components/ui/toast"
import { CheckCircle2, Download, Eraser, FileSignature, LogIn } from "lucide-react"

type PublicQuotePayload = {
    id: string
    quoteNumber?: string
    title?: string
    createdAt?: string
    validUntil?: string
    lineItems?: Array<{ description?: string; quantity?: number; unitPrice?: number }>
    total?: number
    status?: string
    signatureData?: string
    signedAt?: string
    signedByName?: string
    signedByEmail?: string
    customerName?: string | null
    customerEmail?: string | null
    termsAndConditions?: string | null
    portalAccess?: {
        isOnboarded?: boolean
        loginLink?: string
    } | null
    tenantProfile?: {
        name?: string
        tradingName?: string
        logoUrl?: string
        address?: string
        contactEmail?: string
        contactPhone?: string
        vatNumber?: string
    } | null
}

const getErrorMessage = (error: unknown, fallback: string) => {
    if (error instanceof Error && error.message) {
        return error.message
    }
    if (typeof error === "object" && error !== null && "message" in error) {
        const message = (error as { message?: unknown }).message
        if (typeof message === "string" && message.trim()) {
            return message
        }
    }
    return fallback
}

export default function PublicQuotePage({ params }: { params: Promise<{ token: string }> }) {
    const resolvedParams = use(params)
    const { toast } = useToast()
    const sigCanvas = useRef<SignatureCanvas>(null)
    const [quote, setQuote] = useState<PublicQuotePayload | null>(null)
    const [signatureData, setSignatureData] = useState<string | null>(null)
    const [fullName, setFullName] = useState("")
    const [email, setEmail] = useState("")
    const [logoUnavailable, setLogoUnavailable] = useState(false)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [signing, setSigning] = useState(false)
    const [otpOpen, setOtpOpen] = useState(false)
    const [otpRequestId, setOtpRequestId] = useState("")
    const [otp, setOtp] = useState("")
    const [otpLoading, setOtpLoading] = useState(false)
    const [otpError, setOtpError] = useState<string | null>(null)
    const [otpExpiresAt, setOtpExpiresAt] = useState<string | null>(null)
    const [devOtp, setDevOtp] = useState<string | null>(null)
    const [resendAvailableAt, setResendAvailableAt] = useState<number | null>(null)
    const [resendSecondsLeft, setResendSecondsLeft] = useState(0)

    const token = resolvedParams.token
    const isSigned = String(quote?.status ?? "").toUpperCase() === "SIGNED"

    const loadQuote = async () => {
        setLoading(true)
        try {
            const response = await apiGet<PublicQuotePayload>(`/public/quotes/${token}`)
            const payload = response.data
            setQuote(payload)
            setFullName(payload.signedByName ?? payload.customerName ?? "")
            setEmail(payload.signedByEmail ?? payload.customerEmail ?? "")
            setSignatureData(payload.signatureData ?? null)
            setLogoUnavailable(false)
            setError(null)
        } catch (err: unknown) {
            setError(getErrorMessage(err, "Failed to load quote"))
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        loadQuote()
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [token])

    useEffect(() => {
        if (!resendAvailableAt) {
            setResendSecondsLeft(0)
            return
        }
        const tick = () => {
            const diff = Math.max(0, Math.ceil((resendAvailableAt - Date.now()) / 1000))
            setResendSecondsLeft(diff)
        }
        tick()
        const timer = setInterval(tick, 1000)
        return () => clearInterval(timer)
    }, [resendAvailableAt])

    const subtotal = useMemo(() => {
        if (!Array.isArray(quote?.lineItems)) return 0
        return quote.lineItems.reduce(
            (sum, item) => sum + Number(item.unitPrice ?? 0) * Number(item.quantity ?? 0),
            0
        )
    }, [quote?.lineItems])
    const vatTotal = subtotal * 0.2
    const total = Number(quote?.total ?? subtotal + vatTotal)
    const quoteNumber = quote?.quoteNumber ?? "QT-PENDING"
    const tenantName = quote?.tenantProfile?.tradingName ?? quote?.tenantProfile?.name ?? "Workspace"
    const tenantAddressLines = [
        quote?.tenantProfile?.address,
        quote?.tenantProfile?.contactEmail,
        quote?.tenantProfile?.contactPhone
    ].filter(Boolean) as string[]

    const clearSignature = () => {
        sigCanvas.current?.clear()
        setSignatureData(null)
    }

    const saveSignature = () => {
        if (!sigCanvas.current || sigCanvas.current.isEmpty()) {
            toast({ title: "Signature required", description: "Please sign before continuing.", variant: "error" })
            return
        }
        const dataUrl = sigCanvas.current.getTrimmedCanvas().toDataURL("image/png")
        setSignatureData(dataUrl)
    }

    const requestOtp = async () => {
        if (!quote || isSigned) return
        if (!signatureData) {
            toast({ title: "Signature required", description: "Please save signature first.", variant: "error" })
            return
        }
        if (!fullName.trim() || !email.trim()) {
            toast({ title: "Missing details", description: "Please provide your full name and email.", variant: "error" })
            return
        }
        setSigning(true)
        try {
            const response = await apiPost<{
                requestId: string
                email: string
                expiresAt: string
                authDetails?: { devOtp?: string }
            }>(`/public/quotes/${token}/sign/request-otp`, {
                fullName: fullName.trim(),
                email: email.trim(),
                signatureData,
            })
            setOtpRequestId(response.data.requestId)
            setOtp("")
            setOtpError(null)
            setOtpExpiresAt(response.data.expiresAt)
            setDevOtp(response.data?.authDetails?.devOtp ?? null)
            setResendAvailableAt(Date.now() + 60 * 1000)
            setOtpOpen(true)
            toast({ title: "OTP sent", description: "Enter the verification code sent to your email.", variant: "success" })
        } catch (err: unknown) {
            setError(getErrorMessage(err, "Failed to send verification OTP"))
        } finally {
            setSigning(false)
        }
    }

    const verifyOtp = async () => {
        if (!otpRequestId) return
        if (otp.length !== 6) {
            setOtpError("Please enter the 6-digit OTP.")
            return
        }
        setOtpLoading(true)
        setOtpError(null)
        try {
            const response = await apiPost<PublicQuotePayload>(`/public/quotes/${token}/sign/verify-otp`, {
                requestId: otpRequestId,
                code: otp,
            })
            setQuote(response.data)
            setSignatureData(response.data.signatureData ?? signatureData)
            setOtpOpen(false)
            setDevOtp(null)
            toast({
                title: "Quote signed",
                description: "Your signature has been verified and saved successfully.",
                variant: "success",
            })
        } catch (err: unknown) {
            setOtpError(getErrorMessage(err, "Invalid OTP"))
        } finally {
            setOtpLoading(false)
        }
    }

    const resendOtp = async () => {
        if (!otpRequestId || resendSecondsLeft > 0) return
        setOtpLoading(true)
        setOtpError(null)
        try {
            const response = await apiPost<{
                requestId: string
                expiresAt: string
                authDetails?: { devOtp?: string }
            }>(`/public/quotes/${token}/sign/resend-otp`, {
                requestId: otpRequestId,
            })
            setOtpExpiresAt(response.data.expiresAt)
            setDevOtp(response.data?.authDetails?.devOtp ?? null)
            setResendAvailableAt(Date.now() + 60 * 1000)
            toast({ title: "OTP resent", description: "A new verification code has been sent.", variant: "success" })
        } catch (err: unknown) {
            setOtpError(getErrorMessage(err, "Failed to resend OTP"))
        } finally {
            setOtpLoading(false)
        }
    }

    const handleDownload = async () => {
        try {
            const blob = await downloadFile(`/public/quotes/${token}/pdf`)
            const url = window.URL.createObjectURL(blob)
            const a = document.createElement("a")
            a.href = url
            a.download = `quote-${quote?.quoteNumber ?? token}.pdf`
            a.click()
            window.URL.revokeObjectURL(url)
        } catch (err: unknown) {
            setError(getErrorMessage(err, "Failed to download PDF"))
        }
    }

    if (loading) {
        return (
            <PageContainer>
                <div className="text-center p-12 text-muted-foreground">Loading quote...</div>
            </PageContainer>
        )
    }

    if (!quote) {
        return (
            <PageContainer>
                <div className="text-center p-12 text-muted-foreground">Quote not found.</div>
                <ErrorToast error={error} onClear={() => setError(null)} />
            </PageContainer>
        )
    }

    return (
        <PageContainer>
            <div className="mb-6">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                    <div>
                        <h1 className="text-3xl font-bold tracking-tight text-foreground">{quote.title ?? "Quote"}</h1>
                        <p className="text-muted-foreground mt-1">
                            Quote {quoteNumber} • Issued {new Date(quote.createdAt ?? Date.now()).toLocaleDateString("en-GB")}
                        </p>
                    </div>
                    <Button variant="outline" className="bg-white/40 gap-2" onClick={handleDownload}>
                        <Download className="h-4 w-4" /> Download PDF
                    </Button>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2">
                    <GlassCard className="bg-white">
                        <GlassCardContent className="p-8">
                            <div className="flex justify-between items-start mb-10 border-b border-gray-200 pb-8">
                                <div>
                                    {quote.tenantProfile?.logoUrl && !logoUnavailable ? (
                                        <img
                                            src={quote.tenantProfile.logoUrl}
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
                                    {quote?.tenantProfile?.vatNumber && (
                                        <p className="text-sm text-muted-foreground">VAT: {quote.tenantProfile.vatNumber}</p>
                                    )}
                                </div>
                                <div className="text-right">
                                    <h2 className="text-3xl font-light text-muted-foreground mb-4">QUOTE</h2>
                                    <p className="text-sm font-semibold">Quote Reference: <span className="font-normal">{quoteNumber}</span></p>
                                    <p className="text-sm font-semibold">Date: <span className="font-normal">{new Date(quote.createdAt ?? Date.now()).toLocaleDateString("en-GB")}</span></p>
                                    <p className="text-sm font-semibold">Valid Until: <span className="font-normal">{quote.validUntil ? new Date(quote.validUntil).toLocaleDateString("en-GB") : "30 days"}</span></p>
                                </div>
                            </div>

                            <div className="mb-10">
                                <h3 className="font-semibold text-sm text-muted-foreground uppercase mb-2">Quote For:</h3>
                                <p className="font-bold text-foreground">{quote.customerName || "Customer"}</p>
                                <p className="text-sm text-foreground">Project: {quote.title ?? "Quote"}</p>
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
                                    {(quote.lineItems || []).map((item, index) => (
                                        <tr key={index}>
                                            <td className="py-4"><p className="font-medium text-foreground">{item.description}</p></td>
                                            <td className="py-4 text-center text-foreground">{item.quantity}</td>
                                            <td className="py-4 text-right text-foreground">£{Number(item.unitPrice ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                                            <td className="py-4 text-right font-medium text-foreground">
                                                £{(Number(item.unitPrice ?? 0) * Number(item.quantity ?? 0)).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>

                            <div className="flex justify-end mb-8">
                                <div className="w-64 space-y-3 text-sm">
                                    <div className="flex justify-between font-medium text-muted-foreground">
                                        <span>Subtotal</span>
                                        <span>£{subtotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                                    </div>
                                    <div className="flex justify-between font-medium text-muted-foreground">
                                        <span>VAT (20%)</span>
                                        <span>£{vatTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
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
                    <GlassCard className={isSigned ? "border-success/30 bg-success/5" : "border-primary/20"}>
                        <GlassCardHeader className={isSigned ? "bg-success/10 pb-4 border-b border-success/20" : "bg-primary/5 pb-4 border-b border-primary/20"}>
                            <GlassCardTitle className={`text-lg flex items-center gap-2 ${isSigned ? "text-success-dark" : "text-primary-dark"}`}>
                                {isSigned ? <CheckCircle2 className="h-5 w-5" /> : <FileSignature className="h-5 w-5" />}
                                {isSigned ? "Quote Accepted" : "Sign & Accept"}
                            </GlassCardTitle>
                            {!isSigned && <GlassCardDescription>Sign the quote and verify with OTP.</GlassCardDescription>}
                        </GlassCardHeader>
                        <GlassCardContent className="pt-6">
                            {isSigned ? (
                                <div className="space-y-4">
                                    {quote.signatureData ? (
                                        <div className="bg-white rounded-lg p-2 max-w-sm border border-glass-border flex justify-center">
                                            <img src={quote.signatureData} alt="Signed signature" className="h-24 object-contain" />
                                        </div>
                                    ) : null}
                                    <p className="text-sm text-success-dark font-medium">
                                        Signed by {quote.signedByName || quote.customerName || "Customer"}{quote.signedByEmail ? ` (${quote.signedByEmail})` : ""}
                                    </p>
                                    <p className="text-xs text-muted-foreground">
                                        {quote.signedAt ? `Signed on ${new Date(quote.signedAt).toLocaleString()}` : "Quote signed"}
                                    </p>
                                    {quote.portalAccess?.isOnboarded && quote.portalAccess?.loginLink ? (
                                        <Button
                                            variant="outline"
                                            className="w-full sm:w-auto gap-2 bg-white/70"
                                            asChild
                                        >
                                            <a href={quote.portalAccess.loginLink} target="_blank" rel="noopener noreferrer">
                                                <LogIn className="h-4 w-4" /> Login To Customer Portal
                                            </a>
                                        </Button>
                                    ) : null}
                                </div>
                            ) : (
                                <div className="space-y-4">
                                    {!signatureData ? (
                                        <div className="space-y-4">
                                            <div className="border-2 border-dashed border-primary/30 rounded-xl bg-white overflow-hidden relative cursor-crosshair">
                                                <SignatureCanvas
                                                    ref={sigCanvas}
                                                    canvasProps={{ className: "sigCanvas w-full h-[200px]" }}
                                                />
                                                <div className="absolute bottom-2 right-2 flex gap-2">
                                                    <Button variant="ghost" size="sm" onClick={clearSignature} className="bg-white/80 h-7 text-xs shadow-sm">
                                                        Clear
                                                    </Button>
                                                    <Button size="sm" onClick={saveSignature} className="bg-primary text-white h-7 text-xs shadow-sm shadow-primary/20">
                                                        Save
                                                    </Button>
                                                </div>
                                            </div>
                                            <p className="text-xs text-muted-foreground text-center">Sign inside the box to continue.</p>
                                        </div>
                                    ) : (
                                        <div className="space-y-3">
                                            <div className="bg-white rounded-lg p-2 w-full border border-glass-border flex justify-center">
                                                <img src={signatureData} alt="Signature preview" className="h-24 object-contain" />
                                            </div>
                                            <Button variant="outline" size="sm" onClick={() => setSignatureData(null)} className="text-destructive gap-2 border-destructive/20 hover:bg-destructive/10 w-full">
                                                <Eraser className="h-3 w-3" /> Re-sign
                                            </Button>
                                        </div>
                                    )}

                                    <div className="space-y-3">
                                        <div className="space-y-1">
                                            <Label required>Full name</Label>
                                            <Input value={fullName} onChange={(e) => setFullName(e.target.value)} className="bg-white" placeholder="Enter your full name" />
                                        </div>
                                        <div className="space-y-1">
                                            <Label required>Email</Label>
                                            <Input
                                                type="email"
                                                value={email}
                                                readOnly
                                                className="bg-white/70 text-muted-foreground cursor-not-allowed"
                                                placeholder="Quote recipient email"
                                            />
                                            <p className="text-[11px] text-muted-foreground">
                                                Email is locked to the quote recipient for verification.
                                            </p>
                                        </div>
                                    </div>

                                    <Button className="w-full bg-primary hover:bg-primary-dark text-white font-semibold" onClick={requestOtp} disabled={signing}>
                                        {signing ? "Sending OTP..." : "Confirm & Continue"}
                                    </Button>
                                    {quote.portalAccess?.isOnboarded && quote.portalAccess?.loginLink ? (
                                        <Button
                                            variant="outline"
                                            className="w-full gap-2 bg-white/70"
                                            asChild
                                        >
                                            <a href={quote.portalAccess.loginLink} target="_blank" rel="noopener noreferrer">
                                                <LogIn className="h-4 w-4" /> Login To Customer Portal
                                            </a>
                                        </Button>
                                    ) : null}
                                </div>
                            )}
                        </GlassCardContent>
                    </GlassCard>

                    <GlassCard>
                        <GlassCardHeader>
                            <GlassCardTitle className="text-base">Terms & Conditions</GlassCardTitle>
                        </GlassCardHeader>
                        <GlassCardContent>
                            <div className="text-xs text-muted-foreground space-y-2 max-h-[220px] overflow-y-auto pr-2">
                                {quote.termsAndConditions?.trim() ? (
                                    <p className="whitespace-pre-wrap">{quote.termsAndConditions}</p>
                                ) : (
                                    <>
                                        <p>1. Validity: This quote is valid until the stated expiry date.</p>
                                        <p>2. Payment terms and scope are defined by the quote line items and tenant policy.</p>
                                        <p>3. Any accepted signature is treated as legally binding authorization.</p>
                                    </>
                                )}
                            </div>
                        </GlassCardContent>
                    </GlassCard>
                </div>
            </div>

            <GlassModal
                open={otpOpen}
                onOpenChange={(open) => {
                    if (!open) {
                        setOtpOpen(false)
                        setOtp("")
                        setOtpError(null)
                    }
                }}
                title="Verify Your Signature"
                description="Enter the 6-digit OTP sent to your email."
                footer={
                    <div className="flex items-center justify-between w-full gap-2">
                        <Button
                            type="button"
                            variant="outline"
                            className="bg-white/50"
                            onClick={resendOtp}
                            disabled={otpLoading || resendSecondsLeft > 0}
                        >
                            {resendSecondsLeft > 0 ? `Resend in ${resendSecondsLeft}s` : "Resend OTP"}
                        </Button>
                        <Button type="button" onClick={verifyOtp} disabled={otpLoading || otp.length < 6}>
                            {otpLoading ? "Verifying..." : "Verify & Sign Quote"}
                        </Button>
                    </div>
                }
            >
                <div className="space-y-4">
                    <div className="grid grid-cols-6 gap-2">
                        {Array.from({ length: 6 }).map((_, index) => (
                            <Input
                                key={index}
                                id={`quote-otp-${index}`}
                                inputMode="numeric"
                                maxLength={1}
                                value={otp[index] ?? ""}
                                onChange={(e) => {
                                    const digit = e.target.value.replace(/\D/g, "").slice(0, 1)
                                    const chars = otp.split("")
                                    chars[index] = digit
                                    const next = chars.join("").slice(0, 6)
                                    setOtp(next)
                                    if (digit && index < 5) {
                                        const nextInput = document.getElementById(`quote-otp-${index + 1}`)
                                        nextInput?.focus()
                                    }
                                }}
                                onKeyDown={(e) => {
                                    if (e.key === "Backspace" && !otp[index] && index > 0) {
                                        const prevInput = document.getElementById(`quote-otp-${index - 1}`)
                                        prevInput?.focus()
                                    }
                                }}
                                className="h-11 text-center text-lg font-semibold bg-white/70"
                            />
                        ))}
                    </div>
                    {otpExpiresAt ? (
                        <p className="text-xs text-muted-foreground">
                            OTP expires at {new Date(otpExpiresAt).toLocaleTimeString()}
                        </p>
                    ) : null}
                    {devOtp ? <p className="text-[11px] text-muted-foreground">Dev OTP: {devOtp}</p> : null}
                    {otpError ? <p className="text-xs text-destructive">{otpError}</p> : null}
                </div>
            </GlassModal>

            <ErrorToast error={error} onClear={() => setError(null)} />
        </PageContainer>
    )
}

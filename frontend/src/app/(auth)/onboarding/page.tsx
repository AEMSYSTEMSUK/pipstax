"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { GlassCard, GlassCardContent, GlassCardDescription, GlassCardFooter, GlassCardHeader, GlassCardTitle } from "@/components/glass/GlassCard"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { PasswordInput } from "@/components/ui/password-input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { apiPost } from "@/lib/api"
import { ErrorToast } from "@/components/shared/ErrorToast"
import { useToast } from "@/components/ui/toast"
import { buildTenantUrl } from "@/lib/workspace"

type OnboardingForm = {
    tenantName: string
    tradingName: string
    adminName: string
    adminEmail: string
    adminPassword: string
    primaryColor: string
    documentSyncProvider: "GOOGLE_DRIVE" | "SHAREPOINT"
    accountingProvider: "QUICKBOOKS" | "XERO" | ""
}

export default function OnboardingPage() {
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const { toast } = useToast()
    const [step, setStep] = useState<"form" | "otp">("form")
    const [otp, setOtp] = useState("")
    const [verification, setVerification] = useState<{ tenantId: string; email: string; subdomain?: string; devOtp?: string; expiresAt?: string } | null>(null)
    const [expirySecondsLeft, setExpirySecondsLeft] = useState(0)
    const [resendSecondsLeft, setResendSecondsLeft] = useState(0)
    const [resendAvailableAt, setResendAvailableAt] = useState<number | null>(null)
    const [form, setForm] = useState<OnboardingForm>({
        tenantName: "",
        tradingName: "",
        adminName: "",
        adminEmail: "",
        adminPassword: "",
        primaryColor: "#0E8585",
        documentSyncProvider: "GOOGLE_DRIVE",
        accountingProvider: ""
    })

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setError(null)
        if (!form.accountingProvider) {
            setError("Please select an accounting software.")
            return
        }
        setLoading(true)
        try {
            const res = await apiPost<{ tenantId: string; subdomain: string; email: string; devOtp?: string; expiresAt?: string }>("/auth/bootstrap", form)
            toast({
                title: "Workspace created",
                description: "We sent a verification code to your email.",
                variant: "success"
            })
            setVerification({ tenantId: res.data.tenantId, subdomain: res.data.subdomain, email: res.data.email, devOtp: res.data.devOtp, expiresAt: res.data.expiresAt })
            setResendAvailableAt(Date.now() + 60 * 1000)
            setStep("otp")
        } catch (err: any) {
            setError(err?.message ?? "Failed to create tenant")
        } finally {
            setLoading(false)
        }
    }

    const handleVerify = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!verification) return
        setError(null)
        setLoading(true)
        try {
            const res = await apiPost<{ token: string; tenantId: string; subdomain?: string }>(
                "/auth/verify-account-otp",
                { email: verification.email, code: otp }
            )
            toast({
                title: "Verified",
                description: "Redirecting you to your workspace...",
                variant: "success"
            })
            const target = buildTenantUrl(res.data.subdomain ?? verification.subdomain ?? "", "/common-login")
            const url = new URL(target, window.location.origin)
            url.searchParams.set("token", res.data.token)
            url.searchParams.set("tenantId", res.data.tenantId)
            url.pathname = "/onboarding/complete"
            setTimeout(() => {
                window.location.href = url.toString()
            }, 600)
        } catch (err: any) {
            setError(err?.message ?? "Invalid verification code")
        } finally {
            setLoading(false)
        }
    }

    const handleResend = async () => {
        if (!verification) return
        setError(null)
        setLoading(true)
        try {
            const res = await apiPost<{ tenantId: string; email: string; devOtp?: string; expiresAt?: string }>(
                "/auth/resend-account-otp",
                { email: verification.email }
            )
            toast({
                title: "Code sent",
                description: "A new OTP has been sent to your email.",
                variant: "success"
            })
            setOtp("")
            setVerification((prev) => prev ? { ...prev, devOtp: res.data.devOtp, expiresAt: res.data.expiresAt } : prev)
            setResendAvailableAt(Date.now() + 60 * 1000)
        } catch (err: any) {
            setError(err?.message ?? "Failed to resend OTP")
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        if (step !== "otp" || !verification?.expiresAt) return
        const update = () => {
            const end = new Date(verification.expiresAt as string).getTime()
            const diff = Math.max(0, Math.floor((end - Date.now()) / 1000))
            setExpirySecondsLeft(diff)
        }
        update()
        const id = setInterval(update, 1000)
        return () => clearInterval(id)
    }, [step, verification?.expiresAt])

    useEffect(() => {
        if (step !== "otp" || !resendAvailableAt) return
        const update = () => {
            const diff = Math.max(0, Math.floor((resendAvailableAt - Date.now()) / 1000))
            setResendSecondsLeft(diff)
        }
        update()
        const id = setInterval(update, 1000)
        return () => clearInterval(id)
    }, [step, resendAvailableAt])

    const formattedExpiry = useMemo(() => {
        const minutes = Math.floor(expirySecondsLeft / 60)
        const seconds = expirySecondsLeft % 60
        return `${minutes}:${seconds.toString().padStart(2, "0")}`
    }, [expirySecondsLeft])

    const formattedResend = useMemo(() => {
        const minutes = Math.floor(resendSecondsLeft / 60)
        const seconds = resendSecondsLeft % 60
        return `${minutes}:${seconds.toString().padStart(2, "0")}`
    }, [resendSecondsLeft])

    const maskedEmail = useMemo(() => {
        if (!verification?.email || !verification.email.includes("@")) return "your email"
        const [name, domain] = verification.email.split("@")
        return `${name.charAt(0)}***@${domain}`
    }, [verification?.email])

    return (
        <GlassCard className="w-full max-w-xl">
            <GlassCardHeader className="space-y-2 text-center">
                <GlassCardTitle className="text-2xl font-bold tracking-tight text-foreground">
                    {step === "form" ? "Create Your Workspace" : "Verify Your Email"}
                </GlassCardTitle>
                <GlassCardDescription>
                    {step === "form"
                        ? "Set up your company workspace and admin login."
                        : `Enter the 6-digit code sent to ${maskedEmail}.`}
                </GlassCardDescription>
            </GlassCardHeader>
            <GlassCardContent>
                {step === "form" ? (
                    <form className="space-y-4" onSubmit={handleSubmit}>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label required>Legal Name</Label>
                                <Input value={form.tenantName} onChange={(e) => setForm((prev) => ({ ...prev, tenantName: e.target.value }))} required />
                            </div>
                            <div className="space-y-2">
                                <Label required>Trading Name</Label>
                                <Input value={form.tradingName} onChange={(e) => setForm((prev) => ({ ...prev, tradingName: e.target.value }))} required />
                            </div>
                            <div className="space-y-2">
                                <Label required>Admin Name</Label>
                                <Input value={form.adminName} onChange={(e) => setForm((prev) => ({ ...prev, adminName: e.target.value }))} required />
                            </div>
                            <div className="space-y-2">
                                <Label required>Admin Email</Label>
                                <Input type="email" value={form.adminEmail} onChange={(e) => setForm((prev) => ({ ...prev, adminEmail: e.target.value }))} required />
                            </div>
                            <div className="space-y-2">
                                <Label required>Admin Password</Label>
                                <PasswordInput value={form.adminPassword} onChange={(e) => setForm((prev) => ({ ...prev, adminPassword: e.target.value }))} required />
                            </div>
                            <div className="space-y-2">
                                <Label optional>Brand Color</Label>
                                <Input type="color" value={form.primaryColor} onChange={(e) => setForm((prev) => ({ ...prev, primaryColor: e.target.value }))} />
                            </div>
                            <div className="space-y-2 md:col-span-2">
                                <Label required>Document Sync Destination</Label>
                                <Select
                                    value={form.documentSyncProvider}
                                    onValueChange={(value: "GOOGLE_DRIVE" | "SHAREPOINT") =>
                                        setForm((prev) => ({ ...prev, documentSyncProvider: value }))
                                    }
                                >
                                    <SelectTrigger className="w-full bg-white/50">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="GOOGLE_DRIVE">Google Drive</SelectItem>
                                        <SelectItem value="SHAREPOINT">Microsoft SharePoint</SelectItem>
                                    </SelectContent>
                                </Select>
                                <p className="text-xs text-muted-foreground">
                                    You can update this later from Workspace Settings.
                                </p>
                            </div>
                            <div className="space-y-2 md:col-span-2">
                                <Label required>Accounting Software</Label>
                                <Select
                                    value={form.accountingProvider}
                                    onValueChange={(value: "QUICKBOOKS" | "XERO") =>
                                        setForm((prev) => ({ ...prev, accountingProvider: value }))
                                    }
                                >
                                    <SelectTrigger className="w-full bg-white/50">
                                        <SelectValue placeholder="Select accounting software" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="QUICKBOOKS">QuickBooks</SelectItem>
                                        <SelectItem value="XERO">Xero</SelectItem>
                                    </SelectContent>
                                </Select>
                                <p className="text-xs text-amber-700">
                                    Important: This choice is locked after onboarding and cannot be changed later.
                                </p>
                            </div>
                        </div>

                        <ErrorToast error={error} onClear={() => setError(null)} />

                        <Button type="submit" className="w-full font-semibold" disabled={loading}>
                            {loading ? "Creating Workspace..." : "Create Workspace"}
                        </Button>
                    </form>
                ) : (
                    <form className="space-y-4" onSubmit={handleVerify}>
                        <div className="space-y-2">
                            <Label required>Verification Code</Label>
                            <div className="grid grid-cols-6 gap-2">
                                {Array.from({ length: 6 }).map((_, index) => (
                                    <Input
                                        key={index}
                                        value={otp[index] ?? ""}
                                        onChange={(e) => {
                                            const next = e.target.value.replace(/\D/g, "").slice(-1)
                                            const chars = otp.split("")
                                            chars[index] = next
                                            const joined = chars.join("").slice(0, 6)
                                            setOtp(joined)
                                            if (next) {
                                                const nextInput = document.getElementById(`otp-${index + 1}`)
                                                if (nextInput instanceof HTMLInputElement) {
                                                    nextInput.focus()
                                                }
                                            }
                                        }}
                                        onKeyDown={(e) => {
                                            if (e.key === "Backspace" && !otp[index] && index > 0) {
                                                const prevInput = document.getElementById(`otp-${index - 1}`)
                                                if (prevInput instanceof HTMLInputElement) {
                                                    prevInput.focus()
                                                }
                                            }
                                        }}
                                        id={`otp-${index}`}
                                        inputMode="numeric"
                                        maxLength={1}
                                        className="text-center text-lg font-semibold"
                                        required
                                    />
                                ))}
                            </div>
                            {verification?.devOtp && (
                                <p className="text-[11px] text-muted-foreground">Dev OTP: {verification.devOtp}</p>
                            )}
                            {verification?.expiresAt && (
                                <p className="text-[11px] text-muted-foreground">Code expires in {formattedExpiry}</p>
                            )}
                            {verification?.expiresAt && expirySecondsLeft === 0 && (
                                <p className="text-[11px] text-destructive">Code expired. Please resend OTP.</p>
                            )}
                        </div>

                        <ErrorToast error={error} onClear={() => setError(null)} />

                        <Button type="submit" className="w-full font-semibold" disabled={loading || otp.length < 6 || expirySecondsLeft === 0}>
                            {loading ? "Verifying..." : "Verify & Continue"}
                        </Button>
                        <Button
                            type="button"
                            variant="outline"
                            className="w-full bg-white/50"
                            onClick={handleResend}
                            disabled={loading || resendSecondsLeft > 0}
                        >
                            {resendSecondsLeft > 0 ? `Resend available in ${formattedResend}` : "Resend OTP"}
                        </Button>
                    </form>
                )}
            </GlassCardContent>
            <GlassCardFooter className="flex justify-center text-xs text-muted-foreground pt-4 pb-2 border-t border-glass-border/40">
                Already have a workspace? <Link href="/common-login" className="ml-1 text-primary font-semibold">Sign in</Link>
            </GlassCardFooter>
        </GlassCard>
    )
}

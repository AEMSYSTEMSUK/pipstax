"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useMemo, useState } from "react"
import { GlassCard, GlassCardContent, GlassCardDescription, GlassCardFooter, GlassCardHeader, GlassCardTitle } from "@/components/glass/GlassCard"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { PasswordInput } from "@/components/ui/password-input"
import { Label } from "@/components/ui/label"
import { apiPost } from "@/lib/api"
import { setAccountAuth, setAuth } from "@/lib/auth"
import { ErrorToast } from "@/components/shared/ErrorToast"
import { useToast } from "@/components/ui/toast"
import { buildAppPortalUrl, buildTenantUrl } from "@/lib/workspace"

export default function CommonLoginPage() {
    const router = useRouter()
    const { toast } = useToast()
    const [email, setEmail] = useState("")
    const [password, setPassword] = useState("")
    const [error, setError] = useState<string | null>(null)
    const [loading, setLoading] = useState(false)
    const [otpRequired, setOtpRequired] = useState(false)
    const [otp, setOtp] = useState("")
    const [otpLoading, setOtpLoading] = useState(false)
    const [otpSent, setOtpSent] = useState(false)
    const [devOtp, setDevOtp] = useState<string | undefined>(undefined)

    const completeAppLogin = (data: { token: string; workspace?: any; workspaces?: any[] }) => {
        if (data.workspace) {
            setAuth({
                token: data.token,
                tenantId: data.workspace.tenantId,
            })
            if (typeof window !== "undefined") {
                localStorage.setItem("aem_tenant_meta", JSON.stringify({
                    tenantId: data.workspace.tenantId,
                    tradingName: data.workspace.tradingName,
                    name: data.workspace.name,
                    logoUrl: data.workspace.logoUrl,
                    primaryColor: data.workspace.primaryColor
                }))
            }
            window.location.href = buildAppPortalUrl()
            return
        }
        setAccountAuth({ token: data.token, workspaces: data.workspaces })
        router.push("/workspaces")
    }

    const maskedEmail = useMemo(() => {
        if (!email || !email.includes("@")) return "your email"
        const [name, domain] = email.split("@")
        return `${name.charAt(0)}***@${domain}`
    }, [email])

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setError(null)
        setLoading(true)
        try {
            const res = await apiPost<{ token: string; workspaces: any[] }>("/auth/common-login", { email, password })
            setAccountAuth({ token: res.data.token, workspaces: res.data.workspaces })
            if (res.data.workspaces.length === 1) {
                const selected = res.data.workspaces[0]
                const roles = Array.isArray(selected.roles) ? selected.roles : []
                const isAppRole = roles.includes("SUB_CONTRACTOR") || roles.includes("FIELD_WORKER")
                if (isAppRole) {
                    window.location.href = buildAppPortalUrl()
                    return
                }
                const selectRes = await apiPost<{ token: string; tenantId: string; subdomain?: string }>(
                    "/auth/select-tenant",
                    { tenantId: selected.tenantId },
                    { headers: { Authorization: `Bearer ${res.data.token}` } }
                )
                setAuth({ token: selectRes.data.token, tenantId: selectRes.data.tenantId })
                if (typeof window !== "undefined") {
                    localStorage.setItem("aem_tenant_meta", JSON.stringify({
                        tenantId: selected.tenantId,
                        tradingName: selected.tradingName,
                        name: selected.name,
                        logoUrl: selected.logoUrl,
                        primaryColor: selected.primaryColor
                    }))
                }
                const target = buildTenantUrl(selectRes.data.subdomain ?? selected.subdomain ?? "", "/onboarding/complete")
                const url = new URL(target, window.location.origin)
                url.searchParams.set("token", selectRes.data.token)
                url.searchParams.set("tenantId", selectRes.data.tenantId)
                window.location.href = url.toString()
                return
            }
            const allAppRoles = res.data.workspaces.length > 0 && res.data.workspaces.every((workspace) => {
                const roles = Array.isArray(workspace.roles) ? workspace.roles : []
                return roles.includes("SUB_CONTRACTOR") || roles.includes("FIELD_WORKER")
            })
            if (allAppRoles) {
                window.location.href = buildAppPortalUrl()
                return
            }
            router.push("/workspaces")
        } catch (err: any) {
            const message = err?.message ?? "Login failed"
            if (message === "Tenant access denied") {
                try {
                    const appRes = await apiPost<{ token: string; workspace?: any; workspaces?: any[] }>("/app/auth/login", { email, password })
                    completeAppLogin(appRes.data)
                    return
                } catch (appErr: any) {
                    setError(appErr?.message ?? "Login failed")
                    return
                }
            }
            setError(message)
            if (message === "Email verification required") {
                setOtpRequired(true)
                if (!otpSent) {
                    await handleResendOtp()
                }
            }
        } finally {
            setLoading(false)
        }
    }

    const handleResendOtp = async () => {
        if (!email) {
            setError("Please enter your email first.")
            return
        }
        setOtpLoading(true)
        setError(null)
        try {
            const res = await apiPost<{ devOtp?: string }>("/auth/resend-account-otp", { email })
            setOtpSent(true)
            setDevOtp(res.data.devOtp)
            toast({ title: "OTP sent", description: "Check your inbox for the verification code.", variant: "success" })
        } catch (err: any) {
            setError(err?.message ?? "Failed to resend OTP")
        } finally {
            setOtpLoading(false)
        }
    }

    const handleVerifyOtp = async () => {
        if (!email) {
            setError("Please enter your email first.")
            return
        }
        if (otp.length < 6) {
            setError("Please enter the 6-digit OTP.")
            return
        }
        setOtpLoading(true)
        setError(null)
        try {
            const res = await apiPost<{ token: string; tenantId: string; subdomain?: string }>(
                "/auth/verify-account-otp",
                { email, code: otp }
            )
            const target = buildTenantUrl(res.data.subdomain ?? "", "/onboarding/complete")
            const url = new URL(target, window.location.origin)
            url.searchParams.set("token", res.data.token)
            url.searchParams.set("tenantId", res.data.tenantId)
            window.location.href = url.toString()
        } catch (err: any) {
            setError(err?.message ?? "Invalid OTP")
        } finally {
            setOtpLoading(false)
        }
    }

    return (
        <GlassCard className="w-full">
            <GlassCardHeader className="space-y-3 text-center mb-4">
                <div className="mx-auto bg-primary/10 w-16 h-16 rounded-2xl flex items-center justify-center mb-2">
                    <span className="text-3xl font-extrabold text-primary tracking-tighter">AEM</span>
                </div>
                <GlassCardTitle className="text-2xl font-bold tracking-tight text-foreground">
                    Sign In to Your Workspace
                </GlassCardTitle>
                <GlassCardDescription>
                    Use your account credentials to access this company workspace.
                </GlassCardDescription>
            </GlassCardHeader>
            <GlassCardContent>
                <form className="space-y-4" onSubmit={handleSubmit}>
                    <div className="space-y-2">
                        <Label htmlFor="email" required>Email</Label>
                        <Input
                            id="email"
                            type="email"
                            placeholder="you@example.com"
                            required
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            className="bg-white/50 border-glass-border focus-visible:ring-primary"
                        />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="password" required>Password</Label>
                        <PasswordInput
                            id="password"
                            required
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            className="bg-white/50 border-glass-border focus-visible:ring-primary"
                        />
                    </div>
                    <div className="flex justify-end">
                        <Link href="/forgot-password" className="text-xs font-semibold text-primary">
                            Forgot password?
                        </Link>
                    </div>

                    <ErrorToast error={error} onClear={() => setError(null)} />

                    {otpRequired && (
                        <div className="rounded-xl border border-glass-border bg-white/60 p-4 space-y-3">
                            <p className="text-sm text-muted-foreground">
                                Your email is not verified. Send an OTP to {maskedEmail}.
                            </p>
                            {!otpSent ? (
                                <Button type="button" variant="outline" className="w-full bg-white/50" onClick={handleResendOtp} disabled={otpLoading}>
                                    {otpLoading ? "Sending OTP..." : "Send OTP"}
                                </Button>
                            ) : (
                                <div className="space-y-3">
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
                                                        const nextInput = document.getElementById(`common-otp-${index + 1}`)
                                                        if (nextInput instanceof HTMLInputElement) {
                                                            nextInput.focus()
                                                        }
                                                    }
                                                }}
                                                onKeyDown={(e) => {
                                                    if (e.key === "Backspace" && !otp[index] && index > 0) {
                                                        const prevInput = document.getElementById(`common-otp-${index - 1}`)
                                                        if (prevInput instanceof HTMLInputElement) {
                                                            prevInput.focus()
                                                        }
                                                    }
                                                }}
                                                id={`common-otp-${index}`}
                                                inputMode="numeric"
                                                maxLength={1}
                                                className="text-center text-lg font-semibold"
                                            />
                                        ))}
                                    </div>
                                    {devOtp && <p className="text-[11px] text-muted-foreground">Dev OTP: {devOtp}</p>}
                                    <Button type="button" className="w-full" onClick={handleVerifyOtp} disabled={otpLoading || otp.length < 6}>
                                        {otpLoading ? "Verifying..." : "Verify & Continue"}
                                    </Button>
                                    <Button type="button" variant="outline" className="w-full bg-white/50" onClick={handleResendOtp} disabled={otpLoading}>
                                        Resend OTP
                                    </Button>
                                </div>
                            )}
                        </div>
                    )}

                    <Button type="submit" className="w-full font-semibold shadow-md shrink-0" disabled={loading || otpRequired}>
                        {loading ? "Signing In..." : "Sign In"}
                    </Button>
                </form>
            </GlassCardContent>
            <GlassCardFooter className="flex justify-center text-xs text-muted-foreground pt-4 pb-2 border-t border-glass-border/40">
                <div className="flex flex-col items-center gap-1">
                    <span>&copy; {new Date().getFullYear()} AEM Systems Platform</span>
                    <Link href="/onboarding" className="text-primary font-semibold">Create a new workspace</Link>
                </div>
            </GlassCardFooter>
        </GlassCard>
    )
}

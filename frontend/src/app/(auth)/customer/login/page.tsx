"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { GlassCard, GlassCardContent, GlassCardDescription, GlassCardFooter, GlassCardHeader, GlassCardTitle } from "@/components/glass/GlassCard"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { PasswordInput } from "@/components/ui/password-input"
import { Label } from "@/components/ui/label"
import { apiPost } from "@/lib/api"
import { setCustomerAccountAuth, setPortalToken } from "@/lib/auth"
import { ErrorToast } from "@/components/shared/ErrorToast"

export default function CustomerLoginPage() {
    const router = useRouter()
    const searchParams = useSearchParams()
    const [email, setEmail] = useState("")
    const [password, setPassword] = useState("")
    const [error, setError] = useState<string | null>(null)
    const [loading, setLoading] = useState(false)

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setError(null)
        setLoading(true)
        try {
            const res = await apiPost<{ token: string; workspaces: any[] }>("/customer-auth/login", { email, password })
            setCustomerAccountAuth({ token: res.data.token, workspaces: res.data.workspaces })
            const requestedNext = searchParams.get("next") || "/portal/dashboard"
            const nextPath = requestedNext.startsWith("/portal") ? requestedNext : "/portal/dashboard"
            if (res.data.workspaces.length === 1) {
                const selected = res.data.workspaces[0]
                const selectRes = await apiPost<{ portalToken: string; tenantId: string; subdomain?: string }>(
                    "/customer-auth/select-tenant",
                    { tenantId: selected.tenantId },
                    { headers: { Authorization: `Bearer ${res.data.token}` } }
                )
                if (!selectRes.data.portalToken) {
                    throw new Error("Customer portal access is not configured for this workspace yet.")
                }
                setPortalToken(selectRes.data.portalToken)
                window.location.href = nextPath
                return
            }
            if (typeof window !== "undefined") {
                sessionStorage.setItem("aem_customer_next_path", nextPath)
            }
            router.push("/customer/workspaces")
        } catch (err: any) {
            setError(err?.message ?? "Login failed")
        } finally {
            setLoading(false)
        }
    }

    return (
        <GlassCard className="w-full">
            <GlassCardHeader className="space-y-3 text-center mb-4">
                <div className="mx-auto bg-primary/10 w-16 h-16 rounded-2xl flex items-center justify-center mb-2">
                    <span className="text-3xl font-extrabold text-primary tracking-tighter">AEM</span>
                </div>
                <GlassCardTitle className="text-2xl font-bold tracking-tight text-foreground">
                    Customer Sign In
                </GlassCardTitle>
                <GlassCardDescription>
                    Access this company&apos;s customer portal.
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
                        <Link href="/customer/forgot-password" className="text-xs font-semibold text-primary">
                            Forgot password?
                        </Link>
                    </div>
                    <ErrorToast error={error} onClear={() => setError(null)} />
                    <Button type="submit" className="w-full font-semibold shadow-md" disabled={loading}>
                        {loading ? "Signing In..." : "Sign In"}
                    </Button>
                </form>
            </GlassCardContent>
            <GlassCardFooter className="flex justify-center text-xs text-muted-foreground pt-4 pb-2 border-t border-glass-border/40">
                <span>&copy; {new Date().getFullYear()} AEM Systems Platform</span>
            </GlassCardFooter>
        </GlassCard>
    )
}

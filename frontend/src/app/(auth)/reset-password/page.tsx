"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { GlassCard, GlassCardContent, GlassCardDescription, GlassCardFooter, GlassCardHeader, GlassCardTitle } from "@/components/glass/GlassCard"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { PasswordInput } from "@/components/ui/password-input"
import { Label } from "@/components/ui/label"
import { apiPost } from "@/lib/api"
import { ErrorToast } from "@/components/shared/ErrorToast"
import { useToast } from "@/components/ui/toast"

export default function ResetPasswordPage() {
    const router = useRouter()
    const { toast } = useToast()
    const params = useSearchParams()
    const token = params.get("token") ?? ""
    const email = params.get("email") ?? ""
    const [password, setPassword] = useState("")
    const [confirm, setConfirm] = useState("")
    const [error, setError] = useState<string | null>(null)
    const [loading, setLoading] = useState(false)

    const isValid = useMemo(() => Boolean(token && email), [token, email])

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!isValid) {
            setError("Reset link is invalid.")
            return
        }
        if (password.length < 6) {
            setError("Password must be at least 6 characters.")
            return
        }
        if (password !== confirm) {
            setError("Passwords do not match.")
            return
        }
        setError(null)
        setLoading(true)
        try {
            await apiPost("/auth/reset-password", { email, token, password })
            toast({ title: "Password updated", description: "You can now sign in with your new password.", variant: "success" })
            router.replace("/common-login")
        } catch (err: any) {
            setError(err?.message ?? "Failed to reset password")
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
                    Choose a New Password
                </GlassCardTitle>
                <GlassCardDescription>
                    Set a new password for {email || "your account"}.
                </GlassCardDescription>
            </GlassCardHeader>
            <GlassCardContent>
                <form className="space-y-4" onSubmit={handleSubmit}>
                    <div className="space-y-2">
                        <Label htmlFor="password" required>New Password</Label>
                        <PasswordInput
                            id="password"
                            required
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            className="bg-white/50 border-glass-border focus-visible:ring-primary"
                        />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="confirm" required>Confirm Password</Label>
                        <PasswordInput
                            id="confirm"
                            required
                            value={confirm}
                            onChange={(e) => setConfirm(e.target.value)}
                            className="bg-white/50 border-glass-border focus-visible:ring-primary"
                        />
                    </div>
                    <ErrorToast error={error} onClear={() => setError(null)} />
                    <Button type="submit" className="w-full font-semibold shadow-md" disabled={loading || !isValid}>
                        {loading ? "Saving..." : "Update Password"}
                    </Button>
                </form>
            </GlassCardContent>
            <GlassCardFooter className="flex justify-center text-xs text-muted-foreground pt-4 pb-2 border-t border-glass-border/40">
                <div className="flex flex-col items-center gap-1">
                    <span>&copy; {new Date().getFullYear()} AEM Systems Platform</span>
                    <Link href="/common-login" className="text-primary font-semibold">Back to sign in</Link>
                </div>
            </GlassCardFooter>
        </GlassCard>
    )
}

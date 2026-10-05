"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { GlassCard, GlassCardContent, GlassCardDescription, GlassCardFooter, GlassCardHeader, GlassCardTitle } from "@/components/glass/GlassCard"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { apiPost } from "@/lib/api"
import { ErrorToast } from "@/components/shared/ErrorToast"
import { useToast } from "@/components/ui/toast"

export default function ForgotPasswordPage() {
    const router = useRouter()
    const { toast } = useToast()
    const [email, setEmail] = useState("")
    const [error, setError] = useState<string | null>(null)
    const [loading, setLoading] = useState(false)
    const [sent, setSent] = useState(false)

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setError(null)
        setLoading(true)
        try {
            const res = await apiPost<{ devToken?: string }>("/auth/forgot-password", { email })
            setSent(true)
            if (res.data?.devToken) {
                toast({ title: "Reset link generated", description: `Dev token: ${res.data.devToken}`, variant: "success" })
            } else {
                toast({ title: "Reset email sent", description: "Check your inbox for the reset link.", variant: "success" })
            }
        } catch (err: any) {
            setError(err?.message ?? "Failed to send reset email")
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
                    Reset Your Password
                </GlassCardTitle>
                <GlassCardDescription>
                    Enter your account email to receive a reset link.
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
                    <ErrorToast error={error} onClear={() => setError(null)} />
                    <Button type="submit" className="w-full font-semibold shadow-md" disabled={loading}>
                        {loading ? "Sending..." : sent ? "Email Sent" : "Send Reset Link"}
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

"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { GlassCard, GlassCardContent, GlassCardDescription, GlassCardFooter, GlassCardHeader, GlassCardTitle } from "@/components/glass/GlassCard"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { PasswordInput } from "@/components/ui/password-input"
import { Label } from "@/components/ui/label"
import { apiPost } from "@/lib/api"
import { setPlatformAuth } from "@/lib/auth"
import { ErrorToast } from "@/components/shared/ErrorToast"

export default function SuperAdminLogin() {
    const router = useRouter()
    const [email, setEmail] = useState("")
    const [password, setPassword] = useState("")
    const [error, setError] = useState<string | null>(null)
    const [loading, setLoading] = useState(false)

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setError(null)
        setLoading(true)
        try {
            const response = await apiPost<{ token: string; admin: { id: string; roles?: Array<{ code: string }> } }>(
                "/platform-auth/login",
                { email, password }
            )
            setPlatformAuth({ token: response.data.token, admin: response.data.admin })
            router.push("/sa/dashboard")
        } catch (err) {
            setError(err instanceof Error ? err.message : "Login failed")
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="min-h-screen flex items-center justify-center px-4 py-10">
            <GlassCard className="w-full max-w-md">
                <GlassCardHeader className="space-y-3 text-center mb-2">
                    <div className="mx-auto bg-primary/10 w-16 h-16 rounded-2xl flex items-center justify-center mb-2">
                        <span className="text-3xl font-extrabold text-primary tracking-tighter">AEM</span>
                    </div>
                    <GlassCardTitle className="text-2xl font-bold tracking-tight text-foreground">
                        Platform Admin
                    </GlassCardTitle>
                    <GlassCardDescription>
                        Sign in to manage all client workspaces
                    </GlassCardDescription>
                </GlassCardHeader>
                <GlassCardContent>
                    <form className="space-y-4" onSubmit={handleSubmit}>
                        <div className="space-y-2">
                            <Label htmlFor="email">Email</Label>
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
                            <Label htmlFor="password">Password</Label>
                            <PasswordInput
                                id="password"
                                required
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                className="bg-white/50 border-glass-border focus-visible:ring-primary"
                            />
                        </div>
                        <ErrorToast error={error} onClear={() => setError(null)} />
                        <Button type="submit" className="w-full font-semibold shadow-md shrink-0" disabled={loading}>
                            {loading ? "Signing In..." : "Sign In"}
                        </Button>
                    </form>
                </GlassCardContent>
                <GlassCardFooter className="flex justify-center text-xs text-muted-foreground pt-4 pb-2 border-t border-glass-border/40">
                    &copy; {new Date().getFullYear()} AEM Systems Platform
                </GlassCardFooter>
            </GlassCard>
        </div>
    )
}

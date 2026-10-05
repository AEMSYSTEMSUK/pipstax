"use client"

import { useEffect, useState } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import { GlassCard, GlassCardContent, GlassCardDescription, GlassCardFooter, GlassCardHeader, GlassCardTitle } from "@/components/glass/GlassCard"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { PasswordInput } from "@/components/ui/password-input"
import { Label } from "@/components/ui/label"
import { apiGet, apiPost } from "@/lib/api"
import { ErrorToast } from "@/components/shared/ErrorToast"
import { useToast } from "@/components/ui/toast"

export default function CustomerInvitePage() {
    const params = useSearchParams()
    const router = useRouter()
    const { toast } = useToast()
    const [invite, setInvite] = useState<any>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [password, setPassword] = useState("")
    const [fullName, setFullName] = useState("")
    const [saving, setSaving] = useState(false)
    const requestedNext = params.get("next") ?? ""
    const nextPath = requestedNext.startsWith("/portal") ? requestedNext : "/portal/dashboard"

    useEffect(() => {
        const token = params.get("token")
        if (!token) {
            setError("Invite token missing")
            setLoading(false)
            return
        }
        const load = async () => {
            try {
                const res = await apiGet<any>(`/customer-invites/${token}`)
                setInvite(res.data)
                setFullName(res.data?.fullName ?? "")
            } catch (err: any) {
                setError(err?.message ?? "Invite not found")
            } finally {
                setLoading(false)
            }
        }
        load()
    }, [params])

    const handleAccept = async () => {
        if (!invite) return
        if (!password) {
            setError("Password is required.")
            return
        }
        setSaving(true)
        setError(null)
        try {
            await apiPost("/customer-invites/accept", {
                token: params.get("token"),
                password,
                fullName
            })
            toast({ title: "Invite accepted", description: "You can now sign in.", variant: "success" })
            router.replace(`/customer/login?next=${encodeURIComponent(nextPath)}`)
        } catch (err: any) {
            setError(err?.message ?? "Failed to accept invite")
        } finally {
            setSaving(false)
        }
    }

    if (loading) {
        return <div className="text-sm text-muted-foreground text-center">Loading invite...</div>
    }

    return (
        <GlassCard className="w-full">
            <GlassCardHeader className="space-y-2 text-center mb-4">
                <GlassCardTitle className="text-2xl font-bold tracking-tight text-foreground">
                    Accept Customer Invite
                </GlassCardTitle>
                <GlassCardDescription>
                    {invite?.tenantName ? `Join ${invite.tenantName}` : "Complete your registration"}
                </GlassCardDescription>
            </GlassCardHeader>
            <GlassCardContent>
                <div className="space-y-4">
                    {invite?.fullName !== undefined && (
                        <div className="space-y-2">
                            <Label optional>Full Name</Label>
                            <Input
                                placeholder="Your name"
                                value={fullName}
                                onChange={(e) => setFullName(e.target.value)}
                                className="bg-white/50 border-glass-border focus-visible:ring-primary"
                            />
                        </div>
                    )}
                    <div className="space-y-2">
                        <Label required>Password</Label>
                        <PasswordInput
                            placeholder="Create or confirm password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            className="bg-white/50 border-glass-border focus-visible:ring-primary"
                        />
                    </div>
                    <ErrorToast error={error} onClear={() => setError(null)} />
                    <Button className="w-full" onClick={handleAccept} disabled={saving}>
                        {saving ? "Accepting..." : "Accept Invite"}
                    </Button>
                </div>
            </GlassCardContent>
            <GlassCardFooter className="flex justify-center text-xs text-muted-foreground pt-4 pb-2 border-t border-glass-border/40">
                <span>&copy; {new Date().getFullYear()} AEM Systems Platform</span>
            </GlassCardFooter>
        </GlassCard>
    )
}

"use client"

import { useState } from "react"
import { PageContainer } from "@/components/layout/PageContainer"
import { GlassCard, GlassCardContent, GlassCardDescription, GlassCardFooter, GlassCardHeader, GlassCardTitle } from "@/components/glass/GlassCard"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { PasswordInput } from "@/components/ui/password-input"
import { Label } from "@/components/ui/label"
import { apiPost } from "@/lib/api"
import { ErrorToast } from "@/components/shared/ErrorToast"
import { useToast } from "@/components/ui/toast"

export default function AdminProfilePage() {
    const { toast } = useToast()
    const [currentPassword, setCurrentPassword] = useState("")
    const [newPassword, setNewPassword] = useState("")
    const [confirmPassword, setConfirmPassword] = useState("")
    const [error, setError] = useState<string | null>(null)
    const [loading, setLoading] = useState(false)

    const handleSave = async () => {
        if (!currentPassword || !newPassword) {
            setError("Please fill in all fields.")
            return
        }
        if (newPassword.length < 6) {
            setError("Password must be at least 6 characters.")
            return
        }
        if (newPassword !== confirmPassword) {
            setError("Passwords do not match.")
            return
        }
        setError(null)
        setLoading(true)
        try {
            await apiPost("/users/change-password", { currentPassword, newPassword })
            toast({ title: "Password updated", description: "Your password has been changed.", variant: "success" })
            setCurrentPassword("")
            setNewPassword("")
            setConfirmPassword("")
        } catch (err: any) {
            setError(err?.message ?? "Failed to update password")
        } finally {
            setLoading(false)
        }
    }

    return (
        <PageContainer>
            <div className="flex flex-col md:flex-row gap-6">
                <div className="md:w-56">
                    <div className="sticky top-6 space-y-2">
                        <div className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground px-2">
                            Profile
                        </div>
                        <div className="rounded-xl border border-white/60 bg-white/60 px-3 py-2 text-sm font-semibold text-primary">
                            Security
                        </div>
                        <div className="rounded-xl border border-white/40 bg-white/30 px-3 py-2 text-sm text-muted-foreground">
                            Preferences
                        </div>
                    </div>
                </div>

                <div className="flex-1 max-w-2xl">
                    <div className="mb-4">
                        <h1 className="text-2xl font-bold tracking-tight text-foreground">Manage Profile</h1>
                        <p className="text-muted-foreground mt-1 text-sm">Update your password and account preferences.</p>
                    </div>

                    <GlassCard>
                        <GlassCardHeader>
                            <GlassCardTitle>Security</GlassCardTitle>
                            <GlassCardDescription>Change your account password.</GlassCardDescription>
                        </GlassCardHeader>
                        <GlassCardContent className="space-y-4">
                            <div className="space-y-2">
                                <Label htmlFor="currentPassword" required>Current Password</Label>
                                <PasswordInput
                                    id="currentPassword"
                                    value={currentPassword}
                                    onChange={(e) => setCurrentPassword(e.target.value)}
                                    className="bg-white/50"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="newPassword" required>New Password</Label>
                                <PasswordInput
                                    id="newPassword"
                                    value={newPassword}
                                    onChange={(e) => setNewPassword(e.target.value)}
                                    className="bg-white/50"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="confirmPassword" required>Confirm New Password</Label>
                                <PasswordInput
                                    id="confirmPassword"
                                    value={confirmPassword}
                                    onChange={(e) => setConfirmPassword(e.target.value)}
                                    className="bg-white/50"
                                />
                            </div>
                            <ErrorToast error={error} onClear={() => setError(null)} />
                        </GlassCardContent>
                        <GlassCardFooter className="justify-end border-t border-glass-border/50">
                            <Button onClick={handleSave} disabled={loading}>
                                {loading ? "Saving..." : "Update Password"}
                            </Button>
                        </GlassCardFooter>
                    </GlassCard>
                </div>
            </div>
        </PageContainer>
    )
}

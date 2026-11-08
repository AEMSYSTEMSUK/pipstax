"use client"

import { use, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { PageContainer } from "@/components/layout/PageContainer"
import { GlassCard, GlassCardContent, GlassCardHeader, GlassCardTitle, GlassCardDescription, GlassCardFooter } from "@/components/glass/GlassCard"
import { GlassModal } from "@/components/glass/GlassModal"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { ArrowLeft, Save, Users, Building2, BriefcaseBusiness, FileText, Receipt, Ticket, ShieldCheck, Puzzle, Globe2, Mail, Phone, MapPin, LockKeyhole, Power } from "lucide-react"
import { apiGet, apiPost, apiPut } from "@/lib/api"
import { ErrorToast } from "@/components/shared/ErrorToast"
import { Switch } from "@/components/ui/switch"
import { useToast } from "@/components/ui/toast"
import { PasswordInput } from "@/components/ui/password-input"
import { PhoneInput } from "@/components/shared/PhoneInput"

const defaultFeatureFlags = {
    sites: false,
    complianceReports: false,
    renewals: false,
    splitInvoicing: false,
    complianceWorkflows: false,
    plannerNotes: false,
    siteScopedPortal: false,
}

const visibleOptionalModules = [
    ["sites", "Sites"],
    ["complianceReports", "Compliance Reports"],
    ["renewals", "Tests Due / Renewals"],
    ["complianceWorkflows", "Compliance Workflow Overlay"],
    ["plannerNotes", "Planner Notes"],
    ["siteScopedPortal", "Site-scoped Portal"],
] as const

export default function TenantDetailPage({ params }: { params: Promise<{ id: string }> }) {
    const resolvedParams = use(params)
    const [tenant, setTenant] = useState<any | null>(null)
    const [stats, setStats] = useState<any | null>(null)
    const [users, setUsers] = useState<any[]>([])
    const [error, setError] = useState<string | null>(null)
    const [resetUser, setResetUser] = useState<any | null>(null)
    const [resetPassword, setResetPassword] = useState("")
    const [resetError, setResetError] = useState<string | null>(null)
    const [resetLoading, setResetLoading] = useState(false)
    const { toast } = useToast()
    const baseDomain = process.env.NEXT_PUBLIC_TENANT_BASE_DOMAIN ?? "app.com"

    useEffect(() => {
        const load = async () => {
            try {
                const [tenantRes, usersRes] = await Promise.all([
                    apiGet<any>(`/platform/tenants/${resolvedParams.id}`),
                    apiGet<any[]>(`/platform/tenants/${resolvedParams.id}/users`)
                ])
                setTenant({
                    ...tenantRes.data.tenant,
                    featureFlags: {
                        ...defaultFeatureFlags,
                        ...(tenantRes.data.tenant?.featureFlags ?? {}),
                    },
                })
                setStats(tenantRes.data.stats)
                setUsers(Array.isArray(usersRes.data) ? usersRes.data : [])
            } catch (err: any) {
                setError(err?.message ?? "Failed to load tenant")
            }
        }
        load()
    }, [resolvedParams.id])

    const activeModules = useMemo(
        () => visibleOptionalModules.filter(([key]) => Boolean(tenant?.featureFlags?.[key])),
        [tenant?.featureFlags]
    )

    const workspaceUrl = tenant?.subdomain ? `${tenant.subdomain}.${baseDomain}` : `company1.${baseDomain}`

    const saveTenantDetails = async (body: Record<string, unknown>, message: string) => {
        try {
            const res = await apiPut<any>(`/platform/tenants/${tenant.id}`, body)
            setTenant((prev: any) => ({
                ...prev,
                ...(res.data ?? {}),
                featureFlags: {
                    ...defaultFeatureFlags,
                    ...((res.data as any)?.featureFlags ?? prev?.featureFlags ?? {}),
                },
            }))
            toast({ title: "Tenant updated", description: message, variant: "success" })
        } catch (err: any) {
            setError(err?.message ?? "Failed to update tenant")
        }
    }

    const resetTenantUserPassword = async () => {
        if (!resetUser) return
        if (resetPassword.trim() && resetPassword.trim().length < 6) {
            setResetError("Password must be at least 6 characters.")
            return
        }
        setResetLoading(true)
        setResetError(null)
        try {
            const res = await apiPost<any>(`/platform/tenants/${tenant.id}/users/${resetUser.id}/reset-password`, {
                password: resetPassword.trim() || undefined,
            })
            const tempPassword = res.data?.tempPassword
            setResetUser(null)
            setResetPassword("")
            toast({
                title: "Password reset",
                description: tempPassword ? `Temporary password: ${tempPassword}` : "Tenant user password updated.",
                variant: "success",
            })
        } catch (err: any) {
            setResetError(err?.message ?? "Failed to reset password.")
        } finally {
            setResetLoading(false)
        }
    }

    const toggleTenantAccess = async () => {
        const nextIsDeleted = !tenant.isDeleted
        const confirmed = window.confirm(
            nextIsDeleted
                ? "Deactivate this tenant? Users will no longer be able to access this workspace until it is reactivated."
                : "Reactivate this tenant and restore workspace access?"
        )
        if (!confirmed) return
        await saveTenantDetails({ isDeleted: nextIsDeleted }, nextIsDeleted ? "Workspace access has been deactivated." : "Workspace access has been restored.")
    }

    if (!tenant) {
        return (
            <PageContainer>
                <div className="text-center p-12">Tenant not found</div>
                <ErrorToast error={error} onClear={() => setError(null)} />
            </PageContainer>
        )
    }

    return (
        <PageContainer>
            <div className="mb-6">
                <Link href="/sa/tenants" className="text-sm font-medium text-primary hover:text-primary-dark transition-colors inline-flex items-center gap-1 mb-4">
                    <ArrowLeft className="h-3 w-3" /> Back to Tenants
                </Link>

                <div className="rounded-[32px] border border-glass-border/70 bg-gradient-to-br from-white/95 via-white/75 to-primary/10 p-5 shadow-xl shadow-slate-200/40">
                    <div className="grid gap-5 xl:grid-cols-[minmax(280px,0.95fr)_minmax(420px,1.35fr)_minmax(220px,auto)] xl:items-stretch">
                        <div className="flex items-center gap-4 rounded-3xl border border-white/70 bg-white/60 p-4 shadow-sm">
                            <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-3xl border border-primary/15 bg-primary/10 text-primary shadow-sm">
                                {tenant.logoUrl ? (
                                    <img src={tenant.logoUrl} alt={`${tenant.tradingName ?? tenant.name} logo`} className="h-full w-full object-contain p-2" />
                                ) : (
                                    <Building2 className="h-10 w-10" />
                                )}
                            </div>
                            <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-2">
                                    <h1 className="truncate text-3xl font-semibold tracking-tight text-foreground">{tenant.tradingName ?? tenant.name}</h1>
                                    <Badge variant="secondary" className={tenant.isDeleted ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700"}>
                                        {tenant.isDeleted ? "Deactivated" : "Active"}
                                    </Badge>
                                </div>
                                <p className="mt-1 truncate text-sm font-medium text-muted-foreground">{tenant.name}</p>
                                <p className="mt-3 inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
                                    <Puzzle className="h-3.5 w-3.5" /> {activeModules.length} modules enabled
                                </p>
                            </div>
                        </div>

                        <div className="grid gap-3 sm:grid-cols-2">
                            {[
                                { label: "Workspace URL", value: workspaceUrl, icon: Globe2 },
                                { label: "Contact Email", value: tenant.contactEmail || "No contact email", icon: Mail },
                                { label: "Contact Phone", value: tenant.contactPhone || "No phone saved", icon: Phone },
                                { label: "Workspace Address", value: tenant.address || "No address saved", icon: MapPin },
                            ].map((item) => (
                                <div key={item.label} className="flex min-w-0 gap-3 rounded-2xl border border-white/70 bg-white/60 p-3 shadow-sm">
                                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                                        <item.icon className="h-4 w-4" />
                                    </div>
                                    <div className="min-w-0">
                                        <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">{item.label}</div>
                                        <div className="mt-1 truncate text-sm font-semibold text-foreground" title={item.value}>{item.value}</div>
                                    </div>
                                </div>
                            ))}
                        </div>

                        <div className="flex flex-col justify-between gap-3 rounded-3xl border border-white/70 bg-white/60 p-4 shadow-sm">
                            <div>
                                <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">Workspace Actions</div>
                                <p className="mt-1 text-xs text-muted-foreground">Save profile changes or control tenant access.</p>
                            </div>
                            <div className="grid gap-2">
                                <Button
                                    className="w-full gap-2"
                                    onClick={() => saveTenantDetails(tenant, "Workspace branding saved.")}
                                >
                                    <Save className="h-4 w-4" /> Save Workspace
                                </Button>
                                <Button
                                    variant={tenant.isDeleted ? "outline" : "destructive"}
                                    className="w-full gap-2"
                                    onClick={toggleTenantAccess}
                                >
                                    <Power className="h-4 w-4" /> {tenant.isDeleted ? "Reactivate Tenant" : "Deactivate Tenant"}
                                </Button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <div className="mb-6 grid gap-4 md:grid-cols-2 xl:grid-cols-6">
                {[
                    { label: "Users", value: stats?.users ?? 0, icon: Users, tone: "bg-primary/10 text-primary" },
                    { label: "Customers", value: stats?.customers ?? 0, icon: Building2, tone: "bg-cyan-100 text-cyan-700" },
                    { label: "Jobs", value: stats?.jobs ?? 0, icon: BriefcaseBusiness, tone: "bg-amber-100 text-amber-700" },
                    { label: "Quotes", value: stats?.quotes ?? 0, icon: FileText, tone: "bg-pink-100 text-pink-700" },
                    { label: "Invoices", value: stats?.invoices ?? 0, icon: Receipt, tone: "bg-emerald-100 text-emerald-700" },
                    { label: "Tickets", value: stats?.tickets ?? 0, icon: Ticket, tone: "bg-slate-100 text-slate-700" },
                ].map((item) => (
                    <GlassCard key={item.label} className="bg-white/65 transition hover:-translate-y-0.5 hover:shadow-lg">
                        <GlassCardContent className="flex items-center gap-3 p-4">
                            <div className={`flex h-11 w-11 items-center justify-center rounded-2xl ${item.tone}`}>
                                <item.icon className="h-5 w-5" />
                            </div>
                            <div>
                                <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{item.label}</div>
                                <div className="text-xl font-bold text-foreground">{item.value}</div>
                            </div>
                        </GlassCardContent>
                    </GlassCard>
                ))}
            </div>

            <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
                <div className="space-y-6 xl:col-span-1">
                    <GlassCard>
                        <GlassCardHeader>
                            <GlassCardTitle className="text-base">Workspace Branding</GlassCardTitle>
                            <GlassCardDescription>Control the tenant-facing identity and contact details.</GlassCardDescription>
                        </GlassCardHeader>
                        <GlassCardContent className="space-y-4">
                            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1">
                                <div className="space-y-2">
                                    <Label>Company Name</Label>
                                    <Input value={tenant.name ?? ""} onChange={(e) => setTenant((prev: any) => ({ ...prev, name: e.target.value }))} />
                                </div>
                                <div className="space-y-2">
                                    <Label>Trading Name</Label>
                                    <Input value={tenant.tradingName ?? ""} onChange={(e) => setTenant((prev: any) => ({ ...prev, tradingName: e.target.value }))} />
                                </div>
                                <div className="space-y-2">
                                    <Label>Workspace URL</Label>
                                    <div className="rounded-lg border border-glass-border bg-white/50 px-3 py-2 text-sm text-muted-foreground">{workspaceUrl}</div>
                                </div>
                                <div className="space-y-2">
                                    <Label>Logo URL</Label>
                                    <Input value={tenant.logoUrl ?? ""} onChange={(e) => setTenant((prev: any) => ({ ...prev, logoUrl: e.target.value }))} />
                                </div>
                                <div className="space-y-2">
                                    <Label>Primary Color</Label>
                                    <Input type="color" value={tenant.primaryColor ?? "#0E8585"} onChange={(e) => setTenant((prev: any) => ({ ...prev, primaryColor: e.target.value }))} />
                                </div>
                                <div className="space-y-2">
                                    <Label>Contact Email</Label>
                                    <Input value={tenant.contactEmail ?? ""} onChange={(e) => setTenant((prev: any) => ({ ...prev, contactEmail: e.target.value }))} />
                                </div>
                                <div className="space-y-2">
                                    <Label>Contact Phone</Label>
                                    <PhoneInput value={tenant.contactPhone ?? ""} onChange={(contactPhone) => setTenant((prev: any) => ({ ...prev, contactPhone }))} />
                                </div>
                                <div className="space-y-2">
                                    <Label>Address</Label>
                                    <Input value={tenant.address ?? ""} onChange={(e) => setTenant((prev: any) => ({ ...prev, address: e.target.value }))} />
                                </div>
                            </div>
                        </GlassCardContent>
                        <GlassCardFooter className="justify-end border-t border-glass-border/50">
                            <Button className="gap-2" onClick={() => saveTenantDetails(tenant, "Workspace branding saved.")}>
                                <Save className="h-4 w-4" /> Save Changes
                            </Button>
                        </GlassCardFooter>
                    </GlassCard>

                    <GlassCard>
                        <GlassCardHeader>
                            <GlassCardTitle className="flex items-center gap-2 text-base">
                                <ShieldCheck className="h-4 w-4 text-primary" /> Module Health
                            </GlassCardTitle>
                            <GlassCardDescription>Enabled optional modules for this workspace.</GlassCardDescription>
                        </GlassCardHeader>
                        <GlassCardContent className="space-y-2">
                            {activeModules.length === 0 ? (
                                <p className="text-sm text-muted-foreground">No optional modules are enabled.</p>
                            ) : activeModules.map(([, label]) => (
                                <div key={label} className="flex items-center justify-between rounded-xl border border-glass-border bg-white/50 px-3 py-2">
                                    <span className="text-sm font-medium text-foreground">{label}</span>
                                    <Badge variant="secondary" className="bg-emerald-100 text-emerald-700">Enabled</Badge>
                                </div>
                            ))}
                        </GlassCardContent>
                    </GlassCard>
                </div>

                <div className="space-y-6 xl:col-span-2">
                    <GlassCard>
                        <GlassCardHeader>
                            <GlassCardTitle className="flex items-center gap-2 text-base">
                                <Puzzle className="h-4 w-4 text-primary" /> Optional Modules
                            </GlassCardTitle>
                            <GlassCardDescription>Enable compliance capabilities tenant by tenant without affecting the base product.</GlassCardDescription>
                        </GlassCardHeader>
                        <GlassCardContent className="grid gap-3 md:grid-cols-2">
                            {visibleOptionalModules.map(([key, label]) => (
                                <div key={key} className="flex items-center justify-between rounded-2xl border border-glass-border bg-white/45 px-4 py-3">
                                    <div>
                                        <div className="text-sm font-semibold text-foreground">{label}</div>
                                        <div className="text-xs text-muted-foreground">{tenant.featureFlags?.[key] ? "Available in tenant app" : "Hidden from tenant app"}</div>
                                    </div>
                                    <Switch
                                        checked={Boolean(tenant.featureFlags?.[key])}
                                        onCheckedChange={(checked) =>
                                            setTenant((prev: any) => ({
                                                ...prev,
                                                featureFlags: {
                                                    ...defaultFeatureFlags,
                                                    ...(prev?.featureFlags ?? {}),
                                                    [key]: checked,
                                                },
                                            }))
                                        }
                                    />
                                </div>
                            ))}
                        </GlassCardContent>
                        <GlassCardFooter className="justify-end border-t border-glass-border/50">
                            <Button className="gap-2" onClick={() => saveTenantDetails({ featureFlags: tenant.featureFlags }, "Tenant feature flags saved.")}>
                                <Save className="h-4 w-4" /> Save Module Settings
                            </Button>
                        </GlassCardFooter>
                    </GlassCard>

                    <GlassCard>
                        <GlassCardHeader>
                            <GlassCardTitle className="text-base">Workspace Users</GlassCardTitle>
                            <GlassCardDescription>View and support users inside this tenant workspace.</GlassCardDescription>
                        </GlassCardHeader>
                        <GlassCardContent className="p-0">
                            <Table>
                                <TableHeader className="bg-black/5">
                                    <TableRow className="border-glass-border">
                                        <TableHead>User</TableHead>
                                        <TableHead>Email</TableHead>
                                        <TableHead>Roles</TableHead>
                                        <TableHead className="text-right">Actions</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {users.length === 0 ? (
                                        <TableRow>
                                            <TableCell colSpan={4} className="h-32 text-center text-muted-foreground">
                                                No users found.
                                            </TableCell>
                                        </TableRow>
                                    ) : (
                                        users.map((user) => (
                                            <TableRow key={user.id} className="border-glass-border">
                                                <TableCell className="font-medium">{user.fullName || "Unnamed user"}</TableCell>
                                                <TableCell>{user.email}</TableCell>
                                                <TableCell>
                                                    {(user.roles ?? []).map((role: any) => (
                                                        <Badge key={role.id ?? role.code} variant="secondary" className="mr-2">{role.code}</Badge>
                                                    ))}
                                                </TableCell>
                                                <TableCell className="text-right">
                                                    <Button
                                                        size="sm"
                                                        variant="outline"
                                                        className="gap-2 bg-white/60"
                                                        onClick={() => {
                                                            setResetUser(user)
                                                            setResetPassword("")
                                                            setResetError(null)
                                                        }}
                                                    >
                                                        <LockKeyhole className="h-3.5 w-3.5" />
                                                        Reset Password
                                                    </Button>
                                                </TableCell>
                                            </TableRow>
                                        ))
                                    )}
                                </TableBody>
                            </Table>
                        </GlassCardContent>
                    </GlassCard>
                </div>
            </div>

            <GlassModal
                open={Boolean(resetUser)}
                onOpenChange={(open) => {
                    if (!open) {
                        setResetUser(null)
                        setResetPassword("")
                        setResetError(null)
                    }
                }}
                title="Reset Tenant User Password"
                description="Set a password manually or leave it blank to generate a temporary password."
                footer={
                    <div className="flex justify-end gap-2">
                        <Button variant="outline" onClick={() => setResetUser(null)}>Cancel</Button>
                        <Button onClick={resetTenantUserPassword} disabled={resetLoading}>
                            {resetLoading ? "Saving..." : "Reset Password"}
                        </Button>
                    </div>
                }
            >
                <div className="space-y-4">
                    <div className="rounded-xl border border-glass-border bg-white/50 p-3">
                        <p className="font-semibold text-foreground">{resetUser?.fullName ?? "Tenant user"}</p>
                        <p className="text-sm text-muted-foreground">{resetUser?.email ?? ""}</p>
                    </div>
                    <div className="space-y-2">
                        <Label>New Password</Label>
                        <PasswordInput
                            autoComplete="new-password"
                            placeholder="Leave blank to auto-generate"
                            value={resetPassword}
                            onChange={(event) => {
                                setResetPassword(event.target.value)
                                setResetError(null)
                            }}
                        />
                        {resetError ? <p className="text-xs text-destructive">{resetError}</p> : null}
                    </div>
                </div>
            </GlassModal>

            <ErrorToast error={error} onClear={() => setError(null)} />
        </PageContainer>
    )
}

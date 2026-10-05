"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { GlassCard, GlassCardContent, GlassCardDescription, GlassCardHeader, GlassCardTitle } from "@/components/glass/GlassCard"
import { Button } from "@/components/ui/button"
import { ErrorToast } from "@/components/shared/ErrorToast"
import { apiPost } from "@/lib/api"
import { clearAccountAuth, getAccountAuth, setAuth } from "@/lib/auth"
import { buildAppPortalUrl, buildTenantUrl } from "@/lib/workspace"
import { ArrowRight } from "lucide-react"

export default function WorkspacesPage() {
    const router = useRouter()
    const [workspaces, setWorkspaces] = useState<any[]>([])
    const [error, setError] = useState<string | null>(null)
    const [loadingId, setLoadingId] = useState<string | null>(null)

    useEffect(() => {
        const auth = getAccountAuth()
        if (!auth?.workspaces?.length) {
            clearAccountAuth()
            router.replace("/common-login")
            return
        }
        setWorkspaces(auth.workspaces)
    }, [router])

    const handleSelect = async (workspace: any) => {
        const auth = getAccountAuth()
        if (!auth?.token) return
        setLoadingId(workspace.tenantId)
        setError(null)
        try {
            const roles = Array.isArray(workspace.roles) ? workspace.roles : []
            const isAppWorkspace = roles.includes("FIELD_WORKER") || roles.includes("SUB_CONTRACTOR")
            const selectPath = isAppWorkspace ? "/app/auth/select-tenant" : "/auth/select-tenant"
            const res = await apiPost<{ token: string; tenantId: string; subdomain?: string }>(
                selectPath,
                { tenantId: workspace.tenantId },
                { headers: { Authorization: `Bearer ${auth.token}` } }
            )
            setAuth({ token: res.data.token, tenantId: res.data.tenantId })
            if (typeof window !== "undefined") {
                localStorage.setItem("aem_tenant_meta", JSON.stringify({
                    tenantId: workspace.tenantId,
                    tradingName: workspace.tradingName,
                    name: workspace.name,
                    logoUrl: workspace.logoUrl,
                    primaryColor: workspace.primaryColor
                }))
            }
            if (isAppWorkspace) {
                window.location.href = buildAppPortalUrl()
                return
            }
            const target = buildTenantUrl(res.data.subdomain ?? workspace.subdomain ?? "", "/onboarding/complete")
            const url = new URL(target, window.location.origin)
            url.searchParams.set("token", res.data.token)
            url.searchParams.set("tenantId", res.data.tenantId)
            window.location.href = url.toString()
        } catch (err: any) {
            setError(err?.message ?? "Failed to select workspace")
            setLoadingId(null)
        }
    }

    return (
        <div className="w-full max-w-4xl mx-auto">
            <div className="text-center space-y-3 mb-10">
                <div className="mx-auto bg-primary/10 w-14 h-14 rounded-2xl flex items-center justify-center shadow-sm">
                    <span className="text-2xl font-extrabold text-primary tracking-tighter">AEM</span>
                </div>
                <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-foreground">Welcome back!</h1>
                <p className="text-sm text-muted-foreground">Select the workspace to continue.</p>
            </div>

            <GlassCard className="bg-white/70">
                <GlassCardHeader className="pb-2">
                    <GlassCardTitle className="text-base">Ready to launch</GlassCardTitle>
                    <GlassCardDescription>Select the workspace to open.</GlassCardDescription>
                </GlassCardHeader>
                <GlassCardContent className="p-0">
                    {workspaces.length === 0 ? (
                        <div className="text-sm text-muted-foreground text-center py-6">No workspaces found.</div>
                    ) : (
                        <div className="divide-y divide-glass-border">
                            {workspaces.map((workspace) => (
                                <div
                                    key={workspace.tenantId}
                                    role="button"
                                    tabIndex={0}
                                    className="group w-full text-left px-5 py-4 md:px-6 md:py-5 hover:bg-white/80 transition-colors cursor-pointer"
                                    onClick={() => handleSelect(workspace)}
                                    onKeyDown={(event) => {
                                        if (event.key === "Enter" || event.key === " ") {
                                            event.preventDefault()
                                            handleSelect(workspace)
                                        }
                                    }}
                                >
                                    <div className="flex items-center justify-between gap-4">
                                        <div className="flex items-center gap-4">
                                            <div className="h-11 w-11 rounded-2xl bg-primary/10 text-primary flex items-center justify-center font-bold">
                                                {(workspace.tradingName ?? "W")[0]}
                                            </div>
                                            <div className="flex flex-col">
                                                <span className="font-semibold text-foreground">
                                                    {workspace.tradingName ?? "Workspace"}
                                                </span>
                                                <span className="text-xs text-muted-foreground">Open workspace</span>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <Button size="sm" disabled={loadingId === workspace.tenantId} type="button">
                                                {loadingId === workspace.tenantId ? "Opening..." : "Open"}
                                            </Button>
                                            <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                    <ErrorToast error={error} onClear={() => setError(null)} />
                </GlassCardContent>
            </GlassCard>
        </div>
    )
}

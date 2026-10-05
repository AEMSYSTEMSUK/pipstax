"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { GlassCard, GlassCardContent, GlassCardDescription, GlassCardHeader, GlassCardTitle } from "@/components/glass/GlassCard"
import { Button } from "@/components/ui/button"
import { ErrorToast } from "@/components/shared/ErrorToast"
import { apiPost } from "@/lib/api"
import { clearCustomerAccountAuth, getCustomerAccountAuth, setPortalToken } from "@/lib/auth"
import { ArrowRight } from "lucide-react"

export default function CustomerWorkspacesPage() {
    const router = useRouter()
    const [workspaces, setWorkspaces] = useState<any[]>([])
    const [error, setError] = useState<string | null>(null)
    const [loadingId, setLoadingId] = useState<string | null>(null)

    useEffect(() => {
        const auth = getCustomerAccountAuth()
        if (!auth?.workspaces?.length) {
            clearCustomerAccountAuth()
            router.replace("/customer/login")
            return
        }
        setWorkspaces(auth.workspaces)
    }, [router])

    const handleSelect = async (workspace: any) => {
        const auth = getCustomerAccountAuth()
        if (!auth?.token) return
        setLoadingId(workspace.tenantId)
        setError(null)
        try {
            const res = await apiPost<{ portalToken: string; tenantId: string; subdomain?: string }>(
                "/customer-auth/select-tenant",
                { tenantId: workspace.tenantId },
                { headers: { Authorization: `Bearer ${auth.token}` } }
            )
            if (!res.data.portalToken) {
                throw new Error("Customer portal access is not configured for this workspace yet.")
            }
            setPortalToken(res.data.portalToken)
            const nextPath =
                typeof window !== "undefined"
                    ? sessionStorage.getItem("aem_customer_next_path") || "/portal/dashboard"
                    : "/portal/dashboard"
            const safeNextPath = nextPath.startsWith("/portal") ? nextPath : "/portal/dashboard"
            if (typeof window !== "undefined") {
                sessionStorage.removeItem("aem_customer_next_path")
            }
            window.location.href = safeNextPath
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
                <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-foreground">Select a Workspace</h1>
                <p className="text-sm text-muted-foreground">Choose the customer workspace to open.</p>
            </div>

            <GlassCard className="bg-white/70">
                <GlassCardHeader className="pb-2">
                    <GlassCardTitle className="text-base">Available Workspaces</GlassCardTitle>
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
                                                <span className="text-xs text-muted-foreground">{workspace.customerName ?? "Customer"}</span>
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

"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { AppHeader } from "@/components/layout/AppHeader"
import { AppSidebar } from "@/components/layout/AppSidebar"
import { LayoutDashboard, Calendar, Briefcase } from "lucide-react"
import { getAuth, clearAuth } from "@/lib/auth"
import { apiGet } from "@/lib/api"
import { applyTenantTheme } from "@/lib/theme"

const workerNavItems = [
    { name: "Dashboard", href: "/worker/dashboard", icon: <LayoutDashboard className="h-4 w-4" /> },
    { name: "My Jobs", href: "/worker/jobs", icon: <Briefcase className="h-4 w-4" /> },
    { name: "Schedule", href: "/worker/schedule", icon: <Calendar className="h-4 w-4" /> },
]

export default function WorkerLayout({
    children,
}: {
    children: React.ReactNode
}) {
    const router = useRouter()
    const [authChecked, setAuthChecked] = useState(false)
    const [authorized, setAuthorized] = useState(false)

    useEffect(() => {
        const auth = getAuth()
        const roles = auth?.user?.roles?.map((r: any) => r.code) ?? []
        const allowed = roles.includes("FIELD_WORKER") || roles.includes("SUB_CONTRACTOR")
        if (!auth || !allowed) {
            clearAuth()
            router.replace("/common-login")
            setAuthorized(false)
            setAuthChecked(true)
            return
        }
        setAuthorized(true)
        setAuthChecked(true)
        const load = async () => {
            try {
                const res = await apiGet<any>("/settings/tenant")
                applyTenantTheme(res.data?.primaryColor)
            } catch {
                // ignore
            }
        }
        load()
    }, [router])

    if (!authChecked || !authorized) {
        return null
    }

    return (
        <div className="flex min-h-screen">
            <AppSidebar items={workerNavItems} portalName="Worker Portal" />
            <div className="flex-1 flex flex-col min-w-0">
                <AppHeader />
                <main className="flex-1 overflow-y-auto">
                    {children}
                </main>
            </div>
        </div>
    )
}

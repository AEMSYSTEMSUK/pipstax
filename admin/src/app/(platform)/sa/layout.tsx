"use client"

import { useEffect, useSyncExternalStore } from "react"
import { usePathname, useRouter } from "next/navigation"
import { AppHeader } from "@/components/layout/AppHeader"
import { AppSidebar } from "@/components/layout/AppSidebar"
import { LayoutDashboard, Building2, Users, Settings } from "lucide-react"
import { getPlatformAuth, clearPlatformAuth } from "@/lib/auth"

const saNavItems = [
    { name: "Dashboard", href: "/sa/dashboard", icon: <LayoutDashboard className="h-4 w-4" /> },
    { name: "Tenants", href: "/sa/tenants", icon: <Building2 className="h-4 w-4" /> },
    { name: "Users", href: "/sa/users", icon: <Users className="h-4 w-4" /> },
    { name: "Settings", href: "/sa/settings", icon: <Settings className="h-4 w-4" /> },
]

const subscribeToPlatformAuth = (onStoreChange: () => void) => {
    window.addEventListener("storage", onStoreChange)
    return () => window.removeEventListener("storage", onStoreChange)
}

const getPlatformAuthSnapshot = (): boolean | null => Boolean(getPlatformAuth())
const getServerPlatformAuthSnapshot = (): boolean | null => null

export default function SuperAdminLayout({
    children,
}: {
    children: React.ReactNode
}) {
    const router = useRouter()
    const pathname = usePathname()
    const isAuthenticated = useSyncExternalStore(
        subscribeToPlatformAuth,
        getPlatformAuthSnapshot,
        getServerPlatformAuthSnapshot,
    )

    useEffect(() => {
        if (!pathname.startsWith("/sa/login") && isAuthenticated === false) {
            clearPlatformAuth()
            router.replace("/sa/login")
        }
    }, [isAuthenticated, router, pathname])

    if (pathname.startsWith("/sa/login")) {
        return <>{children}</>
    }

    if (!isAuthenticated) {
        return null
    }

    return (
        <div className="flex min-h-screen">
            <AppSidebar items={saNavItems} portalName="Platform Admin" brandName="AEM Systems" />
            <div className="flex-1 flex flex-col min-w-0">
                <AppHeader />
                <main className="flex-1 overflow-y-auto">
                    {children}
                </main>
            </div>
        </div>
    )
}

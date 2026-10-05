"use client"

import { useEffect } from "react"
import { usePathname } from "next/navigation"
import { apiGet } from "@/lib/api"
import { applyTenantTheme } from "@/lib/theme"
import { getTenantSubdomain } from "@/lib/tenant-domain"

export default function AuthLayout({
    children,
}: {
    children: React.ReactNode
}) {
    const pathname = usePathname()
    const isPublicQuoteRoute = pathname?.startsWith("/quote/")

    useEffect(() => {
        const load = async () => {
            try {
                const baseDomain = process.env.NEXT_PUBLIC_TENANT_BASE_DOMAIN ?? ""
                const subdomain = getTenantSubdomain(window.location.hostname, baseDomain)
                if (!subdomain) return
                const res = await apiGet<{ primaryColor?: string }>(`/public/tenant/${subdomain}`)
                applyTenantTheme(res.data?.primaryColor)
            } catch {
                // ignore
            }
        }
        load()
    }, [])

    if (isPublicQuoteRoute) {
        return <div className="min-h-screen bg-background">{children}</div>
    }

    return (
        <div className="min-h-screen flex items-center justify-center relative overflow-hidden bg-background">
            {/* Decorative blurred background layer */}
            <div className="absolute inset-0 z-0">
                <div className="absolute -top-40 -left-40 w-96 h-96 bg-primary/20 rounded-full blur-3xl opacity-60 mix-blend-multiply animate-pulse" />
                <div className="absolute top-1/2 left-1/2 w-[500px] h-[500px] bg-secondary rounded-full blur-3xl opacity-50 mix-blend-multiply transform -translate-x-1/2 -translate-y-1/2" />
                <div className="absolute -bottom-40 -right-40 w-96 h-96 bg-accent/20 rounded-full blur-3xl opacity-60 mix-blend-multiply" />
            </div>

            <div className="relative z-10 w-full max-w-md p-4">
                {children}
            </div>
        </div>
    )
}

"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { AppHeader } from "@/components/layout/AppHeader"
import { AppSidebar } from "@/components/layout/AppSidebar"
import { LayoutDashboard, FileText, FileSpreadsheet, Briefcase, Ticket, ShieldCheck, MapPinned } from "lucide-react"
import { apiGet } from "@/lib/api"
import { clearCustomerAccountAuth, clearPortalToken, getCustomerAccountAuth, getPortalToken } from "@/lib/auth"
import { applyTenantTheme } from "@/lib/theme"
import { buildWorkspaceAuthUrl } from "@/lib/workspace"

export default function PortalLayout({
    children,
}: {
    children: React.ReactNode
}) {
    const router = useRouter()
    const [brandName, setBrandName] = useState<string | undefined>(undefined)
    const [logoUrl, setLogoUrl] = useState<string | undefined>(undefined)
    const [customerName, setCustomerName] = useState<string | undefined>(undefined)
    const [customerEmail, setCustomerEmail] = useState<string | undefined>(undefined)
    const [portalFeatures, setPortalFeatures] = useState({ complianceReports: false, sites: false })

    const portalToken = getPortalToken()
    const customerAccountToken = getCustomerAccountAuth()?.token

    useEffect(() => {
        const loginUrl = () => {
            if (typeof window === "undefined") return "/customer/login"
            const nextPath = `${window.location.pathname}${window.location.search ?? ""}`
            return buildWorkspaceAuthUrl(`/customer/login?next=${encodeURIComponent(nextPath)}`)
        }
        if (!portalToken || !customerAccountToken) {
            clearPortalToken()
            clearCustomerAccountAuth()
            router.replace(loginUrl())
            return
        }
        const load = async () => {
            try {
                const res = await apiGet<any>(`/portal/${portalToken}/profile`)
                const tenant = res.data?.tenant
                setBrandName(tenant?.tradingName ?? tenant?.name ?? "Customer")
                setLogoUrl(tenant?.logoUrl)
                const customerLabel = res.data?.customer?.name ?? res.data?.customer?.email ?? "Customer"
                const customerEmailValue = res.data?.customer?.email
                setCustomerName(customerLabel)
                setCustomerEmail(customerEmailValue)
                setPortalFeatures({
                    complianceReports: Boolean(res.data?.features?.complianceReports),
                    sites: Boolean(res.data?.features?.sites),
                })
                if (typeof window !== "undefined") {
                    localStorage.setItem("aem_portal_customer_name", customerLabel)
                    if (customerEmailValue) {
                        localStorage.setItem("aem_portal_customer_email", customerEmailValue)
                    }
                }
                applyTenantTheme(tenant?.primaryColor)
            } catch {
                clearPortalToken()
                clearCustomerAccountAuth()
                router.replace(loginUrl())
            }
        }
        void load()
    }, [portalToken, customerAccountToken, router])

    const portalNavItems = [
        { name: "Overview", href: "/portal/dashboard", icon: <LayoutDashboard className="h-4 w-4" /> },
        { name: "Quotes", href: "/portal/quotes", icon: <FileText className="h-4 w-4" /> },
        { name: "Invoices", href: "/portal/invoices", icon: <FileSpreadsheet className="h-4 w-4" /> },
        ...(portalFeatures.sites
            ? [{ name: "Sites", href: "/portal/sites", icon: <MapPinned className="h-4 w-4" /> }]
            : []),
        { name: "My Jobs", href: "/portal/jobs", icon: <Briefcase className="h-4 w-4" /> },
        ...(portalFeatures.complianceReports
            ? [{ name: "Reports", href: "/portal/reports", icon: <ShieldCheck className="h-4 w-4" /> }]
            : []),
        { name: "Support", href: "/portal/tickets", icon: <Ticket className="h-4 w-4" /> },
    ]

    return (
        <div className="flex min-h-screen">
            <AppSidebar
                items={portalNavItems}
                portalName="Workspace"
                brandName={brandName}
                logoUrl={logoUrl}
                footerNote="Powered by AEM Systems"
                userNameOverride={customerName}
                userEmailOverride={customerEmail}
            />
            <div className="flex-1 flex flex-col min-w-0">
                <AppHeader title={brandName ?? "Workspace"} />
                <main className="flex-1 overflow-y-auto">
                    {children}
                </main>
                <footer className="py-3 text-center text-[10px] text-muted-foreground border-t border-glass-border">
                    Powered by AEM Systems
                </footer>
            </div>
        </div>
    )
}

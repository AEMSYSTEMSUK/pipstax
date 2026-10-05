"use client"

import * as React from "react"
import { cn } from "@/lib/utils"
import Link from "next/link"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { clearAccountAuth, clearAuth, clearCustomerAccountAuth, clearPlatformAuth, clearPortalToken, getAuth, getPlatformAuth, setAuth, setEffectivePermissions } from "@/lib/auth"
import { GlassModal } from "@/components/glass/GlassModal"
import { Button } from "@/components/ui/button"
import { buildWorkspaceAuthUrl } from "@/lib/workspace"
import { LogOut, ChevronDown } from "lucide-react"
import { apiGet } from "@/lib/api"

interface SidebarItem {
    name: string;
    href: string;
    icon: React.ReactNode;
    children?: SidebarItem[];
}

interface AppSidebarProps extends React.HTMLAttributes<HTMLDivElement> {
    items: SidebarItem[];
    portalName: string;
    brandName?: string;
    logoUrl?: string;
    footerNote?: string;
    userNameOverride?: string;
    userEmailOverride?: string;
}

export function AppSidebar({ items, portalName, brandName, logoUrl, footerNote, userNameOverride, userEmailOverride, className, ...props }: AppSidebarProps) {
    const pathname = usePathname()
    const searchParams = useSearchParams()
    const router = useRouter()
    const [userName, setUserName] = React.useState("User")
    const [platformName, setPlatformName] = React.useState("Admin")
    const [userEmail, setUserEmail] = React.useState<string | undefined>(undefined)
    const [logoutOpen, setLogoutOpen] = React.useState(false)
    const [openGroups, setOpenGroups] = React.useState<Record<string, boolean>>({})
    const auth = getAuth()
    const platformAuth = getPlatformAuth()

    React.useEffect(() => {
        if (pathname.startsWith("/sa")) {
            const name = platformAuth?.admin?.fullName ?? platformAuth?.admin?.email ?? "Admin"
            setPlatformName(name)
            return
        }
        if (pathname.startsWith("/portal")) {
            if (userNameOverride) {
                setUserName(userNameOverride)
            }
            const stored = typeof window !== "undefined" ? localStorage.getItem("aem_portal_customer_name") : null
            setUserName(stored || "Customer")
            if (userEmailOverride) {
                setUserEmail(userEmailOverride)
                return
            }
            const storedEmail = typeof window !== "undefined" ? localStorage.getItem("aem_portal_customer_email") : null
            setUserEmail(storedEmail || undefined)
            return
        }
        const name = auth?.user?.fullName ?? auth?.user?.email
        if (name) {
            setUserName(name)
            return
        }
        const load = async () => {
            try {
                const res = await apiGet<any>("/users/me")
                const details = res.data
                if (details?.fullName || details?.email) {
                    setUserName(details.fullName ?? details.email)
                    if (auth?.token && auth?.tenantId) {
                        setAuth({
                            token: auth.token,
                            tenantId: auth.tenantId,
                            user: {
                                id: details.id,
                                fullName: details.fullName,
                                email: details.email,
                                roles: details.roles ?? []
                            }
                        })
                        if (details?.effectivePermissions) {
                            setEffectivePermissions(details.effectivePermissions)
                        }
                    }
                }
            } catch {
                // ignore
            }
        }
        load()
    }, [auth?.tenantId, auth?.token, auth?.user?.email, auth?.user?.fullName, pathname, platformAuth?.admin?.email, platformAuth?.admin?.fullName])

    const isPlatform = pathname.startsWith("/sa")
    const isPortal = pathname.startsWith("/portal")
    const isAdmin = pathname.startsWith("/admin")
    const initialsSource = isPlatform ? platformName : userName
    const initials = initialsSource
        .split(" ")
        .filter(Boolean)
        .map((part) => part[0])
        .join("")
        .slice(0, 2)
        .toUpperCase()

    const profileHref = isPortal ? "/portal/profile" : isAdmin ? "/admin/profile" : undefined
    const profileEmail = isPlatform
        ? platformAuth?.admin?.email
        : isPortal
            ? (userEmailOverride ?? userEmail)
            : auth?.user?.email

    const currentSearch = searchParams.toString()
    const currentHref = `${pathname}${currentSearch ? `?${currentSearch}` : ""}`

    const isHrefActive = React.useCallback((href: string) => {
        const [targetPath, targetQuery = ""] = href.split("?")
        if (pathname !== targetPath) return false
        if (!targetQuery) {
            return currentHref === targetPath || currentHref.startsWith(`${targetPath}/`)
        }
        const targetParams = new URLSearchParams(targetQuery)
        const currentParams = new URLSearchParams(currentSearch)
        return Array.from(targetParams.entries()).every(
            ([key, value]) => currentParams.get(key) === value
        )
    }, [pathname, currentHref, currentSearch])

    React.useEffect(() => {
        setOpenGroups((prev) => {
            const next = { ...prev }
            items.forEach((item) => {
                if (!item.children?.length) return
                if (typeof next[item.name] === "boolean") return
                next[item.name] = item.children.some((child) => isHrefActive(child.href))
            })
            return next
        })
    }, [items, isHrefActive])

    return (
        <div className={cn("hidden md:flex flex-col w-64 border-r border-white/40 bg-white/20 backdrop-blur-2xl h-screen sticky top-0 left-0 z-40 shadow-[4px_0_24px_rgba(0,0,0,0.02)]", className)} {...props}>
            <div className="p-6 flex items-center space-x-3">
                {logoUrl ? (
                    <div className="h-8 w-8 rounded overflow-hidden border border-white/60 bg-white/60 flex items-center justify-center">
                        <img src={logoUrl} alt="Logo" className="h-8 w-8 object-contain" />
                    </div>
                ) : (
                    <div className="h-8 w-8 rounded bg-primary flex items-center justify-center text-primary-foreground font-bold">
                        A
                    </div>
                )}
                <div className="flex flex-col">
                    <span className="font-bold text-lg leading-tight tracking-tight">{brandName ?? "System"}</span>
                    <span className="text-xs text-muted-foreground font-medium uppercase tracking-wider">{portalName}</span>
                </div>
            </div>

            <nav className="flex-1 px-4 space-y-1 overflow-y-auto pt-4">
                {items.map((item) => {
                    const hasChildren = Array.isArray(item.children) && item.children.length > 0
                    const isActive = hasChildren
                        ? item.children!.some((child) => isHrefActive(child.href))
                        : isHrefActive(item.href)
                    return (
                        hasChildren ? (
                            <div key={item.name} className="space-y-1">
                                <button
                                    type="button"
                                    onClick={() => setOpenGroups((prev) => ({ ...prev, [item.name]: !prev[item.name] }))}
                                    className={cn(
                                        "flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-300",
                                        isActive
                                            ? "bg-white/60 text-primary-dark shadow-sm border border-white/50"
                                            : "text-sidebar-foreground hover:bg-white/30 hover:text-foreground"
                                    )}
                                >
                                    <span className="flex items-center space-x-3">
                                        <span className={cn("flex-shrink-0", isActive ? "text-primary" : "text-muted-foreground")}>
                                            {item.icon}
                                        </span>
                                        <span>{item.name}</span>
                                    </span>
                                    <ChevronDown className={cn("h-4 w-4 transition-transform", openGroups[item.name] ? "rotate-180" : "")} />
                                </button>
                                {openGroups[item.name] ? (
                                    <div className="ml-4 space-y-1 border-l border-white/40 pl-3">
                                        {item.children!.map((child) => {
                                            const childActive = isHrefActive(child.href)
                                            return (
                                                <Link
                                                    key={child.href}
                                                    href={child.href}
                                                    className={cn(
                                                        "flex items-center space-x-3 rounded-xl px-3 py-2 text-sm font-medium transition-all duration-300",
                                                        childActive
                                                            ? "bg-white/60 text-primary-dark shadow-sm border border-white/50"
                                                            : "text-sidebar-foreground hover:bg-white/30 hover:text-foreground"
                                                    )}
                                                >
                                                    <div className={cn("flex-shrink-0", childActive ? "text-primary" : "text-muted-foreground")}>
                                                        {child.icon}
                                                    </div>
                                                    <span>{child.name}</span>
                                                </Link>
                                            )
                                        })}
                                    </div>
                                ) : null}
                            </div>
                        ) : (
                            <Link
                                key={item.name}
                                href={item.href}
                                className={cn(
                                    "flex items-center space-x-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-300",
                                    isActive
                                        ? "bg-white/60 text-primary-dark shadow-sm border border-white/50"
                                        : "text-sidebar-foreground hover:bg-white/30 hover:text-foreground"
                                )}
                            >
                                <div className={cn("flex-shrink-0", isActive ? "text-primary" : "text-muted-foreground")}>
                                    {item.icon}
                                </div>
                                <span>{item.name}</span>
                            </Link>
                        )
                    )
                })}
            </nav>

            <div className="p-4 mt-auto border-t border-glass-border space-y-2">
                <div className="flex w-full items-center space-x-3 px-3 py-2 rounded-lg hover:bg-white/40 transition-colors text-left">
                    <div className="h-8 w-8 rounded-full bg-gradient-to-tr from-primary to-primary-light flex items-center justify-center text-white font-bold text-xs ring-2 ring-white">
                        {initials || "U"}
                    </div>
                    <div className="flex flex-col">
                        {profileHref ? (
                            <Link href={profileHref} className="text-sm font-medium hover:text-primary">
                                {isPlatform ? platformName : userName}
                            </Link>
                        ) : (
                            <span className="text-sm font-medium">{isPlatform ? platformName : userName}</span>
                        )}
                        {profileHref ? (
                            <span className="text-xs text-muted-foreground">{profileEmail ?? "Manage profile"}</span>
                        ) : (
                            <span className="text-xs text-muted-foreground">Signed in</span>
                        )}
                    </div>
                </div>
                <button
                    className="flex w-full items-center justify-center gap-2 px-3 py-2 rounded-lg bg-white/60 hover:bg-white/80 border border-white/60 text-sm font-semibold text-primary transition-colors"
                    onClick={() => setLogoutOpen(true)}
                >
                    <LogOut className="h-4 w-4" />
                    Log out
                </button>
                <GlassModal
                    open={logoutOpen}
                    onOpenChange={setLogoutOpen}
                    title="Log out"
                    description="Are you sure you want to log out?"
                    footer={
                        <div className="flex justify-end gap-2 w-full">
                            <Button variant="outline" onClick={() => setLogoutOpen(false)}>
                                Cancel
                            </Button>
                            <Button
                                onClick={() => {
                                    if (isPlatform) {
                                        clearPlatformAuth()
                                        router.replace("/sa/login")
                                        return
                                    }
                                    if (isPortal) {
                                        clearPortalToken()
                                        clearCustomerAccountAuth()
                                        window.location.href = buildWorkspaceAuthUrl("/customer/login")
                                        return
                                    }
                                    clearAuth()
                                    clearAccountAuth()
                                    window.location.href = buildWorkspaceAuthUrl("/common-login")
                                }}
                            >
                                Log out
                            </Button>
                        </div>
                    }
                >
                    <div className="text-sm text-muted-foreground">
                        You will need to sign in again to access your workspace.
                    </div>
                </GlassModal>
            </div>
        </div>
    )
}

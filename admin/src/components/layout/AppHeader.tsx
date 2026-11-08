 "use client"

import * as React from "react"
import { useEffect, useState } from "react"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import { Bell, Search, Menu } from "lucide-react"
import { apiGet, apiPost } from "@/lib/api"

interface AppHeaderProps extends Omit<React.HTMLAttributes<HTMLElement>, 'title'> {
    title?: React.ReactNode;
    breadcrumbs?: React.ReactNode;
    actions?: React.ReactNode;
}

export function AppHeader({ title, breadcrumbs, actions, className, ...props }: AppHeaderProps) {
    const [notificationCount, setNotificationCount] = useState(0)
    const pathname = usePathname()

    useEffect(() => {
        if (pathname.startsWith("/sa")) return
        const load = async () => {
            try {
                const res = await apiGet<any[]>(`/notifications`)
                const items = Array.isArray(res.data) ? res.data : []
                const unread = items.filter((n) => !n.readAt).length
                setNotificationCount(unread)
            } catch {
                // ignore notifications errors for non-admin roles
            }
        }
        load()
    }, [pathname])

    return (
        <header
            className={cn(
                "sticky top-0 z-30 flex h-16 w-full items-center justify-between px-6 bg-white/20 backdrop-blur-2xl border-b border-white/40 shadow-sm",
                className
            )}
            {...props}
        >
            <div className="flex items-center gap-4">
                {/* Mobile menu button placeholder */}
                <button className="md:hidden text-muted-foreground hover:text-foreground">
                    <Menu className="h-5 w-5" />
                </button>

                <div className="flex flex-col">
                    {breadcrumbs && (
                        <div className="text-xs text-muted-foreground font-medium mb-0.5">
                            {breadcrumbs}
                        </div>
                    )}
                    {title && (
                        <h1 className="text-lg font-semibold text-foreground leading-tight tracking-tight">
                            {title}
                        </h1>
                    )}
                </div>
            </div>

            <div className="flex items-center gap-4">
                <div className="relative hidden sm:block">
                    <Search className="absolute left-2.5 top-2 h-4 w-4 text-muted-foreground" />
                    <input
                        type="text"
                        placeholder="Search..."
                        className="h-9 w-64 rounded-full border border-white/50 bg-white/40 pl-9 pr-3 text-sm shadow-inner transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring focus-visible:bg-white/60"
                    />
                </div>

                <button
                    className="relative text-muted-foreground hover:text-foreground transition-colors"
                    onClick={async () => {
                        try {
                            const res = await apiGet<any[]>(`/notifications`)
                            const items = Array.isArray(res.data) ? res.data : []
                            await Promise.all(items.filter((n) => !n.readAt).map((n) => apiPost(`/notifications/${n.id}/read`)))
                            setNotificationCount(0)
                        } catch {
                            // ignore
                        }
                    }}
                >
                    <Bell className="h-5 w-5" />
                    {notificationCount > 0 && (
                        <span className="absolute top-0 right-0 h-2 w-2 rounded-full bg-destructive ring-2 ring-white" />
                    )}
                </button>

                {actions && (
                    <div className="flex items-center gap-2 ml-2 pl-4 border-l border-border h-8">
                        {actions}
                    </div>
                )}
            </div>
        </header>
    )
}

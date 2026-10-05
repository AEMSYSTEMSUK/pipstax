 "use client"

import * as React from "react"
import { useEffect, useState } from "react"
import { usePathname, useRouter } from "next/navigation"
import { cn } from "@/lib/utils"
import { Bell, Search, Menu, CheckCircle2, ArrowRight } from "lucide-react"
import { apiGet, apiPost } from "@/lib/api"
import { getPortalToken } from "@/lib/auth"
import { Button } from "@/components/ui/button"
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

interface AppHeaderProps extends Omit<React.HTMLAttributes<HTMLElement>, 'title'> {
    title?: React.ReactNode;
    breadcrumbs?: React.ReactNode;
    actions?: React.ReactNode;
}

type AppNotification = {
    id: string
    title: string
    message: string
    targetUrl?: string | null
    readAt?: string | null
    createdAt?: string
}

export function AppHeader({ title, breadcrumbs, actions, className, ...props }: AppHeaderProps) {
    const [notificationCount, setNotificationCount] = useState(0)
    const [notifications, setNotifications] = useState<AppNotification[]>([])
    const [notificationsOpen, setNotificationsOpen] = useState(false)
    const [notificationsLoading, setNotificationsLoading] = useState(false)
    const [notificationsError, setNotificationsError] = useState<string | null>(null)
    const pathname = usePathname()
    const router = useRouter()
    const isPortal = pathname.startsWith("/portal")

    const getNotificationsEndpoint = () => {
        const portalToken = isPortal ? getPortalToken() : null
        if (isPortal && !portalToken) return null
        return isPortal && portalToken ? `/portal/${portalToken}/notifications` : `/notifications`
    }

    const getReadEndpoint = (id: string) => {
        const portalToken = isPortal ? getPortalToken() : null
        return isPortal && portalToken ? `/portal/${portalToken}/notifications/${id}/read` : `/notifications/${id}/read`
    }

    const loadNotifications = async () => {
        const endpoint = getNotificationsEndpoint()
        if (!endpoint) return
        try {
            setNotificationsLoading(true)
            setNotificationsError(null)
            const res = await apiGet<AppNotification[]>(endpoint)
            const items = Array.isArray(res.data) ? res.data : []
            setNotifications(items)
            setNotificationCount(items.filter((n) => !n.readAt).length)
        } catch (err: any) {
            setNotificationsError(err?.message ?? "Failed to load notifications")
        } finally {
            setNotificationsLoading(false)
        }
    }

    const markAllNotificationsRead = async () => {
        try {
            const unread = notifications.filter((n) => !n.readAt)
            await Promise.all(unread.map((n) => apiPost(getReadEndpoint(n.id))))
            setNotifications((prev) =>
                prev.map((notification) => ({
                    ...notification,
                    readAt: notification.readAt ?? new Date().toISOString(),
                }))
            )
            setNotificationCount(0)
        } catch (err: any) {
            setNotificationsError(err?.message ?? "Failed to mark notifications as read")
        }
    }

    const normalizeNotificationTarget = (target?: string | null) => {
        const value = target?.trim()
        if (!value) return null
        if (value.startsWith("/")) return value
        try {
            const url = new URL(value)
            return `${url.pathname}${url.search}${url.hash}`
        } catch {
            return null
        }
    }

    const markNotificationReadLocally = (id: string) => {
        const readAt = new Date().toISOString()
        setNotifications((prev) =>
            prev.map((notification) =>
                notification.id === id
                    ? { ...notification, readAt: notification.readAt ?? readAt }
                    : notification
            )
        )
        setNotificationCount((count) => Math.max(count - 1, 0))
    }

    const handleNotificationSelect = async (notification: AppNotification) => {
        const target = normalizeNotificationTarget(notification.targetUrl)
        if (!notification.readAt) {
            markNotificationReadLocally(notification.id)
            apiPost(getReadEndpoint(notification.id)).catch((err: any) => {
                setNotificationsError(err?.message ?? "Failed to mark notification as read")
                void loadNotifications()
            })
        }
        if (target) {
            setNotificationsOpen(false)
            router.push(target)
        }
    }

    useEffect(() => {
        if (pathname.startsWith("/sa")) return
        const load = async () => {
            try {
                const endpoint = getNotificationsEndpoint()
                if (!endpoint) return
                const res = await apiGet<AppNotification[]>(endpoint)
                const items = Array.isArray(res.data) ? res.data : []
                setNotifications(items)
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

                <DropdownMenu
                    open={notificationsOpen}
                    onOpenChange={(open) => {
                        setNotificationsOpen(open)
                        if (open) void loadNotifications()
                    }}
                >
                    <DropdownMenuTrigger asChild>
                        <button
                            type="button"
                            className="relative text-muted-foreground hover:text-foreground transition-colors"
                            aria-label="Open notifications"
                        >
                            <Bell className="h-5 w-5" />
                            {notificationCount > 0 && (
                                <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold leading-none text-white ring-2 ring-white">
                                    {notificationCount > 9 ? "9+" : notificationCount}
                                </span>
                            )}
                        </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-[430px] max-w-[94vw] overflow-hidden rounded-2xl border-glass-border bg-white/95 p-0 shadow-2xl shadow-slate-900/15 backdrop-blur-xl">
                        <div className="flex items-center justify-between gap-3 border-b border-border/70 bg-gradient-to-r from-slate-50 to-white px-4 py-3">
                            <div>
                                <DropdownMenuLabel className="p-0 text-base font-semibold">Notifications</DropdownMenuLabel>
                                <p className="text-xs text-muted-foreground">
                                    {notificationCount > 0 ? `${notificationCount} unread update${notificationCount === 1 ? "" : "s"}` : "You're all caught up"}
                                </p>
                            </div>
                            {notificationCount > 0 ? (
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    className="h-8 shrink-0 gap-1.5 rounded-full text-xs"
                                    onClick={(event) => {
                                        event.preventDefault()
                                        void markAllNotificationsRead()
                                    }}
                                >
                                    <CheckCircle2 className="h-3.5 w-3.5" /> Mark all read
                                </Button>
                            ) : null}
                        </div>
                        <div className="max-h-[420px] overflow-y-auto p-2">
                            {notificationsLoading ? (
                                <div className="px-3 py-8 text-center text-sm text-muted-foreground">Loading notifications...</div>
                            ) : notificationsError ? (
                                <div className="rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-3 text-sm text-destructive">
                                    {notificationsError}
                                </div>
                            ) : notifications.length === 0 ? (
                                <div className="px-3 py-8 text-center text-sm text-muted-foreground">No notifications yet.</div>
                            ) : (
                                notifications.slice(0, 10).map((notification) => {
                                    const target = normalizeNotificationTarget(notification.targetUrl)
                                    return (
                                        <DropdownMenuItem
                                            key={notification.id}
                                            onSelect={(event) => {
                                                event.preventDefault()
                                                void handleNotificationSelect(notification)
                                            }}
                                            className={cn(
                                                "mb-1 block cursor-pointer rounded-2xl border px-3 py-3 text-sm outline-none transition-all focus:scale-[0.99] focus:bg-slate-50",
                                                notification.readAt
                                                    ? "border-transparent bg-white/40 hover:border-border hover:bg-white"
                                                    : "border-primary/20 bg-primary/5 shadow-sm shadow-primary/5 hover:border-primary/30 hover:bg-primary/10"
                                            )}
                                        >
                                            <div className="flex items-start justify-between gap-3">
                                                <div className="min-w-0">
                                                    <p className="line-clamp-1 font-semibold text-foreground">{notification.title}</p>
                                                    <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted-foreground">{notification.message}</p>
                                                </div>
                                                {!notification.readAt ? (
                                                    <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-primary shadow-sm shadow-primary/40" />
                                                ) : null}
                                            </div>
                                            <div className="mt-3 flex items-center justify-between gap-3">
                                                {notification.createdAt ? (
                                                    <p className="text-[11px] font-medium text-muted-foreground">
                                                        {new Date(notification.createdAt).toLocaleString()}
                                                    </p>
                                                ) : <span />}
                                                {target ? (
                                                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-primary">
                                                        Open <ArrowRight className="h-3 w-3" />
                                                    </span>
                                                ) : null}
                                            </div>
                                        </DropdownMenuItem>
                                    )
                                })
                            )}
                        </div>
                    </DropdownMenuContent>
                </DropdownMenu>

                {actions && (
                    <div className="flex items-center gap-2 ml-2 pl-4 border-l border-border h-8">
                        {actions}
                    </div>
                )}
            </div>
        </header>
    )
}

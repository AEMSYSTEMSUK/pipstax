"use client"

import * as React from "react"
import { cn } from "@/lib/utils"
import Image from "next/image"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { clearAuth, clearPlatformAuth } from "@/lib/auth"
import { LayoutDashboard, Building2, Users, Settings, LogOut, FileText, Calendar, HardHat, Receipt, FolderTree, LifeBuoy, Clock, BarChart3, Briefcase, FileSignature, Kanban, User } from "lucide-react"

interface SidebarItem {
    name: string;
    href: string;
    icon: React.ReactNode;
}

interface AppSidebarProps extends React.HTMLAttributes<HTMLDivElement> {
    items: SidebarItem[];
    portalName: string;
    brandName?: string;
    logoUrl?: string;
    footerNote?: string;
}

export function AppSidebar({ items, portalName, brandName, logoUrl, footerNote, className, ...props }: AppSidebarProps) {
    const pathname = usePathname()
    const router = useRouter()

    return (
        <div className={cn("hidden md:flex flex-col w-64 border-r border-white/40 bg-white/20 backdrop-blur-2xl h-screen sticky top-0 left-0 z-40 shadow-[4px_0_24px_rgba(0,0,0,0.02)]", className)} {...props}>
            <div className="p-6 flex items-center space-x-3">
                {logoUrl ? (
                    <div className="h-8 w-8 rounded overflow-hidden border border-white/60 bg-white/60 flex items-center justify-center">
                        <Image src={logoUrl} alt="Logo" width={32} height={32} />
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
                    const isActive = pathname === item.href || pathname.startsWith(item.href + "/")
                    return (
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
                })}
            </nav>

            <div className="p-4 mt-auto border-t border-glass-border">
                <button
                    className="flex w-full items-center space-x-3 px-3 py-2 rounded-lg hover:bg-white/40 transition-colors text-left"
                    onClick={() => {
                        const ok = window.confirm("Are you sure you want to log out?")
                        if (!ok) return
                        if (pathname.startsWith("/sa")) {
                            clearPlatformAuth()
                            router.replace("/sa/login")
                            return
                        }
                        clearAuth()
                        router.replace("/sign-in")
                    }}
                >
                    <div className="h-8 w-8 rounded-full bg-gradient-to-tr from-primary to-primary-light flex items-center justify-center text-white font-bold text-xs ring-2 ring-white">
                        JD
                    </div>
                    <div className="flex flex-col">
                        <span className="text-sm font-medium">John Doe</span>
                        <span className="text-xs text-muted-foreground">Log out</span>
                    </div>
                </button>
                {footerNote && (
                    <div className="mt-3 text-[10px] text-muted-foreground text-center uppercase tracking-widest">
                        {footerNote}
                    </div>
                )}
            </div>
        </div>
    )
}

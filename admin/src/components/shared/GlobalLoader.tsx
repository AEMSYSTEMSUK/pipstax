"use client"

import { useEffect, useState } from "react"
import { subscribeLoading } from "@/lib/loading"
import { cn } from "@/lib/utils"

export function GlobalLoader() {
    const [active, setActive] = useState(false)

    useEffect(() => {
        return subscribeLoading((count) => setActive(count > 0))
    }, [])

    if (!active) return null

    return (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-[#F4F7FA]/80 backdrop-blur-sm">
            <div className="flex flex-col items-center gap-3">
                <div className="h-12 w-12 rounded-full border-4 border-primary/30 border-t-primary animate-spin" />
                <p className={cn("text-sm font-medium text-muted-foreground")}>Loading workspace...</p>
            </div>
        </div>
    )
}

"use client"

import * as React from "react"
import { cn } from "@/lib/utils"

export type ToastItem = {
    id: string
    title?: string
    description?: string
    variant?: "default" | "error" | "success"
}

type ToastContextValue = {
    toast: (item: Omit<ToastItem, "id">) => void
}

const ToastContext = React.createContext<ToastContextValue | undefined>(undefined)

const variantStyles: Record<NonNullable<ToastItem["variant"]>, string> = {
    default: "border-white/70 bg-white/95 text-slate-900",
    error: "border-red-200 bg-red-50 text-red-700",
    success: "border-emerald-200 bg-emerald-50 text-emerald-700"
}

const descriptionStyles: Record<NonNullable<ToastItem["variant"]>, string> = {
    default: "text-slate-600",
    error: "text-red-600",
    success: "text-emerald-600"
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
    const [toasts, setToasts] = React.useState<ToastItem[]>([])

    const toast = React.useCallback((item: Omit<ToastItem, "id">) => {
        const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`
        setToasts((prev) => [...prev, { id, ...item }])
        setTimeout(() => {
            setToasts((prev) => prev.filter((t) => t.id !== id))
        }, 4000)
    }, [])

    return (
        <ToastContext.Provider value={{ toast }}>
            {children}
            <div className="fixed right-4 top-4 z-[9999] flex w-[320px] flex-col gap-3">
                {toasts.map((item) => (
                    <div
                        key={item.id}
                        className={cn(
                            "rounded-xl border px-4 py-3 shadow-lg backdrop-blur-xl",
                            variantStyles[item.variant ?? "default"]
                        )}
                    >
                        {item.title && <p className="text-sm font-semibold">{item.title}</p>}
                        {item.description && (
                            <p className={cn("text-xs mt-1", descriptionStyles[item.variant ?? "default"])}>
                                {item.description}
                            </p>
                        )}
                    </div>
                ))}
            </div>
        </ToastContext.Provider>
    )
}

export const useToast = () => {
    const ctx = React.useContext(ToastContext)
    if (!ctx) {
        throw new Error("useToast must be used within ToastProvider")
    }
    return ctx
}

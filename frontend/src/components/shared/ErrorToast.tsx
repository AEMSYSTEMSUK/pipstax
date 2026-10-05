"use client"

import { useEffect } from "react"
import { useToast } from "@/components/ui/toast"

export function ErrorToast({ error, onClear }: { error?: string | null; onClear?: () => void }) {
    const { toast } = useToast()

    useEffect(() => {
        if (!error) return
        toast({ title: "Something went wrong", description: error, variant: "error" })
        onClear?.()
    }, [error, onClear, toast])

    return null
}

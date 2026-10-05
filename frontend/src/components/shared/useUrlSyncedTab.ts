"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"

type UseUrlSyncedTabOptions<T extends string> = {
    defaultTab: T
    allowedTabs: readonly T[]
    paramName?: string
}

export function useUrlSyncedTab<T extends string>({
    defaultTab,
    allowedTabs,
    paramName = "tab",
}: UseUrlSyncedTabOptions<T>) {
    const router = useRouter()
    const pathname = usePathname()
    const searchParams = useSearchParams()
    const allowedTabSet = useMemo(() => new Set<T>(allowedTabs), [allowedTabs])

    const getUrlTab = useCallback(() => {
        const requestedTab = searchParams.get(paramName) as T | null
        return requestedTab && allowedTabSet.has(requestedTab) ? requestedTab : defaultTab
    }, [allowedTabSet, defaultTab, paramName, searchParams])

    const [activeTab, setActiveTabState] = useState<T>(getUrlTab)

    const setActiveTab = useCallback((nextTab: string) => {
        if (!allowedTabSet.has(nextTab as T)) return
        const validTab = nextTab as T

        setActiveTabState(validTab)

        const params = new URLSearchParams(searchParams.toString())
        if (validTab === defaultTab) {
            params.delete(paramName)
        } else {
            params.set(paramName, validTab)
        }

        const nextQuery = params.toString()
        router.replace(`${pathname}${nextQuery ? `?${nextQuery}` : ""}`, { scroll: false })
    }, [allowedTabSet, defaultTab, paramName, pathname, router, searchParams])

    useEffect(() => {
        const nextTab = getUrlTab()
        setActiveTabState(nextTab)

        const requestedTab = searchParams.get(paramName)
        if (requestedTab && !allowedTabSet.has(requestedTab as T)) {
            const params = new URLSearchParams(searchParams.toString())
            params.delete(paramName)
            const nextQuery = params.toString()
            router.replace(`${pathname}${nextQuery ? `?${nextQuery}` : ""}`, { scroll: false })
        }
    }, [allowedTabSet, getUrlTab, paramName, pathname, router, searchParams])

    return [activeTab, setActiveTab] as const
}

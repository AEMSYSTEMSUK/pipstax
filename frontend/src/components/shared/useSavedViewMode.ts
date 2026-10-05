"use client"

import { Dispatch, SetStateAction, useEffect, useState } from "react"

export function useSavedViewMode<T extends string>(
    storageKey: string,
    defaultView: T,
    allowedViews: readonly T[]
): [T, Dispatch<SetStateAction<T>>] {
    const [view, setViewState] = useState<T>(defaultView)

    useEffect(() => {
        try {
            const saved = window.localStorage.getItem(storageKey) as T | null
            if (saved && allowedViews.includes(saved)) {
                setViewState(saved)
            }
        } catch {
            // Keep the default if browser storage is unavailable.
        }
    }, [allowedViews, storageKey])

    const setView: Dispatch<SetStateAction<T>> = (next) => {
        setViewState((current) => {
            const resolved = typeof next === "function" ? (next as (value: T) => T)(current) : next
            if (allowedViews.includes(resolved)) {
                try {
                    window.localStorage.setItem(storageKey, resolved)
                } catch {
                    // Local preference is optional; state still updates for this session.
                }
                return resolved
            }
            return current
        })
    }

    return [view, setView]
}

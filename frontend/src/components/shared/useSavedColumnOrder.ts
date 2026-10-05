"use client"

import { DragEvent, useEffect, useMemo, useState } from "react"
import { apiGet, apiPut } from "@/lib/api"

const COLUMN_DRAG_TYPE = "application/x-pipstack-board-column"

type ColumnKeyGetter<T> = (column: T) => string

const defaultGetColumnKey = <T,>(column: T) => {
    const source = column as Record<string, unknown>
    return String(source.key ?? source.value ?? "")
}

export function useSavedColumnOrder<T>(
    columns: T[],
    storageKey: string,
    getColumnKey: ColumnKeyGetter<T> = defaultGetColumnKey
) {
    const [savedOrder, setSavedOrder] = useState<string[]>([])

    useEffect(() => {
        let cancelled = false
        try {
            const raw = window.localStorage.getItem(storageKey)
            const parsed = JSON.parse(raw ?? "[]")
            if (!cancelled && Array.isArray(parsed)) {
                setSavedOrder(parsed.map(String).filter(Boolean))
            }
        } catch {
            if (!cancelled) setSavedOrder([])
        }
        apiGet<{ key: string; order: string[] }>(`/ui-preferences/board-columns?key=${encodeURIComponent(storageKey)}`)
            .then((response) => {
                if (cancelled) return
                const remoteOrder = Array.isArray(response.data?.order) ? response.data.order.map(String).filter(Boolean) : []
                setSavedOrder(remoteOrder)
                try {
                    if (remoteOrder.length > 0) {
                        window.localStorage.setItem(storageKey, JSON.stringify(remoteOrder))
                    } else {
                        window.localStorage.removeItem(storageKey)
                    }
                } catch {
                    // Local fallback is optional; the server remains the shared source of truth.
                }
            })
            .catch(() => {
                // Keep the local fallback when the shared company preference cannot be loaded.
            })
        return () => {
            cancelled = true
        }
    }, [storageKey])

    const orderedColumns = useMemo(() => {
        const columnMap = new Map(columns.map((column) => [getColumnKey(column), column]))
        const orderedKeys = [
            ...savedOrder.filter((key) => columnMap.has(key)),
            ...columns.map(getColumnKey).filter((key) => !savedOrder.includes(key)),
        ]
        return orderedKeys.map((key) => columnMap.get(key)).filter(Boolean) as T[]
    }, [columns, getColumnKey, savedOrder])

    const persistOrder = (nextOrder: string[]) => {
        setSavedOrder(nextOrder)
        try {
            window.localStorage.setItem(storageKey, JSON.stringify(nextOrder))
        } catch {
            // Browser storage may be unavailable; the current render can still use state.
        }
        apiPut<{ key: string; order: string[] }>("/ui-preferences/board-columns", { key: storageKey, order: nextOrder }).catch(() => {
            // The local state still updates immediately; a future load can resync from the server.
        })
    }

    const moveColumn = (draggedKey: string, targetKey: string) => {
        if (!draggedKey || !targetKey || draggedKey === targetKey) return
        const currentOrder = orderedColumns.map(getColumnKey)
        const fromIndex = currentOrder.indexOf(draggedKey)
        const toIndex = currentOrder.indexOf(targetKey)
        if (fromIndex < 0 || toIndex < 0) return
        const nextOrder = [...currentOrder]
        const [removed] = nextOrder.splice(fromIndex, 1)
        nextOrder.splice(toIndex, 0, removed)
        persistOrder(nextOrder)
    }

    const resetColumnOrder = () => {
        setSavedOrder([])
        try {
            window.localStorage.removeItem(storageKey)
        } catch {
            // Ignore storage failures.
        }
        apiPut<{ key: string; order: string[] }>("/ui-preferences/board-columns", { key: storageKey, order: [] }).catch(() => {
            // Ignore server failures; reset still applies for this browser session.
        })
    }

    const getColumnDragProps = (column: T) => {
        const columnKey = getColumnKey(column)
        return {
            draggable: true,
            onDragStart: (event: DragEvent<HTMLElement>) => {
                event.dataTransfer.effectAllowed = "move"
                event.dataTransfer.setData(COLUMN_DRAG_TYPE, columnKey)
            },
            onDragOver: (event: DragEvent<HTMLElement>) => {
                if (!Array.from(event.dataTransfer.types).includes(COLUMN_DRAG_TYPE)) return
                event.preventDefault()
                event.dataTransfer.dropEffect = "move"
            },
            onDrop: (event: DragEvent<HTMLElement>) => {
                const draggedKey = event.dataTransfer.getData(COLUMN_DRAG_TYPE)
                if (!draggedKey) return false
                event.preventDefault()
                event.stopPropagation()
                moveColumn(draggedKey, columnKey)
                return true
            },
        }
    }

    return {
        orderedColumns,
        getColumnDragProps,
        resetColumnOrder,
    }
}

export const isBoardColumnDrag = (event: DragEvent<HTMLElement>) =>
    Array.from(event.dataTransfer.types).includes(COLUMN_DRAG_TYPE)

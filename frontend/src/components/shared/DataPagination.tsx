"use client"

import { useEffect, useMemo, useState } from "react"
import { Button } from "@/components/ui/button"

export function useClientPagination<T>(items: T[], pageSize = 10) {
  const [page, setPage] = useState(1)
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize))

  useEffect(() => {
    setPage(1)
  }, [items.length, pageSize])

  const currentPage = Math.min(page, totalPages)
  const paginatedItems = useMemo(() => {
    const start = (currentPage - 1) * pageSize
    return items.slice(start, start + pageSize)
  }, [currentPage, items, pageSize])

  return {
    page: currentPage,
    pageSize,
    totalItems: items.length,
    totalPages,
    paginatedItems,
    setPage,
  }
}

type DataPaginationProps = {
  page: number
  pageSize: number
  totalItems: number
  totalPages: number
  onPageChange: (page: number) => void
}

export function DataPagination({ page, pageSize, totalItems, totalPages, onPageChange }: DataPaginationProps) {
  if (totalItems <= pageSize) return null

  const start = (page - 1) * pageSize + 1
  const end = Math.min(page * pageSize, totalItems)

  return (
    <div className="flex flex-col gap-3 border-t border-glass-border/50 px-4 py-3 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
      <span>
        Showing {start}-{end} of {totalItems}
      </span>
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" onClick={() => onPageChange(Math.max(1, page - 1))} disabled={page <= 1}>
          Previous
        </Button>
        <span className="min-w-20 text-center">
          Page {page} of {totalPages}
        </span>
        <Button variant="outline" size="sm" onClick={() => onPageChange(Math.min(totalPages, page + 1))} disabled={page >= totalPages}>
          Next
        </Button>
      </div>
    </div>
  )
}

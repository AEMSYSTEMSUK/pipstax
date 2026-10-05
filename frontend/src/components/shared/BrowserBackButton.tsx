"use client"

import { useRouter } from "next/navigation"
import type { ReactNode } from "react"

type BrowserBackButtonProps = {
    children: ReactNode
    className?: string
    title?: string
}

export const BrowserBackButton = ({ children, className, title }: BrowserBackButtonProps) => {
    const router = useRouter()
    const mergedClassName = ["border-0 bg-transparent p-0 text-left cursor-pointer", className]
        .filter(Boolean)
        .join(" ")

    return (
        <button
            type="button"
            title={title}
            className={mergedClassName}
            onClick={() => router.back()}
        >
            {children}
        </button>
    )
}

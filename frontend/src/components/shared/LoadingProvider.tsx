"use client"

import { GlobalLoader } from "@/components/shared/GlobalLoader"

export function LoadingProvider({ children }: { children: React.ReactNode }) {
    return (
        <>
            {children}
            <GlobalLoader />
        </>
    )
}

"use client"

import { createContext, useContext } from "react"
import { DEFAULT_TENANT_FEATURE_FLAGS, TenantFeatureFlags } from "@/lib/tenant-features"

const TenantFeaturesContext = createContext<TenantFeatureFlags>(DEFAULT_TENANT_FEATURE_FLAGS)

export function TenantFeaturesProvider({
    value,
    children,
}: {
    value: TenantFeatureFlags
    children: React.ReactNode
}) {
    return (
        <TenantFeaturesContext.Provider value={value}>
            {children}
        </TenantFeaturesContext.Provider>
    )
}

export function useTenantFeatures() {
    return useContext(TenantFeaturesContext)
}

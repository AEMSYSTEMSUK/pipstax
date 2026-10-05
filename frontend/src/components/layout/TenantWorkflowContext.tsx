"use client"

import { createContext, useContext } from "react"
import { DEFAULT_TENANT_WORKFLOW_CONFIG, TenantWorkflowConfig } from "@/lib/workflows"

const TenantWorkflowContext = createContext<TenantWorkflowConfig>(DEFAULT_TENANT_WORKFLOW_CONFIG)

export function TenantWorkflowProvider({
    value,
    children,
}: {
    value: TenantWorkflowConfig
    children: React.ReactNode
}) {
    return <TenantWorkflowContext.Provider value={value}>{children}</TenantWorkflowContext.Provider>
}

export const useTenantWorkflowConfig = () => useContext(TenantWorkflowContext)

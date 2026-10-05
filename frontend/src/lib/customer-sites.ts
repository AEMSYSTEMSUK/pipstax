import { apiGet } from "@/lib/api"

export type CustomerSiteOption = {
    id: string
    customerId?: string | null
    name: string
    category?: string | null
    reference?: string | null
    status?: string | null
    siteGroupName?: string | null
    mainContactId?: string | null
    tags?: string[] | null
    additionalInformation?: string | null
    addressLine1?: string | null
    addressLine2?: string | null
    city?: string | null
    state?: string | null
    postalCode?: string | null
    country?: string | null
}

export const formatCustomerSiteAddress = (site?: CustomerSiteOption | null) => {
    if (!site) return ""
    return [
        site.addressLine1,
        site.addressLine2,
        site.city,
        site.state,
        site.postalCode,
        site.country,
    ]
        .map((part) => String(part ?? "").trim())
        .filter(Boolean)
        .join(", ")
}

export const customerSiteToAddressValue = (site?: CustomerSiteOption | null) => ({
    addressLine1: String(site?.addressLine1 ?? ""),
    addressLine2: String(site?.addressLine2 ?? ""),
    city: String(site?.city ?? ""),
    state: String(site?.state ?? ""),
    postalCode: String(site?.postalCode ?? ""),
    country: String(site?.country ?? "United Kingdom"),
})

export const formatCustomerSiteLabel = (site: CustomerSiteOption) => {
    const groupLabel = site.siteGroupName ? ` • ${site.siteGroupName}` : ""
    const refLabel = site.reference ? ` (${site.reference})` : ""
    return `${site.name}${refLabel}${groupLabel}`
}

export const fetchCustomerSites = async (customerId: string) => {
    if (!customerId) return [] as CustomerSiteOption[]
    const response = await apiGet<CustomerSiteOption[]>(`/customers/${customerId}/sites`)
    return Array.isArray(response.data) ? response.data : []
}

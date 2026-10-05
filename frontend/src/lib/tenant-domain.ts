import { classifyAppHost } from "@/lib/host"

export const getTenantSubdomain = (hostname: string, baseDomain?: string) => {
    const appHost = classifyAppHost(hostname, baseDomain)
    return appHost.kind === "tenant" ? appHost.subdomain : ""
}

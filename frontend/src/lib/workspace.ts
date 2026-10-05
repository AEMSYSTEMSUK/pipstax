const tenantSubdomainsEnabled = () =>
    process.env.NEXT_PUBLIC_ENABLE_TENANT_SUBDOMAINS === "true"

export const buildTenantUrl = (subdomain: string, path: string) => {
    const baseDomain = process.env.NEXT_PUBLIC_TENANT_BASE_DOMAIN ?? ""
    if (!subdomain || !tenantSubdomainsEnabled()) {
        if (baseDomain) {
            const { protocol, port } = window.location
            return `${protocol}//${baseDomain}${port ? `:${port}` : ""}${path}`
        }
        return path
    }
    const { protocol, hostname, port } = window.location
    if (!baseDomain && (hostname === "localhost" || hostname === "127.0.0.1")) {
        return `${protocol}//${subdomain}.localhost${port ? `:${port}` : ""}${path}`
    }
    if (baseDomain) {
        return `${protocol}//${subdomain}.${baseDomain}${port ? `:${port}` : ""}${path}`
    }
    if (hostname.endsWith(".localhost")) {
        return `${protocol}//${subdomain}.localhost${port ? `:${port}` : ""}${path}`
    }
    return `${protocol}//${hostname}${port ? `:${port}` : ""}${path}`
}

export const buildWorkspaceAuthUrl = (path = "/common-login") => {
    const { origin } = window.location
    return `${origin}${path}`
}

export const buildAppPortalUrl = (path = "") => {
    const baseUrl = process.env.NEXT_PUBLIC_APP_PORTAL_URL ?? ""
    if (baseUrl) {
        return `${baseUrl}${path}`
    }
    const { protocol, hostname, port } = window.location
    return `${protocol}//${hostname}${port ? `:${port}` : ""}${path}`
}

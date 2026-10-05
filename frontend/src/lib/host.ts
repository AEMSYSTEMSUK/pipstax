const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1"])
const RESERVED_SUBDOMAINS = new Set(["admin", "api", "worker"])

export type AppHost =
    | { kind: "local"; hostname: string }
    | { kind: "root"; hostname: string }
    | { kind: "tenant"; hostname: string; subdomain: string }
    | { kind: "reserved"; hostname: string; subdomain: string }
    | { kind: "external"; hostname: string }

export const normalizeHostname = (value?: string | null) => {
    const first = String(value ?? "").split(",")[0]?.trim().toLowerCase() ?? ""
    if (!first) return ""
    if (first.startsWith("[")) {
        const closingBracket = first.indexOf("]")
        return closingBracket >= 0 ? first.slice(1, closingBracket) : first
    }
    return first.split(":")[0]
}

export const normalizeBaseDomain = (value?: string | null) => {
    const raw = String(value ?? "").trim()
    if (!raw) return ""
    try {
        return new URL(raw.includes("://") ? raw : `https://${raw}`).hostname.toLowerCase()
    } catch {
        return normalizeHostname(raw.split("/")[0])
    }
}

export const classifyAppHost = (hostValue?: string | null, baseValue?: string | null): AppHost => {
    const hostname = normalizeHostname(hostValue)
    const baseDomain = normalizeBaseDomain(baseValue)

    if (!hostname || LOCAL_HOSTS.has(hostname) || hostname.endsWith(".localhost")) {
        const localSubdomain = hostname.endsWith(".localhost")
            ? hostname.slice(0, -".localhost".length)
            : ""
        return localSubdomain
            ? { kind: "tenant", hostname, subdomain: localSubdomain }
            : { kind: "local", hostname }
    }

    if (!baseDomain) {
        const parts = hostname.split(".")
        if (parts.length <= 2) return { kind: "root", hostname }
        const subdomain = parts.slice(0, -2).join(".")
        return subdomain.includes(".")
            ? { kind: "external", hostname }
            : { kind: "tenant", hostname, subdomain }
    }

    if (hostname === baseDomain || hostname === `www.${baseDomain}`) {
        return { kind: "root", hostname }
    }
    if (!hostname.endsWith(`.${baseDomain}`)) {
        return { kind: "external", hostname }
    }

    const subdomain = hostname.slice(0, -(baseDomain.length + 1))
    if (!subdomain || subdomain.includes(".")) {
        return { kind: "external", hostname }
    }
    if (RESERVED_SUBDOMAINS.has(subdomain)) {
        return { kind: "reserved", hostname, subdomain }
    }
    return { kind: "tenant", hostname, subdomain }
}


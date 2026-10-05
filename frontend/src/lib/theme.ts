const DEFAULT_PRIMARY = "#0E8585"

const normalizeHex = (value?: string) => {
    if (!value) return DEFAULT_PRIMARY
    const trimmed = value.trim()
    if (!trimmed) return DEFAULT_PRIMARY
    const hex = trimmed.startsWith("#") ? trimmed : `#${trimmed}`
    if (/^#[0-9a-fA-F]{3}$/.test(hex)) {
        return `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`.toUpperCase()
    }
    if (/^#[0-9a-fA-F]{6}$/.test(hex)) {
        return hex.toUpperCase()
    }
    return DEFAULT_PRIMARY
}

const hexToRgb = (hex: string) => {
    const normalized = normalizeHex(hex).replace("#", "")
    const r = parseInt(normalized.slice(0, 2), 16)
    const g = parseInt(normalized.slice(2, 4), 16)
    const b = parseInt(normalized.slice(4, 6), 16)
    return { r, g, b }
}

const rgbToHex = ({ r, g, b }: { r: number; g: number; b: number }) => {
    const clamp = (value: number) => Math.max(0, Math.min(255, Math.round(value)))
    const toHex = (value: number) => clamp(value).toString(16).padStart(2, "0")
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`.toUpperCase()
}

const mix = (hexA: string, hexB: string, weightB: number) => {
    const a = hexToRgb(hexA)
    const b = hexToRgb(hexB)
    const weight = Math.max(0, Math.min(1, weightB))
    return rgbToHex({
        r: a.r * (1 - weight) + b.r * weight,
        g: a.g * (1 - weight) + b.g * weight,
        b: a.b * (1 - weight) + b.b * weight
    })
}

const getContrastColor = (hex: string) => {
    const { r, g, b } = hexToRgb(hex)
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255
    return luminance > 0.6 ? "#0F172A" : "#FFFFFF"
}

export const applyTenantTheme = (primaryColor?: string) => {
    if (typeof document === "undefined") return
    const primary = normalizeHex(primaryColor)
    const primaryLight = mix(primary, "#FFFFFF", 0.35)
    const secondary = mix(primary, "#FFFFFF", 0.88)
    const accent = mix(primary, "#FFFFFF", 0.55)
    const ring = primary
    const sidebarAccent = mix(primary, "#FFFFFF", 0.75)

    const root = document.documentElement
    root.style.setProperty("--primary", primary)
    root.style.setProperty("--primary-foreground", getContrastColor(primary))
    root.style.setProperty("--primary-light", primaryLight)
    root.style.setProperty("--secondary", secondary)
    root.style.setProperty("--secondary-foreground", mix(primary, "#000000", 0.35))
    root.style.setProperty("--accent", accent)
    root.style.setProperty("--accent-foreground", getContrastColor(accent))
    root.style.setProperty("--ring", ring)
    root.style.setProperty("--sidebar-primary", primary)
    root.style.setProperty("--sidebar-primary-foreground", getContrastColor(primary))
    root.style.setProperty("--sidebar-accent", sidebarAccent)
    root.style.setProperty("--sidebar-accent-foreground", mix(primary, "#000000", 0.35))
    root.style.setProperty("--sidebar-ring", ring)
}

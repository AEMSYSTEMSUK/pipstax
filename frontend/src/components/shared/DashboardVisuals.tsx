import type React from "react"
import { GlassCard, GlassCardContent, GlassCardHeader, GlassCardTitle, GlassCardDescription } from "@/components/glass/GlassCard"
import { cn } from "@/lib/utils"

export function formatCurrency(value: number | null | undefined) {
    return `£${Number(value ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export function ExecutiveMetric({
    label,
    value,
    description,
    icon,
    tone = "primary",
    className,
}: {
    label: string
    value: string | number
    description?: string
    icon: React.ReactNode
    tone?: "primary" | "emerald" | "amber" | "rose" | "sky" | "slate"
    className?: string
}) {
    const tones = {
        primary: "from-primary/15 to-primary/5 text-primary",
        emerald: "from-emerald-500/15 to-emerald-500/5 text-emerald-700",
        amber: "from-amber-500/20 to-amber-500/5 text-amber-700",
        rose: "from-rose-500/15 to-rose-500/5 text-rose-700",
        sky: "from-sky-500/15 to-sky-500/5 text-sky-700",
        slate: "from-slate-500/15 to-slate-500/5 text-slate-700",
    }

    return (
        <GlassCard className={cn("overflow-hidden bg-white/70 transition hover:-translate-y-0.5 hover:shadow-xl", className)}>
            <GlassCardContent className="p-5">
                <div className="flex items-start justify-between gap-4">
                    <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">{label}</p>
                        <div className="mt-3 text-3xl font-bold tracking-tight text-foreground">{value}</div>
                        {description ? <p className="mt-1 text-xs font-medium text-muted-foreground">{description}</p> : null}
                    </div>
                    <div className={cn("flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br", tones[tone])}>
                        {icon}
                    </div>
                </div>
            </GlassCardContent>
        </GlassCard>
    )
}

export function BarListCard({
    title,
    description,
    rows,
    valuePrefix = "",
}: {
    title: string
    description?: string
    rows: Array<{ label: string; value: number; meta?: string }>
    valuePrefix?: string
}) {
    const max = Math.max(...rows.map((row) => row.value), 1)

    return (
        <GlassCard className="bg-white/70">
            <GlassCardHeader>
                <GlassCardTitle className="text-lg">{title}</GlassCardTitle>
                {description ? <GlassCardDescription>{description}</GlassCardDescription> : null}
            </GlassCardHeader>
            <GlassCardContent className="space-y-4">
                {rows.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-glass-border bg-white/50 p-6 text-sm text-muted-foreground">No data yet.</div>
                ) : rows.map((row) => (
                    <div key={row.label} className="space-y-2">
                        <div className="flex items-center justify-between gap-3 text-sm">
                            <span className="truncate font-semibold text-foreground">{row.label}</span>
                            <span className="shrink-0 font-bold text-primary">{valuePrefix}{row.value.toLocaleString()}</span>
                        </div>
                        <div className="h-2 overflow-hidden rounded-full bg-black/5">
                            <div className="h-full rounded-full bg-gradient-to-r from-primary to-emerald-500" style={{ width: `${Math.max(6, (row.value / max) * 100)}%` }} />
                        </div>
                        {row.meta ? <p className="text-xs text-muted-foreground">{row.meta}</p> : null}
                    </div>
                ))}
            </GlassCardContent>
        </GlassCard>
    )
}

export function DonutCard({
    title,
    description,
    value,
    total,
    centerLabel,
}: {
    title: string
    description?: string
    value: number
    total: number
    centerLabel: string
}) {
    const pct = total > 0 ? Math.min(100, Math.round((value / total) * 100)) : 0

    return (
        <GlassCard className="bg-white/70">
            <GlassCardHeader>
                <GlassCardTitle className="text-lg">{title}</GlassCardTitle>
                {description ? <GlassCardDescription>{description}</GlassCardDescription> : null}
            </GlassCardHeader>
            <GlassCardContent className="flex items-center justify-center">
                <div
                    className="relative flex h-44 w-44 items-center justify-center rounded-full"
                    style={{ background: `conic-gradient(var(--primary) ${pct}%, rgba(15,23,42,0.08) 0)` }}
                >
                    <div className="flex h-32 w-32 flex-col items-center justify-center rounded-full bg-white shadow-inner">
                        <div className="text-3xl font-bold text-foreground">{pct}%</div>
                        <div className="text-center text-xs font-semibold uppercase tracking-wide text-muted-foreground">{centerLabel}</div>
                    </div>
                </div>
            </GlassCardContent>
        </GlassCard>
    )
}

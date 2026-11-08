import { GlassCard, GlassCardContent, GlassCardHeader, GlassCardTitle } from "@/components/glass/GlassCard"
import { cn } from "@/lib/utils"

interface StatCardProps {
    title: string
    value: string | number
    icon: React.ReactNode
    trend?: {
        value: number
        label: string
    }
    description?: string
    className?: string
}

export function StatCard({ title, value, icon, trend, description, className }: StatCardProps) {
    return (
        <GlassCard className={className}>
            <GlassCardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
                <GlassCardTitle className="text-sm font-medium text-muted-foreground">
                    {title}
                </GlassCardTitle>
                <div className="h-8 w-8 rounded-full bg-primary/10 text-primary flex items-center justify-center">
                    {icon}
                </div>
            </GlassCardHeader>
            <GlassCardContent>
                <div className="text-2xl font-bold text-foreground">{value}</div>
                {trend && (
                    <p className="text-xs mt-1 font-medium">
                        <span className={cn(
                            trend.value >= 0 ? "text-success" : "text-destructive"
                        )}>
                            {trend.value >= 0 ? "+" : ""}{trend.value}%
                        </span>
                        {" "}
                        <span className="text-muted-foreground">{trend.label}</span>
                    </p>
                )}
                {description && !trend && (
                    <p className="text-xs text-muted-foreground font-medium">{description}</p>
                )}
            </GlassCardContent>
        </GlassCard>
    )
}

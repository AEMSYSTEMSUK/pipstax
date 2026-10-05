import * as React from "react"
import { cn } from "@/lib/utils"

const GlassPanel = React.forwardRef<
    HTMLDivElement,
    React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
    <div
        ref={ref}
        className={cn(
            "glass-panel text-card-foreground p-6",
            className
        )}
        {...props}
    />
))
GlassPanel.displayName = "GlassPanel"

export { GlassPanel }

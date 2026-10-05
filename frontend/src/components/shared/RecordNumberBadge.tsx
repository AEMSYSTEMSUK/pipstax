import { cn } from "@/lib/utils"

type RecordNumberBadgeProps = {
  value?: string | null
  fallback?: string
  className?: string
}

export function RecordNumberBadge({ value, fallback = "Pending", className }: RecordNumberBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex w-fit items-center rounded-md border border-primary/25 bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary shadow-sm",
        className
      )}
    >
      {value || fallback}
    </span>
  )
}

import * as React from "react"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

export type StatusType = 'Paid' | 'Open' | 'Overdue' | 'Sent' | 'Draft' | 'Accepted' | 'Rejected' | 'In Progress' | 'Completed' | 'Scheduled' | 'Assigned' | 'Pending' | 'Emergency' | 'High' | 'Medium' | 'Low';

interface StatusBadgeProps {
    status: StatusType | string;
    className?: string;
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
    const getColors = (s: string) => {
        switch (s) {
            case 'Paid':
            case 'Accepted':
            case 'Completed':
            case 'Resolved':
            case 'In Progress':
            case 'success':
            case 'success':
                return "bg-success text-success-foreground border-success/20";
            case 'Open':
            case 'Sent':
            case 'Scheduled':
            case 'Assigned':
            case 'High':
            case 'warning':
                return "bg-warning text-warning-foreground border-warning/20";
            case 'Overdue':
            case 'Rejected':
            case 'Emergency':
            case 'destructive':
                return "bg-destructive/10 text-destructive border-destructive/20";
            case 'Draft':
            case 'Pending':
            case 'Low':
            case 'secondary':
                return "bg-gray-100 text-gray-600 border-gray-200";
            default:
                return "bg-primary/10 text-primary border-primary/20";
        }
    }

    return (
        <span className={cn(
            "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors",
            getColors(status),
            className
        )}>
            {status}
        </span>
    )
}

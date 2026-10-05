import * as React from "react"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

export type StatusType = 'Paid' | 'Open' | 'Overdue' | 'Sent' | 'Draft' | 'Accepted' | 'Rejected' | 'In Progress' | 'Completed' | 'Closed' | 'Created' | 'Scheduled' | 'Not Assigned' | 'Assigned' | 'Live' | 'Needs Attention' | 'Finished' | 'Pending' | 'Emergency' | 'High' | 'Medium' | 'Low';

interface StatusBadgeProps {
    status: StatusType | string;
    className?: string;
    children?: React.ReactNode;
}

export function StatusBadge({ status, className, children }: StatusBadgeProps) {
    const getColors = (s: string) => {
        switch (s) {
            case 'Created':
                return "bg-slate-100 text-slate-700 border-slate-200";
            case 'Scheduled':
                return "bg-sky-100 text-sky-700 border-sky-200";
            case 'Not Assigned':
                return "bg-orange-100 text-orange-700 border-orange-200";
            case 'Assigned':
                return "bg-indigo-100 text-indigo-700 border-indigo-200";
            case 'Live':
                return "bg-emerald-100 text-emerald-700 border-emerald-200";
            case 'Needs Attention':
                return "bg-rose-100 text-rose-700 border-rose-200";
            case 'Finished':
                return "bg-violet-100 text-violet-700 border-violet-200";
            case 'Completed':
            case 'Closed':
                return "bg-green-100 text-green-700 border-green-200";
            case 'New':
                return "bg-sky-100 text-sky-700 border-sky-200";
            case 'Contacted':
                return "bg-indigo-100 text-indigo-700 border-indigo-200";
            case 'Qualified':
                return "bg-violet-100 text-violet-700 border-violet-200";
            case 'Proposal':
                return "bg-amber-100 text-amber-700 border-amber-200";
            case 'Won':
                return "bg-green-100 text-green-700 border-green-200";
            case 'Lost':
                return "bg-rose-100 text-rose-700 border-rose-200";
            case 'Signed':
                return "bg-green-100 text-green-700 border-green-200";
            case 'Declined':
            case 'Cancelled':
            case 'Void':
                return "bg-rose-100 text-rose-700 border-rose-200";
            case 'Expired':
                return "bg-orange-100 text-orange-700 border-orange-200";
            case 'Viewed':
                return "bg-cyan-100 text-cyan-700 border-cyan-200";
            case 'Partially Paid':
                return "bg-amber-100 text-amber-700 border-amber-200";
            case 'Paid':
            case 'Accepted':
            case 'Resolved':
            case 'In Progress':
            case 'success':
                return "bg-success text-success-foreground border-success/20";
            case 'Open':
            case 'Sent':
            case 'Viewed':
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
            {children ?? status}
        </span>
    )
}

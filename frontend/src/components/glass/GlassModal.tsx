import * as React from "react"
import { cn } from "@/lib/utils"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
    DialogFooter
} from "@/components/ui/dialog"

interface GlassModalProps extends React.ComponentPropsWithoutRef<typeof Dialog> {
    trigger?: React.ReactNode;
    title: React.ReactNode;
    description?: React.ReactNode;
    children?: React.ReactNode;
    footer?: React.ReactNode;
    className?: string;
}

export function GlassModal({ trigger, title, description, children, footer, className, ...props }: GlassModalProps) {
    const handleInteractOutside = (event: Event) => {
        const target = event.target as HTMLElement | null
        if (
            target?.closest("#datepicker-portal") ||
            target?.closest(".react-datepicker") ||
            target?.closest(".react-datepicker-popper")
        ) {
            event.preventDefault()
        }
    }

    return (
        <Dialog {...props}>
            {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
            <DialogContent
                onInteractOutside={handleInteractOutside}
                className={cn("w-[94vw] sm:max-w-[720px] max-h-[85vh] overflow-y-auto border-glass-border bg-white/80 backdrop-blur-2xl shadow-[0_16px_40px_rgba(14,133,133,0.15)] rounded-2xl", className)}
            >
                <DialogHeader>
                    <DialogTitle className="text-xl tracking-tight">{title}</DialogTitle>
                    {description && <DialogDescription>{description}</DialogDescription>}
                </DialogHeader>
                {children ? <div className="py-4">{children}</div> : null}
                {footer && <DialogFooter>{footer}</DialogFooter>}
            </DialogContent>
        </Dialog>
    )
}

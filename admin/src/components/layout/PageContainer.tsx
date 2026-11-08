import * as React from "react"
import { cn } from "@/lib/utils"

export function PageContainer({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
    return (
        <div className={cn("flex-1 p-4 md:p-8 pt-6 relative min-h-screen", className)} {...props}>
            {/* Ultra-Premium Blobs Background */}
            <div className="fixed inset-0 min-h-screen z-[-1] bg-[#F4F7FA] overflow-hidden">
                <div className="absolute top-[-10%] right-[-5%] w-[50%] h-[50%] rounded-full bg-primary/15 blur-[120px] pointer-events-none" />
                <div className="absolute bottom-[-10%] left-[-10%] w-[60%] h-[60%] rounded-full bg-accent/15 blur-[140px] pointer-events-none" />
                <div className="absolute top-[40%] left-[20%] w-[30%] h-[40%] rounded-full bg-teal-300/10 blur-[100px] pointer-events-none" />
                {/* Optional subtle noise overlay can go here if needed */}
            </div>

            <div className="max-w-[1600px] mx-auto space-y-6">
                {children}
            </div>
        </div>
    )
}

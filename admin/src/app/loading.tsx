export default function Loading() {
    return (
        <div className="min-h-screen flex items-center justify-center bg-[#F4F7FA]">
            <div className="flex flex-col items-center gap-3">
                <div className="h-12 w-12 rounded-full border-4 border-primary/30 border-t-primary animate-spin" />
                <p className="text-sm font-medium text-muted-foreground">Loading workspace...</p>
            </div>
        </div>
    )
}

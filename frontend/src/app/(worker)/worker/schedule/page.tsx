"use client"

import { useEffect, useState } from "react"
import { PageContainer } from "@/components/layout/PageContainer"
import { GlassCard, GlassCardContent, GlassCardHeader, GlassCardTitle, GlassCardDescription } from "@/components/glass/GlassCard"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { apiGet } from "@/lib/api"
import { ErrorToast } from "@/components/shared/ErrorToast"
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, MapPin, Clock } from "lucide-react"
import Link from "next/link"
import { addDays, format, startOfWeek, subDays } from "date-fns"

export default function WorkerSchedulePage() {
    const [currentDate, setCurrentDate] = useState(new Date())
    const [jobs, setJobs] = useState<any[]>([])
    const [error, setError] = useState<string | null>(null)
    const weekStart = startOfWeek(currentDate, { weekStartsOn: 1 }) // Start on Monday

    useEffect(() => {
        const load = async () => {
            try {
                const res = await apiGet<any[]>(`/jobs/assigned/me`)
                setJobs(Array.isArray(res.data) ? res.data : [])
                setError(null)
            } catch (err: any) {
                setError(err?.message ?? "Failed to load schedule")
            }
        }
        load()
    }, [])

    const getDayJobs = (dateToMatch: Date) => {
        const formattedDate = format(dateToMatch, 'yyyy-MM-dd');
        return jobs.filter(j => j.scheduledAt && format(new Date(j.scheduledAt), 'yyyy-MM-dd') === formattedDate);
    }

    const handlePrevWeek = () => setCurrentDate(subDays(currentDate, 7))
    const handleNextWeek = () => setCurrentDate(addDays(currentDate, 7))
    const handleToday = () => setCurrentDate(new Date())

    const getPriorityBadge = (priority: string) => {
        switch (priority) {
            case 'Emergency': return 'destructive'
            case 'High': return 'warning'
            case 'Medium': return 'default'
            default: return 'outline'
        }
    }

    return (
        <PageContainer>
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-foreground">My Schedule</h1>
                    <p className="text-muted-foreground mt-1 text-sm">View your upcoming assignments and calendar.</p>
                </div>

                <div className="flex items-center gap-2 bg-white/40 p-1 rounded-lg border border-glass-border">
                    <Button variant="ghost" size="icon" onClick={handlePrevWeek} className="h-8 w-8 hover:bg-white/50">
                        <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={handleToday} className="h-8 font-medium">
                        Today
                    </Button>
                    <Button variant="ghost" size="icon" onClick={handleNextWeek} className="h-8 w-8 hover:bg-white/50">
                        <ChevronRight className="h-4 w-4" />
                    </Button>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-7 gap-4">
                {/* Render 7 days of the week */}
                {[0, 1, 2, 3, 4, 5, 6].map((dayIndex) => {
                    const date = addDays(weekStart, dayIndex)
                    const jobs = getDayJobs(date)
                    const isToday = format(date, 'yyyy-MM-dd') === format(new Date(), 'yyyy-MM-dd')

                    return (
                        <GlassCard key={dayIndex} className={`flex flex-col h-[600px] overflow-hidden ${isToday ? 'ring-2 ring-primary border-primary/30 shadow-md' : ''}`}>
                            <div className={`p-3 border-b text-center ${isToday ? 'bg-primary/10 border-primary/20 text-primary-dark' : 'bg-black/5 border-glass-border'}`}>
                                <div className="text-xs font-semibold uppercase">{format(date, 'EEE')}</div>
                                <div className={`text-xl font-bold ${isToday ? 'text-primary' : ''}`}>{format(date, 'd')}</div>
                            </div>
                            <div className="p-2 flex-1 overflow-y-auto space-y-2 bg-white/10 mt-2">
                                {jobs.length === 0 ? (
                                    <div className="text-center text-xs text-muted-foreground pt-4">No jobs</div>
                                ) : (
                                    jobs.map(job => (
                                        <Link key={job.id} href={`/worker/jobs/${job.id}`}>
                                            <div className="p-2.5 rounded-lg border border-glass-border bg-white/60 hover:bg-white transition-colors text-left flex flex-col gap-1.5 shadow-sm group">
                                                <div className="flex justify-between items-start gap-1">
                                                    <span className="text-[10px] font-bold text-primary px-1.5 py-0.5 bg-primary/10 rounded">
                                                        {job.scheduledAt ? new Date(job.scheduledAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "TBD"}
                                                    </span>
                                                    {job.priority === 'Emergency' && <Badge variant="destructive" className="h-4 w-4 p-0 flex justify-center text-[8px]">!</Badge>}
                                                </div>
                                                <h4 className="text-xs font-bold leading-tight group-hover:text-primary transition-colors">{job.title}</h4>
                                                <div className="text-[10px] text-muted-foreground flex items-center gap-1 line-clamp-1">
                                                    <MapPin className="h-2.5 w-2.5 shrink-0" /> {job.location ?? "TBD"}
                                                </div>
                                            </div>
                                        </Link>
                                    ))
                                )}
                            </div>
                        </GlassCard>
                    )
                })}
            </div>
            <ErrorToast error={error} onClear={() => setError(null)} />
        </PageContainer>
    )
}

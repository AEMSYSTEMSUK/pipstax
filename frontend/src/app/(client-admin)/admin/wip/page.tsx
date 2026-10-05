"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { BriefcaseBusiness, CalendarClock, ClipboardList, Filter, PieChart, ReceiptText, UserRound } from "lucide-react"
import { PageContainer } from "@/components/layout/PageContainer"
import { GlassCard, GlassCardContent, GlassCardHeader, GlassCardTitle, GlassCardDescription } from "@/components/glass/GlassCard"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { StatusBadge } from "@/components/shared/StatusBadge"
import { RecordNumberBadge } from "@/components/shared/RecordNumberBadge"
import { BarListCard, ExecutiveMetric, formatCurrency } from "@/components/shared/DashboardVisuals"
import { apiGet } from "@/lib/api"
import { ErrorToast } from "@/components/shared/ErrorToast"

type WipItem = {
    id: string
    jobNumber?: string | null
    title?: string | null
    status?: string | null
    category?: string | null
    scheduledAt?: string | null
    customerName?: string | null
    siteName?: string | null
    salespersonId?: string | null
    salespersonName?: string | null
    jobValue: number
    invoicedValue: number
    remainingValue: number
}

type WipReport = {
    count: number
    totalValue: number
    byCategory: Record<string, { count: number; value: number }>
    bySalesperson: Record<string, { id?: string; name: string; count: number; value: number }>
    byMonth: Record<string, { count: number; value: number }>
    items: WipItem[]
    filterOptions?: {
        categories?: string[]
        months?: string[]
        salespeople?: Array<{ id?: string; name: string; count: number; value: number }>
    }
}

const ALL = "__all__"

const formatMonthLabel = (value: string) => {
    if (value === "Unscheduled") return value
    const [year, month] = value.split("-").map(Number)
    if (!year || !month) return value
    return new Date(year, month - 1, 1).toLocaleDateString("en-GB", { month: "long", year: "numeric" })
}

const formatStatus = (value?: string | null) => String(value ?? "Unknown").replace(/_/g, " ")

export default function WipPage() {
    const [report, setReport] = useState<WipReport | null>(null)
    const [month, setMonth] = useState(ALL)
    const [category, setCategory] = useState(ALL)
    const [salespersonId, setSalespersonId] = useState(ALL)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        const load = async () => {
            try {
                const params = new URLSearchParams()
                if (month !== ALL) params.set("month", month)
                if (category !== ALL) params.set("category", category)
                if (salespersonId !== ALL) params.set("salespersonId", salespersonId)
                const res = await apiGet<WipReport>(`/reports/wip${params.toString() ? `?${params}` : ""}`)
                setReport(res.data)
                setError(null)
            } catch (err: any) {
                setError(err?.message ?? "Failed to load WIP report")
            }
        }
        load()
    }, [category, month, salespersonId])

    const categoryRows = useMemo(
        () => Object.entries(report?.byCategory ?? {})
            .map(([label, row]) => ({ label, value: row.value, meta: `${row.count} active job${row.count === 1 ? "" : "s"}` }))
            .sort((a, b) => b.value - a.value),
        [report?.byCategory]
    )
    const salespersonRows = useMemo(
        () => Object.values(report?.bySalesperson ?? {})
            .map((row) => ({ label: row.name, value: row.value, meta: `${row.count} job${row.count === 1 ? "" : "s"}` }))
            .sort((a, b) => b.value - a.value),
        [report?.bySalesperson]
    )
    const monthRows = useMemo(
        () => Object.entries(report?.byMonth ?? {})
            .map(([label, row]) => ({ label: formatMonthLabel(label), value: row.value, meta: `${row.count} job${row.count === 1 ? "" : "s"}` }))
            .sort((a, b) => b.value - a.value),
        [report?.byMonth]
    )
    const totalJobValue = report?.items.reduce((sum, item) => sum + Number(item.jobValue ?? 0), 0) ?? 0
    const totalInvoiced = report?.items.reduce((sum, item) => sum + Number(item.invoicedValue ?? 0), 0) ?? 0

    return (
        <PageContainer>
            <div className="mb-8 overflow-hidden rounded-[32px] border border-glass-border/70 bg-gradient-to-br from-white via-white/70 to-primary/10 p-6 shadow-xl shadow-slate-200/50">
                <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
                    <div>
                        <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-xs font-bold uppercase tracking-[0.18em] text-primary">
                            <PieChart className="h-3.5 w-3.5" /> Work In Progress
                        </div>
                        <h1 className="text-4xl font-semibold tracking-tight text-foreground">WIP Control Centre</h1>
                        <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
                            Active sales and job value that has not yet been fully invoiced or completed.
                        </p>
                    </div>
                    <Button variant="outline" className="bg-white/70" asChild>
                        <Link href="/admin/reports">Open Reports</Link>
                    </Button>
                </div>
            </div>

            <div className="mb-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <ExecutiveMetric label="Total WIP Value" value={formatCurrency(report?.totalValue)} description="Remaining active value" icon={<ReceiptText className="h-5 w-5" />} tone="primary" />
                <ExecutiveMetric label="WIP Count" value={report?.count ?? "—"} description="Jobs not fully invoiced" icon={<BriefcaseBusiness className="h-5 w-5" />} tone="sky" />
                <ExecutiveMetric label="Original Job Value" value={formatCurrency(totalJobValue)} description="Value of filtered jobs" icon={<ClipboardList className="h-5 w-5" />} tone="emerald" />
                <ExecutiveMetric label="Already Invoiced" value={formatCurrency(totalInvoiced)} description="Sent/viewed/overdue/paid invoices" icon={<CalendarClock className="h-5 w-5" />} tone="amber" />
            </div>

            <GlassCard className="mb-6 bg-white/70">
                <GlassCardHeader>
                    <GlassCardTitle className="flex items-center gap-2 text-lg"><Filter className="h-4 w-4 text-primary" /> Filters</GlassCardTitle>
                    <GlassCardDescription>Review WIP by job start month, category, or salesperson.</GlassCardDescription>
                </GlassCardHeader>
                <GlassCardContent className="grid gap-3 md:grid-cols-3">
                    <Select value={month} onValueChange={setMonth}>
                        <SelectTrigger className="bg-white/60"><SelectValue placeholder="Job start month" /></SelectTrigger>
                        <SelectContent searchPlaceholder="Search month...">
                            <SelectItem value={ALL}>All months</SelectItem>
                            {(report?.filterOptions?.months ?? []).map((option) => (
                                <SelectItem key={option} value={option}>{formatMonthLabel(option)}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    <Select value={category} onValueChange={setCategory}>
                        <SelectTrigger className="bg-white/60"><SelectValue placeholder="Category" /></SelectTrigger>
                        <SelectContent searchPlaceholder="Search category...">
                            <SelectItem value={ALL}>All categories</SelectItem>
                            {(report?.filterOptions?.categories ?? []).map((option) => (
                                <SelectItem key={option} value={option}>{option}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    <Select value={salespersonId} onValueChange={setSalespersonId}>
                        <SelectTrigger className="bg-white/60"><SelectValue placeholder="Salesperson" /></SelectTrigger>
                        <SelectContent searchPlaceholder="Search salesperson...">
                            <SelectItem value={ALL}>All salespeople</SelectItem>
                            {(report?.filterOptions?.salespeople ?? []).map((option) => (
                                <SelectItem key={option.id ?? "__unassigned__"} value={option.id ?? "__unassigned__"}>{option.name}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </GlassCardContent>
            </GlassCard>

            <div className="mb-6 grid gap-6 xl:grid-cols-3">
                <BarListCard title="Summary By Category" description="Remaining WIP grouped by category." rows={categoryRows} valuePrefix="£" />
                <BarListCard title="Summary By Salesperson" description="Ownership view for active value." rows={salespersonRows} valuePrefix="£" />
                <BarListCard title="Summary By Month" description="WIP by scheduled job start month." rows={monthRows} valuePrefix="£" />
            </div>

            <GlassCard className="bg-white/70">
                <GlassCardHeader>
                    <GlassCardTitle>Active WIP Jobs</GlassCardTitle>
                    <GlassCardDescription>Jobs with remaining value after invoices already raised.</GlassCardDescription>
                </GlassCardHeader>
                <GlassCardContent className="p-0">
                    <Table>
                        <TableHeader className="bg-black/5">
                            <TableRow className="border-glass-border">
                                <TableHead>Job</TableHead>
                                <TableHead>Customer / Site</TableHead>
                                <TableHead>Salesperson</TableHead>
                                <TableHead>Category</TableHead>
                                <TableHead className="text-right">Job Value</TableHead>
                                <TableHead className="text-right">Invoiced</TableHead>
                                <TableHead className="text-right">WIP</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {(report?.items ?? []).length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={7} className="h-32 text-center text-muted-foreground">No WIP jobs match these filters.</TableCell>
                                </TableRow>
                            ) : report!.items.map((item) => (
                                <TableRow key={item.id} className="cursor-pointer border-glass-border hover:bg-black/5">
                                    <TableCell>
                                        <Link href={`/admin/schedule/${item.id}`} className="block">
                                            <RecordNumberBadge value={item.jobNumber} />
                                            <div className="mt-2 font-semibold text-foreground">{item.title ?? "Untitled job"}</div>
                                            <StatusBadge status={formatStatus(item.status)} className="mt-1 w-fit" />
                                        </Link>
                                    </TableCell>
                                    <TableCell>
                                        <div className="font-medium text-foreground">{item.customerName ?? "Customer"}</div>
                                        <div className="text-xs text-muted-foreground">{item.siteName ?? "No linked site"}</div>
                                    </TableCell>
                                    <TableCell>
                                        <div className="flex items-center gap-2">
                                            <UserRound className="h-4 w-4 text-primary" />
                                            <span>{item.salespersonName ?? "Unassigned"}</span>
                                        </div>
                                    </TableCell>
                                    <TableCell>{item.category ?? "Uncategorised"}</TableCell>
                                    <TableCell className="text-right font-semibold">{formatCurrency(item.jobValue)}</TableCell>
                                    <TableCell className="text-right text-muted-foreground">{formatCurrency(item.invoicedValue)}</TableCell>
                                    <TableCell className="text-right font-bold text-primary">{formatCurrency(item.remainingValue)}</TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </GlassCardContent>
            </GlassCard>

            <ErrorToast error={error} onClear={() => setError(null)} />
        </PageContainer>
    )
}

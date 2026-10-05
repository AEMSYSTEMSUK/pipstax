"use client"

import { useEffect, useState, type DragEvent } from "react"
import { PageContainer } from "@/components/layout/PageContainer"
import { GlassCard, GlassCardHeader, GlassCardTitle, GlassCardContent } from "@/components/glass/GlassCard"
import { GlassModal } from "@/components/glass/GlassModal"
import { StatusBadge } from "@/components/shared/StatusBadge"
import { useSavedColumnOrder } from "@/components/shared/useSavedColumnOrder"
import { useSavedViewMode } from "@/components/shared/useSavedViewMode"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { useToast } from "@/components/ui/toast"
import { apiGet, apiPut } from "@/lib/api"
import { format } from "date-fns"
import { CheckSquare, ExternalLink, Calendar as CalendarIcon, Clock, Edit2, LayoutGrid, List } from "lucide-react"
import Link from "next/link"

interface MyTask {
    id: string
    title: string
    taskType: string
    description?: string
    status: string
    reminderAt?: string
    leadId: string
    leadTitle?: string
    customerName?: string
    createdAt: string
}

const TASK_STATUS_COLUMNS = [
    { value: "OPEN", label: "Open" },
    { value: "IN_PROGRESS", label: "In Progress" },
    { value: "COMPLETED", label: "Completed" },
    { value: "CANCELLED", label: "Cancelled" },
]

const TASK_VIEW_MODES = ["list", "kanban"] as const

const formatTaskType = (value?: string) => {
    const raw = String(value ?? "").trim()
    if (!raw) return "General"
    return raw
        .replace(/_/g, " ")
        .toLowerCase()
        .replace(/\b\w/g, (letter) => letter.toUpperCase())
}

const formatTaskStatus = (value?: string) => {
    const normalized = String(value ?? "").trim().toUpperCase()
    if (normalized === "IN_PROGRESS") return "In Progress"
    if (normalized === "COMPLETED") return "Completed"
    if (normalized === "CANCELLED") return "Cancelled"
    return "Open"
}

export default function MyTasksPage() {
    const [tasks, setTasks] = useState<MyTask[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [taskView, setTaskView] = useSavedViewMode("pipstack:view-mode:admin-my-tasks", "list", TASK_VIEW_MODES)
    const { toast } = useToast()

    const [editingTask, setEditingTask] = useState<MyTask | null>(null)
    const [editStatus, setEditStatus] = useState<string>("")
    const [editDescription, setEditDescription] = useState<string>("")
    const [isSaving, setIsSaving] = useState(false)

    const loadTasks = async () => {
        try {
            setIsLoading(true)
            const response = await apiGet<{ data: MyTask[] }>("/my-tasks")
            setTasks(Array.isArray(response.data) ? response.data : [])
            setError(null)
        } catch (err: any) {
            setError(err?.message ?? "Failed to load tasks")
            toast({
                title: "Failed to load tasks",
                description: err?.message ?? "An error occurred while loading your tasks.",
                variant: "error",
            })
        } finally {
            setIsLoading(false)
        }
    }

    useEffect(() => {
        loadTasks()
    }, [])

    const startEditing = (task: MyTask) => {
        setEditingTask(task)
        setEditStatus(task.status)
        setEditDescription(task.description || "")
    }

    const cancelEditing = () => {
        setEditingTask(null)
        setEditStatus("")
        setEditDescription("")
    }

    const saveEdit = async () => {
        if (!editingTask) return
        
        setIsSaving(true)
        try {
            const response = await apiPut<{ data: MyTask }>(`/my-tasks/${editingTask.id}/status`, {
                status: editStatus,
                description: editDescription
            })
            
            setTasks(prev => prev.map(t => t.id === editingTask.id ? { ...t, ...response.data } : t))
            toast({
                title: "Task Updated",
                description: "Your task has been updated successfully.",
                variant: "success",
            })
            cancelEditing()
        } catch (err: any) {
            toast({
                title: "Update Failed",
                description: err?.message ?? "Failed to update the task.",
                variant: "error",
            })
        } finally {
            setIsSaving(false)
        }
    }

    const updateTaskStatus = async (taskId: string, status: string) => {
        try {
            const response = await apiPut<{ data: MyTask }>(`/my-tasks/${taskId}/status`, {
                status
            })
            setTasks(prev => prev.map(t => t.id === taskId ? { ...t, ...response.data } : t))
            toast({
                title: status === "COMPLETED" ? "Task Completed" : "Task Updated",
                description: status === "COMPLETED" ? "Task marked as completed." : "Task status updated.",
                variant: "success",
            })
        } catch (err: any) {
            toast({
                title: "Update Failed",
                description: err?.message ?? "Failed to update the task.",
                variant: "error",
            })
        }
    }

    const markAsCompleted = (taskId: string) => updateTaskStatus(taskId, "COMPLETED")

    // Sort: Open and In Progress first, then completed/cancelled. Then by reminder date.
    const sortedTasks = [...tasks].sort((a, b) => {
        const aIsOpen = a.status === "OPEN" || a.status === "IN_PROGRESS"
        const bIsOpen = b.status === "OPEN" || b.status === "IN_PROGRESS"
        if (aIsOpen && !bIsOpen) return -1
        if (!aIsOpen && bIsOpen) return 1
        
        const aDate = a.reminderAt ? new Date(a.reminderAt).getTime() : new Date(a.createdAt).getTime()
        const bDate = b.reminderAt ? new Date(b.reminderAt).getTime() : new Date(b.createdAt).getTime()
        return aDate - bDate
    })

    const handleTaskDrop = async (event: DragEvent<HTMLDivElement>, status: string) => {
        event.preventDefault()
        const taskId = event.dataTransfer.getData("application/x-my-task-id") || event.dataTransfer.getData("text/plain")
        if (!taskId) return
        const task = tasks.find((item) => item.id === taskId)
        if (!task || task.status === status) return
        await updateTaskStatus(taskId, status)
    }

    const getTasksForStatus = (status: string) => sortedTasks.filter((task) => task.status === status)
    const { orderedColumns: orderedTaskColumns, getColumnDragProps } = useSavedColumnOrder(
        TASK_STATUS_COLUMNS,
        "pipstack:board-columns:admin-my-tasks",
        (column) => column.value
    )

    return (
        <PageContainer>
            <div className="mb-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-foreground flex items-center gap-3">
                        <CheckSquare className="h-8 w-8 text-primary" />
                        My Tasks
                    </h1>
                    <p className="text-muted-foreground mt-1">Manage tasks assigned to you across all leads.</p>
                </div>
                <div className="flex rounded-lg border border-glass-border bg-white/50 p-1">
                    <Button
                        size="sm"
                        variant={taskView === "list" ? "default" : "ghost"}
                        className="h-8 gap-1.5"
                        onClick={() => setTaskView("list")}
                    >
                        <List className="h-4 w-4" />
                        List
                    </Button>
                    <Button
                        size="sm"
                        variant={taskView === "kanban" ? "default" : "ghost"}
                        className="h-8 gap-1.5"
                        onClick={() => setTaskView("kanban")}
                    >
                        <LayoutGrid className="h-4 w-4" />
                        Kanban
                    </Button>
                </div>
            </div>

            {isLoading ? (
                <div className="flex justify-center p-12">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                </div>
            ) : error ? (
                <div className="p-8 text-center bg-destructive/10 text-destructive rounded-xl border border-destructive/20">
                    <p>{error}</p>
                    <Button onClick={loadTasks} variant="outline" className="mt-4 bg-white/50">Try Again</Button>
                </div>
            ) : sortedTasks.length === 0 ? (
                <GlassCard>
                    <GlassCardContent className="flex flex-col items-center justify-center p-12 text-center">
                        <CheckSquare className="h-12 w-12 text-muted-foreground/30 mb-4" />
                        <h3 className="text-lg font-medium text-foreground mb-1">No tasks assigned</h3>
                        <p className="text-muted-foreground text-sm">You're all caught up! There are no tasks currently assigned to you.</p>
                    </GlassCardContent>
                </GlassCard>
            ) : taskView === "kanban" ? (
                <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
                    {orderedTaskColumns.map((column) => {
                        const columnTasks = getTasksForStatus(column.value)
                        return (
                            <GlassCard
                                key={column.value}
                                className="min-h-[280px]"
                                onDragOver={(event) => event.preventDefault()}
                                onDrop={(event) => handleTaskDrop(event, column.value)}
                            >
                                <GlassCardHeader
                                    className="flex cursor-grab flex-row items-center justify-between pb-2 active:cursor-grabbing"
                                    title="Drag to rearrange columns"
                                    {...getColumnDragProps(column)}
                                >
                                    <GlassCardTitle className="text-base">{column.label}</GlassCardTitle>
                                    <Badge variant="secondary">{columnTasks.length}</Badge>
                                </GlassCardHeader>
                                <GlassCardContent className="space-y-3">
                                    {columnTasks.length === 0 ? (
                                        <div className="rounded-lg border border-dashed border-glass-border bg-white/40 p-5 text-center text-sm text-muted-foreground">
                                            Drop tasks here
                                        </div>
                                    ) : (
                                        columnTasks.map((task) => {
                                            const isCompleted = task.status === "COMPLETED" || task.status === "CANCELLED"
                                            return (
                                                <div
                                                    key={task.id}
                                                    draggable
                                                    onDragStart={(event) => {
                                                        event.dataTransfer.setData("application/x-my-task-id", task.id)
                                                        event.dataTransfer.setData("text/plain", task.id)
                                                        event.dataTransfer.effectAllowed = "move"
                                                    }}
                                                    className={`rounded-lg border border-glass-border bg-white/75 p-3 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${isCompleted ? "opacity-75" : ""}`}
                                                >
                                                    <div className="flex items-start justify-between gap-2">
                                                        <div className="min-w-0">
                                                            <p className={`text-sm font-semibold text-foreground line-clamp-2 ${isCompleted ? "line-through text-muted-foreground" : ""}`}>
                                                                {task.title}
                                                            </p>
                                                            <p className="mt-1 text-xs text-muted-foreground">{formatTaskType(task.taskType)}</p>
                                                        </div>
                                                        <Button
                                                            size="icon"
                                                            variant="ghost"
                                                            className="h-8 w-8 shrink-0"
                                                            onClick={() => startEditing(task)}
                                                        >
                                                            <Edit2 className="h-4 w-4" />
                                                        </Button>
                                                    </div>
                                                    {task.leadId && (
                                                        <Link href={`/admin/crm/${task.leadId}`} className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">
                                                            {task.leadTitle || "Lead"} <ExternalLink className="h-3 w-3" />
                                                        </Link>
                                                    )}
                                                    <div className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
                                                        {task.reminderAt ? (
                                                            <>
                                                                <CalendarIcon className="h-3.5 w-3.5" />
                                                                {format(new Date(task.reminderAt), "MMM d, h:mm a")}
                                                            </>
                                                        ) : (
                                                            <>
                                                                <Clock className="h-3.5 w-3.5" />
                                                                No due date
                                                            </>
                                                        )}
                                                    </div>
                                                </div>
                                            )
                                        })
                                    )}
                                </GlassCardContent>
                            </GlassCard>
                        )
                    })}
                </div>
            ) : (
                <div className="space-y-4">
                    {sortedTasks.map(task => {
                        const isCompleted = task.status === "COMPLETED" || task.status === "CANCELLED"

                        return (
                            <GlassCard key={task.id} className={isCompleted ? "opacity-75" : ""}>
                                <GlassCardContent className="p-5">
                                    <div className="flex flex-col md:flex-row gap-5">
                                        <div className="flex-1 min-w-0">
                                            <div className="flex flex-wrap items-center gap-2 mb-2">
                                                <StatusBadge status={formatTaskStatus(task.status)} />
                                                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground px-2 py-0.5 rounded-full bg-black/5">
                                                    {formatTaskType(task.taskType)}
                                                </span>
                                            </div>
                                            <h3 className={`text-lg font-bold text-foreground mb-1 ${isCompleted ? "line-through text-muted-foreground" : ""}`}>
                                                {task.title}
                                            </h3>
                                            {task.leadId && (
                                                <div className="flex items-center gap-1.5 text-sm text-primary font-medium mb-3">
                                                    <Link href={`/admin/crm/${task.leadId}`} className="hover:underline flex items-center gap-1">
                                                        {task.leadTitle || "Lead"} <ExternalLink className="h-3 w-3" />
                                                    </Link>
                                                </div>
                                            )}
                                            {task.description ? (
                                                <p className="text-sm text-muted-foreground whitespace-pre-wrap">{task.description}</p>
                                            ) : null}
                                        </div>

                                        <div className="flex flex-col md:items-end gap-3 shrink-0">
                                            {task.reminderAt ? (
                                                <div className="flex items-center gap-1.5 text-sm text-amber-600 font-medium bg-amber-50 px-3 py-1.5 rounded-lg border border-amber-200">
                                                    <CalendarIcon className="h-4 w-4" />
                                                    Due: {format(new Date(task.reminderAt), "MMM d, h:mm a")}
                                                </div>
                                            ) : (
                                                <div className="flex items-center gap-1.5 text-sm text-muted-foreground px-3 py-1.5">
                                                    <Clock className="h-4 w-4" />
                                                    No due date
                                                </div>
                                            )}
                                            <div className="flex items-center gap-2 mt-auto">
                                                <Button
                                                    variant="outline"
                                                    className="bg-white/50 gap-2"
                                                    onClick={() => startEditing(task)}
                                                >
                                                    <Edit2 className="h-4 w-4" /> Edit
                                                </Button>
                                                {!isCompleted && (
                                                    <Button
                                                        className="gap-2 bg-emerald-600 text-white hover:bg-emerald-700"
                                                        onClick={() => markAsCompleted(task.id)}
                                                    >
                                                        <CheckSquare className="h-4 w-4" /> Complete
                                                    </Button>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                </GlassCardContent>
                            </GlassCard>
                        )
                    })}
                </div>
            )}
            <GlassModal
                open={Boolean(editingTask)}
                onOpenChange={(open) => {
                    if (!open) cancelEditing()
                }}
                title="Edit Task"
                description={editingTask?.title ?? "Update your assigned task."}
                footer={
                    <div className="flex justify-end gap-2 w-full">
                        <Button variant="outline" onClick={cancelEditing} disabled={isSaving}>
                            Cancel
                        </Button>
                        <Button onClick={saveEdit} disabled={isSaving}>
                            {isSaving ? "Saving..." : "Save Changes"}
                        </Button>
                    </div>
                }
            >
                <div className="space-y-4">
                    <div className="space-y-2">
                        <Label required>Status</Label>
                        <Select value={editStatus} onValueChange={setEditStatus}>
                            <SelectTrigger className="bg-white/50 w-full">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {TASK_STATUS_COLUMNS.map((column) => (
                                    <SelectItem key={column.value} value={column.value}>
                                        {column.label}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="space-y-2">
                        <Label optional>Notes</Label>
                        <Textarea
                            value={editDescription}
                            onChange={(event) => setEditDescription(event.target.value)}
                            className="bg-white/50 resize-none min-h-[120px]"
                            placeholder="Add or update task notes..."
                        />
                    </div>
                </div>
            </GlassModal>
        </PageContainer>
    )
}

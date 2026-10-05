"use client"

import { Fragment, use, useEffect, useRef, useState } from "react"
import { PageContainer } from "@/components/layout/PageContainer"
import { GlassCard, GlassCardContent, GlassCardHeader, GlassCardTitle, GlassCardDescription, GlassCardFooter } from "@/components/glass/GlassCard"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Textarea } from "@/components/ui/textarea"
import { apiGet, apiPost } from "@/lib/api"
import { ErrorToast } from "@/components/shared/ErrorToast"
import { ArrowLeft, MapPin, Clock, Calendar, Phone, CheckCircle2, User, UploadCloud, Camera, PenTool, Eraser, FileSignature } from "lucide-react"
import { StatusBadge } from "@/components/shared/StatusBadge"
import SignatureCanvas from 'react-signature-canvas'
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectSeparator, SelectTrigger, SelectValue } from "@/components/ui/select"
import { BrowserBackButton } from "@/components/shared/BrowserBackButton"

type WorkflowStageOption = {
    key: string
    label: string
    baseStatus: string
}

type WorkerJobRecord = {
    id: string
    title?: string | null
    status?: string | null
    workflowBaseStatus?: string | null
    workflowBaseStatusLabel?: string | null
    workflowStatusLabel?: string | null
    workflowStageKey?: string | null
    workflowStageOptions?: WorkflowStageOption[] | null
    scheduledAt?: string | null
    location?: string | null
    description?: string | null
    photos?: string[] | null
    priority?: string | null
    client?: string | null
}

export default function WorkerJobDetail({ params }: { params: Promise<{ id: string }> }) {
    const resolvedParams = use(params)
    const [job, setJob] = useState<WorkerJobRecord | null>(null)
    const [error, setError] = useState<string | null>(null)
    const [notes, setNotes] = useState("")
    const [statusValue, setStatusValue] = useState<string>("")

    const sigCanvas = useRef<SignatureCanvas>(null);
    const [signatureData, setSignatureData] = useState<string | null>(null);

    useEffect(() => {
        const load = async () => {
            try {
                const res = await apiGet<WorkerJobRecord>(`/jobs/${resolvedParams.id}`)
                setJob(res.data)
                setStatusValue(res.data?.workflowStageKey ?? res.data?.workflowBaseStatus ?? res.data?.status ?? "")
                setError(null)
            } catch (err: any) {
                setError(err?.message ?? "Failed to load job")
            }
        }
        load()
    }, [resolvedParams.id])

    const clearSignature = () => {
        sigCanvas.current?.clear();
        setSignatureData(null);
    };

    const saveSignature = () => {
        if (sigCanvas.current?.isEmpty()) return;
        const dataUrl = sigCanvas.current?.getTrimmedCanvas().toDataURL('image/png');
        setSignatureData(dataUrl || null);
    };

    const getPriorityBadge = (priority: string) => {
        switch (priority) {
            case 'Emergency': return 'destructive'
            case 'High': return 'warning'
            case 'Medium': return 'default'
            case 'Low': return 'secondary'
            default: return 'outline'
        }
    }

    if (!job) {
        return (
            <PageContainer>
                <div className="text-center p-12">Job not found</div>
                <ErrorToast error={error} onClear={() => setError(null)} />
            </PageContainer>
        )
    }

    const jobBaseStatus = String(job.workflowBaseStatus ?? job.status ?? "").toUpperCase()
    const jobBaseStatusLabel = job.workflowBaseStatusLabel ?? job.status ?? "Not Assigned"
    const jobStatusLabel = job.workflowStatusLabel ?? jobBaseStatusLabel
    const workflowStageOptions: WorkflowStageOption[] = Array.isArray(job.workflowStageOptions) ? job.workflowStageOptions : []
    const groupedWorkflowStageOptions = workflowStageOptions.reduce<Record<string, WorkflowStageOption[]>>((acc, stage) => {
        const baseStatus = String(stage.baseStatus ?? "").toUpperCase()
        if (!baseStatus) return acc
        if (!acc[baseStatus]) {
            acc[baseStatus] = []
        }
        acc[baseStatus].push(stage)
        return acc
    }, {})
    const groupedWorkflowStageEntries = Object.entries(groupedWorkflowStageOptions)

    const handleStatusChange = async (value: string) => {
        const previousStatusValue = statusValue
        setStatusValue(value)
        try {
            const selectedStage = workflowStageOptions.find((stage) => stage.key === value)
            const payload = selectedStage
                ? { status: selectedStage.baseStatus, workflowStageKey: selectedStage.key }
                : { status: value }
            const res = await apiPost<WorkerJobRecord>(`/jobs/${job.id}/status`, payload)
            setJob(res.data ?? { ...job, ...payload })
            setStatusValue(
                res.data?.workflowStageKey ??
                res.data?.workflowBaseStatus ??
                res.data?.status ??
                (selectedStage?.key ?? value),
            )
        } catch (err: any) {
            setStatusValue(previousStatusValue)
            setError(err?.message ?? "Failed to update status")
        }
    }

    const handleSaveNotes = async () => {
        try {
            await apiPost(`/jobs/${job.id}/updates`, {
                notes,
                customerSignatureData: signatureData ?? undefined,
                clientTimestamp: new Date().toISOString()
            })
            setNotes("")
        } catch (err: any) {
            setError(err?.message ?? "Failed to save notes")
        }
    }

    return (
        <PageContainer>
            <div className="mb-6">
                <BrowserBackButton className="text-sm font-medium text-primary hover:text-primary-dark transition-colors inline-flex items-center gap-1 mb-4">
                    <ArrowLeft className="h-3 w-3" /> Back to My Jobs
                </BrowserBackButton>
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                    <div>
                        <h1 className="text-3xl font-bold tracking-tight text-foreground">{job.title}</h1>
                        <p className="text-muted-foreground mt-1 flex items-center gap-2 font-medium">
                            Job #{job.id} <StatusBadge status={jobBaseStatusLabel}>{jobStatusLabel}</StatusBadge>
                        </p>
                    </div>

                    <div className="flex items-center gap-2 w-full sm:w-auto">
                        <Select value={statusValue} onValueChange={handleStatusChange}>
                            <SelectTrigger className="w-[180px] bg-white/60">
                                <SelectValue placeholder="Update Status" />
                            </SelectTrigger>
                            <SelectContent>
                                {groupedWorkflowStageEntries.length > 0 ? (
                                    groupedWorkflowStageEntries.map(([baseStatus, stages], index) => {
                                        const baseStage = stages.find((stage) => stage.key === baseStatus)
                                        const customStages = stages.filter((stage) => stage.key !== baseStatus)
                                        const baseLabel = baseStage?.label ?? jobBaseStatusLabel
                                        return (
                                            <Fragment key={baseStatus}>
                                                <SelectGroup>
                                                    <SelectLabel>{baseLabel}</SelectLabel>
                                                    {baseStage ? (
                                                        <SelectItem value={baseStage.key}>{baseStage.label}</SelectItem>
                                                    ) : null}
                                                    {customStages.map((stage) => (
                                                        <SelectItem key={stage.key} value={stage.key}>
                                                            - {stage.label}
                                                        </SelectItem>
                                                    ))}
                                                </SelectGroup>
                                                {index < groupedWorkflowStageEntries.length - 1 ? <SelectSeparator /> : null}
                                            </Fragment>
                                        )
                                    })
                                ) : (
                                    <>
                                        <SelectItem value="NOT_ASSIGNED">Not Assigned</SelectItem>
                                        <SelectItem value="ASSIGNED">Assigned</SelectItem>
                                        <SelectItem value="LIVE">Live</SelectItem>
                                        <SelectItem value="REQUIRES_FOLLOW_UP">Needs Attention</SelectItem>
                                        <SelectItem value="FINISHED">Finished</SelectItem>
                                        <SelectItem value="COMPLETED">Closed</SelectItem>
                                    </>
                                )}
                            </SelectContent>
                        </Select>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 space-y-6">
                    <GlassCard>
                        <GlassCardHeader className="pb-3 border-b border-glass-border">
                            <GlassCardTitle>Job Information</GlassCardTitle>
                        </GlassCardHeader>
                        <GlassCardContent className="pt-6 space-y-4">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div>
                                    <span className="text-xs font-semibold text-muted-foreground uppercase block mb-1">Time & Date</span>
                                    <p className="font-medium flex items-center gap-2">
                                        <Calendar className="h-4 w-4 text-primary" /> {job.scheduledAt ? new Date(job.scheduledAt).toLocaleDateString() : "TBD"}
                                        <Clock className="h-4 w-4 text-primary ml-2" /> {job.scheduledAt ? new Date(job.scheduledAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "TBD"}
                                    </p>
                                </div>
                                <div>
                                    <span className="text-xs font-semibold text-muted-foreground uppercase block mb-1">Location</span>
                                    <p className="font-medium flex items-center gap-2">
                                        <MapPin className="h-4 w-4 text-primary" /> {job.location ?? "TBD"}
                                    </p>
                                    <Button variant="link" className="h-auto p-0 text-xs mt-1">Get Directions</Button>
                                </div>
                            </div>
                            <div className="pt-4 border-t border-glass-border">
                                <span className="text-xs font-semibold text-muted-foreground uppercase block mb-2">Instructions</span>
                                <div className="bg-white/40 p-4 rounded-lg text-sm text-foreground/90 whitespace-pre-wrap leading-relaxed shadow-sm">
                                    {job.description || "No specific instructions provided."}
                                </div>
                            </div>
                        </GlassCardContent>
                    </GlassCard>

                    <GlassCard>
                        <GlassCardHeader className="pb-3 border-b border-glass-border flex flex-row items-center justify-between">
                            <GlassCardTitle>Field Notes & Photos</GlassCardTitle>
                            <Button variant="outline" size="sm" className="h-8 gap-2 bg-white/40"><Camera className="h-3 w-3" /> Upload Photo</Button>
                        </GlassCardHeader>
                        <GlassCardContent className="pt-6 space-y-4">
                            {job.photos && job.photos.length > 0 && (
                                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4 mb-4">
                                    {job.photos.map((photo: string, i: number) => (
                                        <div key={i} className="aspect-square rounded-lg bg-black/5 border border-glass-border flex items-center justify-center text-xs text-muted-foreground overflow-hidden relative group">
                                            Photo {i + 1}
                                            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                                <Button variant="secondary" size="sm" className="h-7 text-xs">View</Button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                            <div className="space-y-2">
                                <label className="text-sm font-medium">Add Work Notes</label>
                                <Textarea placeholder="Describe work done, parts used, issues found..." className="min-h-[100px] bg-white/50" value={notes} onChange={(e) => setNotes(e.target.value)} />
                            </div>
                            <Button className="w-full mt-2" onClick={handleSaveNotes}>Save Notes</Button>
                        </GlassCardContent>
                    </GlassCard>

                    <GlassCard className="border-primary/20">
                        <GlassCardHeader className="bg-primary/5 pb-4 border-b border-primary/20">
                            <GlassCardTitle className="text-lg flex items-center gap-2 text-primary-dark">
                                <FileSignature className="h-5 w-5" /> Customer Sign-off
                            </GlassCardTitle>
                            <GlassCardDescription>Required to mark job as complete.</GlassCardDescription>
                        </GlassCardHeader>
                        <GlassCardContent className="pt-6">
                            {signatureData ? (
                                <div className="space-y-4">
                                    <div className="bg-white rounded-lg p-2 max-w-sm border border-glass-border flex justify-center">
                                        <img src={signatureData} alt="Customer Signature" className="h-24 object-contain" />
                                    </div>
                                    <Button variant="outline" size="sm" onClick={() => setSignatureData(null)} className="text-destructive gap-2 border-destructive/20 hover:bg-destructive/10">
                                        <Eraser className="h-3 w-3" /> Clear & Re-sign
                                    </Button>
                                </div>
                            ) : (
                                <div className="space-y-4">
                                    <div className="border-2 border-dashed border-primary/30 rounded-xl bg-white overflow-hidden relative cursor-crosshair">
                                        <SignatureCanvas
                                            ref={sigCanvas}
                                            canvasProps={{ className: 'sigCanvas w-full h-[200px]' }}
                                        />
                                        <div className="absolute bottom-2 right-2 flex gap-2">
                                            <Button variant="ghost" size="sm" onClick={clearSignature} className="bg-white/80 h-7 text-xs shadow-sm">Clear</Button>
                                            <Button size="sm" onClick={saveSignature} className="bg-primary text-white h-7 text-xs shadow-sm shadow-primary/20">Save</Button>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </GlassCardContent>
                    </GlassCard>
                </div>

                <div className="lg:col-span-1 space-y-6">
                    <GlassCard>
                        <GlassCardHeader>
                            <GlassCardTitle>Client Contact</GlassCardTitle>
                        </GlassCardHeader>
                        <GlassCardContent className="space-y-4">
                            <div>
                                <h3 className="font-semibold">{job.client}</h3>
                                <p className="text-sm text-muted-foreground mt-1 flex items-center gap-2 border-t border-glass-border/50 pt-2 pb-1">
                                    <MapPin className="h-3.5 w-3.5" /> {job.location ?? "TBD"}
                                </p>
                                <p className="text-sm text-primary font-medium flex items-center gap-2 hover:underline cursor-pointer">
                                    <Phone className="h-3.5 w-3.5" /> Call Customer
                                </p>
                            </div>
                        </GlassCardContent>
                    </GlassCard>

                    <GlassCard>
                        <GlassCardHeader>
                            <GlassCardTitle>Priority</GlassCardTitle>
                        </GlassCardHeader>
                        <GlassCardContent>
                            <Badge variant={getPriorityBadge(String(job.priority ?? "")) as any} className="w-full justify-center text-sm py-1 shadow-sm">{job.priority ?? "Not set"}</Badge>
                        </GlassCardContent>
                    </GlassCard>
                </div>
            </div>
            <ErrorToast error={error} onClear={() => setError(null)} />
        </PageContainer>
    )
}

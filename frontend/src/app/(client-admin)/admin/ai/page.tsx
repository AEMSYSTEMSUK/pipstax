"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { Check, History as HistoryIcon, Loader2, Plus, Settings2, ShieldCheck, Sparkles, Trash2, Wrench, X } from "lucide-react"
import { PageContainer } from "@/components/layout/PageContainer"
import { GlassCard, GlassCardContent } from "@/components/glass/GlassCard"
import { GlassModal } from "@/components/glass/GlassModal"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { useToast } from "@/components/ui/toast"
import { apiDelete, apiGet, apiGetSilent, apiPost, apiPut } from "@/lib/api"

// AI Workspace (#229 part 3, Nov 2026). Pick a Space + Action and say what you need; Claude looks things up in this
// workspace (only what you're allowed to see). It never changes anything itself - anything it wants to save comes back
// as a proposal that YOU approve here. Every run is kept (History); admins set the key, models and the monthly cap.

type Action = { id: string; spaceId: string; name: string; instructions: string; inputHint: string | null; model: string | null; allowWrites: boolean; enabled: boolean; builtIn: boolean }
type Space = { id: string; key: string; name: string; description: string | null; requiredPermission: string | null; enabled: boolean; usable: boolean; actions: Action[] }
type Proposal = { id: string; runId: string; kind: string; summary: string; payload: any; status: string; decidedByName: string | null; result: string | null }
type Trail = { tool: string; input: unknown; ok: boolean; chars: number }
type RunResult = { runId: string; status: string; output: string | null; proposals: Proposal[]; toolTrail: Trail[]; costUsd?: number; model?: string; error?: string | null }
type RunRow = { id: string; spaceKey: string; actionName: string | null; userName: string; model: string; keySource: string; status: string; input: string; costUsd: number; toolCalls: number; createdAt: string }
type Status = { enabled: boolean; configured: boolean; canManage: boolean; reason: string }
type Settings = { enabled: boolean; keySource: "own" | "managed"; anthropicKey: string | null; keyUnreadable: boolean; defaultModel: string | null; monthlyCapUsd: number; managedAllowed: boolean; managedReady: boolean; platformCapUsd: number | null; spentThisMonthUsd: number; models: string[]; platformDefaultModel: string }

const usd = (n: number) => `$${(n || 0).toFixed(n < 1 ? 4 : 2)}`
const errText = (e: unknown, d: string) => (e instanceof Error && e.message ? e.message : d)
const tone = (s: string) =>
    s === "ok" || s === "done" ? "bg-emerald-100 text-emerald-800" : s === "running" || s === "pending" || s === "applying" ? "bg-sky-100 text-sky-800" : s === "capped" || s === "rejected" ? "bg-amber-100 text-amber-800" : "bg-rose-100 text-rose-800"

function Pill({ s, children }: { s: string; children?: React.ReactNode }) {
    return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${tone(s)}`}>{children ?? s}</span>
}

// Minimal, safe markdown: headings, bullets, numbered lists, **bold** - React elements only, no HTML injection.
function inlineMd(s: string) {
    return s.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
        part.startsWith("**") && part.endsWith("**") && part.length > 4 ? <strong key={i}>{part.slice(2, -2)}</strong> : <span key={i}>{part}</span>
    )
}
function Md({ text }: { text: string }) {
    return (
        <div className="space-y-1 text-sm leading-relaxed">
            {String(text || "").split("\n").map((l, i) => {
                const h = l.match(/^(#{1,4})\s+(.*)$/)
                if (h) return <div key={i} className="pt-2 font-semibold">{inlineMd(h[2])}</div>
                const b = l.match(/^(\s*)[-*•]\s+(.*)$/)
                if (b) return <div key={i} className="flex gap-2" style={{ paddingLeft: `${Math.min(4, Math.floor(b[1].length / 2)) * 12}px` }}><span className="text-muted-foreground">•</span><span>{inlineMd(b[2])}</span></div>
                const n = l.match(/^(\s*)(\d+)[.)]\s+(.*)$/)
                if (n) return <div key={i} className="flex gap-2" style={{ paddingLeft: `${Math.min(4, Math.floor(n[1].length / 2)) * 12}px` }}><span className="text-muted-foreground">{n[2]}.</span><span>{inlineMd(n[3])}</span></div>
                if (!l.trim()) return <div key={i} className="h-2" />
                return <div key={i} className="whitespace-pre-wrap">{inlineMd(l)}</div>
            })}
        </div>
    )
}

function TrailChips({ trail }: { trail: Trail[] }) {
    if (!trail?.length) return null
    return (
        <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
            <Wrench className="h-3.5 w-3.5" /> Looked up:
            {trail.map((t, i) => (
                <span key={i} title={JSON.stringify(t.input)} className={`rounded bg-muted px-1.5 py-0.5 font-mono ${t.ok ? "" : "line-through opacity-60"}`}>{t.tool}</span>
            ))}
        </div>
    )
}

function ProposalCard({ p, onDecided }: { p: Proposal; onDecided: (p: Proposal) => void }) {
    const { toast } = useToast()
    const [confirm, setConfirm] = useState(false)
    const [busy, setBusy] = useState(false)
    const decide = async (approve: boolean) => {
        setBusy(true)
        try {
            const r = await apiPost<Proposal>(`/ai/proposals/${p.id}/${approve ? "approve" : "reject"}`, {})
            onDecided(r.data)
            if (!approve) toast({ title: "Rejected - nothing was changed" })
            else if (r.data.status === "done") toast({ title: "Done", description: r.data.result ?? undefined, variant: "success" })
            else toast({ title: "Couldn't apply it", description: r.data.result ?? undefined, variant: "error" })
        } catch (e) {
            toast({ title: "Couldn't decide", description: errText(e, ""), variant: "error" })
        } finally { setBusy(false); setConfirm(false) }
    }
    return (
        <div className="rounded-lg border border-amber-200 bg-amber-50/60 p-3 text-sm">
            <div className="flex flex-wrap items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-amber-600" />
                <span className="font-medium">{p.summary}</span>
                <Pill s={p.status}>{p.status === "pending" ? "waiting for you" : p.status}</Pill>
            </div>
            {p.payload?.message ? <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap rounded bg-white p-2 font-sans text-xs">{String(p.payload.message)}</pre> : null}
            {p.result ? <div className="mt-1 text-xs text-muted-foreground">{p.result}{p.decidedByName ? ` - ${p.decidedByName}` : ""}</div> : null}
            {p.status === "pending" ? (
                <div className="mt-2 flex gap-2">
                    <Button size="sm" disabled={busy} onClick={() => setConfirm(true)}><Check className="h-3.5 w-3.5" />Approve</Button>
                    <Button size="sm" variant="outline" disabled={busy} onClick={() => decide(false)}><X className="h-3.5 w-3.5" />Reject</Button>
                </div>
            ) : null}
            <GlassModal
                open={confirm}
                onOpenChange={setConfirm}
                title="Approve this change?"
                description={`${p.summary}. It will be saved in your name. Nobody is emailed.`}
                footer={
                    <div className="flex justify-end gap-2">
                        <Button variant="outline" onClick={() => setConfirm(false)}>Cancel</Button>
                        <Button disabled={busy} onClick={() => decide(true)}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}Yes, save it</Button>
                    </div>
                }
            >
                {p.payload?.message ? <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded border bg-muted/40 p-2 font-sans text-xs">{String(p.payload.message)}</pre> : null}
            </GlassModal>
        </div>
    )
}

export default function AiWorkspacePage() {
    const { toast } = useToast()
    const [status, setStatus] = useState<Status | null>(null)
    const [tab, setTab] = useState<"ask" | "history" | "manage">("ask")
    const [spaces, setSpaces] = useState<Space[] | null>(null)
    const [cap, setCap] = useState({ monthlyCapUsd: 0, spentThisMonthUsd: 0 })
    const [spaceKey, setSpaceKey] = useState("")
    const [actionId, setActionId] = useState("")
    const [input, setInput] = useState("")
    const [running, setRunning] = useState(false)
    const [result, setResult] = useState<RunResult | null>(null)
    const [pending, setPending] = useState<Proposal[]>([])

    const loadStatus = useCallback(async () => {
        try {
            const r = await apiGet<Status>("/ai/status")
            setStatus(r.data)
            if (!r.data.enabled && r.data.canManage) setTab("manage")
        } catch (e) {
            setStatus({ enabled: false, configured: false, canManage: false, reason: errText(e, "AI Workspace is not available") })
        }
    }, [])
    const loadSpaces = useCallback(async () => {
        try {
            const r = await apiGet<{ spaces: Space[]; monthlyCapUsd: number; spentThisMonthUsd: number }>("/ai/spaces")
            setSpaces(r.data.spaces)
            setCap({ monthlyCapUsd: r.data.monthlyCapUsd, spentThisMonthUsd: r.data.spentThisMonthUsd })
            setSpaceKey((k) => k || r.data.spaces.find((s) => s.usable)?.key || "")
        } catch (e) {
            toast({ title: "Couldn't load AI Workspace", description: errText(e, ""), variant: "error" })
            setSpaces([])
        }
    }, [toast])
    const loadPending = useCallback(async () => {
        try { setPending((await apiGetSilent<Proposal[]>("/ai/proposals")).data || []) } catch { /* ignore */ }
    }, [])
    useEffect(() => { loadStatus(); loadSpaces(); loadPending() }, [loadStatus, loadSpaces, loadPending])

    const usableSpaces = useMemo(() => (spaces || []).filter((s) => s.usable), [spaces])
    const space = usableSpaces.find((s) => s.key === spaceKey) || null
    const actions = useMemo(() => (space?.actions || []).filter((a) => a.enabled), [space])
    useEffect(() => { if (actions.length && !actions.some((a) => a.id === actionId)) setActionId(actions[0].id) }, [actions, actionId])
    const action = actions.find((a) => a.id === actionId) || null

    // Runs execute in the background on the server; poll quietly until done.
    const run = async () => {
        if (!action || !input.trim()) return
        setRunning(true); setResult(null)
        try {
            let r = (await apiPost<RunResult>("/ai/run", { actionId: action.id, input })).data
            const started = Date.now()
            while (r.status === "running" && Date.now() - started < 16 * 60 * 1000) {
                await new Promise((ok) => setTimeout(ok, 2500))
                try { r = (await apiGetSilent<RunResult>(`/ai/runs/${r.runId}`)).data } catch { /* transient - keep polling */ }
            }
            setResult(r)
            if (r.proposals?.length) loadPending()
            loadSpaces()
        } catch (e) {
            toast({ title: "The AI couldn't run", description: errText(e, ""), variant: "error" })
        } finally { setRunning(false) }
    }
    const onDecided = (p: Proposal) => {
        setResult((r) => (r ? { ...r, proposals: r.proposals.map((x) => (x.id === p.id ? p : x)) } : r))
        setPending((list) => list.filter((x) => x.id !== p.id))
    }
    const others = pending.filter((p) => !result?.proposals?.some((x) => x.id === p.id))

    return (
        <PageContainer>
            <div className="mb-6 flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
                <div>
                    <h1 className="flex items-center gap-3 text-3xl font-bold tracking-tight text-foreground"><Sparkles className="h-8 w-8 text-primary" />AI Workspace</h1>
                    <p className="mt-1 text-muted-foreground">Ask AI to summarise, draft and look things up in your workspace. It only sees what you can see, and anything it wants to save waits for your approval.</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    {status?.enabled ? <Badge variant="outline">{usd(cap.spentThisMonthUsd)} of {usd(cap.monthlyCapUsd)} this month</Badge> : null}
                    {pending.length ? <Badge variant="outline" className="border-amber-300 text-amber-700">{pending.length} waiting for approval</Badge> : null}
                    <div className="flex rounded-lg border bg-white/50 p-1">
                        <Button size="sm" variant={tab === "ask" ? "default" : "ghost"} className="h-8" onClick={() => setTab("ask")}><Sparkles className="h-4 w-4" />Ask</Button>
                        <Button size="sm" variant={tab === "history" ? "default" : "ghost"} className="h-8" onClick={() => setTab("history")}><HistoryIcon className="h-4 w-4" />History</Button>
                        {status?.canManage ? <Button size="sm" variant={tab === "manage" ? "default" : "ghost"} className="h-8" onClick={() => setTab("manage")}><Settings2 className="h-4 w-4" />Manage</Button> : null}
                    </div>
                </div>
            </div>

            {!status || !spaces ? <Loader2 className="h-5 w-5 animate-spin" /> : tab === "manage" && status.canManage ? (
                <Manage spaces={spaces} reload={() => { loadStatus(); loadSpaces() }} />
            ) : tab === "history" ? <History canManage={status.canManage} /> : !status.enabled || !status.configured ? (
                <GlassCard><GlassCardContent className="p-6 text-sm text-muted-foreground">{status.reason || "AI Workspace isn't set up yet."} {status.canManage ? "Open Manage to set it up." : "Ask your workspace admin."}</GlassCardContent></GlassCard>
            ) : !usableSpaces.length ? (
                <GlassCard><GlassCardContent className="p-6 text-sm text-muted-foreground">There are no AI spaces for your role yet. Each space needs its own permission (Sales = CRM, Operations = Reports, Support = Support, Finance = Financials).</GlassCardContent></GlassCard>
            ) : (
                <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
                    <GlassCard>
                        <GlassCardContent className="space-y-3 p-4">
                            <div className="flex flex-wrap gap-1">
                                {usableSpaces.map((s) => (
                                    <Button key={s.key} size="sm" variant={s.key === spaceKey ? "default" : "outline"} onClick={() => { setSpaceKey(s.key); setResult(null) }}>{s.name}</Button>
                                ))}
                            </div>
                            {space?.description ? <p className="text-xs text-muted-foreground">{space.description}</p> : null}
                            <div className="space-y-1">
                                {actions.map((a) => (
                                    <button key={a.id} onClick={() => setActionId(a.id)} className={`w-full rounded-lg border px-3 py-2 text-left text-sm transition ${a.id === actionId ? "border-primary bg-primary/5 font-medium" : "border-transparent hover:bg-muted"}`}>
                                        {a.name}{!a.allowWrites ? <span className="ml-1 text-[10px] text-muted-foreground">(read-only)</span> : null}
                                    </button>
                                ))}
                            </div>
                        </GlassCardContent>
                    </GlassCard>
                    <div className="space-y-4">
                        <GlassCard>
                            <GlassCardContent className="space-y-3 p-4">
                                <div className="text-sm font-semibold">{action?.name || "Pick an action"}</div>
                                <Textarea rows={6} value={input} onChange={(e) => setInput(e.target.value)} placeholder={action?.inputHint || "What do you need?"}
                                    onKeyDown={(e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) run() }} />
                                <div className="flex items-center gap-3">
                                    <Button disabled={running || !action || !input.trim()} onClick={run}>{running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}{running ? "Working…" : "Run"}</Button>
                                    <span className="text-xs text-muted-foreground">Ctrl+Enter. Runs are logged (question, look-ups, answer, cost).</span>
                                </div>
                            </GlassCardContent>
                        </GlassCard>
                        {result ? (
                            <GlassCard>
                                <GlassCardContent className="space-y-3 p-4">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <Pill s={result.status} />
                                        {result.model ? <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">{result.model}</span> : null}
                                        {result.costUsd !== undefined ? <span className="text-xs text-muted-foreground">{usd(result.costUsd)}</span> : null}
                                        <Button size="sm" variant="ghost" className="ml-auto" onClick={() => navigator.clipboard?.writeText(result.output || "")}>Copy</Button>
                                    </div>
                                    <TrailChips trail={result.toolTrail} />
                                    <Md text={result.output || result.error || ""} />
                                    {result.proposals?.map((p) => <ProposalCard key={p.id} p={p} onDecided={onDecided} />)}
                                </GlassCardContent>
                            </GlassCard>
                        ) : null}
                        {others.length ? (
                            <GlassCard>
                                <GlassCardContent className="space-y-2 p-4">
                                    <div className="text-sm font-semibold">Waiting for your approval</div>
                                    {others.map((p) => <ProposalCard key={p.id} p={p} onDecided={onDecided} />)}
                                </GlassCardContent>
                            </GlassCard>
                        ) : null}
                    </div>
                </div>
            )}
        </PageContainer>
    )
}

// ------------------------------------------------------------------------------------------- history (audit log)
function History({ canManage }: { canManage: boolean }) {
    const { toast } = useToast()
    const [mine, setMine] = useState(!canManage)
    const [rows, setRows] = useState<RunRow[] | null>(null)
    const [open, setOpen] = useState<any>(null)
    useEffect(() => {
        let live = true
        setRows(null)
        apiGet<{ runs: RunRow[] }>(`/ai/runs?limit=100${mine ? "&mine=1" : ""}`)
            .then((r) => live && setRows(r.data.runs || []))
            .catch((e) => { toast({ title: "Couldn't load history", description: errText(e, ""), variant: "error" }); if (live) setRows([]) })
        return () => { live = false }
    }, [mine, toast])
    const show = async (id: string) => {
        try { setOpen((await apiGet<any>(`/ai/runs/${id}`)).data) } catch (e) { toast({ title: "Couldn't open the run", description: errText(e, ""), variant: "error" }) }
    }
    return (
        <GlassCard>
            <GlassCardContent className="p-0">
                {canManage ? (
                    <div className="flex gap-1 border-b p-3">
                        <Button size="sm" variant={!mine ? "default" : "outline"} onClick={() => setMine(false)}>Everyone</Button>
                        <Button size="sm" variant={mine ? "default" : "outline"} onClick={() => setMine(true)}>Mine</Button>
                    </div>
                ) : null}
                {!rows ? <div className="p-4"><Loader2 className="h-5 w-5 animate-spin" /></div> : !rows.length ? <div className="p-6 text-sm text-muted-foreground">No runs yet.</div> : (
                    <div className="divide-y text-sm">
                        {rows.map((r) => (
                            <button key={r.id} onClick={() => show(r.id)} className="flex w-full flex-wrap items-center gap-3 px-4 py-2 text-left hover:bg-muted/40">
                                <span className="w-32 text-xs text-muted-foreground">{new Date(r.createdAt).toLocaleString("en-GB", { dateStyle: "short", timeStyle: "short" })}</span>
                                <span className="w-28 truncate text-xs">{r.userName}</span>
                                <span className="w-48 truncate font-medium">{r.actionName}</span>
                                <span className="min-w-0 flex-1 truncate text-muted-foreground">{r.input}</span>
                                <Pill s={r.status} />
                                <span className="w-16 text-right text-xs text-muted-foreground">{usd(r.costUsd)}</span>
                            </button>
                        ))}
                    </div>
                )}
                <GlassModal open={!!open} onOpenChange={(o) => !o && setOpen(null)} title={`${open?.actionName ?? ""} - ${open?.userName ?? ""}`} className="max-h-[85vh] overflow-y-auto sm:max-w-3xl">
                    {open ? (
                        <div className="space-y-3 text-sm">
                            <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                                <Pill s={open.status} />
                                <span className="rounded bg-muted px-1.5 py-0.5 font-mono">{open.model}</span>
                                <span>{open.inputTokens} in / {open.outputTokens} out tokens - {usd(open.costUsd)} ({open.keySource === "managed" ? "AEM-managed AI" : "your key"})</span>
                                <span>{new Date(open.createdAt).toLocaleString("en-GB")}</span>
                            </div>
                            <div><div className="text-xs font-semibold text-muted-foreground">Asked</div><pre className="whitespace-pre-wrap font-sans">{open.input}</pre></div>
                            <TrailChips trail={open.toolTrail || []} />
                            <div><div className="text-xs font-semibold text-muted-foreground">Answer</div><Md text={open.output || open.error || ""} /></div>
                            {open.proposals?.map((p: Proposal) => <ProposalCard key={p.id} p={p} onDecided={(np) => setOpen((o: any) => ({ ...o, proposals: o.proposals.map((x: Proposal) => (x.id === np.id ? np : x)) }))} />)}
                        </div>
                    ) : null}
                </GlassModal>
            </GlassCardContent>
        </GlassCard>
    )
}

// ------------------------------------------------------------------------------------------- manage (workspace admins)
const PERMISSION_OPTIONS = ["", "crm.view", "quotes.view", "scheduling.view", "financials.view", "support.view", "reports.view", "documents.view"]

function Manage({ spaces, reload }: { spaces: Space[]; reload: () => void }) {
    const { toast } = useToast()
    const [s, setS] = useState<Settings | null>(null)
    const [newKey, setNewKey] = useState("")
    const [saving, setSaving] = useState(false)
    const [edit, setEdit] = useState<Partial<Action> | null>(null)
    const load = useCallback(async () => {
        try { setS((await apiGet<Settings>("/ai/settings")).data) } catch (e) { toast({ title: "Couldn't load AI settings", description: errText(e, ""), variant: "error" }) }
    }, [toast])
    useEffect(() => { load() }, [load])

    const save = async (patch: Record<string, unknown>, done?: string) => {
        setSaving(true)
        try {
            setS((await apiPut<Settings>("/ai/settings", patch)).data)
            toast({ title: done || "Saved", variant: "success" })
            reload()
            return true
        } catch (e) {
            toast({ title: "Couldn't save", description: errText(e, ""), variant: "error" })
            return false
        } finally { setSaving(false) }
    }
    const saveSpace = async (sp: Space, patch: Partial<Space>) => {
        try { await apiPut(`/ai/spaces/${sp.id}`, patch); reload() } catch (e) { toast({ title: "Couldn't save", description: errText(e, ""), variant: "error" }) }
    }
    const saveAction = async () => {
        if (!edit) return
        setSaving(true)
        try {
            const body = { spaceId: edit.spaceId, name: edit.name, instructions: edit.instructions, inputHint: edit.inputHint, model: edit.model || null, allowWrites: !!edit.allowWrites, enabled: edit.enabled !== false }
            if (edit.id) await apiPut(`/ai/actions/${edit.id}`, body)
            else await apiPost("/ai/actions", body)
            toast({ title: "Action saved", variant: "success" }); setEdit(null); reload()
        } catch (e) { toast({ title: "Couldn't save", description: errText(e, ""), variant: "error" }) } finally { setSaving(false) }
    }
    const del = async (a: Action) => {
        try { await apiDelete(`/ai/actions/${a.id}`, { confirmMessage: `Delete the action "${a.name}"? Its past runs stay in History.` }); reload() } catch { /* cancelled or failed */ }
    }
    if (!s) return <Loader2 className="h-5 w-5 animate-spin" />
    const models = [...new Set(["", ...s.models, s.defaultModel || "", edit?.model || ""])]

    return (
        <div className="space-y-4">
            <GlassCard>
                <GlassCardContent className="space-y-4 p-4 text-sm">
                    <div className="flex flex-wrap items-center gap-3">
                        <span className="text-base font-semibold">Set-up</span>
                        <Pill s={s.enabled ? "ok" : "rejected"}>{s.enabled ? "on" : "off"}</Pill>
                        <span className="text-xs text-muted-foreground">Spent {usd(s.spentThisMonthUsd)} this month</span>
                        <Button size="sm" variant="outline" className="ml-auto" disabled={saving} onClick={() => save({ enabled: !s.enabled }, s.enabled ? "AI Workspace switched off" : "AI Workspace switched on")}>{s.enabled ? "Switch off" : "Switch on"}</Button>
                    </div>
                    <div className="space-y-2">
                        <Label>Which AI account pays</Label>
                        <div className="flex flex-wrap gap-2">
                            <Button size="sm" variant={s.keySource === "own" ? "default" : "outline"} onClick={() => save({ keySource: "own" })}>Our own Anthropic key</Button>
                            <Button size="sm" variant={s.keySource === "managed" ? "default" : "outline"} disabled={!s.managedAllowed} onClick={() => save({ keySource: "managed" })}>AEM-managed AI{!s.managedAllowed ? " (ask AEM)" : ""}</Button>
                        </div>
                        {s.keySource === "managed" ? <p className="text-xs text-muted-foreground">{s.managedReady ? "Usage is billed to you by AEM each month." : "AEM hasn't finished setting up managed AI yet."}{s.platformCapUsd != null ? ` AEM limit: ${usd(s.platformCapUsd)}/month.` : ""}</p> : null}
                    </div>
                    {s.keySource === "own" ? (
                        <div className="space-y-2">
                            <Label>Anthropic API key</Label>
                            <p className="text-xs text-muted-foreground">
                                {s.anthropicKey ? <>Saved: <span className="font-mono">{s.anthropicKey}</span>. </> : "No key saved. "}
                                {s.keyUnreadable ? "The saved key can't be read any more - enter it again. " : ""}
                                Stored encrypted; it is never shown again in full. Create one at console.anthropic.com.
                            </p>
                            <div className="flex gap-2">
                                <Input type="password" autoComplete="off" placeholder="sk-ant-…" value={newKey} onChange={(e) => setNewKey(e.target.value)} className="max-w-md" />
                                <Button disabled={saving || !newKey.trim()} onClick={async () => { if (await save({ anthropicKey: newKey.trim() }, "Key checked and saved")) setNewKey("") }}>Save key</Button>
                                {s.anthropicKey ? <Button variant="outline" disabled={saving} onClick={() => save({ anthropicKey: "" }, "Key removed")}>Remove</Button> : null}
                            </div>
                        </div>
                    ) : null}
                    <div className="flex flex-wrap items-end gap-4">
                        <div className="space-y-1">
                            <Label>Default model</Label>
                            <select className="h-9 rounded-md border bg-background px-2" value={s.defaultModel || ""} onChange={(e) => save({ defaultModel: e.target.value || null })}>
                                {models.filter((m) => m !== undefined).map((m) => <option key={m} value={m}>{m || `Platform default (${s.platformDefaultModel})`}</option>)}
                            </select>
                        </div>
                        <div className="space-y-1">
                            <Label>Monthly spend cap (USD)</Label>
                            <Input key={s.monthlyCapUsd} className="w-28" type="number" min={0} defaultValue={s.monthlyCapUsd} onBlur={(e) => Number(e.target.value) !== s.monthlyCapUsd && save({ monthlyCapUsd: Number(e.target.value) })} />
                        </div>
                    </div>
                </GlassCardContent>
            </GlassCard>

            {spaces.map((sp) => (
                <GlassCard key={sp.id}>
                    <GlassCardContent className="space-y-3 p-4">
                        <div className="flex flex-wrap items-center gap-3">
                            <span className="text-base font-semibold">{sp.name}</span>
                            <Pill s={sp.enabled ? "ok" : "rejected"}>{sp.enabled ? "on" : "off"}</Pill>
                            <label className="flex items-center gap-2 text-xs text-muted-foreground">needs
                                <select className="h-8 rounded-md border bg-background px-2" value={sp.requiredPermission || ""} onChange={(e) => saveSpace(sp, { requiredPermission: e.target.value || null })}>
                                    {PERMISSION_OPTIONS.map((p) => <option key={p} value={p}>{p || "any office user"}</option>)}
                                </select>
                            </label>
                            <span className="ml-auto flex gap-2">
                                <Button size="sm" variant="outline" onClick={() => saveSpace(sp, { enabled: !sp.enabled })}>{sp.enabled ? "Turn off" : "Turn on"}</Button>
                                <Button size="sm" variant="outline" onClick={() => setEdit({ spaceId: sp.id, name: "", instructions: "", inputHint: "", model: "", allowWrites: false, enabled: true })}><Plus className="h-3.5 w-3.5" />Action</Button>
                            </span>
                        </div>
                        <div className="divide-y rounded-lg border text-sm">
                            {sp.actions.map((a) => (
                                <div key={a.id} className="flex flex-wrap items-center gap-3 px-3 py-2">
                                    <span className="font-medium">{a.name}</span>
                                    {!a.enabled ? <Pill s="rejected">off</Pill> : null}
                                    <span className="text-xs text-muted-foreground">{a.allowWrites ? "can propose saves" : "read-only"}</span>
                                    {a.model ? <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">{a.model}</span> : null}
                                    <span className="ml-auto flex gap-1">
                                        <Button size="sm" variant="outline" onClick={() => setEdit(a)}>Edit</Button>
                                        <Button size="sm" variant="ghost" onClick={() => del(a)}><Trash2 className="h-4 w-4" /></Button>
                                    </span>
                                </div>
                            ))}
                        </div>
                    </GlassCardContent>
                </GlassCard>
            ))}

            <GlassModal
                open={!!edit}
                onOpenChange={(o) => !o && setEdit(null)}
                title={edit?.id ? "Edit action" : "New action"}
                className="max-h-[85vh] overflow-y-auto sm:max-w-2xl"
                footer={
                    <div className="flex justify-end gap-2">
                        <Button variant="outline" onClick={() => setEdit(null)}>Cancel</Button>
                        <Button disabled={saving || !edit?.name?.trim() || !edit?.instructions?.trim()} onClick={saveAction}>{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}Save</Button>
                    </div>
                }
            >
                {edit ? (
                    <div className="space-y-3 text-sm">
                        <div className="space-y-1"><Label>Name</Label><Input value={edit.name || ""} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></div>
                        <div className="space-y-1"><Label>Hint shown in the box</Label><Input value={edit.inputHint || ""} onChange={(e) => setEdit({ ...edit, inputHint: e.target.value })} /></div>
                        <div className="space-y-1"><Label>Instructions - role, tone, output format, examples</Label><Textarea rows={12} value={edit.instructions || ""} onChange={(e) => setEdit({ ...edit, instructions: e.target.value })} /></div>
                        <div className="space-y-1"><Label>Model</Label>
                            <select className="h-9 w-full rounded-md border bg-background px-2" value={edit.model || ""} onChange={(e) => setEdit({ ...edit, model: e.target.value })}>
                                {models.map((m) => <option key={m} value={m}>{m || "Workspace default"}</option>)}
                            </select>
                        </div>
                        <label className="flex items-center gap-2"><input type="checkbox" checked={!!edit.allowWrites} onChange={(e) => setEdit({ ...edit, allowWrites: e.target.checked })} /> Can propose saves (lead notes) - each still needs the person&apos;s Approve</label>
                        <label className="flex items-center gap-2"><input type="checkbox" checked={edit.enabled !== false} onChange={(e) => setEdit({ ...edit, enabled: e.target.checked })} /> Enabled</label>
                    </div>
                ) : null}
            </GlassModal>
        </div>
    )
}

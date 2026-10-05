"use client"

import { useEffect, useState } from "react"
import type React from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { GlassModal } from "@/components/glass/GlassModal"
import { PhoneInput } from "@/components/shared/LocalizedFields"
import { TagChipsInput } from "@/components/shared/TagChipsInput"
import { AutocompleteOption, CreatableAutocomplete } from "@/components/shared/CreatableAutocomplete"

export const LEAD_SOURCE_OPTIONS = [
    "Web form",
    "Phone",
    "Referral",
    "Angi",
    "Thumbtack",
    "Walk-in",
    "Other"
] as const

const SELF_ASSIGNMENT_VALUE = "__self__"
const UNASSIGNED_VALUE = "unassigned"

export type AssignableUser = {
    id: string
    fullName: string
    email: string
    roles?: string[]
}

export type LeadFormValues = {
    name: string
    company: string
    email: string
    phone: string
    source: string
    status?: string
    industry: string
    tags: string[]
    assignedUserId?: string | null
}

export type LeadSubmitPayload = {
    name: string
    email: string
    phone: string
    source: string
    notes: string
    industry?: string
    tags: string[]
    status?: string
    assignedUserId?: string | null
}

type LeadFormDialogProps = {
    open: boolean
    mode: "create" | "edit"
    trigger?: React.ReactNode
    assignableUsers: AssignableUser[]
    currentUser?: { id: string; fullName?: string; email?: string } | null
    industryOptions: AutocompleteOption[]
    initialValues?: Partial<LeadFormValues>
    onOpenChange: (open: boolean) => void
    onCreateIndustry?: (title: string) => Promise<AutocompleteOption | void>
    onSubmit: (payload: LeadSubmitPayload) => Promise<void>
}

const defaultValues: LeadFormValues = {
    name: "",
    company: "",
    email: "",
    phone: "",
    source: "Web form",
    status: "NEW",
    industry: "",
    tags: [],
    assignedUserId: SELF_ASSIGNMENT_VALUE,
}

const toFormValues = (mode: "create" | "edit", initialValues?: Partial<LeadFormValues>): LeadFormValues => ({
    ...defaultValues,
    ...initialValues,
    tags: Array.isArray(initialValues?.tags) ? initialValues.tags : [],
    assignedUserId:
        initialValues?.assignedUserId ??
        (mode === "create" ? SELF_ASSIGNMENT_VALUE : UNASSIGNED_VALUE),
})

export function LeadFormDialog({
    open,
    mode,
    trigger,
    assignableUsers,
    currentUser,
    industryOptions,
    initialValues,
    onOpenChange,
    onCreateIndustry,
    onSubmit,
}: LeadFormDialogProps) {
    const [form, setForm] = useState<LeadFormValues>(() => toFormValues(mode, initialValues))
    const [errors, setErrors] = useState<{ name?: string; email?: string }>({})
    const [isSubmitting, setIsSubmitting] = useState(false)
    const currentUserLabel = currentUser?.fullName || currentUser?.email || "me"
    const isValidEmail = (value: string) => /\S+@\S+\.\S+/.test(value)

    useEffect(() => {
        if (open) {
            setForm(toFormValues(mode, initialValues))
            setErrors({})
        }
    }, [initialValues, mode, open])

    const submit = async () => {
        const nextErrors: { name?: string; email?: string } = {}
        if (!form.name.trim()) {
            nextErrors.name = "Please enter the prospect name."
        }
        if (!form.email.trim()) {
            nextErrors.email = "Please enter an email address."
        } else if (!isValidEmail(form.email.trim())) {
            nextErrors.email = "Please enter a valid email address."
        }
        setErrors(nextErrors)
        if (Object.keys(nextErrors).length > 0) return

        const assignedUserId =
            form.assignedUserId === SELF_ASSIGNMENT_VALUE
                ? undefined
                : form.assignedUserId === UNASSIGNED_VALUE
                    ? null
                    : form.assignedUserId

        setIsSubmitting(true)
        try {
            await onSubmit({
                name: form.name.trim(),
                email: form.email.trim(),
                phone: form.phone.trim(),
                source: form.source,
                notes: form.company.trim(),
                industry: form.industry.trim() || undefined,
                tags: form.tags,
                ...(mode === "edit" ? { status: form.status ?? "NEW" } : { status: "NEW" }),
                assignedUserId,
            })
            onOpenChange(false)
        } finally {
            setIsSubmitting(false)
        }
    }

    return (
        <GlassModal
            open={open}
            onOpenChange={onOpenChange}
            trigger={trigger}
            title={mode === "create" ? "Create New Lead" : "Edit Lead"}
            description={mode === "create" ? "Manually enter a new lead into the pipeline." : "Update lead details for this prospect."}
            footer={
                <div className="flex w-full justify-end gap-2">
                    <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
                        Cancel
                    </Button>
                    <Button onClick={() => { void submit() }} disabled={isSubmitting}>
                        {isSubmitting ? "Saving..." : mode === "create" ? "Save Lead" : "Save Changes"}
                    </Button>
                </div>
            }
        >
            <div className="space-y-5">
                <div className="rounded-2xl border border-glass-border/70 bg-white/35 p-4">
                    <div className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                        Contact
                    </div>
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        <div className="space-y-2">
                            <Label required>Prospect Name</Label>
                            <Input
                                placeholder="John Doe"
                                className={`bg-white/50 ${errors.name ? "border-destructive focus-visible:ring-destructive/50" : ""}`}
                                value={form.name}
                                onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
                            />
                            {errors.name ? <p className="text-xs text-destructive">{errors.name}</p> : null}
                        </div>
                        <div className="space-y-2">
                            <Label optional>Company / Notes</Label>
                            <Input
                                placeholder="Acme Corp"
                                className="bg-white/50"
                                value={form.company}
                                onChange={(event) => setForm((prev) => ({ ...prev, company: event.target.value }))}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label optional>Phone</Label>
                            <PhoneInput
                                value={form.phone}
                                onChange={(phone) => setForm((prev) => ({ ...prev, phone }))}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label required>Email</Label>
                            <Input
                                type="email"
                                placeholder="john@example.com"
                                className={`bg-white/50 ${errors.email ? "border-destructive focus-visible:ring-destructive/50" : ""}`}
                                value={form.email}
                                onChange={(event) => setForm((prev) => ({ ...prev, email: event.target.value }))}
                            />
                            {errors.email ? <p className="text-xs text-destructive">{errors.email}</p> : null}
                        </div>
                    </div>
                </div>

                <div className="rounded-2xl border border-glass-border/70 bg-white/35 p-4">
                    <div className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                        Pipeline
                    </div>
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        <div className="space-y-2">
                            <Label required>Source</Label>
                            <Select value={form.source} onValueChange={(value) => setForm((prev) => ({ ...prev, source: value }))}>
                                <SelectTrigger className="w-full bg-white/50">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {LEAD_SOURCE_OPTIONS.map((option) => (
                                        <SelectItem key={option} value={option}>
                                            {option}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <Label required>Assigned To</Label>
                            <Select
                                value={form.assignedUserId ?? UNASSIGNED_VALUE}
                                onValueChange={(value) => setForm((prev) => ({ ...prev, assignedUserId: value }))}
                            >
                                <SelectTrigger className="w-full bg-white/50">
                                    <SelectValue placeholder="Assign owner" />
                                </SelectTrigger>
                                <SelectContent>
                                    {mode === "create" ? (
                                        <SelectItem value={SELF_ASSIGNMENT_VALUE}>Assign to me ({currentUserLabel})</SelectItem>
                                    ) : (
                                        <SelectItem value={UNASSIGNED_VALUE}>Unassigned</SelectItem>
                                    )}
                                    {assignableUsers
                                        .filter((user) => mode === "edit" || user.id !== currentUser?.id)
                                        .map((user) => (
                                            <SelectItem key={user.id} value={user.id}>
                                                {user.fullName || user.email}{user.id === currentUser?.id ? " (me)" : ""}
                                            </SelectItem>
                                        ))}
                                </SelectContent>
                            </Select>
                        </div>
                        {mode === "edit" ? (
                            <div className="space-y-2">
                                <Label required>Status</Label>
                                <Select value={form.status ?? "NEW"} onValueChange={(value) => setForm((prev) => ({ ...prev, status: value }))}>
                                    <SelectTrigger className="w-full bg-white/50">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="NEW">New</SelectItem>
                                        <SelectItem value="CONTACTED">Contacted</SelectItem>
                                        <SelectItem value="QUALIFIED">Qualified</SelectItem>
                                        <SelectItem value="CONVERTED">Won</SelectItem>
                                        <SelectItem value="LOST">Lost</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        ) : null}
                        <div className="space-y-2">
                            <Label optional>Industry</Label>
                            <CreatableAutocomplete
                                value={form.industry}
                                options={industryOptions}
                                placeholder="Search or add industry..."
                                emptyLabel="No industries found."
                                onChange={(industry) => setForm((prev) => ({ ...prev, industry }))}
                                onCreateOption={onCreateIndustry}
                            />
                        </div>
                    </div>
                </div>

                <div className="rounded-2xl border border-glass-border/70 bg-white/35 p-4">
                    <div className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                        Tags
                    </div>
                    <TagChipsInput
                        value={form.tags}
                        onChange={(tags) => setForm((prev) => ({ ...prev, tags }))}
                    />
                </div>
            </div>
        </GlassModal>
    )
}

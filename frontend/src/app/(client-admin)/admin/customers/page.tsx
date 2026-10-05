"use client"

import { useCallback, useEffect, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { PageContainer } from "@/components/layout/PageContainer"
import { GlassCard, GlassCardContent, GlassCardHeader, GlassCardTitle, GlassCardDescription } from "@/components/glass/GlassCard"
import { GlassModal } from "@/components/glass/GlassModal"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Eye, KeyRound, Mail, Phone, Plus, SquarePen, Building2, Layers3 } from "lucide-react"
import { apiGet, apiPost, apiPut } from "@/lib/api"
import { ErrorToast } from "@/components/shared/ErrorToast"
import { AddressFields, emptyAddressValue, formatAddressValue, parseAddressValue, PhoneInput } from "@/components/shared/LocalizedFields"
import { DataPagination, useClientPagination } from "@/components/shared/DataPagination"
import { useToast } from "@/components/ui/toast"
import { getModulePermissions } from "@/lib/permission-ui"
import { useTenantFeatures } from "@/components/layout/TenantFeaturesContext"

type CustomerListItem = {
    id: string
    name?: string | null
    email: string
    phone?: string | null
    address?: string | null
    siteGroupsCount?: number | null
    sitesCount?: number | null
}

const getErrorMessage = (error: unknown, fallback: string) => {
    if (error && typeof error === "object" && "message" in error && typeof error.message === "string") {
        return error.message
    }
    return fallback
}

export default function CustomersPage() {
    const router = useRouter()
    const searchParams = useSearchParams()
    const { toast } = useToast()
    const { canView, canManage } = getModulePermissions("crm.view", "crm.manage")
    const { sites: sitesEnabled } = useTenantFeatures()
    const [customers, setCustomers] = useState<CustomerListItem[]>([])
    const [error, setError] = useState<string | null>(null)
    const [inviteOpen, setInviteOpen] = useState(false)
    const [inviteLoading, setInviteLoading] = useState(false)
    const [inviteForm, setInviteForm] = useState({ fullName: "", email: "", sendInvite: false })
    const [editOpen, setEditOpen] = useState(false)
    const [editLoading, setEditLoading] = useState(false)
    const [editingCustomerId, setEditingCustomerId] = useState<string | null>(null)
    const [editForm, setEditForm] = useState({ name: "", email: "", phone: "", address: emptyAddressValue() })
    const [resetPasswordOpen, setResetPasswordOpen] = useState(false)
    const [resetPasswordLoading, setResetPasswordLoading] = useState(false)
    const [resetPasswordCustomer, setResetPasswordCustomer] = useState<CustomerListItem | null>(null)
    const [resetPasswordForm, setResetPasswordForm] = useState({ password: "" })
    const [resetPasswordErrors, setResetPasswordErrors] = useState<{ password?: string }>({})
    const [credentialsOpen, setCredentialsOpen] = useState(false)
    const [credentials, setCredentials] = useState<{ email: string; loginUrl: string; tempPassword?: string | null } | null>(null)
    const customersPagination = useClientPagination(customers)

    const loadCustomers = useCallback(async () => {
        try {
            const res = await apiGet<CustomerListItem[]>("/customers")
            setCustomers(Array.isArray(res.data) ? res.data : [])
            setError(null)
        } catch (err: unknown) {
            setError(getErrorMessage(err, "Failed to load customers"))
        }
    }, [])

    useEffect(() => {
        loadCustomers()
    }, [loadCustomers])

    useEffect(() => {
        if (searchParams.get("create") === "customer" && canManage) {
            setInviteOpen(true)
        }
    }, [canManage, searchParams])

    const handleInvite = async () => {
        if (!canManage) {
            setError("Insufficient permissions.")
            return
        }
        if (!inviteForm.email) {
            setError("Email is required.")
            return
        }
        setInviteLoading(true)
        setError(null)
        try {
            await apiPost("/customers/invite", inviteForm)
            toast({
                title: inviteForm.sendInvite ? "Customer created and invite sent" : "Customer created",
                description: inviteForm.sendInvite
                    ? "Customer invitation has been emailed."
                    : "Customer was added without sending portal credentials.",
                variant: "success"
            })
            setInviteOpen(false)
            setInviteForm({ fullName: "", email: "", sendInvite: false })
            await loadCustomers()
        } catch (err: unknown) {
            setError(getErrorMessage(err, "Failed to send invite"))
        } finally {
            setInviteLoading(false)
        }
    }

    const openEditCustomer = (customer: CustomerListItem) => {
        setEditingCustomerId(customer.id)
        setEditForm({
            name: customer.name ?? "",
            email: customer.email ?? "",
            phone: customer.phone ?? "",
            address: parseAddressValue(customer.address),
        })
        setEditOpen(true)
    }

    const openResetPassword = (customer: CustomerListItem) => {
        if (!canManage) {
            setError("Insufficient permissions.")
            return
        }
        setResetPasswordCustomer(customer)
        setResetPasswordForm({ password: "" })
        setResetPasswordErrors({})
        setResetPasswordOpen(true)
    }

    const handleResetPassword = async () => {
        if (!canManage) {
            setError("Insufficient permissions.")
            return
        }
        if (!resetPasswordCustomer) return
        const password = resetPasswordForm.password.trim()
        if (password.length > 0 && password.length < 6) {
            setResetPasswordErrors({ password: "Password must be at least 6 characters." })
            return
        }
        setResetPasswordLoading(true)
        setError(null)
        try {
            const res = await apiPost<{ updated: boolean; authDetails?: { tempPassword?: string; loginUrl?: string; email?: string } }>(
                `/customers/${resetPasswordCustomer.id}/reset-password`,
                { password: password || undefined }
            )
            const authDetails = res.data.authDetails
            setCredentials({
                email: authDetails?.email ?? resetPasswordCustomer.email,
                loginUrl: authDetails?.loginUrl ?? "http://localhost:3000/customer/login",
                tempPassword: authDetails?.tempPassword ?? null,
            })
            setResetPasswordOpen(false)
            setResetPasswordCustomer(null)
            setCredentialsOpen(true)
            toast({
                title: "Password reset",
                description: "Customer portal credentials are ready to share.",
                variant: "success"
            })
        } catch (err: unknown) {
            setError(getErrorMessage(err, "Failed to reset customer password"))
        } finally {
            setResetPasswordLoading(false)
        }
    }

    const handleUpdateCustomer = async () => {
        if (!canManage) {
            setError("Insufficient permissions.")
            return
        }
        if (!editingCustomerId) return
        if (!editForm.name.trim() || !editForm.email.trim()) {
            setError("Name and email are required.")
            return
        }
        setEditLoading(true)
        setError(null)
        try {
            await apiPut(`/customers/${editingCustomerId}`, {
                name: editForm.name.trim(),
                email: editForm.email.trim(),
                phone: editForm.phone.trim(),
                address: formatAddressValue(editForm.address),
            })
            toast({ title: "Customer updated", description: "Customer details saved successfully.", variant: "success" })
            setEditOpen(false)
            setEditingCustomerId(null)
            await loadCustomers()
        } catch (err: unknown) {
            setError(getErrorMessage(err, "Failed to update customer"))
        } finally {
            setEditLoading(false)
        }
    }

    return (
        <PageContainer>
            {!canView ? (
                <GlassCard>
                    <GlassCardHeader>
                        <GlassCardTitle>Customers</GlassCardTitle>
                    </GlassCardHeader>
                    <GlassCardContent>You do not have access to view customers.</GlassCardContent>
                </GlassCard>
            ) : (
            <>
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-foreground">Customers</h1>
                    <p className="text-muted-foreground mt-1 text-sm">
                        {sitesEnabled ? "Manage customer accounts and their site portfolios." : "Manage customer accounts and commercial details."}
                    </p>
                </div>
                <Button className="gap-2" onClick={() => setInviteOpen(true)} disabled={!canManage}>
                    <Plus className="h-4 w-4" /> Create Customer
                </Button>
            </div>

            <GlassCard>
                <GlassCardHeader className="pb-3 border-b border-glass-border/50">
                    <GlassCardTitle className="text-lg">Customer Directory</GlassCardTitle>
                    <GlassCardDescription>{customers.length} customers in workspace</GlassCardDescription>
                </GlassCardHeader>
                <GlassCardContent className="p-0">
                    <Table>
                        <TableHeader className="bg-black/5">
                            <TableRow className="border-glass-border">
                                <TableHead>Customer</TableHead>
                                <TableHead>Contact</TableHead>
                                {sitesEnabled ? <TableHead>Sites</TableHead> : null}
                                <TableHead>Address</TableHead>
                                <TableHead className="text-right">Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {customers.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={sitesEnabled ? 5 : 4} className="h-32 text-center text-muted-foreground">
                                        <div className="flex flex-col items-center gap-3">
                                            <span>No customers yet.</span>
                                            {canManage ? (
                                                <Button size="sm" className="gap-2" onClick={() => setInviteOpen(true)}>
                                                    <Plus className="h-4 w-4" /> Create Customer
                                                </Button>
                                            ) : null}
                                        </div>
                                    </TableCell>
                                </TableRow>
                            ) : (
                                customersPagination.paginatedItems.map((customer) => (
                                    <TableRow
                                        key={customer.id}
                                        className="border-glass-border hover:bg-black/5 transition-colors"
                                    >
                                        <TableCell>
                                            <div className="flex flex-col">
                                                <span className="font-semibold text-sm">{customer.name ?? "Customer"}</span>
                                                <span className="text-xs text-muted-foreground">{customer.email}</span>
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            <div className="flex flex-col space-y-1 text-sm text-muted-foreground">
                                                <span className="flex items-center gap-2"><Mail className="h-3 w-3" /> {customer.email}</span>
                                                <span className="flex items-center gap-2"><Phone className="h-3 w-3" /> {customer.phone ?? "N/A"}</span>
                                            </div>
                                        </TableCell>
                                        {sitesEnabled ? (
                                            <TableCell>
                                                <div className="flex flex-col space-y-1 text-sm text-muted-foreground">
                                                    <span className="flex items-center gap-2"><Building2 className="h-3 w-3" /> {customer.sitesCount ?? 0} sites</span>
                                                    <span className="flex items-center gap-2"><Layers3 className="h-3 w-3" /> {customer.siteGroupsCount ?? 0} groups</span>
                                                </div>
                                            </TableCell>
                                        ) : null}
                                        <TableCell className="text-sm text-muted-foreground">
                                            {customer.address ?? "—"}
                                        </TableCell>
                                        <TableCell className="text-right">
                                            <div className="flex items-center justify-end gap-2">
                                                <Button
                                                    variant="outline"
                                                    size="sm"
                                                    className="gap-1"
                                                    onClick={() => router.push(`/admin/customers/${customer.id}`)}
                                                >
                                                    <Eye className="h-3.5 w-3.5" />
                                                    View
                                                </Button>
                                                <Button
                                                    variant="outline"
                                                    size="sm"
                                                    className="gap-1"
                                                    onClick={() => openEditCustomer(customer)}
                                                    disabled={!canManage}
                                                >
                                                    <SquarePen className="h-3.5 w-3.5" />
                                                    Edit
                                                </Button>
                                                <Button
                                                    variant="outline"
                                                    size="sm"
                                                    className="gap-1"
                                                    onClick={() => openResetPassword(customer)}
                                                    disabled={!canManage}
                                                >
                                                    <KeyRound className="h-3.5 w-3.5" />
                                                    Reset Password
                                                </Button>
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                ))
                            )}
                        </TableBody>
                    </Table>
                    <DataPagination {...customersPagination} onPageChange={customersPagination.setPage} />
                </GlassCardContent>
            </GlassCard>

            <ErrorToast error={error} onClear={() => setError(null)} />

            <GlassModal
                open={inviteOpen}
                onOpenChange={setInviteOpen}
                title="Create Customer"
                description="Add the customer now, and optionally send customer portal access."
                footer={
                    <div className="flex justify-end gap-2">
                        <Button variant="ghost" onClick={() => setInviteOpen(false)}>Cancel</Button>
                        <Button onClick={handleInvite} disabled={inviteLoading}>
                            {inviteLoading ? "Saving..." : inviteForm.sendInvite ? "Create & Send Invite" : "Create Customer"}
                        </Button>
                    </div>
                }
            >
                <div className="space-y-4">
                    <div className="space-y-2">
                        <Label optional>Full Name</Label>
                        <Input
                            placeholder="Customer name"
                            value={inviteForm.fullName}
                            onChange={(e) => setInviteForm((prev) => ({ ...prev, fullName: e.target.value }))}
                        />
                    </div>
                    <div className="space-y-2">
                        <Label required>Email</Label>
                        <Input
                            type="email"
                            placeholder="customer@email.com"
                            value={inviteForm.email}
                            onChange={(e) => setInviteForm((prev) => ({ ...prev, email: e.target.value }))}
                        />
                    </div>
                    <label className="flex items-start gap-3 rounded-xl border border-glass-border bg-white/40 p-3 cursor-pointer">
                        <Checkbox
                            checked={inviteForm.sendInvite}
                            onCheckedChange={(checked) => setInviteForm((prev) => ({ ...prev, sendInvite: Boolean(checked) }))}
                            className="mt-0.5"
                        />
                        <span className="text-sm">
                            <span className="block font-medium text-foreground">Send customer portal invite</span>
                            <span className="block text-xs text-muted-foreground">
                                If unchecked, the customer is created only. You can reset/send portal credentials later.
                            </span>
                        </span>
                    </label>
                </div>
            </GlassModal>

            <GlassModal
                open={editOpen}
                onOpenChange={setEditOpen}
                title="Edit Customer"
                description="Update customer profile and contact information."
                footer={
                    <div className="flex justify-end gap-2">
                        <Button
                            variant="ghost"
                            onClick={() => {
                                setEditOpen(false)
                                setEditingCustomerId(null)
                            }}
                        >
                            Cancel
                        </Button>
                        <Button onClick={handleUpdateCustomer} disabled={editLoading}>
                            {editLoading ? "Saving..." : "Save Changes"}
                        </Button>
                    </div>
                }
            >
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                        <Label required>Name</Label>
                        <Input
                            placeholder="Customer name"
                            value={editForm.name}
                            onChange={(e) => setEditForm((prev) => ({ ...prev, name: e.target.value }))}
                        />
                    </div>
                    <div className="space-y-2">
                        <Label required>Email</Label>
                        <Input
                            type="email"
                            placeholder="customer@email.com"
                            value={editForm.email}
                            onChange={(e) => setEditForm((prev) => ({ ...prev, email: e.target.value }))}
                        />
                    </div>
                    <div className="space-y-2 md:col-span-2">
                        <Label optional>Phone</Label>
                        <PhoneInput
                            value={editForm.phone}
                            onChange={(phone) => setEditForm((prev) => ({ ...prev, phone }))}
                        />
                    </div>
                    <div className="md:col-span-2">
                        <AddressFields
                            value={editForm.address}
                            onChange={(address) => setEditForm((prev) => ({ ...prev, address }))}
                        />
                    </div>
                </div>
            </GlassModal>
            <GlassModal
                open={resetPasswordOpen}
                onOpenChange={(open) => {
                    setResetPasswordOpen(open)
                    if (!open) {
                        setResetPasswordCustomer(null)
                        setResetPasswordForm({ password: "" })
                        setResetPasswordErrors({})
                    }
                }}
                title="Reset Customer Password"
                description="Set a new customer portal password, or leave it blank to auto-generate one."
                footer={
                    <div className="flex justify-end gap-2">
                        <Button variant="ghost" onClick={() => setResetPasswordOpen(false)}>Cancel</Button>
                        <Button onClick={handleResetPassword} disabled={resetPasswordLoading}>
                            <KeyRound className="h-3.5 w-3.5 mr-1" />
                            {resetPasswordLoading ? "Saving..." : "Reset Password"}
                        </Button>
                    </div>
                }
            >
                <div className="space-y-4">
                    <div className="rounded-xl border border-glass-border bg-white/40 p-4">
                        <p className="text-xs uppercase text-muted-foreground">Customer</p>
                        <p className="font-semibold text-foreground">{resetPasswordCustomer?.name ?? "Selected customer"}</p>
                        <p className="text-sm text-muted-foreground">{resetPasswordCustomer?.email ?? ""}</p>
                    </div>
                    <div className="space-y-2">
                        <Label optional>New Password</Label>
                        <Input
                            className={`w-full h-10 ${resetPasswordErrors.password ? "border-destructive" : ""}`}
                            type="password"
                            name="reset-customer-new-password"
                            autoComplete="new-password"
                            data-lpignore="true"
                            data-1p-ignore="true"
                            value={resetPasswordForm.password}
                            onChange={(e) => {
                                setResetPasswordForm({ password: e.target.value })
                                setResetPasswordErrors({})
                            }}
                            placeholder="Leave blank to auto-generate"
                        />
                        {resetPasswordErrors.password ? (
                            <p className="text-xs text-destructive">{resetPasswordErrors.password}</p>
                        ) : (
                            <p className="text-xs text-muted-foreground">Generated/reset credentials will be shown after reset and emailed to the customer.</p>
                        )}
                    </div>
                </div>
            </GlassModal>
            <GlassModal
                open={credentialsOpen}
                onOpenChange={setCredentialsOpen}
                title="Customer Login Details"
                description="Share these customer portal details if needed."
                footer={
                    <div className="flex justify-end gap-2">
                        <Button onClick={() => setCredentialsOpen(false)}>Close</Button>
                    </div>
                }
            >
                <div className="space-y-3 text-sm">
                    <div>
                        <p className="text-xs uppercase text-muted-foreground">Login URL</p>
                        <p className="font-medium">{credentials?.loginUrl ?? "—"}</p>
                    </div>
                    <div>
                        <p className="text-xs uppercase text-muted-foreground">Email</p>
                        <p className="font-medium">{credentials?.email ?? "—"}</p>
                    </div>
                    <div>
                        <p className="text-xs uppercase text-muted-foreground">Temporary Password</p>
                        <p className="font-medium">{credentials?.tempPassword ?? "Use existing password"}</p>
                    </div>
                </div>
            </GlassModal>
            </>
            )}
        </PageContainer>
    )
}

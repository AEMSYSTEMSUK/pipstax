"use client"

import * as React from "react"
import { GlassModal } from "@/components/glass/GlassModal"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { AddressFields, emptyAddressValue, formatAddressValue, PhoneInput } from "@/components/shared/LocalizedFields"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { apiGet, apiPost } from "@/lib/api"
import { useToast } from "@/components/ui/toast"

type QuickCreateRequest = {
    label: string
    href?: string
    onCreated?: (created: unknown) => void
}

type RoleOption = {
    value: string
    label: string
}

const QUICK_CREATED_EVENT = "pipstack:quick-created"

const emitQuickCreated = (type: string, data: unknown) => {
    window.dispatchEvent(new CustomEvent(QUICK_CREATED_EVENT, { detail: { type, data } }))
}

const getCreateTypeFromHref = (href?: string) => {
    if (!href || typeof window === "undefined") return null
    const url = new URL(href, window.location.origin)
    const create = url.searchParams.get("create")

    if (url.pathname === "/admin/customers" && create === "customer") return "customer"
    if (/^\/admin\/customers\/[^/]+$/.test(url.pathname) && create === "site") return "site"
    if (/^\/admin\/customers\/[^/]+$/.test(url.pathname) && create === "site-group") return "site-group"
    if (url.pathname === "/admin/team" && create === "employee") return "employee"
    if (url.pathname === "/admin/settings" && create === "role") return "role"

    return null
}

const getCustomerIdFromHref = (href?: string) => {
    if (!href || typeof window === "undefined") return ""
    const url = new URL(href, window.location.origin)
    const match = url.pathname.match(/^\/admin\/customers\/([^/]+)$/)
    return match?.[1] ?? ""
}

export function QuickCreateProvider({ children }: { children: React.ReactNode }) {
    const { toast } = useToast()
    const [customerOpen, setCustomerOpen] = React.useState(false)
    const [siteOpen, setSiteOpen] = React.useState(false)
    const [siteGroupOpen, setSiteGroupOpen] = React.useState(false)
    const [employeeOpen, setEmployeeOpen] = React.useState(false)
    const [roleOpen, setRoleOpen] = React.useState(false)
    const [unsupportedRequest, setUnsupportedRequest] = React.useState<QuickCreateRequest | null>(null)
    const [savingCustomer, setSavingCustomer] = React.useState(false)
    const [savingSite, setSavingSite] = React.useState(false)
    const [savingSiteGroup, setSavingSiteGroup] = React.useState(false)
    const [savingEmployee, setSavingEmployee] = React.useState(false)
    const [savingRole, setSavingRole] = React.useState(false)
    const [customerRequest, setCustomerRequest] = React.useState<QuickCreateRequest | null>(null)
    const [siteRequest, setSiteRequest] = React.useState<QuickCreateRequest | null>(null)
    const [siteGroupRequest, setSiteGroupRequest] = React.useState<QuickCreateRequest | null>(null)
    const [employeeRequest, setEmployeeRequest] = React.useState<QuickCreateRequest | null>(null)
    const [roleRequest, setRoleRequest] = React.useState<QuickCreateRequest | null>(null)
    const [customerErrors, setCustomerErrors] = React.useState<{ name?: string; email?: string }>({})
    const [siteErrors, setSiteErrors] = React.useState<{ name?: string; customerId?: string }>({})
    const [siteGroupErrors, setSiteGroupErrors] = React.useState<{ name?: string; customerId?: string }>({})
    const [employeeErrors, setEmployeeErrors] = React.useState<{ fullName?: string; email?: string; role?: string }>({})
    const [roleError, setRoleError] = React.useState<string | null>(null)
    const [roleOptions, setRoleOptions] = React.useState<RoleOption[]>([
        { value: "FIELD_WORKER", label: "Field Worker" },
        { value: "ADMIN", label: "Admin" },
        { value: "MANAGER", label: "Manager" },
        { value: "HR", label: "HR" },
    ])
    const [employeeForm, setEmployeeForm] = React.useState({
        fullName: "",
        email: "",
        phone: "",
        hourlyRate: "",
        role: "MANAGER",
    })
    const [customerForm, setCustomerForm] = React.useState({
        name: "",
        email: "",
        phone: "",
        address: emptyAddressValue(),
    })
    const [siteForm, setSiteForm] = React.useState({
        customerId: "",
        name: "",
        address: emptyAddressValue(),
        primaryContactName: "",
        primaryContactEmail: "",
        primaryContactPhone: "",
    })
    const [siteGroupForm, setSiteGroupForm] = React.useState({
        customerId: "",
        name: "",
        description: "",
        sortOrder: "",
    })
    const [roleForm, setRoleForm] = React.useState({
        name: "",
        code: "",
    })

    const resetCustomer = React.useCallback(() => {
        setCustomerForm({ name: "", email: "", phone: "", address: emptyAddressValue() })
        setCustomerErrors({})
        setCustomerRequest(null)
    }, [])

    const resetSite = React.useCallback(() => {
        setSiteForm({ customerId: "", name: "", address: emptyAddressValue(), primaryContactName: "", primaryContactEmail: "", primaryContactPhone: "" })
        setSiteErrors({})
        setSiteRequest(null)
    }, [])

    const resetSiteGroup = React.useCallback(() => {
        setSiteGroupForm({ customerId: "", name: "", description: "", sortOrder: "" })
        setSiteGroupErrors({})
        setSiteGroupRequest(null)
    }, [])

    const resetEmployee = React.useCallback(() => {
        setEmployeeForm((prev) => ({ fullName: "", email: "", phone: "", hourlyRate: "", role: prev.role || "MANAGER" }))
        setEmployeeErrors({})
    }, [])

    const resetRole = React.useCallback(() => {
        setRoleForm({ name: "", code: "" })
        setRoleError(null)
    }, [])

    const loadRoles = React.useCallback(async () => {
        try {
            const res = await apiGet<any[]>("/settings/roles")
            const excluded = new Set(["CUSTOMER", "SUB_CONTRACTOR"])
            const mapped = (Array.isArray(res.data) ? res.data : [])
                .filter((role) => role?.code && !excluded.has(role.code))
                .map((role) => ({
                    value: role.code,
                    label: role.name ?? String(role.code).replace(/_/g, " "),
                }))
            if (mapped.length > 0) {
                setRoleOptions(mapped)
                setEmployeeForm((prev) => ({
                    ...prev,
                    role: mapped.some((role) => role.value === prev.role) ? prev.role : mapped[0].value,
                }))
            }
        } catch {
            // Keep fallback role options when settings roles cannot be loaded.
        }
    }, [])

    React.useEffect(() => {
        const handleQuickCreate = (event: Event) => {
            const customEvent = event as CustomEvent<QuickCreateRequest>
            const createType = getCreateTypeFromHref(customEvent.detail?.href)
            if (!createType) return

            event.preventDefault()
            if (createType === "customer") {
                setCustomerRequest(customEvent.detail)
                setCustomerForm({ name: "", email: "", phone: "", address: emptyAddressValue() })
                setCustomerErrors({})
                setCustomerOpen(true)
                return
            }
            if (createType === "site") {
                const customerId = getCustomerIdFromHref(customEvent.detail?.href)
                setSiteRequest(customEvent.detail)
                setSiteForm({ customerId, name: "", address: emptyAddressValue(), primaryContactName: "", primaryContactEmail: "", primaryContactPhone: "" })
                setSiteErrors({})
                setSiteOpen(true)
                return
            }
            if (createType === "site-group") {
                const customerId = getCustomerIdFromHref(customEvent.detail?.href)
                setSiteGroupRequest(customEvent.detail)
                setSiteGroupForm({ customerId, name: "", description: "", sortOrder: "" })
                setSiteGroupErrors({})
                setSiteGroupOpen(true)
                return
            }
            if (createType === "employee") {
                setEmployeeRequest(customEvent.detail)
                resetEmployee()
                setEmployeeOpen(true)
                void loadRoles()
                return
            }
            if (createType === "role") {
                setRoleRequest(customEvent.detail)
                resetRole()
                setRoleOpen(true)
            }
        }

        window.addEventListener("pipstack:quick-create", handleQuickCreate)
        return () => window.removeEventListener("pipstack:quick-create", handleQuickCreate)
    }, [loadRoles, resetEmployee, resetRole])

    React.useEffect(() => {
        const handleUnsupportedQuickCreate = (event: Event) => {
            const customEvent = event as CustomEvent<QuickCreateRequest>
            setUnsupportedRequest(customEvent.detail)
        }

        window.addEventListener("pipstack:quick-create-unsupported", handleUnsupportedQuickCreate)
        return () => window.removeEventListener("pipstack:quick-create-unsupported", handleUnsupportedQuickCreate)
    }, [])

    const createCustomer = async () => {
        const nextErrors: { name?: string; email?: string } = {}
        if (!customerForm.name.trim()) nextErrors.name = "Customer name is required."
        if (!customerForm.email.trim()) nextErrors.email = "Email is required."
        setCustomerErrors(nextErrors)
        if (Object.keys(nextErrors).length > 0) return

        try {
            setSavingCustomer(true)
            const res = await apiPost<any>("/customers", {
                name: customerForm.name.trim(),
                email: customerForm.email.trim(),
                phone: customerForm.phone.trim() || undefined,
                address: formatAddressValue(customerForm.address),
            })
            customerRequest?.onCreated?.(res.data)
            emitQuickCreated("customer", res.data)
            setCustomerOpen(false)
            resetCustomer()
            toast({ title: "Customer created", description: "The new customer is available in the current form.", variant: "success" })
        } catch (error: any) {
            toast({ title: "Customer creation failed", description: error?.message ?? "Failed to add customer.", variant: "error" })
        } finally {
            setSavingCustomer(false)
        }
    }

    const createSite = async () => {
        const nextErrors: { name?: string; customerId?: string } = {}
        if (!siteForm.customerId) nextErrors.customerId = "Select a customer before adding a site."
        if (!siteForm.name.trim()) nextErrors.name = "Site name is required."
        setSiteErrors(nextErrors)
        if (Object.keys(nextErrors).length > 0) return

        try {
            setSavingSite(true)
            const res = await apiPost<any>(`/customers/${siteForm.customerId}/sites`, {
                name: siteForm.name.trim(),
                addressLine1: siteForm.address.addressLine1,
                addressLine2: siteForm.address.addressLine2,
                city: siteForm.address.city,
                state: siteForm.address.state,
                postalCode: siteForm.address.postalCode,
                country: siteForm.address.country,
                primaryContactName: siteForm.primaryContactName.trim() || undefined,
                primaryContactEmail: siteForm.primaryContactEmail.trim() || undefined,
                primaryContactPhone: siteForm.primaryContactPhone.trim() || undefined,
            })
            siteRequest?.onCreated?.(res.data)
            emitQuickCreated("site", res.data)
            setSiteOpen(false)
            resetSite()
            toast({ title: "Site created", description: "The new site is available in the current form.", variant: "success" })
        } catch (error: any) {
            toast({ title: "Site creation failed", description: error?.message ?? "Failed to add site.", variant: "error" })
        } finally {
            setSavingSite(false)
        }
    }

    const createSiteGroup = async () => {
        const nextErrors: { name?: string; customerId?: string } = {}
        if (!siteGroupForm.customerId) nextErrors.customerId = "Select a customer before adding a site group."
        if (!siteGroupForm.name.trim()) nextErrors.name = "Site group name is required."
        setSiteGroupErrors(nextErrors)
        if (Object.keys(nextErrors).length > 0) return

        try {
            setSavingSiteGroup(true)
            const sortOrder = siteGroupForm.sortOrder.trim() ? Number(siteGroupForm.sortOrder) : undefined
            const res = await apiPost<any>(`/customers/${siteGroupForm.customerId}/site-groups`, {
                name: siteGroupForm.name.trim(),
                description: siteGroupForm.description.trim() || undefined,
                sortOrder: typeof sortOrder === "number" && Number.isFinite(sortOrder) ? sortOrder : undefined,
            })
            siteGroupRequest?.onCreated?.(res.data)
            emitQuickCreated("site-group", res.data)
            setSiteGroupOpen(false)
            resetSiteGroup()
            toast({ title: "Site group created", description: "The new site group is available in the current form.", variant: "success" })
        } catch (error: any) {
            toast({ title: "Site group creation failed", description: error?.message ?? "Failed to add site group.", variant: "error" })
        } finally {
            setSavingSiteGroup(false)
        }
    }

    const createEmployee = async () => {
        const nextErrors: { fullName?: string; email?: string; role?: string } = {}
        if (!employeeForm.fullName.trim()) nextErrors.fullName = "Full name is required."
        if (!employeeForm.email.trim()) nextErrors.email = "Email is required."
        if (!employeeForm.role) nextErrors.role = "Role is required."
        setEmployeeErrors(nextErrors)
        if (Object.keys(nextErrors).length > 0) return

        try {
            setSavingEmployee(true)
            const hourlyRate = employeeForm.hourlyRate.trim() ? Number(employeeForm.hourlyRate) : undefined
            const res = await apiPost<{ user: any; authDetails?: any }>("/users", {
                fullName: employeeForm.fullName.trim(),
                email: employeeForm.email.trim(),
                phone: employeeForm.phone.trim() || undefined,
                hourlyRate: typeof hourlyRate === "number" && Number.isFinite(hourlyRate) ? hourlyRate : undefined,
                roleCodes: [employeeForm.role],
            })
            employeeRequest?.onCreated?.(res.data.user)
            emitQuickCreated("employee", res.data.user)
            setEmployeeOpen(false)
            resetEmployee()
            toast({ title: "Employee added", description: "The new employee is available in the current form.", variant: "success" })
        } catch (error: any) {
            toast({ title: "Employee creation failed", description: error?.message ?? "Failed to add employee.", variant: "error" })
        } finally {
            setSavingEmployee(false)
        }
    }

    const createRole = async () => {
        if (!roleForm.name.trim()) {
            setRoleError("Role name is required.")
            return
        }

        try {
            setSavingRole(true)
            const res = await apiPost<any>("/settings/roles", {
                name: roleForm.name.trim(),
                code: roleForm.code.trim() || undefined,
            })
            const created = res.data
            const option = { value: created.code, label: created.name ?? created.code }
            setRoleOptions((prev) => [option, ...prev.filter((role) => role.value !== option.value)])
            setEmployeeForm((prev) => ({ ...prev, role: option.value }))
            roleRequest?.onCreated?.(created)
            emitQuickCreated("role", created)
            setRoleOpen(false)
            resetRole()
            toast({ title: "Role created", description: "The new role is available in the current form.", variant: "success" })
        } catch (error: any) {
            setRoleError(error?.message ?? "Failed to create role.")
        } finally {
            setSavingRole(false)
        }
    }

    return (
        <>
            {children}
            <GlassModal
                open={customerOpen}
                onOpenChange={(open) => {
                    setCustomerOpen(open)
                    if (!open) resetCustomer()
                }}
                title="Add Customer"
                description="Create a customer without leaving the current form."
                className="z-[70]"
                footer={
                    <div className="flex justify-end gap-2 w-full">
                        <Button variant="outline" onClick={() => setCustomerOpen(false)} disabled={savingCustomer}>Cancel</Button>
                        <Button onClick={createCustomer} disabled={savingCustomer}>
                            {savingCustomer ? "Creating..." : "Create Customer"}
                        </Button>
                    </div>
                }
            >
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                        <Label required>Customer Name</Label>
                        <Input value={customerForm.name} onChange={(e) => setCustomerForm((prev) => ({ ...prev, name: e.target.value }))} placeholder="e.g. Acme Ltd" />
                        {customerErrors.name ? <p className="text-xs text-destructive">{customerErrors.name}</p> : null}
                    </div>
                    <div className="space-y-2">
                        <Label required>Email</Label>
                        <Input type="email" value={customerForm.email} onChange={(e) => setCustomerForm((prev) => ({ ...prev, email: e.target.value }))} placeholder="customer@example.com" />
                        {customerErrors.email ? <p className="text-xs text-destructive">{customerErrors.email}</p> : null}
                    </div>
                    <div className="space-y-2 md:col-span-2">
                        <Label optional>Phone</Label>
                        <PhoneInput value={customerForm.phone} onChange={(phone) => setCustomerForm((prev) => ({ ...prev, phone }))} />
                    </div>
                    <div className="md:col-span-2">
                        <AddressFields value={customerForm.address} onChange={(address) => setCustomerForm((prev) => ({ ...prev, address }))} />
                    </div>
                </div>
            </GlassModal>
            <GlassModal
                open={siteOpen}
                onOpenChange={(open) => {
                    setSiteOpen(open)
                    if (!open) resetSite()
                }}
                title="Add Customer Site"
                description="Create a site without leaving the current form."
                className="z-[70]"
                footer={
                    <div className="flex justify-end gap-2 w-full">
                        <Button variant="outline" onClick={() => setSiteOpen(false)} disabled={savingSite}>Cancel</Button>
                        <Button onClick={createSite} disabled={savingSite}>
                            {savingSite ? "Creating..." : "Create Site"}
                        </Button>
                    </div>
                }
            >
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {siteErrors.customerId ? <p className="text-xs text-destructive md:col-span-2">{siteErrors.customerId}</p> : null}
                    <div className="space-y-2 md:col-span-2">
                        <Label required>Site Name</Label>
                        <Input value={siteForm.name} onChange={(e) => setSiteForm((prev) => ({ ...prev, name: e.target.value }))} placeholder="e.g. Main Office" />
                        {siteErrors.name ? <p className="text-xs text-destructive">{siteErrors.name}</p> : null}
                    </div>
                    <div className="md:col-span-2">
                        <AddressFields value={siteForm.address} onChange={(address) => setSiteForm((prev) => ({ ...prev, address }))} />
                    </div>
                    <div className="space-y-2">
                        <Label optional>Primary Contact Name</Label>
                        <Input value={siteForm.primaryContactName} onChange={(e) => setSiteForm((prev) => ({ ...prev, primaryContactName: e.target.value }))} />
                    </div>
                    <div className="space-y-2">
                        <Label optional>Primary Contact Email</Label>
                        <Input type="email" value={siteForm.primaryContactEmail} onChange={(e) => setSiteForm((prev) => ({ ...prev, primaryContactEmail: e.target.value }))} />
                    </div>
                    <div className="space-y-2 md:col-span-2">
                        <Label optional>Primary Contact Phone</Label>
                        <PhoneInput value={siteForm.primaryContactPhone} onChange={(primaryContactPhone) => setSiteForm((prev) => ({ ...prev, primaryContactPhone }))} />
                    </div>
                </div>
            </GlassModal>
            <GlassModal
                open={siteGroupOpen}
                onOpenChange={(open) => {
                    setSiteGroupOpen(open)
                    if (!open) resetSiteGroup()
                }}
                title="Add Site Group"
                description="Create a site group without leaving the current form."
                className="z-[80]"
                footer={
                    <div className="flex justify-end gap-2 w-full">
                        <Button variant="outline" onClick={() => setSiteGroupOpen(false)} disabled={savingSiteGroup}>Cancel</Button>
                        <Button onClick={createSiteGroup} disabled={savingSiteGroup}>
                            {savingSiteGroup ? "Creating..." : "Create Site Group"}
                        </Button>
                    </div>
                }
            >
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {siteGroupErrors.customerId ? <p className="text-xs text-destructive md:col-span-2">{siteGroupErrors.customerId}</p> : null}
                    <div className="space-y-2 md:col-span-2">
                        <Label required>Site Group Name</Label>
                        <Input
                            value={siteGroupForm.name}
                            onChange={(e) => setSiteGroupForm((prev) => ({ ...prev, name: e.target.value }))}
                            placeholder="e.g. North Region"
                        />
                        {siteGroupErrors.name ? <p className="text-xs text-destructive">{siteGroupErrors.name}</p> : null}
                    </div>
                    <div className="space-y-2 md:col-span-2">
                        <Label optional>Description</Label>
                        <Input
                            value={siteGroupForm.description}
                            onChange={(e) => setSiteGroupForm((prev) => ({ ...prev, description: e.target.value }))}
                            placeholder="Optional notes about this group"
                        />
                    </div>
                    <div className="space-y-2">
                        <Label optional>Sort Order</Label>
                        <Input
                            type="number"
                            value={siteGroupForm.sortOrder}
                            onChange={(e) => setSiteGroupForm((prev) => ({ ...prev, sortOrder: e.target.value }))}
                            placeholder="0"
                        />
                    </div>
                </div>
            </GlassModal>
            <GlassModal
                open={employeeOpen}
                onOpenChange={(open) => {
                    setEmployeeOpen(open)
                    if (!open) {
                        resetEmployee()
                        setEmployeeRequest(null)
                    }
                }}
                title="Add Employee"
                description="Create an employee without leaving the current form."
                className="z-[70]"
                footer={
                    <div className="flex justify-end gap-2 w-full">
                        <Button variant="outline" onClick={() => setEmployeeOpen(false)}>Cancel</Button>
                        <Button onClick={createEmployee} disabled={savingEmployee}>
                            {savingEmployee ? "Creating..." : "Create Employee"}
                        </Button>
                    </div>
                }
            >
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                        <Label required>Full Name</Label>
                        <Input value={employeeForm.fullName} onChange={(e) => setEmployeeForm((prev) => ({ ...prev, fullName: e.target.value }))} />
                        {employeeErrors.fullName ? <p className="text-xs text-destructive">{employeeErrors.fullName}</p> : null}
                    </div>
                    <div className="space-y-2">
                        <Label required>Email</Label>
                        <Input type="email" value={employeeForm.email} onChange={(e) => setEmployeeForm((prev) => ({ ...prev, email: e.target.value }))} />
                        {employeeErrors.email ? <p className="text-xs text-destructive">{employeeErrors.email}</p> : null}
                    </div>
                    <div className="space-y-2">
                        <Label optional>Phone</Label>
                        <PhoneInput value={employeeForm.phone} onChange={(phone) => setEmployeeForm((prev) => ({ ...prev, phone }))} />
                    </div>
                    <div className="space-y-2">
                        <Label optional>Hourly Rate</Label>
                        <Input
                            type="number"
                            min={0}
                            step={0.5}
                            value={employeeForm.hourlyRate}
                            onChange={(e) => setEmployeeForm((prev) => ({ ...prev, hourlyRate: e.target.value }))}
                            placeholder="e.g. 25"
                        />
                    </div>
                    <div className="space-y-2 md:col-span-2">
                        <Label required>Role</Label>
                        <Select value={employeeForm.role} createOption={{ label: "role", href: "/admin/settings?create=role" }} onValueChange={(value) => setEmployeeForm((prev) => ({ ...prev, role: value }))}>
                            <SelectTrigger className="w-full bg-white/60">
                                <SelectValue placeholder="Select role" />
                            </SelectTrigger>
                            <SelectContent>
                                {roleOptions.map((role) => (
                                    <SelectItem key={role.value} value={role.value}>
                                        {role.label}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        {employeeErrors.role ? <p className="text-xs text-destructive">{employeeErrors.role}</p> : null}
                    </div>
                </div>
            </GlassModal>
            <GlassModal
                open={roleOpen}
                onOpenChange={(open) => {
                    setRoleOpen(open)
                    if (!open) {
                        resetRole()
                        setRoleRequest(null)
                    }
                }}
                title="Create New Role"
                description="Add a custom team role without leaving the current form."
                className="z-[80]"
                footer={
                    <div className="flex justify-end gap-2 w-full">
                        <Button variant="outline" onClick={() => setRoleOpen(false)}>Cancel</Button>
                        <Button onClick={createRole} disabled={savingRole}>
                            {savingRole ? "Creating..." : "Create Role"}
                        </Button>
                    </div>
                }
            >
                <div className="space-y-4">
                    {roleError ? <p className="text-sm text-destructive">{roleError}</p> : null}
                    <div className="space-y-2">
                        <Label required>Role Name</Label>
                        <Input value={roleForm.name} onChange={(e) => setRoleForm((prev) => ({ ...prev, name: e.target.value }))} placeholder="e.g. Operations Lead" />
                    </div>
                    <div className="space-y-2">
                        <Label optional>Role Code</Label>
                        <Input value={roleForm.code} onChange={(e) => setRoleForm((prev) => ({ ...prev, code: e.target.value }))} placeholder="e.g. OPERATIONS_LEAD" />
                    </div>
                </div>
            </GlassModal>
            <GlassModal
                open={Boolean(unsupportedRequest)}
                onOpenChange={(open) => {
                    if (!open) setUnsupportedRequest(null)
                }}
                title={`Add ${unsupportedRequest?.label ?? "record"}`}
                description="This quick-create popup has not been configured yet."
                className="z-[90]"
                footer={
                    <div className="flex justify-end gap-2 w-full">
                        <Button onClick={() => setUnsupportedRequest(null)}>Close</Button>
                    </div>
                }
            >
                <p className="text-sm text-muted-foreground">
                    I kept you in the current form instead of redirecting. A dedicated quick-create form still needs to be added for this record type.
                </p>
            </GlassModal>
        </>
    )
}

export const quickCreatedEventName = QUICK_CREATED_EVENT

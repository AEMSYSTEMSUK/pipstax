export type PermissionKey =
    | "crm.view"
    | "crm.manage"
    | "scheduling.view"
    | "scheduling.manage"
    | "subcontractors.view"
    | "subcontractors.manage"
    | "quotes.view"
    | "quotes.manage"
    | "financials.view"
    | "financials.manage"
    | "documents.view"
    | "documents.manage"
    | "support.view"
    | "support.manage"
    | "reports.view"
    | "reports.manage"
    | "team.view"
    | "team.manage"
    | "settings.view"
    | "settings.manage"
    | "hr.view"
    | "hr.manage"

const defaultRolePermissions: Record<string, Record<PermissionKey, boolean>> = {
    ADMIN: {
        "crm.view": true,
        "crm.manage": true,
        "scheduling.view": true,
        "scheduling.manage": true,
        "subcontractors.view": true,
        "subcontractors.manage": true,
        "quotes.view": true,
        "quotes.manage": true,
        "financials.view": true,
        "financials.manage": true,
        "documents.view": true,
        "documents.manage": true,
        "support.view": true,
        "support.manage": true,
        "reports.view": true,
        "reports.manage": true,
        "team.view": true,
        "team.manage": true,
        "settings.view": true,
        "settings.manage": true,
        "hr.view": true,
        "hr.manage": true
    },
    MANAGER: {
        "crm.view": false,
        "crm.manage": false,
        "scheduling.view": true,
        "scheduling.manage": false,
        "subcontractors.view": false,
        "subcontractors.manage": false,
        "quotes.view": false,
        "quotes.manage": false,
        "financials.view": false,
        "financials.manage": false,
        "documents.view": false,
        "documents.manage": false,
        "support.view": false,
        "support.manage": false,
        "reports.view": true,
        "reports.manage": false,
        "team.view": false,
        "team.manage": false,
        "settings.view": true,
        "settings.manage": false,
        "hr.view": true,
        "hr.manage": true
    },
    HR: {
        "crm.view": false,
        "crm.manage": false,
        "scheduling.view": true,
        "scheduling.manage": false,
        "subcontractors.view": false,
        "subcontractors.manage": false,
        "quotes.view": false,
        "quotes.manage": false,
        "financials.view": false,
        "financials.manage": false,
        "documents.view": true,
        "documents.manage": false,
        "support.view": false,
        "support.manage": false,
        "reports.view": true,
        "reports.manage": false,
        "team.view": true,
        "team.manage": false,
        "settings.view": false,
        "settings.manage": false,
        "hr.view": true,
        "hr.manage": true
    },
    FIELD_WORKER: {
        "crm.view": false,
        "crm.manage": false,
        "scheduling.view": true,
        "scheduling.manage": true,
        "subcontractors.view": false,
        "subcontractors.manage": false,
        "quotes.view": false,
        "quotes.manage": false,
        "financials.view": false,
        "financials.manage": false,
        "documents.view": true,
        "documents.manage": true,
        "support.view": false,
        "support.manage": false,
        "reports.view": false,
        "reports.manage": false,
        "team.view": false,
        "team.manage": false,
        "settings.view": false,
        "settings.manage": false,
        "hr.view": false,
        "hr.manage": false
    },
    SUB_CONTRACTOR: {
        "crm.view": false,
        "crm.manage": false,
        "scheduling.view": true,
        "scheduling.manage": true,
        "subcontractors.view": false,
        "subcontractors.manage": false,
        "quotes.view": false,
        "quotes.manage": false,
        "financials.view": false,
        "financials.manage": false,
        "documents.view": true,
        "documents.manage": true,
        "support.view": false,
        "support.manage": false,
        "reports.view": false,
        "reports.manage": false,
        "team.view": false,
        "team.manage": false,
        "settings.view": false,
        "settings.manage": false,
        "hr.view": false,
        "hr.manage": false
    },
    CUSTOMER: {
        "crm.view": false,
        "crm.manage": false,
        "scheduling.view": true,
        "scheduling.manage": false,
        "subcontractors.view": false,
        "subcontractors.manage": false,
        "quotes.view": true,
        "quotes.manage": false,
        "financials.view": true,
        "financials.manage": false,
        "documents.view": true,
        "documents.manage": false,
        "support.view": true,
        "support.manage": true,
        "reports.view": false,
        "reports.manage": false,
        "team.view": false,
        "team.manage": false,
        "settings.view": false,
        "settings.manage": false,
        "hr.view": false,
        "hr.manage": false
    }
}

export const getPermissionsForRoles = (roles: string[] = []) => {
    const combined: Record<PermissionKey, boolean> = {} as Record<PermissionKey, boolean>
    roles.forEach((role) => {
        const permissions = defaultRolePermissions[role]
        if (!permissions) return
        Object.entries(permissions).forEach(([key, value]) => {
            if (value) {
                combined[key as PermissionKey] = true
            }
        })
    })
    return combined
}

export const hasPermission = (permissions: Record<PermissionKey, boolean>, key: PermissionKey) => {
    return Boolean(permissions[key])
}

export const getPermissionsFromRoleObjects = (roles: Array<{ code?: string; permissions?: Record<string, boolean> }> = []) => {
    const combined: Record<PermissionKey, boolean> = {} as Record<PermissionKey, boolean>
    roles.forEach((role) => {
        if (role.permissions) {
            Object.entries(role.permissions).forEach(([key, value]) => {
                if (value) {
                    combined[key as PermissionKey] = true
                }
            })
            return
        }
        if (role.code) {
            const defaults = defaultRolePermissions[role.code]
            if (defaults) {
                Object.entries(defaults).forEach(([key, value]) => {
                    if (value) {
                        combined[key as PermissionKey] = true
                    }
                })
            }
        }
    })
    return combined
}

import { getEffectivePermissions } from "@/lib/auth"
import type { PermissionKey } from "@/lib/permissions"

export const getModulePermissions = (viewKey: PermissionKey, manageKey: PermissionKey) => {
    const permissions = getEffectivePermissions() ?? {}
    const canManage = Boolean(permissions[manageKey])
    const canView = Boolean(permissions[viewKey] || canManage)
    return { permissions, canView, canManage }
}

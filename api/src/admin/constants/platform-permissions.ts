export const PlatformPermissions = {
  DASHBOARD_VIEW: 'platform.dashboard.view',
  TENANTS_VIEW: 'platform.tenants.view',
  TENANTS_MANAGE: 'platform.tenants.manage',
  USERS_VIEW: 'platform.users.view',
  USERS_MANAGE: 'platform.users.manage',
  SETTINGS_MANAGE: 'platform.settings.manage'
} as const;

export type PlatformPermissionKey = typeof PlatformPermissions[keyof typeof PlatformPermissions];

export const defaultPlatformRolePermissions: Record<string, Record<PlatformPermissionKey, boolean>> = {
  PLATFORM_ADMIN: {
    'platform.dashboard.view': true,
    'platform.tenants.view': true,
    'platform.tenants.manage': true,
    'platform.users.view': true,
    'platform.users.manage': true,
    'platform.settings.manage': true
  }
};

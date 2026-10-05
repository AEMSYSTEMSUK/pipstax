import { AppDataSource } from '../config/data-source';
import { User } from '../entities/user.entity';
import { PermissionKey, Permissions, defaultRolePermissions } from '../constants/permissions';
import { SystemRole } from '../constants/roles';

export const buildEffectivePermissions = async (userId: string) => {
  const repo = AppDataSource.getRepository(User);
  const user = await repo.findOne({ where: { id: userId }, relations: ['roles'] });
  if (!user) {
    return { permissions: {}, user: null };
  }

  const hasAdminRole = (user.roles ?? []).some((role) => role.code === SystemRole.ADMIN);
  const allPermissionKeys = Object.values(Permissions) as PermissionKey[];
  const rolePermissions = user.roles.reduce<Record<string, boolean>>((acc, role) => {
    const perms: Record<string, boolean> = role.permissions && Object.keys(role.permissions).length > 0
      ? (role.permissions as Record<string, boolean>)
      : ((defaultRolePermissions[role.code] ?? {}) as Record<string, boolean>);
    Object.keys(perms).forEach((key) => {
      acc[key] = acc[key] || perms[key as keyof typeof perms];
    });
    return acc;
  }, {});

  const override = user.permissionsOverride ?? {};
  const merged: Record<PermissionKey, boolean> = hasAdminRole
    ? allPermissionKeys.reduce((acc, key) => {
        acc[key] = true;
        return acc;
      }, {} as Record<PermissionKey, boolean>)
    : {
        ...(rolePermissions as Record<PermissionKey, boolean>),
        ...(override as Record<PermissionKey, boolean>)
      };

  return { permissions: merged, user };
};

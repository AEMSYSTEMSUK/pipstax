import { AppDataSource } from '../../config/data-source';
import { PlatformAdmin } from '../entities/platform-admin.entity';
import { PlatformPermissionKey } from '../constants/platform-permissions';

export const buildPlatformPermissions = async (adminId: string) => {
  const repo = AppDataSource.getRepository(PlatformAdmin);
  const admin = await repo.findOne({ where: { id: adminId }, relations: ['roles'] });
  if (!admin) {
    return { permissions: {}, admin: null };
  }

  const rolePermissions = admin.roles.reduce<Record<string, boolean>>((acc: Record<string, boolean>, role: any) => {
    const perms = role.permissions ?? {};
    Object.keys(perms).forEach((key) => {
      acc[key] = acc[key] || perms[key];
    });
    return acc;
  }, {});

  const override = admin.permissionsOverride ?? {};
  const merged: Record<PlatformPermissionKey, boolean> = {
    ...(rolePermissions as Record<PlatformPermissionKey, boolean>),
    ...(override as Record<PlatformPermissionKey, boolean>)
  };

  return { permissions: merged, admin };
};

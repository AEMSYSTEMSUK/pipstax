import { AppDataSource } from '../../config/data-source';
import { PlatformRole } from '../entities/platform-role.entity';
import { defaultPlatformRolePermissions } from '../constants/platform-permissions';

const platformRoleCodes = Object.keys(defaultPlatformRolePermissions);

export const ensurePlatformRoles = async () => {
  const repo = AppDataSource.getRepository(PlatformRole);
  const existing = await repo.find();
  const existingCodes = new Set(existing.map((role: any) => role.code));
  const toCreate = platformRoleCodes.filter((code) => !existingCodes.has(code));
  const toUpdate = existing.filter((role: any) => !role.permissions || Object.keys(role.permissions).length === 0);

  if (toUpdate.length > 0) {
    toUpdate.forEach((role: any) => {
      role.permissions = defaultPlatformRolePermissions[role.code] ?? {};
    });
    await repo.save(toUpdate);
  }

  if (toCreate.length === 0) {
    return existing;
  }

  const created = repo.create(
    toCreate.map((code) => ({
      code,
      name: code.replace(/_/g, ' '),
      permissions: defaultPlatformRolePermissions[code] ?? {}
    }))
  );
  await repo.save(created);
  return [...existing, ...created];
};

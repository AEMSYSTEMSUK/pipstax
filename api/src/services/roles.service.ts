import { AppDataSource } from '../config/data-source';
import { Role } from '../entities/role.entity';
import { SystemRole } from '../constants/roles';
import { defaultRolePermissions } from '../constants/permissions';

const roleCodes = Object.values(SystemRole);

export const ensureRolesForTenant = async (tenantId: string) => {
  const repo = AppDataSource.getRepository(Role);
  const existing = await repo.find({ where: { tenantId } });
  const existingCodes = new Set(existing.map((role) => role.code));
  const toCreate = roleCodes.filter((code) => !existingCodes.has(code));
  const toUpdate = existing.filter((role) => !role.permissions || Object.keys(role.permissions).length === 0);

  if (toUpdate.length > 0) {
    toUpdate.forEach((role) => {
      role.permissions = defaultRolePermissions[role.code] ?? {};
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
      tenantId,
      permissions: defaultRolePermissions[code] ?? {}
    }))
  );
  await repo.save(created);
  return [...existing, ...created];
};

import { Request, Response, NextFunction } from 'express';
import { AppDataSource } from '../../../config/data-source';
import { Role } from '../../../entities/role.entity';
import { User } from '../../../entities/user.entity';
import { getTenantId } from '../../../utils/request';
import { BadRequestError, NotFoundError } from '../../../utils/errors';

export const listRoles = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = getTenantId(req);
    const repo = AppDataSource.getRepository(Role);
    const roles = await repo.find({ where: { tenantId, isDeleted: false } });
    res.deliver(200, true, roles, 'Roles fetched');
  } catch (error) {
    next(error);
  }
};

export const updateRolePermissions = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = getTenantId(req);
    const repo = AppDataSource.getRepository(Role);
    const role = await repo.findOne({ where: { id: req.params.id, tenantId, isDeleted: false } });
    if (!role) {
      throw new NotFoundError('Role not found');
    }
    role.permissions = req.body.permissions;
    await repo.save(role);
    res.deliver(200, true, role, 'Role permissions updated');
  } catch (error) {
    next(error);
  }
};

export const createRole = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = getTenantId(req);
    const repo = AppDataSource.getRepository(Role);
    const rawName = (req.body.name ?? '').toString().trim();
    if (!rawName) {
      throw new BadRequestError('Role name required');
    }
    const rawCode = (req.body.code ?? '')
      .toString()
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '');
    const code = rawCode || rawName.toUpperCase().replace(/[^A-Z0-9]+/g, '_');

    const existing = await repo.findOne({ where: { tenantId, code, isDeleted: false } });
    if (existing) {
      throw new BadRequestError('Role code already exists');
    }

    const role = repo.create({
      tenantId,
      name: rawName,
      code,
      permissions: {}
    });
    await repo.save(role);
    res.deliver(201, true, role, 'Role created');
  } catch (error) {
    next(error);
  }
};

export const updateUserPermissions = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = getTenantId(req);
    const repo = AppDataSource.getRepository(User);
    const user = await repo.findOne({ where: { id: req.params.id, tenantId, isDeleted: false } });
    if (!user) {
      throw new NotFoundError('User not found');
    }
    user.permissionsOverride = req.body.permissionsOverride;
    await repo.save(user);
    res.deliver(200, true, user, 'User permissions updated');
  } catch (error) {
    next(error);
  }
};

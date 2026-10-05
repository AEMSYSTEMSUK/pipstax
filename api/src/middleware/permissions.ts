import { Request, Response, NextFunction } from 'express';
import { ForbiddenError } from '../utils/errors';
import { buildEffectivePermissions } from '../services/permissions.service';
import { PermissionKey } from '../constants/permissions';

export const requirePermission = (permission: PermissionKey) => async (
  req: Request,
  _res: Response,
  next: NextFunction
) => {
  try {
    if (!req.userId) {
      throw new ForbiddenError('User context missing');
    }
    const { permissions } = await buildEffectivePermissions(req.userId);
    req.permissions = permissions;
    if (!(permissions as any)[permission]) {
      throw new ForbiddenError('Insufficient permissions');
    }
    next();
  } catch (error) {
    next(error);
  }
};

import { Request, Response, NextFunction } from 'express';
import { ForbiddenError } from '../../utils/errors';
import { buildPlatformPermissions } from '../services/platform-permissions.service';
import { PlatformPermissionKey } from '../constants/platform-permissions';

export const requirePlatformPermission = (permission: PlatformPermissionKey) => async (
  req: Request,
  _res: Response,
  next: NextFunction
) => {
  try {
    if (!req.platformAdminId) {
      throw new ForbiddenError('Platform admin context missing');
    }
    const { permissions } = await buildPlatformPermissions(req.platformAdminId);
    req.platformPermissions = permissions;
    if (!(permissions as any)[permission]) {
      throw new ForbiddenError('Insufficient permissions');
    }
    next();
  } catch (error) {
    next(error);
  }
};

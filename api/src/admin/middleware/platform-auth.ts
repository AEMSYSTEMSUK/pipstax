import { Request, Response, NextFunction } from 'express';
import { UnauthorizedError } from '../../utils/errors';
import { verifyToken } from '../../utils/jwt';
import { setAuditActor } from '../../services/audit-context.service';

type PlatformAuthPayload = {
  platformAdminId: string;
  roles: string[];
  scope?: string;
};

export const platformAuthMiddleware = (req: Request, _res: Response, next: NextFunction) => {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return next(new UnauthorizedError('Missing authorization header'));
  }

  const token = header.replace('Bearer ', '').trim();
  try {
    const payload = verifyToken<PlatformAuthPayload>(token);
    if (!payload.platformAdminId) {
      throw new UnauthorizedError('Invalid token');
    }
    req.platformAdminId = payload.platformAdminId;
    req.platformRoles = payload.roles;
    setAuditActor('platform_admin', payload.platformAdminId);
    next();
  } catch (error) {
    next(new UnauthorizedError('Invalid token'));
  }
};

import { Request, Response, NextFunction } from 'express';
import { UnauthorizedError } from '../utils/errors';
import { verifyToken } from '../utils/jwt';
import { setAuditActor } from '../services/audit-context.service';

type AuthPayload = {
  userId: string;
  tenantId: string;
  roles: string[];
};

export const authMiddleware = (req: Request, _res: Response, next: NextFunction) => {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return next(new UnauthorizedError('Missing authorization header'));
  }

  const token = header.replace('Bearer ', '').trim();
  try {
    const payload = verifyToken<AuthPayload>(token);
    if (!payload.userId || !payload.tenantId || !Array.isArray(payload.roles)) {
      return next(new UnauthorizedError('Invalid token'));
    }
    req.userId = payload.userId;
    req.tenantId = payload.tenantId;
    req.roles = payload.roles;
    setAuditActor('tenant_user', payload.userId);
    next();
  } catch (error) {
    next(new UnauthorizedError('Invalid token'));
  }
};

import { Request, Response, NextFunction } from 'express';
import { ForbiddenError } from '../utils/errors';

export const requireRoles = (roles: string[]) => (req: Request, _res: Response, next: NextFunction) => {
  const current = req.roles ?? [];
  const allowed = roles.some((role) => current.includes(role));
  if (!allowed) {
    return next(new ForbiddenError('Insufficient permissions'));
  }
  next();
};

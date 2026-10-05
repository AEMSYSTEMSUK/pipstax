import { Request, Response, NextFunction } from 'express';
import { UnauthorizedError } from '../../utils/errors';
import { SystemRole } from '../../constants/roles';

export const requireAppRole = (req: Request, _res: Response, next: NextFunction) => {
  const roles = req.roles ?? [];
  if (roles.includes(SystemRole.FIELD_WORKER) || roles.includes(SystemRole.SUB_CONTRACTOR)) {
    return next();
  }
  return next(new UnauthorizedError('App access denied'));
};

export const requireFieldWorkerRole = (
  req: Request,
  _res: Response,
  next: NextFunction,
) => {
  const roles = req.roles ?? [];
  if (roles.includes(SystemRole.FIELD_WORKER)) {
    return next();
  }
  return next(new UnauthorizedError('Field worker access required'));
};

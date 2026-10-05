import { Request, Response, NextFunction } from 'express';
import { UnauthorizedError } from '../utils/errors';
import { verifyToken } from '../utils/jwt';
import { setAuditActor } from '../services/audit-context.service';

type CustomerAuthPayload = {
  accountId?: string;
  scope?: string;
};

export const customerPortalAuthMiddleware = (req: Request, _res: Response, next: NextFunction) => {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return next(new UnauthorizedError('Customer login required'));
  }

  const token = header.replace('Bearer ', '').trim();
  try {
    const payload = verifyToken<CustomerAuthPayload>(token);
    if (payload.scope !== 'customer' || !payload.accountId) {
      return next(new UnauthorizedError('Invalid customer session'));
    }
    req.customerAccountId = payload.accountId;
    setAuditActor('customer_account', payload.accountId);
    next();
  } catch {
    next(new UnauthorizedError('Customer login required'));
  }
};

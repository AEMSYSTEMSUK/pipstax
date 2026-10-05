import { Request } from 'express';
import { BadRequestError } from './errors';

export const getTenantId = (req: Request) => {
  if (!req.tenantId) {
    throw new BadRequestError('Tenant context missing');
  }
  return req.tenantId;
};

export const getUserId = (req: Request) => {
  if (!req.userId) {
    throw new BadRequestError('User context missing');
  }
  return req.userId;
};

import { AsyncLocalStorage } from 'async_hooks';
import { NextFunction, Request, Response } from 'express';

export type AuditActorType = 'tenant_user' | 'platform_admin' | 'customer_account' | 'system';

export type AuditContext = {
  actorType?: AuditActorType;
  actorId?: string;
};

const auditStorage = new AsyncLocalStorage<AuditContext>();

export const auditContextMiddleware = (_req: Request, _res: Response, next: NextFunction) => {
  auditStorage.run({}, next);
};

export const setAuditActor = (actorType: AuditActorType, actorId?: string | null) => {
  const store = auditStorage.getStore();
  if (!store || !actorId) return;
  store.actorType = actorType;
  store.actorId = actorId;
};

export const getAuditActor = () => auditStorage.getStore();

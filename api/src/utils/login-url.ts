import { env } from '../config/env';
import { SystemRole } from '../constants/roles';
import { resolveTenantAppUrl } from './tenant-url';

export const resolveLoginUrl = async (roles: SystemRole[], tenantId: string) => {
  if (roles.includes(SystemRole.FIELD_WORKER)) {
    return env.workerAppUrl;
  }
  return resolveTenantAppUrl(tenantId, '/common-login');
};

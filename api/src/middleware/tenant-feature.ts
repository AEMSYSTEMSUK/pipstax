import { Request, Response, NextFunction } from 'express';
import { assertTenantFeatureEnabled, TenantFeatureKey } from '../services/tenant-features.service';
import { getTenantId } from '../utils/request';

export const requireTenantFeature = (feature: TenantFeatureKey, message?: string) => {
  return async (req: Request, _res: Response, next: NextFunction) => {
    try {
      const tenantId = getTenantId(req);
      await assertTenantFeatureEnabled(tenantId, feature, message);
      next();
    } catch (error) {
      next(error);
    }
  };
};

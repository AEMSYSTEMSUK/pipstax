import { Router } from 'express';
import { platformAuthMiddleware } from '../middleware/platform-auth';
import { requirePlatformPermission } from '../middleware/require-platform-permission';
import { PlatformPermissions } from '../constants/platform-permissions';
import {
  platformOverview,
  listTenants,
  getTenant,
  updateTenant,
  createTenant,
  listTenantUsers,
  resetTenantUserPassword,
  listPlatformAdmins
} from '../controllers/platform.controller';
import { NextFunction, Request, Response } from 'express';
import { platformGetSettings, platformUpdateSettings, platformUpdateTenantAi, platformUsage } from '../../services/ai-workspace/ai-workspace.service';

const router = Router();

router.use(platformAuthMiddleware);

router.get('/overview', requirePlatformPermission(PlatformPermissions.DASHBOARD_VIEW), platformOverview);
router.get('/tenants', requirePlatformPermission(PlatformPermissions.TENANTS_VIEW), listTenants);
router.post('/tenants', requirePlatformPermission(PlatformPermissions.TENANTS_MANAGE), createTenant);
router.get('/tenants/:id', requirePlatformPermission(PlatformPermissions.TENANTS_VIEW), getTenant);
router.put('/tenants/:id', requirePlatformPermission(PlatformPermissions.TENANTS_MANAGE), updateTenant);
router.get('/tenants/:id/users', requirePlatformPermission(PlatformPermissions.USERS_VIEW), listTenantUsers);
router.post('/tenants/:id/users/:userId/reset-password', requirePlatformPermission(PlatformPermissions.USERS_MANAGE), resetTenantUserPassword);
router.get('/admins', requirePlatformPermission(PlatformPermissions.USERS_VIEW), listPlatformAdmins);

// AI Workspace (#229 part 3): AEM's managed Anthropic key + default model, per-tenant managed-AI switch/cap, and the
// monthly per-tenant usage that ONE pulls for billing. (The admin app has no screen for these yet.)
const ai = (fn: (req: Request) => Promise<unknown>, message: string) => async (req: Request, res: Response, next: NextFunction) => {
  try { res.deliver(200, true, await fn(req), message); } catch (error) { next(error); }
};
router.get('/ai/settings', requirePlatformPermission(PlatformPermissions.SETTINGS_MANAGE), ai(() => platformGetSettings(), 'AI settings'));
router.put('/ai/settings', requirePlatformPermission(PlatformPermissions.SETTINGS_MANAGE), ai((req) => platformUpdateSettings(req.body || {}), 'AI settings saved'));
router.put('/tenants/:id/ai', requirePlatformPermission(PlatformPermissions.TENANTS_MANAGE), ai((req) => platformUpdateTenantAi(String(req.params.id), req.body || {}), 'Tenant AI saved'));
router.get('/ai/usage', requirePlatformPermission(PlatformPermissions.TENANTS_VIEW), ai((req) => platformUsage(String(req.query.month || '')), 'AI usage'));

export default router;

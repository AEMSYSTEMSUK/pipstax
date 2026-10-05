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

export default router;

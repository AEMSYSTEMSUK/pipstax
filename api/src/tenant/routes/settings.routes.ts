import { NextFunction, Request, Response, Router } from 'express';
import { getTenantProfile, updateTenantProfile } from '../controllers/admin/tenant.controller';
import { createRole, listRoles, updateRolePermissions, updateUserPermissions } from '../controllers/admin/permissions.controller';
import { authMiddleware } from '../../middleware/auth';
import { tenantMiddleware } from '../../middleware/tenant';
import { requirePermission } from '../../middleware/permissions';
import { Permissions } from '../../constants/permissions';
import { validateBody } from '../../middleware/validate';
import { CreateRoleDto, UpdateRolePermissionsDto, UpdateUserPermissionsDto } from '../dto/permissions.dto';
import { upload } from '../../middleware/upload.middleware';
import { getTenantId } from '../../utils/request';
import { resolveTenantStorageContext, storeTenantFile } from '../../services/storage/storage.service';

const router = Router();

router.use(authMiddleware, tenantMiddleware);

router.get('/tenant', requirePermission(Permissions.SETTINGS_VIEW), getTenantProfile);
router.put('/tenant', requirePermission(Permissions.SETTINGS_MANAGE), updateTenantProfile);
router.post(
  '/brand-assets',
  requirePermission(Permissions.SETTINGS_MANAGE),
  upload.single('file'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const file = req.file as Express.Multer.File | undefined;
      if (!file) {
        return res.deliver(400, false, null, 'No file uploaded');
      }
      const tenantId = getTenantId(req);
      const storageContext = await resolveTenantStorageContext(tenantId);
      const uploaded = await storeTenantFile(storageContext, file, { scope: 'branding' });
      return res.deliver(
        201,
        true,
        { path: uploaded.key, url: uploaded.url },
        'Brand asset uploaded',
      );
    } catch (error) {
      next(error);
    }
  },
);

router.get('/roles', requirePermission(Permissions.SETTINGS_VIEW), listRoles);
router.post('/roles', requirePermission(Permissions.SETTINGS_MANAGE), validateBody(CreateRoleDto), createRole);
router.put('/roles/:id', requirePermission(Permissions.SETTINGS_MANAGE), validateBody(UpdateRolePermissionsDto), updateRolePermissions);
router.put('/users/:id/permissions', requirePermission(Permissions.SETTINGS_MANAGE), validateBody(UpdateUserPermissionsDto), updateUserPermissions);

export default router;

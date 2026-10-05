import { NextFunction, Request, Response, Router } from 'express';
import {
  createLookupOption,
  deleteLookupOption,
  listLookupOptions,
  updateLookupOption,
} from '../controllers/lookup-options.controller';
import { authMiddleware } from '../../middleware/auth';
import { tenantMiddleware } from '../../middleware/tenant';
import { Permissions } from '../../constants/permissions';
import { validateBody } from '../../middleware/validate';
import { LookupOptionCreateDto, LookupOptionUpdateDto } from '../dto/lookup-option.dto';
import { buildEffectivePermissions } from '../../services/permissions.service';
import { ForbiddenError } from '../../utils/errors';

const router = Router();

router.use(authMiddleware, tenantMiddleware);

const normalizeLookupType = (value: unknown) => String(value ?? '').trim().toLowerCase().replace(/[\s-]+/g, '_');

const requireLookupViewPermission = async (req: Request, _res: Response, next: NextFunction) => {
  try {
    if (!req.userId) {
      throw new ForbiddenError('User context missing');
    }
    const type = normalizeLookupType(req.query?.type);
    const { permissions } = await buildEffectivePermissions(req.userId);
    req.permissions = permissions;
    if (type === 'compliance_report_type') {
      if (
        !(permissions as any)[Permissions.REPORTS_VIEW] &&
        !(permissions as any)[Permissions.REPORTS_MANAGE] &&
        !(permissions as any)[Permissions.CRM_VIEW]
      ) {
        throw new ForbiddenError('Insufficient permissions');
      }
      next();
      return;
    }
    if (!(permissions as any)[Permissions.CRM_VIEW]) {
      throw new ForbiddenError('Insufficient permissions');
    }
    next();
  } catch (error) {
    next(error);
  }
};

const requireLookupManagePermission = async (req: Request, _res: Response, next: NextFunction) => {
  try {
    if (!req.userId) {
      throw new ForbiddenError('User context missing');
    }
    const type = normalizeLookupType(req.body?.type ?? req.query?.type);
    const { permissions } = await buildEffectivePermissions(req.userId);
    req.permissions = permissions;
    if (type === 'compliance_report_type') {
      if (!(permissions as any)[Permissions.REPORTS_MANAGE] && !(permissions as any)[Permissions.CRM_MANAGE]) {
        throw new ForbiddenError('Insufficient permissions');
      }
      next();
      return;
    }
    if (!(permissions as any)[Permissions.CRM_MANAGE]) {
      throw new ForbiddenError('Insufficient permissions');
    }
    next();
  } catch (error) {
    next(error);
  }
};

router.get('/', requireLookupViewPermission, listLookupOptions);
router.post('/', requireLookupManagePermission, validateBody(LookupOptionCreateDto), createLookupOption);
router.put('/:id', requireLookupManagePermission, validateBody(LookupOptionUpdateDto), updateLookupOption);
router.delete('/:id', requireLookupManagePermission, deleteLookupOption);

export default router;

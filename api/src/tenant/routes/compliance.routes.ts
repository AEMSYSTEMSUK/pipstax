import { Router } from 'express';
import { authMiddleware } from '../../middleware/auth';
import { tenantMiddleware } from '../../middleware/tenant';
import { requirePermission } from '../../middleware/permissions';
import { requireTenantFeature } from '../../middleware/tenant-feature';
import { Permissions } from '../../constants/permissions';
import {
  listComplianceRecords,
  updateComplianceRecordReview,
} from '../controllers/compliance/compliance.controller';

const router = Router();

router.use(authMiddleware, tenantMiddleware);

router.get(
  '/records',
  requirePermission(Permissions.REPORTS_VIEW),
  requireTenantFeature('complianceReports', 'Compliance reports module is not enabled for this workspace.'),
  listComplianceRecords,
);

router.put(
  '/records/:id',
  requirePermission(Permissions.REPORTS_MANAGE),
  requireTenantFeature('complianceReports', 'Compliance reports module is not enabled for this workspace.'),
  updateComplianceRecordReview,
);

export default router;

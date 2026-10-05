import { Router } from 'express';
import {
  listTimesheets,
  listTimesheetLogs,
  getTimesheet,
  createTimesheet,
  updateTimesheet,
  deleteTimesheet,
  approveTimesheet,
  exportTimesheets
} from '../controllers/timesheets/timesheets.controller';
import { authMiddleware } from '../../middleware/auth';
import { tenantMiddleware } from '../../middleware/tenant';
import { requirePermission } from '../../middleware/permissions';
import { Permissions } from '../../constants/permissions';

const router = Router();

router.use(authMiddleware, tenantMiddleware);

router.get('/', requirePermission(Permissions.HR_VIEW), listTimesheets);
router.get('/logs', requirePermission(Permissions.HR_VIEW), listTimesheetLogs);
router.get('/export.csv', requirePermission(Permissions.HR_VIEW), exportTimesheets);
router.get('/:id', requirePermission(Permissions.HR_VIEW), getTimesheet);
router.post('/', requirePermission(Permissions.HR_MANAGE), createTimesheet);
router.post('/:id/approve', requirePermission(Permissions.HR_MANAGE), approveTimesheet);
router.put('/:id', requirePermission(Permissions.HR_MANAGE), updateTimesheet);
router.delete('/:id', requirePermission(Permissions.HR_MANAGE), deleteTimesheet);

export default router;

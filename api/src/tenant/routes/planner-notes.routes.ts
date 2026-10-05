import { Router } from 'express';
import { authMiddleware } from '../../middleware/auth';
import { tenantMiddleware } from '../../middleware/tenant';
import { requirePermission } from '../../middleware/permissions';
import { requireTenantFeature } from '../../middleware/tenant-feature';
import { Permissions } from '../../constants/permissions';
import { validateBody } from '../../middleware/validate';
import { PlannerNoteCreateDto, PlannerNoteUpdateDto } from '../dto/planner-note.dto';
import {
  createPlannerNote,
  deletePlannerNote,
  getPlannerSettings,
  listBankHolidays,
  listPlannerEntries,
  listPlannerNotes,
  listPlannerNoteUsers,
  updatePlannerSettings,
  updatePlannerNote,
} from '../controllers/planner-notes.controller';

const router = Router();

router.use(authMiddleware, tenantMiddleware);
router.use(requireTenantFeature('plannerNotes', 'Planner notes are not enabled for this workspace.'));

router.get('/', requirePermission(Permissions.SCHEDULING_VIEW), listPlannerNotes);
router.get('/entries', requirePermission(Permissions.SCHEDULING_VIEW), listPlannerEntries);
router.get('/users', requirePermission(Permissions.SCHEDULING_VIEW), listPlannerNoteUsers);
router.get('/settings', requirePermission(Permissions.SCHEDULING_VIEW), getPlannerSettings);
router.put('/settings', requirePermission(Permissions.SETTINGS_MANAGE), updatePlannerSettings);
router.get('/bank-holidays', requirePermission(Permissions.SCHEDULING_VIEW), listBankHolidays);
router.post('/', requirePermission(Permissions.SCHEDULING_MANAGE), validateBody(PlannerNoteCreateDto), createPlannerNote);
router.put('/:id', requirePermission(Permissions.SCHEDULING_MANAGE), validateBody(PlannerNoteUpdateDto), updatePlannerNote);
router.delete('/:id', requirePermission(Permissions.SCHEDULING_MANAGE), deletePlannerNote);

export default router;

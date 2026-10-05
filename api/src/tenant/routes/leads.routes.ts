import { Router } from 'express';
import {
  listLeads,
  getLead,
  createLead,
  updateLead,
  deleteLead,
  convertLeadToJob,
  createQuoteFromLead,
  listLeadQuotes,
  listLeadDocuments,
  uploadLeadAttachment,
  listLeadAssignableUsers,
} from '../controllers/leads/leads.controller';
import {
  createLeadTask,
  deleteLeadTask,
  listLeadTasks,
  updateLeadTask,
} from '../controllers/leads/lead-tasks.controller';
import { authMiddleware } from '../../middleware/auth';
import { tenantMiddleware } from '../../middleware/tenant';
import { requirePermission } from '../../middleware/permissions';
import { Permissions } from '../../constants/permissions';
import { listLeadActivities, createLeadActivity } from '../controllers/leads/lead-activities.controller';
import { validateBody } from '../../middleware/validate';
import { LeadActivityCreateDto } from '../dto/lead-activity.dto';
import { LeadAttachmentCreateDto, LeadConvertDto, LeadCreateDto, LeadUpdateDto } from '../dto/lead.dto';
import { LeadTaskCreateDto, LeadTaskUpdateDto } from '../dto/lead-task.dto';
import { streamUpload } from '../../middleware/stream-upload.middleware';

const router = Router();

router.use(authMiddleware, tenantMiddleware);

router.get('/', requirePermission(Permissions.CRM_VIEW), listLeads);
router.get('/assignable-users', requirePermission(Permissions.CRM_VIEW), listLeadAssignableUsers);
router.get('/:id', requirePermission(Permissions.CRM_VIEW), getLead);
router.get('/:id/activities', requirePermission(Permissions.CRM_VIEW), listLeadActivities);
router.get('/:id/tasks', requirePermission(Permissions.CRM_VIEW), listLeadTasks);
router.get('/:id/documents', requirePermission(Permissions.CRM_VIEW), listLeadDocuments);
router.get('/:id/quotes', requirePermission(Permissions.CRM_VIEW), listLeadQuotes);
router.post('/', requirePermission(Permissions.CRM_MANAGE), validateBody(LeadCreateDto), createLead);
router.post('/:id/activities', requirePermission(Permissions.CRM_MANAGE), validateBody(LeadActivityCreateDto), createLeadActivity);
router.post('/:id/tasks', requirePermission(Permissions.CRM_MANAGE), validateBody(LeadTaskCreateDto), createLeadTask);
router.post('/:id/create-quote', requirePermission(Permissions.QUOTES_MANAGE), createQuoteFromLead);
router.post('/:id/convert', requirePermission(Permissions.CRM_MANAGE), validateBody(LeadConvertDto), convertLeadToJob);
router.post(
  '/:id/attachments',
  requirePermission(Permissions.CRM_MANAGE),
  streamUpload.single('file'),
  validateBody(LeadAttachmentCreateDto),
  uploadLeadAttachment,
);
router.put('/:id', requirePermission(Permissions.CRM_MANAGE), validateBody(LeadUpdateDto), updateLead);
router.put(
  '/:id/tasks/:taskId',
  requirePermission(Permissions.CRM_MANAGE),
  validateBody(LeadTaskUpdateDto),
  updateLeadTask,
);
router.delete('/:id/tasks/:taskId', requirePermission(Permissions.CRM_MANAGE), deleteLeadTask);
router.delete('/:id', requirePermission(Permissions.CRM_MANAGE), deleteLead);

export default router;

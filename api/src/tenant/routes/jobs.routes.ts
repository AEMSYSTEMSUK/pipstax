import { Router } from 'express';
import {
  listJobs,
  listMyJobs,
  getJob,
  createJob,
  updateJob,
  updateJobStatus,
  assignJob,
  deleteJob,
  listJobAssignments,
  listAllJobAssignments,
  listJobActivities
} from '../controllers/jobs/jobs.controller';
import { authMiddleware } from '../../middleware/auth';
import { tenantMiddleware } from '../../middleware/tenant';
import { requirePermission } from '../../middleware/permissions';
import { requireTenantFeature } from '../../middleware/tenant-feature';
import { Permissions } from '../../constants/permissions';
import { validateBody } from '../../middleware/validate';
import { JobAssignDto, JobStatusUpdateDto } from '../dto/job.dto';
import {
  listJobUpdates,
  createJobUpdate,
  updateJobUpdate,
  deleteJobUpdate,
  listJobAttachments,
  createJobAttachment,
  updateJobAttachment,
  deleteJobAttachment,
} from '../controllers/jobs/job-updates.controller';
import { JobUpdateCreateDto } from '../dto/job-update.dto';
import {
  createJobExpense,
  createJobSplitInvoice,
  deleteSplitInvoice,
  deleteJobExpense,
  createJobTimeEntry,
  deleteJobTimeEntry,
  listJobExpenses,
  listJobInvoices,
  listJobQuotes,
  listJobSplitInvoices,
  listJobTimeEntries,
  updateJobExpense,
  updateJobTimeEntry,
  updateSplitInvoice,
} from '../controllers/jobs/job-financials.controller';

const router = Router();

router.use(authMiddleware, tenantMiddleware);

router.get('/', requirePermission(Permissions.SCHEDULING_VIEW), listJobs);
router.get('/assignments', requirePermission(Permissions.SCHEDULING_VIEW), listAllJobAssignments);
router.get('/assigned/me', requirePermission(Permissions.SCHEDULING_VIEW), listMyJobs);
router.get('/:id', requirePermission(Permissions.SCHEDULING_VIEW), getJob);
router.get('/:id/assignments', requirePermission(Permissions.SCHEDULING_VIEW), listJobAssignments);
router.get('/:id/activities', requirePermission(Permissions.SCHEDULING_VIEW), listJobActivities);
router.get('/:id/updates', requirePermission(Permissions.SCHEDULING_VIEW), listJobUpdates);
router.get('/:id/attachments', requirePermission(Permissions.SCHEDULING_VIEW), listJobAttachments);
router.get('/:id/quotes', requirePermission(Permissions.SCHEDULING_VIEW), listJobQuotes);
router.get('/:id/invoices', requirePermission(Permissions.SCHEDULING_VIEW), listJobInvoices);
router.get(
  '/:id/split-invoices',
  requirePermission(Permissions.SCHEDULING_VIEW),
  requireTenantFeature('splitInvoicing', 'Split invoicing is not enabled for this workspace.'),
  listJobSplitInvoices,
);
router.get('/:id/expenses', requirePermission(Permissions.SCHEDULING_VIEW), listJobExpenses);
router.get('/:id/time-entries', requirePermission(Permissions.SCHEDULING_VIEW), listJobTimeEntries);
router.post('/', requirePermission(Permissions.SCHEDULING_MANAGE), createJob);
router.post('/:id/assign', requirePermission(Permissions.SCHEDULING_MANAGE), validateBody(JobAssignDto), assignJob);
router.post('/:id/status', requirePermission(Permissions.SCHEDULING_MANAGE), validateBody(JobStatusUpdateDto), updateJobStatus);
router.post('/:id/updates', requirePermission(Permissions.SCHEDULING_MANAGE), validateBody(JobUpdateCreateDto), createJobUpdate);
router.put('/:id/updates/:updateId', requirePermission(Permissions.SCHEDULING_MANAGE), updateJobUpdate);
router.delete('/:id/updates/:updateId', requirePermission(Permissions.SCHEDULING_MANAGE), deleteJobUpdate);
router.post('/:id/attachments', requirePermission(Permissions.SCHEDULING_MANAGE), createJobAttachment);
router.put('/:id/attachments/:attachmentId', requirePermission(Permissions.SCHEDULING_MANAGE), updateJobAttachment);
router.delete('/:id/attachments/:attachmentId', requirePermission(Permissions.SCHEDULING_MANAGE), deleteJobAttachment);
router.post('/:id/expenses', requirePermission(Permissions.SCHEDULING_MANAGE), createJobExpense);
router.put('/:id/expenses/:expenseId', requirePermission(Permissions.SCHEDULING_MANAGE), updateJobExpense);
router.delete('/:id/expenses/:expenseId', requirePermission(Permissions.SCHEDULING_MANAGE), deleteJobExpense);
router.post('/:id/time-entries', requirePermission(Permissions.SCHEDULING_MANAGE), createJobTimeEntry);
router.put('/:id/time-entries/:timeEntryId', requirePermission(Permissions.SCHEDULING_MANAGE), updateJobTimeEntry);
router.delete('/:id/time-entries/:timeEntryId', requirePermission(Permissions.SCHEDULING_MANAGE), deleteJobTimeEntry);
router.post(
  '/:id/split-invoices',
  requirePermission(Permissions.SCHEDULING_MANAGE),
  requireTenantFeature('splitInvoicing', 'Split invoicing is not enabled for this workspace.'),
  createJobSplitInvoice,
);
router.put(
  '/split-invoices/:splitInvoiceId',
  requirePermission(Permissions.SCHEDULING_MANAGE),
  requireTenantFeature('splitInvoicing', 'Split invoicing is not enabled for this workspace.'),
  updateSplitInvoice,
);
router.delete(
  '/split-invoices/:splitInvoiceId',
  requirePermission(Permissions.SCHEDULING_MANAGE),
  requireTenantFeature('splitInvoicing', 'Split invoicing is not enabled for this workspace.'),
  deleteSplitInvoice,
);
router.put('/:id', requirePermission(Permissions.SCHEDULING_MANAGE), updateJob);
router.delete('/:id', requirePermission(Permissions.SCHEDULING_MANAGE), deleteJob);

export default router;

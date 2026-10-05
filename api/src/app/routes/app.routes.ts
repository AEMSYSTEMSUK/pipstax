import { Router } from 'express';
import { validateBody } from '../../middleware/validate';
import { authMiddleware } from '../../middleware/auth';
import { tenantMiddleware } from '../../middleware/tenant';
import { AppForgotPasswordDto, AppLoginDto, AppResetPasswordDto, AppSelectTenantDto } from '../dto/app-auth.dto';
import { appForgotPassword, appLogin, appResetPassword, appSelectTenant } from '../controllers/app-auth.controller';
import { requireAppRole, requireFieldWorkerRole } from '../middleware/app-auth';
import {
  listAssignedJobs,
  getAssignedJob,
  updateAssignedJobStatus,
  createJobUpdate,
  createAppLookupOption,
  deleteJobUpdate,
  listJobAttachments,
  listJobUpdates,
  listJobExpenses,
  listAppLookupOptions,
  createJobExpense,
  updateJobUpdate,
  listJobTimeEntries,
  createJobTimeEntry,
  getActiveTimer,
  startActiveTimer,
  stopActiveTimer,
} from '../controllers/app-jobs.controller';
import {
  AppJobExpenseDto,
  AppJobStatusDto,
  AppJobTimeEntryDto,
  AppJobUpdateDto,
} from '../dto/app-jobs.dto';
import { listLeadsReadonly, getLeadReadonly } from '../controllers/app-crm.controller';
import { listDocuments, uploadDocument } from '../controllers/app-documents.controller';
import { AppContractorDocumentUploadDto, AppDocumentUploadDto, AppTrainingAckDto } from '../dto/app-documents.dto';
import { acknowledgeTraining, getContractorPortal, uploadContractorDocument } from '../controllers/app-contractor.controller';
import { changeAppPassword, getAppProfile, updateAppProfile } from '../controllers/app-profile.controller';
import { AppChangePasswordDto, AppProfileUpdateDto } from '../dto/app-profile.dto';
import { getAppBoardColumnOrder, updateAppBoardColumnOrder } from '../controllers/app-preferences.controller';
import { listAppNotifications, markAppNotificationRead } from '../controllers/app-notifications.controller';
import {
  createAppComplianceReport,
  getAppJobComplianceContext,
  getAppSiteComplianceContext,
  listAppComplianceReports,
} from '../controllers/app-compliance.controller';
import { AppComplianceReportCreateDto } from '../dto/app-compliance.dto';
import { requireTenantFeature } from '../../middleware/tenant-feature';

const router = Router();

router.post('/auth/login', validateBody(AppLoginDto), appLogin);
router.post('/auth/select-tenant', validateBody(AppSelectTenantDto), appSelectTenant);
router.post('/auth/forgot-password', validateBody(AppForgotPasswordDto), appForgotPassword);
router.post('/auth/reset-password', validateBody(AppResetPasswordDto), appResetPassword);

router.use(authMiddleware, tenantMiddleware, requireAppRole);

router.get('/jobs', listAssignedJobs);
router.get('/lookups', listAppLookupOptions);
router.post('/lookups', createAppLookupOption);
router.get('/jobs/:id', getAssignedJob);
router.put('/jobs/:id/status', validateBody(AppJobStatusDto), updateAssignedJobStatus);
router.get('/jobs/:id/attachments', listJobAttachments);
router.get('/jobs/:id/updates', listJobUpdates);
router.post('/jobs/:id/updates', validateBody(AppJobUpdateDto), createJobUpdate);
router.put('/jobs/:id/updates/:updateId', updateJobUpdate);
router.delete('/jobs/:id/updates/:updateId', deleteJobUpdate);
router.get('/jobs/:id/expenses', listJobExpenses);
router.post('/jobs/:id/expenses', validateBody(AppJobExpenseDto), createJobExpense);
router.get('/jobs/:id/time-entries', listJobTimeEntries);
router.post('/jobs/:id/time-entries', validateBody(AppJobTimeEntryDto), createJobTimeEntry);
router.get(
  '/jobs/:id/compliance-context',
  requireTenantFeature('complianceReports', 'Compliance reports are not enabled for this workspace.'),
  getAppJobComplianceContext,
);

router.get('/active-timer', getActiveTimer);
router.post('/jobs/:id/time-entries/start', startActiveTimer);
router.post('/jobs/:id/time-entries/stop', stopActiveTimer);

router.get('/crm/leads', requireFieldWorkerRole, listLeadsReadonly);
router.get('/crm/leads/:id', requireFieldWorkerRole, getLeadReadonly);

router.post('/documents/upload', validateBody(AppDocumentUploadDto), uploadDocument);
router.get('/documents', listDocuments);
router.get(
  '/compliance-reports',
  requireTenantFeature('complianceReports', 'Compliance reports are not enabled for this workspace.'),
  listAppComplianceReports,
);
router.post(
  '/compliance-reports',
  requireTenantFeature('complianceReports', 'Compliance reports are not enabled for this workspace.'),
  validateBody(AppComplianceReportCreateDto),
  createAppComplianceReport,
);
router.get(
  '/sites/:id/compliance-context',
  requireTenantFeature('complianceReports', 'Compliance reports are not enabled for this workspace.'),
  getAppSiteComplianceContext,
);

router.get('/contractor/portal', getContractorPortal);
router.post('/contractor/documents', validateBody(AppContractorDocumentUploadDto), uploadContractorDocument);
router.post('/contractor/training', validateBody(AppTrainingAckDto), acknowledgeTraining);
router.get('/profile', getAppProfile);
router.put('/profile', validateBody(AppProfileUpdateDto), updateAppProfile);
router.post('/profile/change-password', validateBody(AppChangePasswordDto), changeAppPassword);
router.get('/preferences/board-columns', getAppBoardColumnOrder);
router.put('/preferences/board-columns', updateAppBoardColumnOrder);
router.get('/notifications', listAppNotifications);
router.post('/notifications/:id/read', markAppNotificationRead);

export default router;

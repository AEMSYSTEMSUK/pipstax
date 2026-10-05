import { Router } from 'express';
import {
  listIntegrations,
  listIntegrationFolders,
  createIntegrationFolder,
  getStorageStats,
  connectIntegration,
  disconnectIntegration,
  listIntegrationFiles,
  startIntegrationOAuth,
  startAccountingIntegrationOAuth,
  handleIntegrationOAuthCallback,
  reconcileIntegrationFiles,
  forceSyncIntegrationNow,
  listIntegrationAlerts,
} from '../controllers/integrations/integrations.controller';
import { authMiddleware } from '../../middleware/auth';
import { tenantMiddleware } from '../../middleware/tenant';
import { requirePermission } from '../../middleware/permissions';
import { Permissions } from '../../constants/permissions';
import { validateBody } from '../../middleware/validate';
import { ConnectIntegrationDto, CreateIntegrationFolderDto } from '../dto/integration.dto';

const router = Router();

router.get('/oauth/callback', handleIntegrationOAuthCallback);

router.use(authMiddleware, tenantMiddleware);

router.get('/alerts', listIntegrationAlerts);
router.get('/', requirePermission(Permissions.DOCUMENTS_VIEW), listIntegrations);
router.post(
  '/accounting/connect',
  requirePermission(Permissions.SETTINGS_MANAGE),
  validateBody(ConnectIntegrationDto),
  connectIntegration,
);
router.post(
  '/accounting/:provider/disconnect',
  requirePermission(Permissions.SETTINGS_MANAGE),
  disconnectIntegration,
);
router.get(
  '/accounting/:provider/oauth/start',
  requirePermission(Permissions.SETTINGS_MANAGE),
  startAccountingIntegrationOAuth,
);
router.get('/:provider/storage-stats', requirePermission(Permissions.DOCUMENTS_VIEW), getStorageStats);
router.get('/:provider/folders', requirePermission(Permissions.DOCUMENTS_VIEW), listIntegrationFolders);
router.get('/:provider/oauth/start', requirePermission(Permissions.DOCUMENTS_MANAGE), startIntegrationOAuth);
router.post('/connect', requirePermission(Permissions.DOCUMENTS_MANAGE), validateBody(ConnectIntegrationDto), connectIntegration);
router.post('/:provider/folders', requirePermission(Permissions.DOCUMENTS_MANAGE), validateBody(CreateIntegrationFolderDto), createIntegrationFolder);
router.post('/:provider/disconnect', requirePermission(Permissions.DOCUMENTS_MANAGE), disconnectIntegration);
router.get('/:provider/files', requirePermission(Permissions.DOCUMENTS_VIEW), listIntegrationFiles);
router.post('/:provider/reconcile', requirePermission(Permissions.DOCUMENTS_MANAGE), reconcileIntegrationFiles);
router.post('/:provider/sync-now', requirePermission(Permissions.DOCUMENTS_MANAGE), forceSyncIntegrationNow);

export default router;

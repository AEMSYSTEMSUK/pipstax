import { Router } from 'express';
import { getDashboardReport, downloadSummaryPdf, exportSummaryCsv, getInsightsReport, getWipReport } from '../controllers/reports/reports.controller';
import {
  createQuoteFromRenewal,
  listRenewalOpportunities,
  syncRenewalRegister,
  updateRenewalOpportunity,
} from '../controllers/reports/renewals.controller';
import { authMiddleware } from '../../middleware/auth';
import { tenantMiddleware } from '../../middleware/tenant';
import { requirePermission } from '../../middleware/permissions';
import { Permissions } from '../../constants/permissions';
import { requireTenantFeature } from '../../middleware/tenant-feature';

const router = Router();

router.use(authMiddleware, tenantMiddleware);

router.get('/dashboard', requirePermission(Permissions.REPORTS_VIEW), getDashboardReport);
router.get('/wip', requirePermission(Permissions.REPORTS_VIEW), getWipReport);
router.get('/summary.pdf', requirePermission(Permissions.REPORTS_VIEW), downloadSummaryPdf);
router.get('/summary.csv', requirePermission(Permissions.REPORTS_VIEW), exportSummaryCsv);
router.get('/insights', requirePermission(Permissions.REPORTS_VIEW), getInsightsReport);
router.get(
  '/renewals',
  requirePermission(Permissions.REPORTS_VIEW),
  requireTenantFeature('renewals', 'Renewals module is not enabled for this workspace.'),
  listRenewalOpportunities,
);
router.post(
  '/renewals/sync',
  requirePermission(Permissions.REPORTS_MANAGE),
  requireTenantFeature('renewals', 'Renewals module is not enabled for this workspace.'),
  syncRenewalRegister,
);
router.put(
  '/renewals/:id',
  requirePermission(Permissions.REPORTS_MANAGE),
  requireTenantFeature('renewals', 'Renewals module is not enabled for this workspace.'),
  updateRenewalOpportunity,
);
router.post(
  '/renewals/:id/create-quote',
  requirePermission(Permissions.QUOTES_MANAGE),
  requireTenantFeature('renewals', 'Renewals module is not enabled for this workspace.'),
  createQuoteFromRenewal,
);

export default router;

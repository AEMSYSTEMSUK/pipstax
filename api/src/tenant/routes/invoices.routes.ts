import { Router } from 'express';
import {
  listInvoices,
  listSplitInvoiceRegister,
  getInvoice,
  createInvoice,
  updateInvoice,
  deleteInvoice,
  sendInvoice,
  markInvoicePaid,
  recordInvoicePayment,
  updateInvoicePayment,
  deleteInvoicePayment,
  createInvoiceFromJob,
  createInvoiceFromSplit,
  syncAccountingStatuses,
  downloadInvoicePdf,
  exportInvoicesCsv
} from '../controllers/invoices/invoices.controller';
import { authMiddleware } from '../../middleware/auth';
import { tenantMiddleware } from '../../middleware/tenant';
import { requirePermission } from '../../middleware/permissions';
import { Permissions } from '../../constants/permissions';
import { requireTenantFeature } from '../../middleware/tenant-feature';

const router = Router();

router.use(authMiddleware, tenantMiddleware);

router.get('/', requirePermission(Permissions.FINANCIALS_VIEW), listInvoices);
router.get(
  '/split-register',
  requirePermission(Permissions.FINANCIALS_VIEW),
  requireTenantFeature('splitInvoicing', 'Split invoicing is not enabled for this workspace.'),
  listSplitInvoiceRegister,
);
router.get('/export.csv', requirePermission(Permissions.FINANCIALS_VIEW), exportInvoicesCsv);
router.get('/:id', requirePermission(Permissions.FINANCIALS_VIEW), getInvoice);
router.get('/:id/pdf', requirePermission(Permissions.FINANCIALS_VIEW), downloadInvoicePdf);
router.post('/from-job/:jobId', requirePermission(Permissions.FINANCIALS_MANAGE), createInvoiceFromJob);
router.post(
  '/from-split/:splitInvoiceId',
  requirePermission(Permissions.FINANCIALS_MANAGE),
  requireTenantFeature('splitInvoicing', 'Split invoicing is not enabled for this workspace.'),
  createInvoiceFromSplit,
);
router.post('/', requirePermission(Permissions.FINANCIALS_MANAGE), createInvoice);
router.post('/:id/send', requirePermission(Permissions.FINANCIALS_MANAGE), sendInvoice);
router.post('/:id/mark-paid', requirePermission(Permissions.FINANCIALS_MANAGE), markInvoicePaid);
router.post('/:id/payments', requirePermission(Permissions.FINANCIALS_MANAGE), recordInvoicePayment);
router.put('/:id/payments/:paymentId', requirePermission(Permissions.FINANCIALS_MANAGE), updateInvoicePayment);
router.delete('/:id/payments/:paymentId', requirePermission(Permissions.FINANCIALS_MANAGE), deleteInvoicePayment);
router.post('/sync-accounting', requirePermission(Permissions.FINANCIALS_MANAGE), syncAccountingStatuses);
router.put('/:id', requirePermission(Permissions.FINANCIALS_MANAGE), updateInvoice);
router.delete('/:id', requirePermission(Permissions.FINANCIALS_MANAGE), deleteInvoice);

export default router;

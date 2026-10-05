import { Router } from 'express';
import {
  listQuotes,
  getQuote,
  createQuote,
  updateQuote,
  deleteQuote,
  sendQuote,
  downloadQuotePdf,
  convertQuoteToInvoice
} from '../controllers/quotes/quotes.controller';
import { authMiddleware } from '../../middleware/auth';
import { tenantMiddleware } from '../../middleware/tenant';
import { requirePermission } from '../../middleware/permissions';
import { Permissions } from '../../constants/permissions';

const router = Router();

router.use(authMiddleware, tenantMiddleware);

router.get('/', requirePermission(Permissions.QUOTES_VIEW), listQuotes);
router.get('/:id', requirePermission(Permissions.QUOTES_VIEW), getQuote);
router.get('/:id/pdf', requirePermission(Permissions.QUOTES_VIEW), downloadQuotePdf);
router.post('/', requirePermission(Permissions.QUOTES_MANAGE), createQuote);
router.post('/:id/send', requirePermission(Permissions.QUOTES_MANAGE), sendQuote);
router.post('/:id/convert-invoice', requirePermission(Permissions.QUOTES_MANAGE), convertQuoteToInvoice);
router.put('/:id', requirePermission(Permissions.QUOTES_MANAGE), updateQuote);
router.delete('/:id', requirePermission(Permissions.QUOTES_MANAGE), deleteQuote);

export default router;

import { Router } from 'express';
import {
  getPortalOverview,
  listPortalQuotes,
  listPortalInvoices,
  getPortalInvoice,
  listPortalSites,
  getPortalSite,
  listPortalJobs,
  getPortalJob,
  listPortalComplianceRecords,
  listPortalTickets,
  createPortalTicket,
  replyPortalTicket,
  resolvePortalTicket,
  downloadPortalInvoicePdf,
  listPortalNotifications,
  markPortalNotificationRead,
  changePortalPassword
} from '../controllers/public/portal.controller';
import { validateBody } from '../../middleware/validate';
import { customerPortalAuthMiddleware } from '../../middleware/customer-portal-auth';
import { PortalTicketCreateDto, PortalTicketReplyDto } from '../dto/portal-ticket.dto';
import { PortalChangePasswordDto } from '../dto/portal-profile.dto';
import { tenantMiddleware } from '../../middleware/tenant';

const router = Router();

router.use('/:token', customerPortalAuthMiddleware, tenantMiddleware);

router.get('/:token/profile', getPortalOverview);
router.get('/:token/quotes', listPortalQuotes);
router.get('/:token/invoices', listPortalInvoices);
router.get('/:token/invoices/:id', getPortalInvoice);
router.get('/:token/invoices/:id/pdf', downloadPortalInvoicePdf);
router.get('/:token/sites', listPortalSites);
router.get('/:token/sites/:id', getPortalSite);
router.get('/:token/jobs', listPortalJobs);
router.get('/:token/jobs/:id', getPortalJob);
router.get('/:token/compliance-records', listPortalComplianceRecords);
router.get('/:token/tickets', listPortalTickets);
router.get('/:token/notifications', listPortalNotifications);
router.post('/:token/tickets', validateBody(PortalTicketCreateDto), createPortalTicket);
router.post('/:token/tickets/:id/reply', validateBody(PortalTicketReplyDto), replyPortalTicket);
router.post('/:token/tickets/:id/resolve', resolvePortalTicket);
router.post('/:token/notifications/:id/read', markPortalNotificationRead);
router.post('/:token/change-password', validateBody(PortalChangePasswordDto), changePortalPassword);

export default router;

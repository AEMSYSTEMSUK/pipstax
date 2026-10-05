import { Router } from 'express';
import {
  listTickets,
  getTicket,
  createTicket,
  updateTicket,
  deleteTicket,
  addTicketReply
} from '../controllers/tickets/tickets.controller';
import { authMiddleware } from '../../middleware/auth';
import { tenantMiddleware } from '../../middleware/tenant';
import { requirePermission } from '../../middleware/permissions';
import { Permissions } from '../../constants/permissions';
import { validateBody } from '../../middleware/validate';
import { TicketCreateDto, TicketMessageDto } from '../dto/ticket.dto';

const router = Router();

router.use(authMiddleware, tenantMiddleware);

router.get('/', requirePermission(Permissions.SUPPORT_VIEW), listTickets);
router.get('/:id', requirePermission(Permissions.SUPPORT_VIEW), getTicket);
router.post('/', requirePermission(Permissions.SUPPORT_MANAGE), validateBody(TicketCreateDto), createTicket);
router.post('/:id/reply', requirePermission(Permissions.SUPPORT_MANAGE), validateBody(TicketMessageDto), addTicketReply);
router.put('/:id', requirePermission(Permissions.SUPPORT_MANAGE), updateTicket);
router.delete('/:id', requirePermission(Permissions.SUPPORT_MANAGE), deleteTicket);

export default router;

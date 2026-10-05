import { Request, Response, NextFunction } from 'express';
import { AppDataSource } from '../../../config/data-source';
import { Ticket } from '../../../entities/ticket.entity';
import { getTenantId } from '../../../utils/request';
import { NotFoundError } from '../../../utils/errors';
import { TicketSenderType } from '../../../constants/tickets';
import { addTicketMessage, listTicketMessages } from '../../../services/tickets.service';
import { Customer } from '../../../entities/customer.entity';
import { sendTicketReplyEmail } from '../../../services/notifications.service';
import { createInAppNotification } from '../../../services/in-app-notifications.service';
import { ensureTicketNumber } from '../../../services/document-number.service';

export const listTickets = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = getTenantId(req);
    const repo = AppDataSource.getRepository(Ticket);
    const tickets = await repo.find({ where: { tenantId, isDeleted: false } });
    await Promise.all(tickets.map((ticket) => ensureTicketNumber(ticket)));
    res.deliver(200, true, tickets, 'Tickets fetched');
  } catch (error) {
    next(error);
  }
};

export const getTicket = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = getTenantId(req);
    const repo = AppDataSource.getRepository(Ticket);
    const ticket = await repo.findOne({ where: { id: req.params.id, tenantId, isDeleted: false } });
    if (!ticket) {
      throw new NotFoundError('Ticket not found');
    }
    await ensureTicketNumber(ticket);
    const messages = await listTicketMessages(ticket.id, tenantId);
    res.deliver(200, true, { ticket, messages }, 'Ticket fetched');
  } catch (error) {
    next(error);
  }
};

export const createTicket = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = getTenantId(req);
    const repo = AppDataSource.getRepository(Ticket);
    const ticket = repo.create({ ...req.body, tenantId }) as unknown as Ticket;
    await repo.save(ticket);
    await ensureTicketNumber(ticket);
    await addTicketMessage(ticket.id, tenantId, TicketSenderType.ADMIN, req.body.message);
    res.deliver(201, true, ticket, 'Ticket created');
  } catch (error) {
    next(error);
  }
};

export const addTicketReply = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = getTenantId(req);
    const ticketRepo = AppDataSource.getRepository(Ticket);
    const customerRepo = AppDataSource.getRepository(Customer);
    const ticket = await ticketRepo.findOne({ where: { id: req.params.id, tenantId, isDeleted: false } });
    if (!ticket) {
      throw new NotFoundError('Ticket not found');
    }
    await ensureTicketNumber(ticket);
    const message = await addTicketMessage(ticket.id, tenantId, TicketSenderType.ADMIN, req.body.message);
    const customer = await customerRepo.findOne({ where: { id: ticket.customerId, tenantId, isDeleted: false } });
    if (customer?.email) {
      await sendTicketReplyEmail(customer.email, `${ticket.ticketNumber ?? 'Ticket'}: ${ticket.subject}`, req.body.message, { tenantId });
      await createInAppNotification({
        tenantId,
        customerId: customer.id,
        title: `Support ticket updated ${ticket.ticketNumber ?? ''}`.trim(),
        message: `${ticket.ticketNumber ?? 'Ticket'}: ${ticket.subject}`,
        targetUrl: `/portal/tickets/${ticket.id}`,
      });
    }
    res.deliver(201, true, message, 'Reply sent');
  } catch (error) {
    next(error);
  }
};

export const updateTicket = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = getTenantId(req);
    const repo = AppDataSource.getRepository(Ticket);
    const ticket = await repo.findOne({ where: { id: req.params.id, tenantId, isDeleted: false } });
    if (!ticket) {
      throw new NotFoundError('Ticket not found');
    }
    Object.assign(ticket, req.body);
    await repo.save(ticket);
    res.deliver(200, true, ticket, 'Ticket updated');
  } catch (error) {
    next(error);
  }
};

export const deleteTicket = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = getTenantId(req);
    const repo = AppDataSource.getRepository(Ticket);
    const ticket = await repo.findOne({ where: { id: req.params.id, tenantId, isDeleted: false } });
    if (!ticket) {
      throw new NotFoundError('Ticket not found');
    }
    ticket.isDeleted = true;
    await repo.save(ticket);
    res.deliver(200, true, ticket, 'Ticket removed');
  } catch (error) {
    next(error);
  }
};

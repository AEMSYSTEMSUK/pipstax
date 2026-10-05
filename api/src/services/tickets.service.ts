import { AppDataSource } from '../config/data-source';
import { TicketMessage } from '../entities/ticket-message.entity';
import { TicketSenderType } from '../constants/tickets';

export const addTicketMessage = async (
  ticketId: string,
  tenantId: string,
  senderType: TicketSenderType,
  message: string
) => {
  const repo = AppDataSource.getRepository(TicketMessage);
  const msg = repo.create({ ticketId, tenantId, senderType, message });
  await repo.save(msg);
  return msg;
};

export const listTicketMessages = async (ticketId: string, tenantId: string) => {
  const repo = AppDataSource.getRepository(TicketMessage);
  return repo.find({ where: { ticketId, tenantId, isDeleted: false }, order: { createdAt: 'ASC' } });
};

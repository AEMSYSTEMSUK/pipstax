import { Column, Entity, ManyToOne } from 'typeorm';
import { BaseEntity } from './base.entity';
import { Ticket } from './ticket.entity';
import { TicketSenderType } from '../constants/tickets';
import { Tenant } from './tenant.entity';

@Entity('ticket_messages')
export class TicketMessage extends BaseEntity {
  @ManyToOne(() => Ticket)
  ticket!: Ticket;

  @Column()
  ticketId!: string;

  @Column({ type: 'enum', enum: TicketSenderType })
  senderType!: TicketSenderType;

  @Column({ type: 'text' })
  message!: string;

  @ManyToOne(() => Tenant)
  tenant!: Tenant;

  @Column()
  tenantId!: string;
}

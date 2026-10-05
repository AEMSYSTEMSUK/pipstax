import { Column, Entity, ManyToOne } from 'typeorm';
import { BaseEntity } from './base.entity';
import { Tenant } from './tenant.entity';
import { Customer } from './customer.entity';
import { TicketStatus } from '../constants/status';

@Entity('tickets')
export class Ticket extends BaseEntity {
  @Column({ length: 40, nullable: true })
  ticketNumber?: string;

  @Column({ length: 180 })
  subject!: string;

  @Column({ type: 'text' })
  message!: string;

  @Column({ type: 'enum', enum: TicketStatus, default: TicketStatus.OPEN })
  status!: TicketStatus;

  @ManyToOne(() => Customer)
  customer!: Customer;

  @Column()
  customerId!: string;

  @ManyToOne(() => Tenant)
  tenant!: Tenant;

  @Column()
  tenantId!: string;
}

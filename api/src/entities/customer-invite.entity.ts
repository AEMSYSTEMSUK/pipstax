import { Column, Entity, ManyToOne } from 'typeorm';
import { BaseEntity } from './base.entity';
import { Tenant } from './tenant.entity';
import { Customer } from './customer.entity';
import { Account } from './account.entity';

@Entity('customer_invites')
export class CustomerInvite extends BaseEntity {
  @Column({ length: 160 })
  email!: string;

  @Column({ length: 120, nullable: true })
  fullName?: string;

  @Column({ length: 120 })
  token!: string;

  @Column({ type: 'timestamptz' })
  expiresAt!: Date;

  @Column({ type: 'timestamptz', nullable: true })
  acceptedAt?: Date;

  @ManyToOne(() => Tenant)
  tenant!: Tenant;

  @Column()
  tenantId!: string;

  @ManyToOne(() => Customer, { nullable: true })
  customer?: Customer;

  @Column({ nullable: true })
  customerId?: string;

  @ManyToOne(() => Account)
  account?: Account;

  @Column({ nullable: true })
  accountId?: string;
}

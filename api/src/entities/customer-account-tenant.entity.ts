import { Column, Entity, ManyToOne, Index } from 'typeorm';
import { BaseEntity } from './base.entity';
import { Account } from './account.entity';
import { Tenant } from './tenant.entity';
import { Customer } from './customer.entity';

@Entity('customer_account_tenants')
@Index(['accountId', 'tenantId'], { unique: true })
export class CustomerAccountTenant extends BaseEntity {
  @ManyToOne(() => Account)
  account!: Account;

  @Column()
  accountId!: string;

  @ManyToOne(() => Tenant)
  tenant!: Tenant;

  @Column()
  tenantId!: string;

  @ManyToOne(() => Customer)
  customer!: Customer;

  @Column()
  customerId!: string;
}

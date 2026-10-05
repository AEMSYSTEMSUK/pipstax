import { Column, Entity, Index, ManyToOne } from 'typeorm';
import { BaseEntity } from './base.entity';
import { Account } from './account.entity';
import { Tenant } from './tenant.entity';
import { User } from './user.entity';

@Entity('account_tenants')
@Index(['accountId', 'tenantId'], { unique: true })
export class AccountTenant extends BaseEntity {
  @ManyToOne(() => Account, (account) => account.memberships)
  account!: Account;

  @Column()
  accountId!: string;

  @ManyToOne(() => Tenant)
  tenant!: Tenant;

  @Column()
  tenantId!: string;

  @ManyToOne(() => User)
  user!: User;

  @Column()
  userId!: string;
}

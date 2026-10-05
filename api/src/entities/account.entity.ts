import { Column, Entity, OneToMany, Index } from 'typeorm';
import { BaseEntity } from './base.entity';
import { AccountTenant } from './account-tenant.entity';

@Entity('accounts')
export class Account extends BaseEntity {
  @Column({ length: 160, unique: true })
  email!: string;

  @Column({ length: 200 })
  passwordHash!: string;

  @Column({ default: true })
  isActive!: boolean;

  @Column({ type: 'timestamptz', nullable: true })
  emailVerifiedAt?: Date;

  @OneToMany(() => AccountTenant, (accountTenant) => accountTenant.account)
  memberships!: AccountTenant[];
}

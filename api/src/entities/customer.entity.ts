import { Column, Entity, ManyToOne } from 'typeorm';
import { BaseEntity } from './base.entity';
import { Tenant } from './tenant.entity';

@Entity('customers')
export class Customer extends BaseEntity {
  @Column({ length: 120 })
  name!: string;

  @Column({ length: 160 })
  email!: string;

  @Column({ nullable: true })
  phone?: string;

  @Column({ nullable: true })
  address?: string;

  @Column({ nullable: true, unique: true })
  portalToken?: string;

  @Column({ type: 'json', nullable: true })
  portalAllowedSiteIds?: string[];

  @ManyToOne(() => Tenant)
  tenant!: Tenant;

  @Column()
  tenantId!: string;
}

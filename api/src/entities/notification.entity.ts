import { Column, Entity, ManyToOne } from 'typeorm';
import { BaseEntity } from './base.entity';
import { Tenant } from './tenant.entity';

@Entity('notifications')
export class Notification extends BaseEntity {
  @Column({ length: 160 })
  title!: string;

  @Column({ type: 'text' })
  message!: string;

  @Column({ nullable: true })
  targetUrl?: string;

  @Column({ nullable: true })
  userId?: string;

  @Column({ nullable: true })
  customerId?: string;

  @Column({ type: 'timestamptz', nullable: true })
  readAt?: Date;

  @ManyToOne(() => Tenant)
  tenant!: Tenant;

  @Column()
  tenantId!: string;
}

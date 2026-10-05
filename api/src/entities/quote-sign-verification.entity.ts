import { Column, Entity, Index, ManyToOne } from 'typeorm';
import { BaseEntity } from './base.entity';
import { Quote } from './quote.entity';
import { Tenant } from './tenant.entity';

@Entity('quote_sign_verifications')
@Index(['quoteId', 'email', 'verifiedAt'])
export class QuoteSignVerification extends BaseEntity {
  @ManyToOne(() => Quote)
  quote!: Quote;

  @Column()
  quoteId!: string;

  @ManyToOne(() => Tenant)
  tenant!: Tenant;

  @Column()
  tenantId!: string;

  @Column({ length: 160 })
  email!: string;

  @Column({ length: 140 })
  fullName!: string;

  @Column({ type: 'text' })
  signatureData!: string;

  @Column({ type: 'text' })
  codeHash!: string;

  @Column({ type: 'int', default: 0 })
  attempts!: number;

  @Column({ type: 'int', default: 1 })
  sendCount!: number;

  @Column({ type: 'timestamptz' })
  expiresAt!: Date;

  @Column({ type: 'timestamptz', nullable: true })
  verifiedAt?: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  lastSentAt?: Date | null;

  @Column({ nullable: true })
  requestIp?: string;
}

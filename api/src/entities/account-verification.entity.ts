import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from './base.entity';

@Entity('account_verifications')
@Index(['email'])
export class AccountVerification extends BaseEntity {
  @Column({ length: 160 })
  email!: string;

  @Column()
  accountId!: string;

  @Column({ length: 200 })
  codeHash!: string;

  @Column({ type: 'timestamptz', nullable: true })
  expiresAt?: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  verifiedAt?: Date;

  @Column({ type: 'int', default: 0 })
  attempts!: number;
}

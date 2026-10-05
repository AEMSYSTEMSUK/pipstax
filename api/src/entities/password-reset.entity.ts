import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from './base.entity';

@Entity('password_resets')
@Index(['email'])
export class PasswordReset extends BaseEntity {
  @Column({ length: 160 })
  email!: string;

  @Column()
  accountId!: string;

  @Column({ length: 200 })
  tokenHash!: string;

  @Column({ type: 'timestamptz' })
  expiresAt!: Date;

  @Column({ type: 'timestamptz', nullable: true })
  usedAt?: Date;
}

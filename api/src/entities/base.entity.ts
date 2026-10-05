import {
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Column,
  BeforeInsert,
  BeforeUpdate
} from 'typeorm';
import { getAuditActor } from '../services/audit-context.service';

export abstract class BaseEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ default: false })
  isDeleted!: boolean;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;

  @Column({ type: 'timestamptz', nullable: true })
  deletedAt?: Date;

  @Column({ nullable: true })
  createdByActorType?: string;

  @Column({ nullable: true })
  createdByActorId?: string;

  @Column({ nullable: true })
  updatedByActorType?: string;

  @Column({ nullable: true })
  updatedByActorId?: string;

  @Column({ nullable: true })
  deletedByActorType?: string;

  @Column({ nullable: true })
  deletedByActorId?: string;

  @BeforeInsert()
  protected setCreateAuditFields() {
    const actor = getAuditActor();
    if (actor?.actorId) {
      this.createdByActorType = this.createdByActorType ?? actor.actorType;
      this.createdByActorId = this.createdByActorId ?? actor.actorId;
      this.updatedByActorType = this.updatedByActorType ?? actor.actorType;
      this.updatedByActorId = this.updatedByActorId ?? actor.actorId;
    }
  }

  @BeforeUpdate()
  protected setUpdateAuditFields() {
    const actor = getAuditActor();
    if (actor?.actorId) {
      this.updatedByActorType = actor.actorType;
      this.updatedByActorId = actor.actorId;
    }
    if (this.isDeleted && !this.deletedAt) {
      this.deletedAt = new Date();
      if (actor?.actorId) {
        this.deletedByActorType = actor.actorType;
        this.deletedByActorId = actor.actorId;
      }
    }
  }
}

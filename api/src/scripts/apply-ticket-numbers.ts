export {};

process.env.DB_SYNC = 'false';

const run = async () => {
  const { IsNull } = await import('typeorm');
  const { AppDataSource } = await import('../config/data-source');
  const { Ticket } = await import('../entities/ticket.entity');
  const { ensureTicketNumber } = await import('../services/document-number.service');

  await AppDataSource.initialize();

  try {
    await AppDataSource.query(
      'ALTER TABLE "tenant_document_sequences" ADD COLUMN IF NOT EXISTS "jobCounter" integer NOT NULL DEFAULT 0',
    );
    await AppDataSource.query(
      'ALTER TABLE "tenant_document_sequences" ADD COLUMN IF NOT EXISTS "ticketCounter" integer NOT NULL DEFAULT 0',
    );
    await AppDataSource.query('ALTER TABLE "tickets" ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMPTZ NULL');
    await AppDataSource.query('ALTER TABLE "tickets" ADD COLUMN IF NOT EXISTS "createdByActorType" VARCHAR NULL');
    await AppDataSource.query('ALTER TABLE "tickets" ADD COLUMN IF NOT EXISTS "createdByActorId" VARCHAR NULL');
    await AppDataSource.query('ALTER TABLE "tickets" ADD COLUMN IF NOT EXISTS "updatedByActorType" VARCHAR NULL');
    await AppDataSource.query('ALTER TABLE "tickets" ADD COLUMN IF NOT EXISTS "updatedByActorId" VARCHAR NULL');
    await AppDataSource.query('ALTER TABLE "tickets" ADD COLUMN IF NOT EXISTS "deletedByActorType" VARCHAR NULL');
    await AppDataSource.query('ALTER TABLE "tickets" ADD COLUMN IF NOT EXISTS "deletedByActorId" VARCHAR NULL');
    await AppDataSource.query('ALTER TABLE "tenant_document_sequences" ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMPTZ NULL');
    await AppDataSource.query('ALTER TABLE "tenant_document_sequences" ADD COLUMN IF NOT EXISTS "createdByActorType" VARCHAR NULL');
    await AppDataSource.query('ALTER TABLE "tenant_document_sequences" ADD COLUMN IF NOT EXISTS "createdByActorId" VARCHAR NULL');
    await AppDataSource.query('ALTER TABLE "tenant_document_sequences" ADD COLUMN IF NOT EXISTS "updatedByActorType" VARCHAR NULL');
    await AppDataSource.query('ALTER TABLE "tenant_document_sequences" ADD COLUMN IF NOT EXISTS "updatedByActorId" VARCHAR NULL');
    await AppDataSource.query('ALTER TABLE "tenant_document_sequences" ADD COLUMN IF NOT EXISTS "deletedByActorType" VARCHAR NULL');
    await AppDataSource.query('ALTER TABLE "tenant_document_sequences" ADD COLUMN IF NOT EXISTS "deletedByActorId" VARCHAR NULL');
    await AppDataSource.query(
      'ALTER TABLE "tickets" ADD COLUMN IF NOT EXISTS "ticketNumber" varchar(40) NULL',
    );
    await AppDataSource.query(
      'CREATE UNIQUE INDEX IF NOT EXISTS "IDX_tickets_tenant_ticket_number" ON "tickets" ("tenantId", "ticketNumber") WHERE "ticketNumber" IS NOT NULL',
    );

    const ticketRepo = AppDataSource.getRepository(Ticket);
    const tickets = await ticketRepo.find({
      where: { isDeleted: false, ticketNumber: IsNull() },
      order: { createdAt: 'ASC' },
    });

    let updated = 0;
    for (const ticket of tickets) {
      await ensureTicketNumber(ticket);
      updated += 1;
    }

    console.log(`[ticket-number-backfill] tickets updated: ${updated}`);
  } finally {
    await AppDataSource.destroy();
  }
};

run().catch((error) => {
  console.error('[ticket-number-backfill] failed', error);
  process.exit(1);
});

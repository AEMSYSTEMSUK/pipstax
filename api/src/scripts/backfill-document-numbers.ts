import { AppDataSource } from '../config/data-source';
import { Invoice } from '../entities/invoice.entity';
import { Job } from '../entities/job.entity';
import { Quote } from '../entities/quote.entity';
import { Ticket } from '../entities/ticket.entity';
import { ensureInvoiceNumber, ensureJobNumber, ensureQuoteNumber, ensureTicketNumber } from '../services/document-number.service';
import { IsNull } from 'typeorm';

const run = async () => {
  await AppDataSource.initialize();
  try {
    await AppDataSource.query('ALTER TABLE "tenant_document_sequences" ADD COLUMN IF NOT EXISTS "jobCounter" integer NOT NULL DEFAULT 0');
    await AppDataSource.query('ALTER TABLE "tenant_document_sequences" ADD COLUMN IF NOT EXISTS "ticketCounter" integer NOT NULL DEFAULT 0');
    await AppDataSource.query('ALTER TABLE "jobs" ADD COLUMN IF NOT EXISTS "jobNumber" varchar(40) NULL');
    await AppDataSource.query('ALTER TABLE "tickets" ADD COLUMN IF NOT EXISTS "ticketNumber" varchar(40) NULL');
    await AppDataSource.query(
      'CREATE UNIQUE INDEX IF NOT EXISTS "IDX_jobs_tenant_job_number" ON "jobs" ("tenantId", "jobNumber") WHERE "jobNumber" IS NOT NULL',
    );
    await AppDataSource.query(
      'CREATE UNIQUE INDEX IF NOT EXISTS "IDX_tickets_tenant_ticket_number" ON "tickets" ("tenantId", "ticketNumber") WHERE "ticketNumber" IS NOT NULL',
    );

    const quoteRepo = AppDataSource.getRepository(Quote);
    const invoiceRepo = AppDataSource.getRepository(Invoice);
    const jobRepo = AppDataSource.getRepository(Job);
    const ticketRepo = AppDataSource.getRepository(Ticket);

    const quotes = await quoteRepo.find({
      where: { isDeleted: false, quoteNumber: IsNull() },
      order: { createdAt: 'ASC' },
    });
    let quoteUpdated = 0;
    for (const quote of quotes) {
      await ensureQuoteNumber(quote);
      quoteUpdated += 1;
    }

    const invoices = await invoiceRepo.find({
      where: { isDeleted: false, invoiceNumber: IsNull() },
      order: { createdAt: 'ASC' },
    });
    let invoiceUpdated = 0;
    for (const invoice of invoices) {
      await ensureInvoiceNumber(invoice);
      invoiceUpdated += 1;
    }

    const jobs = await jobRepo.find({
      where: { isDeleted: false, jobNumber: IsNull() },
      order: { createdAt: 'ASC' },
    });
    let jobUpdated = 0;
    for (const job of jobs) {
      await ensureJobNumber(job);
      jobUpdated += 1;
    }

    const tickets = await ticketRepo.find({
      where: { isDeleted: false, ticketNumber: IsNull() },
      order: { createdAt: 'ASC' },
    });
    let ticketUpdated = 0;
    for (const ticket of tickets) {
      await ensureTicketNumber(ticket);
      ticketUpdated += 1;
    }

    console.log(`[document-number-backfill] quotes updated: ${quoteUpdated}`);
    console.log(`[document-number-backfill] invoices updated: ${invoiceUpdated}`);
    console.log(`[document-number-backfill] jobs updated: ${jobUpdated}`);
    console.log(`[document-number-backfill] tickets updated: ${ticketUpdated}`);
  } finally {
    await AppDataSource.destroy();
  }
};

run().catch((error) => {
  console.error('[document-number-backfill] failed', error);
  process.exit(1);
});

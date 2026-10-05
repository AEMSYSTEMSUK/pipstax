import { EntityManager } from 'typeorm';
import { AppDataSource } from '../config/data-source';
import { Invoice } from '../entities/invoice.entity';
import { Job } from '../entities/job.entity';
import { Quote } from '../entities/quote.entity';
import { Ticket } from '../entities/ticket.entity';
import { Tenant } from '../entities/tenant.entity';
import { TenantDocumentSequence } from '../entities/tenant-document-sequence.entity';
import { NotFoundError } from '../utils/errors';

type DocumentKind = 'quote' | 'invoice' | 'job' | 'ticket';

const DOCUMENT_PREFIX: Record<DocumentKind, string> = {
  quote: 'QT',
  invoice: 'INV',
  job: 'JOB',
  ticket: 'TKT',
};

const COUNTER_WIDTH = 6;
const CODE_FALLBACK = 'TEN';
const CODE_BASE_LENGTH = 3;
const CODE_MAX_LENGTH = 6;

const normalizeChunk = (value?: string | null) => (value ?? '').replace(/[^a-zA-Z0-9]/g, '').toUpperCase();

const pickTokenCode = (raw?: string | null) => {
  const tokens = (raw ?? '')
    .split(/[^a-zA-Z0-9]+/)
    .map((part) => normalizeChunk(part))
    .filter(Boolean);
  const firstUseful = tokens.find((part) => part.length >= CODE_BASE_LENGTH) ?? tokens[0];
  if (!firstUseful) {
    return '';
  }
  return firstUseful.slice(0, CODE_BASE_LENGTH);
};

const deriveTenantCodeBase = (tenant: Tenant) => {
  const fromSubdomain = pickTokenCode(tenant.subdomain);
  if (fromSubdomain) {
    return fromSubdomain;
  }

  const fromTradingName = pickTokenCode(tenant.tradingName);
  if (fromTradingName) {
    return fromTradingName;
  }

  const fromTenantName = pickTokenCode(tenant.name);
  if (fromTenantName) {
    return fromTenantName;
  }

  return CODE_FALLBACK;
};

const isTenantCodeTaken = async (manager: EntityManager, tenantCode: string, tenantId: string) => {
  const existing = await manager.getRepository(TenantDocumentSequence).findOne({
    where: { tenantCode },
  });
  return Boolean(existing && existing.tenantId !== tenantId);
};

const resolveUniqueTenantCode = async (manager: EntityManager, tenant: Tenant) => {
  const base = deriveTenantCodeBase(tenant);
  let candidate = base;
  let index = 0;
  while (await isTenantCodeTaken(manager, candidate, tenant.id)) {
    index += 1;
    const suffix = String(index);
    const root = base.slice(0, Math.max(2, CODE_MAX_LENGTH - suffix.length));
    candidate = `${root}${suffix}`;
  }
  return candidate;
};

const formatDocumentNumber = (kind: DocumentKind, tenantCode: string, value: number) => {
  const counter = String(value).padStart(COUNTER_WIDTH, '0');
  return `${DOCUMENT_PREFIX[kind]}-${tenantCode}-${counter}`;
};

const reserveDocumentNumberTx = async (
  manager: EntityManager,
  tenantId: string,
  kind: DocumentKind,
) => {
  const tenantRepo = manager.getRepository(Tenant);
  const sequenceRepo = manager.getRepository(TenantDocumentSequence);

  const tenant = await tenantRepo.findOne({
    where: { id: tenantId, isDeleted: false },
    lock: { mode: 'pessimistic_write' },
  });
  if (!tenant) {
    throw new NotFoundError('Tenant not found');
  }

  let sequence = await sequenceRepo.findOne({
    where: { tenantId },
    lock: { mode: 'pessimistic_write' },
  });
  if (!sequence) {
    sequence = sequenceRepo.create({
      tenantId,
      tenantCode: await resolveUniqueTenantCode(manager, tenant),
      quoteCounter: 0,
      invoiceCounter: 0,
      jobCounter: 0,
      ticketCounter: 0,
    });
  }

  if (kind === 'quote') {
    sequence.quoteCounter += 1;
    await sequenceRepo.save(sequence);
    return formatDocumentNumber(kind, sequence.tenantCode, sequence.quoteCounter);
  }

  if (kind === 'invoice') {
    sequence.invoiceCounter += 1;
    await sequenceRepo.save(sequence);
    return formatDocumentNumber(kind, sequence.tenantCode, sequence.invoiceCounter);
  }

  if (kind === 'ticket') {
    sequence.ticketCounter += 1;
    await sequenceRepo.save(sequence);
    return formatDocumentNumber(kind, sequence.tenantCode, sequence.ticketCounter);
  }

  sequence.jobCounter += 1;
  await sequenceRepo.save(sequence);
  return formatDocumentNumber(kind, sequence.tenantCode, sequence.jobCounter);
};

export const reserveDocumentNumber = async (tenantId: string, kind: DocumentKind) =>
  AppDataSource.transaction((manager) => reserveDocumentNumberTx(manager, tenantId, kind));

export const ensureQuoteNumber = async (quote: Quote) => {
  if (quote.quoteNumber) {
    return quote.quoteNumber;
  }
  return AppDataSource.transaction(async (manager) => {
    const repo = manager.getRepository(Quote);
    const current = await repo.findOne({
      where: { id: quote.id },
      lock: { mode: 'pessimistic_write' },
    });
    if (!current) {
      throw new NotFoundError('Quote not found');
    }
    if (current.quoteNumber) {
      return current.quoteNumber;
    }
    current.quoteNumber = await reserveDocumentNumberTx(manager, current.tenantId, 'quote');
    await repo.save(current);
    quote.quoteNumber = current.quoteNumber;
    return current.quoteNumber;
  });
};

export const ensureInvoiceNumber = async (invoice: Invoice) => {
  if (invoice.invoiceNumber) {
    return invoice.invoiceNumber;
  }
  return AppDataSource.transaction(async (manager) => {
    const repo = manager.getRepository(Invoice);
    const current = await repo.findOne({
      where: { id: invoice.id },
      lock: { mode: 'pessimistic_write' },
    });
    if (!current) {
      throw new NotFoundError('Invoice not found');
    }
    if (current.invoiceNumber) {
      return current.invoiceNumber;
    }
    current.invoiceNumber = await reserveDocumentNumberTx(manager, current.tenantId, 'invoice');
    await repo.save(current);
    invoice.invoiceNumber = current.invoiceNumber;
    return current.invoiceNumber;
  });
};

export const ensureJobNumber = async (job: Job) => {
  if (job.jobNumber) {
    return job.jobNumber;
  }
  return AppDataSource.transaction(async (manager) => {
    const repo = manager.getRepository(Job);
    const current = await repo.findOne({
      where: { id: job.id },
      lock: { mode: 'pessimistic_write' },
    });
    if (!current) {
      throw new NotFoundError('Job not found');
    }
    if (current.jobNumber) {
      return current.jobNumber;
    }
    current.jobNumber = await reserveDocumentNumberTx(manager, current.tenantId, 'job');
    await repo.save(current);
    job.jobNumber = current.jobNumber;
    return current.jobNumber;
  });
};

export const ensureTicketNumber = async (ticket: Ticket) => {
  if (ticket.ticketNumber) {
    return ticket.ticketNumber;
  }
  return AppDataSource.transaction(async (manager) => {
    const repo = manager.getRepository(Ticket);
    const current = await repo.findOne({
      where: { id: ticket.id },
      lock: { mode: 'pessimistic_write' },
    });
    if (!current) {
      throw new NotFoundError('Ticket not found');
    }
    if (current.ticketNumber) {
      return current.ticketNumber;
    }
    current.ticketNumber = await reserveDocumentNumberTx(manager, current.tenantId, 'ticket');
    await repo.save(current);
    ticket.ticketNumber = current.ticketNumber;
    return current.ticketNumber;
  });
};

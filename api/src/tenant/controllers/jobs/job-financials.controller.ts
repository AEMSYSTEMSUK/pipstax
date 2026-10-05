import { Request, Response, NextFunction } from 'express';
import { AppDataSource } from '../../../config/data-source';
import { Job } from '../../../entities/job.entity';
import { JobExpense } from '../../../entities/job-expense.entity';
import { JobTimeEntry } from '../../../entities/job-time-entry.entity';
import { Quote } from '../../../entities/quote.entity';
import { Invoice } from '../../../entities/invoice.entity';
import { SplitInvoice } from '../../../entities/split-invoice.entity';
import { DocumentItem } from '../../../entities/document.entity';
import { SyncStatus } from '../../../constants/integrations';
import { getTenantId } from '../../../utils/request';
import { BadRequestError, NotFoundError } from '../../../utils/errors';
import { SplitInvoiceStatus } from '../../../constants/status';
import { normalizeStoredFileReference, resolveStoredFileUrl } from '../../../services/storage/storage.service';
import { ensureInvoiceNumber, ensureQuoteNumber } from '../../../services/document-number.service';
import { hasActiveIntegration } from '../../../services/integrations.service';
import { enqueueDocumentPush } from '../../queues/document-sync-queue.service';
import { syncDocumentToProvider } from '../../../services/integrations/document-shadowing.service';
import { createJobActivity } from '../../../services/job-activity.service';
import { User } from '../../../entities/user.entity';
import path from 'path';

const toSafeFolderSegment = (value: string) => {
  const normalized = value
    .trim()
    .replace(/[\\/]+/g, '-')
    .replace(/\s+/g, ' ')
    .slice(0, 80);
  return normalized || 'Untitled Job';
};

const buildJobExpensesCategory = (jobTitle: string) =>
  `Jobs/${toSafeFolderSegment(jobTitle)}/expenses`;

const normalizeOptionalString = (value: unknown) => {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
};

const upsertExpenseReceiptDocument = async (params: {
  tenantId: string;
  jobId: string;
  jobTitle: string;
  expenseId: string;
  expenseLabel: string;
  receiptUrl?: string;
}) => {
  const receiptKey = normalizeStoredFileReference(params.receiptUrl);
  if (!receiptKey) return;

  const documentRepo = AppDataSource.getRepository(DocumentItem);
  const activeIntegration = await hasActiveIntegration(params.tenantId);
  const category = buildJobExpensesCategory(params.jobTitle);

  const existing = await documentRepo.findOne({
    where: {
      tenantId: params.tenantId,
      relatedEntityType: 'job_expense',
      relatedEntityId: params.expenseId,
      isDeleted: false,
    },
  });

  const originalName = path.basename(receiptKey).replace(/^\d+-[a-f0-9]+-/, '');
  const document =
    existing ??
    (documentRepo.create({
      tenantId: params.tenantId,
      name: originalName || 'Expense Receipt',
      category,
      fileUrl: receiptKey,
      relatedEntityType: 'job_expense',
      relatedEntityId: params.expenseId,
    }) as DocumentItem);

  document.fileUrl = receiptKey;
  document.category = category;
  document.label = params.expenseLabel?.trim() || document.label;
  if (activeIntegration) {
    document.syncStatus = SyncStatus.PENDING;
  }
  await documentRepo.save(document);

  if (!activeIntegration) return;

  const pushQueued = await enqueueDocumentPush({
    tenantId: params.tenantId,
    documentId: document.id,
  });
  if (!pushQueued) {
    try {
      await syncDocumentToProvider(document);
    } catch {
      // Keep expense creation flow successful even when sync fails.
    }
  }
};

const ensureJobInTenant = async (tenantId: string, jobId: string) => {
  const jobRepo = AppDataSource.getRepository(Job);
  const job = await jobRepo.findOne({
    where: { id: jobId, tenantId, isDeleted: false },
  });
  if (!job) {
    throw new NotFoundError('Job not found');
  }
  return job;
};

const ensureSplitInvoiceInTenant = async (tenantId: string, splitInvoiceId: string) => {
  const repo = AppDataSource.getRepository(SplitInvoice);
  const splitInvoice = await repo.findOne({
    where: { id: splitInvoiceId, tenantId, isDeleted: false },
  });
  if (!splitInvoice) {
    throw new NotFoundError('Split invoice not found');
  }
  return splitInvoice;
};

const ensureLinkedInvoiceIsEditable = async (tenantId: string, splitInvoice: SplitInvoice) => {
  if (!splitInvoice.linkedInvoiceId) {
    return null;
  }

  const invoice = await AppDataSource.getRepository(Invoice).findOne({
    where: {
      id: splitInvoice.linkedInvoiceId,
      tenantId,
      isDeleted: false,
    },
  });

  if (!invoice) {
    splitInvoice.linkedInvoiceId = undefined;
    await AppDataSource.getRepository(SplitInvoice).save(splitInvoice);
    return null;
  }

  if (!invoice.invoiceNumber) {
    await ensureInvoiceNumber(invoice);
  }

  throw new BadRequestError(
    `Linked split billing lines are controlled by invoice ${invoice.invoiceNumber ?? invoice.id} and cannot be edited or deleted here.`,
  );
};

const parseSplitInvoiceStatus = (value: unknown) => {
  const normalized = String(value ?? '')
    .trim()
    .replace(/[-\s]+/g, '_')
    .toUpperCase();

  switch (normalized) {
    case SplitInvoiceStatus.TO_SEND:
      return SplitInvoiceStatus.TO_SEND;
    case SplitInvoiceStatus.INVOICED:
      return SplitInvoiceStatus.INVOICED;
    case SplitInvoiceStatus.PAID:
      return SplitInvoiceStatus.PAID;
    default:
      throw new BadRequestError('Unsupported split invoice status');
  }
};

const parseOptionalInvoiceDate = (value: unknown) => {
  if (value == null || value === '') return undefined;
  const parsed = new Date(String(value));
  if (Number.isNaN(parsed.getTime())) {
    throw new BadRequestError('Invalid split invoice date');
  }
  return parsed.toISOString().slice(0, 10);
};

export const listJobExpenses = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const tenantId = getTenantId(req);
    await ensureJobInTenant(tenantId, req.params.id);
    const repo = AppDataSource.getRepository(JobExpense);
    const expenses = await repo.find({
      where: { tenantId, jobId: req.params.id, isDeleted: false },
      relations: ['user'],
      order: { expenseDate: 'DESC', createdAt: 'DESC' },
    });
    res.deliver(
      200,
      true,
      expenses.map((entry) => ({
        ...entry,
        receiptUrl: resolveStoredFileUrl(entry.receiptUrl),
      })),
      'Job expenses fetched',
    );
  } catch (error) {
    next(error);
  }
};

export const createJobExpense = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const tenantId = getTenantId(req);
    const userId = req.userId;
    if (!userId) {
      throw new NotFoundError('User not found');
    }
    const job = await ensureJobInTenant(tenantId, req.params.id);

    const description = String(req.body.description ?? '').trim();
    if (!description) {
      throw new BadRequestError('Expense description is required');
    }
    const amount = Number(req.body.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new BadRequestError('Expense amount must be greater than 0');
    }
    const expenseDate = req.body.expenseDate
      ? new Date(req.body.expenseDate)
      : new Date();
    if (Number.isNaN(expenseDate.getTime())) {
      throw new BadRequestError('Invalid expense date');
    }

    const repo = AppDataSource.getRepository(JobExpense);
    const expense = repo.create({
      tenantId,
      userId,
      jobId: req.params.id,
      description,
      category: normalizeOptionalString(req.body.category),
      amount,
      currency: String(req.body.currency ?? 'GBP').toUpperCase().slice(0, 3),
      expenseDate: expenseDate.toISOString().slice(0, 10),
      receiptUrl: normalizeStoredFileReference(req.body.receiptUrl),
    });
    await repo.save(expense);
    await upsertExpenseReceiptDocument({
      tenantId,
      jobId: job.id,
      jobTitle: job.title,
      expenseId: expense.id,
      expenseLabel: expense.description,
      receiptUrl: expense.receiptUrl,
    });
    await createJobActivity({
      tenantId,
      jobId: job.id,
      userId,
      type: 'Expense Added',
      message: `Expense "${expense.description}" added for ${expense.currency} ${Number(expense.amount).toFixed(2)}.`,
      metadata: { expenseId: expense.id, category: expense.category ?? null, amount: Number(expense.amount) },
    });

    const createdExpense = await repo.findOne({
      where: { id: expense.id, tenantId, isDeleted: false },
      relations: ['user'],
    });

    res.deliver(
      201,
      true,
      {
        ...(createdExpense ?? expense),
        receiptUrl: resolveStoredFileUrl((createdExpense ?? expense).receiptUrl),
      },
      'Job expense created',
    );
  } catch (error) {
    next(error);
  }
};

export const deleteJobExpense = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const tenantId = getTenantId(req);
    const job = await ensureJobInTenant(tenantId, req.params.id);
    const repo = AppDataSource.getRepository(JobExpense);
    const expense = await repo.findOne({
      where: { id: req.params.expenseId, jobId: job.id, tenantId, isDeleted: false },
    });
    if (!expense) {
      throw new NotFoundError('Expense not found');
    }
    expense.isDeleted = true;
    await repo.save(expense);

    const documentRepo = AppDataSource.getRepository(DocumentItem);
    const receiptDocument = await documentRepo.findOne({
      where: {
        tenantId,
        relatedEntityType: 'job_expense',
        relatedEntityId: expense.id,
        isDeleted: false,
      },
    });
    if (receiptDocument) {
      receiptDocument.isDeleted = true;
      await documentRepo.save(receiptDocument);
    }

    await createJobActivity({
      tenantId,
      jobId: job.id,
      userId: req.userId,
      type: 'Expense Deleted',
      message: `Expense "${expense.description}" deleted.`,
      metadata: { expenseId: expense.id, amount: Number(expense.amount) },
    });

    res.deliver(200, true, { id: expense.id }, 'Job expense deleted');
  } catch (error) {
    next(error);
  }
};

export const updateJobExpense = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const tenantId = getTenantId(req);
    const job = await ensureJobInTenant(tenantId, req.params.id);
    const repo = AppDataSource.getRepository(JobExpense);
    const expense = await repo.findOne({
      where: { id: req.params.expenseId, jobId: job.id, tenantId, isDeleted: false },
    });
    if (!expense) {
      throw new NotFoundError('Expense not found');
    }

    const description = String(req.body.description ?? '').trim();
    if (!description) {
      throw new BadRequestError('Expense description is required');
    }
    const amount = Number(req.body.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new BadRequestError('Expense amount must be greater than 0');
    }
    const expenseDate = req.body.expenseDate ? new Date(req.body.expenseDate) : new Date(expense.expenseDate);
    if (Number.isNaN(expenseDate.getTime())) {
      throw new BadRequestError('Invalid expense date');
    }

    const previousReceiptUrl = expense.receiptUrl;
    expense.description = description;
    expense.category = normalizeOptionalString(req.body.category);
    expense.amount = amount;
    expense.currency = String(req.body.currency ?? expense.currency ?? 'GBP').toUpperCase().slice(0, 3);
    expense.expenseDate = expenseDate.toISOString().slice(0, 10);
    expense.receiptUrl = normalizeStoredFileReference(req.body.receiptUrl);
    await repo.save(expense);

    if (expense.receiptUrl) {
      await upsertExpenseReceiptDocument({
        tenantId,
        jobId: job.id,
        jobTitle: job.title,
        expenseId: expense.id,
        expenseLabel: expense.description,
        receiptUrl: expense.receiptUrl,
      });
    } else if (previousReceiptUrl) {
      const documentRepo = AppDataSource.getRepository(DocumentItem);
      const receiptDocument = await documentRepo.findOne({
        where: {
          tenantId,
          relatedEntityType: 'job_expense',
          relatedEntityId: expense.id,
          isDeleted: false,
        },
      });
      if (receiptDocument) {
        receiptDocument.isDeleted = true;
        await documentRepo.save(receiptDocument);
      }
    }

    await createJobActivity({
      tenantId,
      jobId: job.id,
      userId: req.userId,
      type: 'Expense Updated',
      message: `Expense "${expense.description}" updated.`,
      metadata: { expenseId: expense.id, amount: Number(expense.amount), category: expense.category ?? null },
    });

    const updatedExpense = await repo.findOne({
      where: { id: expense.id, tenantId, isDeleted: false },
      relations: ['user'],
    });

    res.deliver(
      200,
      true,
      {
        ...(updatedExpense ?? expense),
        receiptUrl: resolveStoredFileUrl((updatedExpense ?? expense).receiptUrl),
      },
      'Job expense updated',
    );
  } catch (error) {
    next(error);
  }
};

export const listJobTimeEntries = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const tenantId = getTenantId(req);
    await ensureJobInTenant(tenantId, req.params.id);
    const repo = AppDataSource.getRepository(JobTimeEntry);
    const entries = await repo.find({
      where: { tenantId, jobId: req.params.id, isDeleted: false },
      relations: ['user'],
      order: { startTime: 'DESC' },
    });
    res.deliver(200, true, entries, 'Job time entries fetched');
  } catch (error) {
    next(error);
  }
};

export const createJobTimeEntry = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const tenantId = getTenantId(req);
    const job = await ensureJobInTenant(tenantId, req.params.id);
    const userId = normalizeOptionalString(req.body.userId);
    if (!userId) {
      throw new BadRequestError('Timesheet user is required');
    }
    const user = await AppDataSource.getRepository(User).findOne({
      where: { id: userId, tenantId, isDeleted: false, isActive: true },
    });
    if (!user) {
      throw new BadRequestError('Selected user not found');
    }

    const startTime = new Date(String(req.body.startTime ?? ''));
    const endTime = new Date(String(req.body.endTime ?? ''));
    if (Number.isNaN(startTime.getTime()) || Number.isNaN(endTime.getTime())) {
      throw new BadRequestError('Valid start and end time are required');
    }
    if (endTime <= startTime) {
      throw new BadRequestError('Timesheet end time must be after start time');
    }

    const durationMinutes = Math.round((endTime.getTime() - startTime.getTime()) / 60000);
    const hourlyRate =
      req.body.hourlyRate === undefined || req.body.hourlyRate === null || req.body.hourlyRate === ''
        ? undefined
        : Number(req.body.hourlyRate);
    if (hourlyRate !== undefined && (!Number.isFinite(hourlyRate) || hourlyRate < 0)) {
      throw new BadRequestError('Hourly rate must be a valid number greater than or equal to 0');
    }

    const repo = AppDataSource.getRepository(JobTimeEntry);
    const entry = repo.create({
      tenantId,
      jobId: job.id,
      userId: user.id,
      startTime,
      endTime,
      durationMinutes,
      hourlyRate,
      notes: normalizeOptionalString(req.body.notes),
      entryType: 'MANUAL',
    });
    await repo.save(entry);
    await createJobActivity({
      tenantId,
      jobId: job.id,
      userId: req.userId,
      type: 'Timesheet Added',
      message: `Manual time entry added for ${user.fullName ?? user.email}.`,
      metadata: { timeEntryId: entry.id, userId: user.id, durationMinutes },
    });

    const createdEntry = await repo.findOne({
      where: { id: entry.id, tenantId, isDeleted: false },
      relations: ['user'],
    });
    res.deliver(201, true, createdEntry ?? entry, 'Job time entry created');
  } catch (error) {
    next(error);
  }
};

const parseTimeEntryPayload = async (req: Request, tenantId: string) => {
  const userId = normalizeOptionalString(req.body.userId);
  if (!userId) {
    throw new BadRequestError('Timesheet user is required');
  }
  const user = await AppDataSource.getRepository(User).findOne({
    where: { id: userId, tenantId, isDeleted: false, isActive: true },
  });
  if (!user) {
    throw new BadRequestError('Selected user not found');
  }

  const startTime = new Date(String(req.body.startTime ?? ''));
  const endTime = new Date(String(req.body.endTime ?? ''));
  if (Number.isNaN(startTime.getTime()) || Number.isNaN(endTime.getTime())) {
    throw new BadRequestError('Valid start and end time are required');
  }
  if (endTime <= startTime) {
    throw new BadRequestError('Timesheet end time must be after start time');
  }
  const durationMinutes = Math.round((endTime.getTime() - startTime.getTime()) / 60000);
  const hourlyRate =
    req.body.hourlyRate === undefined || req.body.hourlyRate === null || req.body.hourlyRate === ''
      ? undefined
      : Number(req.body.hourlyRate);
  if (hourlyRate !== undefined && (!Number.isFinite(hourlyRate) || hourlyRate < 0)) {
    throw new BadRequestError('Hourly rate must be a valid number greater than or equal to 0');
  }
  return {
    user,
    startTime,
    endTime,
    durationMinutes,
    hourlyRate,
    notes: normalizeOptionalString(req.body.notes),
  };
};

export const updateJobTimeEntry = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const tenantId = getTenantId(req);
    const job = await ensureJobInTenant(tenantId, req.params.id);
    const repo = AppDataSource.getRepository(JobTimeEntry);
    const entry = await repo.findOne({
      where: { id: req.params.timeEntryId, jobId: job.id, tenantId, isDeleted: false },
    });
    if (!entry) {
      throw new NotFoundError('Time entry not found');
    }

    const payload = await parseTimeEntryPayload(req, tenantId);
    entry.userId = payload.user.id;
    entry.startTime = payload.startTime;
    entry.endTime = payload.endTime;
    entry.durationMinutes = payload.durationMinutes;
    entry.hourlyRate = payload.hourlyRate;
    entry.notes = payload.notes;
    await repo.save(entry);

    await createJobActivity({
      tenantId,
      jobId: job.id,
      userId: req.userId,
      type: 'Timesheet Updated',
      message: `Time entry updated for ${payload.user.fullName ?? payload.user.email}.`,
      metadata: { timeEntryId: entry.id, userId: payload.user.id, durationMinutes: payload.durationMinutes },
    });

    const updatedEntry = await repo.findOne({
      where: { id: entry.id, tenantId, isDeleted: false },
      relations: ['user'],
    });
    res.deliver(200, true, updatedEntry ?? entry, 'Job time entry updated');
  } catch (error) {
    next(error);
  }
};

export const deleteJobTimeEntry = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const tenantId = getTenantId(req);
    const job = await ensureJobInTenant(tenantId, req.params.id);
    const repo = AppDataSource.getRepository(JobTimeEntry);
    const entry = await repo.findOne({
      where: { id: req.params.timeEntryId, jobId: job.id, tenantId, isDeleted: false },
      relations: ['user'],
    });
    if (!entry) {
      throw new NotFoundError('Time entry not found');
    }
    entry.isDeleted = true;
    await repo.save(entry);
    await createJobActivity({
      tenantId,
      jobId: job.id,
      userId: req.userId,
      type: 'Timesheet Deleted',
      message: `Time entry deleted for ${entry.user?.fullName ?? entry.user?.email ?? 'worker'}.`,
      metadata: { timeEntryId: entry.id, durationMinutes: entry.durationMinutes },
    });
    res.deliver(200, true, { id: entry.id }, 'Job time entry deleted');
  } catch (error) {
    next(error);
  }
};

export const listJobQuotes = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const tenantId = getTenantId(req);
    const job = await ensureJobInTenant(tenantId, req.params.id);
    const repo = AppDataSource.getRepository(Quote);
    const conditions: Array<Partial<Quote>> = [
      { tenantId, jobId: job.id, isDeleted: false },
    ];
    if (job.leadId) {
      conditions.push({ tenantId, leadId: job.leadId, isDeleted: false });
    }
    const quotes = await repo.find({
      where: conditions,
      order: { createdAt: 'DESC' },
    });
    await Promise.all(
      quotes.map(async (quote) => {
        if (!quote.quoteNumber) {
          await ensureQuoteNumber(quote);
        }
      }),
    );
    const uniqueQuotes = Array.from(new Map(quotes.map((quote) => [quote.id, quote])).values());
    res.deliver(200, true, uniqueQuotes, 'Job quotes fetched');
  } catch (error) {
    next(error);
  }
};

export const listJobInvoices = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const tenantId = getTenantId(req);
    const job = await ensureJobInTenant(tenantId, req.params.id);
    const repo = AppDataSource.getRepository(Invoice);
    const conditions: Array<Partial<Invoice>> = [
      { tenantId, jobId: job.id, isDeleted: false },
    ];
    const invoices = await repo.find({
      where: conditions,
      order: { createdAt: 'DESC' },
    });
    await Promise.all(
      invoices.map(async (invoice) => {
        if (!invoice.invoiceNumber) {
          await ensureInvoiceNumber(invoice);
        }
      }),
    );
    res.deliver(200, true, invoices, 'Job invoices fetched');
  } catch (error) {
    next(error);
  }
};

export const listJobSplitInvoices = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const tenantId = getTenantId(req);
    await ensureJobInTenant(tenantId, req.params.id);
    const repo = AppDataSource.getRepository(SplitInvoice);
    const splitInvoices = await repo.find({
      where: { tenantId, jobId: req.params.id, isDeleted: false },
      relations: ['linkedInvoice'],
      order: { createdAt: 'DESC' },
    });
    await Promise.all(
      splitInvoices.map(async (entry) => {
        if (entry.linkedInvoice && !entry.linkedInvoice.invoiceNumber) {
          await ensureInvoiceNumber(entry.linkedInvoice);
        }
      }),
    );
    res.deliver(200, true, splitInvoices, 'Job split invoices fetched');
  } catch (error) {
    next(error);
  }
};

export const createJobSplitInvoice = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const tenantId = getTenantId(req);
    const job = await ensureJobInTenant(tenantId, req.params.id);
    const valueExVat = Number(req.body.valueExVat);
    if (!Number.isFinite(valueExVat) || valueExVat <= 0) {
      throw new BadRequestError('Split invoice value must be greater than 0');
    }

    const repo = AppDataSource.getRepository(SplitInvoice);
    const splitInvoice = repo.create({
      tenantId,
      jobId: job.id,
      description:
        typeof req.body.description === 'string' && req.body.description.trim().length > 0
          ? req.body.description.trim()
          : undefined,
      valueExVat,
      status:
        req.body.status == null
          ? SplitInvoiceStatus.TO_SEND
          : parseSplitInvoiceStatus(req.body.status),
      invoiceDate: parseOptionalInvoiceDate(req.body.invoiceDate),
    });
    await repo.save(splitInvoice);
    res.deliver(201, true, splitInvoice, 'Job split invoice created');
  } catch (error) {
    next(error);
  }
};

export const updateSplitInvoice = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const tenantId = getTenantId(req);
    const repo = AppDataSource.getRepository(SplitInvoice);
    const splitInvoice = await ensureSplitInvoiceInTenant(tenantId, req.params.splitInvoiceId);
    await ensureLinkedInvoiceIsEditable(tenantId, splitInvoice);

    if (typeof req.body.description === 'string') {
      const nextDescription = req.body.description.trim();
      splitInvoice.description = nextDescription.length > 0 ? nextDescription : undefined;
    }

    if (req.body.valueExVat !== undefined) {
      const valueExVat = Number(req.body.valueExVat);
      if (!Number.isFinite(valueExVat) || valueExVat <= 0) {
        throw new BadRequestError('Split invoice value must be greater than 0');
      }
      splitInvoice.valueExVat = valueExVat;
    }

    if (req.body.status !== undefined) {
      splitInvoice.status = parseSplitInvoiceStatus(req.body.status);
    }

    if (req.body.invoiceDate !== undefined) {
      splitInvoice.invoiceDate = parseOptionalInvoiceDate(req.body.invoiceDate);
    }

    await repo.save(splitInvoice);
    res.deliver(200, true, splitInvoice, 'Split invoice updated');
  } catch (error) {
    next(error);
  }
};

export const deleteSplitInvoice = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const tenantId = getTenantId(req);
    const repo = AppDataSource.getRepository(SplitInvoice);
    const splitInvoice = await ensureSplitInvoiceInTenant(tenantId, req.params.splitInvoiceId);
    await ensureLinkedInvoiceIsEditable(tenantId, splitInvoice);
    splitInvoice.isDeleted = true;
    await repo.save(splitInvoice);
    res.deliver(200, true, null, 'Split invoice deleted');
  } catch (error) {
    next(error);
  }
};

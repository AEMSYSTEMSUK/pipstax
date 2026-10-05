import { Request, Response, NextFunction } from 'express';
import { AppDataSource } from '../../../config/data-source';
import { Invoice } from '../../../entities/invoice.entity';
import { SplitInvoice } from '../../../entities/split-invoice.entity';
import { Tenant } from '../../../entities/tenant.entity';
import { getTenantId } from '../../../utils/request';
import { BadRequestError, NotFoundError } from '../../../utils/errors';
import { InvoiceStatus, SplitInvoiceStatus } from '../../../constants/status';
import { buildInvoicePdf, calculateInvoiceTotals } from '../../../services/invoices.service';
import { Customer } from '../../../entities/customer.entity';
import { sendInvoiceEmail } from '../../../services/notifications.service';
import { ensureCustomerPortalAccess } from '../../../services/customer-portal-access.service';
import { ensureInvoiceNumber, reserveDocumentNumber } from '../../../services/document-number.service';
import { Job } from '../../../entities/job.entity';
import { QuoteStatus } from '../../../constants/status';
import { Quote } from '../../../entities/quote.entity';
import { markAccountingInvoicePaid, syncInvoiceDraftToAccounting } from '../../../services/integrations/accounting-sync.service';
import { enqueueInvoiceAccountingSync } from '../../queues/accounting-sync-queue.service';
import { notifyAdmins } from '../../../services/in-app-notifications.service';
import { buildCustomerSiteAddress, ensureCustomerSiteForTenant } from '../../../services/customer-sites.service';
import { assertTenantFeatureEnabled } from '../../../services/tenant-features.service';
import { normalizeTenantFeatureFlags } from '../../../services/tenant-features.service';
import {
  getWorkflowDisplayState,
  loadTenantWorkflowConfig,
  resolveWorkflowStageKeyForRecord,
  TenantWorkflowConfig,
} from '../../../services/workflow-config.service';
import { createJobActivity } from '../../../services/job-activity.service';
import { randomUUID } from 'crypto';


const computeMtdCompliance = (invoice: Invoice, tenant?: Tenant | null) => {
  const hasSellerName = Boolean((tenant?.tradingName ?? tenant?.name)?.trim());
  const hasSellerAddress = Boolean(tenant?.address?.trim());
  const vatNumber = invoice.vatNumber ?? tenant?.vatNumber;
  const hasVatNumber = Boolean(vatNumber?.trim());
  const hasInvoiceRef = Boolean(invoice.invoiceNumber?.trim());
  const hasIssueDate = Boolean(invoice.createdAt);
  const hasLineItems =
    Array.isArray(invoice.lineItems) &&
    invoice.lineItems.length > 0 &&
    invoice.lineItems.every(
      (item) =>
        Boolean(String(item.description ?? '').trim()) &&
        Number(item.quantity) > 0 &&
        Number(item.unitPrice) >= 0 &&
        Number(item.vatRate ?? 0) >= 0,
    );
  return hasSellerName && hasSellerAddress && hasVatNumber && hasInvoiceRef && hasIssueDate && hasLineItems;
};

const refreshOverdueStatuses = async (invoices: Invoice[]) => {
  const now = Date.now();
  let changed = false;
  for (const invoice of invoices) {
    if (
      [InvoiceStatus.SENT, InvoiceStatus.VIEWED].includes(invoice.status) &&
      invoice.dueDate &&
      new Date(invoice.dueDate).getTime() < now
    ) {
      invoice.status = InvoiceStatus.OVERDUE;
      changed = true;
    }
  }
  return changed;
};

const normalizeOptionalString = (value: unknown) => {
  if (typeof value !== 'string') {
    return undefined;
  }
  const nextValue = value.trim();
  return nextValue.length > 0 ? nextValue : undefined;
};

const toDateOnly = (value?: Date | string | null) => {
  if (!value) return undefined;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return undefined;
  return parsed.toISOString().slice(0, 10);
};

const normalizeInvoicePayments = (invoice: Invoice) =>
  Array.isArray(invoice.payments)
    ? invoice.payments
        .map((payment) => ({
          ...payment,
          amount: Number(payment.amount ?? 0),
        }))
        .filter((payment) => Number.isFinite(payment.amount) && payment.amount > 0)
    : [];

const getInvoicePaymentTotals = (invoice: Invoice) => {
  const amountPaid = normalizeInvoicePayments(invoice).reduce(
    (sum, payment) => sum + Number(payment.amount ?? 0),
    0,
  );
  const total = Number(invoice.total ?? 0);
  const balanceDue = Math.max(0, total - amountPaid);
  return {
    amountPaid: Number(amountPaid.toFixed(2)),
    balanceDue: Number(balanceDue.toFixed(2)),
  };
};

const applyInvoicePaymentStatus = async (tenantId: string, invoice: Invoice) => {
  calculateInvoiceTotals(invoice);
  const { amountPaid, balanceDue } = getInvoicePaymentTotals(invoice);
  if (amountPaid > 0 && balanceDue <= 0) {
    invoice.status = InvoiceStatus.PAID;
    invoice.paidAt = invoice.paidAt ?? new Date();
  } else if (amountPaid > 0) {
    invoice.status = InvoiceStatus.SENT;
    invoice.paidAt = undefined;
  } else if (invoice.status === InvoiceStatus.PAID) {
    invoice.status = invoice.sentAt ? InvoiceStatus.SENT : InvoiceStatus.DRAFT;
    invoice.paidAt = undefined;
  }
  invoice.workflowStageKey = await resolveWorkflowStageKeyForRecord({
    tenantId,
    module: 'invoices',
    baseStatus: invoice.status,
    currentStageKey: invoice.workflowStageKey,
    featureEnabled: await isWorkflowOverlayEnabled(tenantId),
  });
};

const syncSplitInvoiceFromInvoice = async (invoice: Invoice) => {
  if (!invoice.sourceSplitInvoiceId) {
    return;
  }

  const splitRepo = AppDataSource.getRepository(SplitInvoice);
  const splitInvoice = await splitRepo.findOne({
    where: {
      id: invoice.sourceSplitInvoiceId,
      tenantId: invoice.tenantId,
      isDeleted: false,
    },
  });
  if (!splitInvoice) {
    return;
  }

  const firstLineItem =
    Array.isArray(invoice.lineItems) && invoice.lineItems.length > 0 ? invoice.lineItems[0] : null;
  splitInvoice.description =
    typeof firstLineItem?.description === 'string' && firstLineItem.description.trim().length > 0
      ? firstLineItem.description.trim()
      : splitInvoice.description;
  if (Number.isFinite(Number(invoice.subTotal))) {
    splitInvoice.valueExVat = Number(invoice.subTotal ?? 0);
  }

  if (invoice.isDeleted) {
    splitInvoice.linkedInvoiceId = undefined;
    splitInvoice.status = InvoiceStatus.PAID === invoice.status ? splitInvoice.status : SplitInvoiceStatus.TO_SEND;
    if (splitInvoice.status === SplitInvoiceStatus.TO_SEND) {
      splitInvoice.invoiceDate = undefined;
    }
    await splitRepo.save(splitInvoice);
    return;
  }

  splitInvoice.linkedInvoiceId = invoice.id;
  if (invoice.status === InvoiceStatus.PAID) {
    splitInvoice.status = SplitInvoiceStatus.PAID;
    splitInvoice.invoiceDate = toDateOnly(invoice.paidAt ?? invoice.sentAt ?? invoice.createdAt) ?? splitInvoice.invoiceDate;
  } else if ([InvoiceStatus.SENT, InvoiceStatus.VIEWED, InvoiceStatus.OVERDUE].includes(invoice.status)) {
    splitInvoice.status = SplitInvoiceStatus.INVOICED;
    splitInvoice.invoiceDate = toDateOnly(invoice.sentAt ?? invoice.createdAt) ?? splitInvoice.invoiceDate;
  } else {
    splitInvoice.status = SplitInvoiceStatus.TO_SEND;
    splitInvoice.invoiceDate = undefined;
  }
  await splitRepo.save(splitInvoice);
};

const sendInvoiceForTenant = async (
  tenantId: string,
  invoice: Invoice,
  tenant: Tenant,
  options?: { sendEmail?: boolean; markAsSent?: boolean; email?: string; message?: string },
) => {
  const customerRepo = AppDataSource.getRepository(Customer);
  if (!invoice.invoiceNumber) {
    invoice.invoiceNumber = await reserveDocumentNumber(tenantId, 'invoice');
  }
  if (!invoice.vatNumber) {
    invoice.vatNumber = tenant.vatNumber ?? undefined;
  }
  calculateInvoiceTotals(invoice);
  invoice.isMtdCompliant = computeMtdCompliance(invoice, tenant);
  const shouldMarkAsSent = options?.markAsSent !== false;
  if (shouldMarkAsSent && invoice.status !== InvoiceStatus.PAID) {
    invoice.status = InvoiceStatus.SENT;
    invoice.sentAt = new Date();
    invoice.workflowStageKey = await resolveWorkflowStageKeyForRecord({
      tenantId,
      module: 'invoices',
      baseStatus: invoice.status,
      currentStageKey: invoice.workflowStageKey,
      featureEnabled: await isWorkflowOverlayEnabled(tenantId),
    });
  }
  const accountingSync = await syncInvoiceDraftToAccounting(tenantId, invoice);
  await AppDataSource.getRepository(Invoice).save(invoice);
  await syncSplitInvoiceFromInvoice(invoice);
  const customer = await customerRepo.findOne({ where: { id: invoice.customerId, tenantId, isDeleted: false } });
  let portalLink: string | null = null;
  if (customer) {
    const access = await ensureCustomerPortalAccess({
      tenantId,
      customer,
      nextPath: `/portal/invoices/${invoice.id}`,
    });
    portalLink = access.onboardingLink ?? access.loginLink;
    const recipientEmail = options?.email?.trim() || customer.email;
    if (options?.sendEmail !== false && recipientEmail) {
      await sendInvoiceEmail(recipientEmail, portalLink, { tenantId }, { message: options?.message });
    }
  }
  if (invoice.jobId) {
    await createJobActivity({
      tenantId,
      jobId: invoice.jobId,
      type: shouldMarkAsSent ? 'Invoice Sent' : 'Invoice Shared',
      message: shouldMarkAsSent
        ? `Invoice ${invoice.invoiceNumber ?? invoice.id} shared and marked as sent.`
        : `Invoice ${invoice.invoiceNumber ?? invoice.id} sharing link prepared.`,
      metadata: { invoiceId: invoice.id, sendEmail: options?.sendEmail !== false },
    });
  }
  return { accountingSync, portalLink };
};

const toInvoiceResponse = async (invoice: Invoice) => {
  const workflowEnabled = await isWorkflowOverlayEnabled(invoice.tenantId);
  const workflowConfig = workflowEnabled ? await loadTenantWorkflowConfig(invoice.tenantId) : null;
  return toInvoiceResponseWithWorkflow(invoice, { workflowEnabled, workflowConfig });
};

const toInvoiceResponseWithWorkflow = async (
  invoice: Invoice,
  workflowContext?: { workflowEnabled: boolean; workflowConfig: TenantWorkflowConfig | null },
) => {
  const site = invoice.siteId
    ? await ensureCustomerSiteForTenant(invoice.tenantId, invoice.siteId).catch(() => null)
    : null;
  const workflowDisplay = getWorkflowDisplayState({
    config: workflowContext?.workflowConfig ?? (await loadTenantWorkflowConfig(invoice.tenantId)),
    module: 'invoices',
    baseStatus: invoice.status,
    workflowStageKey: invoice.workflowStageKey,
    enabled: workflowContext?.workflowEnabled ?? (await isWorkflowOverlayEnabled(invoice.tenantId)),
  });
  return {
    ...invoice,
    payments: normalizeInvoicePayments(invoice),
    ...getInvoicePaymentTotals(invoice),
    siteName: site?.name ?? null,
    siteReference: site?.reference ?? null,
    siteAddress: buildCustomerSiteAddress(site) ?? null,
    ...workflowDisplay,
  };
};

const isWorkflowOverlayEnabled = async (tenantId: string) => {
  const tenant = await AppDataSource.getRepository(Tenant).findOne({
    where: { id: tenantId, isDeleted: false },
    select: ['id', 'featureFlags'],
  });
  if (!tenant) {
    throw new NotFoundError('Tenant not found');
  }
  return normalizeTenantFeatureFlags(tenant.featureFlags).complianceWorkflows;
};

export const listInvoices = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = getTenantId(req);
    const repo = AppDataSource.getRepository(Invoice);
    const invoices = await repo.find({ where: { tenantId, isDeleted: false } });
    await Promise.all(
      invoices.map(async (invoice) => {
        if (!invoice.invoiceNumber) {
          await ensureInvoiceNumber(invoice);
        }
      }),
    );
    const hasOverdueChanges = await refreshOverdueStatuses(invoices);
    if (hasOverdueChanges) {
      await repo.save(invoices);
    }
    const workflowEnabled = await isWorkflowOverlayEnabled(tenantId);
    const workflowConfig = workflowEnabled ? await loadTenantWorkflowConfig(tenantId) : null;
    res.deliver(
      200,
      true,
      await Promise.all(
        invoices.map((invoice) => toInvoiceResponseWithWorkflow(invoice, { workflowEnabled, workflowConfig })),
      ),
      'Invoices fetched',
    );
  } catch (error) {
    next(error);
  }
};

export const listSplitInvoiceRegister = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = getTenantId(req);
    await assertTenantFeatureEnabled(
      tenantId,
      'splitInvoicing',
      'Split invoicing is not enabled for this workspace.',
    );

    const splitRepo = AppDataSource.getRepository(SplitInvoice);
    const customerRepo = AppDataSource.getRepository(Customer);
    const rows = await splitRepo.find({
      where: { tenantId, isDeleted: false },
      relations: ['job', 'linkedInvoice'],
      order: { createdAt: 'DESC' },
    });
    await Promise.all(
      rows.map(async (entry) => {
        if (entry.linkedInvoice && !entry.linkedInvoice.invoiceNumber) {
          await ensureInvoiceNumber(entry.linkedInvoice);
        }
      }),
    );

    const customerIds = Array.from(
      new Set(
        rows
          .map((entry) => entry.job?.customerId)
          .filter((value): value is string => Boolean(value)),
      ),
    );
    const customers =
      customerIds.length > 0
        ? await customerRepo.find({
            where: customerIds.map((id) => ({ id, tenantId, isDeleted: false })),
          })
        : [];
    const customerMap = new Map(customers.map((customer) => [customer.id, customer]));

    const payload = await Promise.all(
      rows.map(async (entry) => {
        const site = entry.job?.siteId
          ? await ensureCustomerSiteForTenant(tenantId, entry.job.siteId).catch(() => null)
          : null;
        const customer = entry.job?.customerId ? customerMap.get(entry.job.customerId) : null;
        const linkedInvoice = entry.linkedInvoice && !entry.linkedInvoice.isDeleted ? entry.linkedInvoice : null;
        return {
          ...entry,
          jobTitle: entry.job?.title ?? null,
          jobLocation: entry.job?.location ?? null,
          customerId: entry.job?.customerId ?? null,
          customerName: customer?.name ?? null,
          siteId: entry.job?.siteId ?? null,
          siteName: site?.name ?? null,
          siteAddress: buildCustomerSiteAddress(site) ?? null,
          linkedInvoiceId: linkedInvoice?.id ?? entry.linkedInvoiceId ?? null,
          linkedInvoiceNumber: linkedInvoice?.invoiceNumber ?? null,
          linkedInvoiceStatus: linkedInvoice?.status ?? null,
        };
      }),
    );

    res.deliver(200, true, payload, 'Split billing register fetched');
  } catch (error) {
    next(error);
  }
};

export const getInvoice = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = getTenantId(req);
    const repo = AppDataSource.getRepository(Invoice);
    const invoice = await repo.findOne({ where: { id: req.params.id, tenantId, isDeleted: false } });
    if (!invoice) {
      throw new NotFoundError('Invoice not found');
    }
    if (!invoice.invoiceNumber) {
      await ensureInvoiceNumber(invoice);
    }
    if (
      [InvoiceStatus.SENT, InvoiceStatus.VIEWED].includes(invoice.status) &&
      invoice.dueDate &&
      new Date(invoice.dueDate).getTime() < Date.now()
    ) {
      invoice.status = InvoiceStatus.OVERDUE;
      await repo.save(invoice);
    }
    res.deliver(200, true, await toInvoiceResponse(invoice), 'Invoice fetched');
  } catch (error) {
    next(error);
  }
};

export const createInvoice = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = getTenantId(req);
    const repo = AppDataSource.getRepository(Invoice);
    const tenantRepo = AppDataSource.getRepository(Tenant);
    const jobRepo = AppDataSource.getRepository(Job);
    const customerRepo = AppDataSource.getRepository(Customer);
    const tenant = await tenantRepo.findOne({ where: { id: tenantId, isDeleted: false } });
    if (!tenant) {
      throw new NotFoundError('Tenant not found');
    }
    const customerId = normalizeOptionalString(req.body.customerId);
    if (!customerId) {
      throw new BadRequestError('Customer is required.');
    }
    const customer = await customerRepo.findOne({
      where: { id: customerId, tenantId, isDeleted: false },
    });
    if (!customer) {
      throw new BadRequestError('Selected customer not found.');
    }
    if (req.body.jobId) {
      const job = await jobRepo.findOne({
        where: { id: req.body.jobId, tenantId, isDeleted: false },
      });
      if (!job) {
        throw new BadRequestError('Job not found for this workspace.');
      }
      if (job.customerId && job.customerId !== customer.id) {
        throw new BadRequestError('Selected job does not belong to the chosen customer.');
      }
    }
    const siteId = normalizeOptionalString(req.body.siteId);
    if (siteId) {
      await assertTenantFeatureEnabled(tenantId, 'sites', 'Sites module is not enabled for this workspace.');
      const site = await ensureCustomerSiteForTenant(tenantId, siteId);
      if (site.customerId !== customer.id) {
        throw new BadRequestError('Selected site does not belong to the chosen customer.');
      }
    }
    const invoice = repo.create({
      ...req.body,
      tenantId,
      customerId: customer.id,
      siteId,
      vatNumber: req.body?.vatNumber ?? tenant.vatNumber,
      invoiceNumber: await reserveDocumentNumber(tenantId, 'invoice'),
      status: InvoiceStatus.DRAFT
    }) as unknown as Invoice;
    invoice.workflowStageKey = await resolveWorkflowStageKeyForRecord({
      tenantId,
      module: 'invoices',
      baseStatus: invoice.status,
      requestedStageKey: normalizeOptionalString(req.body.workflowStageKey),
      featureEnabled: await isWorkflowOverlayEnabled(tenantId),
    });
    calculateInvoiceTotals(invoice);
    invoice.isMtdCompliant = computeMtdCompliance(invoice, tenant);
    await repo.save(invoice);
    await syncSplitInvoiceFromInvoice(invoice);
    if (invoice.jobId) {
      await createJobActivity({
        tenantId,
        jobId: invoice.jobId,
        userId: req.userId,
        type: 'Invoice Created',
        message: `Invoice ${invoice.invoiceNumber ?? invoice.id} created.`,
        metadata: { invoiceId: invoice.id, total: Number(invoice.total ?? 0) },
      });
    }
    res.deliver(201, true, await toInvoiceResponse(invoice), 'Invoice created');
  } catch (error) {
    next(error);
  }
};

export const updateInvoice = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = getTenantId(req);
    const repo = AppDataSource.getRepository(Invoice);
    const tenantRepo = AppDataSource.getRepository(Tenant);
    const jobRepo = AppDataSource.getRepository(Job);
    const customerRepo = AppDataSource.getRepository(Customer);
    const invoice = await repo.findOne({ where: { id: req.params.id, tenantId, isDeleted: false } });
    if (!invoice) {
      throw new NotFoundError('Invoice not found');
    }
    const tenant = await tenantRepo.findOne({ where: { id: tenantId, isDeleted: false } });
    if (!tenant) {
      throw new NotFoundError('Tenant not found');
    }
    const previousCustomerId = invoice.customerId;
    const customerId =
      typeof req.body.customerId === 'string' ? normalizeOptionalString(req.body.customerId) : invoice.customerId;
    if (!customerId) {
      throw new BadRequestError('Customer is required.');
    }
    const customer = await customerRepo.findOne({
      where: { id: customerId, tenantId, isDeleted: false },
    });
    if (!customer) {
      throw new BadRequestError('Selected customer not found.');
    }
    invoice.customerId = customer.id;
    if (req.body.jobId) {
      const job = await jobRepo.findOne({ where: { id: req.body.jobId, tenantId, isDeleted: false } });
      if (!job) {
        throw new BadRequestError('Job not found for this workspace.');
      }
      if (job.customerId && job.customerId !== customer.id) {
        throw new BadRequestError('Selected job does not belong to the chosen customer.');
      }
    }
    Object.assign(invoice, req.body);
    if (
      typeof req.body.customerId === 'string' &&
      previousCustomerId !== invoice.customerId &&
      typeof req.body.siteId !== 'string'
    ) {
      invoice.siteId = undefined;
    }
    if (typeof req.body.siteId === 'string') {
      const siteId = normalizeOptionalString(req.body.siteId);
      if (!siteId) {
        invoice.siteId = undefined;
      } else {
        await assertTenantFeatureEnabled(tenantId, 'sites', 'Sites module is not enabled for this workspace.');
        const site = await ensureCustomerSiteForTenant(tenantId, siteId);
        if (site.customerId !== customer.id) {
          throw new BadRequestError('Selected site does not belong to the chosen customer.');
        }
        invoice.siteId = site.id;
      }
    }
    if (!invoice.vatNumber) {
      invoice.vatNumber = tenant.vatNumber ?? undefined;
    }
    invoice.workflowStageKey = await resolveWorkflowStageKeyForRecord({
      tenantId,
      module: 'invoices',
      baseStatus: invoice.status,
      requestedStageKey:
        typeof req.body.workflowStageKey === 'string' ? normalizeOptionalString(req.body.workflowStageKey) : undefined,
      currentStageKey: invoice.workflowStageKey,
      featureEnabled: await isWorkflowOverlayEnabled(tenantId),
    });
    calculateInvoiceTotals(invoice);
    invoice.isMtdCompliant = computeMtdCompliance(invoice, tenant);
    await repo.save(invoice);
    await syncSplitInvoiceFromInvoice(invoice);
    if (invoice.jobId) {
      await createJobActivity({
        tenantId,
        jobId: invoice.jobId,
        userId: req.userId,
        type: 'Invoice Updated',
        message: `Invoice ${invoice.invoiceNumber ?? invoice.id} updated.`,
        metadata: { invoiceId: invoice.id, status: invoice.status },
      });
    }
    res.deliver(200, true, await toInvoiceResponse(invoice), 'Invoice updated');
  } catch (error) {
    next(error);
  }
};

export const deleteInvoice = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = getTenantId(req);
    const repo = AppDataSource.getRepository(Invoice);
    const invoice = await repo.findOne({ where: { id: req.params.id, tenantId, isDeleted: false } });
    if (!invoice) {
      throw new NotFoundError('Invoice not found');
    }
    if (invoice.status === InvoiceStatus.PAID) {
      throw new BadRequestError('Paid invoices cannot be deleted.');
    }
    invoice.isDeleted = true;
    await repo.save(invoice);
    await syncSplitInvoiceFromInvoice(invoice);
    if (invoice.jobId) {
      await createJobActivity({
        tenantId,
        jobId: invoice.jobId,
        userId: req.userId,
        type: 'Invoice Deleted',
        message: `Invoice ${invoice.invoiceNumber ?? invoice.id} deleted.`,
        metadata: { invoiceId: invoice.id },
      });
    }
    res.deliver(200, true, invoice, 'Invoice removed');
  } catch (error) {
    next(error);
  }
};

export const createInvoiceFromJob = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = getTenantId(req);
    const jobId = String(req.params.jobId ?? '').trim();
    if (!jobId) {
      throw new BadRequestError('Job id is required');
    }

    const invoiceRepo = AppDataSource.getRepository(Invoice);
    const jobRepo = AppDataSource.getRepository(Job);
    const quoteRepo = AppDataSource.getRepository(Quote);
    const tenantRepo = AppDataSource.getRepository(Tenant);
    const customerRepo = AppDataSource.getRepository(Customer);

    const tenant = await tenantRepo.findOne({ where: { id: tenantId, isDeleted: false } });
    if (!tenant) {
      throw new NotFoundError('Tenant not found');
    }

    const job = await jobRepo.findOne({ where: { id: jobId, tenantId, isDeleted: false } });
    if (!job) {
      throw new NotFoundError('Job not found');
    }
    if (!job.customerId) {
      throw new BadRequestError('Job is missing linked customer.');
    }

    const customer = await customerRepo.findOne({
      where: { id: job.customerId, tenantId, isDeleted: false },
    });
    if (!customer) {
      throw new BadRequestError('Customer not found for this job.');
    }

    const quoteQb = quoteRepo
      .createQueryBuilder('quote')
      .where('quote.tenantId = :tenantId', { tenantId })
      .andWhere('quote.customerId = :customerId', { customerId: customer.id })
      .andWhere('quote.isDeleted = false')
      .andWhere(
        '(quote.jobId = :jobId' + (job.leadId ? ' OR quote.leadId = :leadId' : '') + ')',
        {
          jobId: job.id,
          ...(job.leadId ? { leadId: job.leadId } : {}),
        },
      )
      .orderBy('quote.createdAt', 'DESC');
    const latestQuote = await quoteQb.getOne();

    const baseLineItems =
      Array.isArray(req.body?.lineItems) && req.body.lineItems.length > 0
        ? req.body.lineItems
        : Array.isArray(latestQuote?.lineItems) && latestQuote?.lineItems.length > 0
          ? latestQuote.lineItems
          : [
              {
                description: job.description?.trim() || job.title,
                quantity: 1,
                unitPrice: 0,
                vatRate: 20,
              },
            ];

    const invoice = invoiceRepo.create({
      tenantId,
      customerId: customer.id,
      siteId: job.siteId,
      jobId: job.id,
      sourceQuoteId: latestQuote?.id,
      title: String(req.body?.title ?? '').trim() || `${job.title} Invoice`,
      lineItems: baseLineItems,
      invoiceNumber: await reserveDocumentNumber(tenantId, 'invoice'),
      status: InvoiceStatus.DRAFT,
      vatNumber: String(req.body?.vatNumber ?? '').trim() || tenant.vatNumber || undefined,
      dueDate:
        typeof req.body?.dueDate === 'string' && req.body.dueDate.trim()
          ? req.body.dueDate.trim()
          : undefined,
    }) as Invoice;
    calculateInvoiceTotals(invoice);
    invoice.isMtdCompliant = computeMtdCompliance(invoice, tenant);
    await invoiceRepo.save(invoice);
    await syncSplitInvoiceFromInvoice(invoice);
    await createJobActivity({
      tenantId,
      jobId: job.id,
      userId: req.userId,
      type: 'Invoice Created',
      message: `Invoice ${invoice.invoiceNumber ?? invoice.id} created from job.`,
      metadata: { invoiceId: invoice.id, sourceQuoteId: invoice.sourceQuoteId ?? null, total: Number(invoice.total ?? 0) },
    });
    res.deliver(
      201,
      true,
      await toInvoiceResponse(invoice),
      latestQuote?.status === QuoteStatus.SIGNED
        ? 'Invoice generated from job and signed quote'
        : 'Invoice generated from job',
    );
  } catch (error) {
    next(error);
  }
};

export const createInvoiceFromSplit = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = getTenantId(req);
    await assertTenantFeatureEnabled(
      tenantId,
      'splitInvoicing',
      'Split invoicing is not enabled for this workspace.',
    );

    const splitInvoiceId = String(req.params.splitInvoiceId ?? '').trim();
    if (!splitInvoiceId) {
      throw new BadRequestError('Split invoice id is required');
    }

    const splitRepo = AppDataSource.getRepository(SplitInvoice);
    const invoiceRepo = AppDataSource.getRepository(Invoice);
    const jobRepo = AppDataSource.getRepository(Job);
    const tenantRepo = AppDataSource.getRepository(Tenant);
    const customerRepo = AppDataSource.getRepository(Customer);

    const splitInvoice = await splitRepo.findOne({
      where: { id: splitInvoiceId, tenantId, isDeleted: false },
    });
    if (!splitInvoice) {
      throw new NotFoundError('Split invoice not found');
    }

    if (splitInvoice.linkedInvoiceId) {
      const linkedInvoice = await invoiceRepo.findOne({
        where: { id: splitInvoice.linkedInvoiceId, tenantId, isDeleted: false },
      });
      if (linkedInvoice) {
        throw new BadRequestError('This split billing line is already linked to an invoice.');
      }
      splitInvoice.linkedInvoiceId = undefined;
    }

    const tenant = await tenantRepo.findOne({ where: { id: tenantId, isDeleted: false } });
    if (!tenant) {
      throw new NotFoundError('Tenant not found');
    }

    const job = await jobRepo.findOne({ where: { id: splitInvoice.jobId, tenantId, isDeleted: false } });
    if (!job) {
      throw new NotFoundError('Linked job not found');
    }
    if (!job.customerId) {
      throw new BadRequestError('Linked job is missing customer context.');
    }

    const customer = await customerRepo.findOne({
      where: { id: job.customerId, tenantId, isDeleted: false },
    });
    if (!customer) {
      throw new BadRequestError('Customer not found for this split billing line.');
    }

    const invoice = invoiceRepo.create({
      tenantId,
      customerId: customer.id,
      siteId: job.siteId,
      jobId: job.id,
      sourceSplitInvoiceId: splitInvoice.id,
      title:
        normalizeOptionalString(req.body?.title) ??
        `${job.title} • ${normalizeOptionalString(splitInvoice.description) ?? 'Split Billing'}`,
      lineItems: [
        {
          description: normalizeOptionalString(splitInvoice.description) ?? `${job.title} split billing line`,
          quantity: 1,
          unitPrice: Number(splitInvoice.valueExVat ?? 0),
          vatRate:
            Number.isFinite(Number(req.body?.vatRate)) && Number(req.body?.vatRate) >= 0
              ? Number(req.body.vatRate)
              : 20,
        },
      ],
      invoiceNumber: await reserveDocumentNumber(tenantId, 'invoice'),
      status: InvoiceStatus.DRAFT,
      vatNumber: normalizeOptionalString(req.body?.vatNumber) ?? tenant.vatNumber ?? undefined,
      dueDate:
        normalizeOptionalString(req.body?.dueDate) ??
        new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
    }) as Invoice;
    calculateInvoiceTotals(invoice);
    invoice.isMtdCompliant = computeMtdCompliance(invoice, tenant);
    await invoiceRepo.save(invoice);
    await syncSplitInvoiceFromInvoice(invoice);
    await createJobActivity({
      tenantId,
      jobId: job.id,
      userId: req.userId,
      type: 'Invoice Created',
      message: `Invoice ${invoice.invoiceNumber ?? invoice.id} created from split billing.`,
      metadata: { invoiceId: invoice.id, splitInvoiceId: splitInvoice.id, total: Number(invoice.total ?? 0) },
    });

    let accountingSync: unknown = null;
    if (req.body?.sendNow === true) {
      accountingSync = await sendInvoiceForTenant(tenantId, invoice, tenant);
    }

    res.deliver(
      201,
      true,
      {
        ...(await toInvoiceResponse(invoice)),
        accountingSync,
      },
      req.body?.sendNow === true
        ? 'Invoice created and sent from split billing line'
        : 'Invoice created from split billing line',
    );
  } catch (error) {
    next(error);
  }
};

export const sendInvoice = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = getTenantId(req);
    const repo = AppDataSource.getRepository(Invoice);
    const tenantRepo = AppDataSource.getRepository(Tenant);
    const invoice = await repo.findOne({ where: { id: req.params.id, tenantId, isDeleted: false } });
    if (!invoice) {
      throw new NotFoundError('Invoice not found');
    }
    const tenant = await tenantRepo.findOne({ where: { id: tenantId, isDeleted: false } });
    if (!tenant) {
      throw new NotFoundError('Tenant not found');
    }
    const result = await sendInvoiceForTenant(tenantId, invoice, tenant, {
      sendEmail: req.body?.sendEmail !== false,
      markAsSent: req.body?.markAsSent !== false,
      email: normalizeOptionalString(req.body?.email),
      message: normalizeOptionalString(req.body?.message),
    });
    res.deliver(
      200,
      true,
      { ...(await toInvoiceResponse(invoice)), ...result },
      req.body?.sendEmail === false ? 'Invoice sharing link prepared' : 'Invoice sent',
    );
  } catch (error) {
    next(error);
  }
};

export const markInvoicePaid = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = getTenantId(req);
    const repo = AppDataSource.getRepository(Invoice);
    const invoice = await repo.findOne({ where: { id: req.params.id, tenantId, isDeleted: false } });
    if (!invoice) {
      throw new NotFoundError('Invoice not found');
    }
    calculateInvoiceTotals(invoice);
    const totals = getInvoicePaymentTotals(invoice);
    const remaining = Number((Number(invoice.total ?? 0) - totals.amountPaid).toFixed(2));
    if (remaining > 0) {
      invoice.payments = [
        ...normalizeInvoicePayments(invoice),
        {
          id: randomUUID(),
          amount: remaining,
          paymentDate: new Date().toISOString().slice(0, 10),
          method: 'Manual',
          notes: 'Marked paid in full',
          recordedAt: new Date().toISOString(),
          recordedByUserId: req.userId,
        },
      ];
    }
    await applyInvoicePaymentStatus(tenantId, invoice);
    await repo.save(invoice);
    await syncSplitInvoiceFromInvoice(invoice);
    await markAccountingInvoicePaid(tenantId, invoice);
    if (invoice.jobId) {
      await createJobActivity({
        tenantId,
        jobId: invoice.jobId,
        userId: req.userId,
        type: 'Invoice Paid',
        message: `Invoice ${invoice.invoiceNumber ?? invoice.id} marked as paid.`,
        metadata: { invoiceId: invoice.id, amount: Number(invoice.total ?? 0) },
      });
    }

    // Notify admins of invoice payment
    const customerRepo = AppDataSource.getRepository(Customer);
    const customer = await customerRepo.findOne({ where: { id: invoice.customerId, tenantId, isDeleted: false } });
    notifyAdmins({
      tenantId,
      title: 'Invoice Paid',
      message: `Invoice "${invoice.title}" (${invoice.invoiceNumber}) for ${customer?.name || 'Customer'} has been marked as PAID.`,
      targetUrl: `/admin/finance/${invoice.id}`,
    }).catch(err => console.error('Invoice notification failed:', err));

    res.deliver(200, true, await toInvoiceResponse(invoice), 'Invoice marked paid');
  } catch (error) {
    next(error);
  }
};

export const recordInvoicePayment = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = getTenantId(req);
    const repo = AppDataSource.getRepository(Invoice);
    const invoice = await repo.findOne({ where: { id: req.params.id, tenantId, isDeleted: false } });
    if (!invoice) {
      throw new NotFoundError('Invoice not found');
    }
    calculateInvoiceTotals(invoice);
    const amount = Number(req.body.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new BadRequestError('Payment amount must be greater than 0');
    }
    const { balanceDue } = getInvoicePaymentTotals(invoice);
    if (amount > balanceDue) {
      throw new BadRequestError('Payment amount cannot be greater than the balance due');
    }
    const paymentDate = req.body.paymentDate ? new Date(req.body.paymentDate) : new Date();
    if (Number.isNaN(paymentDate.getTime())) {
      throw new BadRequestError('Invalid payment date');
    }
    invoice.payments = [
      ...normalizeInvoicePayments(invoice),
      {
        id: randomUUID(),
        amount: Number(amount.toFixed(2)),
        paymentDate: paymentDate.toISOString().slice(0, 10),
        method: normalizeOptionalString(req.body.method),
        reference: normalizeOptionalString(req.body.reference),
        notes: normalizeOptionalString(req.body.notes),
        recordedAt: new Date().toISOString(),
        recordedByUserId: req.userId,
      },
    ];
    await applyInvoicePaymentStatus(tenantId, invoice);
    await repo.save(invoice);
    await syncSplitInvoiceFromInvoice(invoice);
    if (invoice.status === InvoiceStatus.PAID) {
      await markAccountingInvoicePaid(tenantId, invoice);
    }
    if (invoice.jobId) {
      await createJobActivity({
        tenantId,
        jobId: invoice.jobId,
        userId: req.userId,
        type: 'Payment Recorded',
        message: `Payment of ${amount.toFixed(2)} recorded for invoice ${invoice.invoiceNumber ?? invoice.id}.`,
        metadata: { invoiceId: invoice.id, amount },
      });
    }
    res.deliver(201, true, await toInvoiceResponse(invoice), 'Invoice payment recorded');
  } catch (error) {
    next(error);
  }
};

export const updateInvoicePayment = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = getTenantId(req);
    const repo = AppDataSource.getRepository(Invoice);
    const invoice = await repo.findOne({ where: { id: req.params.id, tenantId, isDeleted: false } });
    if (!invoice) {
      throw new NotFoundError('Invoice not found');
    }
    calculateInvoiceTotals(invoice);
    const payments = normalizeInvoicePayments(invoice);
    const paymentIndex = payments.findIndex((payment) => payment.id === req.params.paymentId);
    if (paymentIndex < 0) {
      throw new NotFoundError('Payment not found');
    }
    const amount = Number(req.body.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new BadRequestError('Payment amount must be greater than 0');
    }
    const otherPaymentsTotal = payments.reduce(
      (sum, payment, index) => sum + (index === paymentIndex ? 0 : Number(payment.amount ?? 0)),
      0,
    );
    const maxAllowed = Number((Number(invoice.total ?? 0) - otherPaymentsTotal).toFixed(2));
    if (amount > maxAllowed) {
      throw new BadRequestError('Payment amount cannot be greater than the remaining balance');
    }
    const paymentDate = req.body.paymentDate ? new Date(req.body.paymentDate) : new Date();
    if (Number.isNaN(paymentDate.getTime())) {
      throw new BadRequestError('Invalid payment date');
    }
    payments[paymentIndex] = {
      ...payments[paymentIndex],
      amount: Number(amount.toFixed(2)),
      paymentDate: paymentDate.toISOString().slice(0, 10),
      method: normalizeOptionalString(req.body.method),
      reference: normalizeOptionalString(req.body.reference),
      notes: normalizeOptionalString(req.body.notes),
    };
    invoice.payments = payments;
    await applyInvoicePaymentStatus(tenantId, invoice);
    await repo.save(invoice);
    await syncSplitInvoiceFromInvoice(invoice);
    if (invoice.status === InvoiceStatus.PAID) {
      await markAccountingInvoicePaid(tenantId, invoice);
    }
    if (invoice.jobId) {
      await createJobActivity({
        tenantId,
        jobId: invoice.jobId,
        userId: req.userId,
        type: 'Payment Updated',
        message: `Payment of ${amount.toFixed(2)} updated for invoice ${invoice.invoiceNumber ?? invoice.id}.`,
        metadata: { invoiceId: invoice.id, paymentId: req.params.paymentId, amount },
      });
    }
    res.deliver(200, true, await toInvoiceResponse(invoice), 'Invoice payment updated');
  } catch (error) {
    next(error);
  }
};

export const deleteInvoicePayment = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = getTenantId(req);
    const repo = AppDataSource.getRepository(Invoice);
    const invoice = await repo.findOne({ where: { id: req.params.id, tenantId, isDeleted: false } });
    if (!invoice) {
      throw new NotFoundError('Invoice not found');
    }
    calculateInvoiceTotals(invoice);
    const payments = normalizeInvoicePayments(invoice);
    const payment = payments.find((entry) => entry.id === req.params.paymentId);
    if (!payment) {
      throw new NotFoundError('Payment not found');
    }
    invoice.payments = payments.filter((entry) => entry.id !== req.params.paymentId);
    await applyInvoicePaymentStatus(tenantId, invoice);
    await repo.save(invoice);
    await syncSplitInvoiceFromInvoice(invoice);
    if (invoice.jobId) {
      await createJobActivity({
        tenantId,
        jobId: invoice.jobId,
        userId: req.userId,
        type: 'Payment Deleted',
        message: `Payment of ${Number(payment.amount ?? 0).toFixed(2)} deleted from invoice ${invoice.invoiceNumber ?? invoice.id}.`,
        metadata: { invoiceId: invoice.id, paymentId: req.params.paymentId, amount: Number(payment.amount ?? 0) },
      });
    }
    res.deliver(200, true, await toInvoiceResponse(invoice), 'Invoice payment deleted');
  } catch (error) {
    next(error);
  }
};

export const syncAccountingStatuses = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = getTenantId(req);
    const queued = await enqueueInvoiceAccountingSync({
      tenantId,
      requestedBy: req.userId,
    });
    if (!queued) {
      throw new BadRequestError('Unable to queue accounting sync right now');
    }
    res.deliver(202, true, { queued: true }, 'Accounting sync queued');
  } catch (error) {
    next(error);
  }
};

export const downloadInvoicePdf = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = getTenantId(req);
    const invoiceRepo = AppDataSource.getRepository(Invoice);
    const tenantRepo = AppDataSource.getRepository(Tenant);
    const invoice = await invoiceRepo.findOne({ where: { id: req.params.id, tenantId, isDeleted: false } });
    if (!invoice) {
      throw new NotFoundError('Invoice not found');
    }
    if (!invoice.invoiceNumber) {
      await ensureInvoiceNumber(invoice);
    }
    const tenant = await tenantRepo.findOne({ where: { id: tenantId, isDeleted: false } });
    if (!tenant) {
      throw new NotFoundError('Tenant not found');
    }
    const customer = invoice.customerId
      ? await AppDataSource.getRepository(Customer).findOne({
          where: { id: invoice.customerId, tenantId, isDeleted: false },
        })
      : null;
    const pdf = await buildInvoicePdf(invoice, tenant, customer);
    res.setHeader('Content-Type', 'application/pdf');
    const filenameRef = invoice.invoiceNumber ?? invoice.id;
    res.setHeader('Content-Disposition', `inline; filename=invoice-${filenameRef}.pdf`);
    res.status(200).send(pdf);
  } catch (error) {
    next(error);
  }
};

export const exportInvoicesCsv = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = getTenantId(req);
    const repo = AppDataSource.getRepository(Invoice);
    const invoices = await repo.find({ where: { tenantId, isDeleted: false } });
    await Promise.all(
      invoices.map(async (invoice) => {
        if (!invoice.invoiceNumber) {
          await ensureInvoiceNumber(invoice);
        }
      }),
    );
    const headers = [
      'id',
      'invoiceNumber',
      'title',
      'status',
      'jobId',
      'siteId',
      'sourceQuoteId',
      'subTotal',
      'vatTotal',
      'total',
      'dueDate',
      'sentAt',
      'viewedAt',
      'paidAt',
    ];
    const rows = invoices.map((invoice) => [
      invoice.id,
      invoice.invoiceNumber ?? '',
      invoice.title,
      invoice.status,
      invoice.jobId ?? '',
      invoice.siteId ?? '',
      invoice.sourceQuoteId ?? '',
      invoice.subTotal,
      invoice.vatTotal,
      invoice.total,
      invoice.dueDate ?? '',
      invoice.sentAt ? invoice.sentAt.toISOString() : '',
      invoice.viewedAt ? invoice.viewedAt.toISOString() : '',
      invoice.paidAt ? invoice.paidAt.toISOString() : ''
    ]);
    const csv = [headers, ...rows]
      .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      .join('\\n');
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=invoices.csv');
    res.status(200).send(csv);
  } catch (error) {
    next(error);
  }
};

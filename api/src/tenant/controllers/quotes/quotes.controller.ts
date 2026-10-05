import { Request, Response, NextFunction } from 'express';
import { AppDataSource } from '../../../config/data-source';
import { Quote } from '../../../entities/quote.entity';
import { Tenant } from '../../../entities/tenant.entity';
import { getTenantId } from '../../../utils/request';
import { BadRequestError, NotFoundError } from '../../../utils/errors';
import { QuoteStatus } from '../../../constants/status';
import { buildQuotePdf } from '../../../services/quotes.service';
import crypto from 'crypto';
import { Customer } from '../../../entities/customer.entity';
import { Lead } from '../../../entities/lead.entity';
import { LeadActivity } from '../../../entities/lead-activity.entity';
import { sendQuoteEmail } from '../../../services/notifications.service';
import { Invoice } from '../../../entities/invoice.entity';
import { RenewalOpportunity } from '../../../entities/renewal-opportunity.entity';
import { calculateInvoiceTotals } from '../../../services/invoices.service';
import { InvoiceStatus } from '../../../constants/status';
import { LeadStatus } from '../../../constants/status';
import { ensureQuoteNumber, reserveDocumentNumber } from '../../../services/document-number.service';
import { expireQuoteIfNeeded, isQuoteExpired } from '../../../services/quote-expiry.service';
import { notifyAdmins } from '../../../services/in-app-notifications.service';
import {
  buildCustomerSiteAddress,
  ensureCustomerSiteForTenant,
} from '../../../services/customer-sites.service';
import { resolveTenantAppUrl } from '../../../utils/tenant-url';
import { assertTenantFeatureEnabled } from '../../../services/tenant-features.service';
import { normalizeTenantFeatureFlags } from '../../../services/tenant-features.service';
import {
  getWorkflowDisplayState,
  loadTenantWorkflowConfig,
  resolveWorkflowStageKeyForRecord,
  TenantWorkflowConfig,
} from '../../../services/workflow-config.service';


const buildPublicQuoteUrl = (tenantId: string, publicToken: string) =>
  resolveTenantAppUrl(tenantId, `/quote/${encodeURIComponent(publicToken)}`);

const getQuoteRecipient = async (quote: Quote) => {
  const customerRepo = AppDataSource.getRepository(Customer);
  const leadRepo = AppDataSource.getRepository(Lead);
  const customer =
    quote.customerId
      ? await customerRepo.findOne({
          where: { id: quote.customerId, tenantId: quote.tenantId, isDeleted: false },
        })
      : null;
  const lead =
    quote.leadId
      ? await leadRepo.findOne({
          where: { id: quote.leadId, tenantId: quote.tenantId, isDeleted: false },
        })
      : null;

  const email = quote.recipientEmail ?? customer?.email ?? lead?.email ?? '';
  const name = quote.recipientName ?? customer?.name ?? lead?.name ?? 'Customer';
  const phone = quote.recipientPhone ?? customer?.phone ?? lead?.phone ?? '';

  return { customer, lead, email, name, phone };
};

const toQuoteResponse = async (quote: Quote) => {
  const workflowEnabled = await isWorkflowOverlayEnabled(quote.tenantId);
  const workflowConfig = workflowEnabled ? await loadTenantWorkflowConfig(quote.tenantId) : null;
  return toQuoteResponseWithWorkflow(quote, { workflowEnabled, workflowConfig });
};

const toQuoteResponseWithWorkflow = async (
  quote: Quote,
  workflowContext?: { workflowEnabled: boolean; workflowConfig: TenantWorkflowConfig | null },
) => {
  const recipient = await getQuoteRecipient(quote);
  const site = quote.siteId
    ? await ensureCustomerSiteForTenant(quote.tenantId, quote.siteId).catch(() => null)
    : null;
  const workflowDisplay = getWorkflowDisplayState({
    config: workflowContext?.workflowConfig ?? (await loadTenantWorkflowConfig(quote.tenantId)),
    module: 'quotes',
    baseStatus: quote.status,
    workflowStageKey: quote.workflowStageKey,
    enabled: workflowContext?.workflowEnabled ?? (await isWorkflowOverlayEnabled(quote.tenantId)),
  });
  return {
    ...quote,
    customerName: recipient.name,
    customerEmail: recipient.email,
    customerPhone: recipient.phone || null,
    siteName: site?.name ?? null,
    siteReference: site?.reference ?? null,
    siteAddress: buildCustomerSiteAddress(site) ?? null,
    ...workflowDisplay,
  };
};

const normalizeOptionalString = (value: unknown) => {
  if (typeof value !== 'string') {
    return undefined;
  }
  const nextValue = value.trim();
  return nextValue.length > 0 ? nextValue : undefined;
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

export const listQuotes = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = getTenantId(req);
    const repo = AppDataSource.getRepository(Quote);
    const quotes = await repo.find({ where: { tenantId, isDeleted: false } });
    const repoNow = new Date();
    await Promise.all(
      quotes.map(async (quote) => {
        await expireQuoteIfNeeded(repo, quote, repoNow);
        if (!quote.quoteNumber) {
          await ensureQuoteNumber(quote);
        }
      }),
    );
    const workflowEnabled = await isWorkflowOverlayEnabled(tenantId);
    const workflowConfig = workflowEnabled ? await loadTenantWorkflowConfig(tenantId) : null;
    const enriched = await Promise.all(
      quotes.map((quote) => toQuoteResponseWithWorkflow(quote, { workflowEnabled, workflowConfig })),
    );
    res.deliver(200, true, enriched, 'Quotes fetched');
  } catch (error) {
    next(error);
  }
};

export const getQuote = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = getTenantId(req);
    const repo = AppDataSource.getRepository(Quote);
    const quote = await repo.findOne({ where: { id: req.params.id, tenantId, isDeleted: false } });
    if (!quote) {
      throw new NotFoundError('Quote not found');
    }
    await expireQuoteIfNeeded(repo, quote);
    if (!quote.quoteNumber) {
      await ensureQuoteNumber(quote);
    }
    res.deliver(200, true, await toQuoteResponse(quote), 'Quote fetched');
  } catch (error) {
    next(error);
  }
};

export const createQuote = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = getTenantId(req);
    const repo = AppDataSource.getRepository(Quote);
    const customerRepo = AppDataSource.getRepository(Customer);
    let recipientName = req.body.recipientName;
    let recipientEmail = req.body.recipientEmail;
    let recipientPhone = req.body.recipientPhone;
    const customerId = normalizeOptionalString(req.body.customerId);
    let customer: Customer | null = null;
    if (customerId) {
      customer = await customerRepo.findOne({
        where: { id: customerId, tenantId, isDeleted: false },
      });
      if (!customer) {
        throw new BadRequestError('Selected customer not found.');
      }
      recipientName = recipientName ?? customer.name;
      recipientEmail = recipientEmail ?? customer.email;
      recipientPhone = recipientPhone ?? customer.phone;
    }
    const siteId = normalizeOptionalString(req.body.siteId);
    if (siteId) {
      await assertTenantFeatureEnabled(tenantId, 'sites', 'Sites module is not enabled for this workspace.');
      if (!customer) {
        throw new BadRequestError('Select a customer before linking a site to the quote.');
      }
      const site = await ensureCustomerSiteForTenant(tenantId, siteId);
      if (site.customerId !== customer.id) {
        throw new BadRequestError('Selected site does not belong to the chosen customer.');
      }
    }
    const quoteNumber = await reserveDocumentNumber(tenantId, 'quote');
    const quote = repo.create({
      ...req.body,
      tenantId,
      customerId,
      siteId,
      recipientName,
      recipientEmail,
      recipientPhone,
      quoteNumber,
      status: QuoteStatus.DRAFT
    } as Partial<Quote>);
    quote.workflowStageKey = await resolveWorkflowStageKeyForRecord({
      tenantId,
      module: 'quotes',
      baseStatus: quote.status,
      requestedStageKey: normalizeOptionalString(req.body.workflowStageKey),
      featureEnabled: await isWorkflowOverlayEnabled(tenantId),
    });
    await repo.save(quote);
    res.deliver(201, true, await toQuoteResponse(quote), 'Quote created');
  } catch (error) {
    next(error);
  }
};

export const updateQuote = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = getTenantId(req);
    const repo = AppDataSource.getRepository(Quote);
    const customerRepo = AppDataSource.getRepository(Customer);
    const leadRepo = AppDataSource.getRepository(Lead);
    const leadActivityRepo = AppDataSource.getRepository(LeadActivity);
    const quote = await repo.findOne({ where: { id: req.params.id, tenantId, isDeleted: false } });
    if (!quote) {
      throw new NotFoundError('Quote not found');
    }
    await expireQuoteIfNeeded(repo, quote);
    if (isQuoteExpired(quote) && String(req.body?.status ?? '').toUpperCase() === QuoteStatus.SIGNED) {
      throw new BadRequestError('Quote has expired and can no longer be accepted.');
    }
    const previousStatus = quote.status;
    const previousCustomerId = quote.customerId;
    Object.assign(quote, req.body);
    const customerId =
      typeof req.body.customerId === 'string' ? normalizeOptionalString(req.body.customerId) : quote.customerId;
    let customer: Customer | null = null;
    if (customerId) {
      customer = await customerRepo.findOne({
        where: { id: customerId, tenantId, isDeleted: false },
      });
      if (!customer) {
        throw new BadRequestError('Selected customer not found.');
      }
      quote.customerId = customer.id;
      quote.recipientName = quote.recipientName ?? customer.name;
      quote.recipientEmail = quote.recipientEmail ?? customer.email;
      quote.recipientPhone = quote.recipientPhone ?? customer.phone;
    } else if (typeof req.body.customerId === 'string') {
      quote.customerId = undefined;
      quote.siteId = undefined;
    }

    if (
      typeof req.body.customerId === 'string' &&
      previousCustomerId !== quote.customerId &&
      typeof req.body.siteId !== 'string'
    ) {
      quote.siteId = undefined;
    }

    if (typeof req.body.siteId === 'string') {
      const siteId = normalizeOptionalString(req.body.siteId);
      if (!siteId) {
        quote.siteId = undefined;
      } else {
        await assertTenantFeatureEnabled(tenantId, 'sites', 'Sites module is not enabled for this workspace.');
        if (!quote.customerId) {
          throw new BadRequestError('Select a customer before linking a site to the quote.');
        }
        const site = await ensureCustomerSiteForTenant(tenantId, siteId);
        if (site.customerId !== quote.customerId) {
          throw new BadRequestError('Selected site does not belong to the chosen customer.');
        }
        quote.siteId = site.id;
      }
    }
    quote.workflowStageKey = await resolveWorkflowStageKeyForRecord({
      tenantId,
      module: 'quotes',
      baseStatus: quote.status,
      requestedStageKey:
        typeof req.body.workflowStageKey === 'string' ? normalizeOptionalString(req.body.workflowStageKey) : undefined,
      currentStageKey: quote.workflowStageKey,
      featureEnabled: await isWorkflowOverlayEnabled(tenantId),
    });
    await repo.save(quote);

    const movedToSigned =
      quote.status === QuoteStatus.SIGNED && previousStatus !== QuoteStatus.SIGNED && quote.leadId;
    if (movedToSigned && quote.leadId) {
      const lead = await leadRepo.findOne({
        where: { id: quote.leadId, tenantId, isDeleted: false },
      });
      if (lead && lead.status !== LeadStatus.CONVERTED) {
        const previousLeadStatus = lead.status;
        lead.status = LeadStatus.CONVERTED;
        await leadRepo.save(lead);
        await leadActivityRepo.save(
          leadActivityRepo.create({
            leadId: lead.id,
            tenantId,
            userId: req.userId,
            type: 'Quote Accepted',
            message: `Quote "${quote.title}" accepted. Lead marked as Won.`,
            metadata: {
              quoteId: quote.id,
              quoteStatus: quote.status,
              from: previousLeadStatus,
              to: LeadStatus.CONVERTED,
            },
          }),
        );
      }
    }

    if (quote.status !== previousStatus) {
      // Notify admins of status change
      notifyAdmins({
        tenantId,
        title: 'Quote Status Updated',
        message: `Quote ${quote.quoteNumber} status manually changed from ${previousStatus} to ${quote.status} by ${req.userId ? 'Admin' : 'System'}.`,
        targetUrl: `/admin/quotes/${quote.id}`,
      }).catch(err => console.error('Quote status notification failed:', err));
    }
    res.deliver(200, true, await toQuoteResponse(quote), 'Quote updated');
  } catch (error) {
    next(error);
  }
};

export const deleteQuote = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = getTenantId(req);
    const repo = AppDataSource.getRepository(Quote);
    const quote = await repo.findOne({ where: { id: req.params.id, tenantId, isDeleted: false } });
    if (!quote) {
      throw new NotFoundError('Quote not found');
    }
    if (quote.status === QuoteStatus.SIGNED) {
      throw new BadRequestError('Accepted quotes cannot be deleted.');
    }
    quote.isDeleted = true;
    await repo.save(quote);
    await AppDataSource.getRepository(RenewalOpportunity).update(
      { tenantId, quoteId: quote.id, isDeleted: false },
      { quoteId: undefined },
    );
    res.deliver(200, true, quote, 'Quote removed');
  } catch (error) {
    next(error);
  }
};

export const sendQuote = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = getTenantId(req);
    const repo = AppDataSource.getRepository(Quote);
    const sendEmail = req.body?.sendEmail !== false;
    const markAsSent = req.body?.markAsSent !== false;
    const requestedEmail = normalizeOptionalString(req.body?.email);
    const message = normalizeOptionalString(req.body?.message);
    const quote = await repo.findOne({ where: { id: req.params.id, tenantId, isDeleted: false } });
    if (!quote) {
      throw new NotFoundError('Quote not found');
    }
    await expireQuoteIfNeeded(repo, quote);
    if (isQuoteExpired(quote)) {
      throw new BadRequestError('Quote has expired. Update valid until date before sending.');
    }
    if (!quote.quoteNumber) {
      quote.quoteNumber = await reserveDocumentNumber(tenantId, 'quote');
    }
    if (!quote.publicToken) {
      quote.publicToken = crypto.randomBytes(16).toString('hex');
    }
    if (markAsSent) {
      quote.status = QuoteStatus.SENT;
      quote.sentAt = new Date();
      quote.workflowStageKey = await resolveWorkflowStageKeyForRecord({
        tenantId,
        module: 'quotes',
        baseStatus: quote.status,
        currentStageKey: quote.workflowStageKey,
        featureEnabled: await isWorkflowOverlayEnabled(tenantId),
      });
    }
    await repo.save(quote);
    const recipient = await getQuoteRecipient(quote);
    const targetEmail = requestedEmail ?? recipient.email;
    if (sendEmail && targetEmail) {
      quote.recipientName = quote.recipientName ?? recipient.name;
      quote.recipientEmail = targetEmail;
      quote.recipientPhone = quote.recipientPhone ?? recipient.phone;
      await repo.save(quote);
      const link = await buildPublicQuoteUrl(tenantId, quote.publicToken as string);
      await sendQuoteEmail(
        targetEmail,
        link,
        {
          customerName: recipient.name,
          quoteTitle: quote.title,
          message,
        },
        { tenantId },
      );
    } else if (sendEmail) {
      throw new BadRequestError('Recipient email is missing for this quote.');
    }
    const response = await toQuoteResponse(quote);
    const publicLink = await buildPublicQuoteUrl(tenantId, quote.publicToken as string);
    res.deliver(
      200,
      true,
      {
        ...response,
        publicLink,
      },
      sendEmail ? 'Quote sent' : 'Quote link created',
    );
  } catch (error) {
    next(error);
  }
};

export const downloadQuotePdf = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = getTenantId(req);
    const quoteRepo = AppDataSource.getRepository(Quote);
    const tenantRepo = AppDataSource.getRepository(Tenant);
    const customerRepo = AppDataSource.getRepository(Customer);
    const quote = await quoteRepo.findOne({ where: { id: req.params.id, tenantId, isDeleted: false } });
    if (!quote) {
      throw new NotFoundError('Quote not found');
    }
    if (!quote.quoteNumber) {
      await ensureQuoteNumber(quote);
    }
    const tenant = await tenantRepo.findOne({ where: { id: tenantId, isDeleted: false } });
    if (!tenant) {
      throw new NotFoundError('Tenant not found');
    }
    const customer = quote.customerId
      ? await customerRepo.findOne({ where: { id: quote.customerId, tenantId, isDeleted: false } })
      : null;
    const pdf = await buildQuotePdf(quote, tenant, customer);
    res.setHeader('Content-Type', 'application/pdf');
    const filenameRef = quote.quoteNumber ?? quote.id;
    res.setHeader('Content-Disposition', `inline; filename=quote-${filenameRef}.pdf`);
    res.status(200).send(pdf);
  } catch (error) {
    next(error);
  }
};

export const convertQuoteToInvoice = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = getTenantId(req);
    const quoteRepo = AppDataSource.getRepository(Quote);
    const invoiceRepo = AppDataSource.getRepository(Invoice);
    const tenantRepo = AppDataSource.getRepository(Tenant);
    const quote = await quoteRepo.findOne({ where: { id: req.params.id, tenantId, isDeleted: false } });
    if (!quote) {
      throw new NotFoundError('Quote not found');
    }
    if (!quote.customerId) {
      throw new BadRequestError(
        'Customer profile is not created yet. Convert lead to job first, then generate invoice.',
      );
    }
    if (!quote.quoteNumber) {
      await ensureQuoteNumber(quote);
    }
    const tenant = await tenantRepo.findOne({ where: { id: tenantId, isDeleted: false } });
    if (!tenant) {
      throw new NotFoundError('Tenant not found');
    }
    const invoice = invoiceRepo.create({
      tenantId,
      customerId: quote.customerId,
      siteId: quote.siteId,
      title: quote.title,
      lineItems: quote.lineItems,
      jobId: quote.jobId,
      sourceQuoteId: quote.id,
      invoiceNumber: await reserveDocumentNumber(tenantId, 'invoice'),
      status: InvoiceStatus.DRAFT,
      vatNumber: req.body.vatNumber ?? tenant.vatNumber ?? undefined,
      dueDate: req.body.dueDate
    }) as Invoice;
    calculateInvoiceTotals(invoice);
    invoice.isMtdCompliant = Boolean(
      invoice.vatNumber &&
      tenant.address &&
      (tenant.tradingName || tenant.name) &&
      invoice.invoiceNumber &&
      Array.isArray(invoice.lineItems) &&
      invoice.lineItems.length > 0,
    );
    await invoiceRepo.save(invoice);
    res.deliver(201, true, invoice, 'Invoice created from quote');
  } catch (error) {
    next(error);
  }
};

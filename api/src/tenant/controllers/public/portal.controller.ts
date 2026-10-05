import { Request, Response, NextFunction } from 'express';
import { AppDataSource } from '../../../config/data-source';
import { Customer } from '../../../entities/customer.entity';
import { CustomerSite } from '../../../entities/customer-site.entity';
import { CustomerSiteContact } from '../../../entities/customer-site-contact.entity';
import { CustomerAccountTenant } from '../../../entities/customer-account-tenant.entity';
import { ComplianceRecord } from '../../../entities/compliance-record.entity';
import { DocumentItem } from '../../../entities/document.entity';
import { Quote } from '../../../entities/quote.entity';
import { Invoice } from '../../../entities/invoice.entity';
import { Job } from '../../../entities/job.entity';
import { Ticket } from '../../../entities/ticket.entity';
import { User } from '../../../entities/user.entity';
import { TicketSenderType } from '../../../constants/tickets';
import { addTicketMessage, listTicketMessages } from '../../../services/tickets.service';
import { BadRequestError, NotFoundError, UnauthorizedError } from '../../../utils/errors';
import { Notification } from '../../../entities/notification.entity';
import { Tenant } from '../../../entities/tenant.entity';
import { buildInvoicePdf } from '../../../services/invoices.service';
import { Account } from '../../../entities/account.entity';
import { hashPassword, verifyPassword } from '../../../utils/password';
import { ensureInvoiceNumber, ensureQuoteNumber, ensureTicketNumber } from '../../../services/document-number.service';
import { resolveStoredFileUrl } from '../../../services/storage/storage.service';
import { InvoiceStatus, TicketStatus } from '../../../constants/status';
import { markAccountingInvoiceViewed } from '../../../services/integrations/accounting-sync.service';
import { notifyAdmins } from '../../../services/in-app-notifications.service';
import { loadTenantFeatureFlags } from '../../../services/tenant-features.service';
import {
  DEFAULT_TENANT_WORKFLOW_CONFIG,
  getWorkflowDisplayState,
  loadTenantWorkflowConfig,
} from '../../../services/workflow-config.service';
import { In, Not } from 'typeorm';

const findCustomerByToken = async (token: string) => {
  const repo = AppDataSource.getRepository(Customer);
  return repo.findOne({ where: { portalToken: token, isDeleted: false } });
};

const getAuthorizedPortalCustomer = async (req: Request) => {
  const accountId = req.customerAccountId;
  if (!accountId) {
    throw new UnauthorizedError('Customer login required');
  }
  const customer = await findCustomerByToken(req.params.token);
  if (!customer || (req.tenantId && customer.tenantId !== req.tenantId)) {
    throw new NotFoundError('Customer not found');
  }
  const linkRepo = AppDataSource.getRepository(CustomerAccountTenant);
  const linked = await linkRepo.findOne({
    where: {
      accountId,
      tenantId: customer.tenantId,
      customerId: customer.id,
    },
  });
  if (!linked) {
    throw new UnauthorizedError('Portal access denied');
  }
  return customer;
};

const buildPortalScopeContext = async (req: Request) => {
  const customer = await getAuthorizedPortalCustomer(req);
  const tenantFeatures = await loadTenantFeatureFlags(customer.tenantId);
  const siteScopedPortalEnabled = Boolean(tenantFeatures.siteScopedPortal);
  const selectedSiteIds =
    siteScopedPortalEnabled && Array.isArray(customer.portalAllowedSiteIds)
      ? customer.portalAllowedSiteIds
          .map((siteId) => (typeof siteId === 'string' ? siteId.trim() : ''))
          .filter(Boolean)
      : [];

  let accessibleSites: CustomerSite[] = [];
  const workflowEnabled = Boolean(tenantFeatures.complianceWorkflows);
  const workflowConfig = workflowEnabled
    ? await loadTenantWorkflowConfig(customer.tenantId)
    : null;
  if (tenantFeatures.sites || siteScopedPortalEnabled) {
    const siteRepo = AppDataSource.getRepository(CustomerSite);
    accessibleSites =
      selectedSiteIds.length > 0
        ? await siteRepo.find({
            where: selectedSiteIds.map((siteId) => ({
              id: siteId,
              tenantId: customer.tenantId,
              customerId: customer.id,
              isDeleted: false,
            })),
            order: { name: 'ASC' },
          })
        : await siteRepo.find({
            where: {
              tenantId: customer.tenantId,
              customerId: customer.id,
              isDeleted: false,
            },
            order: { name: 'ASC' },
          });
  }

  return {
    customer,
    tenantFeatures,
    workflowEnabled,
    workflowConfig,
    siteScopedPortalEnabled,
    selectedSiteIds,
    accessibleSites,
  };
};

const getPortalScopedSiteIds = (
  context: Awaited<ReturnType<typeof buildPortalScopeContext>>,
) => {
  if (!context.siteScopedPortalEnabled || context.selectedSiteIds.length === 0) {
    return null;
  }
  return context.accessibleSites.map((site) => site.id);
};

const buildPortalSitePayload = async (
  context: Awaited<ReturnType<typeof buildPortalScopeContext>>,
  sites: CustomerSite[],
) => {
  const { customer } = context;
  const siteIds = sites.map((site) => site.id);
  if (siteIds.length === 0) return [];

  const [jobs, quotes, invoices, complianceRecords, contacts] = await Promise.all([
    AppDataSource.getRepository(Job).find({
      where: { tenantId: customer.tenantId, customerId: customer.id, siteId: In(siteIds), isDeleted: false },
      order: { createdAt: 'DESC' },
    }),
    AppDataSource.getRepository(Quote).find({
      where: { tenantId: customer.tenantId, customerId: customer.id, siteId: In(siteIds), isDeleted: false },
      order: { createdAt: 'DESC' },
    }),
    AppDataSource.getRepository(Invoice).find({
      where: {
        tenantId: customer.tenantId,
        customerId: customer.id,
        siteId: In(siteIds),
        isDeleted: false,
        status: Not(InvoiceStatus.DRAFT),
      },
      order: { createdAt: 'DESC' },
    }),
    AppDataSource.getRepository(ComplianceRecord).find({
      where: {
        tenantId: customer.tenantId,
        customerId: customer.id,
        siteId: In(siteIds),
        isDeleted: false,
        customerVisible: true,
        reviewStatus: In(['APPROVED', 'EXPIRED']),
      },
      order: { validUntil: 'ASC', testedAt: 'DESC', createdAt: 'DESC' },
    }),
    AppDataSource.getRepository(CustomerSiteContact).find({
      where: { tenantId: customer.tenantId, customerId: customer.id, siteId: In(siteIds), isDeleted: false },
      order: { name: 'ASC' },
    }),
  ]);

  await Promise.all([
    ...quotes.map((quote) => (quote.quoteNumber ? Promise.resolve() : ensureQuoteNumber(quote))),
    ...invoices.map((invoice) => (invoice.invoiceNumber ? Promise.resolve() : ensureInvoiceNumber(invoice))),
  ]);

  const complianceWithContext = await attachCompliancePortalContext(customer, complianceRecords);

  const groupBySite = <T extends { siteId?: string | null }>(records: T[]) =>
    records.reduce((map, record) => {
      if (!record.siteId) return map;
      const list = map.get(record.siteId) ?? [];
      list.push(record);
      map.set(record.siteId, list);
      return map;
    }, new Map<string, T[]>());

  const jobsBySite = groupBySite(jobs);
  const quotesBySite = groupBySite(quotes);
  const invoicesBySite = groupBySite(invoices);
  const complianceBySite = groupBySite(complianceWithContext);
  const contactsBySite = groupBySite(contacts);

  return sites.map((site) => {
    const siteJobs = jobsBySite.get(site.id) ?? [];
    const siteQuotes = quotesBySite.get(site.id) ?? [];
    const siteInvoices = invoicesBySite.get(site.id) ?? [];
    const siteCompliance = complianceBySite.get(site.id) ?? [];
    const siteContacts = contactsBySite.get(site.id) ?? [];
    return {
      ...site,
      siteAddress: buildSiteAddress(site),
      counts: {
        jobs: siteJobs.length,
        openJobs: siteJobs.filter((job) => !['COMPLETED', 'CLOSED', 'CANCELLED'].includes(String(job.status ?? '').toUpperCase())).length,
        quotes: siteQuotes.length,
        invoices: siteInvoices.length,
        complianceRecords: siteCompliance.length,
        contacts: siteContacts.length,
      },
      recentJobs: siteJobs.slice(0, 5).map((job) => ({
        ...job,
        ...getWorkflowDisplayState({
          config: context.workflowConfig ?? DEFAULT_TENANT_WORKFLOW_CONFIG,
          module: 'jobs',
          baseStatus: job.status,
          workflowStageKey: job.workflowStageKey,
          enabled: context.workflowEnabled,
        }),
      })),
      recentQuotes: siteQuotes.slice(0, 5).map((quote) => ({
        ...quote,
        ...getWorkflowDisplayState({
          config: context.workflowConfig ?? DEFAULT_TENANT_WORKFLOW_CONFIG,
          module: 'quotes',
          baseStatus: quote.status,
          workflowStageKey: quote.workflowStageKey,
          enabled: context.workflowEnabled,
        }),
      })),
      recentInvoices: siteInvoices.slice(0, 5).map((invoice) => ({
        ...invoice,
        ...getWorkflowDisplayState({
          config: context.workflowConfig ?? DEFAULT_TENANT_WORKFLOW_CONFIG,
          module: 'invoices',
          baseStatus: invoice.status,
          workflowStageKey: invoice.workflowStageKey,
          enabled: context.workflowEnabled,
        }),
      })),
      complianceRecords: siteCompliance,
      contacts: siteContacts,
    };
  });
};

const buildSiteAddress = (site?: CustomerSite | null) => {
  if (!site) return null;
  const parts = [
    site.addressLine1,
    site.addressLine2,
    site.city,
    site.state,
    site.postalCode,
    site.country,
  ]
    .map((part) => (typeof part === 'string' ? part.trim() : ''))
    .filter(Boolean);

  return parts.length > 0 ? parts.join(', ') : null;
};

const attachPortalSiteContext = async <T extends { siteId?: string | null }>(
  customer: Customer,
  records: T[],
) => {
  const siteIds = Array.from(
    new Set(
      records
        .map((record) => (typeof record.siteId === 'string' ? record.siteId.trim() : ''))
        .filter(Boolean),
    ),
  );

  if (siteIds.length === 0) {
    return records;
  }

  const siteRepo = AppDataSource.getRepository(CustomerSite);
  const sites = await siteRepo.find({
    where: siteIds.map((siteId) => ({
      id: siteId,
      tenantId: customer.tenantId,
      customerId: customer.id,
      isDeleted: false,
    })),
  });
  const siteMap = new Map(sites.map((site) => [site.id, site]));

  return records.map((record) => {
    const site = record.siteId ? siteMap.get(record.siteId) ?? null : null;
    return {
      ...record,
      siteName: site?.name ?? null,
      siteReference: site?.reference ?? null,
      siteCategory: site?.category ?? null,
      siteAddress: buildSiteAddress(site),
    };
  });
};

const attachCompliancePortalContext = async (
  customer: Customer,
  records: ComplianceRecord[],
) => {
  const recordsWithSiteContext = await attachPortalSiteContext(customer, records);
  const reviewerIds = Array.from(
    new Set(
      records
        .map((record) => (typeof record.reviewerUserId === 'string' ? record.reviewerUserId : ''))
        .filter(Boolean),
    ),
  );
  const documentIds = Array.from(
    new Set(
      records
        .map((record) => (typeof record.documentId === 'string' ? record.documentId : ''))
        .filter(Boolean),
    ),
  );

  const [reviewers, documents] = await Promise.all([
    reviewerIds.length > 0
      ? AppDataSource.getRepository(User).find({
          where: reviewerIds.map((id) => ({ id, isDeleted: false })),
        })
      : Promise.resolve([] as User[]),
    documentIds.length > 0
      ? AppDataSource.getRepository(DocumentItem).find({
          where: documentIds.map((id) => ({ id, isDeleted: false })),
        })
      : Promise.resolve([] as DocumentItem[]),
  ]);

  const reviewerMap = new Map(reviewers.map((reviewer) => [reviewer.id, reviewer.fullName]));
  const documentMap = new Map(
    documents.map((document) => [
      document.id,
      {
        name: document.name,
        fileUrl: resolveStoredFileUrl(document.fileUrl),
      },
    ]),
  );

  return recordsWithSiteContext.map((record) => ({
    ...record,
    reviewerName: record.reviewerUserId
      ? reviewerMap.get(record.reviewerUserId) ?? null
      : null,
    documentName: record.documentId ? documentMap.get(record.documentId)?.name ?? null : null,
    documentFileUrl: record.documentId
      ? documentMap.get(record.documentId)?.fileUrl ?? null
      : null,
  }));
};

export const getPortalOverview = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const context = await buildPortalScopeContext(req);
    const { customer } = context;
    if (!customer) {
      throw new NotFoundError('Customer not found');
    }
    const tenantRepo = AppDataSource.getRepository(Tenant);
    const tenant = await tenantRepo.findOne({ where: { id: customer.tenantId, isDeleted: false } });
    const tenantPayload = tenant
      ? {
          ...tenant,
          logoUrl: resolveStoredFileUrl(tenant.logoUrl),
          emailHeaderLogoUrl: resolveStoredFileUrl(tenant.emailHeaderLogoUrl),
        }
      : tenant;
    res.deliver(
      200,
      true,
      {
        customer,
        tenant: tenantPayload,
        portalScope: {
          siteScoped: context.siteScopedPortalEnabled,
          mode:
            context.siteScopedPortalEnabled && context.selectedSiteIds.length > 0
              ? 'selected-sites'
              : 'all-sites',
          allowedSiteIds: context.selectedSiteIds,
          sites: context.accessibleSites.map((site) => ({
            id: site.id,
            name: site.name,
            reference: site.reference,
            category: site.category,
          })),
        },
        features: {
          sites: Boolean(context.tenantFeatures.sites),
          complianceReports: Boolean(context.tenantFeatures.complianceReports),
          siteScopedPortal: Boolean(context.tenantFeatures.siteScopedPortal),
        },
      },
      'Portal profile',
    );
  } catch (error) {
    next(error);
  }
};

export const listPortalQuotes = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const context = await buildPortalScopeContext(req);
    const { customer } = context;
    if (!customer) {
      throw new NotFoundError('Customer not found');
    }
    const repo = AppDataSource.getRepository(Quote);
    const allowedSiteIds = getPortalScopedSiteIds(context);
    const quotes = await repo.find({
      where: allowedSiteIds
        ? {
            customerId: customer.id,
            tenantId: customer.tenantId,
            isDeleted: false,
            siteId: In(allowedSiteIds),
          }
        : { customerId: customer.id, tenantId: customer.tenantId, isDeleted: false },
    });
    await Promise.all(
      quotes.map(async (quote) => {
        if (!quote.quoteNumber) {
          await ensureQuoteNumber(quote);
        }
      }),
    );
    const payload = (await attachPortalSiteContext(customer, quotes)).map((quote) => ({
      ...quote,
      ...getWorkflowDisplayState({
        config: context.workflowConfig ?? DEFAULT_TENANT_WORKFLOW_CONFIG,
        module: 'quotes',
        baseStatus: quote.status,
        workflowStageKey: quote.workflowStageKey,
        enabled: context.workflowEnabled,
      }),
    }));
    res.deliver(200, true, payload, 'Quotes fetched');
  } catch (error) {
    next(error);
  }
};

export const listPortalInvoices = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const context = await buildPortalScopeContext(req);
    const { customer } = context;
    if (!customer) {
      throw new NotFoundError('Customer not found');
    }
    const repo = AppDataSource.getRepository(Invoice);
    const allowedSiteIds = getPortalScopedSiteIds(context);
    const invoices = await repo.find({
      where: allowedSiteIds
        ? {
            customerId: customer.id,
            tenantId: customer.tenantId,
            isDeleted: false,
            status: Not(InvoiceStatus.DRAFT),
            siteId: In(allowedSiteIds),
          }
        : { customerId: customer.id, tenantId: customer.tenantId, isDeleted: false, status: Not(InvoiceStatus.DRAFT) },
    });
    await Promise.all(
      invoices.map(async (invoice) => {
        if (!invoice.invoiceNumber) {
          await ensureInvoiceNumber(invoice);
        }
      }),
    );
    const now = Date.now();
    const changed = invoices.some(
      (invoice) =>
        [InvoiceStatus.SENT, InvoiceStatus.VIEWED].includes(invoice.status) &&
        invoice.dueDate &&
        new Date(invoice.dueDate).getTime() < now,
    );
    if (changed) {
      invoices.forEach((invoice) => {
        if (
          [InvoiceStatus.SENT, InvoiceStatus.VIEWED].includes(invoice.status) &&
          invoice.dueDate &&
          new Date(invoice.dueDate).getTime() < now
        ) {
          invoice.status = InvoiceStatus.OVERDUE;
        }
      });
      await repo.save(invoices);
    }
    const payload = (await attachPortalSiteContext(customer, invoices)).map((invoice) => ({
      ...invoice,
      ...getWorkflowDisplayState({
        config: context.workflowConfig ?? DEFAULT_TENANT_WORKFLOW_CONFIG,
        module: 'invoices',
        baseStatus: invoice.status,
        workflowStageKey: invoice.workflowStageKey,
        enabled: context.workflowEnabled,
      }),
    }));
    res.deliver(200, true, payload, 'Invoices fetched');
  } catch (error) {
    next(error);
  }
};

export const getPortalInvoice = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const context = await buildPortalScopeContext(req);
    const { customer } = context;
    if (!customer) {
      throw new NotFoundError('Customer not found');
    }
    const allowedSiteIds = getPortalScopedSiteIds(context);
    const repo = AppDataSource.getRepository(Invoice);
    const invoice = await repo.findOne({
      where: {
        id: req.params.id,
        customerId: customer.id,
        tenantId: customer.tenantId,
        isDeleted: false,
        status: Not(InvoiceStatus.DRAFT),
      },
    });
    if (!invoice) {
      throw new NotFoundError('Invoice not found');
    }
    if (allowedSiteIds && (!invoice.siteId || !allowedSiteIds.includes(invoice.siteId))) {
      throw new NotFoundError('Invoice not found');
    }
    if (!invoice.invoiceNumber) {
      await ensureInvoiceNumber(invoice);
    }
    if (invoice.status === InvoiceStatus.SENT) {
      invoice.status = InvoiceStatus.VIEWED;
      invoice.viewedAt = new Date();
      await repo.save(invoice);
      await markAccountingInvoiceViewed(customer.tenantId, invoice);
    }
    const [payload] = (await attachPortalSiteContext(customer, [invoice])).map((record) => ({
      ...record,
      ...getWorkflowDisplayState({
        config: context.workflowConfig ?? DEFAULT_TENANT_WORKFLOW_CONFIG,
        module: 'invoices',
        baseStatus: record.status,
        workflowStageKey: record.workflowStageKey,
        enabled: context.workflowEnabled,
      }),
    }));
    res.deliver(200, true, payload ?? invoice, 'Invoice fetched');
  } catch (error) {
    next(error);
  }
};

export const downloadPortalInvoicePdf = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const context = await buildPortalScopeContext(req);
    const { customer } = context;
    if (!customer) {
      throw new NotFoundError('Customer not found');
    }
    const allowedSiteIds = getPortalScopedSiteIds(context);
    const repo = AppDataSource.getRepository(Invoice);
    const invoice = await repo.findOne({
      where: {
        id: req.params.id,
        customerId: customer.id,
        tenantId: customer.tenantId,
        isDeleted: false,
        status: Not(InvoiceStatus.DRAFT),
      }
    });
    if (!invoice) {
      throw new NotFoundError('Invoice not found');
    }
    if (allowedSiteIds && (!invoice.siteId || !allowedSiteIds.includes(invoice.siteId))) {
      throw new NotFoundError('Invoice not found');
    }
    if (!invoice.invoiceNumber) {
      await ensureInvoiceNumber(invoice);
    }
    if (invoice.status === InvoiceStatus.SENT) {
      invoice.status = InvoiceStatus.VIEWED;
      invoice.viewedAt = new Date();
      await repo.save(invoice);
      await markAccountingInvoiceViewed(customer.tenantId, invoice);
    }
    const tenant = await AppDataSource.getRepository(Tenant).findOne({
      where: { id: customer.tenantId, isDeleted: false }
    });
    if (!tenant) {
      throw new NotFoundError('Tenant not found');
    }
    const pdf = await buildInvoicePdf(invoice, tenant, customer);
    res.setHeader('Content-Type', 'application/pdf');
    const filenameRef = invoice.invoiceNumber ?? invoice.id;
    res.setHeader('Content-Disposition', `inline; filename=invoice-${filenameRef}.pdf`);
    res.status(200).send(pdf);
  } catch (error) {
    next(error);
  }
};

export const listPortalJobs = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const context = await buildPortalScopeContext(req);
    const { customer } = context;
    if (!customer) {
      throw new NotFoundError('Customer not found');
    }
    const repo = AppDataSource.getRepository(Job);
    const allowedSiteIds = getPortalScopedSiteIds(context);
    const jobs = await repo.find({
      where: allowedSiteIds
        ? {
            customerId: customer.id,
            tenantId: customer.tenantId,
            isDeleted: false,
            siteId: In(allowedSiteIds),
          }
        : { customerId: customer.id, tenantId: customer.tenantId, isDeleted: false },
    });
    const payload = (await attachPortalSiteContext(customer, jobs)).map((job) => ({
      ...job,
      ...getWorkflowDisplayState({
        config: context.workflowConfig ?? DEFAULT_TENANT_WORKFLOW_CONFIG,
        module: 'jobs',
        baseStatus: job.status,
        workflowStageKey: job.workflowStageKey,
        enabled: context.workflowEnabled,
      }),
    }));
    res.deliver(200, true, payload, 'Jobs fetched');
  } catch (error) {
    next(error);
  }
};

export const listPortalSites = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const context = await buildPortalScopeContext(req);
    const { customer } = context;
    if (!customer) {
      throw new NotFoundError('Customer not found');
    }
    if (!context.tenantFeatures.sites) {
      res.deliver(200, true, [], 'Sites fetched');
      return;
    }

    const sites =
      context.accessibleSites.length > 0
        ? context.accessibleSites
        : await AppDataSource.getRepository(CustomerSite).find({
            where: { tenantId: customer.tenantId, customerId: customer.id, isDeleted: false },
            order: { name: 'ASC' },
          });

    res.deliver(200, true, await buildPortalSitePayload(context, sites), 'Sites fetched');
  } catch (error) {
    next(error);
  }
};

export const getPortalSite = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const context = await buildPortalScopeContext(req);
    const { customer } = context;
    if (!customer) {
      throw new NotFoundError('Customer not found');
    }
    if (!context.tenantFeatures.sites) {
      throw new NotFoundError('Site not found');
    }

    const allowedSiteIds = getPortalScopedSiteIds(context);
    if (allowedSiteIds && !allowedSiteIds.includes(req.params.id)) {
      throw new NotFoundError('Site not found');
    }

    const site = await AppDataSource.getRepository(CustomerSite).findOne({
      where: {
        id: req.params.id,
        tenantId: customer.tenantId,
        customerId: customer.id,
        isDeleted: false,
      },
    });
    if (!site) {
      throw new NotFoundError('Site not found');
    }

    const [payload] = await buildPortalSitePayload(context, [site]);
    res.deliver(200, true, payload ?? site, 'Site fetched');
  } catch (error) {
    next(error);
  }
};

export const getPortalJob = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const context = await buildPortalScopeContext(req);
    const { customer } = context;
    if (!customer) {
      throw new NotFoundError('Customer not found');
    }
    const allowedSiteIds = getPortalScopedSiteIds(context);
    const repo = AppDataSource.getRepository(Job);
    const job = await repo.findOne({
      where: {
        id: req.params.id,
        customerId: customer.id,
        tenantId: customer.tenantId,
        isDeleted: false,
      },
    });
    if (!job) {
      throw new NotFoundError('Job not found');
    }
    if (allowedSiteIds && (!job.siteId || !allowedSiteIds.includes(job.siteId))) {
      throw new NotFoundError('Job not found');
    }
    const quoteRepo = AppDataSource.getRepository(Quote);
    const invoiceRepo = AppDataSource.getRepository(Invoice);
    const complianceRepo = AppDataSource.getRepository(ComplianceRecord);
    const [relatedQuotes, relatedInvoices, relatedComplianceRecords] = await Promise.all([
      quoteRepo.find({
        where: {
          jobId: job.id,
          customerId: customer.id,
          tenantId: customer.tenantId,
          isDeleted: false,
        },
        order: { createdAt: 'DESC' },
      }),
      invoiceRepo.find({
        where: {
          jobId: job.id,
          customerId: customer.id,
          tenantId: customer.tenantId,
          isDeleted: false,
          status: Not(InvoiceStatus.DRAFT),
        },
        order: { createdAt: 'DESC' },
      }),
      complianceRepo.find({
        where: {
          jobId: job.id,
          customerId: customer.id,
          tenantId: customer.tenantId,
          isDeleted: false,
          customerVisible: true,
          reviewStatus: In(['APPROVED', 'EXPIRED']),
        },
        order: { validUntil: 'ASC', testedAt: 'DESC', createdAt: 'DESC' },
      }),
    ]);
    await Promise.all([
      ...relatedQuotes.map((quote) => (quote.quoteNumber ? Promise.resolve() : ensureQuoteNumber(quote))),
      ...relatedInvoices.map((invoice) => (invoice.invoiceNumber ? Promise.resolve() : ensureInvoiceNumber(invoice))),
    ]);
    const compliancePayload = context.tenantFeatures.complianceReports
      ? await attachCompliancePortalContext(customer, relatedComplianceRecords)
      : [];
    const [payload] = (await attachPortalSiteContext(customer, [job])).map((record) => ({
      ...record,
      relatedQuotes: relatedQuotes.map((quote) => ({
        ...quote,
        ...getWorkflowDisplayState({
          config: context.workflowConfig ?? DEFAULT_TENANT_WORKFLOW_CONFIG,
          module: 'quotes',
          baseStatus: quote.status,
          workflowStageKey: quote.workflowStageKey,
          enabled: context.workflowEnabled,
        }),
      })),
      relatedInvoices: relatedInvoices.map((invoice) => ({
        ...invoice,
        ...getWorkflowDisplayState({
          config: context.workflowConfig ?? DEFAULT_TENANT_WORKFLOW_CONFIG,
          module: 'invoices',
          baseStatus: invoice.status,
          workflowStageKey: invoice.workflowStageKey,
          enabled: context.workflowEnabled,
        }),
      })),
      complianceRecords: compliancePayload,
      ...getWorkflowDisplayState({
        config: context.workflowConfig ?? DEFAULT_TENANT_WORKFLOW_CONFIG,
        module: 'jobs',
        baseStatus: record.status,
        workflowStageKey: record.workflowStageKey,
        enabled: context.workflowEnabled,
      }),
    }));
    res.deliver(200, true, payload ?? job, 'Job fetched');
  } catch (error) {
    next(error);
  }
};

export const listPortalComplianceRecords = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const context = await buildPortalScopeContext(req);
    const { customer } = context;
    if (!customer) {
      throw new NotFoundError('Customer not found');
    }
    if (!context.tenantFeatures.complianceReports) {
      res.deliver(200, true, [], 'Compliance records fetched');
      return;
    }

    const allowedSiteIds = getPortalScopedSiteIds(context);
    const repo = AppDataSource.getRepository(ComplianceRecord);
    const records = await repo.find({
      where: allowedSiteIds
        ? {
            customerId: customer.id,
            tenantId: customer.tenantId,
            isDeleted: false,
            customerVisible: true,
            reviewStatus: In(['APPROVED', 'EXPIRED']),
            siteId: In(allowedSiteIds),
          }
        : {
            customerId: customer.id,
            tenantId: customer.tenantId,
            isDeleted: false,
            customerVisible: true,
            reviewStatus: In(['APPROVED', 'EXPIRED']),
          },
      order: { validUntil: 'ASC', testedAt: 'DESC', createdAt: 'DESC' },
    });

    res.deliver(
      200,
      true,
      await attachCompliancePortalContext(customer, records),
      'Compliance records fetched',
    );
  } catch (error) {
    next(error);
  }
};

export const listPortalTickets = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const customer = await getAuthorizedPortalCustomer(req);
    if (!customer) {
      throw new NotFoundError('Customer not found');
    }
    const repo = AppDataSource.getRepository(Ticket);
    const tickets = await repo.find({ where: { customerId: customer.id, tenantId: customer.tenantId, isDeleted: false } });
    await Promise.all(tickets.map((ticket) => ensureTicketNumber(ticket)));
    const ticketsWithMessages = await Promise.all(
      tickets.map(async (ticket) => ({
        ticket,
        messages: await listTicketMessages(ticket.id, customer.tenantId)
      }))
    );
    res.deliver(200, true, ticketsWithMessages, 'Tickets fetched');
  } catch (error) {
    next(error);
  }
};

export const createPortalTicket = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const customer = await getAuthorizedPortalCustomer(req);
    if (!customer) {
      throw new NotFoundError('Customer not found');
    }
    const repo = AppDataSource.getRepository(Ticket);
    const ticket = repo.create({
      tenantId: customer.tenantId,
      customerId: customer.id,
      subject: req.body.subject,
      message: req.body.message
    });
    await repo.save(ticket);
    await ensureTicketNumber(ticket);
    await addTicketMessage(ticket.id, customer.tenantId, TicketSenderType.CUSTOMER, req.body.message);
    await notifyAdmins({
      tenantId: customer.tenantId,
      title: `New ticket ${ticket.ticketNumber ?? ''}`.trim(),
      message: `${ticket.ticketNumber ?? 'Ticket'} from ${customer.name}: ${ticket.subject}`,
      targetUrl: `/admin/tickets/${ticket.id}`,
    });
    res.deliver(201, true, ticket, 'Ticket created');
  } catch (error) {
    next(error);
  }
};

export const replyPortalTicket = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const customer = await getAuthorizedPortalCustomer(req);
    if (!customer) {
      throw new NotFoundError('Customer not found');
    }
    const repo = AppDataSource.getRepository(Ticket);
    const ticket = await repo.findOne({
      where: { id: req.params.id, tenantId: customer.tenantId, customerId: customer.id, isDeleted: false }
    });
    if (!ticket) {
      throw new NotFoundError('Ticket not found');
    }
    await ensureTicketNumber(ticket);
    await addTicketMessage(ticket.id, customer.tenantId, TicketSenderType.CUSTOMER, req.body.message);
    await notifyAdmins({
      tenantId: customer.tenantId,
      title: `Ticket update ${ticket.ticketNumber ?? ''}`.trim(),
      message: `${ticket.ticketNumber ?? 'Ticket'} from ${customer.name}: ${ticket.subject}`,
      targetUrl: `/admin/tickets/${ticket.id}`,
    });
    res.deliver(200, true, ticket, 'Reply added');
  } catch (error) {
    next(error);
  }
};

export const resolvePortalTicket = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const customer = await getAuthorizedPortalCustomer(req);
    if (!customer) {
      throw new NotFoundError('Customer not found');
    }
    const repo = AppDataSource.getRepository(Ticket);
    const ticket = await repo.findOne({
      where: { id: req.params.id, tenantId: customer.tenantId, customerId: customer.id, isDeleted: false },
    });
    if (!ticket) {
      throw new NotFoundError('Ticket not found');
    }
    await ensureTicketNumber(ticket);
    ticket.status = TicketStatus.RESOLVED;
    await repo.save(ticket);
    await notifyAdmins({
      tenantId: customer.tenantId,
      title: `Ticket resolved ${ticket.ticketNumber ?? ''}`.trim(),
      message: `${ticket.ticketNumber ?? 'Ticket'} resolved by ${customer.name}: ${ticket.subject}`,
      targetUrl: `/admin/tickets/${ticket.id}`,
    });
    res.deliver(200, true, ticket, 'Ticket resolved');
  } catch (error) {
    next(error);
  }
};

export const listPortalNotifications = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const customer = await getAuthorizedPortalCustomer(req);
    if (!customer) {
      throw new NotFoundError('Customer not found');
    }
    const repo = AppDataSource.getRepository(Notification);
    const notifications = await repo.find({
      where: { tenantId: customer.tenantId, customerId: customer.id, isDeleted: false },
      order: { createdAt: 'DESC' }
    });
    res.deliver(200, true, notifications, 'Notifications fetched');
  } catch (error) {
    next(error);
  }
};

export const markPortalNotificationRead = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const customer = await getAuthorizedPortalCustomer(req);
    if (!customer) {
      throw new NotFoundError('Customer not found');
    }
    const repo = AppDataSource.getRepository(Notification);
    const notification = await repo.findOne({
      where: {
        id: req.params.id,
        tenantId: customer.tenantId,
        customerId: customer.id,
        isDeleted: false
      }
    });
    if (!notification) {
      return res.deliver(200, true, null, 'Notification missing');
    }
    notification.readAt = new Date();
    await repo.save(notification);
    res.deliver(200, true, notification, 'Notification read');
  } catch (error) {
    next(error);
  }
};

export const changePortalPassword = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const customer = await getAuthorizedPortalCustomer(req);
    const accountId = req.customerAccountId;
    if (!accountId) {
      throw new UnauthorizedError('Customer login required');
    }
    const accountRepo = AppDataSource.getRepository(Account);
    const account = await accountRepo.findOne({ where: { id: accountId } });
    if (!account) {
      throw new NotFoundError('Account not found');
    }
    if (account.email.toLowerCase() !== customer.email.toLowerCase()) {
      throw new UnauthorizedError('Portal access denied');
    }
    const ok = await verifyPassword(req.body.currentPassword, account.passwordHash);
    if (!ok) {
      throw new BadRequestError('Current password is incorrect');
    }
    account.passwordHash = await hashPassword(req.body.newPassword);
    await accountRepo.save(account);
    res.deliver(200, true, { updated: true }, 'Password updated');
  } catch (error) {
    next(error);
  }
};

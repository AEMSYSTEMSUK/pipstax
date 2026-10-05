import { Request, Response, NextFunction } from 'express';
import { AppDataSource } from '../../../config/data-source';
import { Customer } from '../../../entities/customer.entity';
import { CustomerContact } from '../../../entities/customer-contact.entity';
import { CustomerAccountTenant } from '../../../entities/customer-account-tenant.entity';
import { Account } from '../../../entities/account.entity';
import { CustomerSiteGroup } from '../../../entities/customer-site-group.entity';
import { CustomerSite } from '../../../entities/customer-site.entity';
import { CustomerSiteContact } from '../../../entities/customer-site-contact.entity';
import { ComplianceRecord } from '../../../entities/compliance-record.entity';
import { DocumentItem } from '../../../entities/document.entity';
import { Job } from '../../../entities/job.entity';
import { Invoice } from '../../../entities/invoice.entity';
import { RenewalOpportunity } from '../../../entities/renewal-opportunity.entity';
import { User } from '../../../entities/user.entity';
import { getTenantId } from '../../../utils/request';
import { BadRequestError, NotFoundError } from '../../../utils/errors';
import { resolveStoredFileUrl } from '../../../services/storage/storage.service';
import { serializeRenewalOpportunities } from '../../../services/renewals.service';
import { sendCustomerPortalAccessEmail } from '../../../services/notifications.service';
import { generateTempPassword } from '../../../utils/credentials';
import { hashPassword } from '../../../utils/password';
import { withAuthDetails } from '../../../utils/auth-details';
import { resolveTenantAppUrl } from '../../../utils/tenant-url';
import { JobStatus } from '../../../constants/status';
import crypto from 'crypto';
import { Not } from 'typeorm';

const normalizeOptionalString = (value: unknown) => {
  if (typeof value !== 'string') {
    return undefined;
  }
  const nextValue = value.trim();
  return nextValue.length > 0 ? nextValue : undefined;
};

const normalizeOptionalEmail = (value: unknown) => {
  const nextValue = normalizeOptionalString(value);
  return nextValue ? nextValue.toLowerCase() : undefined;
};

const formatSiteAddress = (site: Pick<CustomerSite, 'addressLine1' | 'addressLine2' | 'city' | 'state' | 'postalCode' | 'country'>) =>
  [
    site.addressLine1,
    site.addressLine2,
    site.city,
    site.state,
    site.postalCode,
    site.country,
  ]
    .map((part) => String(part ?? '').trim())
    .filter(Boolean)
    .join(', ');

const syncLinkedEditableJobsFromSiteAddress = async (site: CustomerSite) => {
  await AppDataSource.query(
    `
      UPDATE "jobs" job
      SET
        "addressLine1" = $1,
        "addressLine2" = $2,
        "city" = $3,
        "state" = $4,
        "postalCode" = $5,
        "country" = $6,
        "location" = $7,
        "addressManuallyEdited" = false,
        "updatedAt" = CURRENT_TIMESTAMP
      WHERE job."tenantId" = $8
        AND job."siteId" = $9
        AND job."isDeleted" = false
        AND COALESCE(job."addressManuallyEdited", false) = false
        AND job."status" NOT IN ($10, $11, $12)
        AND NOT EXISTS (
          SELECT 1
          FROM "invoices" invoice
          WHERE invoice."tenantId" = job."tenantId"
            AND invoice."jobId" = job."id"
            AND invoice."isDeleted" = false
        )
    `,
    [
      site.addressLine1 ?? null,
      site.addressLine2 ?? null,
      site.city ?? null,
      site.state ?? null,
      site.postalCode ?? null,
      site.country ?? null,
      formatSiteAddress(site) || null,
      site.tenantId,
      site.id,
      JobStatus.FINISHED,
      JobStatus.COMPLETED,
      JobStatus.CANCELLED,
    ],
  );
};

const normalizeOptionalStringArray = (value: unknown) => {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const items = value
    .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
    .filter(Boolean)
    .slice(0, 20);

  return items.length > 0 ? Array.from(new Set(items)) : [];
};

const syncLegacyPrimaryContactFromSiteContact = (
  site: CustomerSite,
  siteContact?: Pick<CustomerSiteContact, 'name' | 'email' | 'phone'> | null,
) => {
  site.primaryContactName = siteContact?.name?.trim() || undefined;
  site.primaryContactEmail = siteContact?.email?.trim().toLowerCase() || undefined;
  site.primaryContactPhone = siteContact?.phone?.trim() || undefined;
};

const buildSiteMetrics = (
  customerIds: string[],
  siteGroups: CustomerSiteGroup[],
  sites: CustomerSite[],
) => {
  const metrics = new Map<string, { siteGroupsCount: number; sitesCount: number }>();

  for (const customerId of customerIds) {
    metrics.set(customerId, { siteGroupsCount: 0, sitesCount: 0 });
  }

  for (const siteGroup of siteGroups) {
    const bucket = metrics.get(siteGroup.customerId);
    if (bucket) {
      bucket.siteGroupsCount += 1;
    }
  }

  for (const site of sites) {
    const bucket = metrics.get(site.customerId);
    if (bucket) {
      bucket.sitesCount += 1;
    }
  }

  return metrics;
};

const enrichComplianceRecords = async (records: ComplianceRecord[]) => {
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
  const jobIds = Array.from(
    new Set(
      records
        .map((record) => (typeof record.jobId === 'string' ? record.jobId : ''))
        .filter(Boolean),
    ),
  );

  const [reviewers, documents, jobs] = await Promise.all([
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
    jobIds.length > 0
      ? AppDataSource.getRepository(Job).find({
          where: jobIds.map((id) => ({ id, isDeleted: false })),
        })
      : Promise.resolve([] as Job[]),
  ]);

  const reviewerMap = new Map(reviewers.map((reviewer) => [reviewer.id, reviewer.fullName]));
  const jobMap = new Map(jobs.map((job) => [job.id, job]));
  const documentMap = new Map(
    documents.map((document) => [
      document.id,
      {
        name: document.name,
        fileUrl: resolveStoredFileUrl(document.fileUrl),
      },
    ]),
  );

  return records.map((record) => ({
    ...record,
    jobTitle: record.jobId ? jobMap.get(record.jobId)?.title ?? null : null,
    jobStatus: record.jobId ? jobMap.get(record.jobId)?.status ?? null : null,
    reviewerName: record.reviewerUserId
      ? reviewerMap.get(record.reviewerUserId) ?? null
      : null,
    documentName: record.documentId ? documentMap.get(record.documentId)?.name ?? null : null,
    documentFileUrl: record.documentId
      ? documentMap.get(record.documentId)?.fileUrl ?? null
      : null,
  }));
};

export const listCustomers = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = getTenantId(req);
    const customerRepo = AppDataSource.getRepository(Customer);
    const siteGroupRepo = AppDataSource.getRepository(CustomerSiteGroup);
    const siteRepo = AppDataSource.getRepository(CustomerSite);
    const customers = await customerRepo.find({
      where: { tenantId, isDeleted: false },
      order: { createdAt: 'DESC' },
    });

    if (customers.length === 0) {
      res.deliver(200, true, [], 'Customers fetched');
      return;
    }

    const customerIds = customers.map((customer) => customer.id);
    const [siteGroups, sites] = await Promise.all([
      siteGroupRepo.find({
        where: customerIds.map((customerId) => ({ tenantId, customerId, isDeleted: false })),
      }),
      siteRepo.find({
        where: customerIds.map((customerId) => ({ tenantId, customerId, isDeleted: false })),
      }),
    ]);

    const metrics = buildSiteMetrics(customerIds, siteGroups, sites);
    const payload = customers.map((customer) => ({
      ...customer,
      siteGroupsCount: metrics.get(customer.id)?.siteGroupsCount ?? 0,
      sitesCount: metrics.get(customer.id)?.sitesCount ?? 0,
    }));

    res.deliver(200, true, payload, 'Customers fetched');
  } catch (error) {
    next(error);
  }
};

export const getCustomer = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = getTenantId(req);
    const repo = AppDataSource.getRepository(Customer);
    const customer = await repo.findOne({ where: { id: req.params.id, tenantId, isDeleted: false } });
    if (!customer) {
      throw new NotFoundError('Customer not found');
    }
    res.deliver(200, true, customer, 'Customer fetched');
  } catch (error) {
    next(error);
  }
};

export const getCustomerDetails = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = getTenantId(req);
    const customerRepo = AppDataSource.getRepository(Customer);
    const contactRepo = AppDataSource.getRepository(CustomerContact);
    const siteGroupRepo = AppDataSource.getRepository(CustomerSiteGroup);
    const siteRepo = AppDataSource.getRepository(CustomerSite);
    const siteContactRepo = AppDataSource.getRepository(CustomerSiteContact);
    const complianceRecordRepo = AppDataSource.getRepository(ComplianceRecord);
    const jobRepo = AppDataSource.getRepository(Job);
    const invoiceRepo = AppDataSource.getRepository(Invoice);
    const renewalRepo = AppDataSource.getRepository(RenewalOpportunity);

    const customer = await customerRepo.findOne({
      where: { id: req.params.id, tenantId, isDeleted: false },
    });
    if (!customer) {
      throw new NotFoundError('Customer not found');
    }

    const [contacts, siteGroups, sites, siteContacts, complianceRecords, jobs, invoices, renewals] = await Promise.all([
      contactRepo.find({
        where: { tenantId, customerId: customer.id, isDeleted: false },
        order: { createdAt: 'DESC' },
      }),
      siteGroupRepo.find({
        where: { tenantId, customerId: customer.id, isDeleted: false },
        order: { sortOrder: 'ASC', createdAt: 'ASC' },
      }),
      siteRepo.find({
        where: { tenantId, customerId: customer.id, isDeleted: false },
        order: { createdAt: 'DESC' },
      }),
      siteContactRepo.find({
        where: { tenantId, customerId: customer.id, isDeleted: false },
        order: { createdAt: 'DESC' },
      }),
      complianceRecordRepo.find({
        where: { tenantId, customerId: customer.id, isDeleted: false },
        order: { testedAt: 'DESC', createdAt: 'DESC' },
      }),
      jobRepo.find({
        where: { tenantId, customerId: customer.id, isDeleted: false },
        order: { createdAt: 'DESC' },
      }),
      invoiceRepo.find({
        where: { tenantId, customerId: customer.id, isDeleted: false },
        order: { createdAt: 'DESC' },
      }),
      renewalRepo.find({
        where: { tenantId, customerId: customer.id, isDeleted: false },
        order: { dueDate: 'ASC', createdAt: 'DESC' },
      }),
    ]);

    const payload = {
      customer,
      contacts,
      siteGroups,
      sites,
      siteContacts,
      complianceRecords: await enrichComplianceRecords(complianceRecords),
      jobs,
      invoices,
      renewals: await serializeRenewalOpportunities(renewals),
      summary: {
        siteGroupsCount: siteGroups.length,
        sitesCount: sites.length,
        jobsCount: jobs.length,
        invoicesCount: invoices.length,
        invoicesTotal: Number(
          invoices.reduce((sum, invoice) => sum + Number(invoice.total ?? 0), 0).toFixed(2),
        ),
        invoicesPaid: Number(
          invoices
            .filter((invoice) => String(invoice.status ?? '').toUpperCase() === 'PAID')
            .reduce((sum, invoice) => sum + Number(invoice.total ?? 0), 0)
            .toFixed(2),
        ),
      },
    };

    res.deliver(200, true, payload, 'Customer details fetched');
  } catch (error) {
    next(error);
  }
};

export const resetCustomerPassword = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = getTenantId(req);
    const customer = await ensureCustomerForTenant(tenantId, req.params.id);
    const linkRepo = AppDataSource.getRepository(CustomerAccountTenant);
    const accountRepo = AppDataSource.getRepository(Account);

    const link = await linkRepo.findOne({
      where: { tenantId, customerId: customer.id, isDeleted: false },
    });

    let account = link
      ? await accountRepo.findOne({ where: { id: link.accountId, isDeleted: false } })
      : await accountRepo.findOne({ where: { email: customer.email, isDeleted: false } });

    if (!account) {
      account = accountRepo.create({
        email: customer.email,
        passwordHash: '',
        isActive: true,
        emailVerifiedAt: new Date(),
      });
    } else {
      const existingTenantLink = await linkRepo.findOne({
        where: { accountId: account.id, tenantId, isDeleted: false },
      });
      if (existingTenantLink && existingTenantLink.customerId !== customer.id) {
        throw new BadRequestError('This email is already linked to another customer in this workspace.');
      }
    }

    const providedPassword =
      typeof req.body.password === 'string' && req.body.password.trim().length > 0
        ? req.body.password.trim()
        : undefined;
    const nextPassword = providedPassword ?? generateTempPassword(12);
    account.passwordHash = await hashPassword(nextPassword);
    account.isActive = true;
    account.emailVerifiedAt = account.emailVerifiedAt ?? new Date();
    await accountRepo.save(account);

    if (!link) {
      await linkRepo.save(
        linkRepo.create({
          accountId: account.id,
          tenantId,
          customerId: customer.id,
        }),
      );
    }

    const loginUrl = await resolveTenantAppUrl(tenantId, '/customer/login');
    await sendCustomerPortalAccessEmail(
      account.email,
      { email: account.email, loginUrl, tempPassword: nextPassword },
      { tenantId },
    );

    const payload = withAuthDetails(
      { updated: true },
      { loginUrl, tempPassword: nextPassword, email: account.email },
    );
    res.deliver(200, true, payload, 'Customer password reset');
  } catch (error) {
    next(error);
  }
};

const ensureCustomerForTenant = async (tenantId: string, customerId: string) => {
  const customerRepo = AppDataSource.getRepository(Customer);
  const customer = await customerRepo.findOne({
    where: { id: customerId, tenantId, isDeleted: false },
  });
  if (!customer) {
    throw new NotFoundError('Customer not found');
  }
  return customer;
};

const ensureSiteGroupForCustomer = async (
  tenantId: string,
  customerId: string,
  siteGroupId: string,
) => {
  const siteGroupRepo = AppDataSource.getRepository(CustomerSiteGroup);
  const siteGroup = await siteGroupRepo.findOne({
    where: { id: siteGroupId, tenantId, customerId, isDeleted: false },
  });
  if (!siteGroup) {
    throw new NotFoundError('Site group not found');
  }
  return siteGroup;
};

const ensureCustomerSite = async (tenantId: string, customerId: string, siteId: string) => {
  const siteRepo = AppDataSource.getRepository(CustomerSite);
  const site = await siteRepo.findOne({
    where: { id: siteId, tenantId, customerId, isDeleted: false },
  });
  if (!site) {
    throw new NotFoundError('Site not found');
  }
  return site;
};

const ensureCustomerSiteContact = async (
  tenantId: string,
  customerId: string,
  siteId: string,
  contactId: string,
) => {
  const siteContactRepo = AppDataSource.getRepository(CustomerSiteContact);
  const siteContact = await siteContactRepo.findOne({
    where: { id: contactId, tenantId, customerId, siteId, isDeleted: false },
  });
  if (!siteContact) {
    throw new NotFoundError('Site contact not found');
  }
  return siteContact;
};

export const listCustomerContacts = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = getTenantId(req);
    const customerId = req.params.id;
    await ensureCustomerForTenant(tenantId, customerId);
    const contactRepo = AppDataSource.getRepository(CustomerContact);
    const contacts = await contactRepo.find({
      where: { tenantId, customerId, isDeleted: false },
      order: { createdAt: 'DESC' },
    });
    res.deliver(200, true, contacts, 'Customer contacts fetched');
  } catch (error) {
    next(error);
  }
};

export const createCustomerContact = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = getTenantId(req);
    const customerId = req.params.id;
    await ensureCustomerForTenant(tenantId, customerId);
    const name = String(req.body.name ?? '').trim();
    const email = String(req.body.email ?? '')
      .trim()
      .toLowerCase();
    if (!name) {
      throw new BadRequestError('Contact name is required');
    }
    if (!email) {
      throw new BadRequestError('Contact email is required');
    }

    const contactRepo = AppDataSource.getRepository(CustomerContact);
    const contact = contactRepo.create({
      tenantId,
      customerId,
      name,
      email,
      phone: normalizeOptionalString(req.body.phone),
      address: normalizeOptionalString(req.body.address),
    });
    await contactRepo.save(contact);
    res.deliver(201, true, contact, 'Customer contact created');
  } catch (error) {
    next(error);
  }
};

export const updateCustomerContact = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = getTenantId(req);
    const customerId = req.params.id;
    const contactId = req.params.contactId;
    await ensureCustomerForTenant(tenantId, customerId);

    const contactRepo = AppDataSource.getRepository(CustomerContact);
    const contact = await contactRepo.findOne({
      where: { id: contactId, tenantId, customerId, isDeleted: false },
    });
    if (!contact) {
      throw new NotFoundError('Customer contact not found');
    }

    const name = String(req.body.name ?? '').trim();
    const email = String(req.body.email ?? '')
      .trim()
      .toLowerCase();
    if (!name) {
      throw new BadRequestError('Contact name is required');
    }
    if (!email) {
      throw new BadRequestError('Contact email is required');
    }

    contact.name = name;
    contact.email = email;
    contact.phone = normalizeOptionalString(req.body.phone);
    contact.address = normalizeOptionalString(req.body.address);

    await contactRepo.save(contact);
    res.deliver(200, true, contact, 'Customer contact updated');
  } catch (error) {
    next(error);
  }
};

export const listCustomerSiteGroups = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = getTenantId(req);
    const customerId = req.params.id;
    await ensureCustomerForTenant(tenantId, customerId);
    const siteGroupRepo = AppDataSource.getRepository(CustomerSiteGroup);
    const siteGroups = await siteGroupRepo.find({
      where: { tenantId, customerId, isDeleted: false },
      order: { sortOrder: 'ASC', createdAt: 'ASC' },
    });
    res.deliver(200, true, siteGroups, 'Customer site groups fetched');
  } catch (error) {
    next(error);
  }
};

export const createCustomerSiteGroup = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = getTenantId(req);
    const customerId = req.params.id;
    await ensureCustomerForTenant(tenantId, customerId);

    const name = String(req.body.name ?? '').trim();
    if (!name) {
      throw new BadRequestError('Site group name is required');
    }

    const siteGroupRepo = AppDataSource.getRepository(CustomerSiteGroup);
    const siteGroup = siteGroupRepo.create({
      tenantId,
      customerId,
      name,
      description: normalizeOptionalString(req.body.description),
      sortOrder:
        typeof req.body.sortOrder === 'number' && Number.isFinite(req.body.sortOrder)
          ? Math.trunc(req.body.sortOrder)
          : 0,
    });

    await siteGroupRepo.save(siteGroup);
    res.deliver(201, true, siteGroup, 'Customer site group created');
  } catch (error) {
    next(error);
  }
};

export const updateCustomerSiteGroup = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = getTenantId(req);
    const customerId = req.params.id;
    const siteGroupId = req.params.siteGroupId;
    await ensureCustomerForTenant(tenantId, customerId);
    const siteGroup = await ensureSiteGroupForCustomer(tenantId, customerId, siteGroupId);

    const name = String(req.body.name ?? '').trim();
    if (!name) {
      throw new BadRequestError('Site group name is required');
    }

    siteGroup.name = name;
    siteGroup.description = normalizeOptionalString(req.body.description);
    if (typeof req.body.sortOrder === 'number' && Number.isFinite(req.body.sortOrder)) {
      siteGroup.sortOrder = Math.trunc(req.body.sortOrder);
    }

    await AppDataSource.getRepository(CustomerSiteGroup).save(siteGroup);
    res.deliver(200, true, siteGroup, 'Customer site group updated');
  } catch (error) {
    next(error);
  }
};

export const deleteCustomerSiteGroup = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = getTenantId(req);
    const customerId = req.params.id;
    const siteGroupId = req.params.siteGroupId;
    await ensureCustomerForTenant(tenantId, customerId);
    const siteGroup = await ensureSiteGroupForCustomer(tenantId, customerId, siteGroupId);

    const siteRepo = AppDataSource.getRepository(CustomerSite);
    const activeSiteCount = await siteRepo.count({
      where: { tenantId, customerId, siteGroupId: siteGroup.id, isDeleted: false },
    });
    if (activeSiteCount > 0) {
      throw new BadRequestError('Move or remove linked sites before deleting this site group');
    }

    siteGroup.isDeleted = true;
    await AppDataSource.getRepository(CustomerSiteGroup).save(siteGroup);
    res.deliver(200, true, { id: siteGroup.id }, 'Customer site group removed');
  } catch (error) {
    next(error);
  }
};

export const listCustomerSites = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = getTenantId(req);
    const customerId = req.params.id;
    await ensureCustomerForTenant(tenantId, customerId);
    const siteRepo = AppDataSource.getRepository(CustomerSite);
    const siteGroupRepo = AppDataSource.getRepository(CustomerSiteGroup);
    const [sites, siteGroups] = await Promise.all([
      siteRepo.find({
        where: { tenantId, customerId, isDeleted: false },
        order: { createdAt: 'DESC' },
      }),
      siteGroupRepo.find({
        where: { tenantId, customerId, isDeleted: false },
      }),
    ]);

    const siteGroupMap = new Map(siteGroups.map((siteGroup) => [siteGroup.id, siteGroup.name]));
    const payload = sites.map((site) => ({
      ...site,
      siteGroupName: site.siteGroupId ? siteGroupMap.get(site.siteGroupId) ?? null : null,
    }));

    res.deliver(200, true, payload, 'Customer sites fetched');
  } catch (error) {
    next(error);
  }
};

export const listCustomerSiteContacts = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = getTenantId(req);
    const customerId = req.params.id;
    const siteId = req.params.siteId;
    await ensureCustomerForTenant(tenantId, customerId);
    await ensureCustomerSite(tenantId, customerId, siteId);

    const siteContactRepo = AppDataSource.getRepository(CustomerSiteContact);
    const contacts = await siteContactRepo.find({
      where: { tenantId, customerId, siteId, isDeleted: false },
      order: { createdAt: 'DESC' },
    });

    res.deliver(200, true, contacts, 'Customer site contacts fetched');
  } catch (error) {
    next(error);
  }
};

export const createCustomerSite = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = getTenantId(req);
    const customerId = req.params.id;
    await ensureCustomerForTenant(tenantId, customerId);

    const name = String(req.body.name ?? '').trim();
    if (!name) {
      throw new BadRequestError('Site name is required');
    }

    const siteGroupId = normalizeOptionalString(req.body.siteGroupId);
    if (siteGroupId) {
      await ensureSiteGroupForCustomer(tenantId, customerId, siteGroupId);
    }

    const siteRepo = AppDataSource.getRepository(CustomerSite);
    const site = siteRepo.create({
      tenantId,
      customerId,
      siteGroupId,
      name,
      category: normalizeOptionalString(req.body.category),
      reference: normalizeOptionalString(req.body.reference),
      status: normalizeOptionalString(req.body.status)?.toUpperCase() ?? 'ACTIVE',
      addressLine1: normalizeOptionalString(req.body.addressLine1),
      addressLine2: normalizeOptionalString(req.body.addressLine2),
      city: normalizeOptionalString(req.body.city),
      state: normalizeOptionalString(req.body.state),
      postalCode: normalizeOptionalString(req.body.postalCode),
      country: normalizeOptionalString(req.body.country),
      primaryContactName: normalizeOptionalString(req.body.primaryContactName),
      primaryContactEmail: normalizeOptionalEmail(req.body.primaryContactEmail),
      primaryContactPhone: normalizeOptionalString(req.body.primaryContactPhone),
      tags: normalizeOptionalStringArray(req.body.tags),
      additionalInformation: normalizeOptionalString(req.body.additionalInformation),
      notes: normalizeOptionalString(req.body.notes),
    });

    await siteRepo.save(site);
    if (site.primaryContactName) {
      const siteContactRepo = AppDataSource.getRepository(CustomerSiteContact);
      const siteContact = siteContactRepo.create({
        tenantId,
        customerId,
        siteId: site.id,
        name: site.primaryContactName,
        email: site.primaryContactEmail,
        phone: site.primaryContactPhone,
        role: 'Primary site contact',
      });
      await siteContactRepo.save(siteContact);
      site.mainContactId = siteContact.id;
      await siteRepo.save(site);
    }
    res.deliver(201, true, site, 'Customer site created');
  } catch (error) {
    next(error);
  }
};

export const updateCustomerSite = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = getTenantId(req);
    const customerId = req.params.id;
    const siteId = req.params.siteId;
    await ensureCustomerForTenant(tenantId, customerId);
    const site = await ensureCustomerSite(tenantId, customerId, siteId);

    const name = String(req.body.name ?? '').trim();
    if (!name) {
      throw new BadRequestError('Site name is required');
    }

    const siteGroupId = normalizeOptionalString(req.body.siteGroupId);
    if (siteGroupId) {
      await ensureSiteGroupForCustomer(tenantId, customerId, siteGroupId);
    }

    site.name = name;
    site.siteGroupId = siteGroupId;
    site.category = normalizeOptionalString(req.body.category);
    site.reference = normalizeOptionalString(req.body.reference);
    site.status = normalizeOptionalString(req.body.status)?.toUpperCase() ?? 'ACTIVE';
    site.addressLine1 = normalizeOptionalString(req.body.addressLine1);
    site.addressLine2 = normalizeOptionalString(req.body.addressLine2);
    site.city = normalizeOptionalString(req.body.city);
    site.state = normalizeOptionalString(req.body.state);
    site.postalCode = normalizeOptionalString(req.body.postalCode);
    site.country = normalizeOptionalString(req.body.country);
    const mainContactId = normalizeOptionalString(req.body.mainContactId);
    if (mainContactId) {
      const mainContact = await ensureCustomerSiteContact(tenantId, customerId, siteId, mainContactId);
      site.mainContactId = mainContact.id;
      syncLegacyPrimaryContactFromSiteContact(site, mainContact);
    } else {
      site.mainContactId = undefined;
      site.primaryContactName = normalizeOptionalString(req.body.primaryContactName);
      site.primaryContactEmail = normalizeOptionalEmail(req.body.primaryContactEmail);
      site.primaryContactPhone = normalizeOptionalString(req.body.primaryContactPhone);
    }
    site.tags = normalizeOptionalStringArray(req.body.tags);
    site.additionalInformation = normalizeOptionalString(req.body.additionalInformation);
    site.notes = normalizeOptionalString(req.body.notes);

    await AppDataSource.getRepository(CustomerSite).save(site);
    await syncLinkedEditableJobsFromSiteAddress(site);
    res.deliver(200, true, site, 'Customer site updated');
  } catch (error) {
    next(error);
  }
};

export const deleteCustomerSite = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = getTenantId(req);
    const customerId = req.params.id;
    const siteId = req.params.siteId;
    await ensureCustomerForTenant(tenantId, customerId);
    const site = await ensureCustomerSite(tenantId, customerId, siteId);
    const siteContactRepo = AppDataSource.getRepository(CustomerSiteContact);
    site.isDeleted = true;
    const siteContacts = await siteContactRepo.find({
      where: { tenantId, customerId, siteId, isDeleted: false },
    });
    siteContacts.forEach((contact) => {
      contact.isDeleted = true;
    });
    await Promise.all([
      AppDataSource.getRepository(CustomerSite).save(site),
      siteContacts.length > 0 ? siteContactRepo.save(siteContacts) : Promise.resolve(),
    ]);
    res.deliver(200, true, { id: site.id }, 'Customer site removed');
  } catch (error) {
    next(error);
  }
};

export const createCustomerSiteContact = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const tenantId = getTenantId(req);
    const customerId = req.params.id;
    const siteId = req.params.siteId;
    await ensureCustomerForTenant(tenantId, customerId);
    await ensureCustomerSite(tenantId, customerId, siteId);

    const name = String(req.body.name ?? '').trim();
    if (!name) {
      throw new BadRequestError('Site contact name is required');
    }

    const siteContactRepo = AppDataSource.getRepository(CustomerSiteContact);
    const siteContact = siteContactRepo.create({
      tenantId,
      customerId,
      siteId,
      name,
      email: normalizeOptionalEmail(req.body.email),
      phone: normalizeOptionalString(req.body.phone),
      role: normalizeOptionalString(req.body.role),
      notes: normalizeOptionalString(req.body.notes),
    });

    await siteContactRepo.save(siteContact);
    res.deliver(201, true, siteContact, 'Customer site contact created');
  } catch (error) {
    next(error);
  }
};

export const updateCustomerSiteContact = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const tenantId = getTenantId(req);
    const customerId = req.params.id;
    const siteId = req.params.siteId;
    const contactId = req.params.contactId;
    await ensureCustomerForTenant(tenantId, customerId);
    const site = await ensureCustomerSite(tenantId, customerId, siteId);
    const siteContact = await ensureCustomerSiteContact(tenantId, customerId, siteId, contactId);

    const name = String(req.body.name ?? '').trim();
    if (!name) {
      throw new BadRequestError('Site contact name is required');
    }

    siteContact.name = name;
    siteContact.email = normalizeOptionalEmail(req.body.email);
    siteContact.phone = normalizeOptionalString(req.body.phone);
    siteContact.role = normalizeOptionalString(req.body.role);
    siteContact.notes = normalizeOptionalString(req.body.notes);

    if (site.mainContactId === siteContact.id) {
      syncLegacyPrimaryContactFromSiteContact(site, siteContact);
    }

    await Promise.all([
      AppDataSource.getRepository(CustomerSiteContact).save(siteContact),
      site.mainContactId === siteContact.id ? AppDataSource.getRepository(CustomerSite).save(site) : Promise.resolve(),
    ]);

    res.deliver(200, true, siteContact, 'Customer site contact updated');
  } catch (error) {
    next(error);
  }
};

export const deleteCustomerSiteContact = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const tenantId = getTenantId(req);
    const customerId = req.params.id;
    const siteId = req.params.siteId;
    const contactId = req.params.contactId;
    await ensureCustomerForTenant(tenantId, customerId);
    const site = await ensureCustomerSite(tenantId, customerId, siteId);
    const siteContact = await ensureCustomerSiteContact(tenantId, customerId, siteId, contactId);
    const wasMainContact = site.mainContactId === siteContact.id;

    siteContact.isDeleted = true;
    if (wasMainContact) {
      site.mainContactId = undefined;
      site.primaryContactName = undefined;
      site.primaryContactEmail = undefined;
      site.primaryContactPhone = undefined;
    }

    await Promise.all([
      AppDataSource.getRepository(CustomerSiteContact).save(siteContact),
      wasMainContact ? AppDataSource.getRepository(CustomerSite).save(site) : Promise.resolve(),
    ]);

    res.deliver(200, true, { id: siteContact.id }, 'Customer site contact removed');
  } catch (error) {
    next(error);
  }
};

export const deleteCustomerContact = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = getTenantId(req);
    const customerId = req.params.id;
    const contactId = req.params.contactId;
    await ensureCustomerForTenant(tenantId, customerId);

    const contactRepo = AppDataSource.getRepository(CustomerContact);
    const contact = await contactRepo.findOne({
      where: { id: contactId, tenantId, customerId, isDeleted: false },
    });
    if (!contact) {
      throw new NotFoundError('Customer contact not found');
    }
    contact.isDeleted = true;
    await contactRepo.save(contact);
    res.deliver(200, true, { id: contact.id }, 'Customer contact removed');
  } catch (error) {
    next(error);
  }
};

export const createCustomer = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = getTenantId(req);
    const repo = AppDataSource.getRepository(Customer);
    const portalToken = req.body.portalToken ?? crypto.randomBytes(16).toString('hex');
    const customer = repo.create({ ...req.body, tenantId, portalToken });
    await repo.save(customer);
    res.deliver(201, true, customer, 'Customer created');
  } catch (error) {
    next(error);
  }
};

export const updateCustomer = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = getTenantId(req);
    const repo = AppDataSource.getRepository(Customer);
    const linkRepo = AppDataSource.getRepository(CustomerAccountTenant);
    const customer = await repo.findOne({ where: { id: req.params.id, tenantId, isDeleted: false } });
    if (!customer) {
      throw new NotFoundError('Customer not found');
    }

    const nextName = typeof req.body.name === 'string' ? req.body.name.trim() : customer.name;
    if (!nextName) {
      throw new BadRequestError('Customer name is required');
    }
    customer.name = nextName;

    if (typeof req.body.phone === 'string') {
      customer.phone = normalizeOptionalString(req.body.phone);
    }
    if (typeof req.body.address === 'string') {
      customer.address = normalizeOptionalString(req.body.address);
    }

    if (req.body.portalAllowedSiteIds === null) {
      customer.portalAllowedSiteIds = undefined;
    } else if (Array.isArray(req.body.portalAllowedSiteIds)) {
      const nextAllowedSiteIds = normalizeOptionalStringArray(req.body.portalAllowedSiteIds) ?? [];
      if (nextAllowedSiteIds.length === 0) {
        customer.portalAllowedSiteIds = undefined;
      } else {
        const siteRepo = AppDataSource.getRepository(CustomerSite);
        const customerSites = await siteRepo.find({
          where: { tenantId, customerId: customer.id, isDeleted: false },
          select: ['id'],
        });
        const validSiteIds = new Set(customerSites.map((site) => site.id));
        const invalidSiteId = nextAllowedSiteIds.find((siteId) => !validSiteIds.has(siteId));
        if (invalidSiteId) {
          throw new BadRequestError('Portal site access contains a site that does not belong to this customer');
        }
        customer.portalAllowedSiteIds = nextAllowedSiteIds;
      }
    }

    if (typeof req.body.email === 'string') {
      const nextEmail = req.body.email.trim().toLowerCase();
      if (!nextEmail) {
        throw new BadRequestError('Customer email is required');
      }
      if (nextEmail !== customer.email.toLowerCase()) {
        const alreadyInUse = await repo.findOne({
          where: {
            tenantId,
            email: nextEmail,
            isDeleted: false,
            id: Not(customer.id),
          },
        });
        if (alreadyInUse) {
          throw new BadRequestError('A customer with this email already exists in this workspace');
        }

        const linkedAccount = await linkRepo.findOne({
          where: { tenantId, customerId: customer.id, isDeleted: false },
        });
        if (linkedAccount) {
          throw new BadRequestError(
            'Email cannot be changed for customers who already have portal access. Create a new customer instead.',
          );
        }
        customer.email = nextEmail;
      }
    }

    await repo.save(customer);
    res.deliver(200, true, customer, 'Customer updated');
  } catch (error) {
    next(error);
  }
};

export const deleteCustomer = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = getTenantId(req);
    const repo = AppDataSource.getRepository(Customer);
    const customer = await repo.findOne({ where: { id: req.params.id, tenantId, isDeleted: false } });
    if (!customer) {
      throw new NotFoundError('Customer not found');
    }
    customer.isDeleted = true;
    await repo.save(customer);
    res.deliver(200, true, customer, 'Customer removed');
  } catch (error) {
    next(error);
  }
};

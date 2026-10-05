import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { AppDataSource } from '../../../config/data-source';
import { Lead } from '../../../entities/lead.entity';
import { getTenantId } from '../../../utils/request';
import { BadRequestError, NotFoundError } from '../../../utils/errors';
import { Job } from '../../../entities/job.entity';
import { LeadStatus } from '../../../constants/status';
import { JobStatus } from '../../../constants/status';
import { QuoteStatus } from '../../../constants/status';
import { LeadActivity } from '../../../entities/lead-activity.entity';
import { Quote } from '../../../entities/quote.entity';
import { leadSourceOptions } from '../../dto/lead.dto';
import { DocumentItem } from '../../../entities/document.entity';
import { User } from '../../../entities/user.entity';
import { Customer } from '../../../entities/customer.entity';
import { hasActiveIntegration } from '../../../services/integrations.service';
import { SyncStatus } from '../../../constants/integrations';
import { SystemRole } from '../../../constants/roles';
import { enqueueDocumentPush } from '../../queues/document-sync-queue.service';
import { syncDocumentToProvider } from '../../../services/integrations/document-shadowing.service';
import { ensureCustomerPortalAccess } from '../../../services/customer-portal-access.service';
import { sendLeadConvertedToJobEmail, sendQuoteEmail } from '../../../services/notifications.service';
import {
  normalizeStoredFileReference,
  resolveStoredFileUrl,
} from '../../../services/storage/storage.service';
import { toStoredUploadKey } from '../../../middleware/stream-upload.middleware';
import { ensureJobNumber, ensureQuoteNumber, reserveDocumentNumber } from '../../../services/document-number.service';
import { notifyAdmins } from '../../../services/in-app-notifications.service';
import {
  buildCustomerSiteAddress,
  ensureCustomerSiteForTenant,
} from '../../../services/customer-sites.service';
import { resolveTenantAppUrl } from '../../../utils/tenant-url';
import { assertTenantFeatureEnabled, loadTenantFeatureFlags } from '../../../services/tenant-features.service';
import { CustomerSite } from '../../../entities/customer-site.entity';
import { LeadTask } from '../../../entities/lead-task.entity';
import { LeadTaskStatus } from '../../../constants/status';


const withResolvedFileUrl = <T extends { fileUrl?: string | null }>(document: T) => ({
  ...document,
  fileUrl: resolveStoredFileUrl(document.fileUrl),
});

const normalizeLeadSource = (value?: string | null) => {
  const raw = String(value ?? '').trim();
  if (!raw) return 'Other';
  const normalized = raw.toLowerCase().replace(/[_\s]+/g, '-');
  if (normalized === 'web' || normalized === 'web-form' || normalized === 'website') {
    return 'Web form';
  }
  if (normalized === 'phone' || normalized === 'phone-call' || normalized === 'call') {
    return 'Phone';
  }
  if (normalized === 'referral') return 'Referral';
  if (normalized === 'angi') return 'Angi';
  if (normalized === 'thumbtack') return 'Thumbtack';
  if (normalized === 'walk-in' || normalized === 'walkin') return 'Walk-in';
  if (normalized === 'other') return 'Other';
  const exact = leadSourceOptions.find((option) => option.toLowerCase() === raw.toLowerCase());
  return exact ?? 'Other';
};

const normalizeLeadStatus = (status?: string | null) => {
  const raw = String(status ?? '').trim().toUpperCase();
  if (!raw) return LeadStatus.NEW;
  if (raw === 'WON') return LeadStatus.CONVERTED;
  if (Object.values(LeadStatus).includes(raw as LeadStatus)) {
    return raw as LeadStatus;
  }
  return LeadStatus.NEW;
};

const toDisplayLeadStatus = (status: LeadStatus) => {
  switch (status) {
    case LeadStatus.NEW:
      return 'New';
    case LeadStatus.CONTACTED:
      return 'Contacted';
    case LeadStatus.QUALIFIED:
      return 'Qualified';
    case LeadStatus.CONVERTED:
      return 'Won';
    case LeadStatus.LOST:
      return 'Lost';
    default:
      return status;
  }
};

const createLeadActivity = async (params: {
  leadId: string;
  tenantId: string;
  userId?: string;
  type: string;
  message: string;
  metadata?: Record<string, unknown>;
}) => {
  const repo = AppDataSource.getRepository(LeadActivity);
  const activity = repo.create({
    leadId: params.leadId,
    tenantId: params.tenantId,
    userId: params.userId,
    type: params.type,
    message: params.message,
    metadata: params.metadata,
  });
  await repo.save(activity);
  return activity;
};

const sanitizeTags = (tags?: string[]) => {
  if (!Array.isArray(tags)) return undefined;
  return tags
    .map((tag) => String(tag).trim())
    .filter(Boolean)
    .slice(0, 20);
};

const normalizeOptionalString = (value: unknown) => {
  if (typeof value !== 'string') {
    return undefined;
  }
  const nextValue = value.trim();
  return nextValue.length > 0 ? nextValue : undefined;
};

const formatJobAddress = (job: Partial<Job>) =>
  [
    job.addressLine1,
    job.addressLine2,
    job.city,
    job.state,
    job.postalCode,
    job.country,
  ]
    .map((part) => String(part ?? '').trim())
    .filter(Boolean)
    .join(', ');

const buildJobAddressSnapshot = (body: Record<string, unknown>, site?: CustomerSite | null) => ({
  addressLine1: normalizeOptionalString(body.addressLine1) ?? site?.addressLine1,
  addressLine2: normalizeOptionalString(body.addressLine2) ?? site?.addressLine2,
  city: normalizeOptionalString(body.city) ?? site?.city,
  state: normalizeOptionalString(body.state) ?? site?.state,
  postalCode: normalizeOptionalString(body.postalCode) ?? site?.postalCode,
  country: normalizeOptionalString(body.country) ?? site?.country,
});

const NON_INTERNAL_ASSIGNMENT_ROLES = new Set<string>([
  SystemRole.CUSTOMER,
  SystemRole.SUB_CONTRACTOR,
  SystemRole.FIELD_WORKER,
]);

const buildPublicQuoteUrl = (tenantId: string, publicToken: string) =>
  resolveTenantAppUrl(tenantId, `/quote/${encodeURIComponent(publicToken)}`);

const isInternalAssignableUser = (user?: User | null) => {
  if (!user) return false;
  const roleCodes = (user.roles ?? []).map((role) => role.code);
  if (roleCodes.length === 0) return false;
  return !roleCodes.some((code) => NON_INTERNAL_ASSIGNMENT_ROLES.has(code));
};

const resolveLeadAssignee = async (tenantId: string, assignedUserId?: string) => {
  const normalizedAssignedUserId = normalizeOptionalString(assignedUserId);
  if (!normalizedAssignedUserId) return null;

  const user = await AppDataSource.getRepository(User).findOne({
    where: {
      id: normalizedAssignedUserId,
      tenantId,
      isDeleted: false,
      isActive: true,
    },
    relations: ['roles'],
  });

  if (!isInternalAssignableUser(user)) {
    throw new BadRequestError('Lead can only be assigned to an active internal employee.');
  }

  return user;
};

const withLeadAssignees = async (tenantId: string, leads: Lead[]) => {
  const assigneeIds = Array.from(
    new Set(
      leads
        .map((lead) => lead.assignedUserId)
        .filter((assignedUserId): assignedUserId is string => Boolean(assignedUserId)),
    ),
  );

  const assignees =
    assigneeIds.length > 0
      ? await AppDataSource.getRepository(User).find({
          where: assigneeIds.map((id) => ({ id, tenantId, isDeleted: false })),
          select: { id: true, fullName: true, email: true },
        })
      : [];
  const assigneeById = new Map(assignees.map((user) => [user.id, user]));

  return leads.map((lead) => {
    const assignee = lead.assignedUserId ? assigneeById.get(lead.assignedUserId) : null;
    return {
      ...lead,
      assignedUserName: assignee?.fullName ?? null,
      assignedUserEmail: assignee?.email ?? null,
    };
  });
};

const ensureLeadCustomer = async (lead: Lead) => {
  const customerRepo = AppDataSource.getRepository(Customer);
  const existingByEmail = await customerRepo.findOne({
    where: {
      tenantId: lead.tenantId,
      email: lead.email,
      isDeleted: false,
    },
  });
  if (existingByEmail) {
    return existingByEmail;
  }
  const created = customerRepo.create({
    tenantId: lead.tenantId,
    name: lead.name,
    email: lead.email,
    phone: lead.phone,
    portalToken: crypto.randomBytes(12).toString('hex'),
  });
  await customerRepo.save(created);
  return created;
};

const buildLeadActivitySnapshot = async (tenantId: string, leadId: string) => {
  const activityRepo = AppDataSource.getRepository(LeadActivity);
  const userRepo = AppDataSource.getRepository(User);
  const activities = await activityRepo.find({
    where: { tenantId, leadId, isDeleted: false },
    order: { createdAt: 'ASC' },
  });
  const userIds = Array.from(
    new Set(
      activities
        .map((activity) => activity.userId)
        .filter((userId): userId is string => Boolean(userId)),
    ),
  );
  const users =
    userIds.length > 0
      ? await userRepo.find({
          where: userIds.map((id) => ({ id, tenantId, isDeleted: false })),
          select: { id: true, fullName: true },
        })
      : [];
  const actorById = new Map(users.map((user) => [user.id, user.fullName]));
  return activities.map((activity) => ({
    id: activity.id,
    type: activity.type,
    message: activity.message,
    createdAt: activity.createdAt?.toISOString() ?? new Date().toISOString(),
    userId: activity.userId ?? null,
    actorName: activity.userId ? actorById.get(activity.userId) ?? 'Unknown User' : 'Automated',
  }));
};

export const listLeads = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = getTenantId(req);
    const repo = AppDataSource.getRepository(Lead);
    const leads = await repo.find({
      where: { tenantId, isDeleted: false },
      order: { createdAt: 'DESC' },
    });
    res.deliver(200, true, await withLeadAssignees(tenantId, leads), 'Leads fetched');
  } catch (error) {
    next(error);
  }
};

export const getLead = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = getTenantId(req);
    const repo = AppDataSource.getRepository(Lead);
    const lead = await repo.findOne({ where: { id: req.params.id, tenantId, isDeleted: false } });
    if (!lead) {
      throw new NotFoundError('Lead not found');
    }
    const [result] = await withLeadAssignees(tenantId, [lead]);
    res.deliver(200, true, result, 'Lead fetched');
  } catch (error) {
    next(error);
  }
};

export const createLead = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = getTenantId(req);
    const repo = AppDataSource.getRepository(Lead);
    const assignedUser = await resolveLeadAssignee(
      tenantId,
      normalizeOptionalString(req.body.assignedUserId) ?? req.userId,
    );
    const { assignedUserId: _assignedUserId, ...leadBody } = req.body;
    const lead = repo.create({
      ...leadBody,
      tenantId,
      source: normalizeLeadSource(req.body.source),
      status: normalizeLeadStatus(req.body.status),
      tags: sanitizeTags(req.body.tags),
      assignedUserId: assignedUser?.id,
      createdByUserId: req.userId,
    } as Partial<Lead>);
    await repo.save(lead);
    await createLeadActivity({
      leadId: lead.id,
      tenantId,
      userId: req.userId,
      type: 'Lead Created',
      message: `Lead created (${lead.name}) with source ${lead.source}.`,
      metadata: {
        status: lead.status,
        source: lead.source,
        assignedUserId: lead.assignedUserId ?? null,
      },
    });

    if (assignedUser) {
      await createLeadActivity({
        leadId: lead.id,
        tenantId,
        userId: req.userId,
        type: 'Lead Assigned',
        message: `Lead assigned to ${assignedUser.fullName}.`,
        metadata: {
          assignedUserId: assignedUser.id,
        },
      });
    }

    // Notify admins of new lead
    notifyAdmins({
      tenantId,
      title: 'New Lead Created',
      message: `A new lead "${lead.name}" has been created from source: ${lead.source}.`,
      targetUrl: `/admin/crm/${lead.id}`,
    }).catch(err => console.error('Lead creation notification failed:', err));

    const [result] = await withLeadAssignees(tenantId, [lead]);
    res.deliver(201, true, result, 'Lead created');
  } catch (error) {
    next(error);
  }
};

export const updateLead = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = getTenantId(req);
    const repo = AppDataSource.getRepository(Lead);
    const lead = await repo.findOne({ where: { id: req.params.id, tenantId, isDeleted: false } });
    if (!lead) {
      throw new NotFoundError('Lead not found');
    }

    const previousStatus = lead.status;
    const previousAssignedUserId = lead.assignedUserId ?? null;
    const normalizedStatus =
      typeof req.body.status === 'string' ? normalizeLeadStatus(req.body.status) : undefined;
    const normalizedSource =
      typeof req.body.source === 'string' ? normalizeLeadSource(req.body.source) : undefined;
    const sanitizedTags = Array.isArray(req.body.tags) ? sanitizeTags(req.body.tags) : undefined;
    const hasAssignedUserId = Object.prototype.hasOwnProperty.call(req.body, 'assignedUserId');
    const assignedUser = hasAssignedUserId
      ? await resolveLeadAssignee(tenantId, req.body.assignedUserId)
      : undefined;
    const { assignedUserId: _assignedUserId, ...leadBody } = req.body;

    Object.assign(lead, {
      ...leadBody,
      ...(normalizedStatus ? { status: normalizedStatus } : {}),
      ...(normalizedSource ? { source: normalizedSource } : {}),
      ...(sanitizedTags !== undefined ? { tags: sanitizedTags } : {}),
      ...(hasAssignedUserId ? { assignedUserId: assignedUser?.id ?? null } : {}),
    });

    await repo.save(lead);

    if (lead.status !== previousStatus) {
      await createLeadActivity({
        leadId: lead.id,
        tenantId,
        userId: req.userId,
        type: 'Status Change',
        message: `Status changed from ${toDisplayLeadStatus(previousStatus)} to ${toDisplayLeadStatus(
          lead.status,
        )}.`,
        metadata: { from: previousStatus, to: lead.status },
      });

      // Notify admins of status change
      notifyAdmins({
        tenantId,
        title: 'Lead Status Updated',
        message: `Lead "${lead.name}" status changed to ${toDisplayLeadStatus(lead.status)}.`,
        targetUrl: `/admin/crm/${lead.id}`,
      }).catch(err => console.error('Lead status notification failed:', err));
    }

    if (hasAssignedUserId && (lead.assignedUserId ?? null) !== previousAssignedUserId) {
      await createLeadActivity({
        leadId: lead.id,
        tenantId,
        userId: req.userId,
        type: 'Lead Assigned',
        message: assignedUser ? `Lead assigned to ${assignedUser.fullName}.` : 'Lead unassigned.',
        metadata: {
          from: previousAssignedUserId,
          to: lead.assignedUserId ?? null,
        },
      });
    }

    const [result] = await withLeadAssignees(tenantId, [lead]);
    res.deliver(200, true, result, 'Lead updated');
  } catch (error) {
    next(error);
  }
};

export const deleteLead = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = getTenantId(req);
    const repo = AppDataSource.getRepository(Lead);
    const lead = await repo.findOne({ where: { id: req.params.id, tenantId, isDeleted: false } });
    if (!lead) {
      throw new NotFoundError('Lead not found');
    }
    lead.isDeleted = true;
    await repo.save(lead);
    await createLeadActivity({
      leadId: lead.id,
      tenantId,
      userId: req.userId,
      type: 'Lead Deleted',
      message: 'Lead removed from pipeline.',
    });
    res.deliver(200, true, lead, 'Lead removed');
  } catch (error) {
    next(error);
  }
};

export const createQuoteFromLead = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = getTenantId(req);
    const leadRepo = AppDataSource.getRepository(Lead);
    const quoteRepo = AppDataSource.getRepository(Quote);
    const customerRepo = AppDataSource.getRepository(Customer);
    const lead = await leadRepo.findOne({
      where: { id: req.params.id, tenantId, isDeleted: false },
    });
    if (!lead) {
      throw new NotFoundError('Lead not found');
    }
    if (lead.status === LeadStatus.LOST) {
      throw new BadRequestError('Cannot create quote for a lost lead.');
    }

    const customerId = normalizeOptionalString(req.body?.customerId);
    let customer: Customer | null = null;
    if (customerId) {
      customer = await customerRepo.findOne({
        where: { id: customerId, tenantId, isDeleted: false },
      });
      if (!customer) {
        throw new BadRequestError('Selected customer not found.');
      }
    }
    const siteId = normalizeOptionalString(req.body?.siteId);
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

    const sendNow = req.body?.sendNow === true;
    const providedTitle = String(req.body?.title ?? '').trim();
    const quoteTitle = providedTitle || `${lead.name} Quote`;
    const providedValidUntilRaw = req.body?.validUntil;
    const parsedValidUntil =
      providedValidUntilRaw == null || providedValidUntilRaw === ''
        ? undefined
        : new Date(providedValidUntilRaw);
    if (parsedValidUntil && Number.isNaN(parsedValidUntil.getTime())) {
      throw new BadRequestError('Valid until date is invalid.');
    }

    const rawItems = Array.isArray(req.body?.lineItems) ? req.body.lineItems : [];
    type NormalizedQuoteItem = {
      description: string;
      quantity: number;
      unitPrice: number;
      vatRate: number;
    };
    const normalizedItems: NormalizedQuoteItem[] = (
      rawItems.length > 0
        ? rawItems
        : [
            {
              description: lead.notes?.trim() || 'Service scope from lead',
              quantity: 1,
              unitPrice: 0,
              vatRate: 20,
            },
          ]
    )
      .map((item: any): NormalizedQuoteItem => ({
        description: String(item?.description ?? '').trim(),
        quantity: Number(item?.quantity ?? 0),
        unitPrice: Number(item?.unitPrice ?? 0),
        vatRate:
          item?.vatRate == null || item?.vatRate === ''
            ? 20
            : Number(item?.vatRate),
      }))
      .filter((item: NormalizedQuoteItem) => item.description);

    if (normalizedItems.length === 0) {
      throw new BadRequestError('At least one valid line item is required.');
    }
    const hasInvalidItem = normalizedItems.some(
      (item) =>
        !Number.isFinite(item.quantity) ||
        !Number.isFinite(item.unitPrice) ||
        !Number.isFinite(item.vatRate) ||
        item.quantity <= 0 ||
        item.unitPrice < 0 ||
        item.vatRate < 0,
    );
    if (hasInvalidItem) {
      throw new BadRequestError('Line items contain invalid quantity, price, or VAT values.');
    }

    const total = normalizedItems.reduce((acc: number, item: NormalizedQuoteItem) => {
      const lineTotal = item.quantity * item.unitPrice;
      const vatAmount = lineTotal * (item.vatRate / 100);
      return acc + lineTotal + vatAmount;
    }, 0);

    const publicToken = sendNow ? crypto.randomBytes(16).toString('hex') : undefined;
    const quote = quoteRepo.create({
      tenantId,
      quoteNumber: await reserveDocumentNumber(tenantId, 'quote'),
      customerId: customer?.id,
      siteId,
      recipientName: customer?.name ?? lead.name,
      recipientEmail: customer?.email ?? lead.email,
      recipientPhone: customer?.phone ?? lead.phone,
      leadId: lead.id,
      title: quoteTitle,
      status: sendNow ? QuoteStatus.SENT : QuoteStatus.DRAFT,
      lineItems: normalizedItems,
      total,
      validUntil: parsedValidUntil,
      notes: String(req.body?.notes ?? lead.notes ?? ''),
      termsAndConditions:
        req.body?.termsAndConditions == null ? undefined : String(req.body.termsAndConditions),
      publicToken,
      sentAt: sendNow ? new Date() : undefined,
    });
    await quoteRepo.save(quote);

    if (sendNow) {
      if (!lead.email) {
        quote.status = QuoteStatus.DRAFT;
        quote.publicToken = undefined;
        quote.sentAt = undefined;
        await quoteRepo.save(quote);
        throw new BadRequestError('Lead email is required to send quote.');
      }
      const link = await buildPublicQuoteUrl(tenantId, publicToken as string);
      try {
        await sendQuoteEmail(
          lead.email,
          link,
          {
            customerName: lead.name,
            quoteTitle,
          },
          { tenantId },
        );
      } catch (emailError) {
        quote.status = QuoteStatus.DRAFT;
        quote.publicToken = undefined;
        quote.sentAt = undefined;
        await quoteRepo.save(quote);
        throw emailError;
      }
    }

    await createLeadActivity({
      leadId: lead.id,
      tenantId,
      userId: req.userId,
      type: sendNow ? 'Quote Sent' : 'Quote Created',
      message: sendNow
        ? `Quote "${quote.title}" sent to ${lead.email}.`
        : `Draft quote "${quote.title}" created from lead.`,
      metadata: {
        quoteId: quote.id,
        recipientEmail: lead.email,
      },
    });

    res.deliver(
      201,
      true,
      {
        quote,
        recipient: {
          name: lead.name,
          email: lead.email,
          phone: lead.phone,
        },
      },
      sendNow ? 'Quote created and sent from lead' : 'Quote created from lead',
    );
  } catch (error) {
    next(error);
  }
};

export const convertLeadToJob = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = getTenantId(req);
    const leadRepo = AppDataSource.getRepository(Lead);
    const jobRepo = AppDataSource.getRepository(Job);
    const customerRepo = AppDataSource.getRepository(Customer);
    const quoteRepo = AppDataSource.getRepository(Quote);
    const lead = await leadRepo.findOne({ where: { id: req.params.id, tenantId, isDeleted: false } });
    if (!lead) {
      throw new NotFoundError('Lead not found');
    }
    const acceptedQuote = await quoteRepo.findOne({
      where: { tenantId, leadId: lead.id, status: QuoteStatus.SIGNED, isDeleted: false },
      order: { signedAt: 'DESC', updatedAt: 'DESC' },
    });
    if (!acceptedQuote) {
      throw new BadRequestError('Lead can be converted to job only after a related quote is accepted.');
    }

    const hasScheduledAt = Boolean(req.body?.scheduledAt);
    const hasScheduledEndAt = Boolean(req.body?.scheduledEndAt);
    if (hasScheduledAt !== hasScheduledEndAt) {
      throw new BadRequestError('Both start and end schedule times are required.');
    }

    let scheduledAt: Date | undefined;
    let scheduledEndAt: Date | undefined;
    if (hasScheduledAt && hasScheduledEndAt) {
      const parsedStart = new Date(req.body.scheduledAt);
      const parsedEnd = new Date(req.body.scheduledEndAt);
      if (Number.isNaN(parsedStart.getTime()) || Number.isNaN(parsedEnd.getTime())) {
        throw new BadRequestError('Invalid schedule date/time provided.');
      }
      if (parsedEnd <= parsedStart) {
        throw new BadRequestError('Schedule end time must be after start time.');
      }
      scheduledAt = parsedStart;
      scheduledEndAt = parsedEnd;
    }

    const rawAmount = req.body?.amount;
    const parsedAmount =
      rawAmount === undefined || rawAmount === null || rawAmount === ''
        ? undefined
        : Number(rawAmount);
    if (parsedAmount !== undefined && (!Number.isFinite(parsedAmount) || parsedAmount < 0)) {
      throw new BadRequestError('Job amount must be a valid number greater than or equal to 0.');
    }

    const activitySnapshot = await buildLeadActivitySnapshot(tenantId, lead.id);
    const previousStatus = lead.status;
    const featureFlags = await loadTenantFeatureFlags(tenantId);
    let customer: Customer | null = null;
    if (req.body.customerId) {
      customer = await customerRepo.findOne({
        where: { id: req.body.customerId, tenantId, isDeleted: false },
      });
      if (!customer) {
        throw new BadRequestError('Selected customer not found for this workspace.');
      }
    } else if (acceptedQuote.customerId) {
      customer = await customerRepo.findOne({
        where: { id: acceptedQuote.customerId, tenantId, isDeleted: false },
      });
    } else {
      throw new BadRequestError('Customer is required before converting a lead to a job.');
    }
    if (!customer) {
      throw new BadRequestError('Customer is required before converting a lead to a job.');
    }
    const siteId = normalizeOptionalString(req.body.siteId) ?? acceptedQuote.siteId;
    let site: CustomerSite | null = null;
    if (featureFlags.sites && !siteId) {
      throw new BadRequestError('Customer site is required before converting a lead to a job.');
    }
    if (siteId) {
      await assertTenantFeatureEnabled(tenantId, 'sites', 'Sites module is not enabled for this workspace.');
      if (!customer) {
        throw new BadRequestError('Select a customer before linking a site to the job.');
      }
      site = await ensureCustomerSiteForTenant(tenantId, siteId);
      if (site.customerId !== customer.id) {
        throw new BadRequestError('Selected site does not belong to the chosen customer.');
      }
    }
    const addressSnapshot = buildJobAddressSnapshot(req.body, site);
    const jobLocation =
      normalizeOptionalString(req.body.location) ||
      formatJobAddress(addressSnapshot) ||
      (site ? buildCustomerSiteAddress(site) : undefined);

    const job = jobRepo.create({
      tenantId,
      title: lead.name,
      description: lead.notes ?? '',
      location: jobLocation,
      ...addressSnapshot,
      addressManuallyEdited: req.body.addressManuallyEdited === true,
      priority: req.body.priority,
      amount: parsedAmount ?? Number(acceptedQuote.total ?? 0),
      scheduledAt,
      scheduledEndAt,
      status: JobStatus.NOT_ASSIGNED,
      customerId: customer?.id,
      siteId,
      leadId: lead.id,
      leadSource: lead.source,
      leadActivitySnapshot: activitySnapshot,
    });
    await jobRepo.save(job);
    await ensureJobNumber(job);
    const adminUser = await AppDataSource.getRepository(User)
      .createQueryBuilder('user')
      .leftJoinAndSelect('user.roles', 'role')
      .where('user.tenantId = :tenantId', { tenantId })
      .andWhere('user.isDeleted = false')
      .andWhere('user.isActive = true')
      .andWhere('role.code = :adminRole', { adminRole: SystemRole.ADMIN })
      .getOne();
    const assignmentTask = AppDataSource.getRepository(LeadTask).create({
      tenantId,
      leadId: lead.id,
      title: `Assign crew for job "${job.title}"`,
      taskType: 'JOB_ASSIGNMENT',
      description: `Accepted quote ${acceptedQuote.quoteNumber ?? acceptedQuote.id} was converted to a job. Assign the job to the right crew.`,
      status: LeadTaskStatus.OPEN,
      assigneeUserId: adminUser?.id ?? req.userId,
      createdByUserId: req.userId,
    });
    await AppDataSource.getRepository(LeadTask).save(assignmentTask);

    const leadQuotes = await quoteRepo.find({
      where: { tenantId, leadId: lead.id, isDeleted: false },
    });
    if (leadQuotes.length > 0) {
      let changed = false;
      for (const quote of leadQuotes) {
        if (quote.jobId !== job.id) {
          quote.jobId = job.id;
          changed = true;
        }
        if (!quote.customerId) {
          quote.customerId = customer?.id;
          changed = true;
        }
        if (!quote.siteId && siteId) {
          quote.siteId = siteId;
          changed = true;
        }
        if (!quote.recipientName) {
          quote.recipientName = customer?.name ?? lead.name;
          changed = true;
        }
        if (!quote.recipientEmail) {
          quote.recipientEmail = customer?.email ?? lead.email;
          changed = true;
        }
        if (!quote.recipientPhone && (customer?.phone || lead.phone)) {
          quote.recipientPhone = customer?.phone ?? lead.phone;
          changed = true;
        }
      }
      if (changed) {
        await quoteRepo.save(leadQuotes);
      }
    }

    if (lead.status !== LeadStatus.CONVERTED) {
      lead.status = LeadStatus.CONVERTED;
      await leadRepo.save(lead);
      await createLeadActivity({
        leadId: lead.id,
        tenantId,
        userId: req.userId,
        type: 'Status Change',
        message: `Status changed from ${toDisplayLeadStatus(previousStatus)} to ${toDisplayLeadStatus(
          LeadStatus.CONVERTED,
        )}.`,
        metadata: {
          from: previousStatus,
          to: LeadStatus.CONVERTED,
          via: 'job-conversion',
          quoteId: acceptedQuote.id,
        },
      });
    }

    await createLeadActivity({
      leadId: lead.id,
      tenantId,
      userId: req.userId,
      type: 'Converted to Job',
      message: `Lead converted to job "${job.title}".`,
      metadata: {
        jobId: job.id,
        leadSource: lead.source,
        activityCount: activitySnapshot.length,
        quoteId: acceptedQuote.id,
      },
    });

    if (customer?.email) {
      if (!customer.portalToken) {
        customer.portalToken = crypto.randomBytes(12).toString('hex');
        await customerRepo.save(customer);
      }
      const access = await ensureCustomerPortalAccess({
        tenantId,
        customer,
        nextPath: '/portal/jobs',
      });
      if (access.onboardingLink) {
        await sendLeadConvertedToJobEmail(
          customer.email,
          {
            customerName: customer.name,
            leadName: lead.name,
            jobTitle: job.title,
            onboardingLink: access.onboardingLink,
            loginLink: access.loginLink,
          },
          { tenantId },
        );
        await createLeadActivity({
          leadId: lead.id,
          tenantId,
          userId: req.userId,
          type: 'Customer Notified',
          message: 'Customer onboarding email sent after job conversion.',
          metadata: {
            customerId: customer.id,
            mode: 'onboarding',
            quoteId: acceptedQuote.id,
          },
        });
      }
    }

    // Notify admins of job conversion
    notifyAdmins({
      tenantId,
      title: 'Lead Converted to Job',
      message: `Lead "${lead.name}" has been successfully converted to job: ${job.title}.`,
      targetUrl: `/admin/schedule/${job.id}`,
    }).catch(err => console.error('Lead conversion notification failed:', err));

    res.deliver(201, true, { lead, job }, 'Lead converted to job');
  } catch (error) {
    next(error);
  }
};

export const listLeadDocuments = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = getTenantId(req);
    const lead = await AppDataSource.getRepository(Lead).findOne({
      where: { id: req.params.id, tenantId, isDeleted: false },
    });
    if (!lead) {
      throw new NotFoundError('Lead not found');
    }
    const docs = await AppDataSource.getRepository(DocumentItem).find({
      where: {
        tenantId,
        isDeleted: false,
        relatedEntityType: 'lead',
        relatedEntityId: lead.id,
      },
      order: { createdAt: 'DESC' },
    });
    res.deliver(
      200,
      true,
      docs.map((doc) => withResolvedFileUrl(doc)),
      'Lead documents fetched',
    );
  } catch (error) {
    next(error);
  }
};

export const listLeadQuotes = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = getTenantId(req);
    const lead = await AppDataSource.getRepository(Lead).findOne({
      where: { id: req.params.id, tenantId, isDeleted: false },
    });
    if (!lead) {
      throw new NotFoundError('Lead not found');
    }

    const quoteRepo = AppDataSource.getRepository(Quote);
    const quotes = await quoteRepo.find({
      where: { tenantId, leadId: lead.id, isDeleted: false },
      order: { createdAt: 'DESC' },
    });

    await Promise.all(
      quotes.map(async (quote) => {
        if (!quote.quoteNumber) {
          await ensureQuoteNumber(quote);
        }
      }),
    );

    res.deliver(200, true, quotes, 'Lead quotes fetched');
  } catch (error) {
    next(error);
  }
};

export const uploadLeadAttachment = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = getTenantId(req);
    const lead = await AppDataSource.getRepository(Lead).findOne({
      where: { id: req.params.id, tenantId, isDeleted: false },
    });
    if (!lead) {
      throw new NotFoundError('Lead not found');
    }
    const file = req.file as Express.Multer.File | undefined;
    if (!file) {
      throw new BadRequestError('No file uploaded');
    }

    const storedKey = normalizeStoredFileReference(toStoredUploadKey(file.path));
    if (!storedKey) {
      throw new BadRequestError('Stored file path not available');
    }

    const documentName =
      String(req.body?.name ?? '').trim() || file.originalname || 'Lead Attachment';
    const category = String(req.body?.category ?? '').trim() || 'Leads';
    const documentRepo = AppDataSource.getRepository(DocumentItem);
    const activeIntegration = await hasActiveIntegration(tenantId);
    const document = documentRepo.create({
      tenantId,
      name: documentName,
      category,
      fileUrl: storedKey,
      relatedEntityType: 'lead',
      relatedEntityId: lead.id,
    }) as unknown as DocumentItem;

    if (activeIntegration) {
      document.syncStatus = SyncStatus.PENDING;
    }
    await documentRepo.save(document);

    let syncWarning: string | null = null;
    if (activeIntegration) {
      const pushQueued = await enqueueDocumentPush({
        tenantId,
        documentId: document.id,
      });
      if (!pushQueued) {
        try {
          await syncDocumentToProvider(document);
        } catch (error: any) {
          syncWarning = error?.message ?? 'Lead attachment saved, but sync failed';
        }
      }
    }

    await createLeadActivity({
      leadId: lead.id,
      tenantId,
      userId: req.userId,
      type: 'Attachment Uploaded',
      message: `Attachment uploaded: ${documentName}.`,
      metadata: {
        documentId: document.id,
        category,
      },
    });

    res.deliver(
      201,
      true,
      {
        ...withResolvedFileUrl(document),
        syncWarning,
      },
      syncWarning ? 'Lead attachment uploaded with sync warning' : 'Lead attachment uploaded',
    );
  } catch (error) {
    next(error);
  }
};

export const listLeadAssignableUsers = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const tenantId = getTenantId(req);
    const users = await AppDataSource.getRepository(User).find({
      where: { tenantId, isDeleted: false, isActive: true },
      order: { createdAt: 'ASC' },
      relations: ['roles'],
    });
    const result = users
      .filter((user) => isInternalAssignableUser(user))
      .map((user) => ({
        id: user.id,
        fullName: user.fullName,
        email: user.email,
        roles: (user.roles ?? []).map((role) => role.code),
      }));
    res.deliver(200, true, result, 'Assignable users fetched');
  } catch (error) {
    next(error);
  }
};

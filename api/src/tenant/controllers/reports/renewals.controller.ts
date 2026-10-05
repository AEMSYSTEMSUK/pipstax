import { NextFunction, Request, Response } from 'express';
import { AppDataSource } from '../../../config/data-source';
import { QuoteStatus } from '../../../constants/status';
import { Tenant } from '../../../entities/tenant.entity';
import { Customer } from '../../../entities/customer.entity';
import { Quote } from '../../../entities/quote.entity';
import { RenewalOpportunity } from '../../../entities/renewal-opportunity.entity';
import { User } from '../../../entities/user.entity';
import {
  buildRenewalSummary,
  computeRenewalTimingState,
  serializeRenewalOpportunities,
  syncRenewalOpportunitiesForTenant,
} from '../../../services/renewals.service';
import { reserveDocumentNumber } from '../../../services/document-number.service';
import { normalizeTenantFeatureFlags } from '../../../services/tenant-features.service';
import { resolveWorkflowStageKeyForRecord } from '../../../services/workflow-config.service';
import { createInAppNotification } from '../../../services/in-app-notifications.service';
import { BadRequestError, NotFoundError } from '../../../utils/errors';
import { getTenantId } from '../../../utils/request';

const ALLOWED_RENEWAL_STATUSES = new Set([
  'OPEN',
  'OVERDUE',
  'ON_HOLD',
  'QUOTED',
  'CHASED',
  'WON',
  'LOST',
  'COMPLETED',
  'CLOSED',
]);

const CLOSED_RENEWAL_STATUSES = new Set(['WON', 'LOST', 'COMPLETED', 'CLOSED']);

const normalizeOptionalString = (value: unknown) => {
  if (typeof value !== 'string') {
    return undefined;
  }
  const nextValue = value.trim();
  return nextValue.length > 0 ? nextValue : undefined;
};

const parseOptionalDate = (value: unknown, fieldLabel: string) => {
  const nextValue = normalizeOptionalString(value);
  if (!nextValue) {
    return undefined;
  }

  const parsed = new Date(nextValue);
  if (Number.isNaN(parsed.getTime())) {
    throw new BadRequestError(`${fieldLabel} is not a valid date`);
  }
  return parsed;
};

const parseOptionalAmount = (value: unknown) => {
  if (value == null || value === '') {
    return undefined;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new BadRequestError('Estimated value must be a valid positive number');
  }
  return Number(parsed.toFixed(2));
};

const parseQuoteLineItems = (value: unknown) => {
  if (!Array.isArray(value) || value.length === 0) {
    return null;
  }

  return value.map((item, index) => {
    const description = normalizeOptionalString(item?.description);
    const quantity = Number(item?.quantity ?? 0);
    const unitPrice = Number(item?.unitPrice ?? 0);
    const vatRate = Number(item?.vatRate ?? item?.taxRate ?? 20);

    if (!description) {
      throw new BadRequestError(`Line item ${index + 1} description is required`);
    }
    if (!Number.isFinite(quantity) || quantity <= 0) {
      throw new BadRequestError(`Line item ${index + 1} quantity must be greater than zero`);
    }
    if (!Number.isFinite(unitPrice) || unitPrice < 0) {
      throw new BadRequestError(`Line item ${index + 1} unit price must be zero or greater`);
    }
    if (!Number.isFinite(vatRate) || vatRate < 0) {
      throw new BadRequestError(`Line item ${index + 1} VAT rate must be zero or greater`);
    }

    return {
      description,
      quantity,
      unitPrice: Number(unitPrice.toFixed(2)),
      vatRate: Number(vatRate.toFixed(2)),
    };
  });
};

const calculateQuoteTotal = (lineItems: Array<{ quantity: number; unitPrice: number; vatRate?: number }>) =>
  Number(
    lineItems
      .reduce((sum, item) => {
        const subtotal = Number(item.quantity ?? 0) * Number(item.unitPrice ?? 0);
        return sum + subtotal + subtotal * (Number(item.vatRate ?? 0) / 100);
      }, 0)
      .toFixed(2),
  );

const ensureOwnerForTenant = async (tenantId: string, ownerUserId: string) => {
  const user = await AppDataSource.getRepository(User).findOne({
    where: { id: ownerUserId, tenantId, isDeleted: false },
  });
  if (!user) {
    throw new NotFoundError('Owner not found');
  }
  return user;
};

const ensureQuoteForRenewal = async (tenantId: string, renewal: RenewalOpportunity, quoteId: string) => {
  const quote = await AppDataSource.getRepository(Quote).findOne({
    where: { id: quoteId, tenantId, isDeleted: false },
  });
  if (!quote) {
    throw new NotFoundError('Quote not found');
  }
  if (quote.customerId !== renewal.customerId) {
    throw new BadRequestError('Quote does not belong to the same customer as this renewal');
  }
  if (renewal.siteId && quote.siteId !== renewal.siteId) {
    throw new BadRequestError('Quote does not belong to the same site as this renewal');
  }
  return quote;
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

export const listRenewalOpportunities = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const tenantId = getTenantId(req);
    const repo = AppDataSource.getRepository(RenewalOpportunity);
    const qb = repo
      .createQueryBuilder('renewal')
      .where('renewal.tenantId = :tenantId', { tenantId })
      .andWhere('renewal.isDeleted = false');

    const status = normalizeOptionalString(req.query.status);
    if (status && status.toUpperCase() !== 'ALL') {
      const normalizedStatus = status.toUpperCase();
      if (normalizedStatus === 'OVERDUE') {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        qb.andWhere('renewal.dueDate < :today', { today });
        qb.andWhere('UPPER(renewal.status) NOT IN (:...closedStatuses)', {
          closedStatuses: Array.from(CLOSED_RENEWAL_STATUSES),
        });
      } else if (normalizedStatus === 'DUE_SOON') {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const dueSoonCutoff = new Date(today);
        dueSoonCutoff.setDate(dueSoonCutoff.getDate() + 31);
        qb.andWhere('renewal.dueDate >= :today AND renewal.dueDate < :dueSoonCutoff', {
          today,
          dueSoonCutoff,
        });
        qb.andWhere('UPPER(renewal.status) NOT IN (:...closedStatuses)', {
          closedStatuses: Array.from(CLOSED_RENEWAL_STATUSES),
        });
      } else {
        qb.andWhere('UPPER(renewal.status) = :status', { status: normalizedStatus });
      }
    }

    const ownerUserId = normalizeOptionalString(req.query.ownerUserId);
    if (ownerUserId) {
      qb.andWhere('renewal.ownerUserId = :ownerUserId', { ownerUserId });
    }

    const customerId = normalizeOptionalString(req.query.customerId);
    if (customerId) {
      qb.andWhere('renewal.customerId = :customerId', { customerId });
    }

    const siteId = normalizeOptionalString(req.query.siteId);
    if (siteId) {
      qb.andWhere('renewal.siteId = :siteId', { siteId });
    }

    const reportType = normalizeOptionalString(req.query.reportType);
    if (reportType) {
      qb.andWhere('LOWER(renewal.reportType) = :reportType', {
        reportType: reportType.toLowerCase(),
      });
    }

    const dueMonth = normalizeOptionalString(req.query.dueMonth);
    if (dueMonth) {
      const [year, month] = dueMonth.split('-').map((value) => Number(value));
      if (!year || !month || month < 1 || month > 12) {
        throw new BadRequestError('Due month must be in YYYY-MM format');
      }
      const start = new Date(year, month - 1, 1);
      const end = new Date(year, month, 1);
      qb.andWhere('renewal.dueDate >= :start AND renewal.dueDate < :end', { start, end });
    }

    qb.orderBy('renewal.dueDate', 'ASC').addOrderBy('renewal.createdAt', 'DESC');

    const renewals = await qb.getMany();
    const items = await serializeRenewalOpportunities(renewals);
    const summary = buildRenewalSummary(items);

    res.deliver(200, true, { items, summary }, 'Renewal opportunities fetched');
  } catch (error) {
    next(error);
  }
};

export const updateRenewalOpportunity = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const tenantId = getTenantId(req);
    const repo = AppDataSource.getRepository(RenewalOpportunity);
    const renewal = await repo.findOne({
      where: { id: req.params.id, tenantId, isDeleted: false },
    });
    if (!renewal) {
      throw new NotFoundError('Renewal opportunity not found');
    }
    const previousOwnerUserId = renewal.ownerUserId;

    const nextStatus = normalizeOptionalString(req.body.status)?.toUpperCase();
    if (nextStatus && !ALLOWED_RENEWAL_STATUSES.has(nextStatus)) {
      throw new BadRequestError('Unsupported renewal status');
    }

    const ownerUserId = normalizeOptionalString(req.body.ownerUserId);
    if (ownerUserId) {
      await ensureOwnerForTenant(tenantId, ownerUserId);
    }

    const quoteId = normalizeOptionalString(req.body.quoteId);
    if (quoteId) {
      await ensureQuoteForRenewal(tenantId, renewal, quoteId);
    }

    renewal.status = nextStatus ?? renewal.status;
    renewal.ownerUserId = ownerUserId;
    renewal.quoteId = quoteId;
    renewal.estimatedValue = parseOptionalAmount(req.body.estimatedValue);
    renewal.lastQuotedAt = parseOptionalDate(req.body.lastQuotedAt, 'Last quoted at');
    renewal.lastChasedAt = parseOptionalDate(req.body.lastChasedAt, 'Last chased at');
    renewal.notes = normalizeOptionalString(req.body.notes);

    if (renewal.status === 'QUOTED' && !renewal.lastQuotedAt) {
      renewal.lastQuotedAt = new Date();
    }
    if (renewal.status === 'CHASED' && !renewal.lastChasedAt) {
      renewal.lastChasedAt = new Date();
    }

    if (CLOSED_RENEWAL_STATUSES.has(renewal.status)) {
      renewal.closedAt = renewal.closedAt ?? new Date();
    } else {
      renewal.closedAt = undefined;
    }

    await repo.save(renewal);
    if (ownerUserId && ownerUserId !== previousOwnerUserId && ownerUserId !== req.userId) {
      await createInAppNotification({
        tenantId,
        userId: ownerUserId,
        title: 'Renewal Assigned',
        message: `You have been assigned renewal "${renewal.title}".`,
        targetUrl: '/admin/renewals',
      }).catch((error) => {
        console.error('Renewal assignment notification failed:', error);
      });
    }
    const [payload] = await serializeRenewalOpportunities([renewal]);
    res.deliver(200, true, payload ?? renewal, 'Renewal opportunity updated');
  } catch (error) {
    next(error);
  }
};

export const createQuoteFromRenewal = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const tenantId = getTenantId(req);
    const renewalRepo = AppDataSource.getRepository(RenewalOpportunity);
    const quoteRepo = AppDataSource.getRepository(Quote);
    const customerRepo = AppDataSource.getRepository(Customer);

    const renewal = await renewalRepo.findOne({
      where: { id: req.params.id, tenantId, isDeleted: false },
    });
    if (!renewal) {
      throw new NotFoundError('Renewal opportunity not found');
    }

    if (renewal.quoteId) {
      const existingQuote = await quoteRepo.findOne({
        where: { id: renewal.quoteId, tenantId, isDeleted: false },
      });
      if (existingQuote) {
        throw new BadRequestError('This renewal already has a linked quote.');
      }
      renewal.quoteId = undefined;
    }

    const customer = await customerRepo.findOne({
      where: { id: renewal.customerId, tenantId, isDeleted: false },
    });
    if (!customer) {
      throw new NotFoundError('Customer not found for this renewal.');
    }

    const estimatedValue = Number(renewal.estimatedValue ?? 0);
    const safeEstimatedValue = Number.isFinite(estimatedValue) && estimatedValue >= 0 ? estimatedValue : 0;
    const titlePrefix = normalizeOptionalString(req.body?.title);
    const submittedLineItems = parseQuoteLineItems(req.body?.lineItems);
    const lineItems =
      submittedLineItems ??
      [
        {
          description:
            normalizeOptionalString(req.body?.lineItemDescription) ??
            ([renewal.title, renewal.reportType, renewal.reference].filter(Boolean).join(' • ') ||
              'Renewal follow-up work'),
          quantity: 1,
          unitPrice: Number(safeEstimatedValue.toFixed(2)),
          vatRate:
            Number.isFinite(Number(req.body?.vatRate)) && Number(req.body?.vatRate) >= 0
              ? Number(req.body.vatRate)
              : 20,
        },
      ];
    const quoteTotal =
      req.body?.total !== undefined && Number.isFinite(Number(req.body.total))
        ? Number(Number(req.body.total).toFixed(2))
        : calculateQuoteTotal(lineItems);
    const quote = quoteRepo.create({
      tenantId,
      customerId: renewal.customerId,
      siteId: renewal.siteId,
      jobId: renewal.sourceJobId ?? undefined,
      recipientName: customer.name ?? undefined,
      recipientEmail: customer.email ?? undefined,
      recipientPhone: customer.phone ?? undefined,
      quoteNumber: await reserveDocumentNumber(tenantId, 'quote'),
      title: titlePrefix ?? `${renewal.title} Renewal Quote`,
      notes: normalizeOptionalString(req.body?.notes) ?? renewal.notes ?? undefined,
      termsAndConditions: normalizeOptionalString(req.body?.termsAndConditions),
      validUntil:
        normalizeOptionalString(req.body?.validUntil)
          ? new Date(String(req.body.validUntil))
          : new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
      status: QuoteStatus.DRAFT,
      lineItems,
      total: quoteTotal,
    } as Partial<Quote>);

    quote.workflowStageKey = await resolveWorkflowStageKeyForRecord({
      tenantId,
      module: 'quotes',
      baseStatus: quote.status,
      featureEnabled: await isWorkflowOverlayEnabled(tenantId),
    });

    await quoteRepo.save(quote);

    renewal.quoteId = quote.id;
    renewal.lastQuotedAt = new Date();
    const submittedEstimatedValue = parseOptionalAmount(req.body?.estimatedValue);
    if (typeof submittedEstimatedValue !== 'undefined') {
      renewal.estimatedValue = submittedEstimatedValue;
    } else if (submittedLineItems) {
      renewal.estimatedValue = Number(
        submittedLineItems.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0).toFixed(2),
      );
    }
    if (['OPEN', 'OVERDUE', 'DUE_SOON', 'ON_HOLD'].includes(String(renewal.status ?? '').toUpperCase())) {
      renewal.status = 'QUOTED';
    }
    await renewalRepo.save(renewal);

    const items = await serializeRenewalOpportunities([renewal]);
    res.deliver(
      201,
      true,
      {
        renewal: items[0] ?? renewal,
        quote: {
          id: quote.id,
          quoteNumber: quote.quoteNumber,
          title: quote.title,
          status: quote.status,
        },
      },
      'Quote created from renewal',
    );
  } catch (error) {
    next(error);
  }
};

export const syncRenewalRegister = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const tenantId = getTenantId(req);
    const syncResult = await syncRenewalOpportunitiesForTenant(tenantId);

    const renewals = await AppDataSource.getRepository(RenewalOpportunity).find({
      where: { tenantId, isDeleted: false },
      order: { dueDate: 'ASC', createdAt: 'DESC' },
    });
    const items = await serializeRenewalOpportunities(renewals);
    const summary = buildRenewalSummary(items);

    res.deliver(
      200,
      true,
      { items, summary, sync: syncResult },
      'Renewal register refreshed',
    );
  } catch (error) {
    next(error);
  }
};

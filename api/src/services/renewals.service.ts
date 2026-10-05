import { AppDataSource } from '../config/data-source';
import { ComplianceRecord } from '../entities/compliance-record.entity';
import { Customer } from '../entities/customer.entity';
import { CustomerSite } from '../entities/customer-site.entity';
import { Quote } from '../entities/quote.entity';
import { RenewalOpportunity } from '../entities/renewal-opportunity.entity';
import { User } from '../entities/user.entity';
import { loadTenantFeatureFlags } from './tenant-features.service';
import {
  DEFAULT_TENANT_WORKFLOW_CONFIG,
  getWorkflowDisplayState,
  loadTenantWorkflowConfig,
} from './workflow-config.service';

const CLOSED_RENEWAL_STATUSES = new Set(['WON', 'LOST', 'COMPLETED', 'CLOSED']);

const buildRenewalWindowStart = (dueDate: Date) => {
  const nextDate = new Date(dueDate);
  nextDate.setDate(nextDate.getDate() - 30);
  return nextDate;
};

const computeQuoteSubtotal = (quote?: Quote | null) => {
  if (!quote || !Array.isArray(quote.lineItems)) {
    return null;
  }

  const subtotal = quote.lineItems.reduce((acc, item) => {
    const quantity = Number(item?.quantity ?? 0);
    const unitPrice = Number(item?.unitPrice ?? 0);
    return acc + quantity * unitPrice;
  }, 0);

  return Number.isFinite(subtotal) ? Number(subtotal.toFixed(2)) : null;
};

export const computeRenewalTimingState = (
  dueDate?: Date | string | null,
  status?: string | null,
) => {
  if (!dueDate) {
    return 'UNSCHEDULED';
  }

  const normalizedStatus = String(status ?? '').trim().toUpperCase();
  if (CLOSED_RENEWAL_STATUSES.has(normalizedStatus)) {
    return 'CLOSED';
  }

  const due = dueDate instanceof Date ? dueDate : new Date(dueDate);
  if (Number.isNaN(due.getTime())) {
    return 'UNSCHEDULED';
  }

  const now = new Date();
  const midnightToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dueMidnight = new Date(due.getFullYear(), due.getMonth(), due.getDate());
  const diffDays = Math.ceil((dueMidnight.getTime() - midnightToday.getTime()) / (1000 * 60 * 60 * 24));

  if (diffDays < 0) {
    return 'OVERDUE';
  }
  if (diffDays <= 30) {
    return 'DUE_SOON';
  }
  return 'UPCOMING';
};

export const syncRenewalOpportunityForComplianceRecord = async (record: ComplianceRecord) => {
  const repo = AppDataSource.getRepository(RenewalOpportunity);
  const existing = await repo.findOne({
    where: {
      tenantId: record.tenantId,
      sourceComplianceRecordId: record.id,
      isDeleted: false,
    },
  });

  const shouldTrack =
    !record.isDeleted &&
    ['APPROVED', 'EXPIRED'].includes(String(record.reviewStatus ?? '').trim().toUpperCase()) &&
    Boolean(record.validUntil);

  if (!shouldTrack) {
    if (existing) {
      existing.isDeleted = true;
      await repo.save(existing);
    }
    return null;
  }

  const dueDate = new Date(record.validUntil as Date);
  const renewal = existing ?? repo.create();

  renewal.tenantId = record.tenantId;
  renewal.customerId = record.customerId;
  renewal.siteId = record.siteId;
  renewal.title = record.title;
  renewal.reportType = record.reportType;
  renewal.reference = record.reference;
  renewal.outcome = record.outcome;
  renewal.dueDate = dueDate;
  renewal.renewalWindowStart = buildRenewalWindowStart(dueDate);
  renewal.sourceComplianceRecordId = record.id;
  renewal.sourceJobId = record.jobId;
  if (record.expectedRenewalValue !== null && typeof record.expectedRenewalValue !== 'undefined') {
    renewal.estimatedValue = Number(record.expectedRenewalValue);
  }

  if (!existing) {
    renewal.status = computeRenewalTimingState(dueDate) === 'OVERDUE' ? 'OVERDUE' : 'OPEN';
  } else if (!CLOSED_RENEWAL_STATUSES.has(String(existing.status ?? '').toUpperCase())) {
    renewal.status =
      String(existing.status ?? '').trim().length > 0 ? existing.status : 'OPEN';
  }

  await repo.save(renewal);
  return renewal;
};

export const removeRenewalOpportunityForComplianceRecord = async (
  tenantId: string,
  complianceRecordId: string,
) => {
  const repo = AppDataSource.getRepository(RenewalOpportunity);
  const renewal = await repo.findOne({
    where: { tenantId, sourceComplianceRecordId: complianceRecordId, isDeleted: false },
  });
  if (!renewal) {
    return null;
  }
  renewal.isDeleted = true;
  await repo.save(renewal);
  return renewal;
};

export const syncRenewalOpportunitiesForTenant = async (tenantId: string) => {
  const records = await AppDataSource.getRepository(ComplianceRecord).find({
    where: { tenantId },
    order: { updatedAt: 'ASC' },
  });

  let tracked = 0;
  let removed = 0;

  for (const record of records) {
    const renewal = await syncRenewalOpportunityForComplianceRecord(record);
    if (renewal) {
      tracked += 1;
    } else {
      removed += 1;
    }
  }

  return {
    scanned: records.length,
    tracked,
    removed,
  };
};

export const serializeRenewalOpportunities = async (opportunities: RenewalOpportunity[]) => {
  const tenantId = opportunities[0]?.tenantId;
  const customerIds = Array.from(new Set(opportunities.map((item) => item.customerId).filter(Boolean)));
  const siteIds = Array.from(new Set(opportunities.map((item) => item.siteId).filter(Boolean)));
  const ownerIds = Array.from(
    new Set(opportunities.map((item) => item.ownerUserId).filter((value): value is string => Boolean(value))),
  );
  const quoteIds = Array.from(
    new Set(opportunities.map((item) => item.quoteId).filter((value): value is string => Boolean(value))),
  );

  const [customers, sites, owners, quotes] = await Promise.all([
    customerIds.length > 0
      ? AppDataSource.getRepository(Customer).find({
          where: customerIds.map((id) => ({ id, isDeleted: false })),
        })
      : Promise.resolve([] as Customer[]),
    siteIds.length > 0
      ? AppDataSource.getRepository(CustomerSite).find({
          where: siteIds.map((id) => ({ id, isDeleted: false })),
        })
      : Promise.resolve([] as CustomerSite[]),
    ownerIds.length > 0
      ? AppDataSource.getRepository(User).find({
          where: ownerIds.map((id) => ({ id, isDeleted: false })),
        })
      : Promise.resolve([] as User[]),
    quoteIds.length > 0
      ? AppDataSource.getRepository(Quote).find({
          where: quoteIds.map((id) => ({ id, isDeleted: false })),
        })
      : Promise.resolve([] as Quote[]),
  ]);
  const workflowFeatures = tenantId ? await loadTenantFeatureFlags(tenantId) : null;
  const workflowEnabled = Boolean(workflowFeatures?.complianceWorkflows);
  const workflowConfig =
    tenantId && workflowEnabled
      ? await loadTenantWorkflowConfig(tenantId)
      : DEFAULT_TENANT_WORKFLOW_CONFIG;

  const customerMap = new Map(customers.map((customer) => [customer.id, customer]));
  const siteMap = new Map(sites.map((site) => [site.id, site]));
  const ownerMap = new Map(owners.map((owner) => [owner.id, owner]));
  const quoteMap = new Map(quotes.map((quote) => [quote.id, quote]));

  return opportunities.map((item) => {
    const customer = customerMap.get(item.customerId);
    const site = siteMap.get(item.siteId);
    const owner = item.ownerUserId ? ownerMap.get(item.ownerUserId) : null;
    const quote = item.quoteId ? quoteMap.get(item.quoteId) : null;
    const quoteSubtotal = computeQuoteSubtotal(quote);
    const derivedEstimatedValue =
      item.estimatedValue != null
        ? Number(item.estimatedValue)
        : quoteSubtotal != null
          ? quoteSubtotal
          : null;
    const quoteWorkflowDisplay = quote
      ? getWorkflowDisplayState({
          config: workflowConfig,
          module: 'quotes',
          baseStatus: quote.status,
          workflowStageKey: quote.workflowStageKey,
          enabled: workflowEnabled,
        })
      : null;

    return {
      ...item,
      customerName: customer?.name ?? null,
      siteName: site?.name ?? null,
      siteReference: site?.reference ?? null,
      siteCategory: site?.category ?? null,
      ownerName: owner?.fullName ?? null,
      quoteId: quote?.id ?? null,
      quoteNumber: quote?.quoteNumber ?? null,
      quoteStatus: quote?.status ?? null,
      quoteWorkflowStatusLabel: quoteWorkflowDisplay?.workflowStatusLabel ?? null,
      quoteWorkflowBaseStatus: quoteWorkflowDisplay?.workflowBaseStatus ?? null,
      estimatedValue: derivedEstimatedValue,
      timingState: computeRenewalTimingState(item.dueDate, item.status),
    };
  });
};

export const buildRenewalSummary = (
  items: Array<{
    status?: string | null;
    timingState?: string | null;
    estimatedValue?: number | null;
  }>,
) =>
  items.reduce(
    (acc, item) => {
      const timingState = String(item.timingState ?? '');
      const normalizedStatus = String(item.status ?? '').toUpperCase();

      if (timingState !== 'CLOSED') {
        acc.total += 1;
      }
      acc.pipelineValue += Number(item.estimatedValue ?? 0);

      if (timingState === 'OVERDUE') {
        acc.overdue += 1;
      }
      if (timingState === 'DUE_SOON') {
        acc.dueSoon += 1;
      }
      if (normalizedStatus === 'QUOTED') {
        acc.quoted += 1;
      }
      if (normalizedStatus === 'CHASED') {
        acc.chased += 1;
      }
      return acc;
    },
    { total: 0, overdue: 0, dueSoon: 0, quoted: 0, chased: 0, pipelineValue: 0 },
  );

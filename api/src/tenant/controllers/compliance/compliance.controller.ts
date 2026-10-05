import { NextFunction, Request, Response } from 'express';
import { AppDataSource } from '../../../config/data-source';
import { Customer } from '../../../entities/customer.entity';
import { CustomerSite } from '../../../entities/customer-site.entity';
import { ComplianceRecord } from '../../../entities/compliance-record.entity';
import { DocumentItem } from '../../../entities/document.entity';
import { Job } from '../../../entities/job.entity';
import { User } from '../../../entities/user.entity';
import { syncRenewalOpportunityForComplianceRecord } from '../../../services/renewals.service';
import { resolveStoredFileUrl } from '../../../services/storage/storage.service';
import { buildCustomerSiteAddress } from '../../../services/customer-sites.service';
import { createInAppNotification } from '../../../services/in-app-notifications.service';
import { runComplianceExpiryTick } from '../../queues/compliance-expiry-scheduler.service';
import { BadRequestError, NotFoundError } from '../../../utils/errors';
import { getTenantId } from '../../../utils/request';

const REVIEW_STATUSES = new Set(['PENDING_REVIEW', 'IN_REVIEW', 'APPROVED', 'REJECTED', 'EXPIRED']);

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

const parseOptionalAmount = (value: unknown, fieldLabel: string) => {
  if (value === null || typeof value === 'undefined' || value === '') {
    return undefined;
  }
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount < 0) {
    throw new BadRequestError(`${fieldLabel} must be a valid non-negative amount`);
  }
  return Number(amount.toFixed(2));
};

const validateRecordDates = (validFrom?: Date, validUntil?: Date) => {
  if (validFrom && validUntil && validFrom.getTime() > validUntil.getTime()) {
    throw new BadRequestError('Valid until must be on or after valid from');
  }
};

const compareNullableDatesAsc = (left?: string | Date | null, right?: string | Date | null) => {
  const leftValue = left ? new Date(left).getTime() : Number.POSITIVE_INFINITY;
  const rightValue = right ? new Date(right).getTime() : Number.POSITIVE_INFINITY;
  return leftValue - rightValue;
};

const compareNullableDatesDesc = (left?: string | Date | null, right?: string | Date | null) => {
  const leftValue = left ? new Date(left).getTime() : Number.NEGATIVE_INFINITY;
  const rightValue = right ? new Date(right).getTime() : Number.NEGATIVE_INFINITY;
  return rightValue - leftValue;
};

const getReviewSortWeight = (value?: string | null) => {
  switch (String(value ?? 'PENDING_REVIEW').toUpperCase()) {
    case 'PENDING_REVIEW':
      return 0;
    case 'IN_REVIEW':
      return 1;
    case 'REJECTED':
      return 2;
    case 'APPROVED':
      return 3;
    case 'EXPIRED':
      return 4;
    default:
      return 5;
  }
};

const ensureTenantUser = async (tenantId: string, userId: string) => {
  const user = await AppDataSource.getRepository(User).findOne({
    where: { id: userId, tenantId, isDeleted: false },
  });
  if (!user) {
    throw new NotFoundError('Reviewer not found');
  }
  return user;
};

const ensureTenantDocument = async (tenantId: string, documentId: string) => {
  const document = await AppDataSource.getRepository(DocumentItem).findOne({
    where: { id: documentId, tenantId, isDeleted: false },
  });
  if (!document) {
    throw new NotFoundError('Document not found');
  }
  return document;
};

const ensureComplianceRecord = async (tenantId: string, recordId: string) => {
  const record = await AppDataSource.getRepository(ComplianceRecord).findOne({
    where: { id: recordId, tenantId, isDeleted: false },
  });
  if (!record) {
    throw new NotFoundError('Compliance record not found');
  }
  return record;
};

const serializeComplianceRecords = async (tenantId: string, records: ComplianceRecord[]) => {
  const customerIds = Array.from(new Set(records.map((record) => record.customerId).filter(Boolean)));
  const siteIds = Array.from(new Set(records.map((record) => record.siteId).filter(Boolean)));
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

  const [customers, sites, reviewers, documents, jobs] = await Promise.all([
    customerIds.length > 0
      ? AppDataSource.getRepository(Customer).find({
          where: customerIds.map((id) => ({ id, tenantId, isDeleted: false })),
        })
      : Promise.resolve([] as Customer[]),
    siteIds.length > 0
      ? AppDataSource.getRepository(CustomerSite).find({
          where: siteIds.map((id) => ({ id, tenantId, isDeleted: false })),
        })
      : Promise.resolve([] as CustomerSite[]),
    reviewerIds.length > 0
      ? AppDataSource.getRepository(User).find({
          where: reviewerIds.map((id) => ({ id, tenantId, isDeleted: false })),
        })
      : Promise.resolve([] as User[]),
    documentIds.length > 0
      ? AppDataSource.getRepository(DocumentItem).find({
          where: documentIds.map((id) => ({ id, tenantId, isDeleted: false })),
        })
      : Promise.resolve([] as DocumentItem[]),
    jobIds.length > 0
      ? AppDataSource.getRepository(Job).find({
          where: jobIds.map((id) => ({ id, tenantId, isDeleted: false })),
        })
      : Promise.resolve([] as Job[]),
  ]);

  const customerMap = new Map(customers.map((customer) => [customer.id, customer]));
  const siteMap = new Map(sites.map((site) => [site.id, site]));
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
  const jobMap = new Map(jobs.map((job) => [job.id, job]));

  return records.map((record) => {
    const customer = customerMap.get(record.customerId) ?? null;
    const site = siteMap.get(record.siteId) ?? null;
    const job = record.jobId ? jobMap.get(record.jobId) ?? null : null;
    const document = record.documentId ? documentMap.get(record.documentId) ?? null : null;

    return {
      ...record,
      customerName: customer?.name ?? null,
      siteName: site?.name ?? null,
      siteReference: site?.reference ?? null,
      siteCategory: site?.category ?? null,
      siteAddress: buildCustomerSiteAddress(site) ?? null,
      reviewerName: record.reviewerUserId ? reviewerMap.get(record.reviewerUserId) ?? null : null,
      documentName: document?.name ?? null,
      documentFileUrl: document?.fileUrl ?? null,
      jobTitle: job?.title ?? null,
      jobStatus: job?.status ?? null,
    };
  });
};

const buildSummary = (records: Array<{ reviewStatus?: string | null; customerVisible?: boolean | null }>) =>
  records.reduce(
    (summary, record) => {
      summary.total += 1;
      const reviewStatus = String(record.reviewStatus ?? 'PENDING_REVIEW').toUpperCase();
      if (reviewStatus === 'IN_REVIEW') {
        summary.inReview += 1;
      } else if (reviewStatus === 'APPROVED') {
        summary.approved += 1;
      } else if (reviewStatus === 'REJECTED') {
        summary.rejected += 1;
      } else if (reviewStatus === 'EXPIRED') {
        summary.expired += 1;
      } else {
        summary.pendingReview += 1;
      }
      if (record.customerVisible === false) {
        summary.hiddenFromPortal += 1;
      } else {
        summary.visibleToCustomer += 1;
      }
      return summary;
    },
    {
      total: 0,
      pendingReview: 0,
      inReview: 0,
      approved: 0,
      rejected: 0,
      expired: 0,
      visibleToCustomer: 0,
      hiddenFromPortal: 0,
    },
  );

export const listComplianceRecords = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const tenantId = getTenantId(req);
    await runComplianceExpiryTick();
    const reviewStatus = normalizeOptionalString(req.query.reviewStatus)?.toUpperCase();
    if (reviewStatus && reviewStatus !== 'ALL') {
      if (!REVIEW_STATUSES.has(reviewStatus)) {
        throw new BadRequestError('Unsupported review status');
      }
    }

    const customerId = normalizeOptionalString(req.query.customerId);
    const siteId = normalizeOptionalString(req.query.siteId);
    const jobId = normalizeOptionalString(req.query.jobId);
    const reviewerUserId = normalizeOptionalString(req.query.reviewerUserId);
    const visibility = normalizeOptionalString(req.query.visibility)?.toUpperCase();
    if (visibility && visibility !== 'ALL') {
      if (visibility !== 'VISIBLE' && visibility !== 'HIDDEN') {
        throw new BadRequestError('Unsupported visibility filter');
      }
    }
    const reportType = normalizeOptionalString(req.query.reportType);
    const search = normalizeOptionalString(req.query.search)?.toLowerCase();
    const records = await AppDataSource.getRepository(ComplianceRecord).find({
      where: { tenantId, isDeleted: false },
      order: { createdAt: 'DESC' },
    });
    const items = (await serializeComplianceRecords(tenantId, records))
      .filter((item) => {
        if (reviewStatus && reviewStatus !== 'ALL') {
          if (String(item.reviewStatus ?? 'PENDING_REVIEW').toUpperCase() !== reviewStatus) {
            return false;
          }
        }
        if (customerId && item.customerId !== customerId) {
          return false;
        }
        if (siteId && item.siteId !== siteId) {
          return false;
        }
        if (jobId && item.jobId !== jobId) {
          return false;
        }
        if (reviewerUserId && item.reviewerUserId !== reviewerUserId) {
          return false;
        }
        if (visibility === 'VISIBLE' && item.customerVisible === false) {
          return false;
        }
        if (visibility === 'HIDDEN' && item.customerVisible !== false) {
          return false;
        }
        if (reportType && String(item.reportType ?? '').toLowerCase() !== reportType.toLowerCase()) {
          return false;
        }
        if (search) {
          const haystack = [
            item.title,
            item.reportType,
            item.reference,
            item.outcome,
            item.customerName,
            item.siteName,
            item.siteReference,
            item.reviewerName,
          ]
            .map((value) => String(value ?? '').toLowerCase())
            .join(' ');
          if (!haystack.includes(search)) {
            return false;
          }
        }
        return true;
      })
      .sort((left, right) => {
        const weightDifference = getReviewSortWeight(left.reviewStatus) - getReviewSortWeight(right.reviewStatus);
        if (weightDifference !== 0) {
          return weightDifference;
        }

        const validUntilDifference = compareNullableDatesAsc(left.validUntil, right.validUntil);
        if (validUntilDifference !== 0) {
          return validUntilDifference;
        }

        const testedAtDifference = compareNullableDatesDesc(left.testedAt, right.testedAt);
        if (testedAtDifference !== 0) {
          return testedAtDifference;
        }

        return compareNullableDatesDesc(left.createdAt, right.createdAt);
      });

    res.deliver(200, true, { items, summary: buildSummary(items) }, 'Compliance records fetched');
  } catch (error) {
    next(error);
  }
};

export const updateComplianceRecordReview = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const tenantId = getTenantId(req);
    const record = await ensureComplianceRecord(tenantId, req.params.id);
    const previousReviewStatus = String(record.reviewStatus ?? 'PENDING_REVIEW').toUpperCase();
    const previousReviewerUserId = record.reviewerUserId;
    const reviewStatus = normalizeOptionalString(req.body.reviewStatus)?.toUpperCase() ?? previousReviewStatus;
    const title = req.body.title !== undefined ? normalizeOptionalString(req.body.title) : record.title;
    const reportType = req.body.reportType !== undefined ? normalizeOptionalString(req.body.reportType) : record.reportType;

    if (!REVIEW_STATUSES.has(reviewStatus)) {
      throw new BadRequestError('Unsupported review status');
    }
    if (!title) {
      throw new BadRequestError('Record title is required');
    }
    if (!reportType) {
      throw new BadRequestError('Report type is required');
    }

    const reviewerUserId = req.body.reviewerUserId !== undefined
      ? normalizeOptionalString(req.body.reviewerUserId)
      : record.reviewerUserId;
    if (reviewerUserId) {
      await ensureTenantUser(tenantId, reviewerUserId);
    }
    const testedAt = req.body.testedAt !== undefined ? parseOptionalDate(req.body.testedAt, 'Tested at') : record.testedAt;
    const validFrom = req.body.validFrom !== undefined ? parseOptionalDate(req.body.validFrom, 'Valid from') : record.validFrom;
    const validUntil = req.body.validUntil !== undefined ? parseOptionalDate(req.body.validUntil, 'Valid until') : record.validUntil;
    const expectedRenewalValue = req.body.expectedRenewalValue !== undefined
      ? parseOptionalAmount(req.body.expectedRenewalValue, 'Expected renewal value')
      : record.expectedRenewalValue;
    validateRecordDates(validFrom, validUntil);
    const documentId = req.body.documentId !== undefined
      ? normalizeOptionalString(req.body.documentId)
      : record.documentId;
    if (documentId) {
      await ensureTenantDocument(tenantId, documentId);
    }

    record.title = title;
    record.reportType = reportType;
    if (req.body.reference !== undefined) {
      record.reference = normalizeOptionalString(req.body.reference);
    }
    if (req.body.outcome !== undefined) {
      record.outcome = normalizeOptionalString(req.body.outcome);
    }
    record.testedAt = testedAt;
    record.validFrom = validFrom;
    record.validUntil = validUntil;
    record.expectedRenewalValue = expectedRenewalValue;
    record.reviewStatus = reviewStatus;
    record.reviewerUserId = reviewerUserId;
    record.documentId = documentId;
    if (req.body.reviewNote !== undefined) {
      record.reviewNote = normalizeOptionalString(req.body.reviewNote);
    }
    if (req.body.notes !== undefined) {
      record.notes = normalizeOptionalString(req.body.notes);
    }

    if (typeof req.body.customerVisible === 'boolean') {
      record.customerVisible = req.body.customerVisible;
    }

    if (
      reviewStatus !== previousReviewStatus &&
      (reviewStatus === 'APPROVED' || reviewStatus === 'REJECTED')
    ) {
      record.reviewedAt = new Date();
    } else if (reviewStatus === 'PENDING_REVIEW' || reviewStatus === 'IN_REVIEW') {
      record.reviewedAt = undefined;
    }

    await AppDataSource.getRepository(ComplianceRecord).save(record);
    await syncRenewalOpportunityForComplianceRecord(record);

    if (reviewerUserId && reviewerUserId !== previousReviewerUserId && reviewerUserId !== req.userId) {
      await createInAppNotification({
        tenantId,
        userId: reviewerUserId,
        title: 'Compliance Review Assigned',
        message: `You have been assigned to review "${record.title}".`,
        targetUrl: '/admin/compliance',
      }).catch((error) => {
        console.error('Compliance reviewer notification failed:', error);
      });
    }

    const [payload] = await serializeComplianceRecords(tenantId, [record]);
    res.deliver(200, true, payload ?? record, 'Compliance review updated');
  } catch (error) {
    next(error);
  }
};

import { NextFunction, Request, Response } from 'express';
import { AppDataSource } from '../../../config/data-source';
import { ComplianceRecord } from '../../../entities/compliance-record.entity';
import { Customer } from '../../../entities/customer.entity';
import { CustomerSite } from '../../../entities/customer-site.entity';
import { DocumentItem } from '../../../entities/document.entity';
import { Job } from '../../../entities/job.entity';
import { User } from '../../../entities/user.entity';
import { BadRequestError, NotFoundError } from '../../../utils/errors';
import { getTenantId } from '../../../utils/request';
import { resolveStoredFileUrl } from '../../../services/storage/storage.service';
import {
  removeRenewalOpportunityForComplianceRecord,
  syncRenewalOpportunityForComplianceRecord,
} from '../../../services/renewals.service';

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

const ensureCustomerForTenant = async (tenantId: string, customerId: string) => {
  const customer = await AppDataSource.getRepository(Customer).findOne({
    where: { id: customerId, tenantId, isDeleted: false },
  });
  if (!customer) {
    throw new NotFoundError('Customer not found');
  }
  return customer;
};

const ensureCustomerSite = async (tenantId: string, customerId: string, siteId: string) => {
  const site = await AppDataSource.getRepository(CustomerSite).findOne({
    where: { id: siteId, tenantId, customerId, isDeleted: false },
  });
  if (!site) {
    throw new NotFoundError('Site not found');
  }
  return site;
};

const ensureComplianceRecord = async (
  tenantId: string,
  customerId: string,
  siteId: string,
  recordId: string,
) => {
  const record = await AppDataSource.getRepository(ComplianceRecord).findOne({
    where: { id: recordId, tenantId, customerId, siteId, isDeleted: false },
  });
  if (!record) {
    throw new NotFoundError('Compliance record not found');
  }
  return record;
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

const ensureTenantUser = async (tenantId: string, userId: string) => {
  const user = await AppDataSource.getRepository(User).findOne({
    where: { id: userId, tenantId, isDeleted: false },
  });
  if (!user) {
    throw new NotFoundError('Reviewer not found');
  }
  return user;
};

const ensureSiteJob = async (tenantId: string, customerId: string, siteId: string, jobId: string) => {
  const job = await AppDataSource.getRepository(Job).findOne({
    where: { id: jobId, tenantId, customerId, siteId, isDeleted: false },
  });
  if (!job) {
    throw new NotFoundError('Job not found for this site');
  }
  return job;
};

const serializeComplianceRecords = async (records: ComplianceRecord[]) => {
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

  return records.map((record) => ({
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

const validateRecordDates = (validFrom?: Date, validUntil?: Date) => {
  if (validFrom && validUntil && validFrom.getTime() > validUntil.getTime()) {
    throw new BadRequestError('Valid until must be on or after valid from');
  }
};

export const listCustomerSiteComplianceRecords = async (
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

    const records = await AppDataSource.getRepository(ComplianceRecord).find({
      where: { tenantId, customerId, siteId, isDeleted: false },
      order: { testedAt: 'DESC', createdAt: 'DESC' },
    });

    res.deliver(200, true, await serializeComplianceRecords(records), 'Compliance records fetched');
  } catch (error) {
    next(error);
  }
};

export const createCustomerSiteComplianceRecord = async (
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

    const title = String(req.body.title ?? '').trim();
    const reportType = String(req.body.reportType ?? '').trim();
    if (!title) {
      throw new BadRequestError('Record title is required');
    }
    if (!reportType) {
      throw new BadRequestError('Report type is required');
    }

    const testedAt = parseOptionalDate(req.body.testedAt, 'Tested at');
    const validFrom = parseOptionalDate(req.body.validFrom, 'Valid from');
    const validUntil = parseOptionalDate(req.body.validUntil, 'Valid until');
    const expectedRenewalValue = parseOptionalAmount(req.body.expectedRenewalValue, 'Expected renewal value');
    validateRecordDates(validFrom, validUntil);

    const reviewerUserId = normalizeOptionalString(req.body.reviewerUserId);
    const documentId = normalizeOptionalString(req.body.documentId);
    const jobId = normalizeOptionalString(req.body.jobId);

    if (reviewerUserId) {
      await ensureTenantUser(tenantId, reviewerUserId);
    }
    if (documentId) {
      await ensureTenantDocument(tenantId, documentId);
    }
    if (jobId) {
      await ensureSiteJob(tenantId, customerId, siteId, jobId);
    }

    const reviewStatus = normalizeOptionalString(req.body.reviewStatus)?.toUpperCase() ?? 'PENDING_REVIEW';
    if (!REVIEW_STATUSES.has(reviewStatus)) {
      throw new BadRequestError('Unsupported review status');
    }
    const record = AppDataSource.getRepository(ComplianceRecord).create({
      tenantId,
      customerId,
      siteId,
      title,
      reportType,
      reference: normalizeOptionalString(req.body.reference),
      outcome: normalizeOptionalString(req.body.outcome),
      reviewStatus,
      testedAt,
      validFrom,
      validUntil,
      expectedRenewalValue,
      reviewedAt:
        reviewStatus === 'APPROVED' || reviewStatus === 'REJECTED'
          ? new Date()
          : undefined,
      reviewerUserId,
      reviewNote: normalizeOptionalString(req.body.reviewNote),
      customerVisible: typeof req.body.customerVisible === 'boolean' ? req.body.customerVisible : true,
      notes: normalizeOptionalString(req.body.notes),
      documentId,
      jobId,
    });

    await AppDataSource.getRepository(ComplianceRecord).save(record);
    await syncRenewalOpportunityForComplianceRecord(record);
    const [payload] = await serializeComplianceRecords([record]);
    res.deliver(201, true, payload ?? record, 'Compliance record created');
  } catch (error) {
    next(error);
  }
};

export const updateCustomerSiteComplianceRecord = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const tenantId = getTenantId(req);
    const customerId = req.params.id;
    const siteId = req.params.siteId;
    const recordId = req.params.recordId;
    await ensureCustomerForTenant(tenantId, customerId);
    await ensureCustomerSite(tenantId, customerId, siteId);
    const record = await ensureComplianceRecord(tenantId, customerId, siteId, recordId);

    const title = String(req.body.title ?? '').trim();
    const reportType = String(req.body.reportType ?? '').trim();
    if (!title) {
      throw new BadRequestError('Record title is required');
    }
    if (!reportType) {
      throw new BadRequestError('Report type is required');
    }

    const testedAt = parseOptionalDate(req.body.testedAt, 'Tested at');
    const validFrom = parseOptionalDate(req.body.validFrom, 'Valid from');
    const validUntil = parseOptionalDate(req.body.validUntil, 'Valid until');
    const expectedRenewalValue = parseOptionalAmount(req.body.expectedRenewalValue, 'Expected renewal value');
    validateRecordDates(validFrom, validUntil);

    const reviewerUserId = normalizeOptionalString(req.body.reviewerUserId);
    const documentId = normalizeOptionalString(req.body.documentId);
    const jobId = normalizeOptionalString(req.body.jobId);

    if (reviewerUserId) {
      await ensureTenantUser(tenantId, reviewerUserId);
    }
    if (documentId) {
      await ensureTenantDocument(tenantId, documentId);
    }
    if (jobId) {
      await ensureSiteJob(tenantId, customerId, siteId, jobId);
    }

    const previousReviewStatus = String(record.reviewStatus ?? '').toUpperCase();
    const reviewStatus = normalizeOptionalString(req.body.reviewStatus)?.toUpperCase() ?? 'PENDING_REVIEW';
    if (!REVIEW_STATUSES.has(reviewStatus)) {
      throw new BadRequestError('Unsupported review status');
    }

    record.title = title;
    record.reportType = reportType;
    record.reference = normalizeOptionalString(req.body.reference);
    record.outcome = normalizeOptionalString(req.body.outcome);
    record.reviewStatus = reviewStatus;
    record.testedAt = testedAt;
    record.validFrom = validFrom;
    record.validUntil = validUntil;
    record.expectedRenewalValue = expectedRenewalValue;
    record.reviewerUserId = reviewerUserId;
    record.reviewNote = normalizeOptionalString(req.body.reviewNote);
    record.customerVisible =
      typeof req.body.customerVisible === 'boolean' ? req.body.customerVisible : record.customerVisible;
    record.notes = normalizeOptionalString(req.body.notes);
    record.documentId = documentId;
    record.jobId = jobId;

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
    const [payload] = await serializeComplianceRecords([record]);
    res.deliver(200, true, payload ?? record, 'Compliance record updated');
  } catch (error) {
    next(error);
  }
};

export const deleteCustomerSiteComplianceRecord = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const tenantId = getTenantId(req);
    const customerId = req.params.id;
    const siteId = req.params.siteId;
    const recordId = req.params.recordId;
    await ensureCustomerForTenant(tenantId, customerId);
    await ensureCustomerSite(tenantId, customerId, siteId);
    const record = await ensureComplianceRecord(tenantId, customerId, siteId, recordId);
    record.isDeleted = true;
    await AppDataSource.getRepository(ComplianceRecord).save(record);
    await removeRenewalOpportunityForComplianceRecord(tenantId, record.id);
    res.deliver(200, true, { id: record.id }, 'Compliance record removed');
  } catch (error) {
    next(error);
  }
};

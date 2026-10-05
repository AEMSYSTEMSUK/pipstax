import { NextFunction, Request, Response } from 'express';
import { In } from 'typeorm';
import { AppDataSource } from '../../config/data-source';
import { ComplianceRecord } from '../../entities/compliance-record.entity';
import { CustomerSite } from '../../entities/customer-site.entity';
import { DocumentItem } from '../../entities/document.entity';
import { Job } from '../../entities/job.entity';
import { JobAssignment } from '../../entities/job-assignment.entity';
import { User } from '../../entities/user.entity';
import { SyncStatus } from '../../constants/integrations';
import { BadRequestError, NotFoundError } from '../../utils/errors';
import { getTenantId } from '../../utils/request';
import { assertTenantFeatureEnabled } from '../../services/tenant-features.service';
import { buildCustomerSiteAddress } from '../../services/customer-sites.service';
import {
  normalizeStoredFileReference,
  resolveStoredFileUrl,
} from '../../services/storage/storage.service';
import { hasActiveIntegration } from '../../services/integrations.service';
import { enqueueDocumentPush } from '../../tenant/queues/document-sync-queue.service';
import { syncDocumentToProvider } from '../../services/integrations/document-shadowing.service';
import { syncRenewalOpportunityForComplianceRecord } from '../../services/renewals.service';
import { notifyAdmins } from '../../services/in-app-notifications.service';

const normalizeOptionalString = (value: unknown) => {
  if (typeof value !== 'string') {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
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

const validateRecordDates = (validFrom?: Date, validUntil?: Date) => {
  if (validFrom && validUntil && validFrom.getTime() > validUntil.getTime()) {
    throw new BadRequestError('Valid until must be on or after valid from');
  }
};

const ensureAssignedJobForUser = async ({
  tenantId,
  jobId,
  userId,
}: {
  tenantId: string;
  jobId: string;
  userId?: string;
}) => {
  if (!userId) {
    throw new NotFoundError('User not found');
  }

  const job = await AppDataSource.getRepository(Job).findOne({
    where: { id: jobId, tenantId, isDeleted: false },
  });
  if (!job) {
    throw new NotFoundError('Job not found');
  }

  const assignment = await AppDataSource.getRepository(JobAssignment).findOne({
    where: { jobId, tenantId, userId, isDeleted: false, isActive: true },
  });
  if (!assignment) {
    throw new NotFoundError('Job not found');
  }

  return job;
};

const ensureAccessibleSiteForUser = async ({
  tenantId,
  siteId,
  userId,
}: {
  tenantId: string;
  siteId: string;
  userId?: string;
}) => {
  if (!userId) {
    throw new NotFoundError('User not found');
  }

  const site = await AppDataSource.getRepository(CustomerSite).findOne({
    where: { id: siteId, tenantId, isDeleted: false },
  });
  if (!site) {
    throw new NotFoundError('Site not found');
  }

  const assignedJob = await AppDataSource.getRepository(Job)
    .createQueryBuilder('job')
    .innerJoin(
      JobAssignment,
      'assignment',
      'assignment.jobId = job.id AND assignment.tenantId = job.tenantId AND assignment.userId = :userId AND assignment.isDeleted = false AND assignment.isActive = true',
      { userId },
    )
    .where('job.tenantId = :tenantId', { tenantId })
    .andWhere('job.siteId = :siteId', { siteId })
    .andWhere('job.isDeleted = false')
    .getOne();

  if (!assignedJob) {
    throw new NotFoundError('Site not found');
  }

  return site;
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

const resolveUploaderName = async (tenantId: string, userId: string) => {
  const user = await AppDataSource.getRepository(User).findOne({
    where: { id: userId, tenantId, isDeleted: false },
    select: { id: true, fullName: true, email: true },
  });
  if (!user) return 'Field User';
  return user.fullName?.trim() || user.email?.trim() || 'Field User';
};

const buildComplianceCategory = (siteName?: string | null, reportType?: string | null) => {
  const siteSegment = String(siteName ?? 'Site').trim() || 'Site';
  const typeSegment = String(reportType ?? 'Compliance').trim() || 'Compliance';
  return `Compliance/${siteSegment}/${typeSegment}`;
};

const createComplianceDocument = async (params: {
  tenantId: string;
  jobId: string;
  recordId: string;
  documentName?: string;
  documentFileUrl: string;
  siteName?: string | null;
  reportType?: string | null;
}) => {
  const fileKey = normalizeStoredFileReference(params.documentFileUrl);
  if (!fileKey) {
    throw new BadRequestError('Document file is required.');
  }

  const activeIntegration = await hasActiveIntegration(params.tenantId);
  const repo = AppDataSource.getRepository(DocumentItem);
  const document = repo.create({
    tenantId: params.tenantId,
    name: normalizeOptionalString(params.documentName) ?? 'Compliance Document',
    fileUrl: fileKey,
    category: buildComplianceCategory(params.siteName, params.reportType),
    relatedEntityType: 'compliance_record',
    relatedEntityId: params.recordId,
    syncStatus: activeIntegration ? SyncStatus.PENDING : SyncStatus.PENDING,
  });

  await repo.save(document);
  if (activeIntegration) {
    const pushQueued = await enqueueDocumentPush({
      tenantId: params.tenantId,
      documentId: document.id,
    });
    if (!pushQueued) {
      try {
        await syncDocumentToProvider(document);
      } catch {
        // Keep worker compliance submission successful even if downstream sync fails.
      }
    }
  }

  return document;
};

const serializeComplianceRecords = async (records: ComplianceRecord[]) => {
  const documentIds = Array.from(
    new Set(
      records
        .map((record) => (typeof record.documentId === 'string' ? record.documentId : ''))
        .filter(Boolean),
    ),
  );
  const siteIds = Array.from(
    new Set(
      records
        .map((record) => (typeof record.siteId === 'string' ? record.siteId : ''))
        .filter(Boolean),
    ),
  );

  const [documents, sites] = await Promise.all([
    documentIds.length > 0
      ? AppDataSource.getRepository(DocumentItem).find({
          where: documentIds.map((id) => ({ id, isDeleted: false })),
        })
      : Promise.resolve([] as DocumentItem[]),
    siteIds.length > 0
      ? AppDataSource.getRepository(CustomerSite).find({
          where: siteIds.map((id) => ({ id, isDeleted: false })),
        })
      : Promise.resolve([] as CustomerSite[]),
  ]);

  const documentMap = new Map(
    documents.map((document) => [
      document.id,
      {
        name: document.name,
        fileUrl: resolveStoredFileUrl(document.fileUrl),
      },
    ]),
  );
  const siteMap = new Map(sites.map((site) => [site.id, site]));

  return records.map((record) => {
    const site = siteMap.get(record.siteId);
    return {
      ...record,
      siteName: site?.name ?? null,
      siteReference: site?.reference ?? null,
      siteAddress: buildCustomerSiteAddress(site) ?? null,
      documentName: record.documentId ? documentMap.get(record.documentId)?.name ?? null : null,
      documentFileUrl: record.documentId ? documentMap.get(record.documentId)?.fileUrl ?? null : null,
    };
  });
};

export const listAppComplianceReports = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = getTenantId(req);
    await assertTenantFeatureEnabled(
      tenantId,
      'complianceReports',
      'Compliance reports are not enabled for this workspace.',
    );
    if (!req.userId) {
      throw new NotFoundError('User not found');
    }

    const assignments = await AppDataSource.getRepository(JobAssignment).find({
      where: { tenantId, userId: req.userId, isDeleted: false, isActive: true },
      select: ['jobId'],
    });
    const jobIds = Array.from(new Set(assignments.map((assignment) => assignment.jobId).filter(Boolean)));

    if (jobIds.length === 0) {
      return res.deliver(200, true, [], 'Compliance reports fetched');
    }

    const requestedJobId = normalizeOptionalString(req.query.jobId);
    const filteredJobIds = requestedJobId ? jobIds.filter((jobId) => jobId === requestedJobId) : jobIds;
    if (requestedJobId && filteredJobIds.length === 0) {
      throw new NotFoundError('Job not found');
    }

    const records = await AppDataSource.getRepository(ComplianceRecord).find({
      where: {
        tenantId,
        isDeleted: false,
        jobId: In(filteredJobIds),
      },
      order: { testedAt: 'DESC', createdAt: 'DESC' },
    });

    res.deliver(200, true, await serializeComplianceRecords(records), 'Compliance reports fetched');
  } catch (error) {
    next(error);
  }
};

export const getAppJobComplianceContext = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = getTenantId(req);
    await assertTenantFeatureEnabled(
      tenantId,
      'complianceReports',
      'Compliance reports are not enabled for this workspace.',
    );
    const job = await ensureAssignedJobForUser({
      tenantId,
      jobId: req.params.id,
      userId: req.userId,
    });

    if (!job.siteId || !job.customerId) {
      throw new BadRequestError('This job is not linked to a compliance site yet.');
    }

    const site = await AppDataSource.getRepository(CustomerSite).findOne({
      where: { id: job.siteId, tenantId, customerId: job.customerId, isDeleted: false },
    });
    if (!site) {
      throw new NotFoundError('Site not found');
    }

    const records = await AppDataSource.getRepository(ComplianceRecord).find({
      where: { tenantId, siteId: site.id, isDeleted: false },
      order: { testedAt: 'DESC', createdAt: 'DESC' },
      take: 10,
    });

    res.deliver(
      200,
      true,
      {
        job: {
          id: job.id,
          title: job.title,
          customerId: job.customerId,
          siteId: job.siteId,
          scheduledAt: job.scheduledAt,
          scheduledEndAt: job.scheduledEndAt,
        },
        site: {
          id: site.id,
          name: site.name,
          reference: site.reference ?? null,
          category: site.category ?? null,
          address: buildCustomerSiteAddress(site) ?? null,
          primaryContactName: site.primaryContactName ?? null,
          primaryContactEmail: site.primaryContactEmail ?? null,
          primaryContactPhone: site.primaryContactPhone ?? null,
        },
        recentRecords: await serializeComplianceRecords(records),
      },
      'Compliance context fetched',
    );
  } catch (error) {
    next(error);
  }
};

export const getAppSiteComplianceContext = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = getTenantId(req);
    await assertTenantFeatureEnabled(
      tenantId,
      'complianceReports',
      'Compliance reports are not enabled for this workspace.',
    );
    const site = await ensureAccessibleSiteForUser({
      tenantId,
      siteId: req.params.id,
      userId: req.userId,
    });

    const records = await AppDataSource.getRepository(ComplianceRecord).find({
      where: { tenantId, siteId: site.id, isDeleted: false },
      order: { testedAt: 'DESC', createdAt: 'DESC' },
      take: 10,
    });

    res.deliver(
      200,
      true,
      {
        site: {
          id: site.id,
          customerId: site.customerId,
          name: site.name,
          reference: site.reference ?? null,
          category: site.category ?? null,
          address: buildCustomerSiteAddress(site) ?? null,
          primaryContactName: site.primaryContactName ?? null,
          primaryContactEmail: site.primaryContactEmail ?? null,
          primaryContactPhone: site.primaryContactPhone ?? null,
        },
        recentRecords: await serializeComplianceRecords(records),
      },
      'Compliance context fetched',
    );
  } catch (error) {
    next(error);
  }
};

export const createAppComplianceReport = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = getTenantId(req);
    await assertTenantFeatureEnabled(
      tenantId,
      'complianceReports',
      'Compliance reports are not enabled for this workspace.',
    );
    if (!req.userId) {
      throw new NotFoundError('User not found');
    }

    const job = await ensureAssignedJobForUser({
      tenantId,
      jobId: req.body.jobId,
      userId: req.userId,
    });

    if (!job.customerId || !job.siteId) {
      throw new BadRequestError('This job is not linked to a compliance site yet.');
    }

    if (normalizeOptionalString(req.body.siteId) && req.body.siteId !== job.siteId) {
      throw new BadRequestError('Selected site does not match the assigned job site.');
    }

    const site = await AppDataSource.getRepository(CustomerSite).findOne({
      where: { id: job.siteId, tenantId, customerId: job.customerId, isDeleted: false },
    });
    if (!site) {
      throw new NotFoundError('Site not found');
    }

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
    validateRecordDates(validFrom, validUntil);

    let documentId = normalizeOptionalString(req.body.documentId);
    if (documentId) {
      await ensureTenantDocument(tenantId, documentId);
    }

    const repo = AppDataSource.getRepository(ComplianceRecord);
    const record = repo.create({
      tenantId,
      customerId: job.customerId,
      siteId: job.siteId,
      jobId: job.id,
      title,
      reportType,
      reference: normalizeOptionalString(req.body.reference),
      outcome: normalizeOptionalString(req.body.outcome),
      reviewStatus: 'PENDING_REVIEW',
      testedAt,
      validFrom,
      validUntil,
      customerVisible: true,
      notes: normalizeOptionalString(req.body.notes),
      documentId,
    });
    await repo.save(record);

    if (!documentId) {
      const documentFileUrl = normalizeOptionalString(req.body.documentFileUrl);
      if (documentFileUrl) {
        const document = await createComplianceDocument({
          tenantId,
          jobId: job.id,
          recordId: record.id,
          documentName: normalizeOptionalString(req.body.documentName),
          documentFileUrl,
          siteName: site.name,
          reportType,
        });
        documentId = document.id;
        record.documentId = document.id;
        await repo.save(record);
      }
    }

    await syncRenewalOpportunityForComplianceRecord(record);
    const uploaderName = await resolveUploaderName(tenantId, req.userId);
    notifyAdmins({
      tenantId,
      title: 'Field Compliance Report Submitted',
      message: `${uploaderName} submitted a compliance report for job "${job.title}" at ${site.name}.`,
      targetUrl: `/admin/schedule/${job.id}?tab=field-updates`,
    }).catch(() => undefined);

    const [payload] = await serializeComplianceRecords([record]);
    res.deliver(201, true, payload ?? record, 'Compliance report submitted');
  } catch (error) {
    next(error);
  }
};

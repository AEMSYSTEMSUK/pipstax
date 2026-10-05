import { Request, Response, NextFunction } from 'express';
import { ILike } from 'typeorm';
import { AppDataSource } from '../../config/data-source';
import { Job } from '../../entities/job.entity';
import { JobAssignment } from '../../entities/job-assignment.entity';
import { JobUpdate } from '../../entities/job-update.entity';
import { JobExpense } from '../../entities/job-expense.entity';
import { JobTimeEntry } from '../../entities/job-time-entry.entity';
import { ActiveTimer } from '../../entities/active-timer.entity';
import { DocumentItem } from '../../entities/document.entity';
import { LookupOption } from '../../entities/lookup-option.entity';
import { User } from '../../entities/user.entity';
import { Tenant } from '../../entities/tenant.entity';
import { Customer } from '../../entities/customer.entity';
import { CustomerSite } from '../../entities/customer-site.entity';
import { CustomerSiteContact } from '../../entities/customer-site-contact.entity';
import { SyncStatus } from '../../constants/integrations';
import { JobStatus } from '../../constants/status';
import { BadRequestError, NotFoundError } from '../../utils/errors';
import { getTenantId } from '../../utils/request';
import {
  normalizeStoredFileReference,
  resolveStoredFileUrl,
  resolveTenantStorageContext,
  storeTenantFile,
} from '../../services/storage/storage.service';
import { hasActiveIntegration } from '../../services/integrations.service';
import { deriveJobLifecycleStatus, getActiveAssignmentCountMap, syncJobLifecyclesForList } from '../../services/jobs/job-lifecycle.service';
import { buildJobClosurePdf } from '../../services/job-closure-pdf.service';
import { normalizeTenantFeatureFlags } from '../../services/tenant-features.service';
import { resolveWorkflowStageKeyForRecord } from '../../services/workflow-config.service';
import {
  enqueueDocumentPush,
} from '../../tenant/queues/document-sync-queue.service';
import { syncDocumentToProvider } from '../../services/integrations/document-shadowing.service';
import { createInAppNotification, notifyAdmins } from '../../services/in-app-notifications.service';
import path from 'path';


const normalizePhotoUrls = (value: unknown) => {
  if (!Array.isArray(value)) return undefined;
  const normalized = value
    .map((entry) => normalizeStoredFileReference(typeof entry === 'string' ? entry : String(entry ?? '')))
    .filter((entry): entry is string => Boolean(entry));
  return normalized.length > 0 ? normalized : undefined;
};

const normalizePhotoLabels = (value: unknown) => {
  if (!Array.isArray(value)) return undefined;
  const normalized = value
    .map((entry) => String(entry ?? '').trim())
    .filter((entry): entry is string => Boolean(entry));
  return normalized.length > 0 ? normalized : undefined;
};

const normalizeLookupValue = (value: unknown) => String(value ?? '').trim();

const normalizeLookupType = (value: unknown) =>
  normalizeLookupValue(value).toLowerCase().replace(/[\s-]+/g, '_');

const withResolvedPhotoUrls = <T extends { photoUrls?: string[] | null }>(entry: T) => ({
  ...entry,
  photoUrls: Array.isArray(entry.photoUrls)
    ? entry.photoUrls
        .map((url) => resolveStoredFileUrl(url))
        .filter((url): url is string => Boolean(url))
    : [],
});

const toSafeFolderSegment = (value: string) => {
  const normalized = value
    .trim()
    .replace(/[\\/]+/g, '-')
    .replace(/\s+/g, ' ')
    .slice(0, 80);
  return normalized || 'Untitled Job';
};

const buildFieldUploadCategory = (jobTitle: string, userName: string) =>
  `Jobs/${toSafeFolderSegment(jobTitle)}/${toSafeFolderSegment(userName)}`;

const buildJobExpensesCategory = (jobTitle: string) =>
  `Jobs/${toSafeFolderSegment(jobTitle)}/expenses`;

const normalizeBodyText = (value: unknown) => String(value ?? '').trim();

const formatWorkerJobStatusLabel = (status?: string | null) => {
  const normalized = String(status ?? '').trim().toUpperCase();
  if (!normalized) return 'Updated';
  if (
    normalized === JobStatus.CREATED ||
    normalized === JobStatus.SCHEDULED ||
    normalized === JobStatus.CANCELLED ||
    normalized === JobStatus.NOT_ASSIGNED
  ) {
    return 'Not Assigned';
  }
  if (normalized === JobStatus.ASSIGNED) return 'Assigned';
  if (normalized === JobStatus.LIVE || normalized === JobStatus.EN_ROUTE || normalized === JobStatus.ON_SITE) return 'Live';
  if (normalized === JobStatus.REQUIRES_FOLLOW_UP) return 'Needs Attention';
  if (normalized === JobStatus.FINISHED) return 'Finished';
  if (normalized === JobStatus.COMPLETED) return 'Closed';
  return normalized.replace(/_/g, ' ');
};

const buildClosureNoteText = (params: {
  workDone: string;
  productsUsed?: string;
  notes?: string;
}) =>
  [
    `Work done:\n${params.workDone}`,
    params.productsUsed ? `Products used:\n${params.productsUsed}` : null,
    params.notes ? `Notes:\n${params.notes}` : null,
  ]
    .filter(Boolean)
    .join('\n\n');

const storeClosurePdf = async (params: {
  tenantId: string;
  job: Job;
  workerName: string;
  workDone: string;
  productsUsed?: string;
  notes?: string;
  customerSignatureData: string;
  customerSignatureName?: string;
  completedAt: Date;
}) => {
  const tenant = await AppDataSource.getRepository(Tenant).findOne({
    where: { id: params.tenantId, isDeleted: false },
  });
  const pdfBuffer = await buildJobClosurePdf({
    job: params.job,
    tenant,
    workerName: params.workerName,
    workDone: params.workDone,
    productsUsed: params.productsUsed,
    notes: params.notes,
    customerSignatureData: params.customerSignatureData,
    customerSignatureName: params.customerSignatureName,
    completedAt: params.completedAt,
  });
  const reference = params.job.jobNumber ?? params.job.id;
  const originalname = `job-closure-${reference}.pdf`.replace(/[^a-zA-Z0-9._-]/g, '-');
  const file = {
    fieldname: 'closure',
    originalname,
    encoding: '7bit',
    mimetype: 'application/pdf',
    size: pdfBuffer.length,
    buffer: pdfBuffer,
    stream: undefined as any,
    destination: '',
    filename: originalname,
    path: '',
  } as Express.Multer.File;
  const storageContext = await resolveTenantStorageContext(params.tenantId);
  const stored = await storeTenantFile(storageContext, file, { scope: 'job-closures' });
  return stored.key;
};

const resolveUploaderName = async (tenantId: string, userId: string) => {
  const userRepo = AppDataSource.getRepository(User);
  const user = await userRepo.findOne({
    where: { id: userId, tenantId, isDeleted: false },
    select: { id: true, fullName: true, email: true },
  });
  if (!user) return 'Field User';
  return user.fullName?.trim() || user.email?.trim() || 'Field User';
};

const upsertJobDocuments = async (params: {
  tenantId: string;
  jobId: string;
  jobTitle: string;
  userName: string;
  photoUrls?: string[];
  photoLabels?: string[];
}) => {
  const normalizedPhotoKeys =
    params.photoUrls
      ?.map((url) => normalizeStoredFileReference(url))
      .filter((url): url is string => Boolean(url)) ?? [];
  if (normalizedPhotoKeys.length === 0) return;

  const documentRepo = AppDataSource.getRepository(DocumentItem);
  const activeIntegration = await hasActiveIntegration(params.tenantId);
  const category = buildFieldUploadCategory(params.jobTitle, params.userName);

  for (let fileIndex = 0; fileIndex < normalizedPhotoKeys.length; fileIndex += 1) {
    const fileKey = normalizedPhotoKeys[fileIndex];
    let document = await documentRepo.findOne({
      where: {
        tenantId: params.tenantId,
        fileUrl: fileKey,
        relatedEntityType: 'job',
        relatedEntityId: params.jobId,
        isDeleted: false,
      },
    });
    if (!document) {
      const originalName = path.basename(fileKey).replace(/^\d+-[a-f0-9]+-/, '');
      const customLabel = params.photoLabels?.[fileIndex]?.trim();
      document = documentRepo.create({
        tenantId: params.tenantId,
        name: originalName || 'Job Attachment',
        label: customLabel || undefined,
        category,
        fileUrl: fileKey,
        relatedEntityType: 'job',
        relatedEntityId: params.jobId,
      }) as DocumentItem;
    } else {
      const customLabel = params.photoLabels?.[fileIndex]?.trim();
      if (customLabel) {
        document.label = customLabel;
      }
      document.category = category;
    }
    if (activeIntegration) {
      document.syncStatus = SyncStatus.PENDING;
    }
    await documentRepo.save(document);

    if (!activeIntegration) continue;
    const pushQueued = await enqueueDocumentPush({
      tenantId: params.tenantId,
      documentId: document.id,
    });
    if (!pushQueued) {
      try {
        await syncDocumentToProvider(document);
      } catch {
        // Keep app job update flow successful even when sync fails.
      }
    }
  }
};

const upsertExpenseReceiptDocument = async (params: {
  tenantId: string;
  jobId: string;
  jobTitle: string;
  expenseId: string;
  expenseLabel: string;
  receiptUrl?: string;
}) => {
  const receiptKey = normalizeStoredFileReference(params.receiptUrl);
  if (!receiptKey) return;

  const documentRepo = AppDataSource.getRepository(DocumentItem);
  const activeIntegration = await hasActiveIntegration(params.tenantId);
  const category = buildJobExpensesCategory(params.jobTitle);

  const existing = await documentRepo.findOne({
    where: {
      tenantId: params.tenantId,
      relatedEntityType: 'job_expense',
      relatedEntityId: params.expenseId,
      isDeleted: false,
    },
  });

  const originalName = path.basename(receiptKey).replace(/^\d+-[a-f0-9]+-/, '');
  const document = existing ?? (documentRepo.create({
    tenantId: params.tenantId,
    name: originalName || 'Expense Receipt',
    category,
    fileUrl: receiptKey,
    relatedEntityType: 'job_expense',
    relatedEntityId: params.expenseId,
  }) as DocumentItem);

  document.fileUrl = receiptKey;
  document.category = category;
  document.label = params.expenseLabel?.trim() || document.label;
  if (activeIntegration) {
    document.syncStatus = SyncStatus.PENDING;
  }
  await documentRepo.save(document);

  if (!activeIntegration) return;

  const pushQueued = await enqueueDocumentPush({
    tenantId: params.tenantId,
    documentId: document.id,
  });
  if (!pushQueued) {
    try {
      await syncDocumentToProvider(document);
    } catch {
      // Keep app expense flow successful even when sync fails.
    }
  }
};

const withResolvedReceiptUrl = <T extends { receiptUrl?: string | null }>(entry: T) => ({
  ...entry,
  receiptUrl: resolveStoredFileUrl(entry.receiptUrl),
});

const withResolvedFileUrl = <T extends { fileUrl?: string | null }>(entry: T) => ({
  ...entry,
  fileUrl: resolveStoredFileUrl(entry.fileUrl),
});

const isWorkflowOverlayEnabled = async (tenantId: string) => {
  const tenant = await AppDataSource.getRepository(Tenant).findOne({
    where: { id: tenantId, isDeleted: false },
  });
  return normalizeTenantFeatureFlags(tenant?.featureFlags).complianceWorkflows;
};

const buildCustomerSiteAddress = (site?: CustomerSite | null) => {
  if (!site) return null;
  const address = [
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
  return address || null;
};

const enrichAppJobs = async (jobs: Job[]) => {
  if (jobs.length === 0) return [];
  const tenantId = jobs[0]?.tenantId;
  const customerIds = Array.from(new Set(jobs.map((job) => job.customerId).filter((id): id is string => Boolean(id))));
  const siteIds = Array.from(new Set(jobs.map((job) => job.siteId).filter((id): id is string => Boolean(id))));
  const [customers, sites, siteContacts] = await Promise.all([
    customerIds.length
      ? AppDataSource.getRepository(Customer).find({
          where: customerIds.map((id) => ({ id, tenantId, isDeleted: false })),
        })
      : Promise.resolve([]),
    siteIds.length
      ? AppDataSource.getRepository(CustomerSite).find({
          where: siteIds.map((id) => ({ id, tenantId, isDeleted: false })),
        })
      : Promise.resolve([]),
    siteIds.length
      ? AppDataSource.getRepository(CustomerSiteContact).find({
          where: siteIds.map((id) => ({ siteId: id, tenantId, isDeleted: false })),
          order: { createdAt: 'ASC' },
        })
      : Promise.resolve([]),
  ]);
  const customerMap = new Map(customers.map((customer) => [customer.id, customer]));
  const siteMap = new Map(sites.map((site) => [site.id, site]));
  const contactsBySite = new Map<string, CustomerSiteContact[]>();
  siteContacts.forEach((contact) => {
    const rows = contactsBySite.get(contact.siteId) ?? [];
    rows.push(contact);
    contactsBySite.set(contact.siteId, rows);
  });
  return jobs.map((job) => {
    const customer = job.customerId ? customerMap.get(job.customerId) : null;
    const site = job.siteId ? siteMap.get(job.siteId) : null;
    const contacts = job.siteId ? contactsBySite.get(job.siteId) ?? [] : [];
    const customerName = customer?.name ?? null;
    return {
      ...job,
      customerName,
      clientName: customerName,
      customerEmail: customer?.email ?? null,
      siteName: site?.name ?? null,
      siteReference: site?.reference ?? null,
      siteAddress: buildCustomerSiteAddress(site),
      siteContacts: contacts,
      primarySiteContact:
        contacts.find((contact) => contact.id === site?.mainContactId) ??
        contacts[0] ??
        (site?.primaryContactName
          ? {
              name: site.primaryContactName,
              email: site.primaryContactEmail ?? null,
              phone: site.primaryContactPhone ?? null,
              role: 'Primary site contact',
            }
          : null),
    };
  });
};

const enrichAppJob = async (job: Job) => (await enrichAppJobs([job]))[0];

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
  const jobRepo = AppDataSource.getRepository(Job);
  const assignmentRepo = AppDataSource.getRepository(JobAssignment);
  const job = await jobRepo.findOne({ where: { id: jobId, tenantId, isDeleted: false } });
  if (!job) {
    throw new NotFoundError('Job not found');
  }
  const assignment = await assignmentRepo.findOne({
    where: { jobId: job.id, tenantId, userId, isDeleted: false, isActive: true },
  });
  if (!assignment) {
    throw new NotFoundError('Job not found');
  }
  return job;
};

const ensureJobEditable = (job: Job) => {
  if (String(job.status ?? '').toUpperCase() === 'COMPLETED') {
    throw new BadRequestError('Job is closed and locked for updates');
  }
};

export const listAssignedJobs = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = getTenantId(req);
    if (!req.userId) {
      throw new NotFoundError('User not found');
    }
    const assignmentsRepo = AppDataSource.getRepository(JobAssignment);
    const jobRepo = AppDataSource.getRepository(Job);
    const assignments = await assignmentsRepo.find({
      where: { tenantId, userId: req.userId, isDeleted: false, isActive: true }
    });
    const jobIds = assignments.map((a) => a.jobId);
    const jobs = jobIds.length
      ? await jobRepo.find({ where: jobIds.map((id) => ({ id, tenantId, isDeleted: false })) })
      : [];
    await syncJobLifecyclesForList(jobRepo, tenantId, jobs);
    res.deliver(200, true, await enrichAppJobs(jobs), 'Assigned jobs fetched');
  } catch (error) {
    next(error);
  }
};

export const getAssignedJob = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = getTenantId(req);
    const job = await ensureAssignedJobForUser({
      tenantId,
      jobId: req.params.id,
      userId: req.userId,
    });
    const assignmentCountMap = await getActiveAssignmentCountMap(tenantId, [job.id]);
    const nextStatus = deriveJobLifecycleStatus(job, assignmentCountMap.get(job.id) ?? 0);
    if (nextStatus !== job.status) {
      job.status = nextStatus;
      await AppDataSource.getRepository(Job).save(job);
    }
    res.deliver(200, true, await enrichAppJob(job), 'Job fetched');
  } catch (error) {
    next(error);
  }
};

const mapIncomingAppStatus = (status: string): JobStatus | null => {
  const normalized = String(status ?? '').toUpperCase();
  if (!normalized) return null;
  if (normalized === JobStatus.COMPLETED) return JobStatus.COMPLETED;
  if (
    normalized === JobStatus.LIVE ||
    normalized === JobStatus.EN_ROUTE ||
    normalized === JobStatus.ON_SITE
  ) {
    return JobStatus.LIVE;
  }
  if (normalized === JobStatus.REQUIRES_FOLLOW_UP) {
    return JobStatus.REQUIRES_FOLLOW_UP;
  }
  if (normalized === JobStatus.FINISHED) {
    return JobStatus.FINISHED;
  }
  if (normalized === JobStatus.ASSIGNED) return JobStatus.ASSIGNED;
  if (normalized === JobStatus.NOT_ASSIGNED) return JobStatus.NOT_ASSIGNED;
  return null;
};

export const updateAssignedJobStatus = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = getTenantId(req);
    const jobRepo = AppDataSource.getRepository(Job);
    const job = await ensureAssignedJobForUser({
      tenantId,
      jobId: req.params.id,
      userId: req.userId,
    });
    ensureJobEditable(job);
    const mapped = mapIncomingAppStatus(req.body.status);
    if (!mapped) {
      throw new BadRequestError('Unsupported job status update');
    }
    const previousStatus = job.status;
    if (mapped === JobStatus.COMPLETED) {
      job.status = JobStatus.COMPLETED;
      job.completedAt = new Date();
    } else if (mapped === JobStatus.LIVE || mapped === JobStatus.REQUIRES_FOLLOW_UP || mapped === JobStatus.FINISHED) {
      job.status = mapped;
    } else {
      const assignmentCountMap = await getActiveAssignmentCountMap(tenantId, [job.id]);
      job.status = deriveJobLifecycleStatus(job, assignmentCountMap.get(job.id) ?? 0);
    }
    job.workflowStageKey = await resolveWorkflowStageKeyForRecord({
      tenantId,
      module: 'jobs',
      baseStatus: job.status,
      currentStageKey: undefined,
      featureEnabled: await isWorkflowOverlayEnabled(tenantId),
    });
    await jobRepo.save(job);
    if (previousStatus !== job.status) {
      const workerName = await resolveUploaderName(tenantId, req.userId!);
      notifyAdmins({
        tenantId,
        title: 'Job Status Changed',
        message: `${workerName} changed job "${job.title}" from ${formatWorkerJobStatusLabel(previousStatus)} to ${formatWorkerJobStatusLabel(job.status)}.`,
        targetUrl: `/admin/schedule/${job.id}`,
      }).catch(err => console.error('Status notification failed:', err));
    }
    res.deliver(200, true, job, 'Job status updated');
  } catch (error) {
    next(error);
  }
};

export const listAppLookupOptions = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = getTenantId(req);
    const type = normalizeLookupType(req.query.type);
    if (!type) {
      throw new BadRequestError('Lookup type is required.');
    }
    const options = await AppDataSource.getRepository(LookupOption).find({
      where: { tenantId, type, isDeleted: false },
      order: { title: 'ASC' },
    });
    res.deliver(200, true, options, 'Lookup options fetched');
  } catch (error) {
    next(error);
  }
};

export const createAppLookupOption = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = getTenantId(req);
    const type = normalizeLookupType(req.body.type);
    const title = normalizeLookupValue(req.body.title);
    if (!type || !title) {
      throw new BadRequestError('Lookup title and type are required.');
    }
    const repo = AppDataSource.getRepository(LookupOption);
    const existing = await repo.findOne({ where: { tenantId, type, title, isDeleted: false } });
    if (existing) {
      res.deliver(200, true, existing, 'Lookup option already exists');
      return;
    }
    const option = repo.create({ tenantId, type, title });
    await repo.save(option);
    res.deliver(201, true, option, 'Lookup option created');
  } catch (error: any) {
    if (error?.code === '23505') {
      next(new BadRequestError('Lookup option already exists.'));
      return;
    }
    next(error);
  }
};

export const createJobUpdate = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = getTenantId(req);
    const updateRepo = AppDataSource.getRepository(JobUpdate);
    const jobRepo = AppDataSource.getRepository(Job);
    const job = await ensureAssignedJobForUser({
      tenantId,
      jobId: req.params.id,
      userId: req.userId,
    });
    const uploaderName = await resolveUploaderName(tenantId, req.userId!);
    const requestedStatus = normalizeBodyText(req.body.status).toUpperCase();
    const updateStatus = requestedStatus ? mapIncomingAppStatus(requestedStatus) : undefined;
    if (updateStatus === null) {
      throw new BadRequestError('Unsupported job status update');
    }
    if (String(job.status ?? '').toUpperCase() === 'COMPLETED' && updateStatus) {
      throw new BadRequestError('Job is closed. Please ask office staff to change job status.');
    }
    const isCompletion = updateStatus === JobStatus.COMPLETED;
    const workDone = normalizeBodyText(req.body.workDone);
    const productsUsed = normalizeBodyText(req.body.productsUsed);
    const closureNotes = normalizeBodyText(req.body.closureNotes);
    const signatureData = normalizeBodyText(req.body.customerSignatureData);
    const signatureName = normalizeBodyText(req.body.customerSignatureName);
    let updateNotes = normalizeBodyText(req.body.notes) || undefined;
    let photoUrls = normalizePhotoUrls(req.body.photoUrls);
    let photoLabels = normalizePhotoLabels(req.body.photoLabels);

    if (isCompletion) {
      if (!workDone) {
        throw new BadRequestError('Work done is required to complete the job.');
      }
      if (!signatureData) {
        throw new BadRequestError('Customer signature is required to complete the job.');
      }
      updateNotes = closureNotes || undefined;
      const completedAt = new Date();
      const closurePdfKey = await storeClosurePdf({
        tenantId,
        job,
        workerName: uploaderName,
        workDone,
        productsUsed,
        notes: closureNotes,
        customerSignatureData: signatureData,
        customerSignatureName: signatureName,
        completedAt,
      });
      const existingPhotoUrls = photoUrls ?? [];
      const existingPhotoLabels = photoLabels ?? Array(existingPhotoUrls.length).fill('');
      photoUrls = [...existingPhotoUrls, closurePdfKey];
      photoLabels = [...existingPhotoLabels, 'Job Closure Report'];
    }

    const update = updateRepo.create({
      jobId: job.id,
      userId: req.userId!,
      tenantId,
      status: updateStatus,
      notes: updateNotes,
      photoUrls,
      photoLabels,
      customerSignatureData: signatureData || undefined,
      customerSignatureName: signatureName || undefined,
      clientTimestamp: req.body.clientTimestamp ? new Date(req.body.clientTimestamp) : undefined
    });
    await updateRepo.save(update);
    await upsertJobDocuments({
      tenantId,
      jobId: job.id,
      jobTitle: job.title,
      userName: uploaderName,
      photoUrls: update.photoUrls,
      photoLabels: update.photoLabels,
    });
    if (update.status) {
      job.status = update.status;
      if (update.status === 'COMPLETED') {
        job.completedAt = new Date();
      }
      job.workflowStageKey = await resolveWorkflowStageKeyForRecord({
        tenantId,
        module: 'jobs',
        baseStatus: job.status,
        currentStageKey: undefined,
        featureEnabled: await isWorkflowOverlayEnabled(tenantId),
      });
      await jobRepo.save(job);

      // Notify admins of status change
      notifyAdmins({
        tenantId,
        title: update.status === JobStatus.REQUIRES_FOLLOW_UP ? 'Job Needs Attention' : 'Job Status Changed',
        message: `${uploaderName} changed job "${job.title}" to ${formatWorkerJobStatusLabel(update.status)}.`,
        targetUrl: `/admin/schedule/${job.id}`,
      }).catch(err => console.error('Status notification failed:', err));
    }
    res.deliver(201, true, withResolvedPhotoUrls(update), 'Job update created');
  } catch (error) {
    next(error);
  }
};

export const listJobUpdates = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = getTenantId(req);
    if (!req.userId) {
      throw new NotFoundError('User not found');
    }
    await ensureAssignedJobForUser({
      tenantId,
      jobId: req.params.id,
      userId: req.userId,
    });
    const updateRepo = AppDataSource.getRepository(JobUpdate);
    const updates = await updateRepo.find({
      where: { jobId: req.params.id, tenantId, userId: req.userId, isDeleted: false },
      order: { createdAt: 'ASC' }
    });
    res.deliver(200, true, updates.map(withResolvedPhotoUrls), 'Job updates fetched');
  } catch (error) {
    next(error);
  }
};

export const updateJobUpdate = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = getTenantId(req);
    if (!req.userId) {
      throw new NotFoundError('User not found');
    }
    const job = await ensureAssignedJobForUser({
      tenantId,
      jobId: req.params.id,
      userId: req.userId,
    });
    ensureJobEditable(job);
    const updateRepo = AppDataSource.getRepository(JobUpdate);
    const update = await updateRepo.findOne({
      where: {
        id: req.params.updateId,
        jobId: req.params.id,
        tenantId,
        userId: req.userId,
        isDeleted: false,
      },
    });
    if (!update) {
      throw new NotFoundError('Field update not found');
    }
    if (req.body.notes !== undefined) {
      update.notes = normalizeLookupValue(req.body.notes) || undefined;
    }
    if (req.body.photoUrls !== undefined) {
      update.photoUrls = normalizePhotoUrls(req.body.photoUrls);
    }
    if (req.body.photoLabels !== undefined) {
      update.photoLabels = normalizePhotoLabels(req.body.photoLabels);
    }
    await updateRepo.save(update);
    res.deliver(200, true, withResolvedPhotoUrls(update), 'Field update saved');
  } catch (error) {
    next(error);
  }
};

export const deleteJobUpdate = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = getTenantId(req);
    if (!req.userId) {
      throw new NotFoundError('User not found');
    }
    const job = await ensureAssignedJobForUser({
      tenantId,
      jobId: req.params.id,
      userId: req.userId,
    });
    ensureJobEditable(job);
    const updateRepo = AppDataSource.getRepository(JobUpdate);
    const update = await updateRepo.findOne({
      where: {
        id: req.params.updateId,
        jobId: req.params.id,
        tenantId,
        userId: req.userId,
        isDeleted: false,
      },
    });
    if (!update) {
      throw new NotFoundError('Field update not found');
    }
    update.isDeleted = true;
    await updateRepo.save(update);
    res.deliver(200, true, { id: update.id }, 'Field update deleted');
  } catch (error) {
    next(error);
  }
};

export const listJobExpenses = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = getTenantId(req);
    if (!req.userId) {
      throw new NotFoundError('User not found');
    }
    await ensureAssignedJobForUser({
      tenantId,
      jobId: req.params.id,
      userId: req.userId,
    });
    const repo = AppDataSource.getRepository(JobExpense);
    const expenses = await repo.find({
      where: { tenantId, jobId: req.params.id, userId: req.userId, isDeleted: false },
      order: { createdAt: 'DESC' },
    });
    res.deliver(200, true, expenses.map(withResolvedReceiptUrl), 'Job expenses fetched');
  } catch (error) {
    next(error);
  }
};

export const createJobExpense = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = getTenantId(req);
    const userId = req.userId;
    if (!userId) {
      throw new NotFoundError('User not found');
    }
    const job = await ensureAssignedJobForUser({
      tenantId,
      jobId: req.params.id,
      userId,
    });
    const repo = AppDataSource.getRepository(JobExpense);
    const expenseDate = req.body.expenseDate
      ? new Date(req.body.expenseDate)
      : new Date();
    if (Number.isNaN(expenseDate.getTime())) {
      throw new BadRequestError('Invalid expense date');
    }
    const expense = repo.create({
      tenantId,
      userId,
      jobId: req.params.id,
      description: req.body.description,
      category: normalizeLookupValue(req.body.category) || undefined,
      amount: Number(req.body.amount),
      currency: String(req.body.currency ?? 'GBP').toUpperCase().slice(0, 3),
      expenseDate: expenseDate.toISOString().slice(0, 10),
      receiptUrl: normalizeStoredFileReference(req.body.receiptUrl),
      customerSignatureData: req.body.customerSignatureData,
      customerSignatureName: req.body.customerSignatureName,
      customerSignatureCapturedAt: req.body.customerSignatureData ? new Date() : undefined,
    });
    await repo.save(expense);
    await upsertExpenseReceiptDocument({
      tenantId,
      jobId: job.id,
      jobTitle: job.title,
      expenseId: expense.id,
      expenseLabel: expense.description,
      receiptUrl: expense.receiptUrl,
    });
    res.deliver(201, true, withResolvedReceiptUrl(expense), 'Expense added');
  } catch (error) {
    next(error);
  }
};

export const listJobAttachments = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = getTenantId(req);
    await ensureAssignedJobForUser({
      tenantId,
      jobId: req.params.id,
      userId: req.userId,
    });

    const repo = AppDataSource.getRepository(DocumentItem);
    const attachments = await repo.find({
      where: [
        {
          tenantId,
          relatedEntityType: 'job_attachment',
          relatedEntityId: req.params.id,
          isDeleted: false,
        },
        {
          tenantId,
          relatedEntityType: 'job',
          relatedEntityId: req.params.id,
          category: ILike('%/attachments'),
          isDeleted: false,
        },
      ],
      order: { createdAt: 'DESC' },
    });
    res.deliver(200, true, attachments.map(withResolvedFileUrl), 'Job attachments fetched');
  } catch (error) {
    next(error);
  }
};

export const listJobTimeEntries = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = getTenantId(req);
    await ensureAssignedJobForUser({
      tenantId,
      jobId: req.params.id,
      userId: req.userId,
    });
    const repo = AppDataSource.getRepository(JobTimeEntry);
    const entries = await repo.find({
      where: { tenantId, jobId: req.params.id, isDeleted: false },
      order: { startTime: 'DESC' },
    });
    res.deliver(200, true, entries, 'Time entries fetched');
  } catch (error) {
    next(error);
  }
};

export const createJobTimeEntry = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = getTenantId(req);
    const userId = req.userId;
    if (!userId) {
      throw new NotFoundError('User not found');
    }
    const job = await ensureAssignedJobForUser({
      tenantId,
      jobId: req.params.id,
      userId,
    });
    const startTime = new Date(req.body.startTime);
    const endTime = new Date(req.body.endTime);
    if (Number.isNaN(startTime.getTime()) || Number.isNaN(endTime.getTime())) {
      throw new BadRequestError('Invalid time range');
    }
    if (endTime <= startTime) {
      throw new BadRequestError('End time must be after start time');
    }
    const durationMinutes = Math.round((endTime.getTime() - startTime.getTime()) / 60000);
    if (durationMinutes <= 0) {
      throw new BadRequestError('Invalid time duration');
    }
    if (durationMinutes > 24 * 60) {
      throw new BadRequestError('Time entry duration cannot exceed 24 hours');
    }
    const repo = AppDataSource.getRepository(JobTimeEntry);
    const assignmentRepo = AppDataSource.getRepository(JobAssignment);
    const userRepo = AppDataSource.getRepository(User);
    const tenantRepo = AppDataSource.getRepository(Tenant);
    const overlappingEntry = await repo
      .createQueryBuilder('entry')
      .where('entry.tenantId = :tenantId', { tenantId })
      .andWhere('entry.userId = :userId', { userId })
      .andWhere('entry.isDeleted = :isDeleted', { isDeleted: false })
      .andWhere('entry.startTime < :endTime', { endTime: endTime.toISOString() })
      .andWhere('entry.endTime > :startTime', { startTime: startTime.toISOString() })
      .getOne();
    if (overlappingEntry) {
      throw new BadRequestError('Time range overlaps with an existing time entry');
    }
    const assignment = await assignmentRepo.findOne({
      where: { tenantId, jobId: req.params.id, userId, isDeleted: false, isActive: true },
      relations: ['team'],
      order: { assignedAt: 'DESC', createdAt: 'DESC' },
    });
    const user = await userRepo.findOne({
      where: { id: userId, tenantId, isDeleted: false, isActive: true },
      select: { id: true, hourlyRate: true },
    });
    const tenant = await tenantRepo.findOne({
      where: { id: tenantId, isDeleted: false },
      select: { id: true, defaultHourlyRate: true },
    });
    const resolvedHourlyRate = Number(
      assignment?.effectiveHourlyRate ??
        assignment?.team?.hourlyRate ??
        user?.hourlyRate ??
        tenant?.defaultHourlyRate ??
        0,
    );
    const entry = repo.create({
      tenantId,
      userId,
      jobId: req.params.id,
      startTime,
      endTime,
      durationMinutes,
      hourlyRate:
        Number.isFinite(resolvedHourlyRate) && resolvedHourlyRate > 0
          ? resolvedHourlyRate
          : undefined,
      notes: req.body.notes,
      entryType: 'MANUAL',
    });
    await repo.save(entry);

    // Notify admins of manual time entry
    const actorName = await resolveUploaderName(tenantId, userId);
    notifyAdmins({
      tenantId,
      title: 'Manual Time Logged',
      message: `${actorName} manually logged ${(durationMinutes / 60).toFixed(2)} hrs for job: ${job.title}`,
      targetUrl: `/admin/schedule/${job.id}?tab=timesheets`,
    }).catch(err => console.error('Time log notification failed:', err));

    res.deliver(201, true, entry, 'Time entry added');
  } catch (error) {
    next(error);
  }
};

export const getActiveTimer = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = getTenantId(req);
    const userId = req.userId;

    if (!userId) {
      throw new NotFoundError('User not found');
    }

    const timer = await AppDataSource.getRepository(ActiveTimer).findOne({
      where: { userId, tenantId },
    });

    res.deliver(200, true, timer, 'Active timer fetched');
  } catch (error) {
    next(error);
  }
};

export const startActiveTimer = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = getTenantId(req);
    const userId = req.userId;
    const jobId = req.params.id;

    if (!userId) {
      throw new NotFoundError('User not found');
    }

    const job = await ensureAssignedJobForUser({
      tenantId,
      jobId: req.params.id,
      userId,
    });
    ensureJobEditable(job);

    const timerRepo = AppDataSource.getRepository(ActiveTimer);
    const existing = await timerRepo.findOne({
      where: { userId, tenantId },
    });

    if (existing) {
      throw new BadRequestError('You already have an active timer running.');
    }

    const timer = timerRepo.create({
      tenantId,
      userId,
      jobId,
      startTime: new Date(),
    });
    await timerRepo.save(timer);

    res.deliver(201, true, timer, 'Timer started');
  } catch (error) {
    next(error);
  }
};

export const stopActiveTimer = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = getTenantId(req);
    const userId = req.userId;
    const jobId = req.params.id;

    if (!userId) {
      throw new NotFoundError('User not found');
    }

    const job = await ensureAssignedJobForUser({
      tenantId,
      jobId,
      userId,
    });
    ensureJobEditable(job);


    const timerRepo = AppDataSource.getRepository(ActiveTimer);
    const timer = await timerRepo.findOne({
      where: { userId, jobId, tenantId },
    });

    if (!timer) {
      throw new NotFoundError('No active timer found for this job.');
    }

    const endTime = new Date();
    const durationMinutes = Math.round((endTime.getTime() - timer.startTime.getTime()) / 60000);

    const timeRepo = AppDataSource.getRepository(JobTimeEntry);
    
    // Resolve hourly rate logic similarly to createJobTimeEntry
    const assignmentRepo = AppDataSource.getRepository(JobAssignment);
    const userRepo = AppDataSource.getRepository(User);
    const tenantRepo = AppDataSource.getRepository(Tenant);

    const [assignment, user, tenant] = await Promise.all([
      assignmentRepo.findOne({
        where: { jobId, userId, tenantId, isDeleted: false, isActive: true },
        relations: ['team'],
        order: { assignedAt: 'DESC', createdAt: 'DESC' },
      }),
      userRepo.findOne({ where: { id: userId, tenantId, isDeleted: false } }),
      tenantRepo.findOne({ where: { id: tenantId, isDeleted: false } }),
    ]);

    const resolvedRate = Number(
      assignment?.effectiveHourlyRate ??
        assignment?.team?.hourlyRate ??
        user?.hourlyRate ??
        tenant?.defaultHourlyRate ??
        0,
    );

    const timeEntry = timeRepo.create({
      tenantId,
      jobId,
      userId,
      startTime: timer.startTime,
      endTime,
      durationMinutes: Math.max(durationMinutes, 1),
      hourlyRate:
        Number.isFinite(resolvedRate) && resolvedRate > 0
          ? resolvedRate
          : undefined,
      notes: req.body?.notes || undefined,
      entryType: 'SYSTEM',
    });

    await timeRepo.save(timeEntry);
    await timerRepo.remove(timer);

    // Notify admins of system time entry
    const actorName = await resolveUploaderName(tenantId, userId);
    notifyAdmins({
      tenantId,
      title: 'Time Logged (Timer)',
      message: `${actorName} logged ${(durationMinutes / 60).toFixed(2)} hrs via timer for job: ${job.title}`,
      targetUrl: `/admin/schedule/${job.id}?tab=timesheets`,
    }).catch(err => console.error('Time log notification failed:', err));

    res.deliver(200, true, timeEntry, 'Timer stopped and time entry saved');
  } catch (error) {
    next(error);
  }
};

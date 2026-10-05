import { Request, Response, NextFunction } from 'express';
import { AppDataSource } from '../../../config/data-source';
import { JobUpdate } from '../../../entities/job-update.entity';
import { Job } from '../../../entities/job.entity';
import { getTenantId } from '../../../utils/request';
import { BadRequestError, NotFoundError } from '../../../utils/errors';
import { normalizeStoredFileReference, resolveStoredFileUrl } from '../../../services/storage/storage.service';
import path from 'path';
import { DocumentItem } from '../../../entities/document.entity';
import { hasActiveIntegration } from '../../../services/integrations.service';
import { SyncStatus } from '../../../constants/integrations';
import { enqueueDocumentPush } from '../../queues/document-sync-queue.service';
import { syncDocumentToProvider } from '../../../services/integrations/document-shadowing.service';
import { createJobActivity } from '../../../services/job-activity.service';

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

const buildJobAttachmentsCategory = (jobTitle: string) =>
  `Jobs/${toSafeFolderSegment(jobTitle)}/attachments`;

const withResolvedDocumentUrl = <T extends { fileUrl?: string | null }>(entry: T) => ({
  ...entry,
  fileUrl: resolveStoredFileUrl(entry.fileUrl),
});

const upsertJobDocuments = async (params: {
  tenantId: string;
  jobId: string;
  jobTitle: string;
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
  const category = buildJobAttachmentsCategory(params.jobTitle);

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
      const customLabel = params.photoLabels?.[fileIndex]?.trim();
      const originalName = path.basename(fileKey).replace(/^\d+-[a-f0-9]+-/, '');
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
        // Keep job update flow successful even when sync fails; retry pipeline handles this.
      }
    }
  }
};

const createJobAttachmentDocuments = async (params: {
  tenantId: string;
  jobId: string;
  jobTitle: string;
  photoUrls?: string[];
  photoLabels?: string[];
}) => {
  const normalizedPhotoKeys =
    params.photoUrls
      ?.map((url) => normalizeStoredFileReference(url))
      .filter((url): url is string => Boolean(url)) ?? [];
  if (normalizedPhotoKeys.length === 0) {
    throw new BadRequestError('At least one attachment is required');
  }

  const documentRepo = AppDataSource.getRepository(DocumentItem);
  const activeIntegration = await hasActiveIntegration(params.tenantId);
  const category = buildJobAttachmentsCategory(params.jobTitle);
  const created: DocumentItem[] = [];

  for (let fileIndex = 0; fileIndex < normalizedPhotoKeys.length; fileIndex += 1) {
    const fileKey = normalizedPhotoKeys[fileIndex];
    const customLabel = params.photoLabels?.[fileIndex]?.trim();
    const originalName = path.basename(fileKey).replace(/^\d+-[a-f0-9]+-/, '');
    const document = documentRepo.create({
      tenantId: params.tenantId,
      name: originalName || 'Job Attachment',
      label: customLabel || undefined,
      category,
      fileUrl: fileKey,
      relatedEntityType: 'job_attachment',
      relatedEntityId: params.jobId,
      syncStatus: activeIntegration ? SyncStatus.PENDING : SyncStatus.SYNCED,
    }) as DocumentItem;
    await documentRepo.save(document);
    created.push(document);

    if (!activeIntegration) continue;
    const pushQueued = await enqueueDocumentPush({
      tenantId: params.tenantId,
      documentId: document.id,
    });
    if (!pushQueued) {
      try {
        await syncDocumentToProvider(document);
      } catch {
        // Keep tenant attachment flow successful even when sync fails; retry pipeline handles this.
      }
    }
  }

  return created;
};

const ensureTenantJob = async (tenantId: string, jobId: string) => {
  const repo = AppDataSource.getRepository(Job);
  const job = await repo.findOne({
    where: { id: jobId, tenantId, isDeleted: false },
  });
  if (!job) {
    throw new NotFoundError('Job not found');
  }
  return job;
};

export const listJobUpdates = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = getTenantId(req);
    const repo = AppDataSource.getRepository(JobUpdate);
    const updates = await repo.find({
      where: { jobId: req.params.id, tenantId, isDeleted: false },
      relations: ['user', 'user.roles'],
      order: { createdAt: 'ASC' }
    });
    res.deliver(200, true, updates.map(withResolvedPhotoUrls), 'Job updates fetched');
  } catch (error) {
    next(error);
  }
};

export const createJobUpdate = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = getTenantId(req);
    const jobRepo = AppDataSource.getRepository(Job);
    const updateRepo = AppDataSource.getRepository(JobUpdate);
    const job = await jobRepo.findOne({ where: { id: req.params.id, tenantId, isDeleted: false } });
    if (!job) {
      throw new NotFoundError('Job not found');
    }
    if (!req.userId) {
      throw new NotFoundError('User not found');
    }
    const photoLabels = normalizePhotoLabels(
      req.body.photoLabels ?? req.body.photoNames,
    );
    const update = updateRepo.create({
      jobId: job.id,
      userId: req.userId,
      tenantId,
      status: req.body.status,
      notes: req.body.notes,
      photoUrls: normalizePhotoUrls(req.body.photoUrls),
      photoLabels,
      customerSignatureData: req.body.customerSignatureData,
      customerSignatureName: req.body.customerSignatureName,
      clientTimestamp: req.body.clientTimestamp ? new Date(req.body.clientTimestamp) : undefined
    });
    await updateRepo.save(update);
    await createJobActivity({
      tenantId,
      jobId: job.id,
      userId: req.userId,
      type: 'Field Update',
      message: update.notes?.trim() || 'Field update submitted.',
      metadata: {
        updateId: update.id,
        status: update.status ?? null,
        attachmentCount: update.photoUrls?.length ?? 0,
      },
    });
    if (update.status) {
      job.status = update.status;
      await jobRepo.save(job);
    }
    res.deliver(201, true, withResolvedPhotoUrls(update), 'Job update created');
  } catch (error) {
    next(error);
  }
};

export const updateJobUpdate = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = getTenantId(req);
    const job = await ensureTenantJob(tenantId, req.params.id);
    const repo = AppDataSource.getRepository(JobUpdate);
    const update = await repo.findOne({
      where: { id: req.params.updateId, jobId: job.id, tenantId, isDeleted: false },
      relations: ['user', 'user.roles'],
    });
    if (!update) {
      throw new NotFoundError('Field update not found');
    }
    if (req.body.notes !== undefined) {
      update.notes = String(req.body.notes ?? '').trim() || undefined;
    }
    if (req.body.photoUrls !== undefined) {
      update.photoUrls = normalizePhotoUrls(req.body.photoUrls);
    }
    if (req.body.photoLabels !== undefined || req.body.photoNames !== undefined) {
      update.photoLabels = normalizePhotoLabels(req.body.photoLabels ?? req.body.photoNames);
    }
    await repo.save(update);
    await upsertJobDocuments({
      tenantId,
      jobId: job.id,
      jobTitle: job.title,
      photoUrls: update.photoUrls,
      photoLabels: update.photoLabels,
    });
    await createJobActivity({
      tenantId,
      jobId: job.id,
      userId: req.userId,
      type: 'Field Update Edited',
      message: 'Field update edited by office staff.',
      metadata: { updateId: update.id, attachmentCount: update.photoUrls?.length ?? 0 },
    });
    res.deliver(200, true, withResolvedPhotoUrls(update), 'Field update saved');
  } catch (error) {
    next(error);
  }
};

export const deleteJobUpdate = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = getTenantId(req);
    const job = await ensureTenantJob(tenantId, req.params.id);
    const repo = AppDataSource.getRepository(JobUpdate);
    const update = await repo.findOne({
      where: { id: req.params.updateId, jobId: job.id, tenantId, isDeleted: false },
    });
    if (!update) {
      throw new NotFoundError('Field update not found');
    }
    update.isDeleted = true;
    await repo.save(update);
    await createJobActivity({
      tenantId,
      jobId: job.id,
      userId: req.userId,
      type: 'Field Update Deleted',
      message: update.notes?.trim()
        ? `Field update deleted: ${update.notes.trim().slice(0, 120)}`
        : 'Field update deleted.',
      metadata: { updateId: update.id },
    });
    res.deliver(200, true, { id: update.id }, 'Field update deleted');
  } catch (error) {
    next(error);
  }
};

export const listJobAttachments = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = getTenantId(req);
    await ensureTenantJob(tenantId, req.params.id);
    const repo = AppDataSource.getRepository(DocumentItem);
    const attachments = await repo.find({
      where: {
        tenantId,
        relatedEntityType: 'job_attachment',
        relatedEntityId: req.params.id,
        isDeleted: false,
      },
      order: { createdAt: 'DESC' },
    });
    res.deliver(
      200,
      true,
      attachments.map((entry) => withResolvedDocumentUrl(entry)),
      'Job attachments fetched',
    );
  } catch (error) {
    next(error);
  }
};

export const createJobAttachment = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = getTenantId(req);
    const job = await ensureTenantJob(tenantId, req.params.id);
    const photoLabels = normalizePhotoLabels(
      req.body.photoLabels ?? req.body.photoNames,
    );
    const created = await createJobAttachmentDocuments({
      tenantId,
      jobId: job.id,
      jobTitle: job.title,
      photoUrls: normalizePhotoUrls(req.body.photoUrls),
      photoLabels,
    });
    await createJobActivity({
      tenantId,
      jobId: job.id,
      userId: req.userId,
      type: 'Attachment Added',
      message: `${created.length} attachment${created.length === 1 ? '' : 's'} added to the job.`,
      metadata: { attachmentIds: created.map((entry) => entry.id) },
    });
    res.deliver(
      201,
      true,
      created.map((entry) => withResolvedDocumentUrl(entry)),
      'Job attachments added',
    );
  } catch (error) {
    next(error);
  }
};

export const updateJobAttachment = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = getTenantId(req);
    const job = await ensureTenantJob(tenantId, req.params.id);
    const repo = AppDataSource.getRepository(DocumentItem);
    const attachment = await repo.findOne({
      where: {
        id: req.params.attachmentId,
        tenantId,
        relatedEntityType: 'job_attachment',
        relatedEntityId: job.id,
        isDeleted: false,
      },
    });
    if (!attachment) {
      throw new NotFoundError('Attachment not found');
    }
    if (req.body.name !== undefined) {
      attachment.name = String(req.body.name ?? '').trim() || attachment.name;
    }
    if (req.body.label !== undefined) {
      const label = String(req.body.label ?? '').trim();
      attachment.label = label || undefined;
    }
    await repo.save(attachment);
    await createJobActivity({
      tenantId,
      jobId: job.id,
      userId: req.userId,
      type: 'Attachment Updated',
      message: `Attachment "${attachment.label || attachment.name}" updated.`,
      metadata: { attachmentId: attachment.id },
    });
    res.deliver(200, true, withResolvedDocumentUrl(attachment), 'Job attachment updated');
  } catch (error) {
    next(error);
  }
};

export const deleteJobAttachment = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = getTenantId(req);
    const job = await ensureTenantJob(tenantId, req.params.id);
    const repo = AppDataSource.getRepository(DocumentItem);
    const attachment = await repo.findOne({
      where: {
        id: req.params.attachmentId,
        tenantId,
        relatedEntityType: 'job_attachment',
        relatedEntityId: job.id,
        isDeleted: false,
      },
    });
    if (!attachment) {
      throw new NotFoundError('Attachment not found');
    }
    attachment.isDeleted = true;
    await repo.save(attachment);
    await createJobActivity({
      tenantId,
      jobId: job.id,
      userId: req.userId,
      type: 'Attachment Deleted',
      message: `Attachment "${attachment.label || attachment.name}" deleted.`,
      metadata: { attachmentId: attachment.id },
    });
    res.deliver(200, true, { id: attachment.id }, 'Job attachment deleted');
  } catch (error) {
    next(error);
  }
};

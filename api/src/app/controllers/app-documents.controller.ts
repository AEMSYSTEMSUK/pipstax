import { Request, Response, NextFunction } from 'express';
import { AppDataSource } from '../../config/data-source';
import { DocumentItem } from '../../entities/document.entity';
import { SyncStatus } from '../../constants/integrations';
import { getTenantId } from '../../utils/request';
import { hasActiveIntegration } from '../../services/integrations.service';
import {
  pullProviderDocumentsToCRM,
  syncDocumentToProvider,
} from '../../services/integrations/document-shadowing.service';
import {
  enqueueDocumentPush,
  enqueueTenantPull,
} from '../../tenant/queues/document-sync-queue.service';
import { normalizeStoredFileReference, resolveStoredFileUrl } from '../../services/storage/storage.service';

const withResolvedFileUrl = <T extends { fileUrl?: string | null }>(document: T) => ({
  ...document,
  fileUrl: resolveStoredFileUrl(document.fileUrl),
});

export const uploadDocument = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = getTenantId(req);
    const repo = AppDataSource.getRepository(DocumentItem);
    const activeIntegration = await hasActiveIntegration(tenantId);
    const document = repo.create({
      name: req.body.name,
      fileUrl: normalizeStoredFileReference(req.body.fileUrl),
      category: req.body.category,
      relatedEntityType: req.body.relatedEntityType,
      relatedEntityId: req.body.relatedEntityId,
      tenantId,
      syncStatus: activeIntegration ? SyncStatus.PENDING : SyncStatus.PENDING
    });
    await repo.save(document);
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
          syncWarning = error?.message ?? 'Document uploaded, but sync failed';
        }
      }
    }
    res.deliver(
      201,
      true,
      {
        ...withResolvedFileUrl(document),
        syncWarning,
      },
      syncWarning ? 'Document uploaded with sync warning' : 'Document uploaded',
    );
  } catch (error) {
    next(error);
  }
};

export const listDocuments = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = getTenantId(req);
    const pullQueued = await enqueueTenantPull({ tenantId });
    if (!pullQueued) {
      try {
        await pullProviderDocumentsToCRM({ tenantId });
      } catch {
        // Keep listing responsive even when provider pull sync fails.
      }
    }
    const repo = AppDataSource.getRepository(DocumentItem);
    const documents = await repo.find({
      where: { tenantId, isDeleted: false },
      order: { createdAt: 'DESC' }
    });
    res.deliver(200, true, documents.map((doc) => withResolvedFileUrl(doc)), 'Documents fetched');
  } catch (error) {
    next(error);
  }
};

import { Request, Response, NextFunction } from "express";
import { AppDataSource } from "../../../config/data-source";
import { DocumentItem } from "../../../entities/document.entity";
import { getTenantId } from "../../../utils/request";
import { BadRequestError, NotFoundError } from "../../../utils/errors";
import { hasActiveIntegration } from "../../../services/integrations.service";
import { SyncStatus } from "../../../constants/integrations";
import {
  deleteDocumentFromProvider,
  pullProviderDocumentsToCRM,
  syncDocumentToProvider,
} from "../../../services/integrations/document-shadowing.service";
import {
  enqueueDocumentPush,
  enqueueTenantPull,
} from "../../queues/document-sync-queue.service";
import {
  normalizeStoredFileReference,
  removeStoredLocalFile,
  resolveStoredFileUrl,
} from "../../../services/storage/storage.service";
import { toStoredUploadKey } from "../../../middleware/stream-upload.middleware";

const withResolvedFileUrl = <T extends { fileUrl?: string | null }>(
  document: T,
) => ({
  ...document,
  fileUrl: resolveStoredFileUrl(document.fileUrl),
});

export const listDocuments = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
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
    });
    res.deliver(
      200,
      true,
      documents.map((doc) => withResolvedFileUrl(doc)),
      "Documents fetched",
    );
  } catch (error) {
    next(error);
  }
};

export const getDocument = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const tenantId = getTenantId(req);
    const repo = AppDataSource.getRepository(DocumentItem);
    const document = await repo.findOne({
      where: { id: req.params.id, tenantId, isDeleted: false },
    });
    if (!document) {
      throw new NotFoundError("Document not found");
    }
    res.deliver(200, true, withResolvedFileUrl(document), "Document fetched");
  } catch (error) {
    next(error);
  }
};

export const createDocument = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const tenantId = getTenantId(req);
    const repo = AppDataSource.getRepository(DocumentItem);
    const activeIntegration = await hasActiveIntegration(tenantId);
    const document = repo.create({
      ...req.body,
      fileUrl: normalizeStoredFileReference(req.body?.fileUrl),
      tenantId,
    }) as unknown as DocumentItem;
    if (activeIntegration) {
      document.syncStatus = SyncStatus.PENDING;
    }
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
          syncWarning = error?.message ?? "Document saved, but sync failed";
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
      syncWarning ? "Document created with sync warning" : "Document created",
    );
  } catch (error) {
    next(error);
  }
};

export const createDocumentByStreamUpload = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const tenantId = getTenantId(req);
    const file = req.file as Express.Multer.File | undefined;
    if (!file) {
      throw new BadRequestError("No file uploaded");
    }

    const storedKey = normalizeStoredFileReference(
      toStoredUploadKey(file.path),
    );
    if (!storedKey) {
      throw new BadRequestError("Stored file path not available");
    }

    const documentName =
      String(req.body?.name ?? "").trim() || file.originalname || "Document";
    const category = String(req.body?.category ?? "").trim() || "Uncategorized";

    const repo = AppDataSource.getRepository(DocumentItem);
    const activeIntegration = await hasActiveIntegration(tenantId);
    const document = repo.create({
      tenantId,
      name: documentName,
      category,
      fileUrl: storedKey,
    }) as unknown as DocumentItem;

    if (activeIntegration) {
      document.syncStatus = SyncStatus.PENDING;
    }

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
          syncWarning = error?.message ?? "Document uploaded, but sync failed";
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
      syncWarning ? "Document uploaded with sync warning" : "Document uploaded",
    );
  } catch (error) {
    console.log(error);
    next(error);
  }
};

export const updateDocument = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const tenantId = getTenantId(req);
    const repo = AppDataSource.getRepository(DocumentItem);
    const activeIntegration = await hasActiveIntegration(tenantId);
    const document = await repo.findOne({
      where: { id: req.params.id, tenantId, isDeleted: false },
    });
    if (!document) {
      throw new NotFoundError("Document not found");
    }
    const previousName = document.name;
    const previousFileUrl = document.fileUrl;
    const shouldAttemptSync =
      !!activeIntegration &&
      (typeof req.body.name === "string" ||
        typeof req.body.fileUrl === "string" ||
        !document.externalId);
    const normalizedFileUrl =
      typeof req.body.fileUrl === "string"
        ? normalizeStoredFileReference(req.body.fileUrl)
        : undefined;
    Object.assign(document, {
      ...req.body,
      ...(normalizedFileUrl !== undefined
        ? { fileUrl: normalizedFileUrl }
        : {}),
    });
    if (
      shouldAttemptSync &&
      (document.name !== previousName ||
        document.fileUrl !== previousFileUrl ||
        !document.externalId)
    ) {
      document.syncStatus = SyncStatus.PENDING;
    }
    await repo.save(document);
    let syncWarning: string | null = null;
    if (
      shouldAttemptSync &&
      (document.syncStatus === SyncStatus.PENDING || !document.externalId)
    ) {
      const pushQueued = await enqueueDocumentPush({
        tenantId,
        documentId: document.id,
      });
      if (!pushQueued) {
        try {
          await syncDocumentToProvider(document);
        } catch (error: any) {
          syncWarning = error?.message ?? "Document updated, but sync failed";
        }
      }
    }
    res.deliver(
      200,
      true,
      {
        ...withResolvedFileUrl(document),
        syncWarning,
      },
      syncWarning ? "Document updated with sync warning" : "Document updated",
    );
  } catch (error) {
    next(error);
  }
};

export const deleteDocument = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const tenantId = getTenantId(req);
    const repo = AppDataSource.getRepository(DocumentItem);
    const document = await repo.findOne({
      where: { id: req.params.id, tenantId, isDeleted: false },
    });
    if (!document) {
      throw new NotFoundError("Document not found");
    }
    const warnings: string[] = [];
    const cleanup = {
      providerDeleted: false,
      localDeleted: false,
    };

    if (document.externalId) {
      try {
        const result = await deleteDocumentFromProvider(document);
        cleanup.providerDeleted = Boolean(result.deleted);
      } catch (error: any) {
        warnings.push(
          error?.message ?? "Failed to remove file from synced provider",
        );
      }
    }

    try {
      cleanup.localDeleted = await removeStoredLocalFile(document.fileUrl);
    } catch (error: any) {
      warnings.push(error?.message ?? "Failed to remove local file");
    }

    document.isDeleted = true;
    await repo.save(document);
    res.deliver(
      200,
      true,
      {
        ...withResolvedFileUrl(document),
        cleanup,
        warnings,
      },
      warnings.length > 0
        ? "Document removed with cleanup warnings"
        : "Document removed",
    );
  } catch (error) {
    next(error);
  }
};

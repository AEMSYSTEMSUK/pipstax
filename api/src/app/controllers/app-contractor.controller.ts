import { Request, Response, NextFunction } from 'express';
import { AppDataSource } from '../../config/data-source';
import { ContractorProfile } from '../../entities/contractor-profile.entity';
import { ContractorDocument } from '../../entities/contractor-document.entity';
import { ContractorDocumentReview } from '../../entities/contractor-document-review.entity';
import { ContractorTraining } from '../../entities/contractor-training.entity';
import { DocumentRequirement } from '../../entities/document-requirement.entity';
import { NotFoundError } from '../../utils/errors';
import { DocumentStatus } from '../../constants/status';
import { getTenantId } from '../../utils/request';
import { computeComplianceStatus } from '../../utils/contractor-compliance';
import { BadRequestError } from '../../utils/errors';
import {
  syncContractorDocumentToCRMShadow,
  syncDocumentToProvider,
} from '../../services/integrations/document-shadowing.service';
import { enqueueDocumentPush } from '../../tenant/queues/document-sync-queue.service';
import { normalizeStoredFileReference, resolveStoredFileUrl } from '../../services/storage/storage.service';

const findContractorByUserId = async (userId: string) => {
  return AppDataSource.getRepository(ContractorProfile).findOne({
    where: { userId, isDeleted: false }
  });
};

export const getContractorPortal = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.userId) {
      throw new NotFoundError('User not found');
    }
    const contractor = await findContractorByUserId(req.userId);
    if (!contractor) {
      throw new NotFoundError('Contractor profile not found');
    }
    const requirements = await AppDataSource.getRepository(DocumentRequirement).find({
      where: { tenantId: contractor.tenantId, contractorId: contractor.id, isDeleted: false }
    });
    const documents = await AppDataSource.getRepository(ContractorDocument).find({
      where: { contractorId: contractor.id, tenantId: contractor.tenantId, isDeleted: false }
    });
    const reviews = await AppDataSource.getRepository(ContractorDocumentReview).find({
      where: { contractorId: contractor.id, tenantId: contractor.tenantId, isDeleted: false },
      order: { createdAt: 'DESC' }
    });
    const reviewMap = new Map<string, ContractorDocumentReview[]>();
    reviews.forEach((review) => {
      const list = reviewMap.get(review.documentId) ?? [];
      list.push(review);
      reviewMap.set(review.documentId, list);
    });
    const enrichedDocs = documents.map((doc) => ({
      ...doc,
      fileUrl: resolveStoredFileUrl(doc.fileUrl),
      history: reviewMap.get(doc.id) ?? []
    }));
    const training = await AppDataSource.getRepository(ContractorTraining).findOne({
      where: { contractorId: contractor.id, tenantId: contractor.tenantId, isDeleted: false }
    });
    res.deliver(200, true, { contractor, requirements, documents: enrichedDocs, training }, 'Contractor portal');
  } catch (error) {
    next(error);
  }
};

export const uploadContractorDocument = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = getTenantId(req);
    const contractorRepo = AppDataSource.getRepository(ContractorProfile);
    const documentRepo = AppDataSource.getRepository(ContractorDocument);
    const reviewRepo = AppDataSource.getRepository(ContractorDocumentReview);
    const requirementRepo = AppDataSource.getRepository(DocumentRequirement);
    if (!req.userId) {
      throw new NotFoundError('User not found');
    }
    const contractor = await contractorRepo.findOne({ where: { userId: req.userId, isDeleted: false } });
    if (!contractor) {
      throw new NotFoundError('Contractor profile not found');
    }
    if (contractor.tenantId !== tenantId) {
      throw new NotFoundError('Contractor profile not found');
    }
    const document = await documentRepo.findOne({
      where: {
        contractorId: contractor.id,
        requirementId: req.body.requirementId,
        tenantId: contractor.tenantId,
        isDeleted: false
      }
    });
    if (!document) {
      throw new NotFoundError('Document requirement not found');
    }
    const requirement = await requirementRepo.findOne({
      where: { id: req.body.requirementId, contractorId: contractor.id, tenantId, isDeleted: false },
    });
    document.fileUrl = normalizeStoredFileReference(req.body.fileUrl);
    document.status = DocumentStatus.SUBMITTED;
    document.reviewerNotes = undefined;
    await documentRepo.save(document);
    await reviewRepo.save(
      reviewRepo.create({
        documentId: document.id,
        contractorId: contractor.id,
        tenantId,
        status: DocumentStatus.SUBMITTED,
        notes: 'Document submitted',
        actorType: 'CONTRACTOR',
        actorUserId: req.userId ?? undefined
      })
    );

    const training = await AppDataSource.getRepository(ContractorTraining).findOne({
      where: { contractorId: contractor.id, tenantId, isDeleted: false }
    });
    contractor.complianceStatus = computeComplianceStatus(
      await documentRepo.find({ where: { contractorId: contractor.id, tenantId, isDeleted: false } }),
      training ?? null
    );
    await contractorRepo.save(contractor);

    const shadowDocument = await syncContractorDocumentToCRMShadow({
      tenantId,
      contractorDocumentId: document.id,
      fileUrl: document.fileUrl ?? '',
      requirementName: requirement?.name ?? 'Contractor Document',
      contractorName: contractor.contactName ?? contractor.companyName ?? 'Contractor',
    });
    const pushQueued = await enqueueDocumentPush({
      tenantId,
      documentId: shadowDocument.id,
    });
    if (!pushQueued) {
      try {
        await syncDocumentToProvider(shadowDocument);
      } catch {
        // Keep contractor document submission successful even if shadow sync fails.
      }
    }

    res.deliver(200, true, { ...document, fileUrl: resolveStoredFileUrl(document.fileUrl) }, 'Document submitted');
  } catch (error) {
    next(error);
  }
};

export const acknowledgeTraining = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = getTenantId(req);
    const trainingRepo = AppDataSource.getRepository(ContractorTraining);
    if (!req.userId) {
      throw new NotFoundError('User not found');
    }
    const contractor = await AppDataSource.getRepository(ContractorProfile).findOne({
      where: { userId: req.userId, isDeleted: false }
    });
    if (!contractor) {
      throw new NotFoundError('Contractor profile not found');
    }
    let training = await trainingRepo.findOne({
      where: { contractorId: contractor.id, tenantId, isDeleted: false }
    });
    if (!training) {
      training = trainingRepo.create({
        contractorId: contractor.id,
        tenantId,
        acknowledged: req.body.acknowledged || req.body.acknowledgement,
        acknowledgedAt: new Date(),
        signatureData: req.body.signatureData
      });
    } else {
      if (training.acknowledged) {
        throw new BadRequestError('Training acknowledgement already submitted.');
      }
      training.acknowledged = req.body.acknowledged || req.body.acknowledgement;
      training.acknowledgedAt = new Date();
      training.signatureData = req.body.signatureData ?? training.signatureData;
    }
    await trainingRepo.save(training);
    contractor.complianceStatus = computeComplianceStatus(
      await AppDataSource.getRepository(ContractorDocument).find({
        where: { contractorId: contractor.id, tenantId, isDeleted: false }
      }),
      training
    );
    await AppDataSource.getRepository(ContractorProfile).save(contractor);
    res.deliver(200, true, training, 'Training acknowledged');
  } catch (error) {
    next(error);
  }
};

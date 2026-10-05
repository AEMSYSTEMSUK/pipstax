import { Request, Response, NextFunction } from 'express';
import { AppDataSource } from '../../../config/data-source';
import { ContractorProfile } from '../../../entities/contractor-profile.entity';
import { ContractorDocument } from '../../../entities/contractor-document.entity';
import { ContractorDocumentReview } from '../../../entities/contractor-document-review.entity';
import { DocumentRequirement } from '../../../entities/document-requirement.entity';
import { ContractorTraining } from '../../../entities/contractor-training.entity';
import { User } from '../../../entities/user.entity';
import { Role } from '../../../entities/role.entity';
import { Account } from '../../../entities/account.entity';
import { AccountTenant } from '../../../entities/account-tenant.entity';
import { getTenantId } from '../../../utils/request';
import { BadRequestError, NotFoundError } from '../../../utils/errors';
import { SystemRole } from '../../../constants/roles';
import { hashPassword } from '../../../utils/password';
import { ContractorComplianceStatus, DocumentStatus } from '../../../constants/status';
import { computeComplianceStatus } from '../../../utils/contractor-compliance';
import { sendContractorInviteEmail } from '../../../services/notifications.service';
import { env } from '../../../config/env';
import { generateTempPassword } from '../../../utils/credentials';
import { withAuthDetails } from '../../../utils/auth-details';
import { resolveStoredFileUrl } from '../../../services/storage/storage.service';

export const listContractors = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = getTenantId(req);
    const repo = AppDataSource.getRepository(ContractorProfile);
    const contractors = await repo.find({ where: { tenantId, isDeleted: false }, relations: ['user'] });
    res.deliver(200, true, contractors, 'Contractors fetched');
  } catch (error) {
    next(error);
  }
};

export const getContractor = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = getTenantId(req);
    const repo = AppDataSource.getRepository(ContractorProfile);
    const contractor = await repo.findOne({ where: { id: req.params.id, tenantId, isDeleted: false }, relations: ['user'] });
    if (!contractor) {
      throw new NotFoundError('Contractor not found');
    }
    res.deliver(200, true, contractor, 'Contractor fetched');
  } catch (error) {
    next(error);
  }
};

export const createContractor = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = getTenantId(req);
    const userRepo = AppDataSource.getRepository(User);
    const roleRepo = AppDataSource.getRepository(Role);
    const accountRepo = AppDataSource.getRepository(Account);
    const accountTenantRepo = AppDataSource.getRepository(AccountTenant);
    const contractorRepo = AppDataSource.getRepository(ContractorProfile);
    const requirementsRepo = AppDataSource.getRepository(DocumentRequirement);
    const trainingRepo = AppDataSource.getRepository(ContractorTraining);

    const existingUser = await userRepo.findOne({ where: { email: req.body.email, tenantId } });
    if (existingUser) {
      const payload = withAuthDetails(
        { user: existingUser },
        { loginUrl: env.appPortalUrl, email: req.body.email }
      );
      return res.deliver(200, true, payload, 'User already exists');
    }

    const role = await roleRepo.findOne({ where: { tenantId, code: SystemRole.SUB_CONTRACTOR } });
    if (!role) {
      throw new NotFoundError('Sub-contractor role missing');
    }

    const providedPassword =
      typeof req.body.password === 'string' && req.body.password.trim().length > 0
        ? req.body.password.trim()
        : undefined;
    let loginPassword: string | undefined;
    let account = await accountRepo.findOne({ where: { email: req.body.email } });
    if (!account) {
      const tempPassword = providedPassword ?? generateTempPassword(12);
      account = accountRepo.create({
        email: req.body.email,
        passwordHash: await hashPassword(tempPassword),
        isActive: true,
        emailVerifiedAt: new Date()
      });
      await accountRepo.save(account);
      loginPassword = tempPassword;
    } else if (providedPassword) {
      account.passwordHash = await hashPassword(providedPassword);
      account.isActive = true;
      account.emailVerifiedAt = account.emailVerifiedAt ?? new Date();
      await accountRepo.save(account);
      loginPassword = providedPassword;
    }

    const user = userRepo.create({
      fullName: req.body.fullName,
      email: req.body.email,
      phone: req.body.phone,
      tenantId,
      accountId: account.id,
      roles: [role]
    });
    await userRepo.save(user);
    await accountTenantRepo.save(
      accountTenantRepo.create({
        accountId: account.id,
        tenantId,
        userId: user.id
      })
    );

    const contractor = contractorRepo.create({
      userId: user.id,
      companyName: req.body.companyName,
      tradeType: req.body.tradeType,
      contactName: req.body.fullName,
      phone: req.body.phone,
      tenantId
    });
    await contractorRepo.save(contractor);

    const requirementInputs = Array.isArray(req.body.requirements) ? req.body.requirements : [];
    const createdRequirements = requirementInputs.length
      ? await requirementsRepo.save(
          requirementInputs.map((reqItem: any) =>
            requirementsRepo.create({
              name: reqItem.name,
              description: reqItem.description,
              isRequired: reqItem.isRequired ?? true,
              tenantId,
              contractorId: contractor.id
            })
          )
        )
      : [];

    if (createdRequirements.length > 0) {
      const docs = createdRequirements.map((reqItem: DocumentRequirement) =>
        AppDataSource.getRepository(ContractorDocument).create({
          contractorId: contractor.id,
          requirementId: reqItem.id,
          tenantId,
          status: DocumentStatus.PENDING
        })
      );
      await AppDataSource.getRepository(ContractorDocument).save(docs);
    }

    const training = trainingRepo.create({ contractorId: contractor.id, tenantId });
    await trainingRepo.save(training);

    const docs = await AppDataSource.getRepository(ContractorDocument).find({
      where: { contractorId: contractor.id, tenantId, isDeleted: false }
    });
    contractor.complianceStatus = computeComplianceStatus(docs, training);
    await contractorRepo.save(contractor);

    await sendContractorInviteEmail(
      req.body.email,
      { email: req.body.email, password: loginPassword ?? null },
      { tenantId }
    );
    const payload = withAuthDetails(
      { contractor },
      { loginUrl: env.appPortalUrl, email: req.body.email, tempPassword: loginPassword }
    );
    res.deliver(201, true, payload, 'Contractor created');
  } catch (error) {
    next(error);
  }
};

export const listRequirements = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = getTenantId(req);
    const repo = AppDataSource.getRepository(DocumentRequirement);
    const contractorId = typeof req.query.contractorId === 'string' ? req.query.contractorId : undefined;
    const requirements = await repo.find({
      where: {
        tenantId,
        contractorId: contractorId ?? undefined,
        isDeleted: false
      }
    });
    res.deliver(200, true, requirements, 'Requirements fetched');
  } catch (error) {
    next(error);
  }
};

export const createRequirement = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = getTenantId(req);
    const repo = AppDataSource.getRepository(DocumentRequirement);
    const contractorRepo = AppDataSource.getRepository(ContractorProfile);
    const contractor = await contractorRepo.findOne({
      where: { id: req.body.contractorId, tenantId, isDeleted: false }
    });
    if (!contractor) {
      throw new NotFoundError('Contractor not found');
    }
    const requirement = repo.create({
      name: req.body.name,
      description: req.body.description,
      isRequired: req.body.isRequired,
      tenantId,
      contractorId: contractor.id
    });
    await repo.save(requirement);
    await AppDataSource.getRepository(ContractorDocument).save(
      AppDataSource.getRepository(ContractorDocument).create({
        contractorId: contractor.id,
        requirementId: requirement.id,
        tenantId,
        status: DocumentStatus.PENDING
      })
    );
    const docs = await AppDataSource.getRepository(ContractorDocument).find({
      where: { contractorId: contractor.id, tenantId, isDeleted: false }
    });
    const training = await AppDataSource.getRepository(ContractorTraining).findOne({
      where: { contractorId: contractor.id, tenantId, isDeleted: false }
    });
    contractor.complianceStatus = computeComplianceStatus(docs, training ?? null);
    await AppDataSource.getRepository(ContractorProfile).save(contractor);
    res.deliver(201, true, requirement, 'Requirement created');
  } catch (error) {
    next(error);
  }
};

export const listContractorDocuments = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = getTenantId(req);
    const repo = AppDataSource.getRepository(ContractorDocument);
    const reviewRepo = AppDataSource.getRepository(ContractorDocumentReview);
    const documents = await repo.find({
      where: { contractorId: req.params.id, tenantId, isDeleted: false },
      relations: ['requirement']
    });
    const reviews = await reviewRepo.find({
      where: { contractorId: req.params.id, tenantId, isDeleted: false },
      order: { createdAt: 'DESC' }
    });
    const reviewMap = new Map<string, ContractorDocumentReview[]>();
    reviews.forEach((review) => {
      const list = reviewMap.get(review.documentId) ?? [];
      list.push(review);
      reviewMap.set(review.documentId, list);
    });
    const enriched = documents.map((doc) => ({
      ...doc,
      fileUrl: resolveStoredFileUrl(doc.fileUrl),
      history: reviewMap.get(doc.id) ?? []
    }));
    res.deliver(200, true, enriched, 'Documents fetched');
  } catch (error) {
    next(error);
  }
};

export const getContractorTraining = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = getTenantId(req);
    const repo = AppDataSource.getRepository(ContractorTraining);
    const training = await repo.findOne({ where: { contractorId: req.params.id, tenantId, isDeleted: false } });
    res.deliver(200, true, training ?? null, 'Training fetched');
  } catch (error) {
    next(error);
  }
};

export const reviewContractorDocument = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = getTenantId(req);
    const repo = AppDataSource.getRepository(ContractorDocument);
    const reviewRepo = AppDataSource.getRepository(ContractorDocumentReview);
    const document = await repo.findOne({ where: { id: req.params.docId, tenantId, isDeleted: false } });
    if (!document) {
      throw new NotFoundError('Document not found');
    }
    if (req.body.status === DocumentStatus.REJECTED && !req.body.reviewerNotes) {
      throw new BadRequestError('Rejection reason is required.');
    }
    document.status = req.body.status as DocumentStatus;
    document.reviewerNotes = req.body.reviewerNotes?.trim() || undefined;
    await repo.save(document);
    await reviewRepo.save(
      reviewRepo.create({
        documentId: document.id,
        contractorId: document.contractorId,
        tenantId,
        status: document.status,
        notes: req.body.reviewerNotes,
        actorType: 'ADMIN',
        actorUserId: req.userId ?? undefined
      })
    );

    const contractorRepo = AppDataSource.getRepository(ContractorProfile);
    const trainingRepo = AppDataSource.getRepository(ContractorTraining);
    const contractor = await contractorRepo.findOne({ where: { id: document.contractorId, tenantId, isDeleted: false } });
    if (contractor) {
      const docs = await repo.find({ where: { contractorId: contractor.id, tenantId, isDeleted: false } });
      const training = await trainingRepo.findOne({ where: { contractorId: contractor.id, tenantId, isDeleted: false } });
      contractor.complianceStatus = computeComplianceStatus(docs, training ?? null);
      await contractorRepo.save(contractor);
    }
    res.deliver(200, true, { ...document, fileUrl: resolveStoredFileUrl(document.fileUrl) }, 'Document reviewed');
  } catch (error) {
    next(error);
  }
};

export const reviewContractorCompliancePack = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = getTenantId(req);
    const contractorRepo = AppDataSource.getRepository(ContractorProfile);
    const documentRepo = AppDataSource.getRepository(ContractorDocument);
    const reviewRepo = AppDataSource.getRepository(ContractorDocumentReview);
    const trainingRepo = AppDataSource.getRepository(ContractorTraining);
    const contractor = await contractorRepo.findOne({ where: { id: req.params.id, tenantId, isDeleted: false } });
    if (!contractor) {
      throw new NotFoundError('Contractor profile not found');
    }

    const nextStatus = String(req.body.status ?? '').toUpperCase();
    if (!['APPROVED', 'REJECTED'].includes(nextStatus)) {
      throw new BadRequestError('Status must be APPROVED or REJECTED.');
    }
    const rejectionReason = req.body.reviewerNotes?.trim();
    if (nextStatus === 'REJECTED' && !rejectionReason) {
      throw new BadRequestError('Rejection reason is required.');
    }

    const documents = await documentRepo.find({ where: { contractorId: contractor.id, tenantId, isDeleted: false } });
    if (documents.length === 0) {
      throw new BadRequestError('No compliance documents have been submitted.');
    }
    const training = await trainingRepo.findOne({ where: { contractorId: contractor.id, tenantId, isDeleted: false } });
    if (nextStatus === 'APPROVED' && documents.some((document) => !document.fileUrl)) {
      throw new BadRequestError('All requested documents must be uploaded before approval.');
    }
    if (nextStatus === 'APPROVED' && !training?.acknowledged) {
      throw new BadRequestError('Compliance pack signature is required before approval.');
    }

    const documentStatus = nextStatus === 'APPROVED' ? DocumentStatus.APPROVED : DocumentStatus.REJECTED;
    documents.forEach((document) => {
      document.status = documentStatus;
      document.reviewerNotes = nextStatus === 'REJECTED' ? rejectionReason : undefined;
    });
    await documentRepo.save(documents);

    if (nextStatus === 'REJECTED' && training) {
      training.acknowledged = false;
      training.acknowledgedAt = undefined;
      training.signatureData = undefined;
      await trainingRepo.save(training);
    }

    await reviewRepo.save(
      documents.map((document) =>
        reviewRepo.create({
          documentId: document.id,
          contractorId: contractor.id,
          tenantId,
          status: documentStatus,
          notes: nextStatus === 'REJECTED' ? rejectionReason : 'Compliance pack approved',
          actorType: 'ADMIN',
          actorUserId: req.userId ?? undefined
        })
      )
    );

    contractor.complianceStatus =
      nextStatus === 'APPROVED'
        ? ContractorComplianceStatus.COMPLIANT
        : ContractorComplianceStatus.REJECTED;
    await contractorRepo.save(contractor);

    res.deliver(200, true, contractor, nextStatus === 'APPROVED' ? 'Compliance pack approved' : 'Compliance pack rejected');
  } catch (error) {
    next(error);
  }
};

export const acknowledgeTraining = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = getTenantId(req);
    const repo = AppDataSource.getRepository(ContractorTraining);
    let training = await repo.findOne({ where: { contractorId: req.params.id, tenantId, isDeleted: false } });
    if (!training) {
      training = repo.create({
        contractorId: req.params.id,
        tenantId,
        acknowledged: true,
        acknowledgedAt: new Date(),
        signatureData: req.body.signatureData
      });
    } else {
      if (training.acknowledged) {
        throw new BadRequestError('Training acknowledgement already submitted.');
      }
      training.acknowledged = true;
      training.acknowledgedAt = new Date();
      training.signatureData = req.body.signatureData ?? training.signatureData;
    }
    await repo.save(training);

    const contractorRepo = AppDataSource.getRepository(ContractorProfile);
    const documentRepo = AppDataSource.getRepository(ContractorDocument);
    const contractor = await contractorRepo.findOne({ where: { id: req.params.id, tenantId, isDeleted: false } });
    if (contractor) {
      const docs = await documentRepo.find({ where: { contractorId: contractor.id, tenantId, isDeleted: false } });
      contractor.complianceStatus = computeComplianceStatus(docs, training);
      await contractorRepo.save(contractor);
    }
    res.deliver(200, true, training, 'Training acknowledged');
  } catch (error) {
    next(error);
  }
};

export const updateContractorProfile = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = getTenantId(req);
    const repo = AppDataSource.getRepository(ContractorProfile);
    const contractor = await repo.findOne({ where: { id: req.params.id, tenantId, isDeleted: false } });
    if (!contractor) {
      throw new NotFoundError('Contractor not found');
    }
    contractor.contactName = req.body.contactName ?? contractor.contactName;
    contractor.companyName = req.body.companyName ?? contractor.companyName;
    contractor.phone = req.body.phone ?? contractor.phone;
    contractor.tradeType = req.body.tradeType ?? contractor.tradeType;
    contractor.notes = req.body.notes ?? contractor.notes;
    await repo.save(contractor);
    res.deliver(200, true, contractor, 'Contractor updated');
  } catch (error) {
    next(error);
  }
};

export const suspendContractor = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = getTenantId(req);
    const contractorRepo = AppDataSource.getRepository(ContractorProfile);
    const userRepo = AppDataSource.getRepository(User);
    const contractor = await contractorRepo.findOne({ where: { id: req.params.id, tenantId, isDeleted: false } });
    if (!contractor) {
      throw new NotFoundError('Contractor not found');
    }
    const user = await userRepo.findOne({ where: { id: contractor.userId, tenantId } });
    if (!user) {
      throw new NotFoundError('User not found');
    }
    user.isActive = false;
    await userRepo.save(user);
    res.deliver(200, true, { contractorId: contractor.id, isActive: user.isActive }, 'Contractor suspended');
  } catch (error) {
    next(error);
  }
};

export const activateContractor = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = getTenantId(req);
    const contractorRepo = AppDataSource.getRepository(ContractorProfile);
    const userRepo = AppDataSource.getRepository(User);
    const contractor = await contractorRepo.findOne({ where: { id: req.params.id, tenantId, isDeleted: false } });
    if (!contractor) {
      throw new NotFoundError('Contractor not found');
    }
    const user = await userRepo.findOne({ where: { id: contractor.userId, tenantId } });
    if (!user) {
      throw new NotFoundError('User not found');
    }
    user.isActive = true;
    await userRepo.save(user);
    res.deliver(200, true, { contractorId: contractor.id, isActive: user.isActive }, 'Contractor activated');
  } catch (error) {
    next(error);
  }
};

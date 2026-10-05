import { Router } from 'express';
import {
  listContractors,
  getContractor,
  createContractor,
  listRequirements,
  createRequirement,
  listContractorDocuments,
  getContractorTraining,
  reviewContractorDocument,
  reviewContractorCompliancePack,
  acknowledgeTraining,
  updateContractorProfile,
  suspendContractor,
  activateContractor
} from '../controllers/contractors/contractors.controller';
import { authMiddleware } from '../../middleware/auth';
import { tenantMiddleware } from '../../middleware/tenant';
import { requirePermission } from '../../middleware/permissions';
import { Permissions } from '../../constants/permissions';
import { validateBody } from '../../middleware/validate';
import { ContractorComplianceReviewDto, ContractorCreateDto, ContractorDocumentReviewDto } from '../dto/contractor.dto';
import { RequirementCreateDto } from '../dto/requirement.dto';

const router = Router();

router.use(authMiddleware, tenantMiddleware);

router.get('/', requirePermission(Permissions.SUBCONTRACTORS_VIEW), listContractors);
router.post('/', requirePermission(Permissions.SUBCONTRACTORS_MANAGE), validateBody(ContractorCreateDto), createContractor);

router.get('/requirements', requirePermission(Permissions.SUBCONTRACTORS_VIEW), listRequirements);
router.post('/requirements', requirePermission(Permissions.SUBCONTRACTORS_MANAGE), validateBody(RequirementCreateDto), createRequirement);

router.get('/:id', requirePermission(Permissions.SUBCONTRACTORS_VIEW), getContractor);
router.put('/:id', requirePermission(Permissions.SUBCONTRACTORS_MANAGE), updateContractorProfile);
router.post('/:id/suspend', requirePermission(Permissions.SUBCONTRACTORS_MANAGE), suspendContractor);
router.post('/:id/activate', requirePermission(Permissions.SUBCONTRACTORS_MANAGE), activateContractor);

router.get('/:id/documents', requirePermission(Permissions.SUBCONTRACTORS_VIEW), listContractorDocuments);
router.get('/:id/training', requirePermission(Permissions.SUBCONTRACTORS_VIEW), getContractorTraining);
router.post('/:id/compliance-review', requirePermission(Permissions.SUBCONTRACTORS_MANAGE), validateBody(ContractorComplianceReviewDto), reviewContractorCompliancePack);
router.post('/:id/training/ack', requirePermission(Permissions.SUBCONTRACTORS_MANAGE), acknowledgeTraining);
router.post('/:id/documents/:docId/review', requirePermission(Permissions.SUBCONTRACTORS_MANAGE), validateBody(ContractorDocumentReviewDto), reviewContractorDocument);

export default router;

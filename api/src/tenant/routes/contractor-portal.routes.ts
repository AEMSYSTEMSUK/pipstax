import { Router } from 'express';
import { acknowledgeTraining, getContractorPortal, uploadContractorDocument } from '../controllers/public/contractor-portal.controller';
import { validateBody } from '../../middleware/validate';
import { ContractorDocumentUploadDto, ContractorTrainingAckDto } from '../dto/contractor.dto';

const router = Router();

router.get('/:userId', getContractorPortal);
router.post('/:id/documents', validateBody(ContractorDocumentUploadDto), uploadContractorDocument);
router.post('/:id/training/ack', validateBody(ContractorTrainingAckDto), acknowledgeTraining);

export default router;

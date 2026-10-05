import { ContractorComplianceStatus, DocumentStatus } from '../constants/status';
import { ContractorDocument } from '../entities/contractor-document.entity';
import { ContractorTraining } from '../entities/contractor-training.entity';

export const computeComplianceStatus = (
  documents: ContractorDocument[],
  training?: ContractorTraining | null
) => {
  const hasRejected = documents.some((doc) => doc.status === DocumentStatus.REJECTED);
  if (hasRejected) {
    return ContractorComplianceStatus.REJECTED;
  }

  if (documents.length === 0) {
    return ContractorComplianceStatus.PENDING;
  }

  const hasPending = documents.some((doc) => doc.status === DocumentStatus.PENDING);
  const allApproved = documents.length > 0 && documents.every((doc) => doc.status === DocumentStatus.APPROVED);
  const acknowledged = Boolean(training?.acknowledged);

  if (allApproved && acknowledged) {
    return ContractorComplianceStatus.COMPLIANT;
  }

  if (!hasPending || acknowledged) {
    return ContractorComplianceStatus.SUBMITTED;
  }

  return ContractorComplianceStatus.PENDING;
};

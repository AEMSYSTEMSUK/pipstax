import { AppDataSource } from '../config/data-source';
import { IntegrationConnection } from '../entities/integration.entity';
import { IntegrationProvider, IntegrationStatus } from '../constants/integrations';
import { DOCUMENT_SYNC_PROVIDERS } from '../constants/document-sync';

export const hasActiveIntegration = async (tenantId: string) => {
  const repo = AppDataSource.getRepository(IntegrationConnection);
  const integration = await repo.findOne({
    where: DOCUMENT_SYNC_PROVIDERS.map((provider) => ({
      tenantId,
      provider: provider as IntegrationProvider,
      status: IntegrationStatus.CONNECTED,
      isDeleted: false,
    })),
    order: { updatedAt: 'DESC' },
  });
  return integration ?? null;
};

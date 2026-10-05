import { AppDataSource } from '../../config/data-source';
import { IntegrationStatus } from '../../constants/integrations';
import { IntegrationConnection } from '../../entities/integration.entity';

const REAUTH_ERROR_PATTERNS: RegExp[] = [
  /token has been expired or revoked/i,
  /token has expired or revoked/i,
  /expired or revoked/i,
  /invalid[_\s-]?grant/i,
  /invalid[_\s-]?token/i,
  /refresh token/i,
  /reauthori[sz]e/i,
  /authorization revoked/i,
  /invalid credentials/i,
];

export const getIntegrationErrorMessage = (error: unknown) =>
  String(error instanceof Error ? error.message : error ?? '').trim() || 'Integration request failed';

export const isReauthRequiredError = (error: unknown) => {
  const message = getIntegrationErrorMessage(error).toLowerCase();
  if (!message) return false;
  return REAUTH_ERROR_PATTERNS.some((pattern) => pattern.test(message));
};

export const markIntegrationReauthRequired = async (
  integration: IntegrationConnection,
  reason: string,
) => {
  const repo = AppDataSource.getRepository(IntegrationConnection);
  const metadata = (integration.metadata as Record<string, unknown> | null) ?? {};
  const previousFlag = metadata.reauthRequired === true;

  metadata.reauthRequired = true;
  metadata.reauthReason = reason;
  metadata.reauthDetectedAt = metadata.reauthDetectedAt ?? new Date().toISOString();
  metadata.reauthUpdatedAt = new Date().toISOString();

  integration.metadata = metadata;
  integration.status = IntegrationStatus.DISCONNECTED;

  if (previousFlag && integration.status === IntegrationStatus.DISCONNECTED) {
    await repo.save(integration);
    return integration;
  }
  await repo.save(integration);
  return integration;
};

export const clearIntegrationReauthRequired = (
  metadataInput?: Record<string, unknown> | null,
) => {
  const metadata = { ...(metadataInput ?? {}) } as Record<string, unknown>;
  delete metadata.reauthReason;
  delete metadata.reauthDetectedAt;
  delete metadata.reauthUpdatedAt;
  metadata.reauthRequired = false;
  return metadata;
};


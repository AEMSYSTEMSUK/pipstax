import { Request, Response, NextFunction } from 'express';
import { AppDataSource } from '../../../config/data-source';
import { Tenant } from '../../../entities/tenant.entity';
import { getTenantId } from '../../../utils/request';
import { BadRequestError, NotFoundError } from '../../../utils/errors';
import { DOCUMENT_SYNC_PROVIDERS } from '../../../constants/document-sync';
import { ACCOUNTING_PROVIDERS } from '../../../constants/accounting';
import { IntegrationProvider } from '../../../constants/integrations';
import { normalizeStoredFileReference, resolveStoredFileUrl } from '../../../services/storage/storage.service';
import {
  normalizeTenantFeatureFlags,
  sanitizeTenantFeatureFlagsInput,
} from '../../../services/tenant-features.service';
import {
  assertRemovedWorkflowStagesNotInUse,
  buildWorkflowStageUsageSummary,
  normalizeTenantWorkflowConfig,
  sanitizeTenantWorkflowConfigInput,
} from '../../../services/workflow-config.service';

export const getTenantProfile = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = getTenantId(req);
    const repo = AppDataSource.getRepository(Tenant);
    const tenant = await repo.findOne({ where: { id: tenantId, isDeleted: false } });
    if (!tenant) {
      throw new NotFoundError('Tenant not found');
    }
    if (!tenant.accountingProvider) {
      tenant.accountingProvider = IntegrationProvider.QUICKBOOKS;
      await repo.save(tenant);
    }
    const workflowConfig = normalizeTenantWorkflowConfig(tenant.workflowConfig);
    const payload = {
      ...tenant,
      featureFlags: normalizeTenantFeatureFlags(tenant.featureFlags),
      workflowConfig,
      workflowStageUsage: await buildWorkflowStageUsageSummary(tenantId, workflowConfig),
      logoUrl: resolveStoredFileUrl(tenant.logoUrl),
      emailHeaderLogoUrl: resolveStoredFileUrl(tenant.emailHeaderLogoUrl),
    };
    res.deliver(200, true, payload, 'Tenant profile');
  } catch (error) {
    next(error);
  }
};

export const updateTenantProfile = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = getTenantId(req);
    const repo = AppDataSource.getRepository(Tenant);
    const tenant = await repo.findOne({ where: { id: tenantId, isDeleted: false } });
    if (!tenant) {
      throw new NotFoundError('Tenant not found');
    }
    const allowedFields = [
      'name',
      'tradingName',
      'address',
      'contactEmail',
      'contactPhone',
      'vatNumber',
      'companyNumber',
      'defaultHourlyRate',
      'logoUrl',
      'emailHeaderLogoUrl',
      'primaryColor',
      'documentSyncProvider',
    ] as const;

    for (const field of allowedFields) {
      if (Object.prototype.hasOwnProperty.call(req.body, field)) {
        (tenant as any)[field] = req.body[field];
      }
    }

    tenant.logoUrl = normalizeStoredFileReference(tenant.logoUrl);
    tenant.emailHeaderLogoUrl = normalizeStoredFileReference(tenant.emailHeaderLogoUrl);
    if (Object.prototype.hasOwnProperty.call(req.body, 'defaultHourlyRate')) {
      const raw = req.body.defaultHourlyRate;
      if (raw === null || raw === '') {
        tenant.defaultHourlyRate = undefined;
      } else {
        const parsed = Number(raw);
        if (!Number.isFinite(parsed) || parsed < 0) {
          throw new BadRequestError('Invalid default hourly rate');
        }
        tenant.defaultHourlyRate = parsed;
      }
    }

    const hasAccountingProviderInPayload = Object.prototype.hasOwnProperty.call(
      req.body,
      'accountingProvider',
    );
    if (hasAccountingProviderInPayload) {
      const incomingAccountingProvider = req.body.accountingProvider;
      if (
        tenant.accountingProvider &&
        incomingAccountingProvider !== tenant.accountingProvider
      ) {
        throw new BadRequestError(
          'Accounting provider is locked after onboarding and cannot be changed',
        );
      }
      if (!tenant.accountingProvider) {
        if (!incomingAccountingProvider) {
          throw new BadRequestError('Invalid accounting provider');
        }
        if (!ACCOUNTING_PROVIDERS.includes(incomingAccountingProvider as any)) {
          throw new BadRequestError('Invalid accounting provider');
        }
        tenant.accountingProvider = incomingAccountingProvider;
      }
    }

    if (
      tenant.documentSyncProvider &&
      !DOCUMENT_SYNC_PROVIDERS.includes(tenant.documentSyncProvider as any)
    ) {
      throw new BadRequestError('Invalid document sync provider');
    }
    if (
      tenant.accountingProvider &&
      !ACCOUNTING_PROVIDERS.includes(tenant.accountingProvider as any)
    ) {
      throw new BadRequestError('Invalid accounting provider');
    }

    if (Object.prototype.hasOwnProperty.call(req.body, 'featureFlags')) {
      tenant.featureFlags = sanitizeTenantFeatureFlagsInput(req.body.featureFlags) ?? tenant.featureFlags;
    }
    if (Object.prototype.hasOwnProperty.call(req.body, 'workflowConfig')) {
      const nextWorkflowConfig =
        sanitizeTenantWorkflowConfigInput(req.body.workflowConfig) ?? tenant.workflowConfig;
      await assertRemovedWorkflowStagesNotInUse({
        tenantId,
        currentConfig: normalizeTenantWorkflowConfig(tenant.workflowConfig),
        nextConfig: normalizeTenantWorkflowConfig(nextWorkflowConfig),
      });
      tenant.workflowConfig = nextWorkflowConfig;
    }

    await repo.save(tenant);
    const normalizedWorkflowConfig = normalizeTenantWorkflowConfig(tenant.workflowConfig);
    const payload = {
      ...tenant,
      featureFlags: normalizeTenantFeatureFlags(tenant.featureFlags),
      workflowConfig: normalizedWorkflowConfig,
      workflowStageUsage: await buildWorkflowStageUsageSummary(tenantId, normalizedWorkflowConfig),
      logoUrl: resolveStoredFileUrl(tenant.logoUrl),
      emailHeaderLogoUrl: resolveStoredFileUrl(tenant.emailHeaderLogoUrl),
    };
    res.deliver(200, true, payload, 'Tenant updated');
  } catch (error) {
    next(error);
  }
};

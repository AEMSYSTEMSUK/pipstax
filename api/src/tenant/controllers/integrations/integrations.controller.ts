import { Request, Response, NextFunction } from 'express';
import { AppDataSource } from '../../../config/data-source';
import { IntegrationConnection } from '../../../entities/integration.entity';
import { Tenant } from '../../../entities/tenant.entity';
import { getTenantId } from '../../../utils/request';
import { IntegrationProvider, IntegrationStatus } from '../../../constants/integrations';
import { DOCUMENT_SYNC_PROVIDERS } from '../../../constants/document-sync';
import { ACCOUNTING_PROVIDERS } from '../../../constants/accounting';
import {
  buildIntegrationCallbackRedirect,
  createIntegrationOAuthStart,
  exchangeProviderCode,
  isAccountingProvider as isOAuthAccountingProvider,
  isDocumentProvider as isOAuthDocumentProvider,
  parseIntegrationOAuthState,
  provisionProviderRoot,
} from '../../../services/integrations/oauth.service';
import {
  createIntegrationRootFolder,
  getConnectedDocumentIntegration,
  getIntegrationStorageStats,
  listIntegrationRootFolders,
  pullProviderDocumentsToCRM,
  reconcileTenantDocuments,
} from '../../../services/integrations/document-shadowing.service';
import {
  enqueueTenantPull,
  enqueueTenantReconcile,
} from '../../queues/document-sync-queue.service';
import { BadRequestError, NotFoundError } from '../../../utils/errors';
import {
  disconnectAccountingProvider,
  ensureSingleAccountingProvider,
} from '../../../services/integrations/accounting-sync.service';
import { clearIntegrationReauthRequired } from '../../../services/integrations/reauth-state.service';

const providerDisplayName = (provider: IntegrationProvider) =>
  provider === IntegrationProvider.GOOGLE_DRIVE
    ? 'Google Drive'
    : provider === IntegrationProvider.SHAREPOINT
      ? 'SharePoint'
      : provider === IntegrationProvider.QUICKBOOKS
        ? 'QuickBooks'
        : 'Xero';

const ensureDocumentProvider = (provider: IntegrationProvider) => {
  if (
    provider !== IntegrationProvider.GOOGLE_DRIVE &&
    provider !== IntegrationProvider.SHAREPOINT
  ) {
    throw new BadRequestError('OAuth is supported only for Google Drive and SharePoint');
  }
  return provider as IntegrationProvider.GOOGLE_DRIVE | IntegrationProvider.SHAREPOINT;
};

const asObject = (value: unknown) =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? ({ ...(value as Record<string, unknown>) } as Record<string, unknown>)
    : {};

const connectDocumentWithAuthCode = async ({
  tenantId,
  provider,
  authCode,
}: {
  tenantId: string;
  provider: IntegrationProvider;
  authCode: string;
}) => {
  const integrationRepo = AppDataSource.getRepository(IntegrationConnection);
  const tenantRepo = AppDataSource.getRepository(Tenant);
  const safeProvider = ensureDocumentProvider(provider);

  const tenant = await tenantRepo.findOne({ where: { id: tenantId, isDeleted: false } });
  if (!tenant) {
    throw new NotFoundError('Tenant not found');
  }

  const token = await exchangeProviderCode(safeProvider, authCode);
  const folderName =
    (process.env.DOCUMENT_SYNC_ROOT_FOLDER_NAME ?? '').trim() || 'aem-storage';
  const root = await provisionProviderRoot(safeProvider, token.accessToken, folderName);

  let integration = await integrationRepo.findOne({
    where: { tenantId, provider, isDeleted: false },
  });
  if (!integration) {
    integration = integrationRepo.create({ tenantId, provider });
  }

  integration.accessToken = token.accessToken;
  integration.refreshToken = token.refreshToken ?? integration.refreshToken;
  integration.status = IntegrationStatus.CONNECTED;
  integration.connectedAt = new Date();
  integration.rootFolderId = root.rootFolderId;
  integration.metadata = {
    ...(integration.metadata ?? {}),
    oauth: {
      tokenType: token.tokenType,
      scope: token.scope,
      expiresAt: token.expiresIn
        ? new Date(Date.now() + token.expiresIn * 1000).toISOString()
        : null,
      connectedAt: new Date().toISOString(),
    },
    rootFolderName: root.rootFolderName,
    ...root.metadata,
  };
  integration.metadata = clearIntegrationReauthRequired(integration.metadata as Record<string, unknown>);

  await integrationRepo.save(integration);
  return integration;
};

const connectAccountingWithAuthCode = async ({
  tenantId,
  provider,
  authCode,
  realmId,
}: {
  tenantId: string;
  provider: IntegrationProvider.QUICKBOOKS | IntegrationProvider.XERO;
  authCode: string;
  realmId?: string;
}) => {
  const integrationRepo = AppDataSource.getRepository(IntegrationConnection);
  const token = await exchangeProviderCode(provider, authCode, { realmId });
  const integration = await ensureSingleAccountingProvider(tenantId, provider);

  integration.accessToken = token.accessToken;
  integration.refreshToken = token.refreshToken ?? integration.refreshToken;
  integration.status = IntegrationStatus.CONNECTED;
  integration.connectedAt = new Date();
  integration.metadata = {
    ...asObject(integration.metadata),
    mode: 'oauth',
    oauth: {
      tokenType: token.tokenType ?? 'Bearer',
      scope: token.scope ?? null,
      connectedAt: new Date().toISOString(),
      expiresAt: token.expiresIn
        ? new Date(Date.now() + token.expiresIn * 1000).toISOString()
        : null,
    },
    ...asObject(token.metadata),
  };
  integration.metadata = clearIntegrationReauthRequired(integration.metadata as Record<string, unknown>);
  await integrationRepo.save(integration);
  return integration;
};

export const listIntegrationAlerts = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = getTenantId(req);
    const repo = AppDataSource.getRepository(IntegrationConnection);
    const integrations = await repo.find({ where: { tenantId, isDeleted: false } });
    const alerts: Array<{
      provider: IntegrationProvider;
      status: IntegrationStatus;
      reason: string;
      detectedAt?: string;
    }> = [];
    const seen = new Set<IntegrationProvider>();
    const addAlert = (alert: {
      provider: IntegrationProvider;
      status: IntegrationStatus;
      reason: string;
      detectedAt?: string;
    }) => {
      if (seen.has(alert.provider)) return;
      seen.add(alert.provider);
      alerts.push(alert);
    };

    for (const integration of integrations) {
      const metadata = asObject(integration.metadata);
      if (metadata.reauthRequired === true) {
        addAlert({
          provider: integration.provider,
          status: integration.status,
          reason:
            typeof metadata.reauthReason === 'string'
              ? metadata.reauthReason
              : 'Connection expired or revoked. Reconnect required.',
          detectedAt:
            typeof metadata.reauthDetectedAt === 'string'
              ? metadata.reauthDetectedAt
              : undefined,
        });
      }
    }

    return res.deliver(200, true, alerts, 'Integration alerts fetched');
  } catch (error) {
    next(error);
  }
};

export const listIntegrations = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = getTenantId(req);
    const repo = AppDataSource.getRepository(IntegrationConnection);
    const tenantRepo = AppDataSource.getRepository(Tenant);
    const integrations = await repo.find({ where: { tenantId, isDeleted: false } });
    const tenant = await tenantRepo.findOne({
      where: { id: tenantId, isDeleted: false },
      select: ['id', 'documentSyncProvider', 'accountingProvider'],
    });
    const preferredProvider = tenant?.documentSyncProvider;
    const preferredAccountingProvider = tenant?.accountingProvider;
    const enriched = integrations
      .map((integration) => ({
        ...integration,
        isPreferred: Boolean(preferredProvider && integration.provider === preferredProvider),
      }))
    const hasPreferredRow =
      Boolean(preferredProvider) &&
      enriched.some((integration) => integration.provider === preferredProvider)
    if (
      preferredProvider &&
      DOCUMENT_SYNC_PROVIDERS.includes(preferredProvider as any) &&
      !hasPreferredRow
    ) {
      enriched.push({
        id: `virtual-${tenantId}-${preferredProvider}`,
        provider: preferredProvider,
        status: IntegrationStatus.DISCONNECTED,
        tenantId,
        isPreferred: true,
        metadata: {
          rootFolderName: (process.env.DOCUMENT_SYNC_ROOT_FOLDER_NAME ?? '').trim() || 'aem-storage',
        },
      } as any)
    }
    const hasPreferredAccountingRow =
      Boolean(preferredAccountingProvider) &&
      enriched.some((integration) => integration.provider === preferredAccountingProvider);
    if (
      preferredAccountingProvider &&
      ACCOUNTING_PROVIDERS.includes(preferredAccountingProvider as any) &&
      !hasPreferredAccountingRow
    ) {
      enriched.push({
        id: `virtual-${tenantId}-${preferredAccountingProvider}`,
        provider: preferredAccountingProvider,
        status: IntegrationStatus.DISCONNECTED,
        tenantId,
        isPreferred: true,
        metadata: {},
      } as any);
    }
    const sorted = enriched
      .sort((a, b) => {
        const aPreferred = a.isPreferred ? 1 : 0;
        const bPreferred = b.isPreferred ? 1 : 0;
        if (aPreferred !== bPreferred) return bPreferred - aPreferred;
        const aConnected = a.status === IntegrationStatus.CONNECTED ? 1 : 0;
        const bConnected = b.status === IntegrationStatus.CONNECTED ? 1 : 0;
        return bConnected - aConnected;
      });
    res.deliver(200, true, sorted, 'Integrations fetched');
  } catch (error) {
    next(error);
  }
};

export const listIntegrationFolders = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = getTenantId(req);
    const provider = req.params.provider as IntegrationProvider;
    const integration = await getConnectedDocumentIntegration(tenantId, provider);
    if (!integration || integration.status !== IntegrationStatus.CONNECTED) {
      return res.deliver(200, true, [], 'Integration not connected');
    }
    const folders = await listIntegrationRootFolders({ tenantId, provider });
    return res.deliver(200, true, folders, 'Integration folders fetched');
  } catch (error) {
    next(error);
  }
};

export const createIntegrationFolder = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = getTenantId(req);
    const provider = req.params.provider as IntegrationProvider;
    const folderName = String(req.body?.name ?? '').trim();
    const integration = await getConnectedDocumentIntegration(tenantId, provider);
    if (!integration || integration.status !== IntegrationStatus.CONNECTED) {
      return res.deliver(200, true, null, 'Integration not connected');
    }
    const folder = await createIntegrationRootFolder({ tenantId, provider, folderName });
    return res.deliver(201, true, folder, folder.existing ? 'Folder already exists' : 'Folder created');
  } catch (error) {
    next(error);
  }
};

export const getStorageStats = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = getTenantId(req);
    const provider = req.params.provider as IntegrationProvider;
    const integration = await getConnectedDocumentIntegration(tenantId, provider);
    if (!integration || integration.status !== IntegrationStatus.CONNECTED) {
      return res.deliver(200, true, null, 'Integration not connected');
    }
    const stats = await getIntegrationStorageStats({ tenantId, provider });
    return res.deliver(200, true, stats, 'Storage stats fetched');
  } catch (error) {
    next(error);
  }
};

export const connectIntegration = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = getTenantId(req);
    const { provider, authCode } = req.body as {
      provider: IntegrationProvider;
      authCode?: string;
    };

    if (!authCode) {
      if (ACCOUNTING_PROVIDERS.includes(provider as any)) {
        throw new BadRequestError(
          'Missing authCode. Start OAuth from /integrations/accounting/:provider/oauth/start',
        );
      }
      throw new BadRequestError('Missing authCode. Start OAuth from /integrations/:provider/oauth/start');
    }

    if (ACCOUNTING_PROVIDERS.includes(provider as any)) {
      const integration = await connectAccountingWithAuthCode({
        tenantId,
        provider: provider as IntegrationProvider.QUICKBOOKS | IntegrationProvider.XERO,
        authCode,
      });
      return res.deliver(200, true, integration, 'Accounting integration connected');
    }

    const integration = await connectDocumentWithAuthCode({
      tenantId,
      provider,
      authCode,
    });
    const reconcileQueued = await enqueueTenantReconcile({ tenantId, provider });
    if (!reconcileQueued) {
      try {
        await reconcileTenantDocuments({ tenantId, provider });
      } catch {
        // Keep integration connection successful if initial reconciliation fails.
      }
    }

    res.deliver(200, true, integration, 'Integration connected');
  } catch (error) {
    next(error);
  }
};

export const startIntegrationOAuth = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = getTenantId(req);
    const provider = req.params.provider as IntegrationProvider;
    if (!isOAuthDocumentProvider(provider)) {
      throw new BadRequestError('OAuth start on this endpoint supports Google Drive/SharePoint only');
    }
    const returnUrl =
      typeof req.query.returnUrl === 'string' ? req.query.returnUrl : undefined;

    const { authUrl } = await createIntegrationOAuthStart({
      tenantId,
      provider,
      returnUrl,
    });
    res.deliver(200, true, { authUrl }, 'OAuth URL generated');
  } catch (error) {
    next(error);
  }
};

export const startAccountingIntegrationOAuth = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const tenantId = getTenantId(req);
    const provider = req.params.provider as IntegrationProvider;
    if (!isOAuthAccountingProvider(provider)) {
      throw new BadRequestError('Unsupported accounting integration provider');
    }
    const returnUrl =
      typeof req.query.returnUrl === 'string' ? req.query.returnUrl : undefined;

    const { authUrl } = await createIntegrationOAuthStart({
      tenantId,
      provider,
      returnUrl,
    });
    res.deliver(200, true, { authUrl }, 'OAuth URL generated');
  } catch (error) {
    next(error);
  }
};

export const handleIntegrationOAuthCallback = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const state = String(req.query.state ?? '');
    const code = typeof req.query.code === 'string' ? req.query.code : '';
    const realmId = typeof req.query.realmId === 'string' ? req.query.realmId : undefined;
    const providerError =
      typeof req.query.error_description === 'string'
        ? req.query.error_description
        : typeof req.query.error === 'string'
          ? req.query.error
          : '';

    const parsedState = parseIntegrationOAuthState(state);
    const { tenantId, provider, returnUrl } = parsedState;

    if (providerError) {
      const redirectUrl = buildIntegrationCallbackRedirect({
        returnUrl,
        provider,
        status: 'error',
        message: providerError,
      });
      return res.redirect(302, redirectUrl);
    }

    if (!code) {
      const redirectUrl = buildIntegrationCallbackRedirect({
        returnUrl,
        provider,
        status: 'error',
        message: 'Missing OAuth code',
      });
      return res.redirect(302, redirectUrl);
    }

    if (isOAuthAccountingProvider(provider)) {
      await connectAccountingWithAuthCode({
        tenantId,
        provider,
        authCode: code,
        realmId,
      });
    } else {
      await connectDocumentWithAuthCode({ tenantId, provider, authCode: code });
      const queued = await enqueueTenantReconcile({ tenantId, provider });
      if (!queued) {
        try {
          await reconcileTenantDocuments({ tenantId, provider });
        } catch {
          // Do not break OAuth redirect flow if initial reconciliation fails.
        }
      }
    }
    const redirectUrl = buildIntegrationCallbackRedirect({
      returnUrl,
      provider,
      status: 'connected',
      message: `${providerDisplayName(provider)} connected successfully`,
    });
    return res.redirect(302, redirectUrl);
  } catch (error: any) {
    try {
      const state = String(req.query.state ?? '');
      const parsedState = parseIntegrationOAuthState(state);
      const redirectUrl = buildIntegrationCallbackRedirect({
        returnUrl: parsedState.returnUrl,
        provider: parsedState.provider,
        status: 'error',
        message: error?.message ?? 'OAuth callback failed',
      });
      return res.redirect(302, redirectUrl);
    } catch {
      next(error);
    }
  }
};

export const disconnectIntegration = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = getTenantId(req);
    const provider = req.params.provider as IntegrationProvider;
    if (ACCOUNTING_PROVIDERS.includes(provider as any)) {
      const integration = await disconnectAccountingProvider(
        tenantId,
        provider as IntegrationProvider.QUICKBOOKS | IntegrationProvider.XERO,
      );
      return res.deliver(200, true, integration, 'Accounting integration disconnected');
    }
    const repo = AppDataSource.getRepository(IntegrationConnection);
    const integration = await repo.findOne({ where: { tenantId, provider, isDeleted: false } });
    if (!integration) {
      return res.deliver(200, true, null, 'Integration already disconnected');
    }
    integration.status = IntegrationStatus.DISCONNECTED;
    integration.metadata = clearIntegrationReauthRequired(
      asObject(integration.metadata),
    );
    await repo.save(integration);
    res.deliver(200, true, integration, 'Integration disconnected');
  } catch (error) {
    next(error);
  }
};

export const listIntegrationFiles = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = getTenantId(req);
    const provider = req.params.provider as IntegrationProvider;
    const integration = await getConnectedDocumentIntegration(tenantId, provider);
    if (!integration || integration.status !== IntegrationStatus.CONNECTED) {
      return res.deliver(200, true, [], 'Integration not connected');
    }
    let pull:
      | {
          imported: number;
          updated: number;
          files: Array<{
            id: string;
            name: string;
            mimeType?: string;
          webUrl?: string;
          modifiedAt?: string;
          sizeBytes?: number;
        }>;
      }
      | null = null;
    const pullQueued = await enqueueTenantPull({ tenantId, provider });
    if (!pullQueued) {
      pull = await pullProviderDocumentsToCRM({ tenantId, provider });
    }
    if (!pull) {
      pull = await pullProviderDocumentsToCRM({ tenantId, provider });
    }
    const files = pull.files.map((file) => ({
      id: file.id,
      name: file.name,
      mimeType: file.mimeType,
      webUrl: file.webUrl,
      modifiedAt: file.modifiedAt,
      sizeBytes: file.sizeBytes,
      status: 'Synced',
    }));
    res.deliver(
      200,
      true,
      {
        imported: pull.imported,
        updated: pull.updated,
        files,
      },
      'Integration files',
    );
  } catch (error) {
    next(error);
  }
};

export const reconcileIntegrationFiles = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const tenantId = getTenantId(req);
    const provider = req.params.provider as IntegrationProvider;
    const integration = await getConnectedDocumentIntegration(tenantId, provider);
    if (!integration || integration.status !== IntegrationStatus.CONNECTED) {
      return res.deliver(200, true, null, 'Integration not connected');
    }

    const queued = await enqueueTenantReconcile({ tenantId, provider });
    if (queued) {
      return res.deliver(
        202,
        true,
        { queued: true },
        'Reconciliation job queued',
      );
    }

    const result = await reconcileTenantDocuments({ tenantId, provider });
    return res.deliver(200, true, result, 'Reconciliation completed');
  } catch (error) {
    next(error);
  }
};

export const forceSyncIntegrationNow = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const tenantId = getTenantId(req);
    const provider = req.params.provider as IntegrationProvider;
    const integration = await getConnectedDocumentIntegration(tenantId, provider);
    if (!integration || integration.status !== IntegrationStatus.CONNECTED) {
      return res.deliver(200, true, null, 'Integration not connected');
    }

    const pull = await pullProviderDocumentsToCRM({ tenantId, provider });
    const reconcile = await reconcileTenantDocuments({ tenantId, provider });

    return res.deliver(
      200,
      true,
      {
        pull: {
          imported: pull.imported,
          updated: pull.updated,
          files: pull.files.length,
        },
        reconcile,
      },
      'Force sync completed',
    );
  } catch (error) {
    next(error);
  }
};

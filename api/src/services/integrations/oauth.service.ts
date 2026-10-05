import jwt from 'jsonwebtoken';
import { env } from '../../config/env';
import { IntegrationProvider } from '../../constants/integrations';
import { BadRequestError, UnauthorizedError } from '../../utils/errors';
import { resolveTenantAppUrl } from '../../utils/tenant-url';

type DocumentProvider =
  | IntegrationProvider.GOOGLE_DRIVE
  | IntegrationProvider.SHAREPOINT;
type AccountingProvider =
  | IntegrationProvider.QUICKBOOKS
  | IntegrationProvider.XERO;
type SupportedProvider = DocumentProvider | AccountingProvider;

type OAuthStatePayload = {
  tenantId: string;
  provider: SupportedProvider;
  returnUrl: string;
  nonce: string;
};

type TokenExchangeResult = {
  accessToken: string;
  refreshToken?: string;
  tokenType?: string;
  expiresIn?: number;
  scope?: string;
  metadata?: Record<string, unknown>;
};

type ProvisionedRoot = {
  rootFolderId: string;
  rootFolderName: string;
  metadata?: Record<string, unknown>;
};

const SUPPORTED_PROVIDERS: SupportedProvider[] = [
  IntegrationProvider.GOOGLE_DRIVE,
  IntegrationProvider.SHAREPOINT,
  IntegrationProvider.QUICKBOOKS,
  IntegrationProvider.XERO,
];

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_DRIVE_API = 'https://www.googleapis.com/drive/v3';
const MICROSOFT_LOGIN_BASE = 'https://login.microsoftonline.com';
const GRAPH_API_BASE = 'https://graph.microsoft.com/v1.0';
const QUICKBOOKS_AUTH_URL = 'https://appcenter.intuit.com/connect/oauth2';
const QUICKBOOKS_TOKEN_URL = 'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer';
const XERO_AUTH_URL = 'https://login.xero.com/identity/connect/authorize';
const XERO_TOKEN_URL = 'https://identity.xero.com/connect/token';
const XERO_CONNECTIONS_URL = 'https://api.xero.com/connections';

const escapeOdataString = (value: string) => value.replace(/'/g, "''");

const isSupportedProvider = (provider: string): provider is SupportedProvider =>
  SUPPORTED_PROVIDERS.includes(provider as SupportedProvider);

const ensureProvider = (provider: string): SupportedProvider => {
  if (!isSupportedProvider(provider)) {
    throw new BadRequestError('Unsupported integration provider');
  }
  return provider;
};

export const isDocumentProvider = (provider: IntegrationProvider): provider is DocumentProvider =>
  provider === IntegrationProvider.GOOGLE_DRIVE ||
  provider === IntegrationProvider.SHAREPOINT;

export const isAccountingProvider = (provider: IntegrationProvider): provider is AccountingProvider =>
  provider === IntegrationProvider.QUICKBOOKS ||
  provider === IntegrationProvider.XERO;

const randomNonce = () => Math.random().toString(36).slice(2, 12);

const sanitizeReturnUrl = async (tenantId: string, returnUrl?: string) => {
  const fallback = await resolveTenantAppUrl(tenantId, '/admin/settings?tab=integrations');
  if (!returnUrl) return fallback;
  try {
    const parsed = new URL(returnUrl);
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      throw new Error('Invalid protocol');
    }
    if (parsed.origin !== new URL(fallback).origin) {
      return fallback;
    }
    return parsed.toString();
  } catch {
    return fallback;
  }
};

const buildReturnUrl = (
  returnUrl: string,
  status: 'connected' | 'error',
  provider: SupportedProvider,
  message: string,
) => {
  const url = new URL(returnUrl);
  url.searchParams.set('tab', 'integrations');
  url.searchParams.set('integrationStatus', status);
  url.searchParams.set('integrationProvider', provider);
  url.searchParams.set('integrationMessage', message);
  return url.toString();
};

const ensureGoogleCredentials = () => {
  const clientId = process.env.GOOGLE_DRIVE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_DRIVE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new BadRequestError('Google Drive OAuth is not configured');
  }
  return { clientId, clientSecret };
};

const ensureMicrosoftCredentials = () => {
  const clientId = process.env.SHAREPOINT_CLIENT_ID;
  const clientSecret = process.env.SHAREPOINT_CLIENT_SECRET;
  const tenantId = process.env.SHAREPOINT_TENANT_ID ?? 'common';
  if (!clientId || !clientSecret) {
    throw new BadRequestError('SharePoint OAuth is not configured');
  }
  return { clientId, clientSecret, tenantId };
};

const ensureQuickBooksCredentials = () => {
  const clientId = process.env.QUICKBOOKS_CLIENT_ID;
  const clientSecret = process.env.QUICKBOOKS_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new BadRequestError('QuickBooks OAuth is not configured');
  }
  return { clientId, clientSecret };
};

const ensureXeroCredentials = () => {
  const clientId = process.env.XERO_CLIENT_ID;
  const clientSecret = process.env.XERO_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new BadRequestError('Xero OAuth is not configured');
  }
  return { clientId, clientSecret };
};

const parseResponse = async (response: Response) => {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { message: text };
  }
};

const httpPostForm = async (url: string, body: Record<string, string>) => {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(body).toString(),
  });
  const payload = await parseResponse(response);
  if (!response.ok) {
    const detail =
      payload?.error_description ||
      payload?.error?.message ||
      payload?.message ||
      'OAuth request failed';
    throw new BadRequestError(String(detail));
  }
  return payload as any;
};

const httpGetJson = async (url: string, token: string) => {
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const payload = await parseResponse(response);
  if (!response.ok) {
    const detail = payload?.error?.message || payload?.message || 'Provider request failed';
    throw new BadRequestError(String(detail));
  }
  return payload as any;
};

const httpGetJsonWithHeaders = async (
  url: string,
  token: string,
  headers?: Record<string, string>,
) => {
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      ...(headers ?? {}),
    },
  });
  const payload = await parseResponse(response);
  if (!response.ok) {
    const detail = payload?.error?.message || payload?.message || 'Provider request failed';
    throw new BadRequestError(String(detail));
  }
  return payload as any;
};

const httpPostJson = async (url: string, token: string, body: unknown) => {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const payload = await parseResponse(response);
  if (!response.ok) {
    const detail = payload?.error?.message || payload?.message || 'Provider request failed';
    throw new BadRequestError(String(detail));
  }
  return payload as any;
};

const createGoogleAuthUrl = (state: string) => {
  const { clientId } = ensureGoogleCredentials();
  const url = new URL(GOOGLE_AUTH_URL);
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('redirect_uri', env.integrationOAuth.callbackUrl);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', env.integrationOAuth.googleScopes);
  url.searchParams.set('access_type', 'offline');
  url.searchParams.set('prompt', 'consent');
  url.searchParams.set('state', state);
  return url.toString();
};

const createSharePointAuthUrl = (state: string) => {
  const { clientId, tenantId } = ensureMicrosoftCredentials();
  const url = new URL(
    `${MICROSOFT_LOGIN_BASE}/${encodeURIComponent(tenantId)}/oauth2/v2.0/authorize`,
  );
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('redirect_uri', env.integrationOAuth.callbackUrl);
  url.searchParams.set('response_mode', 'query');
  url.searchParams.set('scope', env.integrationOAuth.sharepointScopes);
  url.searchParams.set('state', state);
  return url.toString();
};

const createQuickBooksAuthUrl = (state: string) => {
  const { clientId } = ensureQuickBooksCredentials();
  const url = new URL(QUICKBOOKS_AUTH_URL);
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('redirect_uri', env.accountingOAuth.callbackUrl);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', env.accountingOAuth.quickbooksScopes);
  url.searchParams.set('state', state);
  return url.toString();
};

const createXeroAuthUrl = (state: string) => {
  const { clientId } = ensureXeroCredentials();
  const url = new URL(XERO_AUTH_URL);
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('redirect_uri', env.accountingOAuth.callbackUrl);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', env.accountingOAuth.xeroScopes);
  url.searchParams.set('state', state);
  return url.toString();
};

const exchangeGoogleCode = async (code: string): Promise<TokenExchangeResult> => {
  const { clientId, clientSecret } = ensureGoogleCredentials();
  const payload = await httpPostForm(GOOGLE_TOKEN_URL, {
    grant_type: 'authorization_code',
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: env.integrationOAuth.callbackUrl,
  });
  return {
    accessToken: payload.access_token,
    refreshToken: payload.refresh_token,
    tokenType: payload.token_type,
    expiresIn: payload.expires_in,
    scope: payload.scope,
  };
};

const exchangeSharePointCode = async (code: string): Promise<TokenExchangeResult> => {
  const { clientId, clientSecret, tenantId } = ensureMicrosoftCredentials();
  const payload = await httpPostForm(
    `${MICROSOFT_LOGIN_BASE}/${encodeURIComponent(tenantId)}/oauth2/v2.0/token`,
    {
      grant_type: 'authorization_code',
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: env.integrationOAuth.callbackUrl,
      scope: env.integrationOAuth.sharepointScopes,
    },
  );
  return {
    accessToken: payload.access_token,
    refreshToken: payload.refresh_token,
    tokenType: payload.token_type,
    expiresIn: payload.expires_in,
    scope: payload.scope,
  };
};

const toBasicAuth = (clientId: string, clientSecret: string) =>
  Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

const exchangeQuickBooksCode = async (
  code: string,
  options?: { realmId?: string },
): Promise<TokenExchangeResult> => {
  const { clientId, clientSecret } = ensureQuickBooksCredentials();
  const response = await fetch(QUICKBOOKS_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${toBasicAuth(clientId, clientSecret)}`,
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: env.accountingOAuth.callbackUrl,
    }).toString(),
  });
  const payload = (await parseResponse(response)) as Record<string, any>;
  if (!response.ok || !payload.access_token) {
    const detail = payload?.error_description || payload?.error || 'QuickBooks OAuth exchange failed';
    throw new BadRequestError(String(detail));
  }
  const realmId =
    (typeof options?.realmId === 'string' && options.realmId.trim()) ||
    (typeof payload.realmId === 'string' && payload.realmId.trim()) ||
    null;
  return {
    accessToken: payload.access_token,
    refreshToken: payload.refresh_token,
    tokenType: payload.token_type,
    expiresIn: payload.expires_in,
    scope: payload.scope,
    metadata: {
      ...(realmId ? { realmId } : {}),
    },
  };
};

const exchangeXeroCode = async (code: string): Promise<TokenExchangeResult> => {
  const { clientId, clientSecret } = ensureXeroCredentials();
  const response = await fetch(XERO_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${toBasicAuth(clientId, clientSecret)}`,
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: env.accountingOAuth.callbackUrl,
    }).toString(),
  });
  const payload = (await parseResponse(response)) as Record<string, any>;
  if (!response.ok || !payload.access_token) {
    const detail = payload?.error_description || payload?.error || 'Xero OAuth exchange failed';
    throw new BadRequestError(String(detail));
  }

  const connections = (await httpGetJsonWithHeaders(XERO_CONNECTIONS_URL, String(payload.access_token))) as any[];
  const first = Array.isArray(connections) ? connections[0] : null;
  const xeroTenantId = first?.tenantId ? String(first.tenantId) : undefined;

  return {
    accessToken: payload.access_token,
    refreshToken: payload.refresh_token,
    tokenType: payload.token_type,
    expiresIn: payload.expires_in,
    scope: payload.scope,
    metadata: {
      ...(xeroTenantId ? { xeroTenantId } : {}),
      ...(first?.tenantName ? { xeroTenantName: String(first.tenantName) } : {}),
      ...(first?.tenantType ? { xeroTenantType: String(first.tenantType) } : {}),
    },
  };
};

const ensureGoogleRootFolder = async (
  accessToken: string,
  folderName: string,
): Promise<ProvisionedRoot> => {
  const q = `mimeType='application/vnd.google-apps.folder' and name='${escapeOdataString(
    folderName,
  )}' and trashed=false`;
  const existing = await httpGetJson(
    `${GOOGLE_DRIVE_API}/files?${new URLSearchParams({
      q,
      spaces: 'drive',
      fields: 'files(id,name)',
      pageSize: '1',
    }).toString()}`,
    accessToken,
  );
  const current = existing?.files?.[0];
  if (current?.id) {
    return {
      rootFolderId: current.id,
      rootFolderName: current.name ?? folderName,
      metadata: { provider: IntegrationProvider.GOOGLE_DRIVE },
    };
  }

  const created = await httpPostJson(`${GOOGLE_DRIVE_API}/files`, accessToken, {
    name: folderName,
    mimeType: 'application/vnd.google-apps.folder',
  });
  return {
    rootFolderId: created.id,
    rootFolderName: created.name ?? folderName,
    metadata: { provider: IntegrationProvider.GOOGLE_DRIVE },
  };
};

const ensureSharePointRootFolder = async (
  accessToken: string,
  folderName: string,
): Promise<ProvisionedRoot> => {
  const existing = await httpGetJson(
    `${GRAPH_API_BASE}/me/drive/root/children?$top=200&$select=id,name,folder`,
    accessToken,
  );
  const current = Array.isArray(existing?.value)
    ? existing.value.find((item: any) => item?.folder && item?.name === folderName)
    : null;
  if (current?.id) {
    return {
      rootFolderId: current.id,
      rootFolderName: current.name ?? folderName,
      metadata: { provider: IntegrationProvider.SHAREPOINT },
    };
  }

  const created = await httpPostJson(`${GRAPH_API_BASE}/me/drive/root/children`, accessToken, {
    name: folderName,
    folder: {},
    '@microsoft.graph.conflictBehavior': 'rename',
  });
  return {
    rootFolderId: created.id,
    rootFolderName: created.name ?? folderName,
    metadata: { provider: IntegrationProvider.SHAREPOINT },
  };
};

export const createIntegrationOAuthStart = async ({
  tenantId,
  provider,
  returnUrl,
}: {
  tenantId: string;
  provider: string;
  returnUrl?: string;
}) => {
  const safeProvider = ensureProvider(provider);
  const safeReturnUrl = await sanitizeReturnUrl(tenantId, returnUrl);
  const stateToken = jwt.sign(
    {
      tenantId,
      provider: safeProvider,
      returnUrl: safeReturnUrl,
      nonce: randomNonce(),
    } as OAuthStatePayload,
    env.jwt.secret,
    { expiresIn: '10m' },
  );

  const authUrl =
    safeProvider === IntegrationProvider.GOOGLE_DRIVE
      ? createGoogleAuthUrl(stateToken)
      : safeProvider === IntegrationProvider.SHAREPOINT
        ? createSharePointAuthUrl(stateToken)
        : safeProvider === IntegrationProvider.QUICKBOOKS
          ? createQuickBooksAuthUrl(stateToken)
          : createXeroAuthUrl(stateToken);

  return { authUrl };
};

export const parseIntegrationOAuthState = (stateToken: string) => {
  try {
    const payload = jwt.verify(stateToken, env.jwt.secret) as OAuthStatePayload;
    if (!payload?.tenantId || !payload?.provider || !payload?.returnUrl) {
      throw new Error('Invalid state payload');
    }
    const provider = ensureProvider(payload.provider);
    return { ...payload, provider };
  } catch {
    throw new UnauthorizedError('Invalid OAuth state');
  }
};

export const exchangeProviderCode = async (
  provider: SupportedProvider,
  code: string,
  options?: { realmId?: string },
): Promise<TokenExchangeResult> => {
  if (!code) throw new BadRequestError('Missing OAuth code');
  if (provider === IntegrationProvider.GOOGLE_DRIVE) {
    return exchangeGoogleCode(code);
  }
  if (provider === IntegrationProvider.SHAREPOINT) {
    return exchangeSharePointCode(code);
  }
  if (provider === IntegrationProvider.QUICKBOOKS) {
    return exchangeQuickBooksCode(code, options);
  }
  return exchangeXeroCode(code);
};

export const provisionProviderRoot = async (
  provider: DocumentProvider,
  accessToken: string,
  folderName: string,
) => {
  if (!accessToken) {
    throw new BadRequestError('Missing provider access token');
  }
  if (provider === IntegrationProvider.GOOGLE_DRIVE) {
    return ensureGoogleRootFolder(accessToken, folderName);
  }
  return ensureSharePointRootFolder(accessToken, folderName);
};

export const buildIntegrationCallbackRedirect = ({
  returnUrl,
  provider,
  status,
  message,
}: {
  returnUrl: string;
  provider: SupportedProvider;
  status: 'connected' | 'error';
  message: string;
}) => buildReturnUrl(returnUrl, status, provider, message);

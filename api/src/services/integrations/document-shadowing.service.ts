import fs from 'fs/promises';
import path from 'path';
import { AppDataSource } from '../../config/data-source';
import { env } from '../../config/env';
import { IntegrationProvider, IntegrationStatus, SyncStatus } from '../../constants/integrations';
import { DocumentStatus } from '../../constants/status';
import { DOCUMENT_SYNC_PROVIDERS } from '../../constants/document-sync';
import { DocumentItem } from '../../entities/document.entity';
import { IntegrationConnection } from '../../entities/integration.entity';
import { Tenant } from '../../entities/tenant.entity';
import { BadRequestError } from '../../utils/errors';
import { provisionProviderRoot } from './oauth.service';
import { normalizeStoredFileReference } from '../storage/storage.service';
import {
  getIntegrationErrorMessage,
  isReauthRequiredError,
  markIntegrationReauthRequired,
} from './reauth-state.service';

type DocumentProvider = (typeof DOCUMENT_SYNC_PROVIDERS)[number];

type RemoteFile = {
  id: string;
  name: string;
  mimeType?: string;
  webUrl?: string;
  modifiedAt?: string;
  folderPath?: string;
  sizeBytes?: number;
};

const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_DRIVE_FILES_URL = 'https://www.googleapis.com/drive/v3/files';
const GOOGLE_DRIVE_ABOUT_URL = 'https://www.googleapis.com/drive/v3/about?fields=storageQuota';
const GOOGLE_DRIVE_UPLOAD_URL = 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart';
const MICROSOFT_LOGIN_BASE = 'https://login.microsoftonline.com';
const GRAPH_BASE = 'https://graph.microsoft.com/v1.0';

const ensureDocumentProvider = (provider: IntegrationProvider): DocumentProvider => {
  if (!DOCUMENT_SYNC_PROVIDERS.includes(provider as DocumentProvider)) {
    throw new BadRequestError('Invalid document provider');
  }
  return provider as DocumentProvider;
};

const parseApiOrigin = () => {
  try {
    return new URL(env.apiUrl).origin;
  } catch {
    return `http://localhost:${env.port}`;
  }
};

const getDefaultRootFolderName = () =>
  (process.env.DOCUMENT_SYNC_ROOT_FOLDER_NAME ?? '').trim() || 'aem-storage';

const readLocalOrRemoteFile = async (fileUrl: string) => {
  const apiOrigin = parseApiOrigin();
  const normalized = fileUrl.trim();
  if (!normalized) {
    throw new BadRequestError('Missing file URL');
  }

  if (
    !/^https?:\/\//i.test(normalized) &&
    !normalized.startsWith('/') &&
    !normalized.startsWith('data:')
  ) {
    const localPath = path.join(process.cwd(), 'public', 'uploads', normalized);
    const buffer = await fs.readFile(localPath);
    return { buffer, mimeType: 'application/octet-stream' };
  }

  if (normalized.startsWith('uploads/')) {
    const relativePath = normalized.replace(/^uploads\//, '');
    const localPath = path.join(process.cwd(), 'public', 'uploads', relativePath);
    const buffer = await fs.readFile(localPath);
    return { buffer, mimeType: 'application/octet-stream' };
  }

  const uploadsPrefix = `${apiOrigin}/uploads/`;
  if (normalized.startsWith(uploadsPrefix)) {
    const relativePath = normalized.slice(uploadsPrefix.length);
    const localPath = path.join(process.cwd(), 'public', 'uploads', relativePath);
    const buffer = await fs.readFile(localPath);
    return { buffer, mimeType: 'application/octet-stream' };
  }

  if (normalized.startsWith('/uploads/')) {
    const relativePath = normalized.replace(/^\/uploads\//, '');
    const localPath = path.join(process.cwd(), 'public', 'uploads', relativePath);
    const buffer = await fs.readFile(localPath);
    return { buffer, mimeType: 'application/octet-stream' };
  }

  const response = await fetch(normalized);
  if (!response.ok) {
    throw new BadRequestError(`Unable to read file for sync (${response.status})`);
  }
  const arrayBuffer = await response.arrayBuffer();
  const mimeType = response.headers.get('content-type') ?? 'application/octet-stream';
  return { buffer: Buffer.from(arrayBuffer), mimeType };
};

const getOAuthExpiry = (integration: IntegrationConnection): Date | null => {
  const metadata = integration.metadata as Record<string, unknown> | null | undefined;
  const oauth = metadata?.oauth as Record<string, unknown> | undefined;
  const expiresAtRaw = oauth?.expiresAt;
  if (typeof expiresAtRaw !== 'string') return null;
  const date = new Date(expiresAtRaw);
  return Number.isNaN(date.getTime()) ? null : date;
};

const writeOAuthMetadata = (
  integration: IntegrationConnection,
  params: {
    accessToken: string;
    refreshToken?: string;
    expiresIn?: number;
    tokenType?: string;
    scope?: string;
  },
) => {
  const metadata = (integration.metadata as Record<string, unknown> | null) ?? {};
  const oauth = (metadata.oauth as Record<string, unknown> | undefined) ?? {};
  oauth.tokenType = params.tokenType ?? oauth.tokenType ?? 'Bearer';
  oauth.scope = params.scope ?? oauth.scope ?? null;
  oauth.connectedAt = oauth.connectedAt ?? new Date().toISOString();
  oauth.expiresAt = params.expiresIn
    ? new Date(Date.now() + params.expiresIn * 1000).toISOString()
    : oauth.expiresAt ?? null;
  metadata.oauth = oauth;
  integration.metadata = metadata;
  integration.accessToken = params.accessToken;
  if (params.refreshToken) {
    integration.refreshToken = params.refreshToken;
  }
};

const refreshGoogleToken = async (integration: IntegrationConnection) => {
  const clientId = process.env.GOOGLE_DRIVE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_DRIVE_CLIENT_SECRET;
  if (!clientId || !clientSecret || !integration.refreshToken) {
    throw new BadRequestError('Google token refresh is not available');
  }
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'refresh_token',
      refresh_token: integration.refreshToken,
    }).toString(),
  });
  const payload = (await response.json()) as Record<string, any>;
  if (!response.ok || !payload.access_token) {
    throw new BadRequestError(payload.error_description ?? payload.error ?? 'Google token refresh failed');
  }
  writeOAuthMetadata(integration, {
    accessToken: String(payload.access_token),
    refreshToken: integration.refreshToken,
    expiresIn: typeof payload.expires_in === 'number' ? payload.expires_in : undefined,
    tokenType: typeof payload.token_type === 'string' ? payload.token_type : undefined,
    scope: typeof payload.scope === 'string' ? payload.scope : undefined,
  });
};

const refreshSharePointToken = async (integration: IntegrationConnection) => {
  const clientId = process.env.SHAREPOINT_CLIENT_ID;
  const clientSecret = process.env.SHAREPOINT_CLIENT_SECRET;
  const tenantId = process.env.SHAREPOINT_TENANT_ID ?? 'common';
  if (!clientId || !clientSecret || !integration.refreshToken) {
    throw new BadRequestError('SharePoint token refresh is not available');
  }
  const response = await fetch(
    `${MICROSOFT_LOGIN_BASE}/${encodeURIComponent(tenantId)}/oauth2/v2.0/token`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: 'refresh_token',
        refresh_token: integration.refreshToken,
        scope: env.integrationOAuth.sharepointScopes,
      }).toString(),
    },
  );
  const payload = (await response.json()) as Record<string, any>;
  if (!response.ok || !payload.access_token) {
    throw new BadRequestError(payload.error_description ?? payload.error ?? 'SharePoint token refresh failed');
  }
  writeOAuthMetadata(integration, {
    accessToken: String(payload.access_token),
    refreshToken: typeof payload.refresh_token === 'string' ? payload.refresh_token : integration.refreshToken,
    expiresIn: typeof payload.expires_in === 'number' ? payload.expires_in : undefined,
    tokenType: typeof payload.token_type === 'string' ? payload.token_type : undefined,
    scope: typeof payload.scope === 'string' ? payload.scope : undefined,
  });
};

const ensureFreshAccessToken = async (integration: IntegrationConnection) => {
  if (!integration.accessToken) {
    throw new BadRequestError('Integration access token is missing');
  }
  const expiresAt = getOAuthExpiry(integration);
  const isExpiringSoon = expiresAt ? expiresAt.getTime() <= Date.now() + 60_000 : false;
  if (!isExpiringSoon) {
    return integration.accessToken;
  }

  if (integration.provider === IntegrationProvider.GOOGLE_DRIVE) {
    await refreshGoogleToken(integration);
  } else if (integration.provider === IntegrationProvider.SHAREPOINT) {
    await refreshSharePointToken(integration);
  }

  await AppDataSource.getRepository(IntegrationConnection).save(integration);
  if (!integration.accessToken) {
    throw new BadRequestError('Unable to refresh integration token');
  }
  return integration.accessToken;
};

const ensureIntegrationRootFolder = async (
  integration: IntegrationConnection,
): Promise<string> => {
  const defaultRootFolderName = getDefaultRootFolderName();
  const metadata = (integration.metadata as Record<string, unknown> | null) ?? {};
  const metadataRootName =
    typeof metadata.rootFolderName === 'string' ? metadata.rootFolderName.trim() : '';
  const hasConfiguredRoot =
    typeof integration.rootFolderId === 'string' &&
    integration.rootFolderId.trim().length > 0 &&
    integration.rootFolderId !== 'root' &&
    metadataRootName === defaultRootFolderName;
  if (hasConfiguredRoot) {
    return integration.rootFolderId as string;
  }

  const provider = ensureDocumentProvider(integration.provider);
  const token = await ensureFreshAccessToken(integration);
  const configuredName = defaultRootFolderName;

  const root = await provisionProviderRoot(provider, token, configuredName);
  integration.rootFolderId = root.rootFolderId;
  integration.metadata = {
    ...metadata,
    rootFolderName: root.rootFolderName,
    ...root.metadata,
  };
  await AppDataSource.getRepository(IntegrationConnection).save(integration);
  return integration.rootFolderId as string;
};

const syncStatusFromError = (error: unknown) => {
  const message = error instanceof Error ? error.message : 'Sync failed';
  return message;
};

const withIntegrationReauthGuard = async <T>(
  integration: IntegrationConnection,
  action: () => Promise<T>,
) => {
  try {
    return await action();
  } catch (error) {
    if (isReauthRequiredError(error)) {
      await markIntegrationReauthRequired(integration, getIntegrationErrorMessage(error));
      throw new BadRequestError('Token has been expired or revoked. Reconnection required.');
    }
    throw error;
  }
};

const toExternalId = (provider: DocumentProvider, remoteId: string) =>
  `${provider}:${remoteId}`;

const parseExternalId = (externalId?: string | null) => {
  if (!externalId) return null;
  const separator = externalId.indexOf(':');
  if (separator <= 0) return null;
  const provider = externalId.slice(0, separator) as IntegrationProvider;
  const remoteId = externalId.slice(separator + 1);
  if (!remoteId) return null;
  return {
    provider,
    remoteId,
  };
};

const isLocalUploadUrl = (url?: string | null) => {
  if (!url) return false;
  if (!/^https?:\/\//i.test(url) && !url.startsWith('/') && !url.startsWith('data:')) {
    return true;
  }
  if (url.startsWith('uploads/')) return true;
  if (url.startsWith('/uploads/')) return true;
  try {
    const parsed = new URL(url);
    return parsed.pathname.startsWith('/uploads/');
  } catch {
    return false;
  }
};

const isProviderHostedUrl = (url?: string | null) => {
  if (!url) return false;
  const value = url.toLowerCase();
  return (
    value.includes('drive.google.com/') ||
    value.includes('sharepoint.com/') ||
    value.includes('graph.microsoft.com/')
  );
};

const normalizeFolderPathSegments = (folderPath?: string) =>
  (folderPath ?? '')
    .split(/[\\/]+/)
    .map((segment) => segment.trim())
    .filter((segment) => Boolean(segment));

const escapeGoogleQueryValue = (value: string) => value.replace(/'/g, "\\'");

const ensureGoogleDriveFolderPath = async (
  accessToken: string,
  rootFolderId: string,
  folderPath?: string,
) => {
  const segments = normalizeFolderPathSegments(folderPath);
  if (segments.length === 0) return rootFolderId;

  let parentFolderId = rootFolderId;
  for (const segment of segments) {
    const query = `'${escapeGoogleQueryValue(parentFolderId)}' in parents and mimeType = 'application/vnd.google-apps.folder' and name = '${escapeGoogleQueryValue(segment)}' and trashed = false`;
    const searchUrl = `${GOOGLE_DRIVE_FILES_URL}?${new URLSearchParams({
      q: query,
      fields: 'files(id,name)',
      pageSize: '1',
      spaces: 'drive',
    }).toString()}`;
    const searchResponse = await fetch(searchUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const searchPayload = (await searchResponse.json()) as Record<string, any>;
    if (!searchResponse.ok) {
      throw new BadRequestError(
        searchPayload.error?.message ?? 'Google Drive folder lookup failed',
      );
    }
    const existing = Array.isArray(searchPayload.files)
      ? searchPayload.files[0]
      : null;
    if (existing?.id) {
      parentFolderId = String(existing.id);
      continue;
    }

    const createResponse = await fetch(GOOGLE_DRIVE_FILES_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: segment,
        mimeType: 'application/vnd.google-apps.folder',
        parents: [parentFolderId],
      }),
    });
    const createPayload = (await createResponse.json()) as Record<string, any>;
    if (!createResponse.ok || !createPayload.id) {
      throw new BadRequestError(
        createPayload.error?.message ?? 'Google Drive folder create failed',
      );
    }
    parentFolderId = String(createPayload.id);
  }

  return parentFolderId;
};

const listSharePointFolderChildren = async (
  accessToken: string,
  parentFolderId: string,
) => {
  const children: Array<{ id: string; name: string }> = [];
  let nextUrl: string | null =
    `${GRAPH_BASE}/me/drive/items/${encodeURIComponent(parentFolderId)}/children` +
    '?$top=200&$select=id,name,folder';

  while (nextUrl) {
    const response = await fetch(nextUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const payload = (await response.json()) as Record<string, any>;
    if (!response.ok) {
      throw new BadRequestError(
        payload.error?.message ?? 'SharePoint folder lookup failed',
      );
    }
    const values = Array.isArray(payload.value) ? payload.value : [];
    for (const item of values) {
      if (!item?.folder || !item?.id) continue;
      children.push({
        id: String(item.id),
        name: String(item.name ?? 'Untitled'),
      });
    }
    nextUrl =
      typeof payload['@odata.nextLink'] === 'string'
        ? payload['@odata.nextLink']
        : null;
  }

  return children;
};

const ensureSharePointFolderPath = async (
  accessToken: string,
  rootFolderId: string,
  folderPath?: string,
) => {
  const segments = normalizeFolderPathSegments(folderPath);
  if (segments.length === 0) return rootFolderId;

  let parentFolderId = rootFolderId;
  for (const segment of segments) {
    const children = await listSharePointFolderChildren(accessToken, parentFolderId);
    const existing = children.find(
      (child) => child.name.toLowerCase() === segment.toLowerCase(),
    );
    if (existing) {
      parentFolderId = existing.id;
      continue;
    }

    const createResponse = await fetch(
      `${GRAPH_BASE}/me/drive/items/${encodeURIComponent(parentFolderId)}/children`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: segment,
          folder: {},
          '@microsoft.graph.conflictBehavior': 'rename',
        }),
      },
    );
    const createPayload = (await createResponse.json()) as Record<string, any>;
    if (!createResponse.ok || !createPayload.id) {
      throw new BadRequestError(
        createPayload.error?.message ?? 'SharePoint folder create failed',
      );
    }
    parentFolderId = String(createPayload.id);
  }

  return parentFolderId;
};

const uploadToGoogleDrive = async (
  integration: IntegrationConnection,
  documentName: string,
  fileBuffer: Buffer,
  mimeType: string,
  folderPath?: string,
): Promise<RemoteFile> => {
  const accessToken = await ensureFreshAccessToken(integration);
  const rootFolderId = await ensureIntegrationRootFolder(integration);
  const targetFolderId = await ensureGoogleDriveFolderPath(
    accessToken,
    rootFolderId,
    folderPath,
  );
  const metadata = {
    name: documentName,
    parents: [targetFolderId],
  };
  const form = new FormData();
  form.append(
    'metadata',
    new Blob([JSON.stringify(metadata)], { type: 'application/json' }),
  );
  form.append(
    'file',
    new Blob([new Uint8Array(fileBuffer)], { type: mimeType }),
    documentName,
  );

  const response = await fetch(GOOGLE_DRIVE_UPLOAD_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    body: form,
  });
  const payload = (await response.json()) as Record<string, any>;
  if (!response.ok || !payload.id) {
    throw new BadRequestError(payload.error?.message ?? 'Google Drive upload failed');
  }

  const fileMetaResponse = await fetch(
    `${GOOGLE_DRIVE_FILES_URL}/${encodeURIComponent(String(payload.id))}?fields=id,name,mimeType,webViewLink,modifiedTime,size`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    },
  );
  const fileMeta = (await fileMetaResponse.json()) as Record<string, any>;
  if (!fileMetaResponse.ok) {
    throw new BadRequestError(fileMeta.error?.message ?? 'Google Drive upload metadata fetch failed');
  }
  return {
    id: String(fileMeta.id),
    name: String(fileMeta.name ?? documentName),
    mimeType: typeof fileMeta.mimeType === 'string' ? fileMeta.mimeType : mimeType,
    webUrl: typeof fileMeta.webViewLink === 'string' ? fileMeta.webViewLink : undefined,
    modifiedAt: typeof fileMeta.modifiedTime === 'string' ? fileMeta.modifiedTime : undefined,
    sizeBytes:
      typeof fileMeta.size === 'string'
        ? Number(fileMeta.size)
        : typeof fileMeta.size === 'number'
          ? fileMeta.size
          : undefined,
  };
};

const uploadToSharePoint = async (
  integration: IntegrationConnection,
  documentName: string,
  fileBuffer: Buffer,
  mimeType: string,
  folderPath?: string,
): Promise<RemoteFile> => {
  const accessToken = await ensureFreshAccessToken(integration);
  const root = await ensureIntegrationRootFolder(integration);
  const parent = await ensureSharePointFolderPath(accessToken, root, folderPath);

  const uploadUrl = `${GRAPH_BASE}/me/drive/items/${encodeURIComponent(parent)}:/${encodeURIComponent(
    documentName,
  )}:/content`;
  const response = await fetch(uploadUrl, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': mimeType || 'application/octet-stream',
    },
    body: new Uint8Array(fileBuffer),
  });
  const payload = (await response.json()) as Record<string, any>;
  if (!response.ok || !payload.id) {
    throw new BadRequestError(payload.error?.message ?? 'SharePoint upload failed');
  }
  return {
    id: String(payload.id),
    name: String(payload.name ?? documentName),
    mimeType: typeof payload.file?.mimeType === 'string' ? payload.file.mimeType : mimeType,
    webUrl: typeof payload.webUrl === 'string' ? payload.webUrl : undefined,
    modifiedAt:
      typeof payload.lastModifiedDateTime === 'string' ? payload.lastModifiedDateTime : undefined,
    sizeBytes: typeof payload.size === 'number' ? payload.size : undefined,
  };
};

const listGoogleDriveFiles = async (integration: IntegrationConnection): Promise<RemoteFile[]> => {
  const accessToken = await ensureFreshAccessToken(integration);
  const rootFolderId = await ensureIntegrationRootFolder(integration);
  const queue: Array<{ folderId: string; folderPath: string }> = [
    { folderId: rootFolderId, folderPath: '' },
  ];
  const visited = new Set<string>();
  const output: RemoteFile[] = [];

  while (queue.length) {
    const current = queue.shift()!;
    if (visited.has(current.folderId)) continue;
    visited.add(current.folderId);

    let pageToken: string | undefined;
    do {
      const parentQuery = `'${current.folderId.replace(/'/g, "\\'")}' in parents and `;
      const params = new URLSearchParams({
        q: `${parentQuery}trashed=false`,
        fields: 'nextPageToken,files(id,name,mimeType,webViewLink,modifiedTime,size)',
        pageSize: '200',
        spaces: 'drive',
      });
      if (pageToken) {
        params.set('pageToken', pageToken);
      }
      const url = `${GOOGLE_DRIVE_FILES_URL}?${params.toString()}`;
      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const payload = (await response.json()) as Record<string, any>;
      if (!response.ok) {
        throw new BadRequestError(payload.error?.message ?? 'Google Drive file listing failed');
      }

      const files = Array.isArray(payload.files) ? payload.files : [];
      for (const file of files) {
        if (file?.mimeType === 'application/vnd.google-apps.folder' && file?.id) {
          const childPath = current.folderPath
            ? `${current.folderPath}/${String(file.name ?? 'Untitled')}`
            : String(file.name ?? 'Untitled');
          queue.push({ folderId: String(file.id), folderPath: childPath });
          continue;
        }
        output.push({
          id: String(file.id),
          name: String(file.name ?? 'Untitled'),
          mimeType: typeof file.mimeType === 'string' ? file.mimeType : undefined,
          webUrl: typeof file.webViewLink === 'string' ? file.webViewLink : undefined,
          modifiedAt: typeof file.modifiedTime === 'string' ? file.modifiedTime : undefined,
          folderPath: current.folderPath || undefined,
          sizeBytes:
            typeof file.size === 'string'
              ? Number(file.size)
              : typeof file.size === 'number'
                ? file.size
                : undefined,
        });
      }

      pageToken =
        typeof payload.nextPageToken === 'string' && payload.nextPageToken
          ? payload.nextPageToken
          : undefined;
    } while (pageToken);
  }

  return output;
};

const listSharePointFiles = async (integration: IntegrationConnection): Promise<RemoteFile[]> => {
  const accessToken = await ensureFreshAccessToken(integration);
  const root = await ensureIntegrationRootFolder(integration);
  const queue: Array<{ folderId: string; folderPath: string }> = [{ folderId: root, folderPath: '' }];
  const visited = new Set<string>();
  const output: RemoteFile[] = [];

  while (queue.length) {
    const current = queue.shift()!;
    if (visited.has(current.folderId)) continue;
    visited.add(current.folderId);

    let nextUrl: string | null = `${GRAPH_BASE}/me/drive/items/${encodeURIComponent(current.folderId)}/children?$top=200&$select=id,name,webUrl,lastModifiedDateTime,size,file,folder`;
    while (nextUrl) {
      const response = await fetch(nextUrl, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const payload = (await response.json()) as Record<string, any>;
      if (!response.ok) {
        throw new BadRequestError(payload.error?.message ?? 'SharePoint file listing failed');
      }
      const values = Array.isArray(payload.value) ? payload.value : [];
      for (const item of values) {
        if (item?.folder && item?.id) {
          const childPath = current.folderPath
            ? `${current.folderPath}/${String(item.name ?? 'Untitled')}`
            : String(item.name ?? 'Untitled');
          queue.push({ folderId: String(item.id), folderPath: childPath });
          continue;
        }
        output.push({
          id: String(item.id),
          name: String(item.name ?? 'Untitled'),
          mimeType: typeof item.file?.mimeType === 'string' ? item.file.mimeType : undefined,
          webUrl: typeof item.webUrl === 'string' ? item.webUrl : undefined,
          modifiedAt:
            typeof item.lastModifiedDateTime === 'string' ? item.lastModifiedDateTime : undefined,
          folderPath: current.folderPath || undefined,
          sizeBytes: typeof item.size === 'number' ? item.size : undefined,
        });
      }
      nextUrl = typeof payload['@odata.nextLink'] === 'string' ? payload['@odata.nextLink'] : null;
    }
  }

  return output;
};

const listGoogleDriveRootFolders = async (integration: IntegrationConnection) => {
  const accessToken = await ensureFreshAccessToken(integration);
  const rootFolderId = await ensureIntegrationRootFolder(integration);
  const query = `'${rootFolderId.replace(/'/g, "\\'")}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`;
  const url = `${GOOGLE_DRIVE_FILES_URL}?${new URLSearchParams({
    q: query,
    fields: 'files(id,name)',
    pageSize: '200',
    spaces: 'drive',
  }).toString()}`;
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const payload = (await response.json()) as Record<string, any>;
  if (!response.ok) {
    throw new BadRequestError(payload.error?.message ?? 'Google Drive folder listing failed');
  }
  const files = Array.isArray(payload.files) ? payload.files : [];
  return files.map((file: any) => ({
    id: String(file.id),
    name: String(file.name ?? 'Untitled'),
  }));
};

const listSharePointRootFolders = async (integration: IntegrationConnection) => {
  const accessToken = await ensureFreshAccessToken(integration);
  const rootFolderId = await ensureIntegrationRootFolder(integration);
  const folders: Array<{ id: string; name: string }> = [];
  let nextUrl: string | null = `${GRAPH_BASE}/me/drive/items/${encodeURIComponent(rootFolderId)}/children?$top=200&$select=id,name,folder`;
  while (nextUrl) {
    const response = await fetch(nextUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const payload = (await response.json()) as Record<string, any>;
    if (!response.ok) {
      throw new BadRequestError(payload.error?.message ?? 'SharePoint folder listing failed');
    }
    const values = Array.isArray(payload.value) ? payload.value : [];
    folders.push(
      ...values
        .filter((item: any) => item?.folder)
        .map((item: any) => ({
          id: String(item.id),
          name: String(item.name ?? 'Untitled'),
        })),
    );
    nextUrl =
      typeof payload['@odata.nextLink'] === 'string' ? payload['@odata.nextLink'] : null;
  }
  return folders;
};

const createGoogleDriveRootFolder = async (
  integration: IntegrationConnection,
  folderName: string,
) => {
  const accessToken = await ensureFreshAccessToken(integration);
  const rootFolderId = await ensureIntegrationRootFolder(integration);
  const normalized = folderName.trim();
  const query = `'${rootFolderId.replace(/'/g, "\\'")}' in parents and mimeType='application/vnd.google-apps.folder' and name='${normalized.replace(/'/g, "\\'")}' and trashed=false`;
  const searchUrl = `${GOOGLE_DRIVE_FILES_URL}?${new URLSearchParams({
    q: query,
    fields: 'files(id,name)',
    pageSize: '1',
    spaces: 'drive',
  }).toString()}`;
  const searchResponse = await fetch(searchUrl, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const searchPayload = (await searchResponse.json()) as Record<string, any>;
  if (!searchResponse.ok) {
    throw new BadRequestError(searchPayload.error?.message ?? 'Google Drive folder lookup failed');
  }
  const existing = Array.isArray(searchPayload.files) ? searchPayload.files[0] : null;
  if (existing?.id) {
    return { id: String(existing.id), name: String(existing.name ?? normalized), existing: true };
  }

  const createResponse = await fetch(GOOGLE_DRIVE_FILES_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: normalized,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [rootFolderId],
    }),
  });
  const createPayload = (await createResponse.json()) as Record<string, any>;
  if (!createResponse.ok || !createPayload.id) {
    throw new BadRequestError(createPayload.error?.message ?? 'Google Drive folder create failed');
  }
  return { id: String(createPayload.id), name: normalized, existing: false };
};

const createSharePointRootFolder = async (
  integration: IntegrationConnection,
  folderName: string,
) => {
  const accessToken = await ensureFreshAccessToken(integration);
  const rootFolderId = await ensureIntegrationRootFolder(integration);
  const normalized = folderName.trim();
  const folders = await listSharePointRootFolders(integration);
  const existing = folders.find((folder) => folder.name.toLowerCase() === normalized.toLowerCase());
  if (existing) {
    return { ...existing, existing: true };
  }
  const response = await fetch(`${GRAPH_BASE}/me/drive/items/${encodeURIComponent(rootFolderId)}/children`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: normalized,
      folder: {},
      '@microsoft.graph.conflictBehavior': 'fail',
    }),
  });
  const payload = (await response.json()) as Record<string, any>;
  if (!response.ok || !payload.id) {
    throw new BadRequestError(payload.error?.message ?? 'SharePoint folder create failed');
  }
  return { id: String(payload.id), name: normalized, existing: false };
};

const updateDocumentSyncMetadata = async (
  integration: IntegrationConnection,
  patch: Record<string, unknown>,
) => {
  const repo = AppDataSource.getRepository(IntegrationConnection);
  const metadata = (integration.metadata as Record<string, unknown> | null) ?? {};
  const currentSync = (metadata.documentSync as Record<string, unknown> | undefined) ?? {};
  metadata.documentSync = {
    ...currentSync,
    ...patch,
    updatedAt: new Date().toISOString(),
  };
  integration.metadata = metadata;
  await repo.save(integration);
};

export const getConnectedDocumentIntegration = async (
  tenantId: string,
  provider?: IntegrationProvider,
) => {
  const repo = AppDataSource.getRepository(IntegrationConnection);
  const where = {
    tenantId,
    status: IntegrationStatus.CONNECTED,
    isDeleted: false,
  } as const;
  if (provider) {
    const safeProvider = ensureDocumentProvider(provider);
    return repo.findOne({ where: { ...where, provider: safeProvider } });
  }
  return repo.findOne({
    where: [
      { ...where, provider: IntegrationProvider.GOOGLE_DRIVE },
      { ...where, provider: IntegrationProvider.SHAREPOINT },
    ],
    order: { updatedAt: 'DESC' },
  });
};

const resolveIntegrationForTenant = async (
  tenantId: string,
  provider?: IntegrationProvider,
) => {
  if (provider) {
    const integration = await getConnectedDocumentIntegration(tenantId, provider);
    return integration;
  }
  const tenant = await AppDataSource.getRepository(Tenant).findOne({
    where: { id: tenantId, isDeleted: false },
  });
  const preferredProvider =
    tenant?.documentSyncProvider &&
    DOCUMENT_SYNC_PROVIDERS.includes(tenant.documentSyncProvider as DocumentProvider)
      ? tenant.documentSyncProvider
      : undefined;
  if (preferredProvider) {
    const preferred = await getConnectedDocumentIntegration(tenantId, preferredProvider);
    if (preferred) return preferred;
  }
  return getConnectedDocumentIntegration(tenantId);
};

const listProviderFiles = async (integration: IntegrationConnection): Promise<RemoteFile[]> => {
  const safeProvider = ensureDocumentProvider(integration.provider);
  if (safeProvider === IntegrationProvider.GOOGLE_DRIVE) {
    return listGoogleDriveFiles(integration);
  }
  return listSharePointFiles(integration);
};

const getProviderFileById = async (
  integration: IntegrationConnection,
  remoteId: string,
): Promise<RemoteFile | null> => {
  const provider = ensureDocumentProvider(integration.provider);
  const accessToken = await ensureFreshAccessToken(integration);

  if (provider === IntegrationProvider.GOOGLE_DRIVE) {
    const response = await fetch(
      `${GOOGLE_DRIVE_FILES_URL}/${encodeURIComponent(remoteId)}?fields=id,name,mimeType,webViewLink,modifiedTime,size`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      },
    );
    const payload = (await response.json()) as Record<string, any>;
    if (!response.ok) {
      return null;
    }
    return {
      id: String(payload.id),
      name: String(payload.name ?? 'Untitled'),
      mimeType: typeof payload.mimeType === 'string' ? payload.mimeType : undefined,
      webUrl: typeof payload.webViewLink === 'string' ? payload.webViewLink : undefined,
      modifiedAt: typeof payload.modifiedTime === 'string' ? payload.modifiedTime : undefined,
      sizeBytes:
        typeof payload.size === 'string'
          ? Number(payload.size)
          : typeof payload.size === 'number'
            ? payload.size
            : undefined,
    };
  }

  const response = await fetch(
    `${GRAPH_BASE}/me/drive/items/${encodeURIComponent(remoteId)}?$select=id,name,webUrl,lastModifiedDateTime,size,file`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    },
  );
  const payload = (await response.json()) as Record<string, any>;
  if (!response.ok) {
    return null;
  }
  return {
    id: String(payload.id),
    name: String(payload.name ?? 'Untitled'),
    mimeType: typeof payload.file?.mimeType === 'string' ? payload.file.mimeType : undefined,
    webUrl: typeof payload.webUrl === 'string' ? payload.webUrl : undefined,
    modifiedAt:
      typeof payload.lastModifiedDateTime === 'string' ? payload.lastModifiedDateTime : undefined,
    sizeBytes: typeof payload.size === 'number' ? payload.size : undefined,
  };
};

const deleteProviderFileById = async (
  integration: IntegrationConnection,
  remoteId: string,
) => {
  const provider = ensureDocumentProvider(integration.provider);
  const accessToken = await ensureFreshAccessToken(integration);

  if (provider === IntegrationProvider.GOOGLE_DRIVE) {
    const response = await fetch(
      `${GOOGLE_DRIVE_FILES_URL}/${encodeURIComponent(remoteId)}?supportsAllDrives=true`,
      {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${accessToken}` },
      },
    );
    if (response.status === 404) return;
    if (!response.ok) {
      let message = 'Failed to delete file from Google Drive';
      try {
        const payload = (await response.json()) as Record<string, any>;
        message = payload.error?.message ?? message;
      } catch {
        // keep default message
      }
      throw new BadRequestError(message);
    }
    return;
  }

  const response = await fetch(
    `${GRAPH_BASE}/me/drive/items/${encodeURIComponent(remoteId)}`,
    {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${accessToken}` },
    },
  );
  if (response.status === 404) return;
  if (!response.ok) {
    let message = 'Failed to delete file from SharePoint';
    try {
      const payload = (await response.json()) as Record<string, any>;
      message = payload.error?.message ?? message;
    } catch {
      // keep default message
    }
    throw new BadRequestError(message);
  }
};

export const deleteDocumentFromProvider = async (document: DocumentItem) => {
  const parsedExternal = parseExternalId(document.externalId);
  if (!parsedExternal) {
    return { attempted: false, deleted: false };
  }
  const provider = ensureDocumentProvider(parsedExternal.provider);
  const integration = await resolveIntegrationForTenant(document.tenantId, provider);
  if (!integration) {
    throw new BadRequestError('Connected integration not found for this file');
  }

  await withIntegrationReauthGuard(integration, () =>
    deleteProviderFileById(integration, parsedExternal.remoteId),
  );
  return { attempted: true, deleted: true, provider };
};

const uploadFileToProvider = async (
  integration: IntegrationConnection,
  name: string,
  fileBuffer: Buffer,
  mimeType: string,
  folderName?: string,
) => {
  const safeProvider = ensureDocumentProvider(integration.provider);
  if (safeProvider === IntegrationProvider.GOOGLE_DRIVE) {
    return uploadToGoogleDrive(integration, name, fileBuffer, mimeType, folderName);
  }
  return uploadToSharePoint(integration, name, fileBuffer, mimeType, folderName);
};

export const syncDocumentToProvider = async (document: DocumentItem) => {
  const integration = await resolveIntegrationForTenant(document.tenantId);
  if (!integration) {
    document.syncStatus = SyncStatus.PENDING;
    await AppDataSource.getRepository(DocumentItem).save(document);
    return document;
  }

  try {
    // Provider-origin links cannot be re-uploaded as source binaries.
    if (document.externalId && !isLocalUploadUrl(document.fileUrl) && isProviderHostedUrl(document.fileUrl)) {
      if (document.syncStatus !== SyncStatus.SYNCED) {
        document.syncStatus = SyncStatus.SYNCED;
        await AppDataSource.getRepository(DocumentItem).save(document);
      }
      return document;
    }

    const file = await readLocalOrRemoteFile(document.fileUrl);
    const uploaded = await withIntegrationReauthGuard(integration, () =>
      uploadFileToProvider(
        integration,
        document.name || `document-${document.id}`,
        file.buffer,
        file.mimeType,
        document.category,
      ),
    );
    document.externalId = toExternalId(ensureDocumentProvider(integration.provider), uploaded.id);
    document.syncStatus = SyncStatus.SYNCED;
    document.fileSizeBytes =
      typeof uploaded.sizeBytes === 'number' && Number.isFinite(uploaded.sizeBytes)
        ? Math.round(uploaded.sizeBytes)
        : file.buffer.length;
    await AppDataSource.getRepository(DocumentItem).save(document);
    return document;
  } catch (error) {
    document.syncStatus = SyncStatus.ERROR;
    await AppDataSource.getRepository(DocumentItem).save(document);
    throw new BadRequestError(syncStatusFromError(error));
  }
};

export const pullProviderDocumentsToCRM = async (params: {
  tenantId: string;
  provider?: IntegrationProvider;
}) => {
  const integration = await resolveIntegrationForTenant(params.tenantId, params.provider);
  if (!integration) {
    return { imported: 0, updated: 0, files: [] as RemoteFile[] };
  }

  const provider = ensureDocumentProvider(integration.provider);
  const files = await withIntegrationReauthGuard(integration, () =>
    listProviderFiles(integration),
  );
  const repo = AppDataSource.getRepository(DocumentItem);
  let imported = 0;
  let updated = 0;

  for (const file of files) {
    const externalId = toExternalId(provider, file.id);
    const existing = await repo.findOne({
      where: { tenantId: params.tenantId, externalId, isDeleted: false },
    });
    if (existing) {
      let changed = false;
      if (existing.name !== file.name) {
        existing.name = file.name;
        changed = true;
      }
      if (file.folderPath && existing.category !== file.folderPath) {
        existing.category = file.folderPath;
        changed = true;
      }
      if (
        typeof file.sizeBytes === 'number' &&
        Number.isFinite(file.sizeBytes) &&
        existing.fileSizeBytes !== Math.round(file.sizeBytes)
      ) {
        existing.fileSizeBytes = Math.round(file.sizeBytes);
        changed = true;
      }
      const nextUrl = file.webUrl ?? existing.fileUrl;
      if (nextUrl && existing.fileUrl !== nextUrl) {
        existing.fileUrl = nextUrl;
        changed = true;
      }
      if (existing.syncStatus !== SyncStatus.SYNCED) {
        existing.syncStatus = SyncStatus.SYNCED;
        changed = true;
      }
      if (changed) {
        await repo.save(existing);
        updated += 1;
      }
      continue;
    }

    const created = repo.create({
      tenantId: params.tenantId,
      name: file.name,
      fileUrl: file.webUrl ?? '',
      category:
        file.folderPath ||
        (provider === IntegrationProvider.GOOGLE_DRIVE ? 'Google Drive' : 'SharePoint'),
      status: DocumentStatus.PENDING,
      syncStatus: SyncStatus.SYNCED,
      externalId,
      fileSizeBytes:
        typeof file.sizeBytes === 'number' && Number.isFinite(file.sizeBytes)
          ? Math.round(file.sizeBytes)
          : undefined,
      relatedEntityType: 'integration',
      relatedEntityId: integration.id,
    });
    await repo.save(created);
    imported += 1;
  }

  await updateDocumentSyncMetadata(integration, {
    lastPullAt: new Date().toISOString(),
    lastPullImported: imported,
    lastPullUpdated: updated,
    lastPullProviderFileCount: files.length,
    lastPullStatus: 'success',
  });

  return { imported, updated, files };
};

export const reconcileTenantDocuments = async (params: {
  tenantId: string;
  provider?: IntegrationProvider;
}) => {
  const integration = await resolveIntegrationForTenant(params.tenantId, params.provider);
  if (!integration) {
    return {
      imported: 0,
      updated: 0,
      repaired: 0,
      requeued: 0,
      errored: 0,
      scanned: 0,
      files: [] as RemoteFile[],
    };
  }

  const provider = ensureDocumentProvider(integration.provider);
  const repo = AppDataSource.getRepository(DocumentItem);
  const localDocuments = await repo.find({
    where: { tenantId: params.tenantId, isDeleted: false },
  });

  const pull = await withIntegrationReauthGuard(integration, () =>
    pullProviderDocumentsToCRM({
      tenantId: params.tenantId,
      provider,
    }),
  );

  const remoteByExternalId = new Map<string, RemoteFile>();
  for (const file of pull.files) {
    remoteByExternalId.set(toExternalId(provider, file.id), file);
  }

  let repaired = 0;
  let requeued = 0;
  let errored = 0;

  for (const document of localDocuments) {
    const parsedExternal = parseExternalId(document.externalId);
    const externalProviderMismatch =
      parsedExternal && parsedExternal.provider !== provider;

    try {
      if (!document.externalId || externalProviderMismatch) {
        document.externalId = undefined;
        if (document.syncStatus !== SyncStatus.PENDING) {
          document.syncStatus = SyncStatus.PENDING;
          await repo.save(document);
          repaired += 1;
        }
        await syncDocumentToProvider(document);
        requeued += 1;
        continue;
      }

      const remote = remoteByExternalId.get(document.externalId);
      if (remote) {
        let changed = false;
        if (document.syncStatus !== SyncStatus.SYNCED) {
          document.syncStatus = SyncStatus.SYNCED;
          changed = true;
        }
        if (!document.fileUrl && remote.webUrl) {
          document.fileUrl = remote.webUrl;
          changed = true;
        }
        if (changed) {
          await repo.save(document);
          repaired += 1;
        }
        continue;
      }

      if (isLocalUploadUrl(document.fileUrl)) {
        if (document.syncStatus !== SyncStatus.PENDING) {
          document.syncStatus = SyncStatus.PENDING;
          await repo.save(document);
          repaired += 1;
        }
        await syncDocumentToProvider(document);
        requeued += 1;
        continue;
      }

      if (document.externalId && isProviderHostedUrl(document.fileUrl)) {
        let changed = false;
        if (document.syncStatus !== SyncStatus.SYNCED) {
          document.syncStatus = SyncStatus.SYNCED;
          changed = true;
        }
        if (
          (!document.fileSizeBytes || document.fileSizeBytes <= 0) &&
          parsedExternal?.remoteId
        ) {
          const remoteMeta = await getProviderFileById(integration, parsedExternal.remoteId);
          if (
            remoteMeta &&
            typeof remoteMeta.sizeBytes === 'number' &&
            Number.isFinite(remoteMeta.sizeBytes) &&
            Math.round(remoteMeta.sizeBytes) > 0
          ) {
            document.fileSizeBytes = Math.round(remoteMeta.sizeBytes);
            changed = true;
          }
        }
        if (changed) {
          await repo.save(document);
          repaired += 1;
        }
        continue;
      }

      if (document.syncStatus !== SyncStatus.ERROR) {
        document.syncStatus = SyncStatus.ERROR;
        await repo.save(document);
        errored += 1;
      }
    } catch {
      if (document.syncStatus !== SyncStatus.ERROR) {
        document.syncStatus = SyncStatus.ERROR;
        await repo.save(document);
      }
      errored += 1;
    }
  }

  const result = {
    imported: pull.imported,
    updated: pull.updated,
    repaired,
    requeued,
    errored,
    scanned: localDocuments.length,
    files: pull.files,
  };

  await updateDocumentSyncMetadata(integration, {
    lastReconcileAt: new Date().toISOString(),
    lastReconcileImported: result.imported,
    lastReconcileUpdated: result.updated,
    lastReconcileRepaired: result.repaired,
    lastReconcileRequeued: result.requeued,
    lastReconcileErrored: result.errored,
    lastReconcileScanned: result.scanned,
    lastReconcileStatus: result.errored > 0 ? 'partial' : 'success',
  });

  return result;
};

export const syncContractorDocumentToCRMShadow = async (params: {
  tenantId: string;
  contractorDocumentId: string;
  fileUrl: string;
  requirementName: string;
  contractorName: string;
}) => {
  const repo = AppDataSource.getRepository(DocumentItem);
  const existing = await repo.findOne({
    where: {
      tenantId: params.tenantId,
      relatedEntityType: 'contractor_document',
      relatedEntityId: params.contractorDocumentId,
      isDeleted: false,
    },
  });

  const displayName = `${params.requirementName} - ${params.contractorName}`;
  const normalizedFileRef = normalizeStoredFileReference(params.fileUrl) ?? params.fileUrl;
  const record =
    existing ??
    repo.create({
      tenantId: params.tenantId,
      relatedEntityType: 'contractor_document',
      relatedEntityId: params.contractorDocumentId,
      category: 'Contractor Compliance',
      status: DocumentStatus.SUBMITTED,
      syncStatus: SyncStatus.PENDING,
      name: displayName,
      fileUrl: normalizedFileRef,
    });

  record.name = displayName;
  record.fileUrl = normalizedFileRef;
  record.category = 'Contractor Compliance';
  record.status = DocumentStatus.SUBMITTED;
  if (!record.externalId) {
    record.syncStatus = SyncStatus.PENDING;
  }
  await repo.save(record);

  return record;
};

export const getIntegrationStorageStats = async (params: {
  tenantId: string;
  provider?: IntegrationProvider;
}) => {
  const integration = await resolveIntegrationForTenant(params.tenantId, params.provider);
  if (!integration) {
    return null;
  }

  const provider = ensureDocumentProvider(integration.provider);
  const accessToken = await withIntegrationReauthGuard(integration, () =>
    ensureFreshAccessToken(integration),
  );

  if (provider === IntegrationProvider.GOOGLE_DRIVE) {
    const response = await fetch(GOOGLE_DRIVE_ABOUT_URL, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const payload = (await response.json()) as Record<string, any>;
    if (!response.ok) {
      throw new BadRequestError(payload.error?.message ?? 'Failed to fetch Google Drive storage stats');
    }
    const storageQuota = (payload.storageQuota ?? {}) as Record<string, any>;
    const usedBytes = Number(storageQuota.usage ?? 0);
    const totalBytes = Number(storageQuota.limit ?? 0);
    const remainingBytes =
      totalBytes > 0 ? Math.max(totalBytes - usedBytes, 0) : Number(storageQuota.usageInDriveTrash ?? 0);

    return {
      provider,
      usedBytes: Number.isFinite(usedBytes) ? usedBytes : 0,
      totalBytes: Number.isFinite(totalBytes) ? totalBytes : 0,
      remainingBytes: Number.isFinite(remainingBytes) ? remainingBytes : 0,
    };
  }

  const response = await fetch(`${GRAPH_BASE}/me/drive?$select=quota`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const payload = (await response.json()) as Record<string, any>;
  if (!response.ok) {
    throw new BadRequestError(payload.error?.message ?? 'Failed to fetch SharePoint storage stats');
  }
  const quota = (payload.quota ?? {}) as Record<string, any>;
  const usedBytes = Number(quota.used ?? 0);
  const totalBytes = Number(quota.total ?? 0);
  const remainingBytes =
    Number(quota.remaining ?? (totalBytes > 0 ? Math.max(totalBytes - usedBytes, 0) : 0));

  return {
    provider,
    usedBytes: Number.isFinite(usedBytes) ? usedBytes : 0,
    totalBytes: Number.isFinite(totalBytes) ? totalBytes : 0,
    remainingBytes: Number.isFinite(remainingBytes) ? remainingBytes : 0,
  };
};

export const listIntegrationRootFolders = async (params: {
  tenantId: string;
  provider?: IntegrationProvider;
}) => {
  const integration = await resolveIntegrationForTenant(params.tenantId, params.provider);
  if (!integration) {
    return [] as Array<{ id: string; name: string }>;
  }
  const provider = ensureDocumentProvider(integration.provider);
  if (provider === IntegrationProvider.GOOGLE_DRIVE) {
    return withIntegrationReauthGuard(integration, () =>
      listGoogleDriveRootFolders(integration),
    );
  }
  return withIntegrationReauthGuard(integration, () =>
    listSharePointRootFolders(integration),
  );
};

export const createIntegrationRootFolder = async (params: {
  tenantId: string;
  provider?: IntegrationProvider;
  folderName: string;
}) => {
  const integration = await resolveIntegrationForTenant(params.tenantId, params.provider);
  if (!integration) {
    throw new BadRequestError('Integration not connected');
  }
  const provider = ensureDocumentProvider(integration.provider);
  const normalized = params.folderName.trim();
  if (!normalized) {
    throw new BadRequestError('Folder name is required');
  }
  if (provider === IntegrationProvider.GOOGLE_DRIVE) {
    return withIntegrationReauthGuard(integration, () =>
      createGoogleDriveRootFolder(integration, normalized),
    );
  }
  return withIntegrationReauthGuard(integration, () =>
    createSharePointRootFolder(integration, normalized),
  );
};

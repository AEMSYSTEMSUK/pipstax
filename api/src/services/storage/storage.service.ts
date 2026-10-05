import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { AppDataSource } from '../../config/data-source';
import { env } from '../../config/env';
import { StorageProvider } from '../../constants/storage';
import { Tenant } from '../../entities/tenant.entity';
import { BadRequestError, NotFoundError } from '../../utils/errors';

export type TenantStorageContext = {
  tenantId: string;
  provider: StorageProvider;
};

export type StoredFileResult = {
  provider: StorageProvider;
  key: string;
  url: string;
  mimeType?: string;
  sizeBytes?: number;
  originalFilename?: string;
};

type StoreFileOptions = {
  scope?: string;
};

const storageRoot = path.join(process.cwd(), 'public', 'uploads');

const trimSlashes = (value: string) => value.replace(/^\/+|\/+$/g, '');

const sanitizeSegment = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9-_]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

const sanitizeFilename = (value: string) =>
  value
    .replace(/[^a-zA-Z0-9._-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

const getApiOrigin = () => {
  try {
    return new URL(env.apiUrl).origin;
  } catch {
    return `http://localhost:${env.port}`;
  }
};

const resolveLocalUrl = (key: string) => {
  const normalized = trimSlashes(key.split(path.sep).join('/'));
  return `${getApiOrigin()}/uploads/${normalized}`;
};

const resolveS3Url = (key: string) => {
  const normalized = trimSlashes(key.split(path.sep).join('/'));
  if (!normalized) return '';
  const configuredBase = (env.s3.publicBaseUrl ?? '').trim();
  if (configuredBase) {
    return `${configuredBase.replace(/\/+$/, '')}/${normalized}`;
  }
  const bucket = (env.s3.bucket ?? '').trim();
  if (!bucket) {
    return '';
  }
  const region = (env.s3.region ?? '').trim();
  if (region) {
    return `https://${bucket}.s3.${region}.amazonaws.com/${normalized}`;
  }
  return `https://${bucket}.s3.amazonaws.com/${normalized}`;
};

const toUploadsKeyFromPath = (rawPath: string) => {
  const normalized = rawPath.replace(/\\/g, '/').trim();
  if (!normalized) return '';
  if (normalized.startsWith('/uploads/')) {
    return normalized.slice('/uploads/'.length);
  }
  if (normalized.startsWith('uploads/')) {
    return normalized.slice('uploads/'.length);
  }
  if (normalized.startsWith('/')) {
    return '';
  }
  return normalized;
};

const isPathInside = (root: string, target: string) => {
  const normalizedRoot = path.resolve(root);
  const normalizedTarget = path.resolve(target);
  return (
    normalizedTarget === normalizedRoot ||
    normalizedTarget.startsWith(`${normalizedRoot}${path.sep}`)
  );
};

const isLikelyS3Host = (hostname: string) => {
  const lower = hostname.toLowerCase();
  return (
    lower.includes('amazonaws.com') ||
    lower.includes('.digitaloceanspaces.com') ||
    lower.includes('.r2.cloudflarestorage.com')
  );
};

const toS3KeyFromUrl = (parsed: URL) => {
  if (!isLikelyS3Host(parsed.hostname)) return '';
  const parts = trimSlashes(parsed.pathname).split('/').filter(Boolean);
  if (parts.length === 0) return '';

  const bucket = (env.s3.bucket ?? '').trim().toLowerCase();
  const host = parsed.hostname.toLowerCase();
  const isVirtualHostedBucket = Boolean(bucket) && host.startsWith(`${bucket}.`);

  if (!isVirtualHostedBucket) {
    if (bucket && parts[0]?.toLowerCase() === bucket) {
      parts.shift();
    } else if (
      host === 's3.amazonaws.com' ||
      host.startsWith('s3.') ||
      host.includes('.s3.')
    ) {
      parts.shift();
    }
  }

  return parts.join('/');
};

const toStorageKeyFromUrl = (parsed: URL) => {
  const uploadsKey = toUploadsKeyFromPath(parsed.pathname);
  if (uploadsKey) return trimSlashes(uploadsKey);

  const s3Key = toS3KeyFromUrl(parsed);
  if (s3Key) return trimSlashes(s3Key);

  const customBaseRaw = (env.s3.publicBaseUrl ?? '').trim();
  if (customBaseRaw) {
    try {
      const customBase = new URL(customBaseRaw);
      if (parsed.origin === customBase.origin) {
        const fullPath = trimSlashes(parsed.pathname);
        const basePath = trimSlashes(customBase.pathname);
        if (basePath && fullPath.startsWith(`${basePath}/`)) {
          return trimSlashes(fullPath.slice(basePath.length + 1));
        }
        if (!basePath) {
          return fullPath;
        }
      }
    } catch {
      // Ignore invalid custom base URL and keep raw value.
    }
  }

  return '';
};

export const normalizeStoredFileReference = (value?: string | null) => {
  const raw = String(value ?? '').trim();
  if (!raw) return undefined;
  if (raw.startsWith('data:')) return raw;

  try {
    const parsed = new URL(raw);
    const key = toStorageKeyFromUrl(parsed);
    return key || raw;
  } catch {
    const key = toUploadsKeyFromPath(raw);
    return key || raw;
  }
};

export const resolveStoredFileUrl = (
  value?: string | null,
  providerOverride?: StorageProvider,
) => {
  const normalized = normalizeStoredFileReference(value);
  if (!normalized) return undefined;
  if (/^https?:\/\//i.test(normalized) || normalized.startsWith('data:')) {
    return normalized;
  }

  const provider = providerOverride ?? env.fileStorageProvider ?? StorageProvider.LOCAL;
  if (provider === StorageProvider.S3) {
    const s3Url = resolveS3Url(normalized);
    return s3Url || normalized;
  }
  return resolveLocalUrl(normalized);
};

export const removeStoredLocalFile = async (value?: string | null) => {
  const normalized = normalizeStoredFileReference(value);
  if (!normalized) return false;
  if (/^https?:\/\//i.test(normalized) || normalized.startsWith('data:')) {
    return false;
  }

  const relativePath = normalized.replace(/\\/g, '/');
  const fullPath = path.resolve(storageRoot, relativePath);
  if (!isPathInside(storageRoot, fullPath)) {
    throw new BadRequestError('Invalid file path');
  }

  try {
    await fs.unlink(fullPath);
    return true;
  } catch (error: any) {
    if (error?.code === 'ENOENT') {
      return false;
    }
    throw error;
  }
};

const storeLocalFile = async (
  context: TenantStorageContext,
  file: Express.Multer.File,
  options?: StoreFileOptions,
): Promise<StoredFileResult> => {
  if (!file.buffer || file.buffer.length === 0) {
    throw new BadRequestError('Uploaded file is empty');
  }

  const tenantSegment = sanitizeSegment(context.tenantId);
  const scopeSegment = sanitizeSegment(options?.scope || 'general');
  const dateSegment = new Date().toISOString().slice(0, 10);
  const ext = path.extname(file.originalname || '').toLowerCase();
  const baseName = sanitizeFilename(path.basename(file.originalname || 'file', ext)) || 'file';
  const randomId = crypto.randomBytes(6).toString('hex');
  const filename = `${Date.now()}-${randomId}-${baseName}${ext}`;
  const key = path.join(tenantSegment, scopeSegment, dateSegment, filename);
  const fullPath = path.join(storageRoot, key);

  await fs.mkdir(path.dirname(fullPath), { recursive: true });
  await fs.writeFile(fullPath, file.buffer);

  return {
    provider: StorageProvider.LOCAL,
    key,
    url: resolveStoredFileUrl(key, StorageProvider.LOCAL) ?? resolveLocalUrl(key),
    mimeType: file.mimetype,
    sizeBytes: file.size,
    originalFilename: file.originalname,
  };
};

const storeS3File = async (): Promise<StoredFileResult> => {
  throw new BadRequestError('S3 storage is not configured yet for this workspace');
};

export const resolveTenantStorageContext = async (
  tenantId: string,
): Promise<TenantStorageContext> => {
  const repo = AppDataSource.getRepository(Tenant);
  const tenant = await repo.findOne({ where: { id: tenantId, isDeleted: false } });
  if (!tenant) {
    throw new NotFoundError('Tenant not found');
  }

  return {
    tenantId,
    provider: env.fileStorageProvider ?? StorageProvider.LOCAL,
  };
};

export const storeTenantFile = async (
  context: TenantStorageContext,
  file: Express.Multer.File,
  options?: StoreFileOptions,
): Promise<StoredFileResult> => {
  if (context.provider === StorageProvider.S3) {
    return storeS3File();
  }
  return storeLocalFile(context, file, options);
};

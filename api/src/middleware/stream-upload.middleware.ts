import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import multer from 'multer';
import { Request } from 'express';
import { getTenantId } from '../utils/request';

const STREAM_UPLOAD_MAX_MB = Number(process.env.STREAM_UPLOAD_MAX_MB ?? 250);
const uploadsRoot = path.join(process.cwd(), 'public', 'uploads');

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

const fileFilter = (_req: Request, _file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  // Storage section supports "any file type" uploads by product requirement.
  cb(null, true);
};

const streamStorage = multer.diskStorage({
  destination: (req, _file, cb) => {
    try {
      const tenantId = sanitizeSegment(getTenantId(req));
      const dateSegment = new Date().toISOString().slice(0, 10);
      const destination = path.join(uploadsRoot, tenantId, 'attachments', dateSegment);
      fs.mkdir(destination, { recursive: true }, (error) => cb(error, destination));
    } catch (error) {
      cb(error as Error, uploadsRoot);
    }
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase();
    const baseName = sanitizeFilename(path.basename(file.originalname || 'file', ext)) || 'file';
    const randomId = crypto.randomBytes(6).toString('hex');
    cb(null, `${Date.now()}-${randomId}-${baseName}${ext}`);
  },
});

export const streamUpload = multer({
  storage: streamStorage,
  fileFilter,
  limits: {
    fileSize: STREAM_UPLOAD_MAX_MB * 1024 * 1024,
  },
});

export const toStoredUploadKey = (filePath: string) => {
  const relative = path.relative(uploadsRoot, filePath);
  return relative.split(path.sep).join('/');
};

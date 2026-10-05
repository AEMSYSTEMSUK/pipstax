import multer from 'multer';
import path from 'path';

const storage = multer.memoryStorage();

const imageAndPdfFilter = (req: any, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  const allowedMimeTypes = new Set(['application/pdf']);
  const allowedExtensions = new Set([
    '.pdf',
    '.png',
    '.jpg',
    '.jpeg',
    '.gif',
    '.webp',
    '.svg',
    '.bmp',
    '.tif',
    '.tiff',
  ]);
  const extension = path.extname(file.originalname || '').toLowerCase();

  if (
    file.mimetype.startsWith('image/') ||
    allowedMimeTypes.has(file.mimetype) ||
    allowedExtensions.has(extension)
  ) {
    cb(null, true);
  } else {
    cb(new Error('Unsupported file type'));
  }
};

const imageOnlyFilter = (req: any, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  const extension = path.extname(file.originalname || '').toLowerCase();
  const allowedExtensions = new Set([
    '.png',
    '.jpg',
    '.jpeg',
    '.gif',
    '.webp',
    '.svg',
    '.bmp',
    '.tif',
    '.tiff',
    '.heic',
    '.heif',
  ]);

  if (file.mimetype.startsWith('image/') || allowedExtensions.has(extension)) {
    cb(null, true);
  } else {
    cb(new Error('Only image files are allowed'));
  }
};

export const upload = multer({
  storage,
  fileFilter: imageAndPdfFilter,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  },
});

export const uploadImageOnly = multer({
  storage,
  fileFilter: imageOnlyFilter,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  },
});

export const uploadAny = multer({
  storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  },
});

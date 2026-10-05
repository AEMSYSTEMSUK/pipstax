import { Router } from 'express';
import {
  listDocuments,
  getDocument,
  createDocument,
  createDocumentByStreamUpload,
  updateDocument,
  deleteDocument
} from '../controllers/documents/documents.controller';
import { authMiddleware } from '../../middleware/auth';
import { tenantMiddleware } from '../../middleware/tenant';
import { requirePermission } from '../../middleware/permissions';
import { Permissions } from '../../constants/permissions';
import { streamUpload } from '../../middleware/stream-upload.middleware';

const router = Router();

router.use(authMiddleware, tenantMiddleware);

router.get('/', requirePermission(Permissions.DOCUMENTS_VIEW), listDocuments);
router.get('/:id', requirePermission(Permissions.DOCUMENTS_VIEW), getDocument);
router.post(
  '/upload-stream',
  requirePermission(Permissions.DOCUMENTS_MANAGE),
  streamUpload.single('file'),
  createDocumentByStreamUpload,
);
router.post('/', requirePermission(Permissions.DOCUMENTS_MANAGE), createDocument);
router.put('/:id', requirePermission(Permissions.DOCUMENTS_MANAGE), updateDocument);
router.delete('/:id', requirePermission(Permissions.DOCUMENTS_MANAGE), deleteDocument);

export default router;

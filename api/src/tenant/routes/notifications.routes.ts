import { Router } from 'express';
import { authMiddleware } from '../../middleware/auth';
import { tenantMiddleware } from '../../middleware/tenant';
import { listNotifications, markNotificationRead } from '../controllers/notifications/notifications.controller';

const router = Router();

router.use(authMiddleware, tenantMiddleware);

router.get('/', listNotifications);
router.post('/:id/read', markNotificationRead);

export default router;

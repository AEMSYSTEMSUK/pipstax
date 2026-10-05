import { Router } from 'express';
import { authMiddleware } from '../../middleware/auth';
import { tenantMiddleware } from '../../middleware/tenant';
import { getBoardColumnOrder, updateBoardColumnOrder } from '../controllers/ui-preferences.controller';

const router = Router();

router.use(authMiddleware, tenantMiddleware);

router.get('/board-columns', getBoardColumnOrder);
router.put('/board-columns', updateBoardColumnOrder);

export default router;

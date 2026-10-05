import { Router } from 'express';
import { authMiddleware } from '../../middleware/auth';
import { listMyTasks, updateMyTaskStatus } from '../controllers/leads/my-tasks.controller';

const router = Router();

router.use(authMiddleware);

router.get('/', listMyTasks);
router.put('/:taskId/status', updateMyTaskStatus);

export default router;

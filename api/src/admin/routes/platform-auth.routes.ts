import { Router } from 'express';
import { platformLogin } from '../controllers/platform-auth.controller';

const router = Router();

router.post('/login', platformLogin);

export default router;

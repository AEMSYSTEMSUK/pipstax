import { Router } from 'express';
import { validateBody } from '../../middleware/validate';
import { CustomerInviteAcceptDto } from '../dto/customer-invite.dto';
import { getInvite, acceptInvite } from '../controllers/customers/customer-invites.controller';
import { tenantMiddleware } from '../../middleware/tenant';

const router = Router();

router.use(tenantMiddleware);

router.get('/:token', getInvite);
router.post('/accept', validateBody(CustomerInviteAcceptDto), acceptInvite);

export default router;

import { Router } from 'express';
import { validateBody } from '../../middleware/validate';
import { CustomerForgotPasswordDto, CustomerLoginDto, CustomerResetPasswordDto, CustomerSelectTenantDto } from '../dto/customer-invite.dto';
import { customerForgotPassword, customerLogin, customerResetPassword, selectCustomerTenant } from '../controllers/customers/customer-auth.controller';
import { tenantMiddleware } from '../../middleware/tenant';

const router = Router();

router.use(tenantMiddleware);

router.post('/login', validateBody(CustomerLoginDto), customerLogin);
router.post('/select-tenant', validateBody(CustomerSelectTenantDto), selectCustomerTenant);
router.post('/forgot-password', validateBody(CustomerForgotPasswordDto), customerForgotPassword);
router.post('/reset-password', validateBody(CustomerResetPasswordDto), customerResetPassword);

export default router;

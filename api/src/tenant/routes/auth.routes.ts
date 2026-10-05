import { Router } from 'express';
import {
  bootstrapTenant,
  commonLogin,
  selectTenant,
  verifyAccountOtp,
  resendAccountOtp,
  forgotPassword,
  resetPasswordWithToken
} from '../controllers/auth/auth.controller';
import { validateBody } from '../../middleware/validate';
import { tenantMiddleware } from '../../middleware/tenant';
import {
  BootstrapTenantDto,
  CommonLoginDto,
  SelectTenantDto,
  VerifyAccountOtpDto,
  ResendAccountOtpDto,
  ForgotPasswordDto,
  ResetPasswordDto
} from '../dto/auth.dto';

const router = Router();

router.post('/bootstrap', validateBody(BootstrapTenantDto), bootstrapTenant);
router.post('/common-login', tenantMiddleware, validateBody(CommonLoginDto), commonLogin);
router.post('/select-tenant', tenantMiddleware, validateBody(SelectTenantDto), selectTenant);
router.post('/verify-account-otp', tenantMiddleware, validateBody(VerifyAccountOtpDto), verifyAccountOtp);
router.post('/resend-account-otp', tenantMiddleware, validateBody(ResendAccountOtpDto), resendAccountOtp);
router.post('/forgot-password', tenantMiddleware, validateBody(ForgotPasswordDto), forgotPassword);
router.post('/reset-password', tenantMiddleware, validateBody(ResetPasswordDto), resetPasswordWithToken);

export default router;

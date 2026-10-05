import { Router } from 'express';
import {
  getPublicQuote,
  signPublicQuote,
  requestPublicQuoteSignOtp,
  resendPublicQuoteSignOtp,
  verifyPublicQuoteSignOtp,
  declinePublicQuote,
  downloadPublicQuotePdf
} from '../controllers/public/quotes.public.controller';
import { getPublicTenant } from '../controllers/public/tenant.public.controller';
import { validateBody } from '../../middleware/validate';
import {
  QuoteSignDto,
  RequestQuoteSignOtpDto,
  ResendQuoteSignOtpDto,
  VerifyQuoteSignOtpDto,
} from '../dto/quote-sign.dto';
import { tenantMiddleware } from '../../middleware/tenant';

const router = Router();

router.get('/tenant/:subdomain', getPublicTenant);
router.use(tenantMiddleware);
router.get('/quotes/:token', getPublicQuote);
router.get('/quotes/:token/pdf', downloadPublicQuotePdf);
router.post('/quotes/:token/sign/request-otp', validateBody(RequestQuoteSignOtpDto), requestPublicQuoteSignOtp);
router.post('/quotes/:token/sign/resend-otp', validateBody(ResendQuoteSignOtpDto), resendPublicQuoteSignOtp);
router.post('/quotes/:token/sign/verify-otp', validateBody(VerifyQuoteSignOtpDto), verifyPublicQuoteSignOtp);
router.post('/quotes/:token/sign', validateBody(QuoteSignDto), signPublicQuote);
router.post('/quotes/:token/decline', declinePublicQuote);

export default router;

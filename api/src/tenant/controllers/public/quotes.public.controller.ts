import { Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { IsNull } from 'typeorm';
import { AppDataSource } from '../../../config/data-source';
import { Quote } from '../../../entities/quote.entity';
import { Tenant } from '../../../entities/tenant.entity';
import { Customer } from '../../../entities/customer.entity';
import { CustomerAccountTenant } from '../../../entities/customer-account-tenant.entity';
import { CustomerInvite } from '../../../entities/customer-invite.entity';
import { Account } from '../../../entities/account.entity';
import { Lead } from '../../../entities/lead.entity';
import { LeadActivity } from '../../../entities/lead-activity.entity';
import { QuoteSignVerification } from '../../../entities/quote-sign-verification.entity';
import { User } from '../../../entities/user.entity';
import { BadRequestError, NotFoundError, UnauthorizedError } from '../../../utils/errors';
import { QuoteStatus } from '../../../constants/status';
import { LeadStatus } from '../../../constants/status';
import { buildQuotePdf } from '../../../services/quotes.service';
import { ensureQuoteNumber } from '../../../services/document-number.service';
import { expireQuoteIfNeeded, isQuoteExpired } from '../../../services/quote-expiry.service';
import {
  sendCustomerOnboardingEmail,
  sendTenantQuoteSignedEmail,
  sendQuoteSigningOtpEmail,
} from '../../../services/notifications.service';
import { resolveStoredFileUrl } from '../../../services/storage/storage.service';
import { resolveTenantAppUrl } from '../../../utils/tenant-url';
import { withAuthDetails } from '../../../utils/auth-details';
import { normalizeTenantFeatureFlags } from '../../../services/tenant-features.service';
import {
  DEFAULT_TENANT_WORKFLOW_CONFIG,
  getWorkflowDisplayState,
  loadTenantWorkflowConfig,
  resolveWorkflowStageKeyForRecord,
} from '../../../services/workflow-config.service';

const OTP_EXPIRES_MS = 10 * 60 * 1000;
const OTP_RESEND_COOLDOWN_MS = 60 * 1000;
const OTP_MAX_ATTEMPTS = 5;
const OTP_MAX_SENDS = 5;
const OTP_WINDOW_MS = 15 * 60 * 1000;
const OTP_MAX_REQUESTS_PER_WINDOW = 5;

const buildCustomerLoginLink = (tenantId: string, quoteId: string) =>
  resolveTenantAppUrl(
    tenantId,
    `/customer/login?next=${encodeURIComponent(`/portal/quotes/${quoteId}`)}`,
  );

const buildCustomerInviteLink = (tenantId: string, token: string, nextPath?: string) => {
  const safeNextPath =
    typeof nextPath === 'string' && nextPath.startsWith('/portal') ? nextPath : undefined;
  const nextParam = safeNextPath ? `&next=${encodeURIComponent(safeNextPath)}` : '';
  return resolveTenantAppUrl(
    tenantId,
    `/customer/invite?token=${encodeURIComponent(token)}${nextParam}`,
  );
};

const findByToken = async (token: string, tenantId?: string) => {
  const repo = AppDataSource.getRepository(Quote);
  return repo.findOne({
    where: tenantId
      ? { publicToken: token, tenantId, isDeleted: false }
      : { publicToken: token, isDeleted: false },
  });
};

const normalizeEmail = (value?: string | null) =>
  String(value ?? '').trim().toLowerCase();

const getQuoteContext = async (quote: Quote) => {
  const tenantRepo = AppDataSource.getRepository(Tenant);
  const customerRepo = AppDataSource.getRepository(Customer);
  const leadRepo = AppDataSource.getRepository(Lead);
  const [tenant, customer, lead] = await Promise.all([
    tenantRepo.findOne({ where: { id: quote.tenantId, isDeleted: false } }),
    quote.customerId
      ? customerRepo.findOne({
          where: { id: quote.customerId, tenantId: quote.tenantId, isDeleted: false },
        })
      : Promise.resolve(null),
    quote.leadId
      ? leadRepo.findOne({
          where: { id: quote.leadId, tenantId: quote.tenantId, isDeleted: false },
        })
      : Promise.resolve(null),
  ]);
  return { tenant, customer, lead };
};

const getQuoteRecipient = (quote: Quote, context: Awaited<ReturnType<typeof getQuoteContext>>) => {
  const email = normalizeEmail(quote.recipientEmail ?? context.customer?.email ?? context.lead?.email);
  const name = quote.recipientName ?? context.customer?.name ?? context.lead?.name ?? null;
  const phone = quote.recipientPhone ?? context.customer?.phone ?? context.lead?.phone ?? null;
  return { email, name, phone };
};

const isWorkflowOverlayEnabled = async (tenantId: string) => {
  const tenant = await AppDataSource.getRepository(Tenant).findOne({
    where: { id: tenantId, isDeleted: false },
    select: ['id', 'featureFlags'],
  });
  if (!tenant) {
    return false;
  }
  return normalizeTenantFeatureFlags(tenant.featureFlags).complianceWorkflows;
};

const getQuotePortalAccess = async (
  quote: Quote,
  context: Awaited<ReturnType<typeof getQuoteContext>>,
): Promise<{ isOnboarded: boolean; loginLink: string }> => {
  const recipient = getQuoteRecipient(quote, context);
  const email = normalizeEmail(quote.signedByEmail ?? recipient.email);
  const loginLink = await buildCustomerLoginLink(quote.tenantId, quote.id);
  if (!email) {
    return { isOnboarded: false, loginLink };
  }

  const customerRepo = AppDataSource.getRepository(Customer);
  const customerAccountTenantRepo = AppDataSource.getRepository(CustomerAccountTenant);
  const customer = await customerRepo
    .createQueryBuilder('customer')
    .where('customer.tenantId = :tenantId', { tenantId: quote.tenantId })
    .andWhere('customer.isDeleted = false')
    .andWhere('LOWER(customer.email) = :email', { email })
    .orderBy('customer.createdAt', 'DESC')
    .getOne();
  if (!customer) {
    return { isOnboarded: false, loginLink };
  }

  const linked = await customerAccountTenantRepo.findOne({
    where: {
      tenantId: quote.tenantId,
      customerId: customer.id,
      isDeleted: false,
    },
  });

  return { isOnboarded: Boolean(linked), loginLink };
};

const toPublicQuotePayload = async (quote: Quote) => {
  const context = await getQuoteContext(quote);
  const { tenant } = context;
  const recipient = getQuoteRecipient(quote, context);
  const portalAccess = await getQuotePortalAccess(quote, context);
  const workflowEnabled = await isWorkflowOverlayEnabled(quote.tenantId);
  const workflowConfig = workflowEnabled ? await loadTenantWorkflowConfig(quote.tenantId) : null;
  return {
    ...quote,
    customerName: recipient.name,
    customerEmail: recipient.email || null,
    customerPhone: recipient.phone,
    portalAccess,
    ...getWorkflowDisplayState({
      config: workflowConfig ?? DEFAULT_TENANT_WORKFLOW_CONFIG,
      module: 'quotes',
      baseStatus: quote.status,
      workflowStageKey: quote.workflowStageKey,
      enabled: workflowEnabled,
    }),
    tenantProfile: tenant
      ? {
          id: tenant.id,
          name: tenant.name,
          tradingName: tenant.tradingName,
          logoUrl: resolveStoredFileUrl(tenant.logoUrl),
          address: tenant.address,
          contactEmail: tenant.contactEmail,
          contactPhone: tenant.contactPhone,
          vatNumber: tenant.vatNumber,
          primaryColor: tenant.primaryColor,
        }
      : null,
  };
};

const markLeadAsWonForQuote = async (quote: Quote, source: 'portal' | 'public-link') => {
  if (!quote.leadId) return;
  const leadRepo = AppDataSource.getRepository(Lead);
  const leadActivityRepo = AppDataSource.getRepository(LeadActivity);
  const lead = await leadRepo.findOne({
    where: { id: quote.leadId, tenantId: quote.tenantId, isDeleted: false },
  });
  if (!lead) return;

  const previousLeadStatus = lead.status;
  if (lead.status !== LeadStatus.CONVERTED) {
    lead.status = LeadStatus.CONVERTED;
    await leadRepo.save(lead);
  }

  await leadActivityRepo.save(
    leadActivityRepo.create({
      leadId: lead.id,
      tenantId: quote.tenantId,
      type: 'Quote Accepted',
      message:
        source === 'public-link'
          ? `Quote "${quote.title}" signed by customer via secure public link.`
          : `Quote "${quote.title}" signed by customer via portal.`,
      metadata: {
        quoteId: quote.id,
        quoteStatus: quote.status,
        signedByEmail: quote.signedByEmail ?? null,
        from: previousLeadStatus,
        to: lead.status,
        source,
      },
    }),
  );
};

const finalizeSignedQuote = async (params: {
  quote: Quote;
  fullName: string;
  email: string;
  signatureData: string;
  ip?: string;
  source: 'portal' | 'public-link';
}) => {
  const quoteRepo = AppDataSource.getRepository(Quote);
  const previousStatus = params.quote.status;
  params.quote.status = QuoteStatus.SIGNED;
  params.quote.signedAt = new Date();
  params.quote.signedByName = params.fullName.trim();
  params.quote.signedByEmail = normalizeEmail(params.email);
  params.quote.recipientName = params.quote.recipientName ?? params.fullName.trim();
  params.quote.recipientEmail = params.quote.recipientEmail ?? normalizeEmail(params.email);
  params.quote.signatureData = params.signatureData;
  params.quote.signatureIp = params.ip;
  params.quote.workflowStageKey = await resolveWorkflowStageKeyForRecord({
    tenantId: params.quote.tenantId,
    module: 'quotes',
    baseStatus: params.quote.status,
    currentStageKey: params.quote.workflowStageKey,
    featureEnabled: await isWorkflowOverlayEnabled(params.quote.tenantId),
  });
  await quoteRepo.save(params.quote);

  if (previousStatus !== QuoteStatus.SIGNED) {
    await markLeadAsWonForQuote(params.quote, params.source);
  }
  return params.quote;
};

const sendPublicQuoteOtp = async (params: {
  quote: Quote;
  recipientEmail: string;
  fullName: string;
  email: string;
  signatureData: string;
  ip?: string;
}) => {
  const verificationRepo = AppDataSource.getRepository(QuoteSignVerification);
  const now = Date.now();
  const email = normalizeEmail(params.email);
  const fullName = params.fullName.trim();
  const signatureData = String(params.signatureData ?? '').trim();

  if (!fullName) {
    throw new BadRequestError('Full name is required');
  }
  if (!signatureData) {
    throw new BadRequestError('Signature is required');
  }
  if (!email) {
    throw new BadRequestError('Email is required');
  }
  if (normalizeEmail(params.recipientEmail) !== email) {
    throw new UnauthorizedError('Email does not match quote recipient');
  }

  const recentCount = await verificationRepo
    .createQueryBuilder('verification')
    .where('verification.quoteId = :quoteId', { quoteId: params.quote.id })
    .andWhere('LOWER(verification.email) = :email', { email })
    .andWhere('verification.createdAt >= :since', {
      since: new Date(now - OTP_WINDOW_MS),
    })
    .andWhere('verification.isDeleted = false')
    .getCount();
  if (recentCount >= OTP_MAX_REQUESTS_PER_WINDOW) {
    throw new BadRequestError('Too many OTP requests. Please try again later.');
  }

  const existingActive = await verificationRepo.find({
    where: {
      quoteId: params.quote.id,
      email,
      verifiedAt: IsNull(),
      isDeleted: false,
    },
  });
  if (existingActive.length > 0) {
    for (const item of existingActive) {
      item.isDeleted = true;
    }
    await verificationRepo.save(existingActive);
  }

  const code = `${Math.floor(100000 + Math.random() * 900000)}`;
  const verification = verificationRepo.create({
    quoteId: params.quote.id,
    tenantId: params.quote.tenantId,
    email,
    fullName,
    signatureData,
    codeHash: await bcrypt.hash(code, 10),
    attempts: 0,
    sendCount: 1,
    expiresAt: new Date(now + OTP_EXPIRES_MS),
    lastSentAt: new Date(now),
    requestIp: params.ip,
  });
  await verificationRepo.save(verification);
  await sendQuoteSigningOtpEmail(
    email,
    code,
    {
      customerName: fullName,
      quoteTitle: params.quote.title,
      expiresMinutes: Math.floor(OTP_EXPIRES_MS / 60000),
    },
    { tenantId: params.quote.tenantId },
  );
  const payload = withAuthDetails(
    {
      requestId: verification.id,
      email,
      expiresAt: verification.expiresAt,
    },
    { devOtp: code },
  );
  return payload;
};

const sendOnboardingAfterSignIfNeeded = async (quote: Quote) => {
  const customerRepo = AppDataSource.getRepository(Customer);
  const customerInviteRepo = AppDataSource.getRepository(CustomerInvite);
  const accountRepo = AppDataSource.getRepository(Account);
  const context = await getQuoteContext(quote);
  const recipient = getQuoteRecipient(quote, context);
  const signedEmail = normalizeEmail(quote.signedByEmail ?? recipient.email);
  if (!signedEmail) return;

  // If already a customer of this tenant, do not send onboarding.
  const existingCustomer = await customerRepo
    .createQueryBuilder('customer')
    .where('customer.tenantId = :tenantId', { tenantId: quote.tenantId })
    .andWhere('customer.isDeleted = false')
    .andWhere('LOWER(customer.email) = :email', { email: signedEmail })
    .orderBy('customer.createdAt', 'DESC')
    .getOne();
  if (existingCustomer) {
    if (!quote.customerId) {
      quote.customerId = existingCustomer.id;
      await AppDataSource.getRepository(Quote).save(quote);
    }
    return;
  }

  const account = await accountRepo.findOne({ where: { email: signedEmail } });
  const existingPendingInvite = await customerInviteRepo.findOne({
    where: {
      tenantId: quote.tenantId,
      email: signedEmail,
      acceptedAt: IsNull(),
      isDeleted: false,
    },
    order: { createdAt: 'DESC' },
  });
  const invite =
    existingPendingInvite ??
    customerInviteRepo.create({
      tenantId: quote.tenantId,
      email: signedEmail,
      fullName:
        quote.signedByName?.trim() ||
        recipient.name?.trim() ||
        context.lead?.name?.trim() ||
        signedEmail.split('@')[0],
      token: crypto.randomBytes(24).toString('hex'),
      accountId: account?.id,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    });
  if (!existingPendingInvite) {
    await customerInviteRepo.save(invite);
  }

  await sendCustomerOnboardingEmail(
    signedEmail,
    {
      customerName: invite.fullName ?? recipient.name ?? 'Customer',
      onboardingLink: await buildCustomerInviteLink(
        quote.tenantId,
        invite.token,
        `/portal/quotes/${quote.id}`,
      ),
      loginLink: await buildCustomerLoginLink(quote.tenantId, quote.id),
    },
    { tenantId: quote.tenantId },
  );
};

const notifyTenantAfterQuoteSigned = async (quote: Quote) => {
  const tenantRepo = AppDataSource.getRepository(Tenant);
  const userRepo = AppDataSource.getRepository(User);
  const tenant = await tenantRepo.findOne({
    where: { id: quote.tenantId, isDeleted: false },
  });
  const users = await userRepo.find({
    where: {
      tenantId: quote.tenantId,
      isDeleted: false,
      isActive: true,
    },
    relations: ['roles'],
  });

  const recipients = new Set<string>();
  const tenantContactEmail = normalizeEmail(tenant?.contactEmail);
  if (tenantContactEmail) {
    recipients.add(tenantContactEmail);
  }

  users.forEach((user) => {
    const email = normalizeEmail(user.email);
    if (!email) return;
    const hasAdminRole = Array.isArray(user.roles)
      ? user.roles.some((role) => String(role.code ?? '').toUpperCase() === 'ADMIN')
      : false;
    if (hasAdminRole) {
      recipients.add(email);
    }
  });

  if (recipients.size === 0) return;

  const viewLink = await resolveTenantAppUrl(quote.tenantId, `/admin/quotes/${quote.id}`);
  const signedAt = quote.signedAt ? quote.signedAt.toLocaleString() : new Date().toLocaleString();
  const toNotify = Array.from(recipients);
  await Promise.all(
    toNotify.map((recipient) =>
      sendTenantQuoteSignedEmail(
        recipient,
        {
          quoteTitle: quote.title,
          quoteNumber: quote.quoteNumber,
          signerName: quote.signedByName,
          signerEmail: quote.signedByEmail,
          signedAt,
          viewLink,
        },
        { tenantId: quote.tenantId },
      ),
    ),
  );
};

export const getPublicQuote = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const quoteRepo = AppDataSource.getRepository(Quote);
    const quote = await findByToken(req.params.token, req.tenantId);
    if (!quote) {
      throw new NotFoundError('Quote not found');
    }
    await expireQuoteIfNeeded(quoteRepo, quote);
    if (!quote.quoteNumber) {
      await ensureQuoteNumber(quote);
    }
    if (quote.status === QuoteStatus.SENT) {
      quote.status = QuoteStatus.VIEWED;
      quote.viewedAt = new Date();
      quote.workflowStageKey = await resolveWorkflowStageKeyForRecord({
        tenantId: quote.tenantId,
        module: 'quotes',
        baseStatus: quote.status,
        currentStageKey: quote.workflowStageKey,
        featureEnabled: await isWorkflowOverlayEnabled(quote.tenantId),
      });
      await AppDataSource.getRepository(Quote).save(quote);
    }
    res.deliver(200, true, await toPublicQuotePayload(quote), 'Quote fetched');
  } catch (error) {
    next(error);
  }
};

export const requestPublicQuoteSignOtp = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const quoteRepo = AppDataSource.getRepository(Quote);
    const quote = await findByToken(req.params.token, req.tenantId);
    if (!quote) {
      throw new NotFoundError('Quote not found');
    }
    await expireQuoteIfNeeded(quoteRepo, quote);
    if (isQuoteExpired(quote)) {
      throw new BadRequestError('Quote has expired and can no longer be signed.');
    }
    if (quote.status === QuoteStatus.SIGNED) {
      throw new BadRequestError('Quote is already signed.');
    }
    if (!quote.quoteNumber) {
      await ensureQuoteNumber(quote);
    }

    const recipient = getQuoteRecipient(quote, await getQuoteContext(quote));
    if (!recipient.email) {
      throw new BadRequestError('Quote recipient email is missing.');
    }

    const payload = await sendPublicQuoteOtp({
      quote,
      recipientEmail: recipient.email,
      fullName: req.body.fullName,
      email: req.body.email,
      signatureData: req.body.signatureData,
      ip: req.ip,
    });

    res.deliver(200, true, payload, 'Verification code sent');
  } catch (error) {
    next(error);
  }
};

export const resendPublicQuoteSignOtp = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const quote = await findByToken(req.params.token, req.tenantId);
    if (!quote) {
      throw new NotFoundError('Quote not found');
    }
    if (quote.status === QuoteStatus.SIGNED) {
      throw new BadRequestError('Quote is already signed.');
    }

    const verificationRepo = AppDataSource.getRepository(QuoteSignVerification);
    const verification = await verificationRepo.findOne({
      where: {
        id: req.body.requestId,
        quoteId: quote.id,
        verifiedAt: IsNull(),
        isDeleted: false,
      },
    });
    if (!verification) {
      throw new BadRequestError('Verification request not found');
    }
    if (verification.sendCount >= OTP_MAX_SENDS) {
      throw new BadRequestError('Too many OTP requests. Please try again later.');
    }
    const lastSentAtTs = verification.lastSentAt?.getTime() ?? verification.createdAt.getTime();
    const cooldownRemaining = OTP_RESEND_COOLDOWN_MS - (Date.now() - lastSentAtTs);
    if (cooldownRemaining > 0) {
      throw new BadRequestError(
        `Please wait ${Math.ceil(cooldownRemaining / 1000)}s before resending OTP.`,
      );
    }

    const code = `${Math.floor(100000 + Math.random() * 900000)}`;
    verification.codeHash = await bcrypt.hash(code, 10);
    verification.expiresAt = new Date(Date.now() + OTP_EXPIRES_MS);
    verification.attempts = 0;
    verification.sendCount += 1;
    verification.lastSentAt = new Date();
    verification.requestIp = req.ip;
    await verificationRepo.save(verification);

    await sendQuoteSigningOtpEmail(
      verification.email,
      code,
      {
        customerName: verification.fullName,
        quoteTitle: quote.title,
        expiresMinutes: Math.floor(OTP_EXPIRES_MS / 60000),
      },
      { tenantId: quote.tenantId },
    );

    const payload = withAuthDetails(
      {
        requestId: verification.id,
        email: verification.email,
        expiresAt: verification.expiresAt,
      },
      { devOtp: code },
    );
    res.deliver(200, true, payload, 'Verification code resent');
  } catch (error) {
    next(error);
  }
};

export const verifyPublicQuoteSignOtp = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const quoteRepo = AppDataSource.getRepository(Quote);
    const verificationRepo = AppDataSource.getRepository(QuoteSignVerification);
    const quote = await findByToken(req.params.token, req.tenantId);
    if (!quote) {
      throw new NotFoundError('Quote not found');
    }
    await expireQuoteIfNeeded(quoteRepo, quote);
    if (isQuoteExpired(quote)) {
      throw new BadRequestError('Quote has expired and can no longer be signed.');
    }

    const verification = await verificationRepo.findOne({
      where: {
        id: req.body.requestId,
        quoteId: quote.id,
        verifiedAt: IsNull(),
        isDeleted: false,
      },
    });
    if (!verification) {
      throw new UnauthorizedError('OTP request not found');
    }
    if (verification.attempts >= OTP_MAX_ATTEMPTS) {
      throw new UnauthorizedError('Too many attempts. Please resend OTP.');
    }
    if (verification.expiresAt.getTime() < Date.now()) {
      throw new UnauthorizedError('OTP expired');
    }

    const ok = await bcrypt.compare(String(req.body.code), verification.codeHash);
    if (!ok) {
      verification.attempts += 1;
      await verificationRepo.save(verification);
      throw new UnauthorizedError('Invalid OTP');
    }

    verification.verifiedAt = new Date();
    await verificationRepo.save(verification);

    await finalizeSignedQuote({
      quote,
      fullName: verification.fullName,
      email: verification.email,
      signatureData: verification.signatureData,
      ip: req.ip,
      source: 'public-link',
    });
    await sendOnboardingAfterSignIfNeeded(quote);
    await notifyTenantAfterQuoteSigned(quote).catch(() => undefined);
    res.deliver(200, true, await toPublicQuotePayload(quote), 'Quote signed');
  } catch (error) {
    next(error);
  }
};

export const signPublicQuote = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const quoteRepo = AppDataSource.getRepository(Quote);
    const quote = await findByToken(req.params.token, req.tenantId);
    if (!quote) {
      throw new NotFoundError('Quote not found');
    }
    await expireQuoteIfNeeded(quoteRepo, quote);
    if (isQuoteExpired(quote)) {
      throw new BadRequestError('Quote has expired and can no longer be signed.');
    }
    if (!quote.quoteNumber) {
      await ensureQuoteNumber(quote);
    }
    await finalizeSignedQuote({
      quote,
      fullName: req.body.fullName,
      email: req.body.email,
      signatureData: req.body.signatureData,
      ip: req.ip,
      source: 'portal',
    });
    await sendOnboardingAfterSignIfNeeded(quote);
    await notifyTenantAfterQuoteSigned(quote).catch(() => undefined);
    res.deliver(200, true, await toPublicQuotePayload(quote), 'Quote signed');
  } catch (error) {
    next(error);
  }
};

export const declinePublicQuote = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const quote = await findByToken(req.params.token, req.tenantId);
    if (!quote) {
      throw new NotFoundError('Quote not found');
    }
    if (!quote.quoteNumber) {
      await ensureQuoteNumber(quote);
    }
    quote.status = QuoteStatus.DECLINED;
    quote.declinedAt = new Date();
    quote.workflowStageKey = await resolveWorkflowStageKeyForRecord({
      tenantId: quote.tenantId,
      module: 'quotes',
      baseStatus: quote.status,
      currentStageKey: quote.workflowStageKey,
      featureEnabled: await isWorkflowOverlayEnabled(quote.tenantId),
    });
    await AppDataSource.getRepository(Quote).save(quote);
    res.deliver(200, true, await toPublicQuotePayload(quote), 'Quote declined');
  } catch (error) {
    next(error);
  }
};

export const downloadPublicQuotePdf = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const quote = await findByToken(req.params.token, req.tenantId);
    if (!quote) {
      throw new NotFoundError('Quote not found');
    }
    if (!quote.quoteNumber) {
      await ensureQuoteNumber(quote);
    }
    const tenant = await AppDataSource.getRepository(Tenant).findOne({
      where: { id: quote.tenantId, isDeleted: false },
    });
    if (!tenant) {
      throw new NotFoundError('Tenant not found');
    }
    const customer = quote.customerId
      ? await AppDataSource.getRepository(Customer).findOne({
          where: { id: quote.customerId, tenantId: quote.tenantId, isDeleted: false },
        })
      : null;
    const pdf = await buildQuotePdf(quote, tenant, customer);
    res.setHeader('Content-Type', 'application/pdf');
    const filenameRef = quote.quoteNumber ?? quote.id;
    res.setHeader('Content-Disposition', `inline; filename=quote-${filenameRef}.pdf`);
    res.status(200).send(pdf);
  } catch (error) {
    next(error);
  }
};

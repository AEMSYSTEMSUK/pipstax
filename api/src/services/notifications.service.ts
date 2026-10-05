import { AppDataSource } from '../config/data-source';
import { env } from '../config/env';
import { Tenant } from '../entities/tenant.entity';
import { sendEmail } from './mailer.service';
import { resolveStoredFileUrl } from './storage/storage.service';

export type EmailContext = {
  tenantId?: string;
  tenant?: Tenant | null;
  fromType?: 'auth' | 'tenant';
};

const normalizeDomain = (value: string) =>
  value.replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/:\d+$/, '');

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');

const resolveBrandColor = (tenant?: Tenant | null) => {
  const color = tenant?.primaryColor?.trim();
  return color && /^#[0-9a-f]{6}$/i.test(color) ? color : '#0f8b8d';
};

const renderFooterDetail = (label: string, value?: string | null) =>
  value?.trim()
    ? `<span style="display:inline-block; margin:0 10px 6px 0;"><strong>${escapeHtml(label)}:</strong> ${escapeHtml(value.trim())}</span>`
    : '';

const resolveTenant = async (context?: EmailContext) => {
  if (context?.tenant) {
    return context.tenant;
  }
  if (!context?.tenantId) {
    return null;
  }
  const repo = AppDataSource.getRepository(Tenant);
  return repo.findOne({ where: { id: context.tenantId, isDeleted: false } });
};

type ResolvedSender = {
  fromEmail: string;
  replyTo?: string;
  fromName: string;
  tenant?: Tenant | null;
};

const resolveFromAddress = async (context?: EmailContext) => {
  const mainDomain = normalizeDomain(env.mail.fromDomain ?? env.tenantBaseDomain ?? env.appUrl);
  const defaultSender = env.mail.fromEmail ?? env.mail.user;
  const useDynamicFrom = env.mail.allowDynamicFrom;
  if (context?.fromType === 'auth') {
    const authAddress = `no-reply@${mainDomain}`;
    return {
      fromEmail: useDynamicFrom ? authAddress : defaultSender ?? authAddress,
      replyTo: undefined,
      fromName: env.mail.fromName
    };
  }
  const tenant = await resolveTenant(context);
  const subdomain = tenant?.subdomain?.trim();
  const tenantDomain = subdomain ? `${subdomain}.${mainDomain}` : mainDomain;
  const tenantAddress = `no-reply@${tenantDomain}`;
  return {
    fromEmail: useDynamicFrom ? tenantAddress : defaultSender ?? tenantAddress,
    replyTo: tenant?.contactEmail?.trim() || undefined,
    fromName: tenant?.tradingName ?? tenant?.name ?? env.mail.fromName,
    tenant
  } satisfies ResolvedSender;
};

const wrapTenantEmailHtml = (bodyHtml: string, tenant?: Tenant | null) => {
  const logoRef = tenant?.emailHeaderLogoUrl ?? tenant?.logoUrl;
  const logoUrl = resolveStoredFileUrl(logoRef);
  const brandName = tenant?.tradingName ?? tenant?.name ?? env.mail.fromName ?? 'AEM Systems';
  const brandInitial = escapeHtml(brandName.trim().charAt(0).toUpperCase() || 'A');
  const brandColor = resolveBrandColor(tenant);
  const alt = escapeHtml(brandName);
  const header = logoUrl
    ? `
      <img src="${escapeHtml(logoUrl)}" alt="${alt}" style="display:block; max-height:52px; max-width:220px; width:auto; height:auto;" />
    `
    : `
      <div style="display:inline-block; width:48px; height:48px; border-radius:14px; background:${brandColor}; color:#ffffff; text-align:center; line-height:48px; font-size:20px; font-weight:700;">
        ${brandInitial}
      </div>
    `;
  const footerDetails = [
    renderFooterDetail('Email', tenant?.contactEmail),
    renderFooterDetail('Phone', tenant?.contactPhone),
    renderFooterDetail('Address', tenant?.address),
  ]
    .filter(Boolean)
    .join('');

  return `
    <!doctype html>
    <html>
      <head>
        <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>${alt}</title>
      </head>
      <body style="margin:0; padding:0; background:#f3f7f6; font-family:Arial, Helvetica, sans-serif; color:#17202a;">
        <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="width:100%; background:#f3f7f6; margin:0; padding:0;">
          <tr>
            <td align="center" style="padding:28px 14px;">
              <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="width:100%; max-width:640px; border-collapse:collapse;">
                <tr>
                  <td style="padding:0 0 14px 0;">
                    <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
                      <tr>
                        <td align="left" style="vertical-align:middle;">${header}</td>
                        <td align="right" style="vertical-align:middle; color:#64748b; font-size:13px; font-weight:600;">${escapeHtml(brandName)}</td>
                      </tr>
                    </table>
                  </td>
                </tr>
                <tr>
                  <td style="background:#ffffff; border:1px solid #dce8e5; border-radius:18px; box-shadow:0 18px 45px rgba(15, 23, 42, 0.08); overflow:hidden;">
                    <div style="height:6px; background:${brandColor}; line-height:6px; font-size:0;">&nbsp;</div>
                    <div style="padding:30px 30px 28px 30px; color:#17202a; font-size:15px; line-height:1.65;">
                      ${bodyHtml}
                    </div>
                  </td>
                </tr>
                <tr>
                  <td style="padding:18px 4px 0 4px; color:#64748b; font-size:12px; line-height:1.6;">
                    <div style="font-weight:700; color:#334155; margin-bottom:4px;">${escapeHtml(brandName)}</div>
                    ${footerDetails ? `<div>${footerDetails}</div>` : ''}
                    <div style="margin-top:8px;">This email was sent automatically. If anything looks incorrect, please reply to this email or contact your office team.</div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </body>
    </html>
  `;
};

const splitSender = (sender: ResolvedSender) => {
  const { tenant, ...from } = sender;
  return { tenant, from };
};

const tenantMailPayload = async (
  input: {
    to: string;
    subject: string;
    text: string;
    bodyHtml: string;
  },
  context?: EmailContext,
) => {
  const sender = await resolveFromAddress(context);
  const { tenant, from } = splitSender(sender);
  return {
    ...from,
    to: input.to,
    subject: input.subject,
    text: input.text,
    html: wrapTenantEmailHtml(input.bodyHtml, tenant),
  };
};

export const sendTicketReplyEmail = async (
  to: string,
  subject: string,
  message: string,
  context?: EmailContext
) => {
  const payload = await tenantMailPayload(
    {
      to,
      subject: `Support Reply: ${subject}`,
      text: message,
      bodyHtml: `<p>${escapeHtml(message)}</p>`,
    },
    context,
  );
  return sendEmail(payload);
};

export const sendQuoteEmail = async (
  to: string,
  link: string,
  options?: {
    customerName?: string;
    quoteTitle?: string;
    message?: string;
  },
  context?: EmailContext,
) => {
  const safeLink = link?.trim() || '#';
  const escapedLink = escapeHtml(safeLink);
  const greetingName = options?.customerName?.trim() ? escapeHtml(options.customerName.trim()) : 'there';
  const quoteTitle = options?.quoteTitle?.trim() ? escapeHtml(options.quoteTitle.trim()) : 'your quote';
  const customMessage = options?.message?.trim();
  const customMessageText = customMessage ? `${customMessage}\n` : '';
  const customMessageHtml = customMessage
    ? `<p style="white-space: pre-line;">${escapeHtml(customMessage)}</p>`
    : '';
  const payload = await tenantMailPayload(
    {
      to,
      subject: 'Your Quote Is Ready',
      text: [
        `Hi ${options?.customerName?.trim() || 'there'},`,
        customMessageText,
        `${options?.quoteTitle?.trim() || 'Your quote'} is ready.`,
        `View quote: ${safeLink}`,
        'You can review the quote directly from this secure link.',
      ]
        .filter(Boolean)
        .join('\n'),
      bodyHtml: `
        <p>Hi ${greetingName},</p>
        ${customMessageHtml}
        <p>Great news — <strong>${quoteTitle}</strong> is now ready for your review.</p>
        <p>
          <a
            href="${escapedLink}"
            target="_blank"
            rel="noopener noreferrer"
            style="display: inline-block; background: #0f8b8d; color: #ffffff; text-decoration: none; padding: 10px 18px; border-radius: 8px; font-weight: 600;"
          >
            View Quote
          </a>
        </p>
        <p>When you accept and sign this quote, we will verify your identity using a one-time code.</p>
        <p style="margin-top: 16px;">If you have any questions, simply reply to this email and our team will help right away.</p>
      `,
    },
    context,
  );
  return sendEmail(payload);
};

export const sendQuoteSigningOtpEmail = async (
  to: string,
  code: string,
  details: {
    customerName?: string;
    quoteTitle?: string;
    expiresMinutes?: number;
  },
  context?: EmailContext,
) => {
  const greetingName = details.customerName?.trim()
    ? escapeHtml(details.customerName.trim())
    : 'there';
  const quoteTitle = details.quoteTitle?.trim()
    ? escapeHtml(details.quoteTitle.trim())
    : 'your quote';
  const expiresMinutes = Number.isFinite(details.expiresMinutes)
    ? Math.max(1, Math.round(details.expiresMinutes as number))
    : 10;

  const payload = await tenantMailPayload(
    {
      to,
      subject: 'Your Quote Verification Code',
      text: [
        `Hi ${details.customerName?.trim() || 'there'},`,
        `Use this one-time code to complete signing for ${details.quoteTitle?.trim() || 'your quote'}: ${code}`,
        `This code expires in ${expiresMinutes} minutes.`,
      ].join('\n'),
      bodyHtml: `
        <p>Hi ${greetingName},</p>
        <p>Use the one-time verification code below to complete signing for <strong>${quoteTitle}</strong>.</p>
        <div style="margin: 16px 0; display: inline-block; font-size: 24px; letter-spacing: 6px; font-weight: 700; color: #0f172a; background: #ecfeff; border: 1px solid #a5f3fc; border-radius: 10px; padding: 10px 16px;">
          ${escapeHtml(code)}
        </div>
        <p style="margin: 0; font-size: 13px; color: #4b5563;">This code expires in ${expiresMinutes} minutes.</p>
      `,
    },
    context,
  );
  return sendEmail(payload);
};

export const sendTenantQuoteSignedEmail = async (
  to: string,
  details: {
    quoteTitle?: string;
    quoteNumber?: string;
    signerName?: string;
    signerEmail?: string;
    signedAt?: string;
    viewLink?: string;
  },
  context?: EmailContext,
) => {
  const quoteTitle = details.quoteTitle?.trim()
    ? escapeHtml(details.quoteTitle.trim())
    : 'Quote';
  const quoteNumber = details.quoteNumber?.trim()
    ? escapeHtml(details.quoteNumber.trim())
    : 'N/A';
  const signerName = details.signerName?.trim()
    ? escapeHtml(details.signerName.trim())
    : 'Customer';
  const signerEmail = details.signerEmail?.trim()
    ? escapeHtml(details.signerEmail.trim())
    : 'N/A';
  const signedAt = details.signedAt?.trim() ? escapeHtml(details.signedAt.trim()) : 'N/A';
  const safeViewLink = details.viewLink?.trim() || '';
  const escapedViewLink = escapeHtml(safeViewLink);

  const payload = await tenantMailPayload(
    {
      to,
      subject: `Quote Signed: ${details.quoteNumber?.trim() || details.quoteTitle?.trim() || 'Quote'}`,
      text: [
        'A quote has been signed by the customer.',
        `Quote: ${details.quoteTitle?.trim() || 'Quote'}`,
        `Reference: ${details.quoteNumber?.trim() || 'N/A'}`,
        `Signed by: ${details.signerName?.trim() || 'Customer'} (${details.signerEmail?.trim() || 'N/A'})`,
        `Signed at: ${details.signedAt?.trim() || 'N/A'}`,
        safeViewLink ? `View quote: ${safeViewLink}` : '',
      ]
        .filter(Boolean)
        .join('\n'),
      bodyHtml: `
        <p>A quote has been signed by the customer.</p>
        <p><strong>Quote:</strong> ${quoteTitle}</p>
        <p><strong>Reference:</strong> ${quoteNumber}</p>
        <p><strong>Signed by:</strong> ${signerName} (${signerEmail})</p>
        <p><strong>Signed at:</strong> ${signedAt}</p>
        ${
          safeViewLink
            ? `<p style="margin-top: 14px;"><a href="${escapedViewLink}" target="_blank" rel="noopener noreferrer">Open quote in CRM</a></p>`
            : ''
        }
      `,
    },
    context,
  );
  return sendEmail(payload);
};

export const sendCustomerOnboardingEmail = async (
  to: string,
  details: {
    customerName?: string;
    onboardingLink: string;
    loginLink?: string;
  },
  context?: EmailContext,
) => {
  const greetingName = details.customerName?.trim()
    ? escapeHtml(details.customerName.trim())
    : 'there';
  const safeOnboardingLink = details.onboardingLink?.trim() || '#';
  const escapedOnboardingLink = escapeHtml(safeOnboardingLink);
  const safeLoginLink = details.loginLink?.trim() || '';
  const escapedLoginLink = safeLoginLink ? escapeHtml(safeLoginLink) : '';
  const payload = await tenantMailPayload(
    {
      to,
      subject: 'Complete Your Customer Portal Setup',
      text: [
        `Hi ${details.customerName?.trim() || 'there'},`,
        'Your quote has been signed successfully.',
        `Complete your customer portal setup: ${safeOnboardingLink}`,
        safeLoginLink ? `Existing portal login: ${safeLoginLink}` : '',
      ]
        .filter(Boolean)
        .join('\n'),
      bodyHtml: `
        <p>Hi ${greetingName},</p>
        <p>Your quote has been signed successfully.</p>
        <p>To track quotes, jobs, invoices, and support updates in your customer portal, complete onboarding below:</p>
        <p>
          <a
            href="${escapedOnboardingLink}"
            target="_blank"
            rel="noopener noreferrer"
            style="display: inline-block; background: #0f8b8d; color: #ffffff; text-decoration: none; padding: 10px 18px; border-radius: 8px; font-weight: 600;"
          >
            Complete Customer Onboarding
          </a>
        </p>
        ${
          safeLoginLink
            ? `<p style="margin-top: 10px; font-size: 13px;">Already onboarded? <a href="${escapedLoginLink}" target="_blank" rel="noopener noreferrer">Sign in here</a>.</p>`
            : ''
        }
      `,
    },
    context,
  );
  return sendEmail(payload);
};

export const sendLeadConvertedToJobEmail = async (
  to: string,
  details: {
    customerName?: string;
    leadName: string;
    jobTitle: string;
    loginLink?: string;
    onboardingLink?: string;
  },
  context?: EmailContext,
) => {
  const safeLoginLink = details.loginLink?.trim() || '';
  const safeOnboardingLink = details.onboardingLink?.trim() || '';
  const escapedLoginLink = safeLoginLink ? escapeHtml(safeLoginLink) : '';
  const escapedOnboardingLink = safeOnboardingLink ? escapeHtml(safeOnboardingLink) : '';
  const greetingName = details.customerName?.trim() ? escapeHtml(details.customerName.trim()) : 'there';
  const leadName = escapeHtml(details.leadName);
  const jobTitle = escapeHtml(details.jobTitle);

  const payload = await tenantMailPayload(
    {
      to,
      subject: 'Your Service Request Is Scheduled',
      text: [
        `Hi ${details.customerName?.trim() || 'there'},`,
        `Your lead "${details.leadName}" has been converted to a job: "${details.jobTitle}".`,
        safeOnboardingLink
          ? `Complete customer portal onboarding: ${safeOnboardingLink}`
          : safeLoginLink
            ? `Sign in to customer portal: ${safeLoginLink}`
            : '',
      ]
        .filter(Boolean)
        .join('\n'),
      bodyHtml: `
        <p>Hi ${greetingName},</p>
        <p>Your inquiry <strong>${leadName}</strong> has been progressed and a job has been created: <strong>${jobTitle}</strong>.</p>
        ${
          safeOnboardingLink
            ? `
              <p>To track this from your customer portal, please complete onboarding first:</p>
              <p><a href="${escapedOnboardingLink}" target="_blank" rel="noopener noreferrer">Complete Customer Portal Onboarding</a></p>
            `
            : safeLoginLink
              ? `
                <p>You can track updates from your customer portal:</p>
                <p><a href="${escapedLoginLink}" target="_blank" rel="noopener noreferrer">Sign In to Customer Portal</a></p>
              `
              : ''
        }
      `,
    },
    context,
  );
  return sendEmail(payload);
};

export const sendInvoiceEmail = async (
  to: string,
  link: string,
  context?: EmailContext,
  details?: { message?: string },
) => {
  const safeLink = link?.trim() || '#';
  const escapedLink = escapeHtml(safeLink);
  const message = details?.message?.trim() || 'Your invoice is ready.';
  const escapedMessage = escapeHtml(message).replace(/\n/g, '<br />');
  const payload = await tenantMailPayload(
    {
      to,
      subject: 'Your Invoice Is Ready',
      text: `${message}\n\nView it here: ${safeLink}`,
      bodyHtml: `<p>${escapedMessage}</p><p><a href="${escapedLink}">View Invoice</a></p>`,
    },
    context,
  );
  return sendEmail(payload);
};

export const sendOtpEmail = async (to: string, code: string) => {
  const payload = await tenantMailPayload(
    {
      to,
      subject: 'Your Verification Code',
      text: `Your verification code is ${code}.`,
      bodyHtml: `
        <h1 style="margin:0 0 12px 0; font-size:24px; line-height:1.25; color:#0f172a;">Your verification code</h1>
        <p style="margin:0 0 16px 0;">Use this code to continue signing in securely.</p>
        <div style="display:inline-block; margin:4px 0 16px 0; padding:12px 18px; border-radius:12px; background:#ecfeff; border:1px solid #a5f3fc; color:#0f172a; font-size:26px; letter-spacing:6px; font-weight:700;">
          ${escapeHtml(code)}
        </div>
        <p style="margin:0; color:#64748b; font-size:13px;">If you did not request this code, you can safely ignore this email.</p>
      `,
    },
    { fromType: 'auth' },
  );
  return sendEmail(payload);
};

export const sendCustomerInviteEmail = async (to: string, link: string, context?: EmailContext) => {
  const safeLink = link?.trim() || '#';
  const escapedLink = escapeHtml(safeLink);
  const payload = await tenantMailPayload(
    {
      to,
      subject: 'You Have Been Invited',
      text: `You have been invited. Accept the invite: ${safeLink}`,
      bodyHtml: `<p>You have been invited.</p><p><a href="${escapedLink}">Accept Invite</a></p>`,
    },
    context,
  );
  return sendEmail(payload);
};

export const sendPasswordResetEmail = async (to: string, link: string) => {
  const safeLink = link?.trim() || '#';
  const escapedLink = escapeHtml(safeLink);
  const payload = await tenantMailPayload(
    {
      to,
      subject: 'Reset Your Password',
      text: [
        'We received a request to reset your password.',
        'Use the link below to set a new password:',
        safeLink,
        '',
        'This link expires in 60 minutes and can only be used once.',
        'If you did not request this, you can safely ignore this email.'
      ].join('\n'),
      bodyHtml: `
        <h1 style="margin:0 0 12px 0; font-size:24px; line-height:1.25; color:#0f172a;">Reset your password</h1>
        <p style="margin:0 0 14px 0;">We received a request to reset your password.</p>
        <p style="margin: 0 0 16px 0;">
          <a
            href="${escapedLink}"
            target="_blank"
            rel="noopener noreferrer"
            style="display: inline-block; background: #0f8b8d; color: #ffffff; text-decoration: none; padding: 10px 18px; border-radius: 8px; font-weight: 600;"
          >
            Reset Password
          </a>
        </p>
        <p style="margin: 0 0 8px 0; font-size: 13px; color: #4b5563;">
          If the button does not work, copy and paste this link into your browser:
        </p>
        <p style="margin: 0 0 14px 0; font-size: 13px; word-break: break-all;">
          <a href="${escapedLink}" target="_blank" rel="noopener noreferrer" style="color: #0f8b8d;">${escapedLink}</a>
        </p>
        <p style="margin: 0 0 6px 0; font-size: 13px; color: #4b5563;">
          This link expires in 60 minutes and can only be used once.
        </p>
        <p style="margin: 0; font-size: 13px; color: #4b5563;">
          If you did not request this, you can safely ignore this email.
        </p>
      `,
    },
    { fromType: 'auth' },
  );
  return sendEmail(payload);
};

export const sendLeadFollowUpReminderEmail = async (
  to: string,
  details: {
    leadName: string;
    source?: string | null;
    dueAt?: Date | string | null;
    assigneeName?: string | null;
    leadUrl?: string | null;
  },
  context?: EmailContext,
) => {
  const leadName = escapeHtml(details.leadName || 'Lead');
  const source = details.source ? escapeHtml(details.source) : 'Unknown';
  const assignee = details.assigneeName ? escapeHtml(details.assigneeName) : 'Unassigned';
  const dueAt = details.dueAt ? new Date(details.dueAt).toLocaleString() : 'Now';
  const safeLink = details.leadUrl?.trim() || '#';
  const escapedLink = escapeHtml(safeLink);
  const payload = await tenantMailPayload(
    {
      to,
      subject: `Follow-up Reminder: ${leadName}`,
      text: `Follow-up is due for "${details.leadName}" (source: ${
        details.source ?? 'Unknown'
      }). Assignee: ${details.assigneeName ?? 'Unassigned'}. Due: ${dueAt}. ${
        details.leadUrl ? `Open lead: ${details.leadUrl}` : ''
      }`,
      bodyHtml: `
        <p>A lead follow-up is now due.</p>
        <p><strong>Lead:</strong> ${leadName}</p>
        <p><strong>Source:</strong> ${source}</p>
        <p><strong>Assignee:</strong> ${assignee}</p>
        <p><strong>Due:</strong> ${escapeHtml(dueAt)}</p>
        ${
          details.leadUrl
            ? `<p><a href="${escapedLink}" target="_blank" rel="noopener noreferrer">Open Lead</a></p>`
            : ''
        }
      `,
    },
    context,
  );
  return sendEmail(payload);
};

export const sendLeadTaskReminderEmail = async (
  to: string,
  details: {
    recipientName?: string | null;
    leadName: string;
    taskTitle: string;
    taskType?: string | null;
    taskDescription?: string | null;
    dueAt?: Date | string | null;
    assigneeName?: string | null;
    leadUrl?: string | null;
  },
  context?: EmailContext,
) => {
  const greetingName = details.recipientName?.trim()
    ? escapeHtml(details.recipientName.trim())
    : 'there';
  const leadName = escapeHtml(details.leadName || 'Lead');
  const taskTitle = escapeHtml(details.taskTitle || 'Task');
  const taskType = details.taskType ? escapeHtml(details.taskType.replace(/_/g, ' ')) : 'GENERAL';
  const taskDescription = details.taskDescription?.trim()
    ? escapeHtml(details.taskDescription.trim())
    : 'No additional description provided.';
  const assignee = details.assigneeName ? escapeHtml(details.assigneeName) : 'Unassigned';
  const dueDate = details.dueAt ? new Date(details.dueAt) : null;
  const dueAt =
    dueDate && !Number.isNaN(dueDate.getTime())
      ? `${new Intl.DateTimeFormat('en-GB', {
          weekday: 'short',
          month: 'short',
          day: '2-digit',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
          hour12: true,
          timeZone: 'UTC',
        }).format(dueDate)} UTC`
      : 'Now';
  const safeLink = details.leadUrl?.trim() || '#';
  const escapedLink = escapeHtml(safeLink);
  const payload = await tenantMailPayload(
    {
      to,
      subject: `Task Reminder: ${details.taskTitle}`,
      text: `Hello ${details.recipientName?.trim() || 'there'}, task reminder for "${
        details.taskTitle
      }" on lead "${details.leadName}". Type: ${
        details.taskType ?? 'GENERAL'
      }. Assignee: ${details.assigneeName ?? 'Unassigned'}. Due: ${dueAt}. ${
        details.leadUrl ? `Open lead: ${details.leadUrl}` : ''
      }`,
      bodyHtml: `
        <p style="margin:0 0 16px 0; font-size:28px; font-weight:700; color:#111827;">Hello ${greetingName},</p>
        <p style="margin:0 0 22px 0; font-size:16px; color:#1f2937;">
          This is a reminder for your upcoming task:
          <strong>'(${taskType}) ${taskTitle}'</strong>
        </p>
        <p style="margin:0 0 12px 0; font-size:24px; font-weight:700; color:#111827;">Task Details</p>
        <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%; border-collapse:collapse; margin-bottom:20px;">
          <tr>
            <td style="padding:8px 0; width:180px; color:#9ca3af; font-weight:600; vertical-align:top;">Description:</td>
            <td style="padding:8px 0; color:#1f2937;">${taskDescription}</td>
          </tr>
          <tr>
            <td style="padding:8px 0; width:180px; color:#9ca3af; font-weight:600; vertical-align:top;">Related to:</td>
            <td style="padding:8px 0; color:#1f2937;">
              ${
                details.leadUrl
                  ? `• <a href="${escapedLink}" target="_blank" rel="noopener noreferrer" style="color:#2563eb; text-decoration:none;">${leadName}</a>`
                  : `• ${leadName}`
              }
            </td>
          </tr>
          <tr>
            <td style="padding:8px 0; width:180px; color:#9ca3af; font-weight:600; vertical-align:top;">Assignee:</td>
            <td style="padding:8px 0; color:#1f2937;">${assignee}</td>
          </tr>
          <tr>
            <td style="padding:8px 0; width:180px; color:#9ca3af; font-weight:600; vertical-align:top;">Due Date:</td>
            <td style="padding:8px 0; color:#1f2937;">${escapeHtml(dueAt)}</td>
          </tr>
        </table>
        <p style="margin:20px 0 0 0; color:#374151;">Cheers,<br />Team AEM Systems</p>
      `,
    },
    context,
  );
  return sendEmail(payload);
};

export const sendLeadTaskAssignedEmail = async (
  to: string,
  details: {
    recipientName?: string | null;
    leadName: string;
    taskTitle: string;
    taskType?: string | null;
    taskDescription?: string | null;
    reminderAt?: Date | string | null;
    assignedByName?: string | null;
    leadUrl?: string | null;
  },
  context?: EmailContext,
) => {
  const greetingName = details.recipientName?.trim()
    ? escapeHtml(details.recipientName.trim())
    : 'there';
  const leadName = escapeHtml(details.leadName || 'Lead');
  const taskTitle = escapeHtml(details.taskTitle || 'Task');
  const taskType = details.taskType ? escapeHtml(details.taskType.replace(/_/g, ' ')) : 'GENERAL';
  const taskDescription = details.taskDescription?.trim()
    ? escapeHtml(details.taskDescription.trim())
    : 'No additional description provided.';
  const assignedBy = details.assignedByName ? escapeHtml(details.assignedByName) : 'A team member';
  const reminderDate = details.reminderAt ? new Date(details.reminderAt) : null;
  const reminderAt =
    reminderDate && !Number.isNaN(reminderDate.getTime())
      ? `${new Intl.DateTimeFormat('en-GB', {
          weekday: 'short',
          month: 'short',
          day: '2-digit',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
          hour12: true,
          timeZone: 'UTC',
        }).format(reminderDate)} UTC`
      : 'No reminder set';
  const safeLink = details.leadUrl?.trim() || '#';
  const escapedLink = escapeHtml(safeLink);
  const payload = await tenantMailPayload(
    {
      to,
      subject: `New Task Assigned: ${details.taskTitle}`,
      text: `Hello ${details.recipientName?.trim() || 'there'}, a new task "${details.taskTitle}" has been assigned to you on lead "${details.leadName}". Reminder: ${reminderAt}. ${
        details.leadUrl ? `Open lead: ${details.leadUrl}` : ''
      }`,
      bodyHtml: `
        <p style="margin:0 0 16px 0; font-size:28px; font-weight:700; color:#111827;">Hello ${greetingName},</p>
        <p style="margin:0 0 22px 0; font-size:16px; color:#1f2937;">
          ${assignedBy} assigned you a new task:
          <strong>'(${taskType}) ${taskTitle}'</strong>
        </p>
        <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%; border-collapse:collapse; margin-bottom:20px;">
          <tr>
            <td style="padding:8px 0; width:180px; color:#9ca3af; font-weight:600; vertical-align:top;">Related to:</td>
            <td style="padding:8px 0; color:#1f2937;">
              ${
                details.leadUrl
                  ? `<a href="${escapedLink}" target="_blank" rel="noopener noreferrer" style="color:#2563eb; text-decoration:none;">${leadName}</a>`
                  : leadName
              }
            </td>
          </tr>
          <tr>
            <td style="padding:8px 0; width:180px; color:#9ca3af; font-weight:600; vertical-align:top;">Description:</td>
            <td style="padding:8px 0; color:#1f2937;">${taskDescription}</td>
          </tr>
          <tr>
            <td style="padding:8px 0; width:180px; color:#9ca3af; font-weight:600; vertical-align:top;">Reminder:</td>
            <td style="padding:8px 0; color:#1f2937;">${escapeHtml(reminderAt)}</td>
          </tr>
        </table>
        <p style="margin:20px 0 0 0; color:#374151;">Cheers,<br />Team AEM Systems</p>
      `,
    },
    context,
  );
  return sendEmail(payload);
};

export const sendContractorInviteEmail = async (
  to: string,
  credentials: { email: string; password?: string | null },
  context?: EmailContext
) => {
  const passwordText = credentials.password
    ? ` Temporary password: ${credentials.password}.`
    : ' Use your existing password for this email address.';
  const passwordHtml = credentials.password
    ? `<p><strong>Temporary password:</strong> ${escapeHtml(credentials.password)}</p>`
    : '<p>Please use your existing password for this email address.</p>';
  const payload = await tenantMailPayload(
    {
      to,
      subject: 'Your Sub-Contractor Portal Access',
      text: `Your account has been created. Email: ${credentials.email}.${passwordText}`,
      bodyHtml: `<p>Your account has been created.</p><p><strong>Email:</strong> ${escapeHtml(credentials.email)}</p>${passwordHtml}`,
    },
    context,
  );
  return sendEmail(payload);
};

export const sendTeamInviteEmail = async (
  to: string,
  details: { email: string; loginUrl: string; tempPassword?: string | null },
  context?: EmailContext
) => {
  const safeLoginUrl = details.loginUrl?.trim() || '#';
  const escapedLoginUrl = escapeHtml(safeLoginUrl);
  const passwordLine = details.tempPassword
    ? `<p><strong>Temporary password:</strong> ${escapeHtml(details.tempPassword)}</p>`
    : `<p>Use your existing password to sign in.</p>`;
  const payload = await tenantMailPayload(
    {
      to,
      subject: 'Your Workspace Access Details',
      text: `You have been added to a workspace. Login: ${safeLoginUrl}. Email: ${details.email}.${
        details.tempPassword ? ` Temporary password: ${details.tempPassword}` : ''
      }`,
      bodyHtml: `<p>You have been added to a workspace.</p><p><strong>Login URL:</strong> <a href="${escapedLoginUrl}">${escapedLoginUrl}</a></p><p><strong>Email:</strong> ${escapeHtml(details.email)}</p>${passwordLine}`,
    },
    context,
  );
  return sendEmail(payload);
};

export const sendCustomerPortalAccessEmail = async (
  to: string,
  details: { email: string; loginUrl: string; tempPassword?: string | null },
  context?: EmailContext
) => {
  const safeLoginUrl = details.loginUrl?.trim() || '#';
  const escapedLoginUrl = escapeHtml(safeLoginUrl);
  const passwordLine = details.tempPassword
    ? `<p><strong>Temporary password:</strong> ${escapeHtml(details.tempPassword)}</p>`
    : `<p>Please use your existing customer portal password.</p>`;
  const payload = await tenantMailPayload(
    {
      to,
      subject: 'Your Customer Portal Access Details',
      text: `Your customer portal access has been updated. Login: ${safeLoginUrl}. Email: ${details.email}.${
        details.tempPassword ? ` Temporary password: ${details.tempPassword}` : ''
      }`,
      bodyHtml: `<p>Your customer portal access has been updated.</p><p><strong>Login URL:</strong> <a href="${escapedLoginUrl}">${escapedLoginUrl}</a></p><p><strong>Email:</strong> ${escapeHtml(details.email)}</p>${passwordLine}`,
    },
    context,
  );
  return sendEmail(payload);
};

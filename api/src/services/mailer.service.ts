import nodemailer from 'nodemailer';
import { env } from '../config/env';
import { enqueueEmail } from '../tenant/queues/email-queue.service';

export type MailPayload = {
  to: string;
  subject: string;
  html?: string;
  text?: string;
  fromEmail: string;
  fromName: string;
  replyTo?: string;
};

let cachedTransporter: nodemailer.Transporter | null = null;
let mailHealthChecked = false;

const formatSender = (name: string, email: string) => {
  const safeName = name.replace(/[\r\n<>]/g, '').trim();
  return safeName ? `${safeName} <${email}>` : email;
};

const sendWithResend = async (payload: MailPayload) => {
  if (!env.mail.resendApiKey) {
    throw new Error('RESEND_API_KEY is not configured');
  }

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.mail.resendApiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from: formatSender(payload.fromName, payload.fromEmail),
      to: [payload.to],
      subject: payload.subject,
      html: payload.html,
      text: payload.text,
      reply_to: payload.replyTo
    })
  });

  const result = (await response.json().catch(() => ({}))) as {
    id?: string;
    message?: string;
  };
  if (!response.ok || !result.id) {
    throw new Error(result.message ?? `Resend request failed with status ${response.status}`);
  }

  return { success: true as const, messageId: result.id, provider: 'resend' as const };
};

const getTransporter = () => {
  if (env.mail.provider !== 'smtp') {
    return null;
  }
  if (cachedTransporter) {
    return cachedTransporter;
  }
  if (!env.mail.host || env.mail.host === 'your.smtp.host') {
    return null;
  }
  const smtpUser = env.mail.user;
  const isGmailSmtp =
    env.mail.host.toLowerCase().includes('smtp.gmail.com') ||
    smtpUser?.toLowerCase().endsWith('@gmail.com');
  const smtpPass =
    isGmailSmtp && env.mail.pass ? env.mail.pass.replace(/\s+/g, '') : env.mail.pass;
  cachedTransporter = nodemailer.createTransport({
    host: env.mail.host,
    port: env.mail.port,
    secure: env.mail.secure,
    auth: smtpUser
      ? {
          user: smtpUser,
          pass: smtpPass
        }
      : undefined
  });
  return cachedTransporter;
};

export const sendEmailDirect = async (payload: MailPayload) => {
  if (env.mail.provider === 'resend') {
    try {
      return await sendWithResend(payload);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown';
      // eslint-disable-next-line no-console
      console.error('[mail] Resend delivery failed', {
        to: payload.to,
        subject: payload.subject,
        error: message
      });
      return {
        success: false as const,
        note: message,
        to: payload.to,
        subject: payload.subject,
        provider: 'resend' as const
      };
    }
  }

  const transporter = getTransporter();
  if (!transporter) {
    // eslint-disable-next-line no-console
    console.warn('[mail] SMTP not configured; email suppressed', {
      to: payload.to,
      subject: payload.subject
    });
    return {
      success: true,
      note: 'SMTP not configured; email suppressed.',
      to: payload.to,
      subject: payload.subject
    };
  }
  const from = formatSender(payload.fromName, payload.fromEmail);
  try {
    const result = await transporter.sendMail({
      from,
      to: payload.to,
      subject: payload.subject,
      html: payload.html,
      text: payload.text,
      replyTo: payload.replyTo
    });
    return { success: true, messageId: result.messageId };
  } catch (error) {
    // eslint-disable-next-line no-console
    console.warn('[mail] SMTP error suppressed', {
      to: payload.to,
      subject: payload.subject,
      error: error instanceof Error ? error.message : 'unknown'
    });
    return {
      success: true,
      note: 'SMTP error suppressed',
      to: payload.to,
      subject: payload.subject
    };
  }
};

export const sendEmail = async (payload: MailPayload) => {
  const queued = await enqueueEmail(payload);
  if (queued) {
    return { success: true, queued: true };
  }
  return sendEmailDirect(payload);
};

export const verifyMailTransport = async () => {
  if (mailHealthChecked) {
    return;
  }
  mailHealthChecked = true;
  if (env.mail.provider === 'resend') {
    if (!env.mail.resendApiKey) {
      // eslint-disable-next-line no-console
      console.warn('[mail] Resend selected but RESEND_API_KEY is not configured.');
      return;
    }
    // eslint-disable-next-line no-console
    console.log('[mail] Resend transport configured and ready.');
    return;
  }

  const transporter = getTransporter();
  if (!transporter) {
    // eslint-disable-next-line no-console
    console.warn('[mail] SMTP transport unavailable; running in suppressed mode.');
    return;
  }
  try {
    await transporter.verify();
    // eslint-disable-next-line no-console
    console.log('[mail] SMTP transport verified and ready.');
  } catch (error) {
    // eslint-disable-next-line no-console
    console.warn('[mail] SMTP verify failed; email send attempts will be suppressed.', {
      error: error instanceof Error ? error.message : 'unknown'
    });
  }
};

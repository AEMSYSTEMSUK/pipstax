import crypto from 'crypto';
import { AppDataSource } from '../config/data-source';
import { IsNull } from 'typeorm';
import { Account } from '../entities/account.entity';
import { PasswordReset } from '../entities/password-reset.entity';
import { BadRequestError } from '../utils/errors';
import { hashPassword } from '../utils/password';
import { sendPasswordResetEmail } from './notifications.service';
import { env } from '../config/env';
import { shouldExposeAuthDetails } from '../utils/auth-details';

const hashToken = (token: string) =>
  crypto.createHash('sha256').update(token).digest('hex');

const buildResetLink = (path: string, token: string, email: string, baseUrl?: string) => {
  const base = baseUrl ?? env.appUrl ?? 'http://127.0.0.1:3000';
  const url = new URL(path, base);
  url.searchParams.set('token', token);
  url.searchParams.set('email', email);
  return url.toString();
};

export const createPasswordReset = async (
  email: string,
  path: string,
  options?: { baseUrl?: string }
) => {
  const accountRepo = AppDataSource.getRepository(Account);
  const resetRepo = AppDataSource.getRepository(PasswordReset);
  const account = await accountRepo.findOne({ where: { email } });
  if (!account) {
    return { sent: true };
  }

  const token = crypto.randomBytes(24).toString('hex');
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

  await resetRepo
    .createQueryBuilder()
    .update(PasswordReset)
    .set({ usedAt: new Date() })
    .where('accountId = :accountId AND usedAt IS NULL', { accountId: account.id })
    .execute();

  const reset = resetRepo.create({
    email,
    accountId: account.id,
    tokenHash,
    expiresAt
  });
  await resetRepo.save(reset);

  const link = buildResetLink(path, token, email, options?.baseUrl);
  await sendPasswordResetEmail(email, link);

  const expose = shouldExposeAuthDetails();
  return {
    sent: true,
    expiresAt,
    devToken: expose ? token : undefined,
    devLink: expose ? link : undefined
  };
};

export const resetPassword = async (email: string, token: string, password: string) => {
  const accountRepo = AppDataSource.getRepository(Account);
  const resetRepo = AppDataSource.getRepository(PasswordReset);
  const account = await accountRepo.findOne({ where: { email } });
  if (!account) {
    throw new BadRequestError('Invalid or expired reset link');
  }

  const tokenHash = hashToken(token);
  const reset = await resetRepo.findOne({
    where: { accountId: account.id, email, tokenHash, usedAt: IsNull(), isDeleted: false }
  });
  if (!reset || reset.expiresAt.getTime() < Date.now()) {
    throw new BadRequestError('Invalid or expired reset link');
  }

  account.passwordHash = await hashPassword(password);
  account.isActive = true;
  if (!account.emailVerifiedAt) {
    account.emailVerifiedAt = new Date();
  }
  await accountRepo.save(account);

  reset.usedAt = new Date();
  await resetRepo.save(reset);

  return { reset: true };
};

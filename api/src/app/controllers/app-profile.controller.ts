import { Request, Response, NextFunction } from 'express';
import { AppDataSource } from '../../config/data-source';
import { User } from '../../entities/user.entity';
import { Account } from '../../entities/account.entity';
import { BadRequestError, NotFoundError } from '../../utils/errors';
import { hashPassword, verifyPassword } from '../../utils/password';
import { getTenantId } from '../../utils/request';

const toAppProfilePayload = (user: User) => ({
  id: user.id,
  fullName: user.fullName,
  email: user.email,
  phone: user.phone ?? '',
});

export const getAppProfile = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = getTenantId(req);
    if (!req.userId) {
      throw new NotFoundError('User not found');
    }
    const user = await AppDataSource.getRepository(User).findOne({
      where: { id: req.userId, tenantId, isDeleted: false },
    });
    if (!user) {
      throw new NotFoundError('User not found');
    }
    res.deliver(200, true, toAppProfilePayload(user), 'Profile fetched');
  } catch (error) {
    next(error);
  }
};

export const updateAppProfile = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = getTenantId(req);
    if (!req.userId) {
      throw new NotFoundError('User not found');
    }
    const repo = AppDataSource.getRepository(User);
    const user = await repo.findOne({
      where: { id: req.userId, tenantId, isDeleted: false },
    });
    if (!user) {
      throw new NotFoundError('User not found');
    }
    const fullName = String(req.body.fullName ?? '').trim();
    if (!fullName) {
      throw new BadRequestError('Full name is required');
    }
    const phone = String(req.body.phone ?? '').trim();
    user.fullName = fullName;
    user.phone = phone || undefined;
    await repo.save(user);
    res.deliver(200, true, toAppProfilePayload(user), 'Profile updated');
  } catch (error) {
    next(error);
  }
};

export const changeAppPassword = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = getTenantId(req);
    if (!req.userId) {
      throw new NotFoundError('User not found');
    }
    const userRepo = AppDataSource.getRepository(User);
    const accountRepo = AppDataSource.getRepository(Account);
    const user = await userRepo.findOne({ where: { id: req.userId, tenantId, isDeleted: false } });
    if (!user || !user.accountId) {
      throw new NotFoundError('User not found');
    }
    const account = await accountRepo.findOne({ where: { id: user.accountId } });
    if (!account) {
      throw new NotFoundError('Account not found');
    }
    const ok = await verifyPassword(req.body.currentPassword, account.passwordHash);
    if (!ok) {
      throw new BadRequestError('Current password is incorrect');
    }
    account.passwordHash = await hashPassword(req.body.newPassword);
    await accountRepo.save(account);
    res.deliver(200, true, { updated: true }, 'Password updated');
  } catch (error) {
    next(error);
  }
};

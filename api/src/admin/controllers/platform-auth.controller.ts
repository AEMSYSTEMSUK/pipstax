import { Request, Response, NextFunction } from 'express';
import { AppDataSource } from '../../config/data-source';
import { PlatformAdmin } from '../entities/platform-admin.entity';
import { verifyPassword } from '../../utils/password';
import { signToken } from '../../utils/jwt';
import { UnauthorizedError } from '../../utils/errors';

export const platformLogin = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email, password } = req.body;
    const repo = AppDataSource.getRepository(PlatformAdmin);
    const admin = await repo.findOne({ where: { email }, relations: ['roles'] });

    if (!admin) {
      throw new UnauthorizedError('Invalid credentials');
    }

    const ok = await verifyPassword(password, admin.passwordHash);
    if (!ok) {
      throw new UnauthorizedError('Invalid credentials');
    }

    const token = signToken({
      platformAdminId: admin.id,
      roles: admin.roles.map((role: any) => role.code),
      scope: 'platform'
    });

    res.deliver(200, true, { token, admin }, 'Login successful');
  } catch (error) {
    next(error);
  }
};

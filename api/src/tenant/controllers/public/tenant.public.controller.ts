import { Request, Response, NextFunction } from 'express';
import { AppDataSource } from '../../../config/data-source';
import { Tenant } from '../../../entities/tenant.entity';
import { BadRequestError, NotFoundError } from '../../../utils/errors';
import { resolveStoredFileUrl } from '../../../services/storage/storage.service';

export const getPublicTenant = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const subdomain = req.params.subdomain?.trim().toLowerCase();
    if (!subdomain) {
      throw new BadRequestError('Subdomain is required');
    }

    const repo = AppDataSource.getRepository(Tenant);
    const tenant = await repo.findOne({ where: { subdomain, isDeleted: false } });
    if (!tenant) {
      throw new NotFoundError('Tenant not found');
    }

    res.deliver(200, true, {
      id: tenant.id,
      name: tenant.name,
      tradingName: tenant.tradingName,
      subdomain: tenant.subdomain,
      logoUrl: resolveStoredFileUrl(tenant.logoUrl),
      primaryColor: tenant.primaryColor,
      emailHeaderLogoUrl: resolveStoredFileUrl(tenant.emailHeaderLogoUrl)
    });
  } catch (error) {
    next(error);
  }
};

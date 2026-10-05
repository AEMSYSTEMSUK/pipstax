import { Request, Response, NextFunction } from 'express';
import { AppDataSource } from '../../config/data-source';
import { LookupOption } from '../../entities/lookup-option.entity';
import { getTenantId } from '../../utils/request';
import { BadRequestError, NotFoundError } from '../../utils/errors';

const normalizeLookupValue = (value: unknown) => String(value ?? '').trim();

const normalizeLookupType = (value: unknown) =>
  normalizeLookupValue(value).toLowerCase().replace(/[\s-]+/g, '_');

export const listLookupOptions = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = getTenantId(req);
    const type = normalizeLookupType(req.query.type);
    if (!type) {
      throw new BadRequestError('Lookup type is required.');
    }

    const options = await AppDataSource.getRepository(LookupOption).find({
      where: { tenantId, type, isDeleted: false },
      order: { title: 'ASC' },
    });

    res.deliver(200, true, options, 'Lookup options fetched');
  } catch (error) {
    next(error);
  }
};

export const createLookupOption = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = getTenantId(req);
    const repo = AppDataSource.getRepository(LookupOption);
    const title = normalizeLookupValue(req.body.title);
    const type = normalizeLookupType(req.body.type);

    if (!title || !type) {
      throw new BadRequestError('Lookup title and type are required.');
    }

    const existing = await repo.findOne({
      where: { tenantId, type, title, isDeleted: false },
    });
    if (existing) {
      res.deliver(200, true, existing, 'Lookup option already exists');
      return;
    }

    const option = repo.create({ tenantId, type, title });
    await repo.save(option);
    res.deliver(201, true, option, 'Lookup option created');
  } catch (error: any) {
    if (error?.code === '23505') {
      next(new BadRequestError('Lookup option already exists.'));
      return;
    }
    next(error);
  }
};

export const updateLookupOption = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = getTenantId(req);
    const repo = AppDataSource.getRepository(LookupOption);
    const option = await repo.findOne({
      where: { id: req.params.id, tenantId, isDeleted: false },
    });
    if (!option) {
      throw new NotFoundError('Lookup option not found');
    }

    const title = req.body.title !== undefined ? normalizeLookupValue(req.body.title) : undefined;
    const type = req.body.type !== undefined ? normalizeLookupType(req.body.type) : undefined;
    if (title !== undefined) option.title = title;
    if (type !== undefined) option.type = type;
    await repo.save(option);

    res.deliver(200, true, option, 'Lookup option updated');
  } catch (error) {
    next(error);
  }
};

export const deleteLookupOption = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = getTenantId(req);
    const repo = AppDataSource.getRepository(LookupOption);
    const option = await repo.findOne({
      where: { id: req.params.id, tenantId, isDeleted: false },
    });
    if (!option) {
      throw new NotFoundError('Lookup option not found');
    }

    option.isDeleted = true;
    await repo.save(option);
    res.deliver(200, true, option, 'Lookup option removed');
  } catch (error) {
    next(error);
  }
};

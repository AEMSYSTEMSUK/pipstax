import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { Request, Response, NextFunction } from 'express';
import { BadRequestError } from '../utils/errors';

export const validateBody = (DtoClass: new () => object) => async (
  req: Request,
  _res: Response,
  next: NextFunction
) => {
  try {
    const dto = plainToInstance(DtoClass, req.body);
    const errors = await validate(dto as object, { whitelist: true, forbidNonWhitelisted: true });
    if (errors.length > 0) {
      const message = errors
        .map((err) => Object.values(err.constraints ?? {}).join(', '))
        .filter(Boolean)
        .join('; ');
      throw new BadRequestError(message || 'Validation failed');
    }
    req.body = dto as object;
    next();
  } catch (error) {
    next(error);
  }
};

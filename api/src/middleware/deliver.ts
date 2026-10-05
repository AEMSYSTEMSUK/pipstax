import { Request, Response, NextFunction } from 'express';

export type Deliver = (statusCode: number, success: boolean, data: unknown, message?: string) => void;

export const deliverMiddleware = (_req: Request, res: Response, next: NextFunction) => {
  res.deliver = (statusCode, success, data, message) => {
    res.status(statusCode).json({ success, data, message });
  };
  next();
};

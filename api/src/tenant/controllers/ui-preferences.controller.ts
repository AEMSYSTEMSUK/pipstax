import { NextFunction, Request, Response } from 'express';
import { getTenantId } from '../../utils/request';
import {
  getTenantBoardColumnOrder,
  updateTenantBoardColumnOrder,
} from '../../services/tenant-ui-preferences.service';

export const getBoardColumnOrder = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const payload = await getTenantBoardColumnOrder(getTenantId(req), req.query.key);
    res.deliver(200, true, payload, 'Board column order');
  } catch (error) {
    next(error);
  }
};

export const updateBoardColumnOrder = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const payload = await updateTenantBoardColumnOrder(getTenantId(req), req.body.key, req.body.order);
    res.deliver(200, true, payload, 'Board column order updated');
  } catch (error) {
    next(error);
  }
};

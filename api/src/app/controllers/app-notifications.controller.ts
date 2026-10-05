import { Request, Response, NextFunction } from 'express';
import { AppDataSource } from '../../config/data-source';
import { Notification } from '../../entities/notification.entity';
import { getTenantId } from '../../utils/request';

export const listAppNotifications = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = getTenantId(req);
    const notifications = await AppDataSource.getRepository(Notification).find({
      where: { tenantId, userId: req.userId, isDeleted: false },
      order: { createdAt: 'DESC' },
      take: 30,
    });
    res.deliver(200, true, notifications, 'Notifications fetched');
  } catch (error) {
    next(error);
  }
};

export const markAppNotificationRead = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = getTenantId(req);
    const repo = AppDataSource.getRepository(Notification);
    const notification = await repo.findOne({
      where: { id: req.params.id, tenantId, userId: req.userId, isDeleted: false },
    });
    if (!notification) {
      return res.deliver(200, true, null, 'Notification missing');
    }
    notification.readAt = new Date();
    await repo.save(notification);
    res.deliver(200, true, notification, 'Notification read');
  } catch (error) {
    next(error);
  }
};

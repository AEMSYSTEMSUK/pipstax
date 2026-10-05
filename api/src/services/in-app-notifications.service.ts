import { AppDataSource } from '../config/data-source';
import { Notification } from '../entities/notification.entity';
import { User } from '../entities/user.entity';
import { SystemRole } from '../constants/roles';

export interface CreateNotificationParams {
  tenantId: string;
  userId?: string;
  customerId?: string;
  title: string;
  message: string;
  targetUrl?: string;
}

/**
 * Creates a single in-app notification for a specific user or customer.
 */
export const createInAppNotification = async (params: CreateNotificationParams) => {
  const repo = AppDataSource.getRepository(Notification);
  const notification = repo.create({
    tenantId: params.tenantId,
    userId: params.userId,
    customerId: params.customerId,
    title: params.title,
    message: params.message,
    targetUrl: params.targetUrl,
  });
  return repo.save(notification);
};

/**
 * Notifies all administrative users (ADMIN, MANAGER) in a tenant.
 */
export const notifyAdmins = async (params: Omit<CreateNotificationParams, 'userId' | 'customerId'>) => {
  const userRepo = AppDataSource.getRepository(User);
  
  // Find all active admins and managers for the tenant
  const admins = await userRepo.find({
    where: {
      tenantId: params.tenantId,
      isDeleted: false,
      isActive: true,
    },
    relations: ['roles'],
  });

  const adminUsers = admins.filter(user => 
    user.roles?.some(role => role.code === SystemRole.ADMIN || role.code === SystemRole.MANAGER)
  );

  if (adminUsers.length === 0) return [];

  const notificationRepo = AppDataSource.getRepository(Notification);
  const notifications = adminUsers.map(admin => notificationRepo.create({
    tenantId: params.tenantId,
    userId: admin.id,
    title: params.title,
    message: params.message,
    targetUrl: params.targetUrl,
  }));

  return notificationRepo.save(notifications);
};

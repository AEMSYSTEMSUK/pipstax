import { Request, Response, NextFunction } from 'express';
import { AppDataSource } from '../../../config/data-source';
import { LeadActivity } from '../../../entities/lead-activity.entity';
import { Lead } from '../../../entities/lead.entity';
import { User } from '../../../entities/user.entity';
import { getTenantId } from '../../../utils/request';
import { NotFoundError } from '../../../utils/errors';

const attachActivityActorNames = async (tenantId: string, activities: LeadActivity[]) => {
  if (activities.length === 0) return [];
  const userIds = Array.from(
    new Set(
      activities
        .map((activity) => activity.userId)
        .filter((userId): userId is string => Boolean(userId)),
    ),
  );

  const usersById = new Map<string, string>();
  if (userIds.length > 0) {
    const users = await AppDataSource.getRepository(User).find({
      where: userIds.map((id) => ({ id, tenantId, isDeleted: false })),
      select: { id: true, fullName: true },
    });
    for (const user of users) {
      usersById.set(user.id, user.fullName);
    }
  }

  return activities.map((activity) => ({
    ...activity,
    actorName: activity.userId ? usersById.get(activity.userId) ?? 'Unknown User' : 'Automated',
  }));
};

export const listLeadActivities = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = getTenantId(req);
    const repo = AppDataSource.getRepository(LeadActivity);
    const activities = await repo.find({
      where: { leadId: req.params.id, tenantId, isDeleted: false },
      order: { createdAt: 'DESC' }
    });
    const withActors = await attachActivityActorNames(tenantId, activities);
    res.deliver(200, true, withActors, 'Lead activities fetched');
  } catch (error) {
    next(error);
  }
};

export const createLeadActivity = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = getTenantId(req);
    const leadRepo = AppDataSource.getRepository(Lead);
    const activityRepo = AppDataSource.getRepository(LeadActivity);
    const lead = await leadRepo.findOne({ where: { id: req.params.id, tenantId, isDeleted: false } });
    if (!lead) {
      throw new NotFoundError('Lead not found');
    }
    const activity = activityRepo.create({
      leadId: lead.id,
      tenantId,
      type: req.body.type,
      message: req.body.message,
      metadata: req.body.metadata,
      userId: req.userId
    });
    await activityRepo.save(activity);
    const [withActor] = await attachActivityActorNames(tenantId, [activity]);
    res.deliver(201, true, withActor, 'Lead activity created');
  } catch (error) {
    next(error);
  }
};

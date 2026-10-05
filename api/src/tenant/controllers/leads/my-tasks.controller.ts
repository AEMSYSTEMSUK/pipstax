import { NextFunction, Request, Response } from 'express';
import { AppDataSource } from '../../../config/data-source';
import { LeadTaskStatus } from '../../../constants/status';
import { LeadActivity } from '../../../entities/lead-activity.entity';
import { LeadTask } from '../../../entities/lead-task.entity';
import { getTenantId } from '../../../utils/request';
import { NotFoundError } from '../../../utils/errors';

const createLeadActivity = async (params: {
  leadId: string;
  tenantId: string;
  userId?: string;
  type: string;
  message: string;
  metadata?: Record<string, unknown>;
}) => {
  const repo = AppDataSource.getRepository(LeadActivity);
  const activity = repo.create({
    leadId: params.leadId,
    tenantId: params.tenantId,
    userId: params.userId,
    type: params.type,
    message: params.message,
    metadata: params.metadata,
  });
  await repo.save(activity);
  return activity;
};

export const listMyTasks = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = getTenantId(req);
    const userId = req.userId;

    if (!userId) {
      throw new NotFoundError('User not found');
    }

    const tasks = await AppDataSource.getRepository(LeadTask).find({
      where: { tenantId, assigneeUserId: userId, isDeleted: false },
      relations: ['lead'],
      order: { reminderAt: 'ASC', createdAt: 'DESC' },
    });

    const data = tasks.map((task) => ({
      ...task,
      leadTitle: task.lead?.name,
    }));

    res.deliver(200, true, data, 'My tasks fetched');
  } catch (error) {
    next(error);
  }
};

export const updateMyTaskStatus = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = getTenantId(req);
    const userId = req.userId;

    if (!userId) {
      throw new NotFoundError('User not found');
    }

    const repo = AppDataSource.getRepository(LeadTask);
    const task = await repo.findOne({
      where: { id: req.params.taskId, assigneeUserId: userId, tenantId, isDeleted: false },
    });

    if (!task) {
      throw new NotFoundError('Task not found or not assigned to you');
    }

    const prevStatus = task.status;
    const prevDescription = task.description;

    let updated = false;

    if (req.body.status !== undefined && req.body.status !== task.status) {
      task.status = req.body.status;
      if (task.status === LeadTaskStatus.COMPLETED) {
        task.completedAt = new Date();
      } else {
        task.completedAt = undefined;
      }
      updated = true;
    }

    if (req.body.description !== undefined) {
      const newDescription = String(req.body.description ?? '').trim();
      if (newDescription !== (task.description ?? '')) {
        task.description = newDescription || undefined;
        updated = true;
      }
    }

    if (updated) {
      await repo.save(task);

      const changes: string[] = [];
      if (task.status !== prevStatus) changes.push('status');
      if (task.description !== prevDescription) changes.push('notes');

      await createLeadActivity({
        leadId: task.leadId,
        tenantId,
        userId,
        type: 'Task Updated',
        message: `Task "${task.title}" updated (${changes.join(', ')}).`,
        metadata: {
          taskId: task.id,
          from: {
            status: prevStatus,
            description: prevDescription ?? null,
          },
          to: {
            status: task.status,
            description: task.description ?? null,
          },
        },
      });
    }

    res.deliver(200, true, task, 'Task updated');
  } catch (error) {
    next(error);
  }
};

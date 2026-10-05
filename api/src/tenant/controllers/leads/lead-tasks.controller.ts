import { NextFunction, Request, Response } from 'express';
import { AppDataSource } from '../../../config/data-source';
import { LeadTaskStatus } from '../../../constants/status';
import { SystemRole } from '../../../constants/roles';
import { Lead } from '../../../entities/lead.entity';
import { LeadActivity } from '../../../entities/lead-activity.entity';
import { LeadTask } from '../../../entities/lead-task.entity';
import { User } from '../../../entities/user.entity';
import { getTenantId } from '../../../utils/request';
import { BadRequestError, NotFoundError } from '../../../utils/errors';
import { createInAppNotification } from '../../../services/in-app-notifications.service';
import { sendLeadTaskAssignedEmail } from '../../../services/notifications.service';
import { resolveTenantAppUrl } from '../../../utils/tenant-url';


const NON_TASK_ASSIGNABLE_ROLES = new Set<string>([SystemRole.CUSTOMER, SystemRole.SUB_CONTRACTOR, SystemRole.FIELD_WORKER]);

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

const getLeadOrThrow = async (tenantId: string, leadId: string) => {
  const lead = await AppDataSource.getRepository(Lead).findOne({
    where: { id: leadId, tenantId, isDeleted: false },
  });
  if (!lead) {
    throw new NotFoundError('Lead not found');
  }
  return lead;
};

const findTaskAssignableUser = async (tenantId: string, userId: string) => {
  const user = await AppDataSource.getRepository(User).findOne({
    where: { id: userId, tenantId, isDeleted: false, isActive: true },
    relations: ['roles'],
  });
  if (!user) {
    return null;
  }
  const roleCodes = (user.roles ?? []).map((role) => role.code);
  if (roleCodes.length === 0) {
    return null;
  }
  if (roleCodes.some((code) => NON_TASK_ASSIGNABLE_ROLES.has(code))) {
    return null;
  }
  return user;
};

const normalizeTaskType = (value?: string) => {
  const raw = String(value ?? '').trim();
  if (!raw) return 'GENERAL';
  return raw.toUpperCase().replace(/\s+/g, '_').slice(0, 80);
};

const parseFutureReminderAt = (value: unknown) => {
  if (!value) return undefined;
  const reminderAt = new Date(String(value));
  if (Number.isNaN(reminderAt.getTime())) {
    throw new BadRequestError('Reminder date is invalid.');
  }
  if (reminderAt.getTime() <= Date.now()) {
    throw new BadRequestError('Reminder must be a future date and time.');
  }
  return reminderAt;
};

const resolveLeadUrl = (tenantId: string, leadId: string) =>
  resolveTenantAppUrl(tenantId, `/admin/crm/${leadId}`);

const attachAssignee = async (tenantId: string, tasks: LeadTask[]) => {
  if (tasks.length === 0) return [];
  const assigneeIds = Array.from(
    new Set(tasks.map((task) => task.assigneeUserId).filter((id): id is string => Boolean(id))),
  );
  const assignees =
    assigneeIds.length > 0
      ? await AppDataSource.getRepository(User).find({
          where: assigneeIds.map((id) => ({ id, tenantId, isDeleted: false })),
          select: { id: true, fullName: true, email: true },
        })
      : [];
  const assigneeById = new Map(assignees.map((user) => [user.id, user]));
  return tasks.map((task) => ({
    ...task,
    assignee: task.assigneeUserId ? assigneeById.get(task.assigneeUserId) ?? null : null,
  }));
};

export const listLeadTasks = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = getTenantId(req);
    await getLeadOrThrow(tenantId, req.params.id);
    const tasks = await AppDataSource.getRepository(LeadTask).find({
      where: { tenantId, leadId: req.params.id, isDeleted: false },
      order: { createdAt: 'DESC' },
    });
    const data = await attachAssignee(tenantId, tasks);
    res.deliver(200, true, data, 'Lead tasks fetched');
  } catch (error) {
    next(error);
  }
};

export const createLeadTask = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = getTenantId(req);
    const lead = await getLeadOrThrow(tenantId, req.params.id);
    let assigneeUserId: string | undefined;
    if (req.body.assigneeUserId) {
      const assignee = await findTaskAssignableUser(tenantId, req.body.assigneeUserId);
      if (!assignee) {
        throw new BadRequestError(
          'Assignee must be an active internal workspace member (customers and subcontractors are excluded).',
        );
      }
      assigneeUserId = assignee.id;
    }

    const reminderAt = parseFutureReminderAt(req.body.reminderAt);

    const repo = AppDataSource.getRepository(LeadTask);
    const task = repo.create({
      tenantId,
      leadId: lead.id,
      title: String(req.body.title).trim(),
      taskType: normalizeTaskType(req.body.taskType),
      description: req.body.description ? String(req.body.description).trim() : undefined,
      assigneeUserId,
      reminderAt,
      reminderSentAt: undefined,
      status: LeadTaskStatus.OPEN,
      createdByUserId: req.userId,
    });
    await repo.save(task);

    const assignee = assigneeUserId
      ? (
          await AppDataSource.getRepository(User).findOne({
            where: { id: assigneeUserId, tenantId, isDeleted: false },
            select: { id: true, fullName: true, email: true },
          })
        )
      : null;
    const creator = req.userId
      ? await AppDataSource.getRepository(User).findOne({
          where: { id: req.userId, tenantId, isDeleted: false },
          select: { fullName: true, email: true },
        })
      : null;
    await createLeadActivity({
      leadId: lead.id,
      tenantId,
      userId: req.userId,
      type: 'Task Assigned',
      message: assignee?.fullName
        ? `Task "${task.title}" assigned to ${assignee.fullName}.`
        : `Task "${task.title}" created without assignee.`,
      metadata: {
        taskId: task.id,
        taskType: task.taskType,
        reminderAt: task.reminderAt?.toISOString() ?? null,
        assigneeUserId: task.assigneeUserId ?? null,
      },
    });

    if (assigneeUserId) {
      createInAppNotification({
        tenantId,
        userId: assigneeUserId,
        title: 'New Task Assigned',
        message: `New task "${task.title}" has been assigned to you on lead "${lead.name}".`,
        targetUrl: `/admin/crm/${lead.id}?tab=tasks`,
      }).catch(err => console.error('Task notification failed:', err));

      if (assignee?.email) {
        const leadUrl = await resolveLeadUrl(tenantId, lead.id);
        sendLeadTaskAssignedEmail(
          assignee.email,
          {
            recipientName: assignee.fullName,
            leadName: lead.name,
            taskTitle: task.title,
            taskType: task.taskType,
            taskDescription: task.description ?? null,
            reminderAt: task.reminderAt ?? null,
            assignedByName: creator?.fullName ?? creator?.email ?? null,
            leadUrl,
          },
          { tenantId },
        ).catch(err => console.error('Task assignment email failed:', err));
      }
    }

    const [withAssignee] = await attachAssignee(tenantId, [task]);
    res.deliver(201, true, withAssignee, 'Lead task created');
  } catch (error) {
    next(error);
  }
};

export const updateLeadTask = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = getTenantId(req);
    const lead = await getLeadOrThrow(tenantId, req.params.id);
    const repo = AppDataSource.getRepository(LeadTask);
    const task = await repo.findOne({
      where: { id: req.params.taskId, leadId: req.params.id, tenantId, isDeleted: false },
    });
    if (!task) {
      throw new NotFoundError('Task not found');
    }

    const prev = {
      title: task.title,
      taskType: task.taskType,
      description: task.description ?? null,
      status: task.status,
      assigneeUserId: task.assigneeUserId ?? null,
      reminderAt: task.reminderAt?.toISOString() ?? null,
    };

    if (req.body.assigneeUserId !== undefined) {
      if (req.body.assigneeUserId === null || req.body.assigneeUserId === '') {
        task.assigneeUserId = undefined;
      } else {
        const assignee = await findTaskAssignableUser(tenantId, req.body.assigneeUserId);
        if (!assignee) {
          throw new BadRequestError(
            'Assignee must be an active internal workspace member (customers and subcontractors are excluded).',
          );
        }
        task.assigneeUserId = assignee.id;
      }
    }

    if (req.body.title !== undefined) {
      const title = String(req.body.title ?? '').trim();
      if (!title) throw new BadRequestError('Task title is required.');
      task.title = title;
    }
    if (req.body.taskType !== undefined) {
      task.taskType = normalizeTaskType(req.body.taskType);
    }
    if (req.body.description !== undefined) {
      const description = String(req.body.description ?? '').trim();
      task.description = description || undefined;
    }
    if (req.body.status !== undefined) {
      task.status = req.body.status;
      if (task.status === LeadTaskStatus.COMPLETED) {
        task.completedAt = new Date();
      } else {
        task.completedAt = undefined;
      }
    }
    if (req.body.reminderAt !== undefined) {
      if (req.body.reminderAt === null || req.body.reminderAt === '') {
        task.reminderAt = undefined;
      } else {
        task.reminderAt = parseFutureReminderAt(req.body.reminderAt);
      }
      task.reminderSentAt = undefined;
    }

    await repo.save(task);

    const changes: string[] = [];
    if (task.title !== prev.title) changes.push('title');
    if (task.taskType !== prev.taskType) changes.push('type');
    if ((task.description ?? null) !== prev.description) changes.push('description');
    if (task.status !== prev.status) changes.push('status');
    if ((task.assigneeUserId ?? null) !== prev.assigneeUserId) changes.push('assignee');
    if ((task.reminderAt?.toISOString() ?? null) !== prev.reminderAt) changes.push('reminder');

    if (changes.length > 0) {
      await createLeadActivity({
        leadId: task.leadId,
        tenantId,
        userId: req.userId,
        type: 'Task Updated',
        message: `Task "${task.title}" updated (${changes.join(', ')}).`,
        metadata: {
          taskId: task.id,
          from: prev,
          to: {
            title: task.title,
            taskType: task.taskType,
            description: task.description ?? null,
            status: task.status,
            assigneeUserId: task.assigneeUserId ?? null,
            reminderAt: task.reminderAt?.toISOString() ?? null,
          },
        },
      });
    }

    if (task.assigneeUserId && changes.includes('assignee')) {
      const assignee = await AppDataSource.getRepository(User).findOne({
        where: { id: task.assigneeUserId, tenantId, isDeleted: false },
        select: { id: true, fullName: true, email: true },
      });
      const creator = req.userId
        ? await AppDataSource.getRepository(User).findOne({
            where: { id: req.userId, tenantId, isDeleted: false },
            select: { fullName: true, email: true },
          })
        : null;

      createInAppNotification({
        tenantId,
        userId: task.assigneeUserId,
        title: 'Task Assignment Updated',
        message: `The task "${task.title}" on lead "${lead.name}" is now assigned to you.`,
        targetUrl: `/admin/crm/${lead.id}?tab=tasks`,
      }).catch(err => console.error('Task update notification failed:', err));

      if (assignee?.email) {
        const leadUrl = await resolveLeadUrl(tenantId, lead.id);
        sendLeadTaskAssignedEmail(
          assignee.email,
          {
            recipientName: assignee.fullName,
            leadName: lead.name,
            taskTitle: task.title,
            taskType: task.taskType,
            taskDescription: task.description ?? null,
            reminderAt: task.reminderAt ?? null,
            assignedByName: creator?.fullName ?? creator?.email ?? null,
            leadUrl,
          },
          { tenantId },
        ).catch(err => console.error('Task reassignment email failed:', err));
      }
    } else if (task.assigneeUserId && changes.length > 0) {
      createInAppNotification({
        tenantId,
        userId: task.assigneeUserId,
        title: 'Task Updated',
        message: `Task "${task.title}" assigned to you has been updated (${changes.join(', ')}).`,
        targetUrl: `/admin/crm/${lead.id}?tab=tasks`,
      }).catch(err => console.error('Task update notification failed:', err));
    }

    const [withAssignee] = await attachAssignee(tenantId, [task]);
    res.deliver(200, true, withAssignee, 'Lead task updated');
  } catch (error) {
    next(error);
  }
};

export const deleteLeadTask = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = getTenantId(req);
    await getLeadOrThrow(tenantId, req.params.id);
    const repo = AppDataSource.getRepository(LeadTask);
    const task = await repo.findOne({
      where: { id: req.params.taskId, leadId: req.params.id, tenantId, isDeleted: false },
    });
    if (!task) {
      throw new NotFoundError('Task not found');
    }
    task.isDeleted = true;
    await repo.save(task);

    await createLeadActivity({
      leadId: task.leadId,
      tenantId,
      userId: req.userId,
      type: 'Task Deleted',
      message: `Task "${task.title}" deleted.`,
      metadata: { taskId: task.id },
    });

    res.deliver(200, true, { id: task.id }, 'Lead task deleted');
  } catch (error) {
    next(error);
  }
};

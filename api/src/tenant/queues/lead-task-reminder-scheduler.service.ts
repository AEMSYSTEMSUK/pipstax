import { In, IsNull, LessThanOrEqual } from 'typeorm';
import { AppDataSource } from '../../config/data-source';
import { env } from '../../config/env';
import { LeadTaskStatus } from '../../constants/status';
import { Lead } from '../../entities/lead.entity';
import { LeadActivity } from '../../entities/lead-activity.entity';
import { LeadTask } from '../../entities/lead-task.entity';
import { Tenant } from '../../entities/tenant.entity';
import { User } from '../../entities/user.entity';
import { createInAppNotification } from '../../services/in-app-notifications.service';
import { sendLeadTaskReminderEmail } from '../../services/notifications.service';

const DEFAULT_INTERVAL_MS = 60_000;
let reminderTimer: NodeJS.Timeout | null = null;
let isTickRunning = false;

const normalizeHost = (value: string) =>
  value.replace(/^https?:\/\//i, '').replace(/\/.*$/, '');

const resolveLeadUrl = (tenant: Tenant, leadId: string) => {
  const fallbackOrigin = (() => {
    try {
      return new URL(env.appUrl).origin;
    } catch {
      return 'http://127.0.0.1:3000';
    }
  })();
  const baseDomain = normalizeHost(env.tenantBaseDomain || '');
  const subdomain = (tenant.subdomain ?? '').trim();
  if (subdomain && baseDomain) {
    const isLocal = baseDomain.includes('localhost') || baseDomain.includes('127.0.0.1');
    const protocol = isLocal ? 'http' : 'https';
    return `${protocol}://${subdomain}.${baseDomain}/admin/crm/${leadId}`;
  }
  return `${fallbackOrigin}/admin/crm/${leadId}`;
};

const runLeadTaskReminderTick = async () => {
  if (isTickRunning) return;
  isTickRunning = true;
  try {
    const taskRepo = AppDataSource.getRepository(LeadTask);
    const leadRepo = AppDataSource.getRepository(Lead);
    const tenantRepo = AppDataSource.getRepository(Tenant);
    const userRepo = AppDataSource.getRepository(User);
    const activityRepo = AppDataSource.getRepository(LeadActivity);
    const dueTasks = await taskRepo.find({
      where: {
        isDeleted: false,
        reminderAt: LessThanOrEqual(new Date()),
        reminderSentAt: IsNull(),
        status: In([LeadTaskStatus.OPEN, LeadTaskStatus.IN_PROGRESS]),
      },
      order: { reminderAt: 'ASC' },
    });
    if (dueTasks.length === 0) return;

    for (const task of dueTasks) {
      try {
        const [lead, tenant, creator, assignee, primaryAdmin] = await Promise.all([
          leadRepo.findOne({ where: { id: task.leadId, tenantId: task.tenantId, isDeleted: false } }),
          tenantRepo.findOne({ where: { id: task.tenantId, isDeleted: false } }),
          task.createdByUserId
            ? userRepo.findOne({
                where: { id: task.createdByUserId, tenantId: task.tenantId, isDeleted: false },
              })
            : Promise.resolve(null),
          task.assigneeUserId
            ? userRepo.findOne({
                where: { id: task.assigneeUserId, tenantId: task.tenantId, isDeleted: false },
              })
            : Promise.resolve(null),
          userRepo.findOne({
            where: { tenantId: task.tenantId, isDeleted: false },
            order: { createdAt: 'ASC' },
          }),
        ]);

        if (!lead || !tenant) continue;

        const recipients = Array.from(
          new Set(
            [assignee?.email, creator?.email, primaryAdmin?.email]
              .map((email) => String(email ?? '').trim().toLowerCase())
              .filter(Boolean),
          ),
        );
        const recipientNameByEmail = new Map<string, string>([
          [String(assignee?.email ?? '').trim().toLowerCase(), String(assignee?.fullName ?? '').trim()],
          [String(creator?.email ?? '').trim().toLowerCase(), String(creator?.fullName ?? '').trim()],
          [String(primaryAdmin?.email ?? '').trim().toLowerCase(), String(primaryAdmin?.fullName ?? '').trim()],
        ]);
        if (recipients.length === 0) {
          task.reminderSentAt = new Date();
          await taskRepo.save(task);
          continue;
        }

        const leadUrl = resolveLeadUrl(tenant, lead.id);
        const inAppResult = assignee
          ? await createInAppNotification({
              tenantId: task.tenantId,
              userId: assignee.id,
              title: 'Task Reminder',
              message: `Reminder: "${task.title}" on lead "${lead.name}" is due now.`,
              targetUrl: `/admin/crm/${lead.id}?tab=tasks`,
            })
              .then(() => true)
              .catch((error) => {
                console.warn('[lead-task-reminder] in-app notification failed', {
                  taskId: task.id,
                  error: error instanceof Error ? error.message : 'unknown',
                });
                return false;
              })
          : false;

        const result = await Promise.allSettled(
          recipients.map((email) => {
            const recipientName = recipientNameByEmail.get(email) || null;
            return sendLeadTaskReminderEmail(
              email,
              {
                recipientName,
                leadName: lead.name,
                taskTitle: task.title,
                taskType: task.taskType,
                taskDescription: task.description ?? null,
                dueAt: task.reminderAt,
                assigneeName: assignee?.fullName ?? null,
                leadUrl,
              },
              { tenantId: task.tenantId },
            );
          }),
        );
        const sentCount = result.filter((item) => item.status === 'fulfilled').length;
        if (sentCount > 0 || inAppResult) {
          task.reminderSentAt = new Date();
          await taskRepo.save(task);
          await activityRepo.save(
            activityRepo.create({
              tenantId: task.tenantId,
              leadId: task.leadId,
              type: 'Task Reminder',
              message: `Reminder sent for task "${task.title}" to ${sentCount} email recipient(s)${inAppResult ? ' and in-app assignee notification' : ''}.`,
              metadata: {
                taskId: task.id,
                taskType: task.taskType,
                recipients,
              },
            }),
          );
        }
      } catch (error) {
        // eslint-disable-next-line no-console
        console.warn('[lead-task-reminder] failed', {
          taskId: task.id,
          error: error instanceof Error ? error.message : 'unknown',
        });
      }
    }
  } finally {
    isTickRunning = false;
  }
};

export const startLeadTaskReminderScheduler = () => {
  if (reminderTimer) return;
  const everyMs = Number(process.env.LEAD_TASK_REMINDER_INTERVAL_MS ?? DEFAULT_INTERVAL_MS);
  void runLeadTaskReminderTick();
  reminderTimer = setInterval(() => {
    void runLeadTaskReminderTick();
  }, everyMs);
};

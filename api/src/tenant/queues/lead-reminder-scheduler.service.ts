import { In, IsNull, LessThanOrEqual } from 'typeorm';
import { AppDataSource } from '../../config/data-source';
import { Lead } from '../../entities/lead.entity';
import { LeadActivity } from '../../entities/lead-activity.entity';
import { Tenant } from '../../entities/tenant.entity';
import { User } from '../../entities/user.entity';
import { LeadStatus } from '../../constants/status';
import { sendLeadFollowUpReminderEmail } from '../../services/notifications.service';
import { env } from '../../config/env';

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

const createReminderActivity = async (params: {
  leadId: string;
  tenantId: string;
  message: string;
  metadata?: Record<string, unknown>;
}) => {
  const repo = AppDataSource.getRepository(LeadActivity);
  const entry = repo.create({
    leadId: params.leadId,
    tenantId: params.tenantId,
    type: 'Follow-up Reminder',
    message: params.message,
    metadata: params.metadata,
  });
  await repo.save(entry);
};

const runLeadReminderTick = async () => {
  if (isTickRunning) return;
  isTickRunning = true;
  try {
    const leadRepo = AppDataSource.getRepository(Lead);
    const tenantRepo = AppDataSource.getRepository(Tenant);
    const userRepo = AppDataSource.getRepository(User);
    const dueLeads = await leadRepo.find({
      where: {
        isDeleted: false,
        nextFollowUpAt: LessThanOrEqual(new Date()),
        followUpReminderSentAt: IsNull(),
        status: In([LeadStatus.NEW, LeadStatus.CONTACTED, LeadStatus.QUALIFIED]),
      },
      order: {
        nextFollowUpAt: 'ASC',
      },
    });
    if (dueLeads.length === 0) return;

    for (const lead of dueLeads) {
      try {
        const [tenant, creator, primaryAdmin, assignee] = await Promise.all([
          tenantRepo.findOne({ where: { id: lead.tenantId, isDeleted: false } }),
          lead.createdByUserId
            ? userRepo.findOne({
                where: { id: lead.createdByUserId, tenantId: lead.tenantId, isDeleted: false },
              })
            : Promise.resolve(null),
          userRepo.findOne({
            where: { tenantId: lead.tenantId, isDeleted: false },
            order: { createdAt: 'ASC' },
          }),
          lead.assignedUserId
            ? userRepo.findOne({
                where: { id: lead.assignedUserId, tenantId: lead.tenantId, isDeleted: false },
              })
            : Promise.resolve(null),
        ]);
        if (!tenant) continue;

        const recipients = Array.from(
          new Set(
            [creator?.email, primaryAdmin?.email]
              .map((email) => String(email ?? '').trim().toLowerCase())
              .filter(Boolean),
          ),
        );
        if (recipients.length === 0) {
          lead.followUpReminderSentAt = new Date();
          await leadRepo.save(lead);
          await createReminderActivity({
            leadId: lead.id,
            tenantId: lead.tenantId,
            message: 'Follow-up reminder skipped (no recipients found).',
          });
          continue;
        }

        const leadUrl = resolveLeadUrl(tenant, lead.id);
        const result = await Promise.allSettled(
          recipients.map((email) =>
            sendLeadFollowUpReminderEmail(
              email,
              {
                leadName: lead.name,
                source: lead.source,
                dueAt: lead.nextFollowUpAt,
                assigneeName: assignee?.fullName ?? null,
                leadUrl,
              },
              { tenantId: lead.tenantId },
            ),
          ),
        );
        const sentCount = result.filter((entry) => entry.status === 'fulfilled').length;
        if (sentCount > 0) {
          lead.followUpReminderSentAt = new Date();
          await leadRepo.save(lead);
          await createReminderActivity({
            leadId: lead.id,
            tenantId: lead.tenantId,
            message: `Follow-up reminder sent to ${sentCount} recipient(s).`,
            metadata: { recipients, leadUrl },
          });
        }
      } catch (error) {
        // eslint-disable-next-line no-console
        console.warn('[lead-reminder] failed for lead', {
          leadId: lead.id,
          error: error instanceof Error ? error.message : 'unknown',
        });
      }
    }
  } finally {
    isTickRunning = false;
  }
};

export const startLeadReminderScheduler = () => {
  if (reminderTimer) return;
  const everyMs = Number(process.env.LEAD_REMINDER_INTERVAL_MS ?? DEFAULT_INTERVAL_MS);
  void runLeadReminderTick();
  reminderTimer = setInterval(() => {
    void runLeadReminderTick();
  }, everyMs);
};


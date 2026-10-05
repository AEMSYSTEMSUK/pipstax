import { IsNull, LessThanOrEqual } from 'typeorm';
import { AppDataSource } from '../../config/data-source';
import { PlannerNote } from '../../entities/planner-note.entity';
import { User } from '../../entities/user.entity';
import { createInAppNotification } from '../../services/in-app-notifications.service';

const DEFAULT_INTERVAL_MS = 60_000;
let plannerReminderTimer: NodeJS.Timeout | null = null;
let isTickRunning = false;

const todayDateOnly = () => new Date().toISOString().slice(0, 10);

const formatPlannerDateRange = (date: string, endDate?: string | null) =>
  endDate && endDate !== date ? `${date} to ${endDate}` : date;

const runPlannerNoteReminderTick = async () => {
  if (isTickRunning) return;
  isTickRunning = true;
  try {
    const noteRepo = AppDataSource.getRepository(PlannerNote);
    const userRepo = AppDataSource.getRepository(User);
    const dueNotes = await noteRepo.find({
      where: {
        isDeleted: false,
        reminderEnabled: true,
        reminderSentAt: IsNull(),
        date: LessThanOrEqual(todayDateOnly()),
      },
      order: { date: 'ASC', createdAt: 'ASC' },
      take: 100,
    });

    for (const note of dueNotes) {
      try {
        const assignee = await userRepo.findOne({
          where: {
            id: note.userId,
            tenantId: note.tenantId,
            isDeleted: false,
            isActive: true,
          },
          select: ['id', 'fullName', 'tenantId', 'isActive'],
        });

        if (assignee) {
          await createInAppNotification({
            tenantId: note.tenantId,
            userId: assignee.id,
            title: 'Planner Reminder',
            message: `Reminder: "${note.title}" is scheduled for ${formatPlannerDateRange(note.date, note.endDate)}.`,
            targetUrl: '/admin/schedule?section=planner',
          });
        }

        note.reminderSentAt = new Date();
        await noteRepo.save(note);
      } catch (error) {
        console.warn('[planner-note-reminder] failed', {
          noteId: note.id,
          error: error instanceof Error ? error.message : 'unknown',
        });
      }
    }
  } finally {
    isTickRunning = false;
  }
};

export const startPlannerNoteReminderScheduler = () => {
  if (plannerReminderTimer) return;
  const everyMs = Number(process.env.PLANNER_NOTE_REMINDER_INTERVAL_MS ?? DEFAULT_INTERVAL_MS);
  void runPlannerNoteReminderTick();
  plannerReminderTimer = setInterval(() => {
    void runPlannerNoteReminderTick();
  }, everyMs);
};

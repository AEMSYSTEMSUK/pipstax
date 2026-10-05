import { AppDataSource } from '../config/data-source';
import { JobAssignment } from '../entities/job-assignment.entity';
import { PlannerEntry } from '../entities/planner-entry.entity';
import { Job } from '../entities/job.entity';

const toDateOnly = (date: Date) => date.toISOString().slice(0, 10);

const enumerateJobDates = (job: Pick<Job, 'scheduledAt' | 'scheduledEndAt'>) => {
  if (!job.scheduledAt) return [];
  const start = new Date(job.scheduledAt);
  const rawEnd = job.scheduledEndAt ? new Date(job.scheduledEndAt) : start;
  if (Number.isNaN(start.getTime())) return [];
  const end = Number.isNaN(rawEnd.getTime()) || rawEnd < start ? start : rawEnd;
  const cursor = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate()));
  const endDay = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate()));
  const dates: string[] = [];
  while (cursor <= endDay) {
    dates.push(toDateOnly(cursor));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dates;
};

export const syncPlannerEntriesForJob = async (tenantId: string, jobId: string) => {
  const jobRepo = AppDataSource.getRepository(Job);
  const assignmentRepo = AppDataSource.getRepository(JobAssignment);
  const entryRepo = AppDataSource.getRepository(PlannerEntry);

  const job = await jobRepo.findOne({ where: { id: jobId, tenantId, isDeleted: false } });
  const activeAssignments = await assignmentRepo.find({
    where: { jobId, tenantId, isDeleted: false, isActive: true },
  });
  const dates = job ? enumerateJobDates(job) : [];
  const desiredKeys = new Set<string>();
  activeAssignments.forEach((assignment) => {
    dates.forEach((date) => desiredKeys.add(`${assignment.userId}:${date}`));
  });

  const existingEntries = await entryRepo.find({ where: { jobId, tenantId, isDeleted: false } });
  const existingByKey = new Map(existingEntries.map((entry) => [`${entry.userId}:${entry.date}`, entry]));
  const updates: PlannerEntry[] = [];

  for (const entry of existingEntries) {
    if (!desiredKeys.has(`${entry.userId}:${entry.date}`)) {
      entry.isDeleted = true;
      updates.push(entry);
    }
  }

  for (const assignment of activeAssignments) {
    for (const date of dates) {
      const key = `${assignment.userId}:${date}`;
      if (!existingByKey.has(key)) {
        updates.push(entryRepo.create({ tenantId, jobId, userId: assignment.userId, date }));
      }
    }
  }

  if (updates.length > 0) {
    await entryRepo.save(updates);
  }
};

export const syncPlannerEntriesForTenant = async (tenantId: string) => {
  const assignmentRepo = AppDataSource.getRepository(JobAssignment);
  const assignments = await assignmentRepo.find({
    where: { tenantId, isDeleted: false, isActive: true },
    select: ['jobId', 'tenantId', 'isDeleted', 'isActive'],
  });
  const jobIds = Array.from(new Set(assignments.map((assignment) => assignment.jobId).filter(Boolean)));
  for (const jobId of jobIds) {
    await syncPlannerEntriesForJob(tenantId, jobId);
  }
};

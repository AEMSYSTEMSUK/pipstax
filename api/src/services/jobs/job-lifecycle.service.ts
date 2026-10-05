import { Repository } from 'typeorm';
import { AppDataSource } from '../../config/data-source';
import { Job } from '../../entities/job.entity';
import { JobAssignment } from '../../entities/job-assignment.entity';
import { JobStatus } from '../../constants/status';

const hasSchedule = (job: Job) => {
  if (!job.scheduledAt || !job.scheduledEndAt) return false;
  const startMs = new Date(job.scheduledAt).getTime();
  const endMs = new Date(job.scheduledEndAt).getTime();
  return Number.isFinite(startMs) && Number.isFinite(endMs) && endMs > startMs;
};

export const deriveJobLifecycleStatus = (
  job: Job,
  assignmentCount: number,
): JobStatus => {
  if (job.status === JobStatus.COMPLETED || Boolean(job.completedAt)) {
    return JobStatus.COMPLETED;
  }

  const explicitLifecycleStatuses = new Set<JobStatus>([
    JobStatus.LIVE,
    JobStatus.REQUIRES_FOLLOW_UP,
    JobStatus.FINISHED,
  ]);
  if (explicitLifecycleStatuses.has(job.status)) {
    return job.status;
  }

  if (job.status === JobStatus.EN_ROUTE || job.status === JobStatus.ON_SITE) {
    return JobStatus.LIVE;
  }

  if (!hasSchedule(job)) {
    return assignmentCount > 0 ? JobStatus.ASSIGNED : JobStatus.NOT_ASSIGNED;
  }

  if (assignmentCount <= 0) {
    return JobStatus.NOT_ASSIGNED;
  }

  return JobStatus.ASSIGNED;
};

export const updateJobLifecycleStatus = async ({
  job,
  assignmentCount,
  repo,
}: {
  job: Job;
  assignmentCount: number;
  repo: Repository<Job>;
}) => {
  const nextStatus = deriveJobLifecycleStatus(job, assignmentCount);
  if (job.status === nextStatus) return false;
  job.status = nextStatus;
  await repo.save(job);
  return true;
};

export const getActiveAssignmentCountMap = async (
  tenantId: string,
  jobIds: string[],
) => {
  if (jobIds.length === 0) return new Map<string, number>();
  const rows = await AppDataSource.getRepository(JobAssignment)
    .createQueryBuilder('assignment')
    .select('assignment.jobId', 'jobId')
    .addSelect('COUNT(*)', 'count')
    .where('assignment.tenantId = :tenantId', { tenantId })
    .andWhere('assignment.isDeleted = false')
    .andWhere('assignment.isActive = true')
    .andWhere('assignment.jobId IN (:...jobIds)', { jobIds })
    .groupBy('assignment.jobId')
    .getRawMany<{ jobId: string; count: string }>();

  const map = new Map<string, number>();
  for (const row of rows) {
    map.set(row.jobId, Number(row.count ?? 0));
  }
  return map;
};

export const syncJobLifecyclesForList = async (
  repo: Repository<Job>,
  tenantId: string,
  jobs: Job[],
) => {
  if (jobs.length === 0) return jobs;
  const countMap = await getActiveAssignmentCountMap(
    tenantId,
    jobs.map((job) => job.id),
  );
  const changed: Job[] = [];
  for (const job of jobs) {
    const assignmentCount = countMap.get(job.id) ?? 0;
    const nextStatus = deriveJobLifecycleStatus(job, assignmentCount);
    if (job.status !== nextStatus) {
      job.status = nextStatus;
      changed.push(job);
    }
  }
  if (changed.length > 0) {
    await repo.save(changed);
  }
  return jobs;
};

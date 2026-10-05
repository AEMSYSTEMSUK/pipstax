import { AppDataSource } from '../config/data-source';
import { JobActivity } from '../entities/job-activity.entity';

export const createJobActivity = async (params: {
  tenantId: string;
  jobId: string;
  type: string;
  message: string;
  userId?: string;
  metadata?: Record<string, unknown>;
}) => {
  const repo = AppDataSource.getRepository(JobActivity);
  const activity = repo.create({
    tenantId: params.tenantId,
    jobId: params.jobId,
    type: params.type,
    message: params.message,
    userId: params.userId,
    metadata: params.metadata,
  });
  return repo.save(activity);
};

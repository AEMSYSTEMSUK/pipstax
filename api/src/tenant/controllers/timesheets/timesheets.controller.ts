import { Request, Response, NextFunction } from 'express';
import { AppDataSource } from '../../../config/data-source';
import { Timesheet } from '../../../entities/timesheet.entity';
import { getTenantId } from '../../../utils/request';
import { NotFoundError } from '../../../utils/errors';
import { exportTimesheetsCsv } from '../../../services/timesheets.service';
import { JobTimeEntry } from '../../../entities/job-time-entry.entity';
import { Job } from '../../../entities/job.entity';
import { User } from '../../../entities/user.entity';
import { JobAssignment } from '../../../entities/job-assignment.entity';
import { Tenant } from '../../../entities/tenant.entity';
import { In } from 'typeorm';

export const listTimesheets = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = getTenantId(req);
    const repo = AppDataSource.getRepository(Timesheet);
    const timesheets = await repo.find({ where: { tenantId, isDeleted: false } });
    res.deliver(200, true, timesheets, 'Timesheets fetched');
  } catch (error) {
    next(error);
  }
};

export const listTimesheetLogs = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = getTenantId(req);
    const timesheetRepo = AppDataSource.getRepository(Timesheet);
    const jobTimeRepo = AppDataSource.getRepository(JobTimeEntry);
    const userRepo = AppDataSource.getRepository(User);
    const jobRepo = AppDataSource.getRepository(Job);
    const assignmentRepo = AppDataSource.getRepository(JobAssignment);
    const tenantRepo = AppDataSource.getRepository(Tenant);

    const [manualTimesheets, jobTimeEntries, tenant] = await Promise.all([
      timesheetRepo.find({ where: { tenantId, isDeleted: false } }),
      jobTimeRepo.find({ where: { tenantId, isDeleted: false } }),
      tenantRepo.findOne({ where: { id: tenantId, isDeleted: false } }),
    ]);
    const defaultHourlyRate = Number(tenant?.defaultHourlyRate ?? 0);

    const workerIds = Array.from(
      new Set([
        ...manualTimesheets.map((entry) => entry.workerId),
        ...jobTimeEntries.map((entry) => entry.userId)
      ])
    );
    const jobIds = Array.from(new Set(jobTimeEntries.map((entry) => entry.jobId)));

    const [users, jobs, assignments] = await Promise.all([
      workerIds.length
        ? userRepo.find({ where: workerIds.map((id) => ({ id, tenantId, isDeleted: false })), relations: ['roles'] })
        : Promise.resolve([]),
      jobIds.length ? jobRepo.find({ where: jobIds.map((id) => ({ id, tenantId, isDeleted: false })) }) : Promise.resolve([]),
      jobIds.length
        ? assignmentRepo.find({
            where: { tenantId, isDeleted: false, jobId: In(jobIds), userId: In(workerIds) },
            relations: ['team'],
            order: { assignedAt: 'DESC', createdAt: 'DESC' }
          })
        : Promise.resolve([])
    ]);

    const userMap = new Map(users.map((user) => [user.id, user]));
    const jobMap = new Map(jobs.map((job) => [job.id, job]));
    const assignmentRateMap = new Map<string, number>();
    for (const assignment of assignments) {
      const key = `${assignment.jobId}:${assignment.userId}`;
      if (assignmentRateMap.has(key)) continue;
      const rate = Number(
        assignment.effectiveHourlyRate ??
          assignment.team?.hourlyRate ??
          userMap.get(assignment.userId)?.hourlyRate ??
          defaultHourlyRate ??
          0,
      );
      if (Number.isFinite(rate) && rate > 0) {
        assignmentRateMap.set(key, rate);
      }
    }

    const manualRows = manualTimesheets.map((entry) => {
      const user = userMap.get(entry.workerId);
      const fallbackRate = Number(user?.hourlyRate ?? defaultHourlyRate ?? 0);
      const hourlyRate = Number(entry.hourlyRate ?? 0);
      return {
        id: `manual_${entry.id}`,
        entryId: entry.id,
        entryKind: 'MANUAL' as const,
        workerId: entry.workerId,
        workerName: user?.fullName ?? 'Worker',
        workerEmail: user?.email ?? '',
        workerRoles: Array.isArray(user?.roles)
          ? user!.roles.map((role) => role?.name ?? role?.code ?? '').filter(Boolean)
          : [],
        date: entry.date,
        startTime: null,
        endTime: null,
        hours: Number(entry.hours ?? 0),
        hourlyRate: hourlyRate > 0 ? hourlyRate : fallbackRate,
        approved: Boolean(entry.approved),
        status: entry.approved ? 'Approved' : 'Submitted',
        jobId: null,
        jobTitle: null,
        notes: null
      };
    });

    const jobRows = jobTimeEntries.map((entry) => {
      const user = userMap.get(entry.userId);
      const job = jobMap.get(entry.jobId);
      const fallbackRate = Number(user?.hourlyRate ?? defaultHourlyRate ?? 0);
      const assignmentRate = assignmentRateMap.get(`${entry.jobId}:${entry.userId}`) ?? 0;
      const snapshotRate = Number(entry.hourlyRate ?? 0);
      const startTime = entry.startTime ? new Date(entry.startTime) : null;
      const endTime = entry.endTime ? new Date(entry.endTime) : null;
      const date = startTime ? startTime.toISOString().split('T')[0] : '';
      const durationHours = Number(entry.durationMinutes ?? 0) / 60;
      return {
        id: `job_${entry.id}`,
        entryId: entry.id,
        entryKind: 'JOB' as const,
        workerId: entry.userId,
        workerName: user?.fullName ?? 'Worker',
        workerEmail: user?.email ?? '',
        workerRoles: Array.isArray(user?.roles)
          ? user!.roles.map((role) => role?.name ?? role?.code ?? '').filter(Boolean)
          : [],
        date,
        startTime: startTime ? startTime.toISOString() : null,
        endTime: endTime ? endTime.toISOString() : null,
        hours: Number.isFinite(durationHours) ? durationHours : 0,
        hourlyRate:
          snapshotRate > 0
            ? snapshotRate
            : assignmentRate > 0
            ? assignmentRate
            : fallbackRate,
        approved: true,
        status: 'Approved',
        jobId: entry.jobId,
        jobTitle: job?.title ?? 'Job',
        notes: entry.notes ?? null
      };
    });

    const rows = [...manualRows, ...jobRows].sort((a, b) => {
      const aTs = new Date(a.startTime ?? `${a.date}T00:00:00Z`).getTime();
      const bTs = new Date(b.startTime ?? `${b.date}T00:00:00Z`).getTime();
      return bTs - aTs;
    });

    res.deliver(200, true, rows, 'Timesheet logs fetched');
  } catch (error) {
    next(error);
  }
};

export const getTimesheet = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = getTenantId(req);
    const repo = AppDataSource.getRepository(Timesheet);
    const timesheet = await repo.findOne({ where: { id: req.params.id, tenantId, isDeleted: false } });
    if (!timesheet) {
      throw new NotFoundError('Timesheet not found');
    }
    res.deliver(200, true, timesheet, 'Timesheet fetched');
  } catch (error) {
    next(error);
  }
};

export const createTimesheet = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = getTenantId(req);
    const repo = AppDataSource.getRepository(Timesheet);
    const tenantRepo = AppDataSource.getRepository(Tenant);
    const userRepo = AppDataSource.getRepository(User);
    const tenant = await tenantRepo.findOne({ where: { id: tenantId, isDeleted: false } });
    const worker =
      req.body?.workerId && typeof req.body.workerId === 'string'
        ? await userRepo.findOne({
            where: {
              id: req.body.workerId,
              tenantId,
              isDeleted: false,
              isActive: true,
            },
          })
        : null;
    const incomingRate = Number(req.body?.hourlyRate ?? 0);
    const resolvedRate =
      Number.isFinite(incomingRate) && incomingRate > 0
        ? incomingRate
        : Number(worker?.hourlyRate ?? tenant?.defaultHourlyRate ?? 0);
    const timesheet = repo.create({
      ...req.body,
      hourlyRate: Number.isFinite(resolvedRate) && resolvedRate > 0 ? resolvedRate : undefined,
      tenantId,
    });
    await repo.save(timesheet);
    res.deliver(201, true, timesheet, 'Timesheet created');
  } catch (error) {
    next(error);
  }
};

export const updateTimesheet = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = getTenantId(req);
    const repo = AppDataSource.getRepository(Timesheet);
    const tenantRepo = AppDataSource.getRepository(Tenant);
    const userRepo = AppDataSource.getRepository(User);
    const timesheet = await repo.findOne({ where: { id: req.params.id, tenantId, isDeleted: false } });
    if (!timesheet) {
      throw new NotFoundError('Timesheet not found');
    }
    Object.assign(timesheet, req.body);
    const tenant = await tenantRepo.findOne({ where: { id: tenantId, isDeleted: false } });
    const worker = await userRepo.findOne({
      where: {
        id: timesheet.workerId,
        tenantId,
        isDeleted: false,
        isActive: true,
      },
    });
    const incomingRate = Number(timesheet.hourlyRate ?? 0);
    const resolvedRate =
      Number.isFinite(incomingRate) && incomingRate > 0
        ? incomingRate
        : Number(worker?.hourlyRate ?? tenant?.defaultHourlyRate ?? 0);
    timesheet.hourlyRate = Number.isFinite(resolvedRate) && resolvedRate > 0 ? resolvedRate : undefined;
    await repo.save(timesheet);
    res.deliver(200, true, timesheet, 'Timesheet updated');
  } catch (error) {
    next(error);
  }
};

export const approveTimesheet = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = getTenantId(req);
    const repo = AppDataSource.getRepository(Timesheet);
    const timesheet = await repo.findOne({ where: { id: req.params.id, tenantId, isDeleted: false } });
    if (!timesheet) {
      throw new NotFoundError('Timesheet not found');
    }
    timesheet.approved = true;
    await repo.save(timesheet);
    res.deliver(200, true, timesheet, 'Timesheet approved');
  } catch (error) {
    next(error);
  }
};

export const deleteTimesheet = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = getTenantId(req);
    const repo = AppDataSource.getRepository(Timesheet);
    const timesheet = await repo.findOne({ where: { id: req.params.id, tenantId, isDeleted: false } });
    if (!timesheet) {
      throw new NotFoundError('Timesheet not found');
    }
    timesheet.isDeleted = true;
    await repo.save(timesheet);
    res.deliver(200, true, timesheet, 'Timesheet removed');
  } catch (error) {
    next(error);
  }
};

export const exportTimesheets = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = getTenantId(req);
    const csv = await exportTimesheetsCsv(tenantId);
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=timesheets.csv');
    res.status(200).send(csv);
  } catch (error) {
    next(error);
  }
};

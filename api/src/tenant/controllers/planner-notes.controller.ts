import { NextFunction, Request, Response } from 'express';
import { AppDataSource } from '../../config/data-source';
import { PlannerNote } from '../../entities/planner-note.entity';
import { PlannerEntry } from '../../entities/planner-entry.entity';
import { User } from '../../entities/user.entity';
import { Permissions } from '../../constants/permissions';
import { BadRequestError, NotFoundError } from '../../utils/errors';
import { getTenantId } from '../../utils/request';
import { buildCustomerSiteAddress } from '../../services/customer-sites.service';
import { syncPlannerEntriesForTenant } from '../../services/planner-entries.service';
import {
  getTenantPlannerSettings,
  updateTenantPlannerSettings,
} from '../../services/tenant-ui-preferences.service';

const dateRangeSpansMultipleDays = (start?: Date | null, end?: Date | null) => {
  if (!start || !end) return false;
  return start.toISOString().slice(0, 10) !== end.toISOString().slice(0, 10);
};

type NagerHoliday = {
  date: string;
  name: string;
  countryCode: string;
  nationalHoliday?: boolean;
  subdivisionCodes?: string[] | null;
  holidayTypes?: string[];
};

const normalizeOptionalString = (value: unknown) => {
  if (typeof value !== 'string') {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

const normalizeDateOnly = (value: unknown, fieldLabel: string) => {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new BadRequestError(`${fieldLabel} is required.`);
  }
  const [dateOnly] = value.trim().split('T');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateOnly)) {
    throw new BadRequestError(`${fieldLabel} must be a valid date.`);
  }
  return dateOnly;
};

const ensureDateRange = (date: string, endDate?: string | null) => {
  if (endDate && endDate < date) {
    throw new BadRequestError('End date cannot be before the start date.');
  }
};

const resolvePlannerUser = async (tenantId: string, userId: string) => {
  const repo = AppDataSource.getRepository(User);
  const user = await repo.findOne({
    where: { id: userId, tenantId, isDeleted: false, isActive: true },
    select: ['id', 'fullName', 'email', 'isActive', 'tenantId'],
  });
  if (!user) {
    throw new BadRequestError('Selected planner user was not found.');
  }
  return user;
};

const serializePlannerNote = async (note: PlannerNote) => {
  const user = await AppDataSource.getRepository(User).findOne({
    where: { id: note.userId, tenantId: note.tenantId, isDeleted: false },
    select: ['id', 'fullName', 'email'],
  });

  return {
    ...note,
    userName: user?.fullName ?? 'Unknown user',
    userEmail: user?.email ?? null,
  };
};

export const listPlannerNotes = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = getTenantId(req);
    const notes = await AppDataSource.getRepository(PlannerNote).find({
      where: { tenantId, isDeleted: false },
      order: { date: 'ASC', endDate: 'ASC', createdAt: 'DESC' },
    });

    res.deliver(
      200,
      true,
      await Promise.all(notes.map((note) => serializePlannerNote(note))),
      'Planner notes fetched',
    );
  } catch (error) {
    next(error);
  }
};

export const listPlannerNoteUsers = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = getTenantId(req);
    const users = await AppDataSource.getRepository(User).find({
      where: { tenantId, isDeleted: false, isActive: true },
      order: { fullName: 'ASC' },
      select: ['id', 'fullName', 'email', 'tenantId', 'isActive'],
    });

    res.deliver(
      200,
      true,
      users.map((user) => ({
        id: user.id,
        fullName: user.fullName,
        email: user.email,
      })),
      'Planner users fetched',
    );
  } catch (error) {
    next(error);
  }
};

export const listPlannerEntries = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = getTenantId(req);
    await syncPlannerEntriesForTenant(tenantId);

    const entries = await AppDataSource.getRepository(PlannerEntry).find({
      where: { tenantId, isDeleted: false },
      relations: ['job', 'job.customer', 'job.site', 'user'],
      order: { date: 'ASC', createdAt: 'ASC' },
    });

    const payload = entries
      .filter((entry) => entry.job && !entry.job.isDeleted)
      .map((entry) => ({
        id: entry.id,
        jobId: entry.jobId,
        userId: entry.userId,
        userName: entry.user?.fullName ?? 'Unknown user',
        userEmail: entry.user?.email ?? null,
        date: entry.date,
        note: entry.note ?? null,
        jobTitle: entry.job.title,
        jobNumber: entry.job.jobNumber ?? null,
        jobStatus: entry.job.status,
        priority: entry.job.priority ?? null,
        scheduledAt: entry.job.scheduledAt ?? null,
        scheduledEndAt: entry.job.scheduledEndAt ?? null,
        isMultiDay: dateRangeSpansMultipleDays(entry.job.scheduledAt, entry.job.scheduledEndAt),
        customerId: entry.job.customerId ?? null,
        customerName: entry.job.customer?.name ?? null,
        siteId: entry.job.siteId ?? null,
        siteName: entry.job.site?.name ?? null,
        siteAddress: buildCustomerSiteAddress(entry.job.site) ?? entry.job.location ?? null,
      }));

    res.deliver(200, true, payload, 'Planner entries fetched');
  } catch (error) {
    next(error);
  }
};

export const getPlannerSettings = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const payload = await getTenantPlannerSettings(getTenantId(req));
    res.deliver(200, true, payload, 'Planner settings fetched');
  } catch (error) {
    next(error);
  }
};

export const updatePlannerSettings = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const payload = await updateTenantPlannerSettings(getTenantId(req), req.body);
    res.deliver(200, true, payload, 'Planner settings updated');
  } catch (error) {
    next(error);
  }
};

export const listBankHolidays = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = getTenantId(req);
    const settings = await getTenantPlannerSettings(tenantId);
    const year = Number(req.query.year ?? new Date().getFullYear());
    if (!Number.isInteger(year) || year < 2000 || year > 2100) {
      throw new BadRequestError('Invalid bank holiday year.');
    }
    if (!settings.usePublicHolidays) {
      return res.deliver(200, true, [], 'Bank holidays disabled');
    }
    const countryCode = settings.holidayCountryCode || 'GB';
    const response = await fetch(`https://nagerholidays.com/api/v4/Holidays/${countryCode}/${year}`);
    if (!response.ok) {
      throw new BadRequestError('Unable to load public holidays.');
    }
    const data = (await response.json()) as NagerHoliday[];
    const subdivisionCode = settings.holidaySubdivisionCode ?? null;
    const holidays = (Array.isArray(data) ? data : [])
      .filter((event) => {
        if (!event.date.startsWith(`${year}-`)) return false;
        if (subdivisionCode) {
          return event.nationalHoliday !== false || (event.subdivisionCodes ?? []).includes(subdivisionCode);
        }
        if (!settings.includeRegionalHolidays && event.nationalHoliday === false) return false;
        return true;
      })
      .map((event) => ({
        date: event.date,
        title: event.name,
        source: 'nager',
        countryCode: event.countryCode,
        nationalHoliday: event.nationalHoliday !== false,
        subdivisionCodes: event.subdivisionCodes ?? null,
        holidayTypes: event.holidayTypes ?? [],
      }));
    res.deliver(200, true, holidays, 'Bank holidays fetched');
  } catch (error) {
    next(error);
  }
};

export const createPlannerNote = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = getTenantId(req);
    const userId = normalizeOptionalString(req.body.userId);
    if (!userId) {
      throw new BadRequestError('Planner user is required.');
    }
    await resolvePlannerUser(tenantId, userId);

    const date = normalizeDateOnly(req.body.date, 'Date');
    const endDate = req.body.endDate == null ? null : normalizeDateOnly(req.body.endDate, 'End date');
    ensureDateRange(date, endDate);

    const note = AppDataSource.getRepository(PlannerNote).create({
      tenantId,
      userId,
      title: normalizeOptionalString(req.body.title) ?? '',
      date,
      endDate,
      kind: normalizeOptionalString(req.body.kind),
      notes: normalizeOptionalString(req.body.notes),
      reminderEnabled: req.body.remindAssignee === true,
      reminderSentAt: null,
    });

    await AppDataSource.getRepository(PlannerNote).save(note);
    res.deliver(201, true, await serializePlannerNote(note), 'Planner note created');
  } catch (error) {
    next(error);
  }
};

export const updatePlannerNote = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = getTenantId(req);
    const repo = AppDataSource.getRepository(PlannerNote);
    const note = await repo.findOne({ where: { id: req.params.id, tenantId, isDeleted: false } });
    if (!note) {
      throw new NotFoundError('Planner note not found');
    }

    if (typeof req.body.userId === 'string') {
      const userId = normalizeOptionalString(req.body.userId);
      if (!userId) {
        throw new BadRequestError('Planner user is required.');
      }
      await resolvePlannerUser(tenantId, userId);
      note.userId = userId;
    }

    if (typeof req.body.title === 'string') {
      const title = normalizeOptionalString(req.body.title);
      if (!title) {
        throw new BadRequestError('Title is required.');
      }
      note.title = title;
    }

    if (typeof req.body.date === 'string') {
      note.date = normalizeDateOnly(req.body.date, 'Date');
    }

    if (Object.prototype.hasOwnProperty.call(req.body, 'endDate')) {
      note.endDate = req.body.endDate == null || req.body.endDate === '' ? null : normalizeDateOnly(req.body.endDate, 'End date');
    }

    ensureDateRange(note.date, note.endDate);

    if (Object.prototype.hasOwnProperty.call(req.body, 'kind')) {
      note.kind = normalizeOptionalString(req.body.kind);
    }

    if (Object.prototype.hasOwnProperty.call(req.body, 'notes')) {
      note.notes = normalizeOptionalString(req.body.notes);
    }

    await repo.save(note);
    res.deliver(200, true, await serializePlannerNote(note), 'Planner note updated');
  } catch (error) {
    next(error);
  }
};

export const deletePlannerNote = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = getTenantId(req);
    const repo = AppDataSource.getRepository(PlannerNote);
    const note = await repo.findOne({ where: { id: req.params.id, tenantId, isDeleted: false } });
    if (!note) {
      throw new NotFoundError('Planner note not found');
    }

    note.isDeleted = true;
    await repo.save(note);
    res.deliver(200, true, null, 'Planner note deleted');
  } catch (error) {
    next(error);
  }
};

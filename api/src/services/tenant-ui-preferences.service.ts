import { AppDataSource } from '../config/data-source';
import { Tenant } from '../entities/tenant.entity';
import { BadRequestError, NotFoundError } from '../utils/errors';

type TenantUiPreferences = {
  boardColumnOrder?: Record<string, string[]>;
  plannerSettings?: PlannerSettings;
};

export type PlannerSettings = {
  workingDays: number[];
  usePublicHolidays: boolean;
  holidayCountryCode: string;
  holidaySubdivisionCode?: string | null;
  includeRegionalHolidays: boolean;
  customHolidays: Array<{ date: string; title: string }>;
};

export const DEFAULT_PLANNER_SETTINGS: PlannerSettings = {
  workingDays: [1, 2, 3, 4, 5],
  usePublicHolidays: true,
  holidayCountryCode: 'GB',
  holidaySubdivisionCode: null,
  includeRegionalHolidays: true,
  customHolidays: [],
};

const MAX_BOARD_KEY_LENGTH = 160;
const MAX_COLUMN_KEY_LENGTH = 120;
const MAX_COLUMNS = 80;

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const sanitizeBoardKey = (value: unknown) => {
  const key = String(value ?? '').trim();
  if (!key || key.length > MAX_BOARD_KEY_LENGTH || !/^[A-Za-z0-9:_./-]+$/.test(key)) {
    throw new BadRequestError('Invalid board key');
  }
  return key;
};

const sanitizeColumnOrder = (value: unknown) => {
  if (!Array.isArray(value)) {
    throw new BadRequestError('Invalid column order');
  }
  const seen = new Set<string>();
  return value
    .map((item) => String(item ?? '').trim())
    .filter((item) => item && item.length <= MAX_COLUMN_KEY_LENGTH)
    .filter((item) => {
      if (seen.has(item)) return false;
      seen.add(item);
      return true;
    })
    .slice(0, MAX_COLUMNS);
};

const sanitizePlannerSettings = (value: unknown): PlannerSettings => {
  if (!isPlainObject(value)) return DEFAULT_PLANNER_SETTINGS;
  const workingDays = Array.isArray(value.workingDays)
    ? Array.from(
        new Set(
          value.workingDays
            .map((day) => Number(day))
            .filter((day) => Number.isInteger(day) && day >= 0 && day <= 6),
        ),
      ).sort((a, b) => a - b)
    : DEFAULT_PLANNER_SETTINGS.workingDays;
  const countryCode = String(value.holidayCountryCode ?? value.countryCode ?? DEFAULT_PLANNER_SETTINGS.holidayCountryCode)
    .trim()
    .toUpperCase()
    .replace(/[^A-Z]/g, '')
    .slice(0, 2);
  const subdivisionCode = String(value.holidaySubdivisionCode ?? '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9-]/g, '')
    .slice(0, 12);
  const customHolidays = Array.isArray(value.customHolidays)
    ? value.customHolidays
        .map((holiday) => {
          if (!isPlainObject(holiday)) return null;
          const date = String(holiday.date ?? '').trim();
          const title = String(holiday.title ?? '').trim();
          if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !title) return null;
          return { date, title: title.slice(0, 120) };
        })
        .filter((holiday): holiday is { date: string; title: string } => Boolean(holiday))
        .slice(0, 200)
    : [];
  const usePublicHolidays =
    typeof value.usePublicHolidays === 'boolean'
      ? value.usePublicHolidays
      : typeof value.useGovBankHolidays === 'boolean'
        ? value.useGovBankHolidays
        : DEFAULT_PLANNER_SETTINGS.usePublicHolidays;
  return {
    workingDays: workingDays.length > 0 ? workingDays : DEFAULT_PLANNER_SETTINGS.workingDays,
    usePublicHolidays,
    holidayCountryCode: countryCode.length === 2 ? countryCode : DEFAULT_PLANNER_SETTINGS.holidayCountryCode,
    holidaySubdivisionCode: subdivisionCode || null,
    includeRegionalHolidays:
      typeof value.includeRegionalHolidays === 'boolean'
        ? value.includeRegionalHolidays
        : DEFAULT_PLANNER_SETTINGS.includeRegionalHolidays,
    customHolidays,
  };
};

const normalizeTenantUiPreferences = (value: unknown): TenantUiPreferences => {
  if (!isPlainObject(value)) return {};
  const boardColumnOrder: Record<string, string[]> = {};
  const rawBoardColumnOrder = value.boardColumnOrder;
  if (isPlainObject(rawBoardColumnOrder)) {
    Object.entries(rawBoardColumnOrder).forEach(([key, order]) => {
      try {
        const sanitizedKey = sanitizeBoardKey(key);
        const sanitizedOrder = sanitizeColumnOrder(order);
        if (sanitizedOrder.length > 0) {
          boardColumnOrder[sanitizedKey] = sanitizedOrder;
        }
      } catch {
        // Ignore malformed legacy preference entries instead of blocking the workspace.
      }
    });
  }
  const plannerSettings = isPlainObject(value.plannerSettings)
    ? sanitizePlannerSettings(value.plannerSettings)
    : undefined;
  return {
    ...(Object.keys(boardColumnOrder).length > 0 ? { boardColumnOrder } : {}),
    ...(plannerSettings ? { plannerSettings } : {}),
  };
};

const getTenantOrFail = async (tenantId: string) => {
  const repo = AppDataSource.getRepository(Tenant);
  const tenant = await repo.findOne({ where: { id: tenantId, isDeleted: false } });
  if (!tenant) {
    throw new NotFoundError('Tenant not found');
  }
  return { repo, tenant };
};

export const getTenantBoardColumnOrder = async (tenantId: string, rawKey: unknown) => {
  const key = sanitizeBoardKey(rawKey);
  const { tenant } = await getTenantOrFail(tenantId);
  const preferences = normalizeTenantUiPreferences(tenant.uiPreferences);
  return { key, order: preferences.boardColumnOrder?.[key] ?? [] };
};

export const updateTenantBoardColumnOrder = async (tenantId: string, rawKey: unknown, rawOrder: unknown) => {
  const key = sanitizeBoardKey(rawKey);
  const order = sanitizeColumnOrder(rawOrder);
  const { repo, tenant } = await getTenantOrFail(tenantId);
  const preferences = normalizeTenantUiPreferences(tenant.uiPreferences);
  const boardColumnOrder = { ...(preferences.boardColumnOrder ?? {}) };
  if (order.length === 0) {
    delete boardColumnOrder[key];
  } else {
    boardColumnOrder[key] = order;
  }
  tenant.uiPreferences = Object.keys(boardColumnOrder).length > 0 ? { ...preferences, boardColumnOrder } : {};
  await repo.save(tenant);
  return { key, order };
};

export const getTenantPlannerSettings = async (tenantId: string) => {
  const { tenant } = await getTenantOrFail(tenantId);
  const preferences = normalizeTenantUiPreferences(tenant.uiPreferences);
  return preferences.plannerSettings ?? DEFAULT_PLANNER_SETTINGS;
};

export const updateTenantPlannerSettings = async (tenantId: string, rawSettings: unknown) => {
  const { repo, tenant } = await getTenantOrFail(tenantId);
  const preferences = normalizeTenantUiPreferences(tenant.uiPreferences);
  const plannerSettings = sanitizePlannerSettings(rawSettings);
  tenant.uiPreferences = { ...preferences, plannerSettings };
  await repo.save(tenant);
  return plannerSettings;
};

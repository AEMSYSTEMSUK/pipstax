import { AppDataSource } from '../config/data-source';
import { Timesheet } from '../entities/timesheet.entity';

export const exportTimesheetsCsv = async (tenantId: string) => {
  const repo = AppDataSource.getRepository(Timesheet);
  const timesheets = await repo.find({ where: { tenantId, isDeleted: false } });
  const headers = ['id', 'workerId', 'date', 'hours', 'hourlyRate', 'approved'];
  const rows = timesheets.map((timesheet) => [
    timesheet.id,
    timesheet.workerId,
    timesheet.date,
    timesheet.hours,
    timesheet.hourlyRate ?? '',
    timesheet.approved
  ]);
  const csv = [headers, ...rows]
    .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    .join('\n');
  return csv;
};

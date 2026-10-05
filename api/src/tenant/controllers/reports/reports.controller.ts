import { Request, Response, NextFunction } from 'express';
import { AppDataSource } from '../../../config/data-source';
import { Lead } from '../../../entities/lead.entity';
import { Job } from '../../../entities/job.entity';
import { Quote } from '../../../entities/quote.entity';
import { Invoice } from '../../../entities/invoice.entity';
import { SplitInvoice } from '../../../entities/split-invoice.entity';
import { getTenantId } from '../../../utils/request';
import { InvoiceStatus, SplitInvoiceStatus } from '../../../constants/status';
import { buildSummaryPdf } from '../../../services/reports.service';
import { JobAssignment } from '../../../entities/job-assignment.entity';
import { ContractorProfile } from '../../../entities/contractor-profile.entity';
import { ContractorDocument } from '../../../entities/contractor-document.entity';
import { ComplianceRecord } from '../../../entities/compliance-record.entity';
import { CustomerSite } from '../../../entities/customer-site.entity';
import { RenewalOpportunity } from '../../../entities/renewal-opportunity.entity';
import { DocumentStatus, JobStatus } from '../../../constants/status';
import { loadTenantFeatureFlags } from '../../../services/tenant-features.service';
import { User } from '../../../entities/user.entity';

type ReportFilters = {
  customerId?: string;
  siteId?: string;
  month?: string;
  category?: string;
  salespersonId?: string;
};

type ReportScopeMeta = {
  customerId?: string;
  siteId?: string;
  scoped: boolean;
  leadMetricsAvailable: boolean;
  contractorComplianceAvailable: boolean;
  splitBillingAvailable: boolean;
};

const normalizeOptionalString = (value: unknown) => {
  if (typeof value !== 'string') {
    return undefined;
  }
  const nextValue = value.trim();
  return nextValue.length > 0 ? nextValue : undefined;
};

const getReportFilters = (req: Request): ReportFilters => ({
  customerId: normalizeOptionalString(req.query.customerId),
  siteId: normalizeOptionalString(req.query.siteId),
  month: normalizeOptionalString(req.query.month),
  category: normalizeOptionalString(req.query.category),
  salespersonId: normalizeOptionalString(req.query.salespersonId),
});

const buildReportScopeMeta = (filters: ReportFilters): ReportScopeMeta => {
  const scoped = Boolean(filters.customerId || filters.siteId);

  return {
    customerId: filters.customerId,
    siteId: filters.siteId,
    scoped,
    leadMetricsAvailable: !scoped,
    contractorComplianceAvailable: !scoped,
    splitBillingAvailable: false,
  };
};

const buildScopedWhere = (tenantId: string, filters: ReportFilters) => {
  const where: Record<string, unknown> = {
    tenantId,
    isDeleted: false,
  };

  if (filters.customerId) {
    where.customerId = filters.customerId;
  }

  if (filters.siteId) {
    where.siteId = filters.siteId;
  }

  return where;
};

const loadScopedSplitInvoices = async (tenantId: string, filters: ReportFilters) => {
  const repo = AppDataSource.getRepository(SplitInvoice);
  const rows = await repo.find({
    where: { tenantId, isDeleted: false },
    relations: ['job', 'linkedInvoice'],
    order: { createdAt: 'DESC' },
  });

  return rows.filter((entry) => {
    const job = entry.job;
    if (!job || job.isDeleted) return false;
    if (filters.customerId && job.customerId !== filters.customerId) return false;
    if (filters.siteId && job.siteId !== filters.siteId) return false;
    return true;
  });
};

const buildSplitBillingSummary = (splitInvoices: SplitInvoice[]) => {
  const totalLines = splitInvoices.length;
  const toSendValue = splitInvoices
    .filter((entry) => entry.status === SplitInvoiceStatus.TO_SEND)
    .reduce((sum, entry) => sum + Number(entry.valueExVat ?? 0), 0);
  const invoicedValue = splitInvoices
    .filter((entry) => entry.status === SplitInvoiceStatus.INVOICED)
    .reduce((sum, entry) => sum + Number(entry.valueExVat ?? 0), 0);
  const paidValue = splitInvoices
    .filter((entry) => entry.status === SplitInvoiceStatus.PAID)
    .reduce((sum, entry) => sum + Number(entry.valueExVat ?? 0), 0);
  const linkedCount = splitInvoices.filter((entry) => Boolean(entry.linkedInvoiceId)).length;

  return {
    totalLines,
    toSendValue,
    invoicedValue,
    paidValue,
    linkedCount,
    unlinkedCount: Math.max(totalLines - linkedCount, 0),
  };
};

const getInvoiceAmountPaid = (invoice: Invoice) =>
  Array.isArray(invoice.payments)
    ? invoice.payments.reduce((sum, payment) => {
        const amount = Number(payment?.amount ?? 0);
        return sum + (Number.isFinite(amount) && amount > 0 ? amount : 0);
      }, 0)
    : invoice.status === InvoiceStatus.PAID
      ? Number(invoice.total ?? 0)
      : 0;

const getJobSalespersonId = (job: Job) => {
  const lead = (job as any).lead as Lead | undefined;
  return lead?.assignedUserId ?? lead?.createdByUserId ?? job.createdByActorId ?? undefined;
};

const buildWipSummary = (jobs: Job[], invoices: Invoice[], users: User[] = [], filters: ReportFilters = {}) => {
  const activeStatuses = new Set<string>([
    JobStatus.CREATED,
    JobStatus.SCHEDULED,
    JobStatus.NOT_ASSIGNED,
    JobStatus.ASSIGNED,
    JobStatus.LIVE,
    JobStatus.EN_ROUTE,
    JobStatus.ON_SITE,
    JobStatus.REQUIRES_FOLLOW_UP,
    JobStatus.FINISHED,
  ]);
  const invoicedByJob = new Map<string, number>();
  invoices
    .filter((invoice) => invoice.jobId && invoice.status !== InvoiceStatus.VOID && invoice.status !== InvoiceStatus.DRAFT)
    .forEach((invoice) => {
      invoicedByJob.set(
        invoice.jobId!,
        (invoicedByJob.get(invoice.jobId!) ?? 0) + Number(invoice.total ?? 0),
      );
    });

  const userById = new Map(users.map((user) => [user.id, user]));
  const monthFilter = filters.month?.match(/^\d{4}-\d{2}$/) ? filters.month : undefined;
  const openItems = jobs
    .filter((job) => activeStatuses.has(String(job.status ?? '').toUpperCase()))
    .map((job) => {
      const jobValue = Number(job.amount ?? 0);
      const invoicedValue = invoicedByJob.get(job.id) ?? 0;
      const category = job.priority ?? 'Uncategorised';
      const salespersonId = getJobSalespersonId(job);
      const salesperson = salespersonId ? userById.get(salespersonId) : undefined;
      return {
        id: job.id,
        jobNumber: job.jobNumber,
        title: job.title,
        status: job.status,
        category,
        scheduledAt: job.scheduledAt,
        customerId: job.customerId,
        customerName: (job as any).customer?.name,
        siteId: job.siteId,
        siteName: (job as any).site?.name,
        salespersonId,
        salespersonName: salesperson?.fullName ?? salesperson?.email ?? 'Unassigned',
        jobValue: Number(jobValue.toFixed(2)),
        invoicedValue: Number(invoicedValue.toFixed(2)),
        remainingValue: Number(Math.max(0, jobValue - invoicedValue).toFixed(2)),
      };
    })
    .filter((item) => {
      if (monthFilter) {
        if (!item.scheduledAt) return false;
        const scheduled = new Date(item.scheduledAt);
        const scheduledMonth = `${scheduled.getFullYear()}-${String(scheduled.getMonth() + 1).padStart(2, '0')}`;
        if (scheduledMonth !== monthFilter) return false;
      }
      if (filters.category && item.category !== filters.category) return false;
      if (filters.salespersonId === '__unassigned__' && item.salespersonId) return false;
      if (filters.salespersonId && filters.salespersonId !== '__unassigned__' && item.salespersonId !== filters.salespersonId) return false;
      return true;
    })
    .filter((item) => item.remainingValue > 0);

  const byCategory = openItems.reduce<Record<string, { count: number; value: number }>>((acc, item) => {
    const category = item.category || 'Uncategorised';
    const row = acc[category] ?? { count: 0, value: 0 };
    row.count += 1;
    row.value = Number((row.value + item.remainingValue).toFixed(2));
    acc[category] = row;
    return acc;
  }, {});

  const bySalesperson = openItems.reduce<Record<string, { id?: string; name: string; count: number; value: number }>>((acc, item) => {
    const key = item.salespersonId ?? '__unassigned__';
    const row = acc[key] ?? { id: item.salespersonId, name: item.salespersonName, count: 0, value: 0 };
    row.count += 1;
    row.value = Number((row.value + item.remainingValue).toFixed(2));
    acc[key] = row;
    return acc;
  }, {});

  const byMonth = openItems.reduce<Record<string, { count: number; value: number }>>((acc, item) => {
    const date = item.scheduledAt ? new Date(item.scheduledAt) : null;
    const key = date && !Number.isNaN(date.getTime())
      ? `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
      : 'Unscheduled';
    const row = acc[key] ?? { count: 0, value: 0 };
    row.count += 1;
    row.value = Number((row.value + item.remainingValue).toFixed(2));
    acc[key] = row;
    return acc;
  }, {});

  return {
    count: openItems.length,
    totalValue: Number(openItems.reduce((sum, item) => sum + item.remainingValue, 0).toFixed(2)),
    byCategory,
    bySalesperson,
    byMonth,
    items: openItems,
  };
};

const buildSummaryMetrics = async (tenantId: string, filters: ReportFilters) => {
  const leadRepo = AppDataSource.getRepository(Lead);
  const jobRepo = AppDataSource.getRepository(Job);
  const quoteRepo = AppDataSource.getRepository(Quote);
  const invoiceRepo = AppDataSource.getRepository(Invoice);
  const siteRepo = AppDataSource.getRepository(CustomerSite);
  const complianceRepo = AppDataSource.getRepository(ComplianceRecord);
  const renewalRepo = AppDataSource.getRepository(RenewalOpportunity);
  const scopedWhere = buildScopedWhere(tenantId, filters);
  const flags = await loadTenantFeatureFlags(tenantId);
  const scope = {
    ...buildReportScopeMeta(filters),
    splitBillingAvailable: flags.splitInvoicing,
  };

  const [jobs, quotes, invoices] = await Promise.all([
    jobRepo.find({ where: scopedWhere, relations: ['customer', 'site', 'lead'] }),
    quoteRepo.find({ where: scopedWhere }),
    invoiceRepo.find({ where: scopedWhere }),
  ]);
  const splitInvoices = scope.splitBillingAvailable
    ? await loadScopedSplitInvoices(tenantId, filters)
    : [];

  const leads = scope.leadMetricsAvailable
    ? await leadRepo.count({ where: { tenantId, isDeleted: false } })
    : null;

  const overdueInvoices = invoices.filter((invoice) => invoice.status === InvoiceStatus.OVERDUE);

  const revenueTotal = invoices.reduce((sum, invoice) => sum + getInvoiceAmountPaid(invoice), 0);
  const optionalMetrics = {
    sites: flags.sites ? await siteRepo.count({ where: { tenantId, isDeleted: false } }) : null,
    compliancePendingReview: flags.complianceReports
      ? await complianceRepo.count({ where: { tenantId, isDeleted: false, reviewStatus: 'PENDING_REVIEW' } })
      : null,
    renewalsDue: flags.renewals
      ? await renewalRepo.count({ where: { tenantId, isDeleted: false, status: 'OPEN' } })
      : null,
  };
  const userIds = Array.from(new Set(jobs.map(getJobSalespersonId).filter((id): id is string => Boolean(id))));
  const users = userIds.length
    ? await AppDataSource.getRepository(User).find({ where: userIds.map((id) => ({ id, tenantId, isDeleted: false })) })
    : [];
  const wip = buildWipSummary(jobs, invoices, users, filters);

  return {
    leads,
    jobs: jobs.length,
    quotes: quotes.length,
    invoices: invoices.length,
    revenueTotal: Number(revenueTotal.toFixed(2)),
    revenueLabel: 'Total received',
    overdueCount: overdueInvoices.length,
    optionalMetrics,
    wip,
    splitBilling: buildSplitBillingSummary(splitInvoices),
    leadMetricsAvailable: scope.leadMetricsAvailable,
    reportScope: scope,
  };
};

export const getDashboardReport = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = getTenantId(req);
    const metrics = await buildSummaryMetrics(tenantId, getReportFilters(req));
    res.deliver(200, true, metrics, 'Dashboard report');
  } catch (error) {
    next(error);
  }
};

export const getWipReport = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = getTenantId(req);
    const jobRepo = AppDataSource.getRepository(Job);
    const invoiceRepo = AppDataSource.getRepository(Invoice);
    const filters = getReportFilters(req);
    const scopedWhere = buildScopedWhere(tenantId, filters);

    const [jobs, invoices] = await Promise.all([
      jobRepo.find({ where: scopedWhere, relations: ['customer', 'site', 'lead'], order: { scheduledAt: 'ASC', createdAt: 'DESC' } }),
      invoiceRepo.find({ where: scopedWhere }),
    ]);
    const userIds = Array.from(new Set(jobs.map(getJobSalespersonId).filter((id): id is string => Boolean(id))));
    const users = userIds.length
      ? await AppDataSource.getRepository(User).find({ where: userIds.map((id) => ({ id, tenantId, isDeleted: false })) })
      : [];
    const wip = buildWipSummary(jobs, invoices, users, filters);

    res.deliver(200, true, {
      ...wip,
      filters: {
        month: filters.month ?? null,
        category: filters.category ?? null,
        salespersonId: filters.salespersonId ?? null,
      },
      filterOptions: {
        categories: Object.keys(buildWipSummary(jobs, invoices, users, { ...filters, category: undefined }).byCategory).sort(),
        months: Object.keys(buildWipSummary(jobs, invoices, users, { ...filters, month: undefined }).byMonth).sort(),
        salespeople: Object.values(buildWipSummary(jobs, invoices, users, { ...filters, salespersonId: undefined }).bySalesperson)
          .sort((a, b) => a.name.localeCompare(b.name)),
      },
    }, 'WIP report');
  } catch (error) {
    next(error);
  }
};

export const downloadSummaryPdf = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = getTenantId(req);
    const metrics = await buildSummaryMetrics(tenantId, getReportFilters(req));
    const pdf = await buildSummaryPdf(metrics);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'inline; filename=summary-report.pdf');
    res.status(200).send(pdf);
  } catch (error) {
    next(error);
  }
};

export const exportSummaryCsv = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = getTenantId(req);
    const metrics = await buildSummaryMetrics(tenantId, getReportFilters(req));
    const headers = ['leads', 'jobs', 'quotes', 'invoices', 'revenueTotal', 'overdueCount', 'splitLines', 'splitToSendValue', 'splitInvoicedValue', 'splitPaidValue', 'splitUnlinkedCount'];
    const rows = [
      [
        metrics.leadMetricsAvailable === false ? 'N/A' : metrics.leads ?? 0,
        metrics.jobs,
        metrics.quotes,
        metrics.invoices,
        metrics.revenueTotal,
        metrics.overdueCount,
        metrics.splitBilling?.totalLines ?? 0,
        metrics.splitBilling?.toSendValue ?? 0,
        metrics.splitBilling?.invoicedValue ?? 0,
        metrics.splitBilling?.paidValue ?? 0,
        metrics.splitBilling?.unlinkedCount ?? 0,
      ]
    ];
    const csv = [headers, ...rows]
      .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      .join('\n');
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=summary-report.csv');
    res.status(200).send(csv);
  } catch (error) {
    next(error);
  }
};

export const getInsightsReport = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = getTenantId(req);
    const jobRepo = AppDataSource.getRepository(Job);
    const quoteRepo = AppDataSource.getRepository(Quote);
    const invoiceRepo = AppDataSource.getRepository(Invoice);
    const assignmentRepo = AppDataSource.getRepository(JobAssignment);
    const contractorRepo = AppDataSource.getRepository(ContractorProfile);
    const contractorDocRepo = AppDataSource.getRepository(ContractorDocument);
    const filters = getReportFilters(req);
    const scopedWhere = buildScopedWhere(tenantId, filters);
    const flags = await loadTenantFeatureFlags(tenantId);
    const scope = {
      ...buildReportScopeMeta(filters),
      splitBillingAvailable: flags.splitInvoicing,
    };

    const [quotes, jobs, invoices] = await Promise.all([
      quoteRepo.find({ where: scopedWhere }),
      jobRepo.find({ where: scopedWhere, relations: ['customer', 'site', 'lead'] }),
      invoiceRepo.find({ where: scopedWhere })
    ]);
    const splitInvoices = scope.splitBillingAvailable
      ? await loadScopedSplitInvoices(tenantId, filters)
      : [];
    const leadRepo = AppDataSource.getRepository(Lead);
    const leads = scope.leadMetricsAvailable
      ? await leadRepo.find({ where: { tenantId, isDeleted: false } })
      : [];

    const revenueByClient: Record<string, number> = {};
    const revenueByJob: Record<string, number> = {};
    invoices
      .filter((invoice) => getInvoiceAmountPaid(invoice) > 0)
      .forEach((invoice) => {
        const paidAmount = getInvoiceAmountPaid(invoice);
        if (invoice.customerId) {
          revenueByClient[invoice.customerId] = (revenueByClient[invoice.customerId] ?? 0) + paidAmount;
        }
        if (invoice.jobId) {
          revenueByJob[invoice.jobId] = (revenueByJob[invoice.jobId] ?? 0) + paidAmount;
        }
      });

    const leadSourceBreakdown: Record<string, number> = {};
    if (scope.leadMetricsAvailable) {
      leads.forEach((lead) => {
        const source = lead.source ?? 'Unknown';
        leadSourceBreakdown[source] = (leadSourceBreakdown[source] ?? 0) + 1;
      });
    }

    const pipelineSummary = jobs.reduce<Record<string, number>>((acc, job) => {
      acc[job.status] = (acc[job.status] ?? 0) + 1;
      return acc;
    }, {});

    const leadToQuoteRate =
      scope.leadMetricsAvailable && leads.length ? quotes.length / leads.length : null;
    const leadToJobRate =
      scope.leadMetricsAvailable && leads.length ? jobs.length / leads.length : null;

    const outstandingInvoices = invoices.filter(
      (invoice) => invoice.status === InvoiceStatus.SENT || invoice.status === InvoiceStatus.OVERDUE
    );

    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const quarterStart = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1);
    const monthlyRevenue = invoices
      .reduce((sum, invoice) => {
        const payments = invoice.payments ?? [];
        if (payments.length === 0 && invoice.status === InvoiceStatus.PAID && invoice.paidAt && invoice.paidAt >= monthStart) {
          return sum + Number(invoice.total ?? 0);
        }
        const paymentTotal = payments
          .filter((payment) => new Date(payment.paymentDate).getTime() >= monthStart.getTime())
          .reduce((innerSum, payment) => innerSum + Number(payment.amount ?? 0), 0);
        return sum + paymentTotal;
      }, 0);
    const quarterlyRevenue = invoices
      .reduce((sum, invoice) => {
        const payments = invoice.payments ?? [];
        if (payments.length === 0 && invoice.status === InvoiceStatus.PAID && invoice.paidAt && invoice.paidAt >= quarterStart) {
          return sum + Number(invoice.total ?? 0);
        }
        const paymentTotal = payments
          .filter((payment) => new Date(payment.paymentDate).getTime() >= quarterStart.getTime())
          .reduce((innerSum, payment) => innerSum + Number(payment.amount ?? 0), 0);
        return sum + paymentTotal;
      }, 0);
    const splitBilling = buildSplitBillingSummary(splitInvoices);
    const userIds = Array.from(new Set(jobs.map(getJobSalespersonId).filter((id): id is string => Boolean(id))));
    const users = userIds.length
      ? await AppDataSource.getRepository(User).find({ where: userIds.map((id) => ({ id, tenantId, isDeleted: false })) })
      : [];
    const wip = buildWipSummary(jobs, invoices, users, filters);

    const scopedJobIds = new Set(jobs.map((job) => job.id));
    const assignments = await assignmentRepo.find({ where: { tenantId, isDeleted: false, isActive: true } });
    const completedJobs = jobs.filter((job) => job.status === JobStatus.COMPLETED);
    const workerPerformance: Record<
      string,
      { jobsCompleted: number; avgCompletionHours: number }
    > = {};
    assignments.forEach((assignment) => {
      if (!scopedJobIds.has(assignment.jobId)) return;
      const job = completedJobs.find((j) => j.id === assignment.jobId);
      if (!job) return;
      const entry = workerPerformance[assignment.userId] ?? { jobsCompleted: 0, avgCompletionHours: 0 };
      entry.jobsCompleted += 1;
      if (job.scheduledAt && job.completedAt) {
        const hours = (job.completedAt.getTime() - job.scheduledAt.getTime()) / (1000 * 60 * 60);
        entry.avgCompletionHours = (entry.avgCompletionHours * (entry.jobsCompleted - 1) + hours) / entry.jobsCompleted;
      }
      workerPerformance[assignment.userId] = entry;
    });

    let normalizedContractorCompliance: Array<{
      contractorId: string;
      companyName?: string;
      totalDocs: number;
      approvedDocs: number;
      complianceStatus: string;
    }> = [];

    if (scope.contractorComplianceAvailable) {
      const [contractors, contractorDocs] = await Promise.all([
        contractorRepo.find({ where: { tenantId, isDeleted: false } }),
        contractorDocRepo.find({ where: { tenantId, isDeleted: false } }),
      ]);
      normalizedContractorCompliance = contractors.map((contractor) => {
        const docs = contractorDocs.filter((doc) => doc.contractorId === contractor.id);
        const approved = docs.filter((doc) => doc.status === DocumentStatus.APPROVED).length;
        return {
          contractorId: contractor.id,
          companyName: contractor.companyName,
          totalDocs: docs.length,
          approvedDocs: approved,
          complianceStatus: contractor.complianceStatus,
        };
      });
    }

    res.deliver(200, true, {
      revenueByClient,
      revenueByJob,
      outstandingInvoices: {
        count: outstandingInvoices.length,
        total: outstandingInvoices.reduce((sum, invoice) => sum + Number(invoice.total ?? 0), 0)
      },
      leadConversion: {
        leadToQuoteRate,
        leadToJobRate
      },
      leadSourceBreakdown,
      workerPerformance,
      contractorCompliance: normalizedContractorCompliance,
      reportScope: scope,
      pipelineSummary,
      monthlyRevenue,
      quarterlyRevenue,
      splitBilling,
      wip,
    }, 'Insights report');
  } catch (error) {
    next(error);
  }
};

import { Request, Response, NextFunction } from 'express';
import { AppDataSource } from '../../../config/data-source';
import { Job } from '../../../entities/job.entity';
import { getTenantId } from '../../../utils/request';
import { NotFoundError } from '../../../utils/errors';
import { JobAssignment } from '../../../entities/job-assignment.entity';
import { AssignmentType } from '../../../constants/jobs';
import { ContractorProfile } from '../../../entities/contractor-profile.entity';
import { ContractorComplianceStatus, JobStatus } from '../../../constants/status';
import { BadRequestError } from '../../../utils/errors';
import { SystemRole } from '../../../constants/roles';
import { EmployeeTeam } from '../../../entities/employee-team.entity';
import { EmployeeTeamMember } from '../../../entities/employee-team-member.entity';
import { User } from '../../../entities/user.entity';
import { Tenant } from '../../../entities/tenant.entity';
import { deriveJobLifecycleStatus, getActiveAssignmentCountMap, syncJobLifecyclesForList } from '../../../services/jobs/job-lifecycle.service';
import { createInAppNotification, notifyAdmins } from '../../../services/in-app-notifications.service';
import { Customer } from '../../../entities/customer.entity';
import {
  buildCustomerSiteAddress,
  ensureCustomerSiteForTenant,
} from '../../../services/customer-sites.service';
import { CustomerSite } from '../../../entities/customer-site.entity';
import { assertTenantFeatureEnabled, loadTenantFeatureFlags } from '../../../services/tenant-features.service';
import { normalizeTenantFeatureFlags } from '../../../services/tenant-features.service';
import {
  getWorkflowDisplayState,
  loadTenantWorkflowConfig,
  resolveWorkflowStageKeyForRecord,
  TenantWorkflowConfig,
} from '../../../services/workflow-config.service';
import { JobActivity } from '../../../entities/job-activity.entity';
import { createJobActivity } from '../../../services/job-activity.service';
import { syncPlannerEntriesForJob } from '../../../services/planner-entries.service';
import { Quote } from '../../../entities/quote.entity';
import { LeadTask } from '../../../entities/lead-task.entity';
import { LeadTaskStatus, QuoteStatus } from '../../../constants/status';
import { ensureJobNumber } from '../../../services/document-number.service';

const visibleJobStatuses = new Set<JobStatus>([
  JobStatus.NOT_ASSIGNED,
  JobStatus.ASSIGNED,
  JobStatus.LIVE,
  JobStatus.REQUIRES_FOLLOW_UP,
  JobStatus.FINISHED,
  JobStatus.COMPLETED,
]);

const normalizeVisibleJobStatus = (value: unknown) => {
  const normalized = String(value ?? '').trim().toUpperCase();
  if (!normalized) return null;
  if (normalized === JobStatus.EN_ROUTE || normalized === JobStatus.ON_SITE) return JobStatus.LIVE;
  if (normalized === JobStatus.REQUIRES_FOLLOW_UP) return JobStatus.REQUIRES_FOLLOW_UP;
  if (normalized === JobStatus.CREATED || normalized === JobStatus.SCHEDULED || normalized === JobStatus.CANCELLED) {
    return JobStatus.NOT_ASSIGNED;
  }
  return visibleJobStatuses.has(normalized as JobStatus) ? normalized as JobStatus : null;
};

const normalizeOptionalString = (value: unknown) => {
  if (typeof value !== 'string') {
    return undefined;
  }
  const nextValue = value.trim();
  return nextValue.length > 0 ? nextValue : undefined;
};

const hydrateJobLocationFromSite = (job: Partial<Job>, siteLocation?: string) => {
  if (!normalizeOptionalString(job.location) && siteLocation) {
    job.location = siteLocation;
  }
};

const formatJobAddress = (job: Partial<Job>) =>
  [
    job.addressLine1,
    job.addressLine2,
    job.city,
    job.state,
    job.postalCode,
    job.country,
  ]
    .map((part) => String(part ?? '').trim())
    .filter(Boolean)
    .join(', ');

const assignJobAddressFields = (job: Partial<Job>, source: Partial<Job>) => {
  job.addressLine1 = normalizeOptionalString(source.addressLine1);
  job.addressLine2 = normalizeOptionalString(source.addressLine2);
  job.city = normalizeOptionalString(source.city);
  job.state = normalizeOptionalString(source.state);
  job.postalCode = normalizeOptionalString(source.postalCode);
  job.country = normalizeOptionalString(source.country);
};

const hydrateJobAddressFromSite = (job: Partial<Job>, site?: CustomerSite | null) => {
  if (!site || job.addressManuallyEdited) return;
  job.addressLine1 = normalizeOptionalString(job.addressLine1) ?? site.addressLine1;
  job.addressLine2 = normalizeOptionalString(job.addressLine2) ?? site.addressLine2;
  job.city = normalizeOptionalString(job.city) ?? site.city;
  job.state = normalizeOptionalString(job.state) ?? site.state;
  job.postalCode = normalizeOptionalString(job.postalCode) ?? site.postalCode;
  job.country = normalizeOptionalString(job.country) ?? site.country;
};

const hydrateJobLocationFromAddress = (job: Partial<Job>) => {
  const formattedAddress = formatJobAddress(job);
  if (formattedAddress) {
    job.location = formattedAddress;
  }
};

const enrichJobWithSite = async (
  job: Job,
  workflowContext?: { workflowEnabled: boolean; workflowConfig: TenantWorkflowConfig | null },
  includeWorkflowStageOptions = false,
) => {
  const site = job.siteId
    ? await ensureCustomerSiteForTenant(job.tenantId, job.siteId).catch(() => null)
    : null;
  const workflowDisplay = getWorkflowDisplayState({
    config: workflowContext?.workflowConfig ?? (await loadTenantWorkflowConfig(job.tenantId)),
    module: 'jobs',
    baseStatus: job.status,
    workflowStageKey: job.workflowStageKey,
    enabled: workflowContext?.workflowEnabled ?? (await isWorkflowOverlayEnabled(job.tenantId)),
  });
  return {
    ...job,
    siteName: site?.name ?? null,
    siteReference: site?.reference ?? null,
    siteAddress: buildCustomerSiteAddress(site) ?? null,
    ...workflowDisplay,
    workflowStageOptions: includeWorkflowStageOptions
      ? (workflowContext?.workflowConfig?.jobs.stages ?? []).map((stage) => ({
          key: stage.key,
          label: stage.label,
          baseStatus: stage.baseStatus,
        }))
      : undefined,
  };
};

const isWorkflowOverlayEnabled = async (tenantId: string) => {
  const tenant = await AppDataSource.getRepository(Tenant).findOne({
    where: { id: tenantId, isDeleted: false },
    select: ['id', 'featureFlags'],
  });
  if (!tenant) {
    throw new NotFoundError('Tenant not found');
  }
  return normalizeTenantFeatureFlags(tenant.featureFlags).complianceWorkflows;
};


export const listJobs = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = getTenantId(req);
    const repo = AppDataSource.getRepository(Job);
    const workflowEnabled = await isWorkflowOverlayEnabled(tenantId);
    const workflowConfig = workflowEnabled ? await loadTenantWorkflowConfig(tenantId) : null;
    const roles = req.roles ?? [];
    if (roles.includes(SystemRole.FIELD_WORKER) || roles.includes(SystemRole.SUB_CONTRACTOR)) {
      const assignmentsRepo = AppDataSource.getRepository(JobAssignment);
      const assignments = await assignmentsRepo.find({
        where: { tenantId, userId: req.userId, isDeleted: false, isActive: true }
      });
      const jobIds = assignments.map((a) => a.jobId);
      const jobs = jobIds.length
        ? await repo.find({ where: jobIds.map((id) => ({ id, tenantId, isDeleted: false })) })
        : [];
      await syncJobLifecyclesForList(repo, tenantId, jobs);
      return res.deliver(
        200,
        true,
        await Promise.all(
          jobs.map((job) => enrichJobWithSite(job, { workflowEnabled, workflowConfig })),
        ),
        'Assigned jobs fetched',
      );
    }
    const jobs = await repo.find({ where: { tenantId, isDeleted: false } });
    await syncJobLifecyclesForList(repo, tenantId, jobs);
    res.deliver(
      200,
      true,
      await Promise.all(
        jobs.map((job) => enrichJobWithSite(job, { workflowEnabled, workflowConfig })),
      ),
      'Jobs fetched',
    );
  } catch (error) {
    next(error);
  }
};

export const listMyJobs = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = getTenantId(req);
    const userId = req.userId;
    if (!userId) {
      throw new NotFoundError('User not found');
    }
    const assignmentsRepo = AppDataSource.getRepository(JobAssignment);
    const jobRepo = AppDataSource.getRepository(Job);
    const assignments = await assignmentsRepo.find({
      where: { tenantId, userId, isDeleted: false, isActive: true }
    });
    const jobIds = assignments.map((a) => a.jobId);
    const jobs = jobIds.length
      ? await jobRepo.find({ where: jobIds.map((id) => ({ id, tenantId, isDeleted: false })) })
      : [];
    await syncJobLifecyclesForList(jobRepo, tenantId, jobs);
    const workflowEnabled = await isWorkflowOverlayEnabled(tenantId);
    const workflowConfig = workflowEnabled ? await loadTenantWorkflowConfig(tenantId) : null;
    res.deliver(
      200,
      true,
      await Promise.all(
        jobs.map((job) => enrichJobWithSite(job, { workflowEnabled, workflowConfig })),
      ),
      'Assigned jobs fetched',
    );
  } catch (error) {
    next(error);
  }
};

export const getJob = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = getTenantId(req);
    const repo = AppDataSource.getRepository(Job);
    const job = await repo.findOne({ where: { id: req.params.id, tenantId, isDeleted: false } });
    if (!job) {
      throw new NotFoundError('Job not found');
    }
    const roles = req.roles ?? [];
    if (roles.includes(SystemRole.FIELD_WORKER) || roles.includes(SystemRole.SUB_CONTRACTOR)) {
      const assignmentsRepo = AppDataSource.getRepository(JobAssignment);
      const assignment = await assignmentsRepo.findOne({
        where: { jobId: job.id, tenantId, userId: req.userId, isDeleted: false, isActive: true }
      });
      if (!assignment) {
        throw new NotFoundError('Job not found');
      }
    }
    const assignmentCountMap = await getActiveAssignmentCountMap(tenantId, [job.id]);
    const nextStatus = deriveJobLifecycleStatus(job, assignmentCountMap.get(job.id) ?? 0);
    if (nextStatus !== job.status) {
      job.status = nextStatus;
      await repo.save(job);
    }
    const workflowEnabled = await isWorkflowOverlayEnabled(tenantId);
    const workflowConfig = workflowEnabled ? await loadTenantWorkflowConfig(tenantId) : null;
    res.deliver(
      200,
      true,
      await enrichJobWithSite(job, { workflowEnabled, workflowConfig }, true),
      'Job fetched',
    );
  } catch (error) {
    next(error);
  }
};

export const createJob = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = getTenantId(req);
    const repo = AppDataSource.getRepository(Job);
    const customerRepo = AppDataSource.getRepository(Customer);
    const customerId = normalizeOptionalString(req.body.customerId);
    const siteId = normalizeOptionalString(req.body.siteId);
    const featureFlags = await loadTenantFeatureFlags(tenantId);
    let site: CustomerSite | null = null;

    if (!customerId) {
      throw new BadRequestError('Customer is required for jobs.');
    }
    if (featureFlags.sites && !siteId) {
      throw new BadRequestError('Customer site is required for jobs when the Sites module is enabled.');
    }

    const customer = await customerRepo.findOne({
      where: { id: customerId, tenantId, isDeleted: false },
    });
    if (!customer) {
      throw new BadRequestError('Selected customer not found.');
    }

    if (siteId) {
      await assertTenantFeatureEnabled(tenantId, 'sites', 'Sites module is not enabled for this workspace.');
      if (!customerId) {
        throw new BadRequestError('Select a customer before linking a site to the job.');
      }
      site = await ensureCustomerSiteForTenant(tenantId, siteId);
      if (site.customerId !== customerId) {
        throw new BadRequestError('Selected site does not belong to the chosen customer.');
      }
    }

    const payload: Partial<Job> = {
      ...req.body,
      customerId,
      siteId,
      location: normalizeOptionalString(req.body.location),
      tenantId,
      status: JobStatus.NOT_ASSIGNED,
      addressManuallyEdited: req.body.addressManuallyEdited === true,
    };
    const sourceQuoteId = normalizeOptionalString(req.body.sourceQuoteId);
    if (sourceQuoteId) {
      const sourceQuote = await AppDataSource.getRepository(Quote).findOne({
        where: { id: sourceQuoteId, tenantId, isDeleted: false },
      });
      if (!sourceQuote) {
        throw new BadRequestError('Source quote not found.');
      }
      if (sourceQuote.status !== QuoteStatus.SIGNED) {
        throw new BadRequestError('Only accepted quotes can be converted to jobs.');
      }
      payload.leadId = payload.leadId ?? sourceQuote.leadId;
    }
    assignJobAddressFields(payload, req.body);
    hydrateJobAddressFromSite(payload, site);
    hydrateJobLocationFromAddress(payload);
    hydrateJobLocationFromSite(payload, site ? buildCustomerSiteAddress(site) : undefined);
    const job = repo.create({
      ...payload,
    });
    job.workflowStageKey = await resolveWorkflowStageKeyForRecord({
      tenantId,
      module: 'jobs',
      baseStatus: job.status,
      requestedStageKey: normalizeOptionalString(req.body.workflowStageKey),
      featureEnabled: await isWorkflowOverlayEnabled(tenantId),
    });
    await repo.save(job);
    await syncPlannerEntriesForJob(tenantId, job.id);
    await ensureJobNumber(job);
    if (sourceQuoteId) {
      const quoteRepo = AppDataSource.getRepository(Quote);
      const sourceQuote = await quoteRepo.findOne({
        where: { id: sourceQuoteId, tenantId, isDeleted: false },
      });
      if (sourceQuote) {
        sourceQuote.jobId = job.id;
        sourceQuote.customerId = sourceQuote.customerId ?? job.customerId;
        sourceQuote.siteId = sourceQuote.siteId ?? job.siteId;
        await quoteRepo.save(sourceQuote);
        if (sourceQuote.leadId) {
          const adminUser = await AppDataSource.getRepository(User)
            .createQueryBuilder('user')
            .leftJoinAndSelect('user.roles', 'role')
            .where('user.tenantId = :tenantId', { tenantId })
            .andWhere('user.isDeleted = false')
            .andWhere('user.isActive = true')
            .andWhere('role.code = :adminRole', { adminRole: SystemRole.ADMIN })
            .getOne();
          const task = AppDataSource.getRepository(LeadTask).create({
            tenantId,
            leadId: sourceQuote.leadId,
            title: `Assign crew for job "${job.title}"`,
            taskType: 'JOB_ASSIGNMENT',
            description: `Accepted quote ${sourceQuote.quoteNumber ?? sourceQuote.id} was converted to a job. Assign the job to the right crew.`,
            status: LeadTaskStatus.OPEN,
            assigneeUserId: adminUser?.id ?? req.userId,
            createdByUserId: req.userId,
          });
          await AppDataSource.getRepository(LeadTask).save(task);
        }
        notifyAdmins({
          tenantId,
          title: 'Job Needs Assignment',
          message: `Quote ${sourceQuote.quoteNumber ?? sourceQuote.id} was converted to job "${job.title}". Assign crew before work starts.`,
          targetUrl: `/admin/schedule/${job.id}`,
        }).catch(err => console.error('Job assignment notification failed:', err));
      }
    }
    await createJobActivity({
      tenantId,
      jobId: job.id,
      userId: req.userId,
      type: 'Job Created',
      message: `Job "${job.title}" created.`,
      metadata: { status: job.status, customerId: job.customerId, siteId: job.siteId ?? null },
    });
    const workflowEnabled = await isWorkflowOverlayEnabled(tenantId);
    const workflowConfig = workflowEnabled ? await loadTenantWorkflowConfig(tenantId) : null;
    res.deliver(201, true, await enrichJobWithSite(job, { workflowEnabled, workflowConfig }), 'Job created');
  } catch (error) {
    next(error);
  }
};

export const updateJob = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = getTenantId(req);
    const repo = AppDataSource.getRepository(Job);
    const customerRepo = AppDataSource.getRepository(Customer);
    const job = await repo.findOne({ where: { id: req.params.id, tenantId, isDeleted: false } });
    if (!job) {
      throw new NotFoundError('Job not found');
    }
    const previousCustomerId = job.customerId;
    const customerId =
      typeof req.body.customerId === 'string' ? normalizeOptionalString(req.body.customerId) : job.customerId;
    const featureFlags = await loadTenantFeatureFlags(tenantId);
    let site: CustomerSite | null = null;

    if (!customerId) {
      throw new BadRequestError('Customer is required for jobs.');
    }
    const customer = await customerRepo.findOne({
      where: { id: customerId, tenantId, isDeleted: false },
    });
    if (!customer) {
      throw new BadRequestError('Selected customer not found.');
    }
    job.customerId = customer.id;

    if (
      typeof req.body.customerId === 'string' &&
      previousCustomerId !== job.customerId &&
      typeof req.body.siteId !== 'string'
    ) {
      job.siteId = undefined;
    }

    const siteIdChanged = typeof req.body.siteId === 'string';
    if (siteIdChanged) {
      const siteId = normalizeOptionalString(req.body.siteId);
      if (!siteId) {
        job.siteId = undefined;
      } else {
        await assertTenantFeatureEnabled(tenantId, 'sites', 'Sites module is not enabled for this workspace.');
        if (!job.customerId) {
          throw new BadRequestError('Select a customer before linking a site to the job.');
        }
        site = await ensureCustomerSiteForTenant(tenantId, siteId);
        if (site.customerId !== job.customerId) {
          throw new BadRequestError('Selected site does not belong to the chosen customer.');
        }
        job.siteId = site.id;
      }
    }
    if (featureFlags.sites && !job.siteId) {
      throw new BadRequestError('Customer site is required for jobs when the Sites module is enabled.');
    }

    Object.assign(job, {
      ...req.body,
      location: typeof req.body.location === 'string' ? normalizeOptionalString(req.body.location) : job.location,
    });
    if (typeof req.body.addressManuallyEdited === 'boolean') {
      job.addressManuallyEdited = req.body.addressManuallyEdited;
    } else if (siteIdChanged && site) {
      job.addressManuallyEdited = false;
    }
    assignJobAddressFields(job, {
      addressLine1: typeof req.body.addressLine1 === 'string' ? req.body.addressLine1 : job.addressLine1,
      addressLine2: typeof req.body.addressLine2 === 'string' ? req.body.addressLine2 : job.addressLine2,
      city: typeof req.body.city === 'string' ? req.body.city : job.city,
      state: typeof req.body.state === 'string' ? req.body.state : job.state,
      postalCode: typeof req.body.postalCode === 'string' ? req.body.postalCode : job.postalCode,
      country: typeof req.body.country === 'string' ? req.body.country : job.country,
    });
    hydrateJobAddressFromSite(job, site);
    hydrateJobLocationFromAddress(job);
    hydrateJobLocationFromSite(job, site ? buildCustomerSiteAddress(site) : undefined);
    if (job.status !== JobStatus.COMPLETED) {
      const assignmentCountMap = await getActiveAssignmentCountMap(tenantId, [job.id]);
      job.status = deriveJobLifecycleStatus(job, assignmentCountMap.get(job.id) ?? 0);
    }
    job.workflowStageKey = await resolveWorkflowStageKeyForRecord({
      tenantId,
      module: 'jobs',
      baseStatus: job.status,
      requestedStageKey:
        typeof req.body.workflowStageKey === 'string' ? normalizeOptionalString(req.body.workflowStageKey) : undefined,
      currentStageKey: job.workflowStageKey,
      featureEnabled: await isWorkflowOverlayEnabled(tenantId),
    });
    await repo.save(job);
    await createJobActivity({
      tenantId,
      jobId: job.id,
      userId: req.userId,
      type: 'Job Updated',
      message: `Job "${job.title}" updated.`,
      metadata: { status: job.status, customerId: job.customerId, siteId: job.siteId ?? null },
    });
    const workflowEnabled = await isWorkflowOverlayEnabled(tenantId);
    const workflowConfig = workflowEnabled ? await loadTenantWorkflowConfig(tenantId) : null;
    res.deliver(200, true, await enrichJobWithSite(job, { workflowEnabled, workflowConfig }), 'Job updated');
  } catch (error) {
    next(error);
  }
};

export const updateJobStatus = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = getTenantId(req);
    const repo = AppDataSource.getRepository(Job);
    const job = await repo.findOne({ where: { id: req.params.id, tenantId, isDeleted: false } });
    if (!job) {
      throw new NotFoundError('Job not found');
    }
    const previousStatus = job.status;
    const newStatus = normalizeVisibleJobStatus(req.body.status);
    if (!newStatus) {
      throw new BadRequestError('Unsupported job status.');
    }
    
    job.status = newStatus;
    if (newStatus === JobStatus.COMPLETED || newStatus === JobStatus.FINISHED) {
      job.completedAt = new Date();
    }
    job.workflowStageKey = await resolveWorkflowStageKeyForRecord({
      tenantId,
      module: 'jobs',
      baseStatus: job.status,
      requestedStageKey: normalizeOptionalString(req.body.workflowStageKey),
      currentStageKey: job.workflowStageKey,
      featureEnabled: await isWorkflowOverlayEnabled(tenantId),
    });

    await repo.save(job);

    if (job.status !== previousStatus) {
      await createJobActivity({
        tenantId,
        jobId: job.id,
        userId: req.userId,
        type: 'Status Changed',
        message: `Job status changed from ${previousStatus} to ${job.status}.`,
        metadata: { from: previousStatus, to: job.status },
      });
      // Notify admins of status change
      notifyAdmins({
        tenantId,
        title: 'Job Status Updated',
        message: `Job "${job.title}" status manually changed to ${job.status}.`,
        targetUrl: `/admin/schedule/${job.id}`,
      }).catch(err => console.error('Status notification failed:', err));
    }

    const workflowEnabled = await isWorkflowOverlayEnabled(tenantId);
    const workflowConfig = workflowEnabled ? await loadTenantWorkflowConfig(tenantId) : null;
    res.deliver(200, true, await enrichJobWithSite(job, { workflowEnabled, workflowConfig }, true), 'Job status updated');
  } catch (error) {
    next(error);
  }
};

export const assignJob = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = getTenantId(req);
    const jobRepo = AppDataSource.getRepository(Job);
    const assignmentRepo = AppDataSource.getRepository(JobAssignment);
    const contractorRepo = AppDataSource.getRepository(ContractorProfile);
    const teamRepo = AppDataSource.getRepository(EmployeeTeam);
    const teamMemberRepo = AppDataSource.getRepository(EmployeeTeamMember);
    const userRepo = AppDataSource.getRepository(User);
    const tenantRepo = AppDataSource.getRepository(Tenant);
    const job = await jobRepo.findOne({ where: { id: req.params.id, tenantId, isDeleted: false } });
    if (!job) {
      throw new NotFoundError('Job not found');
    }
    if (!job.scheduledAt || !job.scheduledEndAt) {
      throw new BadRequestError('Set both job start and end date/time before assigning crew.');
    }
    const statusLabel = (job.status ?? '').toUpperCase();
    const startedStatuses = new Set<string>([
      JobStatus.FINISHED,
      JobStatus.COMPLETED,
      JobStatus.CANCELLED,
    ]);
    if (startedStatuses.has(statusLabel)) {
      throw new BadRequestError(
        'Crew assignments are locked once a job is finished, closed, or cancelled.',
      );
    }

    const teamId =
      typeof req.body.teamId === 'string' && req.body.teamId.trim().length > 0
        ? req.body.teamId.trim()
        : undefined;
    const incomingUserIds: string[] = Array.isArray(req.body.userIds)
      ? Array.from(new Set(req.body.userIds))
      : [];
    const assignmentType =
      (req.body.assignmentType as AssignmentType) ?? AssignmentType.INTERNAL;
    const hasTeam = Boolean(teamId);

    let team: EmployeeTeam | null = null;
    if (hasTeam) {
      if (assignmentType === AssignmentType.SUB_CONTRACTOR) {
        throw new BadRequestError('Team assignment is only supported for internal crew.');
      }
      team = await teamRepo.findOne({
        where: { id: teamId, tenantId, isDeleted: false, isActive: true },
      });
      if (!team) {
        throw new NotFoundError('Team not found');
      }

      const teamMembers = await teamMemberRepo.find({
        where: { tenantId, teamId: team.id, isDeleted: false, isActive: true },
      });
      const teamUserIds = Array.from(
        new Set(teamMembers.map((member) => member.userId)),
      );
      if (teamUserIds.length === 0) {
        throw new BadRequestError('Selected team has no active members to assign.');
      }
      for (const userId of teamUserIds) {
        if (!incomingUserIds.includes(userId)) {
          incomingUserIds.push(userId);
        }
      }
    }

    if (incomingUserIds.length === 0) {
      throw new BadRequestError('At least one assignee is required.');
    }

    const existingAssignments = await assignmentRepo.find({
      where: { jobId: job.id, tenantId, isDeleted: false, isActive: true },
    });
    const targetAssignments = existingAssignments.filter(
      (assignment) => assignment.assignmentType === assignmentType,
    );
    const existingTargetByUserId = new Map(
      targetAssignments.map((assignment) => [assignment.userId, assignment]),
    );
    const incomingSet = new Set(incomingUserIds);
    const newUserIds = incomingUserIds.filter(
      (userId) => !existingTargetByUserId.has(userId),
    );

    if (assignmentType === AssignmentType.SUB_CONTRACTOR) {
      const contractorProfiles = await contractorRepo.find({
        where: { tenantId, isDeleted: false }
      });
      const contractorByUser = new Map(contractorProfiles.map((profile) => [profile.userId, profile]));
      const nonCompliant = incomingUserIds.filter((userId: string) => {
        const profile = contractorByUser.get(userId);
        return !profile || profile.complianceStatus !== ContractorComplianceStatus.COMPLIANT;
      });
      if (nonCompliant.length > 0) {
        throw new BadRequestError('Only compliant sub-contractors can be assigned to jobs.');
      }
    }

    const users = await userRepo.find({
      where: incomingUserIds.map((id) => ({ id, tenantId, isDeleted: false, isActive: true })),
    });
    const tenant = await tenantRepo.findOne({ where: { id: tenantId, isDeleted: false } });
    const defaultHourlyRate = Number(tenant?.defaultHourlyRate ?? 0);
    const userById = new Map(users.map((user) => [user.id, user]));
    const missing = incomingUserIds.filter((id) => !userById.has(id));
    if (missing.length > 0) {
      throw new BadRequestError('Some selected assignees are not valid active users.');
    }
    const explicitHourlyRate =
      req.body.hourlyRate === undefined || req.body.hourlyRate === null || req.body.hourlyRate === ''
        ? undefined
        : Number(req.body.hourlyRate);
    if (explicitHourlyRate !== undefined && (!Number.isFinite(explicitHourlyRate) || explicitHourlyRate < 0)) {
      throw new BadRequestError('Hourly rate must be a valid number greater than or equal to 0');
    }

    const resolveEffectiveRate = (userId: string) => {
      if (explicitHourlyRate !== undefined) {
        return explicitHourlyRate;
      }
      if (team && Number.isFinite(Number(team.hourlyRate)) && Number(team.hourlyRate) > 0) {
        return Number(team.hourlyRate);
      }
      const userRate = Number(userById.get(userId)?.hourlyRate ?? 0);
      if (Number.isFinite(userRate) && userRate > 0) {
        return userRate;
      }
      if (Number.isFinite(defaultHourlyRate) && defaultHourlyRate > 0) {
        return defaultHourlyRate;
      }
      return undefined;
    };

    const updates: JobAssignment[] = [];
    for (const assignment of targetAssignments) {
      // Reassignment overwrites previous assignees for the selected type.
      if (!incomingSet.has(assignment.userId)) {
        assignment.isActive = false;
        assignment.isPrimary = false;
        updates.push(assignment);
        continue;
      }
      assignment.teamId = team?.id;
      assignment.effectiveHourlyRate = resolveEffectiveRate(assignment.userId);
      updates.push(assignment);
    }
    if (updates.length > 0) {
      await assignmentRepo.save(updates);
    }

    if (newUserIds.length > 0) {
      const missing = newUserIds.filter((id) => !userById.has(id));
      if (missing.length > 0) {
        throw new BadRequestError('Some selected assignees are not valid active users.');
      }

      const assignments = newUserIds.map((userId: string, index: number) =>
        assignmentRepo.create({
          jobId: job.id,
          userId,
          tenantId,
          assignmentType,
          teamId: team?.id,
          effectiveHourlyRate: resolveEffectiveRate(userId),
          assignedAt: new Date(),
          isActive: true,
          isPrimary: index === 0
        })
      );
      await assignmentRepo.save(assignments);

      // Notify newly assigned users
      for (const assignment of assignments) {
        createInAppNotification({
          tenantId,
          userId: assignment.userId,
          title: 'New Job Assigned',
          message: `You have been assigned to job: ${job.title}`,
          targetUrl: `/worker/jobs/${job.id}`,
        }).catch(err => console.error('Assignment notification failed:', err));
      }
    }

    // Normalize primary assignee for this assignment type.
    const refreshedTargetAssignments = await assignmentRepo.find({
      where: {
        jobId: job.id,
        tenantId,
        isDeleted: false,
        isActive: true,
        assignmentType,
      },
    });
    const primarySet = new Set([incomingUserIds[0]]);
    let primaryChanged = false;
    for (const assignment of refreshedTargetAssignments) {
      const shouldBePrimary = primarySet.has(assignment.userId);
      if (assignment.isPrimary !== shouldBePrimary) {
        assignment.isPrimary = shouldBePrimary;
        primaryChanged = true;
      }
    }
    if (primaryChanged) {
      await assignmentRepo.save(refreshedTargetAssignments);
    }

    const activeAssignments = await assignmentRepo.find({
      where: { jobId: job.id, tenantId, isDeleted: false, isActive: true },
      relations: ['team']
    });
    job.status = deriveJobLifecycleStatus(job, activeAssignments.length);
    job.workflowStageKey = await resolveWorkflowStageKeyForRecord({
      tenantId,
      module: 'jobs',
      baseStatus: job.status,
      currentStageKey: undefined,
      featureEnabled: await isWorkflowOverlayEnabled(tenantId),
    });
    await jobRepo.save(job);
    await syncPlannerEntriesForJob(tenantId, job.id);
    await createJobActivity({
      tenantId,
      jobId: job.id,
      userId: req.userId,
      type: 'Crew Assigned',
      message:
        team && assignmentType === AssignmentType.INTERNAL
          ? `Job assigned to team "${team.name}".`
          : `Job assigned to ${activeAssignments.length} crew member${activeAssignments.length === 1 ? '' : 's'}.`,
      metadata: {
        assignmentType,
        teamId: team?.id ?? null,
        userIds: activeAssignments.map((assignment) => assignment.userId),
        hourlyRate: explicitHourlyRate ?? null,
      },
    });
    res.deliver(200, true, activeAssignments, 'Job assignments updated');
  } catch (error) {
    next(error);
  }
};

export const listJobAssignments = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = getTenantId(req);
    const assignmentRepo = AppDataSource.getRepository(JobAssignment);
    const assignments = await assignmentRepo.find({
      where: { jobId: req.params.id, tenantId, isDeleted: false, isActive: true },
      relations: ['user', 'team']
    });
    res.deliver(200, true, assignments, 'Job assignments fetched');
  } catch (error) {
    next(error);
  }
};

export const listAllJobAssignments = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = getTenantId(req);
    const assignmentRepo = AppDataSource.getRepository(JobAssignment);
    const assignments = await assignmentRepo.find({
      where: { tenantId, isDeleted: false, isActive: true },
      relations: ['job', 'team']
    });
    res.deliver(200, true, assignments, 'Job assignments fetched');
  } catch (error) {
    next(error);
  }
};

export const deleteJob = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = getTenantId(req);
    const repo = AppDataSource.getRepository(Job);
    const job = await repo.findOne({ where: { id: req.params.id, tenantId, isDeleted: false } });
    if (!job) {
      throw new NotFoundError('Job not found');
    }
    job.isDeleted = true;
    await repo.save(job);
    res.deliver(200, true, job, 'Job removed');
  } catch (error) {
    next(error);
  }
};

export const listJobActivities = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = getTenantId(req);
    const jobRepo = AppDataSource.getRepository(Job);
    const job = await jobRepo.findOne({ where: { id: req.params.id, tenantId, isDeleted: false } });
    if (!job) {
      throw new NotFoundError('Job not found');
    }
    const activities = await AppDataSource.getRepository(JobActivity).find({
      where: { tenantId, jobId: job.id, isDeleted: false },
      order: { createdAt: 'DESC' },
    });
    const userIds = Array.from(
      new Set(
        activities
          .map((activity) => activity.userId)
          .filter((userId): userId is string => Boolean(userId)),
      ),
    );
    const users = userIds.length
      ? await AppDataSource.getRepository(User).find({
          where: userIds.map((id) => ({ id, tenantId, isDeleted: false })),
          select: ['id', 'fullName', 'email'],
        })
      : [];
    const userMap = new Map(users.map((user) => [user.id, user]));
    res.deliver(
      200,
      true,
      activities.map((activity) => {
        const user = activity.userId ? userMap.get(activity.userId) : null;
        return {
          ...activity,
          actorName: user?.fullName ?? user?.email ?? null,
        };
      }),
      'Job activities fetched',
    );
  } catch (error) {
    next(error);
  }
};

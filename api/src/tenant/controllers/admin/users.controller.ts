import { Request, Response, NextFunction } from 'express';
import { In } from 'typeorm';
import { AppDataSource } from '../../../config/data-source';
import { User } from '../../../entities/user.entity';
import { Role } from '../../../entities/role.entity';
import { Account } from '../../../entities/account.entity';
import { AccountTenant } from '../../../entities/account-tenant.entity';
import { getTenantId } from '../../../utils/request';
import { BadRequestError, NotFoundError } from '../../../utils/errors';
import { SystemRole } from '../../../constants/roles';
import { hashPassword, verifyPassword } from '../../../utils/password';
import { generateTempPassword } from '../../../utils/credentials';
import { resolveLoginUrl } from '../../../utils/login-url';
import { withAuthDetails } from '../../../utils/auth-details';
import { sendTeamInviteEmail } from '../../../services/notifications.service';
import { buildEffectivePermissions } from '../../../services/permissions.service';
import { JobAssignment } from '../../../entities/job-assignment.entity';
import { JobTimeEntry } from '../../../entities/job-time-entry.entity';

export const listUsers = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = getTenantId(req);
    const repo = AppDataSource.getRepository(User);
    const users = await repo.find({
      where: { tenantId, isDeleted: false },
      relations: ['roles'],
      order: { createdAt: 'DESC' }
    });
    res.deliver(200, true, users, 'Users fetched');
  } catch (error) {
    next(error);
  }
};

export const createUser = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = getTenantId(req);
    const userRepo = AppDataSource.getRepository(User);
    const roleRepo = AppDataSource.getRepository(Role);
    const accountRepo = AppDataSource.getRepository(Account);
    const accountTenantRepo = AppDataSource.getRepository(AccountTenant);

    const existing = await userRepo.findOne({ where: { email: req.body.email, tenantId } });
    if (existing) {
      throw new BadRequestError('Email already exists');
    }

    const roles = await roleRepo.find({ where: { tenantId } });
    const roleMap = new Map(roles.map((role) => [role.code, role]));
    const disallowedRoles = new Set([SystemRole.CUSTOMER, SystemRole.SUB_CONTRACTOR]);
    const allowedTeamRoles = roles
      .map((role) => role.code)
      .filter((code) => !disallowedRoles.has(code as SystemRole));
    const selectedRoles = (req.body.roleCodes || [])
      .filter((code: string) => allowedTeamRoles.includes(code))
      .map((code: string) => roleMap.get(code))
      .filter(Boolean) as Role[];

    const normalizedRoles = selectedRoles.slice(0, 1);
    if (normalizedRoles.length === 0) {
      throw new BadRequestError('At least one role is required');
    }

    const providedPassword =
      typeof req.body.password === 'string' && req.body.password.trim().length > 0
        ? req.body.password.trim()
        : undefined;
    let loginPassword: string | undefined;
    let account = await accountRepo.findOne({ where: { email: req.body.email } });
    if (!account) {
      const tempPassword = providedPassword ?? generateTempPassword(12);
      account = accountRepo.create({
        email: req.body.email,
        passwordHash: await hashPassword(tempPassword),
        isActive: true,
        emailVerifiedAt: new Date()
      });
      await accountRepo.save(account);
      loginPassword = tempPassword;
    } else if (providedPassword) {
      account.passwordHash = await hashPassword(providedPassword);
      account.isActive = true;
      account.emailVerifiedAt = account.emailVerifiedAt ?? new Date();
      await accountRepo.save(account);
      loginPassword = providedPassword;
    }
    const user = userRepo.create({
      fullName: req.body.fullName,
      email: req.body.email,
      phone: req.body.phone,
      hourlyRate:
        typeof req.body.hourlyRate === 'number' && Number.isFinite(req.body.hourlyRate)
          ? Number(req.body.hourlyRate)
          : undefined,
      tenantId,
      accountId: account.id,
      roles: normalizedRoles
    });
    await userRepo.save(user);
    await accountTenantRepo.save(
      accountTenantRepo.create({
        accountId: account.id,
        tenantId,
        userId: user.id
      })
    );

    const roleCodes = normalizedRoles.map((role) => role.code as SystemRole);
    const loginUrl = await resolveLoginUrl(roleCodes, tenantId);
    await sendTeamInviteEmail(
      req.body.email,
      { email: req.body.email, loginUrl, tempPassword: loginPassword ?? null },
      { tenantId }
    );

    const payload = withAuthDetails(
      { user },
      { loginUrl, tempPassword: loginPassword, email: req.body.email }
    );

    res.deliver(201, true, payload, 'User created');
  } catch (error) {
    next(error);
  }
};

export const resetUserPassword = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = getTenantId(req);
    const userRepo = AppDataSource.getRepository(User);
    const accountRepo = AppDataSource.getRepository(Account);

    const user = await userRepo.findOne({
      where: { id: req.params.id, tenantId, isDeleted: false },
      relations: ['roles'],
    });
    if (!user) {
      throw new NotFoundError('User not found');
    }
    if (!user.accountId) {
      throw new BadRequestError('User does not have a login account');
    }

    const account = await accountRepo.findOne({ where: { id: user.accountId } });
    if (!account) {
      throw new NotFoundError('Login account not found');
    }

    const providedPassword =
      typeof req.body.password === 'string' && req.body.password.trim().length > 0
        ? req.body.password.trim()
        : undefined;
    const nextPassword = providedPassword ?? generateTempPassword(12);
    account.passwordHash = await hashPassword(nextPassword);
    account.isActive = true;
    account.emailVerifiedAt = account.emailVerifiedAt ?? new Date();
    await accountRepo.save(account);

    const roleCodes = (user.roles ?? []).map((role) => role.code as SystemRole);
    const loginUrl = await resolveLoginUrl(roleCodes, tenantId);
    await sendTeamInviteEmail(
      user.email,
      { email: user.email, loginUrl, tempPassword: nextPassword },
      { tenantId }
    );

    const payload = withAuthDetails(
      { updated: true },
      { loginUrl, tempPassword: nextPassword, email: user.email }
    );
    res.deliver(200, true, payload, 'Password reset');
  } catch (error) {
    next(error);
  }
};

export const updateUserDetails = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = getTenantId(req);
    const userRepo = AppDataSource.getRepository(User);
    const targetId = req.params.id;

    const target = await userRepo.findOne({
      where: { id: targetId, tenantId, isDeleted: false },
      relations: ['roles'],
    });
    if (!target) {
      throw new NotFoundError('User not found');
    }

    const primaryAdmin = await userRepo.findOne({
      where: { tenantId, isDeleted: false },
      relations: ['roles'],
      order: { createdAt: 'ASC' },
    });
    if (primaryAdmin?.id === target.id) {
      throw new BadRequestError('Primary admin details cannot be changed');
    }

    const hasAnyField =
      typeof req.body.fullName !== 'undefined' ||
      typeof req.body.phone !== 'undefined' ||
      typeof req.body.hourlyRate !== 'undefined';
    if (!hasAnyField) {
      throw new BadRequestError('Nothing to update');
    }

    if (typeof req.body.fullName !== 'undefined') {
      target.fullName = String(req.body.fullName).trim();
    }
    if (typeof req.body.phone !== 'undefined') {
      const phone = String(req.body.phone ?? '').trim();
      target.phone = phone.length > 0 ? phone : undefined;
    }
    if (typeof req.body.hourlyRate !== 'undefined') {
      target.hourlyRate = Number(req.body.hourlyRate);
    }

    await userRepo.save(target);
    res.deliver(200, true, target, 'User updated');
  } catch (error) {
    next(error);
  }
};

export const getMe = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = getTenantId(req);
    const userRepo = AppDataSource.getRepository(User);
    const user = await userRepo.findOne({
      where: { id: req.userId, tenantId, isDeleted: false },
      relations: ['roles']
    });
    if (!user) {
      throw new NotFoundError('User not found');
    }
    const { permissions } = await buildEffectivePermissions(user.id);
    const effectivePermissions = permissions ?? {};
    res.deliver(200, true, { ...user, effectivePermissions }, 'User loaded');
  } catch (error) {
    next(error);
  }
};

export const updateUserRoles = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = getTenantId(req);
    const userRepo = AppDataSource.getRepository(User);
    const roleRepo = AppDataSource.getRepository(Role);
    const targetId = req.params.id;

    const target = await userRepo.findOne({ where: { id: targetId, tenantId, isDeleted: false }, relations: ['roles'] });
    if (!target) {
      throw new NotFoundError('User not found');
    }

    const primaryAdmin = await userRepo.findOne({
      where: { tenantId, isDeleted: false },
      relations: ['roles'],
      order: { createdAt: 'ASC' }
    });
    if (!primaryAdmin || primaryAdmin.id !== req.userId) {
      throw new BadRequestError('Only the primary admin can change roles');
    }
    if (primaryAdmin.id === target.id) {
      throw new BadRequestError('Primary admin role cannot be changed');
    }

    const roles = await roleRepo.find({ where: { tenantId } });
    const roleMap = new Map(roles.map((role) => [role.code, role]));
    const disallowedRoles = new Set([SystemRole.CUSTOMER, SystemRole.SUB_CONTRACTOR]);
    const allowedTeamRoles = roles
      .map((role) => role.code)
      .filter((code) => !disallowedRoles.has(code as SystemRole));
    const selectedRoles = (req.body.roleCodes || [])
      .filter((code: string) => allowedTeamRoles.includes(code))
      .map((code: string) => roleMap.get(code))
      .filter(Boolean) as Role[];

    const normalizedRoles = selectedRoles.slice(0, 1);
    if (normalizedRoles.length === 0) {
      throw new BadRequestError('At least one role is required');
    }

    target.roles = normalizedRoles;
    await userRepo.save(target);

    res.deliver(200, true, target, 'User roles updated');
  } catch (error) {
    next(error);
  }
};

export const getUserDetails = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = getTenantId(req);
    const userRepo = AppDataSource.getRepository(User);
    const assignmentRepo = AppDataSource.getRepository(JobAssignment);
    const timeRepo = AppDataSource.getRepository(JobTimeEntry);

    const user = await userRepo.findOne({
      where: { id: req.params.id, tenantId, isDeleted: false },
      relations: ['roles'],
    });
    if (!user) {
      throw new NotFoundError('User not found');
    }

    const assignments = await assignmentRepo.find({
      where: { tenantId, userId: user.id, isDeleted: false },
      relations: ['job', 'job.customer', 'team'],
      order: { createdAt: 'DESC' },
    });

    const jobIds = Array.from(
      new Set(
        assignments
          .filter((assignment) => assignment.job && !assignment.job.isDeleted)
          .map((assignment) => assignment.jobId),
      ),
    );

    const timeEntries = jobIds.length
      ? await timeRepo.find({
          where: { tenantId, userId: user.id, isDeleted: false, jobId: In(jobIds) },
          order: { startTime: 'DESC' },
        })
      : [];

    const timeByJobId = new Map<string, JobTimeEntry[]>();
    for (const entry of timeEntries) {
      const list = timeByJobId.get(entry.jobId) ?? [];
      list.push(entry);
      timeByJobId.set(entry.jobId, list);
    }

    const assignmentsByJob = new Map<string, JobAssignment>();
    const sortedAssignments = [...assignments]
      .filter((assignment) => assignment.job && !assignment.job.isDeleted)
      .sort((a, b) => {
        if (a.isActive !== b.isActive) return a.isActive ? -1 : 1;
        const aTime = new Date(a.assignedAt ?? a.createdAt).getTime();
        const bTime = new Date(b.assignedAt ?? b.createdAt).getTime();
        return bTime - aTime;
      });

    for (const assignment of sortedAssignments) {
      if (!assignmentsByJob.has(assignment.jobId)) {
        assignmentsByJob.set(assignment.jobId, assignment);
      }
    }

    const jobs = Array.from(assignmentsByJob.values()).map((assignment) => {
      const jobTimes = timeByJobId.get(assignment.jobId) ?? [];
      const totalMinutes = jobTimes.reduce(
        (sum, entry) => sum + Number(entry.durationMinutes ?? 0),
        0,
      );
      return {
        assignmentId: assignment.id,
        assignmentType: assignment.assignmentType,
        assignmentStatus: assignment.isActive ? 'ACTIVE' : 'INACTIVE',
        assignedAt: assignment.assignedAt ?? assignment.createdAt,
        isPrimary: assignment.isPrimary,
        teamId: assignment.teamId ?? null,
        teamName: assignment.team?.name ?? null,
        effectiveHourlyRate:
          assignment.effectiveHourlyRate !== null &&
          typeof assignment.effectiveHourlyRate !== 'undefined'
            ? Number(assignment.effectiveHourlyRate)
            : null,
        job: {
          id: assignment.job.id,
          title: assignment.job.title,
          status: assignment.job.status,
          priority: assignment.job.priority ?? null,
          location: assignment.job.location ?? null,
          amount:
            assignment.job.amount !== null && typeof assignment.job.amount !== 'undefined'
              ? Number(assignment.job.amount)
              : null,
          scheduledAt: assignment.job.scheduledAt ?? null,
          scheduledEndAt: assignment.job.scheduledEndAt ?? null,
          completedAt: assignment.job.completedAt ?? null,
          customerName: assignment.job.customer?.name ?? null,
        },
        totalLoggedMinutes: totalMinutes,
        totalLoggedHours: Number((totalMinutes / 60).toFixed(2)),
        timeEntries: jobTimes.map((entry) => ({
          id: entry.id,
          startTime: entry.startTime,
          endTime: entry.endTime,
          durationMinutes: entry.durationMinutes,
          durationHours: Number((Number(entry.durationMinutes ?? 0) / 60).toFixed(2)),
          notes: entry.notes ?? null,
          createdAt: entry.createdAt,
        })),
      };
    });

    const totalLoggedMinutes = jobs.reduce(
      (sum, jobEntry) => sum + Number(jobEntry.totalLoggedMinutes ?? 0),
      0,
    );
    const activeAssignments = jobs.filter((jobEntry) => jobEntry.assignmentStatus === 'ACTIVE').length;

    res.deliver(
      200,
      true,
      {
        user,
        summary: {
          totalAssignedJobs: jobs.length,
          activeAssignments,
          totalTimeEntries: timeEntries.length,
          totalLoggedMinutes,
          totalLoggedHours: Number((totalLoggedMinutes / 60).toFixed(2)),
        },
        jobs,
      },
      'User details fetched',
    );
  } catch (error) {
    next(error);
  }
};

export const changeMyPassword = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = getTenantId(req);
    const userRepo = AppDataSource.getRepository(User);
    const accountRepo = AppDataSource.getRepository(Account);
    const user = await userRepo.findOne({
      where: { id: req.userId, tenantId, isDeleted: false }
    });
    if (!user || !user.accountId) {
      throw new NotFoundError('User not found');
    }
    const account = await accountRepo.findOne({ where: { id: user.accountId } });
    if (!account) {
      throw new NotFoundError('Account not found');
    }
    const ok = await verifyPassword(req.body.currentPassword, account.passwordHash);
    if (!ok) {
      throw new BadRequestError('Current password is incorrect');
    }
    account.passwordHash = await hashPassword(req.body.newPassword);
    await accountRepo.save(account);
    res.deliver(200, true, { updated: true }, 'Password updated');
  } catch (error) {
    next(error);
  }
};

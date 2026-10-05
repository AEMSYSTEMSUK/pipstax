import { In } from 'typeorm';
import { Request, Response, NextFunction } from 'express';
import { AppDataSource } from '../../../config/data-source';
import { EmployeeTeam } from '../../../entities/employee-team.entity';
import { EmployeeTeamMember } from '../../../entities/employee-team-member.entity';
import { User } from '../../../entities/user.entity';
import { getTenantId } from '../../../utils/request';
import { BadRequestError, NotFoundError } from '../../../utils/errors';
import { SystemRole } from '../../../constants/roles';

const getUserRoleCodes = (user: User) =>
  Array.isArray(user.roles)
    ? user.roles.map((role) => String(role?.code ?? '').toUpperCase()).filter(Boolean)
    : [];

const getAssignableEmployees = async (tenantId: string) => {
  const userRepo = AppDataSource.getRepository(User);
  const users = await userRepo.find({
    where: { tenantId, isDeleted: false, isActive: true },
    relations: ['roles'],
    order: { fullName: 'ASC' },
  });
  return users.filter((user) => {
    const roleCodes = getUserRoleCodes(user);
    return roleCodes.includes(SystemRole.FIELD_WORKER);
  });
};

const buildTeamsPayload = async (tenantId: string) => {
  const teamRepo = AppDataSource.getRepository(EmployeeTeam);
  const memberRepo = AppDataSource.getRepository(EmployeeTeamMember);

  const teams = await teamRepo.find({
    where: { tenantId, isDeleted: false },
    order: { createdAt: 'DESC' },
  });

  if (teams.length === 0) {
    return [];
  }

  const members = await memberRepo.find({
    where: {
      tenantId,
      isDeleted: false,
      isActive: true,
      teamId: In(teams.map((team) => team.id)),
    },
    relations: ['user', 'user.roles'],
    order: { createdAt: 'ASC' },
  });

  const membersByTeam = new Map<string, EmployeeTeamMember[]>();
  for (const member of members) {
    const list = membersByTeam.get(member.teamId) ?? [];
    list.push(member);
    membersByTeam.set(member.teamId, list);
  }

  return teams.map((team) => {
    const teamMembers = membersByTeam.get(team.id) ?? [];
    return {
      ...team,
      members: teamMembers.map((member) => ({
        id: member.id,
        userId: member.userId,
        fullName: member.user?.fullName ?? member.user?.email ?? 'Worker',
        email: member.user?.email,
        phone: member.user?.phone,
        hourlyRate: member.user?.hourlyRate,
      })),
      memberCount: teamMembers.length,
    };
  });
};

export const listTeams = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = getTenantId(req);
    const payload = await buildTeamsPayload(tenantId);
    res.deliver(200, true, payload, 'Teams fetched');
  } catch (error) {
    next(error);
  }
};

export const listAssignableWorkers = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const tenantId = getTenantId(req);
    const employees = await getAssignableEmployees(tenantId);
    res.deliver(200, true, employees, 'Assignable field workers fetched');
  } catch (error) {
    next(error);
  }
};

export const createTeam = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = getTenantId(req);
    const teamRepo = AppDataSource.getRepository(EmployeeTeam);
    const memberRepo = AppDataSource.getRepository(EmployeeTeamMember);
    const userRepo = AppDataSource.getRepository(User);

    const name = String(req.body.name ?? '').trim();
    if (!name) {
      throw new BadRequestError('Team name is required');
    }

    const existing = await teamRepo.findOne({
      where: { tenantId, isDeleted: false, name },
    });
    if (existing) {
      throw new BadRequestError('A team with this name already exists');
    }

    const team = teamRepo.create({
      tenantId,
      name,
      description: req.body.description?.trim() || undefined,
      hourlyRate:
        typeof req.body.hourlyRate === 'number' && Number.isFinite(req.body.hourlyRate)
          ? Number(req.body.hourlyRate)
          : undefined,
      isActive: true,
    });
    await teamRepo.save(team);

    const memberUserIds = Array.isArray(req.body.memberUserIds)
      ? req.body.memberUserIds
      : [];

    if (memberUserIds.length > 0) {
      const users = await userRepo.find({
        where: { tenantId, isDeleted: false, id: In(memberUserIds) },
        relations: ['roles'],
      });
      const assignableUsers = await getAssignableEmployees(tenantId);
      const assignableIds = new Set(assignableUsers.map((user) => user.id));
      const validUsers = users.filter((user) => assignableIds.has(user.id));
      const validUserIds = new Set(validUsers.map((user) => user.id));
      const invalidUserIds = memberUserIds.filter((userId: string) => !validUserIds.has(userId));
      if (invalidUserIds.length > 0) {
        throw new BadRequestError('Only field workers can be added to teams');
      }
      await memberRepo.save(
        validUsers.map((user) =>
          memberRepo.create({
            tenantId,
            teamId: team.id,
            userId: user.id,
            isActive: true,
          }),
        ),
      );
    }

    const payload = await buildTeamsPayload(tenantId);
    const created = payload.find((entry) => entry.id === team.id);
    res.deliver(201, true, created ?? team, 'Team created');
  } catch (error) {
    next(error);
  }
};

export const updateTeam = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = getTenantId(req);
    const teamRepo = AppDataSource.getRepository(EmployeeTeam);
    const team = await teamRepo.findOne({
      where: { id: req.params.id, tenantId, isDeleted: false },
    });
    if (!team) {
      throw new NotFoundError('Team not found');
    }

    if (typeof req.body.name !== 'undefined') {
      const name = String(req.body.name).trim();
      if (!name) {
        throw new BadRequestError('Team name cannot be empty');
      }
      const existing = await teamRepo.findOne({
        where: { tenantId, isDeleted: false, name },
      });
      if (existing && existing.id !== team.id) {
        throw new BadRequestError('A team with this name already exists');
      }
      team.name = name;
    }
    if (typeof req.body.description !== 'undefined') {
      const description = String(req.body.description ?? '').trim();
      team.description = description || undefined;
    }
    if (typeof req.body.hourlyRate !== 'undefined') {
      if (req.body.hourlyRate === null || req.body.hourlyRate === '') {
        team.hourlyRate = undefined;
      } else {
        const rate = Number(req.body.hourlyRate);
        if (!Number.isFinite(rate) || rate < 0) {
          throw new BadRequestError('Hourly rate must be 0 or more');
        }
        team.hourlyRate = rate;
      }
    }
    await teamRepo.save(team);

    const payload = await buildTeamsPayload(tenantId);
    const updated = payload.find((entry) => entry.id === team.id);
    res.deliver(200, true, updated ?? team, 'Team updated');
  } catch (error) {
    next(error);
  }
};

export const replaceTeamMembers = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const tenantId = getTenantId(req);
    const teamRepo = AppDataSource.getRepository(EmployeeTeam);
    const memberRepo = AppDataSource.getRepository(EmployeeTeamMember);
    const userRepo = AppDataSource.getRepository(User);

    const team = await teamRepo.findOne({
      where: { id: req.params.id, tenantId, isDeleted: false },
    });
    if (!team) {
      throw new NotFoundError('Team not found');
    }

    const memberUserIds = Array.from(
      new Set<string>(
        Array.isArray(req.body.memberUserIds)
          ? req.body.memberUserIds.map((value: unknown) => String(value))
          : [],
      ),
    );
    const users = memberUserIds.length
      ? await userRepo.find({
          where: { tenantId, isDeleted: false, id: In(memberUserIds) },
          relations: ['roles'],
        })
      : [];
    const assignableUsers = await getAssignableEmployees(tenantId);
    const assignableIds = new Set(assignableUsers.map((user) => user.id));
    const validUsers = users.filter((user) => assignableIds.has(user.id));
    const validUserIds = new Set(validUsers.map((user) => user.id));
    const invalidUserIds = memberUserIds.filter((userId: string) => !validUserIds.has(userId));
    if (invalidUserIds.length > 0) {
      throw new BadRequestError('Only field workers can be added to teams');
    }

    const existingMembers = await memberRepo.find({
      where: { tenantId, teamId: team.id, isDeleted: false },
    });
    if (existingMembers.length > 0) {
      for (const member of existingMembers) {
        member.isDeleted = true;
        member.isActive = false;
      }
      await memberRepo.save(existingMembers);
    }

    if (validUsers.length > 0) {
      await memberRepo.save(
        validUsers.map((user) =>
          memberRepo.create({
            tenantId,
            teamId: team.id,
            userId: user.id,
            isActive: true,
          }),
        ),
      );
    }

    const payload = await buildTeamsPayload(tenantId);
    const updated = payload.find((entry) => entry.id === team.id);
    res.deliver(200, true, updated ?? team, 'Team members updated');
  } catch (error) {
    next(error);
  }
};

export const deleteTeam = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = getTenantId(req);
    const teamRepo = AppDataSource.getRepository(EmployeeTeam);
    const memberRepo = AppDataSource.getRepository(EmployeeTeamMember);
    const team = await teamRepo.findOne({
      where: { id: req.params.id, tenantId, isDeleted: false },
    });
    if (!team) {
      throw new NotFoundError('Team not found');
    }

    team.isDeleted = true;
    team.isActive = false;
    await teamRepo.save(team);

    const members = await memberRepo.find({
      where: { tenantId, teamId: team.id, isDeleted: false },
    });
    if (members.length > 0) {
      for (const member of members) {
        member.isDeleted = true;
        member.isActive = false;
      }
      await memberRepo.save(members);
    }

    res.deliver(200, true, { id: team.id }, 'Team removed');
  } catch (error) {
    next(error);
  }
};

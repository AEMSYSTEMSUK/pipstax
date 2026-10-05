import { Request, Response, NextFunction } from 'express';
import { AppDataSource } from '../../config/data-source';
import { Account } from '../../entities/account.entity';
import { AccountTenant } from '../../entities/account-tenant.entity';
import { User } from '../../entities/user.entity';
import { Tenant } from '../../entities/tenant.entity';
import { ContractorProfile } from '../../entities/contractor-profile.entity';
import { verifyPassword } from '../../utils/password';
import { UnauthorizedError } from '../../utils/errors';
import { SystemRole } from '../../constants/roles';
import { signToken, verifyToken } from '../../utils/jwt';
import { createPasswordReset, resetPassword } from '../../services/password-reset.service';
import { env } from '../../config/env';
import { resolveStoredFileUrl } from '../../services/storage/storage.service';
import { normalizeTenantFeatureFlags } from '../../services/tenant-features.service';

export const appLogin = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email, password } = req.body;
    const accountRepo = AppDataSource.getRepository(Account);
    const membershipRepo = AppDataSource.getRepository(AccountTenant);
    const tenantRepo = AppDataSource.getRepository(Tenant);
    const userRepo = AppDataSource.getRepository(User);

    const account = await accountRepo.findOne({ where: { email } });
    if (!account) {
      throw new UnauthorizedError('Invalid credentials');
    }
    if (!account.emailVerifiedAt || !account.isActive) {
      throw new UnauthorizedError('Email verification required');
    }
    const ok = await verifyPassword(password, account.passwordHash);
    if (!ok) {
      throw new UnauthorizedError('Invalid credentials');
    }

    const memberships = await membershipRepo.find({ where: { accountId: account.id } });
    const tenantIds = memberships.map((m) => m.tenantId);
    const tenants = await tenantRepo.find({ where: tenantIds.map((id) => ({ id })) });
    const users = await userRepo.find({
      where: memberships.map((m) => ({ id: m.userId })),
      relations: ['roles']
    });
    const contractorProfiles = await AppDataSource.getRepository(ContractorProfile).find({
      where: memberships.map((m) => ({ userId: m.userId, isDeleted: false }))
    });
    const contractorUserIds = new Set(contractorProfiles.map((profile) => profile.userId));
    const tenantMap = new Map(tenants.map((t) => [t.id, t]));
    const userMap = new Map(users.map((u) => [u.id, u]));
    const tenantRoleCodes = [SystemRole.ADMIN, SystemRole.MANAGER, SystemRole.HR];

    const workspaces = memberships.map((m) => {
      const tenant = tenantMap.get(m.tenantId);
      const user = userMap.get(m.userId);
      const roles = user?.roles?.map((r) => r.code) ?? [];
      if (contractorUserIds.has(m.userId) && !roles.includes(SystemRole.SUB_CONTRACTOR)) {
        roles.push(SystemRole.SUB_CONTRACTOR);
      }
      return {
        tenantId: m.tenantId,
        subdomain: tenant?.subdomain,
        tradingName: tenant?.tradingName ?? tenant?.name,
        logoUrl: resolveStoredFileUrl(tenant?.logoUrl),
        primaryColor: tenant?.primaryColor,
        featureFlags: normalizeTenantFeatureFlags(tenant?.featureFlags),
        roles
      };
    });

    const hasTenantRoles = workspaces.some((workspace) =>
      (workspace.roles ?? []).some((role) => tenantRoleCodes.includes(role as SystemRole))
    );
    const hasCustomerRoles = workspaces.some((workspace) => (workspace.roles ?? []).includes(SystemRole.CUSTOMER));
    if (hasTenantRoles || hasCustomerRoles) {
      throw new UnauthorizedError('App access denied');
    }

    const allowedWorkspaces = [];
    for (const workspace of workspaces) {
      const roles = workspace.roles ?? [];
      const hasField = roles.includes(SystemRole.FIELD_WORKER);
      const hasSub = roles.includes(SystemRole.SUB_CONTRACTOR);
      if (hasField && hasSub) {
        throw new UnauthorizedError('Role conflict');
      }
      if (hasField || hasSub) {
        allowedWorkspaces.push(workspace);
      }
    }

    if (allowedWorkspaces.length === 0) {
      throw new UnauthorizedError('App access denied');
    }

    if (allowedWorkspaces.length === 1) {
      const workspace = allowedWorkspaces[0];
      const membership = memberships.find((m) => m.tenantId === workspace.tenantId);
      const token = signToken({
        userId: membership?.userId,
        tenantId: workspace.tenantId,
        roles: workspace.roles ?? []
      });
      return res.deliver(200, true, { token, workspace }, 'Login successful');
    }

    const token = signToken({
      accountId: account.id,
      scope: 'app'
    });
    return res.deliver(200, true, { token, workspaces: allowedWorkspaces }, 'Login successful');
  } catch (error) {
    next(error);
  }
};

export const appSelectTenant = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
      throw new UnauthorizedError('Missing authorization header');
    }
    const token = header.replace('Bearer ', '').trim();
    const payload = verifyToken<any>(token);
    if (payload.scope !== 'app' || !payload.accountId) {
      throw new UnauthorizedError('Invalid token');
    }
    const { tenantId } = req.body;
    const membershipRepo = AppDataSource.getRepository(AccountTenant);
    const userRepo = AppDataSource.getRepository(User);
    const tenantRepo = AppDataSource.getRepository(Tenant);
    const membership = await membershipRepo.findOne({
      where: { accountId: payload.accountId, tenantId }
    });
    if (!membership) {
      throw new UnauthorizedError('Workspace not found');
    }
    const user = await userRepo.findOne({ where: { id: membership.userId }, relations: ['roles'] });
    if (!user) {
      throw new UnauthorizedError('User not found');
    }
    let roles = user.roles?.map((r) => r.code) ?? [];
    const contractorProfile = await AppDataSource.getRepository(ContractorProfile).findOne({
      where: { userId: user.id, isDeleted: false }
    });
    if (contractorProfile && !roles.includes(SystemRole.SUB_CONTRACTOR)) {
      roles = [...roles, SystemRole.SUB_CONTRACTOR];
    }
    const tenantRoleCodes = [SystemRole.ADMIN, SystemRole.MANAGER, SystemRole.HR];
    const hasField = roles.includes(SystemRole.FIELD_WORKER);
    const hasSub = roles.includes(SystemRole.SUB_CONTRACTOR);
    const hasTenantRoles = roles.some((role) => tenantRoleCodes.includes(role as SystemRole));
    const hasCustomerRole = roles.includes(SystemRole.CUSTOMER);
    if (hasTenantRoles || hasCustomerRole || (hasField && hasSub) || (!hasField && !hasSub)) {
      throw new UnauthorizedError('App access denied');
    }
    const tenantToken = signToken({
      userId: user.id,
      tenantId: user.tenantId,
      roles
    });
    const tenant = await tenantRepo.findOne({ where: { id: user.tenantId } });
    res.deliver(
      200,
      true,
      {
        token: tenantToken,
        tenantId: user.tenantId,
        roles,
        workspace: tenant
          ? {
              tenantId: tenant.id,
              subdomain: tenant.subdomain,
              tradingName: tenant.tradingName ?? tenant.name,
              logoUrl: resolveStoredFileUrl(tenant.logoUrl),
              primaryColor: tenant.primaryColor,
              featureFlags: normalizeTenantFeatureFlags(tenant.featureFlags),
              roles,
            }
          : undefined,
      },
      'Workspace selected',
    );
  } catch (error) {
    next(error);
  }
};

export const appForgotPassword = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email } = req.body;
    const result = await createPasswordReset(email, '/reset-password', {
      baseUrl: env.workerAppUrl
    });
    res.deliver(200, true, result, 'If the email exists, a reset link has been sent');
  } catch (error) {
    next(error);
  }
};

export const appResetPassword = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email, token, password } = req.body;
    const result = await resetPassword(email, token, password);
    res.deliver(200, true, result, 'Password updated');
  } catch (error) {
    next(error);
  }
};

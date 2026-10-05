import { Request, Response, NextFunction } from "express";
import { AppDataSource } from "../../../config/data-source";
import { Tenant } from "../../../entities/tenant.entity";
import { User } from "../../../entities/user.entity";
import { Account } from "../../../entities/account.entity";
import { AccountTenant } from "../../../entities/account-tenant.entity";
import { AccountVerification } from "../../../entities/account-verification.entity";
import { ContractorProfile } from "../../../entities/contractor-profile.entity";
import { hashPassword, verifyPassword } from "../../../utils/password";
import { signToken, verifyToken } from "../../../utils/jwt";
import { BadRequestError, UnauthorizedError } from "../../../utils/errors";
import { SystemRole } from "../../../constants/roles";
import { ensureRolesForTenant } from "../../../services/roles.service";
import {
  generateUniqueSubdomain,
  isValidSubdomain,
  slugifySubdomain,
} from "../../../utils/subdomain";
import { sendOtpEmail } from "../../../services/notifications.service";
import {
  createPasswordReset,
  resetPassword,
} from "../../../services/password-reset.service";
import bcrypt from "bcryptjs";
import { IsNull } from "typeorm";
import { IntegrationProvider } from "../../../constants/integrations";
import { DOCUMENT_SYNC_PROVIDERS } from "../../../constants/document-sync";
import { ACCOUNTING_PROVIDERS } from "../../../constants/accounting";
import { resolveStoredFileUrl } from "../../../services/storage/storage.service";
import { shouldExposeAuthDetails } from "../../../utils/auth-details";
import { resolveTenantAppBaseUrl } from "../../../utils/tenant-url";

export const bootstrapTenant = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const {
      tenantName,
      tradingName,
      adminEmail,
      adminPassword,
      adminName,
      primaryColor,
      documentSyncProvider,
      accountingProvider,
    } = req.body;

    const tenantRepo = AppDataSource.getRepository(Tenant);
    const userRepo = AppDataSource.getRepository(User);
    const accountRepo = AppDataSource.getRepository(Account);
    const accountTenantRepo = AppDataSource.getRepository(AccountTenant);
    const accountVerificationRepo =
      AppDataSource.getRepository(AccountVerification);

    const existingAccount = await accountRepo.findOne({
      where: { email: adminEmail },
    });
    if (existingAccount) {
      throw new BadRequestError("Account email already exists");
    }

    const baseSubdomain = slugifySubdomain(tradingName);
    if (!isValidSubdomain(baseSubdomain)) {
      throw new BadRequestError("Invalid subdomain");
    }
    if (!DOCUMENT_SYNC_PROVIDERS.includes(documentSyncProvider)) {
      throw new BadRequestError("Invalid document sync provider");
    }
    if (!accountingProvider || !ACCOUNTING_PROVIDERS.includes(accountingProvider)) {
      throw new BadRequestError("Invalid accounting provider");
    }
    const subdomain = await generateUniqueSubdomain(tenantRepo, baseSubdomain);

    const tenant = tenantRepo.create({
      name: tenantName,
      tradingName,
      primaryColor,
      subdomain,
      documentSyncProvider: documentSyncProvider ?? IntegrationProvider.GOOGLE_DRIVE,
      accountingProvider,
    });
    await tenantRepo.save(tenant);

    const roles = await ensureRolesForTenant(tenant.id);
    const adminRole = roles.find((role) => role.code === SystemRole.ADMIN);
    if (!adminRole) {
      throw new BadRequestError("Admin role missing");
    }

    const account = accountRepo.create({
      email: adminEmail,
      passwordHash: await hashPassword(adminPassword),
      isActive: false,
    });
    await accountRepo.save(account);

    const user = userRepo.create({
      fullName: adminName,
      email: adminEmail,
      tenantId: tenant.id,
      isActive: false,
      accountId: account.id,
      tenant,
      roles: [adminRole],
    });
    await userRepo.save(user);

    await accountTenantRepo.save(
      accountTenantRepo.create({
        accountId: account.id,
        tenantId: tenant.id,
        userId: user.id,
      }),
    );

    const code = `${Math.floor(100000 + Math.random() * 900000)}`;
    const codeHash = await bcrypt.hash(code, 10);
    const verification = accountVerificationRepo.create({
      email: adminEmail,
      accountId: account.id,
      codeHash,
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
    });
    await accountVerificationRepo.save(verification);
    await sendOtpEmail(adminEmail, code);
    const devOtp = shouldExposeAuthDetails() ? code : undefined;

    res.deliver(
      201,
      true,
      {
        tenantId: tenant.id,
        subdomain,
        email: adminEmail,
        expiresAt: verification.expiresAt,
        devOtp,
      },
      "Tenant bootstrapped",
    );
  } catch (error) {
    next(error);
  }
};

export const commonLogin = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { email, password } = req.body;
    const accountRepo = AppDataSource.getRepository(Account);
    const membershipRepo = AppDataSource.getRepository(AccountTenant);
    const tenantRepo = AppDataSource.getRepository(Tenant);
    const userRepo = AppDataSource.getRepository(User);

    const account = await accountRepo.findOne({ where: { email } });
    if (!account) {
      throw new UnauthorizedError("Invalid credentials");
    }
    if (!account.emailVerifiedAt || !account.isActive) {
      throw new UnauthorizedError("Email verification required");
    }
    const ok = await verifyPassword(password, account.passwordHash);
    if (!ok) {
      throw new UnauthorizedError("Invalid credentials");
    }

    const memberships = await membershipRepo.find({
      where: req.tenantId
        ? { accountId: account.id, tenantId: req.tenantId }
        : { accountId: account.id },
    });
    if (memberships.length === 0) {
      throw new UnauthorizedError("This account cannot access this workspace");
    }
    const tenantIds = memberships.map((m) => m.tenantId);
    const tenants = await tenantRepo.find({
      where: tenantIds.map((id) => ({ id })),
    });
    const users = await userRepo.find({
      where: memberships.map((m) => ({ id: m.userId })),
      relations: ["roles"],
    });
    const contractorProfiles = await AppDataSource.getRepository(ContractorProfile).find({
      where: memberships.map((m) => ({ userId: m.userId, isDeleted: false })),
    });
    const contractorUserIds = new Set(contractorProfiles.map((profile) => profile.userId));

    const token = signToken({
      accountId: account.id,
      scope: "account",
    });

    const tenantMap = new Map(tenants.map((t) => [t.id, t]));
    const userMap = new Map(users.map((u) => [u.id, u]));

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
        roles,
      };
    });

    const appRoleCodes = [SystemRole.FIELD_WORKER, SystemRole.SUB_CONTRACTOR];
    const hasAppRoles = workspaces.some((workspace) =>
      (workspace.roles ?? []).some((role) => appRoleCodes.includes(role as SystemRole))
    );
    const hasCustomerRole = workspaces.some((workspace) =>
      (workspace.roles ?? []).includes(SystemRole.CUSTOMER)
    );
    if (hasAppRoles || hasCustomerRole) {
      throw new UnauthorizedError("Tenant access denied");
    }

    res.deliver(200, true, { token, workspaces }, "Login successful");
  } catch (error) {
    console.log(error);
    next(error);
  }
};

export const selectTenant = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const header = req.headers.authorization;
    if (!header || !header.startsWith("Bearer ")) {
      throw new UnauthorizedError("Missing authorization header");
    }
    const token = header.replace("Bearer ", "").trim();
    const payload = verifyToken<any>(token);
    if (payload.scope !== "account" || !payload.accountId) {
      throw new UnauthorizedError("Invalid token");
    }

    const { tenantId } = req.body;
    if (req.tenantId && tenantId !== req.tenantId) {
      throw new UnauthorizedError("Workspace not found");
    }
    const membershipRepo = AppDataSource.getRepository(AccountTenant);
    const tenantRepo = AppDataSource.getRepository(Tenant);
    const userRepo = AppDataSource.getRepository(User);

    const membership = await membershipRepo.findOne({
      where: { accountId: payload.accountId, tenantId },
    });
    if (!membership) {
      throw new UnauthorizedError("Workspace not found");
    }

    const user = await userRepo.findOne({
      where: { id: membership.userId },
      relations: ["roles"],
    });
    if (!user) {
      throw new UnauthorizedError("User not found");
    }
    const tenant = await tenantRepo.findOne({ where: { id: tenantId } });

    let roles = user.roles.map((role) => role.code);
    const contractorProfile = await AppDataSource.getRepository(ContractorProfile).findOne({
      where: { userId: user.id, isDeleted: false },
    });
    if (contractorProfile && !roles.includes(SystemRole.SUB_CONTRACTOR)) {
      roles = [...roles, SystemRole.SUB_CONTRACTOR];
    }

    const appRoleCodes = [SystemRole.FIELD_WORKER, SystemRole.SUB_CONTRACTOR];
    const hasAppRoles = roles.some((role) => appRoleCodes.includes(role as SystemRole));
    const hasCustomerRole = roles.includes(SystemRole.CUSTOMER);
    if (hasAppRoles || hasCustomerRole) {
      throw new UnauthorizedError("Tenant access denied");
    }

    const tenantToken = signToken({
      userId: user.id,
      tenantId: user.tenantId,
      roles,
    });

    res.deliver(
      200,
      true,
      {
        token: tenantToken,
        tenantId: user.tenantId,
        user,
        subdomain: tenant?.subdomain,
      },
      "Workspace selected",
    );
  } catch (error) {
    next(error);
  }
};

export const verifyAccountOtp = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { email, code } = req.body;
    const accountRepo = AppDataSource.getRepository(Account);
    const verificationRepo = AppDataSource.getRepository(AccountVerification);
    const accountTenantRepo = AppDataSource.getRepository(AccountTenant);
    const tenantRepo = AppDataSource.getRepository(Tenant);
    const userRepo = AppDataSource.getRepository(User);

    const account = await accountRepo.findOne({ where: { email } });
    if (!account) {
      throw new UnauthorizedError("Account not found");
    }

    const verification = await verificationRepo.findOne({
      where: {
        email,
        accountId: account.id,
        verifiedAt: IsNull(),
        isDeleted: false,
      },
      order: { createdAt: "DESC" },
    });
    if (!verification) {
      throw new UnauthorizedError("OTP not found");
    }
    if (verification.attempts >= 5) {
      throw new UnauthorizedError("Too many attempts. Please resend OTP.");
    }
    if (!verification.expiresAt || verification.expiresAt.getTime() < Date.now()) {
      throw new UnauthorizedError("OTP expired");
    }

    const ok = await bcrypt.compare(String(code), verification.codeHash);
    if (!ok) {
      verification.attempts += 1;
      await verificationRepo.save(verification);
      throw new UnauthorizedError("Invalid OTP");
    }

    verification.verifiedAt = new Date();
    await verificationRepo.save(verification);

    account.isActive = true;
    account.emailVerifiedAt = new Date();
    await accountRepo.save(account);

    const membership = await accountTenantRepo.findOne({
      where: req.tenantId
        ? { accountId: account.id, tenantId: req.tenantId }
        : { accountId: account.id },
    });
    if (!membership) {
      throw new UnauthorizedError("Workspace not found");
    }
    const user = await userRepo.findOne({
      where: { id: membership.userId },
      relations: ["roles"],
    });
    const tenant = await tenantRepo.findOne({
      where: { id: membership.tenantId },
    });

    if (user) {
      user.isActive = true;
      await userRepo.save(user);
    }

    const tenantToken = signToken({
      userId: user?.id,
      tenantId: membership.tenantId,
      roles: user?.roles?.map((role) => role.code) ?? [],
    });
    const devOtp = shouldExposeAuthDetails() ? code : undefined;

    res.deliver(
      200,
      true,
      {
        token: tenantToken,
        tenantId: membership.tenantId,
        subdomain: tenant?.subdomain,
        devOtp,
      },
      "OTP verified",
    );
  } catch (error) {
    next(error);
  }
};

export const resendAccountOtp = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { email } = req.body;
    const accountRepo = AppDataSource.getRepository(Account);
    const membershipRepo = AppDataSource.getRepository(AccountTenant);
    const verificationRepo = AppDataSource.getRepository(AccountVerification);

    const account = await accountRepo.findOne({ where: { email } });
    if (!account) {
      throw new UnauthorizedError("Account not found");
    }
    const membership = await membershipRepo.findOne({
      where: req.tenantId
        ? { accountId: account.id, tenantId: req.tenantId }
        : { accountId: account.id },
    });
    if (!membership) {
      throw new UnauthorizedError("Account not found");
    }
    if (account.emailVerifiedAt) {
      throw new BadRequestError("Email already verified");
    }

    const latest = await verificationRepo.findOne({
      where: {
        email,
        accountId: account.id,
        verifiedAt: IsNull(),
        isDeleted: false,
      },
      order: { createdAt: "DESC" },
    });

    if (latest && Date.now() - latest.createdAt.getTime() < 60 * 1000) {
      throw new BadRequestError("Please wait before requesting another code");
    }

    const since = new Date(Date.now() - 15 * 60 * 1000);
    const recentCount = await verificationRepo
      .createQueryBuilder("verification")
      .where("verification.email = :email", { email })
      .andWhere("verification.createdAt >= :since", { since })
      .getCount();

    if (recentCount >= 5) {
      throw new BadRequestError("Too many OTP requests. Try again later.");
    }

    const code = `${Math.floor(100000 + Math.random() * 900000)}`;
    const codeHash = await bcrypt.hash(code, 10);
    const verification = verificationRepo.create({
      email,
      accountId: account.id,
      codeHash,
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
    });
    await verificationRepo.save(verification);
    await sendOtpEmail(email, code);
    const devOtp = shouldExposeAuthDetails() ? code : undefined;

    res.deliver(
      200,
      true,
      {
        email,
        expiresAt: verification.expiresAt,
        devOtp,
      },
      "OTP resent",
    );
  } catch (error) {
    next(error);
  }
};

export const forgotPassword = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { email } = req.body;
    const account = await AppDataSource.getRepository(Account).findOne({ where: { email } });
    if (account) {
      const membership = await AppDataSource.getRepository(AccountTenant).findOne({
        where: req.tenantId
          ? { accountId: account.id, tenantId: req.tenantId }
          : { accountId: account.id },
      });
      if (!membership) {
        return res.deliver(200, true, { sent: true }, "If the email exists, a reset link has been sent");
      }
    }
    const baseUrl = req.tenantId
      ? await resolveTenantAppBaseUrl(req.tenantId)
      : undefined;
    const result = await createPasswordReset(email, "/reset-password", { baseUrl });
    res.deliver(
      200,
      true,
      result,
      "If the email exists, a reset link has been sent",
    );
  } catch (error) {
    console.log(error);
    next(error);
  }
};

export const resetPasswordWithToken = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { email, token, password } = req.body;
    const account = await AppDataSource.getRepository(Account).findOne({ where: { email } });
    const membership = account
      ? await AppDataSource.getRepository(AccountTenant).findOne({
          where: req.tenantId
            ? { accountId: account.id, tenantId: req.tenantId }
            : { accountId: account.id },
        })
      : null;
    if (!membership) {
      throw new BadRequestError("Invalid or expired reset link");
    }
    const result = await resetPassword(email, token, password);
    res.deliver(200, true, result, "Password updated");
  } catch (error) {
    next(error);
  }
};

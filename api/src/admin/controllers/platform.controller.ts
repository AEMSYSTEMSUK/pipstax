import { Request, Response, NextFunction } from 'express';
import { AppDataSource } from '../../config/data-source';
import { Tenant } from '../../entities/tenant.entity';
import { User } from '../../entities/user.entity';
import { Customer } from '../../entities/customer.entity';
import { Job } from '../../entities/job.entity';
import { Quote } from '../../entities/quote.entity';
import { Invoice } from '../../entities/invoice.entity';
import { Ticket } from '../../entities/ticket.entity';
import { Role } from '../../entities/role.entity';
import { PlatformAdmin } from '../entities/platform-admin.entity';
import { hashPassword } from '../../utils/password';
import { BadRequestError } from '../../utils/errors';
import { ensureRolesForTenant } from '../../services/roles.service';
import { SystemRole } from '../../constants/roles';
import { InvoiceStatus } from '../../constants/status';
import { generateUniqueSubdomain, isValidSubdomain, slugifySubdomain, normalizeSubdomain } from '../../utils/subdomain';
import { Account } from '../../entities/account.entity';
import { AccountTenant } from '../../entities/account-tenant.entity';
import { randomUUID } from 'crypto';
import { normalizeStoredFileReference, resolveStoredFileUrl } from '../../services/storage/storage.service';
import {
  DEFAULT_TENANT_FEATURE_FLAGS,
  normalizeTenantFeatureFlags,
  sanitizeTenantFeatureFlagsInput,
} from '../../services/tenant-features.service';

const tenantSummary = async (tenantId: string) => {
  const userRepo = AppDataSource.getRepository(User);
  const customerRepo = AppDataSource.getRepository(Customer);
  const jobRepo = AppDataSource.getRepository(Job);
  const quoteRepo = AppDataSource.getRepository(Quote);
  const invoiceRepo = AppDataSource.getRepository(Invoice);
  const ticketRepo = AppDataSource.getRepository(Ticket);

  const [users, customers, jobs, quotes, invoices, tickets] = await Promise.all([
    userRepo.count({ where: { tenantId } }),
    customerRepo.count({ where: { tenantId } }),
    jobRepo.count({ where: { tenantId } }),
    quoteRepo.count({ where: { tenantId } }),
    invoiceRepo.count({ where: { tenantId } }),
    ticketRepo.count({ where: { tenantId } })
  ]);

  return { users, customers, jobs, quotes, invoices, tickets };
};

export const platformOverview = async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantRepo = AppDataSource.getRepository(Tenant);
    const userRepo = AppDataSource.getRepository(User);
    const jobRepo = AppDataSource.getRepository(Job);
    const quoteRepo = AppDataSource.getRepository(Quote);
    const invoiceRepo = AppDataSource.getRepository(Invoice);
    const ticketRepo = AppDataSource.getRepository(Ticket);

    const [tenants, users, jobs, quotes, invoices, tickets] = await Promise.all([
      tenantRepo.count(),
      userRepo.count(),
      jobRepo.count(),
      quoteRepo.count(),
      invoiceRepo.count(),
      ticketRepo.count()
    ]);

    const totals = await invoiceRepo
      .createQueryBuilder('invoice')
      .select('SUM(invoice.total)', 'total')
      .addSelect('SUM(CASE WHEN invoice.status = :paid THEN invoice.total ELSE 0 END)', 'paid')
      .addSelect('SUM(CASE WHEN invoice.status = :overdue THEN invoice.total ELSE 0 END)', 'overdue')
      .setParameters({ paid: InvoiceStatus.PAID, overdue: InvoiceStatus.OVERDUE })
      .getRawOne();

    res.deliver(200, true, {
      tenants,
      users,
      jobs,
      quotes,
      invoices,
      tickets,
      totalInvoiced: Number(totals?.total ?? 0),
      totalPaid: Number(totals?.paid ?? 0),
      totalOverdue: Number(totals?.overdue ?? 0)
    });
  } catch (error) {
    next(error);
  }
};

export const listTenants = async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const repo = AppDataSource.getRepository(Tenant);
    const tenants = await repo.find({ order: { createdAt: 'DESC' } });

    const results = await Promise.all(
      tenants.map(async (tenant: Tenant) => ({
        ...tenant,
        featureFlags: normalizeTenantFeatureFlags(tenant.featureFlags),
        logoUrl: resolveStoredFileUrl(tenant.logoUrl),
        emailHeaderLogoUrl: resolveStoredFileUrl(tenant.emailHeaderLogoUrl),
        stats: await tenantSummary(tenant.id)
      }))
    );

    res.deliver(200, true, results, 'Tenants fetched');
  } catch (error) {
    next(error);
  }
};

export const getTenant = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const repo = AppDataSource.getRepository(Tenant);
    const tenant = await repo.findOne({ where: { id: req.params.id } });
    if (!tenant) {
      throw new BadRequestError('Tenant not found');
    }
    const stats = await tenantSummary(tenant.id);
    res.deliver(200, true, {
      tenant: {
        ...tenant,
        featureFlags: normalizeTenantFeatureFlags(tenant.featureFlags),
        logoUrl: resolveStoredFileUrl(tenant.logoUrl),
        emailHeaderLogoUrl: resolveStoredFileUrl(tenant.emailHeaderLogoUrl),
      },
      stats,
    });
  } catch (error) {
    next(error);
  }
};

export const updateTenant = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const repo = AppDataSource.getRepository(Tenant);
    const tenant = await repo.findOne({ where: { id: req.params.id } });
    if (!tenant) {
      throw new BadRequestError('Tenant not found');
    }

    const {
      name,
      tradingName,
      subdomain,
      logoUrl,
      primaryColor,
      emailHeaderLogoUrl,
      address,
      contactEmail,
      contactPhone,
      featureFlags,
      isDeleted,
    } = req.body;

    if (subdomain !== undefined) {
      const normalized = normalizeSubdomain(subdomain);
      if (!isValidSubdomain(normalized)) {
        throw new BadRequestError('Invalid subdomain');
      }
      const existing = await repo.findOne({ where: { subdomain: normalized } });
      if (existing && existing.id !== tenant.id) {
        throw new BadRequestError('Subdomain already in use');
      }
      tenant.subdomain = normalized;
    }

    tenant.name = name ?? tenant.name;
    tenant.tradingName = tradingName ?? tenant.tradingName;
    tenant.logoUrl = logoUrl ?? tenant.logoUrl;
    tenant.primaryColor = primaryColor ?? tenant.primaryColor;
    tenant.emailHeaderLogoUrl = emailHeaderLogoUrl ?? tenant.emailHeaderLogoUrl;
    tenant.address = address ?? tenant.address;
    tenant.contactEmail = contactEmail ?? tenant.contactEmail;
    tenant.contactPhone = contactPhone ?? tenant.contactPhone;
    if (typeof isDeleted === 'boolean') {
      tenant.isDeleted = isDeleted;
      tenant.deletedAt = isDeleted ? tenant.deletedAt ?? new Date() : undefined;
      tenant.deletedByActorId = isDeleted ? tenant.deletedByActorId : undefined;
      tenant.deletedByActorType = isDeleted ? tenant.deletedByActorType : undefined;
    }
    if (Object.prototype.hasOwnProperty.call(req.body, 'featureFlags')) {
      tenant.featureFlags = sanitizeTenantFeatureFlagsInput(featureFlags) ?? tenant.featureFlags;
    }
    tenant.logoUrl = normalizeStoredFileReference(tenant.logoUrl);
    tenant.emailHeaderLogoUrl = normalizeStoredFileReference(tenant.emailHeaderLogoUrl);

    await repo.save(tenant);
    res.deliver(200, true, {
      ...tenant,
      featureFlags: normalizeTenantFeatureFlags(tenant.featureFlags),
      logoUrl: resolveStoredFileUrl(tenant.logoUrl),
      emailHeaderLogoUrl: resolveStoredFileUrl(tenant.emailHeaderLogoUrl),
    }, 'Tenant updated');
  } catch (error) {
    next(error);
  }
};

export const createTenant = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const {
      name,
      tradingName,
      subdomain,
      adminEmail,
      adminPassword,
      adminName,
      primaryColor,
      logoUrl,
      contactEmail,
      contactPhone,
      address,
      featureFlags,
    } = req.body;

    if (!name || !tradingName || !adminEmail || !adminPassword || !adminName) {
      throw new BadRequestError('Missing required fields');
    }

    const tenantRepo = AppDataSource.getRepository(Tenant);
    const userRepo = AppDataSource.getRepository(User);
    const roleRepo = AppDataSource.getRepository(Role);
    const accountRepo = AppDataSource.getRepository(Account);
    const accountTenantRepo = AppDataSource.getRepository(AccountTenant);

    const existing = await accountRepo.findOne({ where: { email: adminEmail } });
    if (existing) {
      throw new BadRequestError('Admin email already exists');
    }

    const baseSubdomain = slugifySubdomain(subdomain ?? tradingName);
    if (!isValidSubdomain(baseSubdomain)) {
      throw new BadRequestError('Invalid subdomain');
    }
    const normalizedSubdomain = await generateUniqueSubdomain(tenantRepo, baseSubdomain);

    const tenant = tenantRepo.create({
      name,
      tradingName,
      subdomain: normalizedSubdomain,
      primaryColor,
      logoUrl: normalizeStoredFileReference(logoUrl),
      contactEmail,
      contactPhone,
      address,
      featureFlags: sanitizeTenantFeatureFlagsInput(featureFlags) ?? DEFAULT_TENANT_FEATURE_FLAGS,
    });
    await tenantRepo.save(tenant);

    const roles = await ensureRolesForTenant(tenant.id);
    const adminRole = roles.find((role: Role) => role.code === SystemRole.ADMIN);
    if (!adminRole) {
      throw new BadRequestError('Admin role missing');
    }

    const account = accountRepo.create({
      email: adminEmail,
      passwordHash: await hashPassword(adminPassword),
      isActive: true,
      emailVerifiedAt: new Date()
    });
    await accountRepo.save(account);

    const user = userRepo.create({
      fullName: adminName,
      email: adminEmail,
      tenantId: tenant.id,
      accountId: account.id,
      roles: [adminRole]
    });
    await userRepo.save(user);
    await accountTenantRepo.save(
      accountTenantRepo.create({
        accountId: account.id,
        tenantId: tenant.id,
        userId: user.id
      })
    );

    const stats = await tenantSummary(tenant.id);
    res.deliver(201, true, {
      tenant: {
        ...tenant,
        featureFlags: normalizeTenantFeatureFlags(tenant.featureFlags),
        logoUrl: resolveStoredFileUrl(tenant.logoUrl),
        emailHeaderLogoUrl: resolveStoredFileUrl(tenant.emailHeaderLogoUrl),
      },
      adminUser: user,
      stats,
    }, 'Tenant created');
  } catch (error) {
    next(error);
  }
};

export const listTenantUsers = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const repo = AppDataSource.getRepository(User);
    const users = await repo.find({
      where: { tenantId: req.params.id },
      relations: ['roles'],
      order: { createdAt: 'DESC' }
    });
    res.deliver(200, true, users, 'Users fetched');
  } catch (error) {
    next(error);
  }
};

export const resetTenantUserPassword = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = req.params.id;
    const userId = req.params.userId;
    const userRepo = AppDataSource.getRepository(User);
    const accountRepo = AppDataSource.getRepository(Account);
    const user = await userRepo.findOne({ where: { id: userId, tenantId, isDeleted: false } });
    if (!user) {
      throw new BadRequestError('Tenant user not found');
    }
    const account = user.accountId
      ? await accountRepo.findOne({ where: { id: user.accountId, isDeleted: false } })
      : await accountRepo.findOne({ where: { email: user.email, isDeleted: false } });
    if (!account) {
      throw new BadRequestError('Linked login account not found');
    }
    const providedPassword =
      typeof req.body?.password === 'string' && req.body.password.trim().length > 0
        ? req.body.password.trim()
        : undefined;
    if (providedPassword && providedPassword.length < 6) {
      throw new BadRequestError('Password must be at least 6 characters');
    }
    const nextPassword = providedPassword ?? `Pip-${randomUUID().replace(/-/g, '').slice(0, 10)}`;
    account.passwordHash = await hashPassword(nextPassword);
    account.isActive = true;
    account.emailVerifiedAt = account.emailVerifiedAt ?? new Date();
    await accountRepo.save(account);

    res.deliver(200, true, {
      userId: user.id,
      email: account.email,
      tempPassword: nextPassword,
    }, 'Tenant user password reset');
  } catch (error) {
    next(error);
  }
};

export const listPlatformAdmins = async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const repo = AppDataSource.getRepository(PlatformAdmin);
    const admins = await repo.find({
      relations: ['roles'],
      order: { createdAt: 'DESC' }
    });
    res.deliver(200, true, admins, 'Platform admins fetched');
  } catch (error) {
    next(error);
  }
};

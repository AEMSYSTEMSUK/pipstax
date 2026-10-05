import { Request, Response, NextFunction } from 'express';
import { AppDataSource } from '../../../config/data-source';
import { Account } from '../../../entities/account.entity';
import { CustomerAccountTenant } from '../../../entities/customer-account-tenant.entity';
import { Customer } from '../../../entities/customer.entity';
import { Tenant } from '../../../entities/tenant.entity';
import { verifyPassword } from '../../../utils/password';
import { signToken, verifyToken } from '../../../utils/jwt';
import { BadRequestError, UnauthorizedError } from '../../../utils/errors';
import { createPasswordReset, resetPassword } from '../../../services/password-reset.service';
import { resolveStoredFileUrl } from '../../../services/storage/storage.service';
import crypto from 'crypto';
import { resolveTenantAppBaseUrl } from '../../../utils/tenant-url';

export const customerLogin = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email, password } = req.body;
    const accountRepo = AppDataSource.getRepository(Account);
    const linkRepo = AppDataSource.getRepository(CustomerAccountTenant);
    const tenantRepo = AppDataSource.getRepository(Tenant);
    const customerRepo = AppDataSource.getRepository(Customer);

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

    const links = await linkRepo.find({
      where: req.tenantId
        ? { accountId: account.id, tenantId: req.tenantId }
        : { accountId: account.id },
    });
    if (links.length === 0) {
      throw new UnauthorizedError('No customer workspaces found');
    }

    const tenantIds = links.map((l) => l.tenantId);
    const customerIds = links.map((l) => l.customerId);
    const tenants = await tenantRepo.find({ where: tenantIds.map((id) => ({ id })) });
    const customers = await customerRepo.find({ where: customerIds.map((id) => ({ id })) });
    const tenantMap = new Map(tenants.map((t) => [t.id, t]));
    const customerMap = new Map(customers.map((c) => [c.id, c]));

    const workspaces = links
      .filter((link) => {
        const customer = customerMap.get(link.customerId);
        return customer?.email?.toLowerCase() === account.email.toLowerCase();
      })
      .map((link) => {
      const tenant = tenantMap.get(link.tenantId);
      const customer = customerMap.get(link.customerId);
      return {
        tenantId: link.tenantId,
        customerId: link.customerId,
        subdomain: tenant?.subdomain,
        tradingName: tenant?.tradingName ?? tenant?.name,
        logoUrl: resolveStoredFileUrl(tenant?.logoUrl),
        primaryColor: tenant?.primaryColor,
        customerName: customer?.name ?? customer?.email
      };
    });
    if (workspaces.length === 0) {
      throw new UnauthorizedError('No customer workspaces found');
    }

    const token = signToken({ accountId: account.id, scope: 'customer' });
    res.deliver(200, true, { token, workspaces }, 'Customer login successful');
  } catch (error) {
    next(error);
  }
};

export const selectCustomerTenant = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
      throw new UnauthorizedError('Missing authorization header');
    }
    const token = header.replace('Bearer ', '').trim();
    const payload = verifyToken<any>(token);
    if (payload.scope !== 'customer' || !payload.accountId) {
      throw new UnauthorizedError('Invalid token');
    }

    const { tenantId } = req.body;
    if (req.tenantId && tenantId !== req.tenantId) {
      throw new UnauthorizedError('Workspace not found');
    }
    const linkRepo = AppDataSource.getRepository(CustomerAccountTenant);
    const customerRepo = AppDataSource.getRepository(Customer);
    const tenantRepo = AppDataSource.getRepository(Tenant);

    const link = await linkRepo.findOne({ where: { accountId: payload.accountId, tenantId } });
    if (!link) {
      throw new UnauthorizedError('Workspace not found');
    }
    const customer = await customerRepo.findOne({ where: { id: link.customerId } });
    const account = await AppDataSource.getRepository(Account).findOne({ where: { id: payload.accountId } });
    const tenant = await tenantRepo.findOne({ where: { id: tenantId } });
    if (!customer || !account) {
      throw new UnauthorizedError('Customer not found');
    }
    if (customer.email.toLowerCase() !== account.email.toLowerCase()) {
      throw new UnauthorizedError('Workspace not found');
    }
    if (!customer.portalToken) {
      customer.portalToken = crypto.randomBytes(12).toString('hex');
      await customerRepo.save(customer);
    }

    res.deliver(200, true, {
      tenantId,
      subdomain: tenant?.subdomain,
      portalToken: customer.portalToken
    }, 'Workspace selected');
  } catch (error) {
    next(error);
  }
};

export const customerForgotPassword = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email } = req.body;
    const account = await AppDataSource.getRepository(Account).findOne({ where: { email } });
    if (account) {
      const link = await AppDataSource.getRepository(CustomerAccountTenant).findOne({
        where: req.tenantId
          ? { accountId: account.id, tenantId: req.tenantId }
          : { accountId: account.id },
      });
      if (!link) {
        return res.deliver(200, true, { sent: true }, "If the email exists, a reset link has been sent");
      }
    }
    const baseUrl = req.tenantId
      ? await resolveTenantAppBaseUrl(req.tenantId)
      : undefined;
    const result = await createPasswordReset(email, "/customer/reset-password", { baseUrl });
    res.deliver(
      200,
      true,
      result,
      "If the email exists, a reset link has been sent",
    );
  } catch (error) {
    next(error);
  }
};

export const customerResetPassword = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email, token, password } = req.body;
    const account = await AppDataSource.getRepository(Account).findOne({ where: { email } });
    const link = account
      ? await AppDataSource.getRepository(CustomerAccountTenant).findOne({
          where: req.tenantId
            ? { accountId: account.id, tenantId: req.tenantId }
            : { accountId: account.id },
        })
      : null;
    if (!link) {
      throw new BadRequestError('Invalid or expired reset link');
    }
    const result = await resetPassword(email, token, password);
    res.deliver(200, true, result, "Password updated");
  } catch (error) {
    next(error);
  }
};

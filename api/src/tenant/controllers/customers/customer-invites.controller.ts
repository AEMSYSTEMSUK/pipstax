import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { AppDataSource } from '../../../config/data-source';
import { Customer } from '../../../entities/customer.entity';
import { CustomerInvite } from '../../../entities/customer-invite.entity';
import { Account } from '../../../entities/account.entity';
import { CustomerAccountTenant } from '../../../entities/customer-account-tenant.entity';
import { getTenantId } from '../../../utils/request';
import { BadRequestError, UnauthorizedError } from '../../../utils/errors';
import { hashPassword, verifyPassword } from '../../../utils/password';
import { sendCustomerInviteEmail } from '../../../services/notifications.service';
import { Tenant } from '../../../entities/tenant.entity';
import { withAuthDetails } from '../../../utils/auth-details';
import { resolveTenantAppUrl } from '../../../utils/tenant-url';

const buildInviteLink = (tenantId: string, token: string) =>
  resolveTenantAppUrl(tenantId, `/customer/invite?token=${encodeURIComponent(token)}`);

export const inviteCustomer = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = getTenantId(req);
    const { email, fullName } = req.body;
    const shouldSendInvite = req.body.sendInvite === true;
    const customerRepo = AppDataSource.getRepository(Customer);
    const inviteRepo = AppDataSource.getRepository(CustomerInvite);
    const accountRepo = AppDataSource.getRepository(Account);
    const linkRepo = AppDataSource.getRepository(CustomerAccountTenant);

    let customer = await customerRepo.findOne({ where: { email, tenantId, isDeleted: false } });
    if (!customer) {
      customer = customerRepo.create({
        name: fullName ?? email.split('@')[0],
        email,
        tenantId,
        portalToken: crypto.randomBytes(12).toString('hex')
      });
      await customerRepo.save(customer);
    }

    if (!shouldSendInvite) {
      res.deliver(201, true, { customer, invited: false }, 'Customer created');
      return;
    }

    const existingLink = await linkRepo.findOne({ where: { tenantId, customerId: customer.id } });
    const account = await accountRepo.findOne({ where: { email } });
    if (existingLink && account) {
      return res.deliver(200, true, { invited: false, alreadyLinked: true }, 'Customer already linked');
    }

    const token = crypto.randomBytes(24).toString('hex');
    const invite = inviteRepo.create({
      tenantId,
      customerId: customer.id,
      email,
      fullName,
      token,
      accountId: account?.id,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
    });
    await inviteRepo.save(invite);
    const inviteLink = await buildInviteLink(tenantId, token);
    await sendCustomerInviteEmail(email, inviteLink, { tenantId });
    const payload = withAuthDetails(
      { invited: true },
      { token, inviteLink, email }
    );
    res.deliver(201, true, payload, 'Invite sent');
  } catch (error) {
    next(error);
  }
};

export const getInvite = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { token } = req.params;
    const inviteRepo = AppDataSource.getRepository(CustomerInvite);
    const tenantRepo = AppDataSource.getRepository(Tenant);
    const accountRepo = AppDataSource.getRepository(Account);

    const invite = await inviteRepo.findOne({ where: { token, isDeleted: false }, relations: ['customer'] });
    if (!invite || (req.tenantId && invite.tenantId !== req.tenantId) || invite.acceptedAt) {
      throw new BadRequestError('Invite expired');
    }
    const tenant = await tenantRepo.findOne({ where: { id: invite.tenantId } });
    const account = await accountRepo.findOne({ where: { email: invite.email } });

    res.deliver(200, true, {
      email: invite.email,
      fullName: invite.fullName,
      tenantId: invite.tenantId,
      tenantName: tenant?.tradingName ?? tenant?.name ?? 'Workspace',
      hasAccount: Boolean(account),
      subdomain: tenant?.subdomain
    }, 'Invite loaded');
  } catch (error) {
    next(error);
  }
};

export const acceptInvite = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { token, password, fullName } = req.body;
    const inviteRepo = AppDataSource.getRepository(CustomerInvite);
    const accountRepo = AppDataSource.getRepository(Account);
    const linkRepo = AppDataSource.getRepository(CustomerAccountTenant);
    const customerRepo = AppDataSource.getRepository(Customer);

    const invite = await inviteRepo.findOne({ where: { token, isDeleted: false }, relations: ['customer'] });
    if (!invite || (req.tenantId && invite.tenantId !== req.tenantId)) {
      throw new BadRequestError('Invite expired');
    }
    if (invite.acceptedAt) {
      throw new BadRequestError('Invite already accepted');
    }

    let account = await accountRepo.findOne({ where: { email: invite.email } });
    if (!account) {
      if (!password) {
        throw new BadRequestError('Password required');
      }
      account = accountRepo.create({
        email: invite.email,
        passwordHash: await hashPassword(password),
        isActive: true,
        emailVerifiedAt: new Date()
      });
      await accountRepo.save(account);
    } else if (password) {
      const ok = await verifyPassword(password, account.passwordHash);
      if (!ok) {
        throw new UnauthorizedError('Invalid credentials');
      }
      if (!account.emailVerifiedAt || !account.isActive) {
        account.emailVerifiedAt = new Date();
        account.isActive = true;
        await accountRepo.save(account);
      }
    }

    let customer = invite.customerId
      ? await customerRepo.findOne({ where: { id: invite.customerId, tenantId: invite.tenantId } })
      : null;
    if (!customer) {
      customer = await customerRepo
        .createQueryBuilder('customer')
        .where('customer.tenantId = :tenantId', { tenantId: invite.tenantId })
        .andWhere('customer.isDeleted = false')
        .andWhere('LOWER(customer.email) = :email', {
          email: String(invite.email ?? '').trim().toLowerCase(),
        })
        .orderBy('customer.createdAt', 'DESC')
        .getOne();
    }
    if (!customer) {
      customer = customerRepo.create({
        tenantId: invite.tenantId,
        name: (fullName ?? invite.fullName ?? invite.email.split('@')[0]).trim(),
        email: invite.email,
      });
      await customerRepo.save(customer);
    } else {
      if (customer.email !== invite.email) {
        customer.email = invite.email;
      }
      if (fullName?.trim()) {
        customer.name = fullName.trim();
      }
      await customerRepo.save(customer);
    }

    if (!invite.customerId) {
      invite.customerId = customer.id;
    }

    const existingLink = await linkRepo.findOne({ where: { accountId: account.id, tenantId: invite.tenantId } });
    if (!existingLink) {
      await linkRepo.save(linkRepo.create({
        accountId: account.id,
        tenantId: invite.tenantId,
        customerId: customer.id
      }));
    }

    invite.acceptedAt = new Date();
    invite.accountId = account.id;
    await inviteRepo.save(invite);

    res.deliver(200, true, { accepted: true }, 'Invite accepted');
  } catch (error) {
    next(error);
  }
};

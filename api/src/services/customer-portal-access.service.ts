import crypto from 'crypto';
import { IsNull } from 'typeorm';
import { AppDataSource } from '../config/data-source';
import { Account } from '../entities/account.entity';
import { CustomerAccountTenant } from '../entities/customer-account-tenant.entity';
import { CustomerInvite } from '../entities/customer-invite.entity';
import { Customer } from '../entities/customer.entity';
import { resolveTenantAppUrl } from '../utils/tenant-url';

const buildCustomerInviteLink = async (tenantId: string, token: string, nextPath?: string) => {
  const safeNextPath =
    typeof nextPath === 'string' && nextPath.startsWith('/portal') ? nextPath : undefined;
  const nextParam = safeNextPath ? `&next=${encodeURIComponent(safeNextPath)}` : '';
  return resolveTenantAppUrl(tenantId, `/customer/invite?token=${encodeURIComponent(token)}${nextParam}`);
};

const buildCustomerLoginLink = async (tenantId: string, nextPath?: string) => {
  const safeNextPath =
    typeof nextPath === 'string' && nextPath.startsWith('/portal') ? nextPath : undefined;
  const nextParam = safeNextPath ? `?next=${encodeURIComponent(safeNextPath)}` : '';
  return resolveTenantAppUrl(tenantId, `/customer/login${nextParam}`);
};

export const ensureCustomerPortalAccess = async (params: {
  tenantId: string;
  customer: Customer;
  nextPath?: string;
}) => {
  const accountRepo = AppDataSource.getRepository(Account);
  const customerInviteRepo = AppDataSource.getRepository(CustomerInvite);
  const customerTenantLinkRepo = AppDataSource.getRepository(CustomerAccountTenant);

  const account = await accountRepo.findOne({
    where: { email: params.customer.email },
  });

  const accountReady = Boolean(account?.isActive && account?.emailVerifiedAt);
  if (account && accountReady) {
    const linked = await customerTenantLinkRepo.findOne({
      where: {
        accountId: account.id,
        tenantId: params.tenantId,
        customerId: params.customer.id,
      },
    });
    if (linked) {
      return {
        onboardingLink: null,
        loginLink: await buildCustomerLoginLink(params.tenantId, params.nextPath),
      };
    }
  }

  const existingInvite = await customerInviteRepo.findOne({
    where: {
      tenantId: params.tenantId,
      customerId: params.customer.id,
      email: params.customer.email,
      acceptedAt: IsNull(),
      isDeleted: false,
    },
    order: { createdAt: 'DESC' },
  });

  const invite =
    existingInvite ??
    customerInviteRepo.create({
      tenantId: params.tenantId,
      customerId: params.customer.id,
      email: params.customer.email,
      fullName: params.customer.name,
      token: crypto.randomBytes(24).toString('hex'),
      accountId: account?.id,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    });

  if (!existingInvite) {
    await customerInviteRepo.save(invite);
  }

  return {
    onboardingLink: await buildCustomerInviteLink(params.tenantId, invite.token, params.nextPath),
    loginLink: await buildCustomerLoginLink(params.tenantId, params.nextPath),
  };
};

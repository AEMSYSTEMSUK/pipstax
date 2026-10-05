import 'reflect-metadata';
import crypto from 'crypto';
import { AppDataSource } from '../src/config/data-source';
import { Tenant } from '../src/entities/tenant.entity';
import { Customer } from '../src/entities/customer.entity';
import { CustomerInvite } from '../src/entities/customer-invite.entity';
import { Account } from '../src/entities/account.entity';

const args = process.argv.slice(2);
const email = args[0];
const fullName = args[1] ?? '';
const subdomain = args[2] ?? 'aem-demo';

if (!email) {
  console.error('Usage: ts-node scripts/create_customer_invite.ts <email> <fullName> [subdomain]');
  process.exit(1);
}

const buildInviteLink = (token: string) => {
  const base = process.env.APP_URL ?? 'http://127.0.0.1:3000';
  return `${base}/customer/invite?token=${token}`;
};

const run = async () => {
  await AppDataSource.initialize();
  const tenantRepo = AppDataSource.getRepository(Tenant);
  const customerRepo = AppDataSource.getRepository(Customer);
  const inviteRepo = AppDataSource.getRepository(CustomerInvite);
  const accountRepo = AppDataSource.getRepository(Account);

  const tenant = await tenantRepo.findOne({ where: { subdomain, isDeleted: false } });
  if (!tenant) {
    throw new Error(`Tenant not found for subdomain: ${subdomain}`);
  }

  let customer = await customerRepo.findOne({
    where: { email, tenantId: tenant.id, isDeleted: false }
  });
  if (!customer) {
    customer = customerRepo.create({
      name: fullName || email.split('@')[0],
      email,
      tenantId: tenant.id,
      portalToken: crypto.randomBytes(12).toString('hex')
    });
    await customerRepo.save(customer);
  } else if (customer.email !== email) {
    customer.email = email;
    await customerRepo.save(customer);
  }

  const account = await accountRepo.findOne({ where: { email } });
  const token = crypto.randomBytes(24).toString('hex');
  const invite = inviteRepo.create({
    tenantId: tenant.id,
    customerId: customer.id,
    email,
    fullName,
    token,
    accountId: account?.id,
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
  });
  await inviteRepo.save(invite);

  console.log('Invite created:');
  console.log(`Tenant: ${tenant.tradingName ?? tenant.name} (${tenant.subdomain})`);
  console.log(`Customer: ${customer.name} <${customer.email}>`);
  console.log(`Link: ${buildInviteLink(token)}`);
  await AppDataSource.destroy();
};

run().catch((err) => {
  console.error('Invite failed:', err);
  process.exit(1);
});

import 'reflect-metadata';
import bcrypt from 'bcryptjs';
import { AppDataSource } from '../config/data-source';
import { Account } from '../entities/account.entity';
import { AccountTenant } from '../entities/account-tenant.entity';
import { ContractorProfile } from '../entities/contractor-profile.entity';
import { DocumentRequirement } from '../entities/document-requirement.entity';
import { Tenant } from '../entities/tenant.entity';
import { User } from '../entities/user.entity';
import { SystemRole } from '../constants/roles';
import { ensureRolesForTenant } from '../services/roles.service';
import { ContractorComplianceStatus } from '../constants/status';

type Args = {
  email: string;
  sourceTenant: string;
  targetTenant: string;
  fullName?: string;
};

const parseArgs = (): Args => {
  const args = process.argv.slice(2);
  const get = (flag: string) => {
    const idx = args.indexOf(flag);
    return idx >= 0 ? args[idx + 1] : undefined;
  };
  const email = get('--email');
  const sourceTenant = get('--sourceTenant');
  const targetTenant = get('--targetTenant');
  const fullName = get('--fullName');
  if (!email || !sourceTenant || !targetTenant) {
    throw new Error('Usage: --email <email> --sourceTenant <id|subdomain> --targetTenant <id|subdomain> [--fullName <name>]');
  }
  return { email, sourceTenant, targetTenant, fullName };
};

const isUuid = (value: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

const findTenant = async (key: string) => {
  const repo = AppDataSource.getRepository(Tenant);
  let tenant: Tenant | null = null;
  if (isUuid(key)) {
    tenant = await repo.findOne({ where: { id: key } });
  }
  if (!tenant) tenant = await repo.findOne({ where: { subdomain: key } });
  if (!tenant) tenant = await repo.findOne({ where: { tradingName: key } });
  if (!tenant) tenant = await repo.findOne({ where: { name: key } });
  return tenant;
};

const cloneContractor = async () => {
  const { email, sourceTenant, targetTenant, fullName } = parseArgs();
  await AppDataSource.initialize();
  const accountRepo = AppDataSource.getRepository(Account);
  const membershipRepo = AppDataSource.getRepository(AccountTenant);
  const userRepo = AppDataSource.getRepository(User);
  const contractorRepo = AppDataSource.getRepository(ContractorProfile);
  const requirementRepo = AppDataSource.getRepository(DocumentRequirement);

  const source = await findTenant(sourceTenant);
  if (!source) throw new Error(`Source tenant not found: ${sourceTenant}`);
  const target = await findTenant(targetTenant);
  if (!target) throw new Error(`Target tenant not found: ${targetTenant}`);

  let account = await accountRepo.findOne({ where: { email } });
  if (!account) {
    const password = process.env.DEFAULT_PASSWORD ?? 'Password123!';
    account = await accountRepo.save(
      accountRepo.create({
        email,
        passwordHash: await bcrypt.hash(password, 10),
        isActive: true,
        emailVerifiedAt: new Date()
      })
    );
    console.log(`Created account for ${email} with password: ${password}`);
  }

  const sourceMembership = await membershipRepo.findOne({ where: { accountId: account.id, tenantId: source.id } });
  if (!sourceMembership) {
    throw new Error(`Account ${email} is not linked to source tenant ${source.tradingName ?? source.name}`);
  }
  const sourceUser = await userRepo.findOne({ where: { id: sourceMembership.userId }, relations: ['roles'] });
  if (!sourceUser) throw new Error('Source user not found');
  const sourceContractor = await contractorRepo.findOne({ where: { userId: sourceUser.id, tenantId: source.id } });
  if (!sourceContractor) {
    throw new Error('Source contractor profile not found');
  }

  let targetMembership = await membershipRepo.findOne({ where: { accountId: account.id, tenantId: target.id } });
  let targetUser: User | null = null;
  if (targetMembership) {
    targetUser = await userRepo.findOne({ where: { id: targetMembership.userId }, relations: ['roles'] });
    if (!targetUser) throw new Error('Target user not found');
    const roleCodes = targetUser.roles?.map((role) => role.code) ?? [];
    if (!(roleCodes.length === 1 && roleCodes[0] === SystemRole.SUB_CONTRACTOR)) {
      throw new Error('Target user has conflicting roles');
    }
  } else {
    const roles = await ensureRolesForTenant(target.id);
    const contractorRole = roles.find((role) => role.code === SystemRole.SUB_CONTRACTOR);
    if (!contractorRole) throw new Error('SUB_CONTRACTOR role missing for target tenant');
    targetUser = await userRepo.save(
      userRepo.create({
        fullName: fullName ?? sourceUser.fullName ?? email,
        email,
        phone: sourceUser.phone ?? undefined,
        tenantId: target.id,
        accountId: account.id,
        roles: [contractorRole]
      })
    );
    targetMembership = await membershipRepo.save(
      membershipRepo.create({
        accountId: account.id,
        tenantId: target.id,
        userId: targetUser.id
      })
    );
  }

  let targetContractor = await contractorRepo.findOne({ where: { userId: targetUser.id, tenantId: target.id } });
  if (!targetContractor) {
    targetContractor = await contractorRepo.save(
      contractorRepo.create({
        userId: targetUser.id,
        companyName: sourceContractor.companyName,
        tradeType: sourceContractor.tradeType,
        contactName: sourceContractor.contactName,
        phone: sourceContractor.phone,
        notes: sourceContractor.notes,
        complianceStatus: ContractorComplianceStatus.PENDING,
        tenantId: target.id
      })
    );
  }

  const sourceRequirements = await requirementRepo.find({
    where: { contractorId: sourceContractor.id, tenantId: source.id }
  });
  const existingTarget = await requirementRepo.find({
    where: { contractorId: targetContractor.id, tenantId: target.id }
  });
  const existingNames = new Set(existingTarget.map((req) => req.name.toLowerCase()));
  const toCreate = sourceRequirements
    .filter((req) => !existingNames.has(req.name.toLowerCase()))
    .map((req) =>
      requirementRepo.create({
        name: req.name,
        description: req.description,
        isRequired: req.isRequired,
        contractorId: targetContractor!.id,
        tenantId: target.id
      })
    );
  if (toCreate.length > 0) {
    await requirementRepo.save(toCreate);
  }

  console.log('Clone completed.');
  console.log(`Account: ${email}`);
  console.log(`Source tenant: ${source.tradingName ?? source.name}`);
  console.log(`Target tenant: ${target.tradingName ?? target.name}`);
  console.log(`Requirements cloned: ${toCreate.length}`);
};

cloneContractor()
  .catch((error) => {
    console.error('Clone failed:', error);
    process.exit(1);
  })
  .finally(async () => {
    await AppDataSource.destroy();
  });

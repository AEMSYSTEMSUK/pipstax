import 'reflect-metadata';
import { AppDataSource } from '../config/data-source';
import { Tenant } from '../entities/tenant.entity';
import { User } from '../entities/user.entity';
import { ContractorProfile } from '../entities/contractor-profile.entity';
import { EmployeeTeam } from '../entities/employee-team.entity';
import { EmployeeTeamMember } from '../entities/employee-team-member.entity';
import { Job } from '../entities/job.entity';
import { JobAssignment } from '../entities/job-assignment.entity';
import { AssignmentType } from '../constants/jobs';
import { JobStatus } from '../constants/status';

const SYSTEM_ROLE = {
  ADMIN: 'ADMIN',
  SUB_CONTRACTOR: 'SUB_CONTRACTOR',
  CUSTOMER: 'CUSTOMER',
};

const getRoleCodes = (user: User) =>
  Array.isArray(user.roles)
    ? user.roles.map((r: any) => String(r?.code ?? '').toUpperCase()).filter(Boolean)
    : [];

async function main() {
  await AppDataSource.initialize();

  const tenantRepo = AppDataSource.getRepository(Tenant);
  const userRepo = AppDataSource.getRepository(User);
  const contractorRepo = AppDataSource.getRepository(ContractorProfile);
  const teamRepo = AppDataSource.getRepository(EmployeeTeam);
  const teamMemberRepo = AppDataSource.getRepository(EmployeeTeamMember);
  const jobRepo = AppDataSource.getRepository(Job);
  const assignmentRepo = AppDataSource.getRepository(JobAssignment);

  const tenant =
    (await tenantRepo.findOne({ where: { tradingName: 'AEM Demo Services', isDeleted: false } })) ||
    (await tenantRepo.findOne({ where: { name: 'AEM Demo Services', isDeleted: false } })) ||
    (await tenantRepo.findOne({ where: { subdomain: 'aem-demo', isDeleted: false } }));

  if (!tenant) {
    throw new Error('Tenant "AEM Demo Services" not found');
  }

  const users = await userRepo.find({
    where: { tenantId: tenant.id, isDeleted: false, isActive: true },
    relations: ['roles'],
    order: { createdAt: 'ASC' },
  });

  const contractorProfiles = await contractorRepo.find({
    where: { tenantId: tenant.id, isDeleted: false },
  });
  const contractorUserIds = new Set(contractorProfiles.map((c) => c.userId));

  const adminUsers = users.filter((u) => getRoleCodes(u).includes(SYSTEM_ROLE.ADMIN));
  const primaryAdminId = adminUsers[0]?.id;

  const eligibleEmployees = users.filter((user) => {
    if (user.id === primaryAdminId) return false;
    if (contractorUserIds.has(user.id)) return false;
    const roleCodes = getRoleCodes(user);
    if (roleCodes.length === 0) return false;
    if (roleCodes.includes(SYSTEM_ROLE.SUB_CONTRACTOR)) return false;
    if (roleCodes.includes(SYSTEM_ROLE.CUSTOMER)) return false;
    return true;
  });

  if (eligibleEmployees.length === 0) {
    throw new Error('No eligible employees found (excluding primary admin and contractors)');
  }

  const selectedEmployees = eligibleEmployees.slice(0, Math.min(2, eligibleEmployees.length));

  const teamName = 'Installation Engineers';
  let team = await teamRepo.findOne({ where: { tenantId: tenant.id, name: teamName, isDeleted: false } });
  if (!team) {
    team = teamRepo.create({
      tenantId: tenant.id,
      name: teamName,
      description: 'Demo internal crew team for overlap testing',
      hourlyRate: 24,
      isActive: true,
    });
    await teamRepo.save(team);
  }

  const existingMembers = await teamMemberRepo.find({
    where: { tenantId: tenant.id, teamId: team.id, isDeleted: false },
  });
  const existingMemberUserIds = new Set(existingMembers.map((m) => m.userId));
  const missingUserIds = selectedEmployees.map((u) => u.id).filter((id) => !existingMemberUserIds.has(id));
  if (missingUserIds.length > 0) {
    await teamMemberRepo.save(
      missingUserIds.map((userId) =>
        teamMemberRepo.create({
          tenantId: tenant.id,
          teamId: team!.id,
          userId,
          isActive: true,
        }),
      ),
    );
  }

  const now = new Date();
  const baseDate = new Date(now);
  baseDate.setDate(baseDate.getDate() + 1);
  baseDate.setHours(10, 0, 0, 0);

  const job1Start = new Date(baseDate);
  const job1End = new Date(baseDate);
  job1End.setHours(13, 0, 0, 0);

  const job2Start = new Date(baseDate);
  job2Start.setHours(11, 0, 0, 0);
  const job2End = new Date(baseDate);
  job2End.setHours(14, 0, 0, 0);

  const suffix = Date.now().toString().slice(-6);
  const job1 = jobRepo.create({
    tenantId: tenant.id,
    title: `Overlap Demo A ${suffix}`,
    description: 'Demo job A for overlap preview',
    location: 'Demo Site A',
    status: JobStatus.SCHEDULED,
    priority: 'Medium',
    amount: 150,
    scheduledAt: job1Start,
    scheduledEndAt: job1End,
  });
  await jobRepo.save(job1);

  const job2 = jobRepo.create({
    tenantId: tenant.id,
    title: `Overlap Demo B ${suffix}`,
    description: 'Demo job B for overlap preview',
    location: 'Demo Site B',
    status: JobStatus.SCHEDULED,
    priority: 'High',
    amount: 220,
    scheduledAt: job2Start,
    scheduledEndAt: job2End,
  });
  await jobRepo.save(job2);

  const job1Assignments = selectedEmployees.map((user, index) =>
    assignmentRepo.create({
      tenantId: tenant.id,
      jobId: job1.id,
      userId: user.id,
      assignmentType: AssignmentType.INTERNAL,
      teamId: team!.id,
      assignedAt: new Date(),
      isActive: true,
      isPrimary: index === 0,
      effectiveHourlyRate:
        Number.isFinite(Number(team!.hourlyRate))
          ? Number(team!.hourlyRate)
          : Number.isFinite(Number(user.hourlyRate))
          ? Number(user.hourlyRate)
          : undefined,
    }),
  );
  await assignmentRepo.save(job1Assignments);

  const singleUser = selectedEmployees[0];
  await assignmentRepo.save(
    assignmentRepo.create({
      tenantId: tenant.id,
      jobId: job2.id,
      userId: singleUser.id,
      assignmentType: AssignmentType.INTERNAL,
      assignedAt: new Date(),
      isActive: true,
      isPrimary: true,
      effectiveHourlyRate: Number.isFinite(Number(singleUser.hourlyRate))
        ? Number(singleUser.hourlyRate)
        : undefined,
    }),
  );

  console.log(JSON.stringify({
    tenant: tenant.tradingName || tenant.name,
    team: { id: team.id, name: team.name },
    selectedEmployees: selectedEmployees.map((u) => ({ id: u.id, fullName: u.fullName, email: u.email })),
    jobsCreated: [
      { id: job1.id, title: job1.title, scheduledAt: job1.scheduledAt, scheduledEndAt: job1.scheduledEndAt, assigned: selectedEmployees.map((u) => u.fullName) },
      { id: job2.id, title: job2.title, scheduledAt: job2.scheduledAt, scheduledEndAt: job2.scheduledEndAt, assigned: [singleUser.fullName] },
    ],
  }, null, 2));
}

main()
  .catch((error) => {
    console.error('Setup failed:', error);
    process.exit(1);
  })
  .finally(async () => {
    if (AppDataSource.isInitialized) {
      await AppDataSource.destroy();
    }
  });

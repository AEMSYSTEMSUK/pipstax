import 'reflect-metadata';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { AppDataSource } from './config/data-source';
import { Tenant } from './entities/tenant.entity';
import { User } from './entities/user.entity';
import { Customer } from './entities/customer.entity';
import { Lead } from './entities/lead.entity';
import { LeadActivity } from './entities/lead-activity.entity';
import { Job } from './entities/job.entity';
import { JobAssignment } from './entities/job-assignment.entity';
import { JobUpdate } from './entities/job-update.entity';
import { Quote } from './entities/quote.entity';
import { Invoice } from './entities/invoice.entity';
import { DocumentItem } from './entities/document.entity';
import { Ticket } from './entities/ticket.entity';
import { TicketMessage } from './entities/ticket-message.entity';
import { Timesheet } from './entities/timesheet.entity';
import { IntegrationConnection } from './entities/integration.entity';
import { ContractorProfile } from './entities/contractor-profile.entity';
import { DocumentRequirement } from './entities/document-requirement.entity';
import { ContractorDocument } from './entities/contractor-document.entity';
import { ContractorTraining } from './entities/contractor-training.entity';
import { Notification } from './entities/notification.entity';
import { ensureRolesForTenant } from './services/roles.service';
import { SystemRole } from './constants/roles';
import { ensurePlatformRoles } from './admin/services/platform-roles.service';
import { PlatformAdmin } from './admin/entities/platform-admin.entity';
import { Account } from './entities/account.entity';
import { AccountTenant } from './entities/account-tenant.entity';
import { CustomerAccountTenant } from './entities/customer-account-tenant.entity';
import {
  LeadStatus,
  JobStatus,
  QuoteStatus,
  InvoiceStatus,
  DocumentStatus,
  TicketStatus,
  ContractorComplianceStatus
} from './constants/status';
import { AssignmentType } from './constants/jobs';
import { TicketSenderType } from './constants/tickets';
import { IntegrationProvider, IntegrationStatus, SyncStatus } from './constants/integrations';

const password = 'Password123!';

const seed = async () => {
  await AppDataSource.initialize();
  await AppDataSource.dropDatabase();
  await AppDataSource.synchronize();

  const tenantRepo = AppDataSource.getRepository(Tenant);
  const userRepo = AppDataSource.getRepository(User);
  const platformAdminRepo = AppDataSource.getRepository(PlatformAdmin);
  const accountRepo = AppDataSource.getRepository(Account);
  const accountTenantRepo = AppDataSource.getRepository(AccountTenant);
  const customerAccountTenantRepo = AppDataSource.getRepository(CustomerAccountTenant);
  const customerRepo = AppDataSource.getRepository(Customer);
  const leadRepo = AppDataSource.getRepository(Lead);
  const leadActivityRepo = AppDataSource.getRepository(LeadActivity);
  const jobRepo = AppDataSource.getRepository(Job);
  const assignmentRepo = AppDataSource.getRepository(JobAssignment);
  const updateRepo = AppDataSource.getRepository(JobUpdate);
  const quoteRepo = AppDataSource.getRepository(Quote);
  const invoiceRepo = AppDataSource.getRepository(Invoice);
  const documentRepo = AppDataSource.getRepository(DocumentItem);
  const ticketRepo = AppDataSource.getRepository(Ticket);
  const ticketMessageRepo = AppDataSource.getRepository(TicketMessage);
  const timesheetRepo = AppDataSource.getRepository(Timesheet);
  const integrationRepo = AppDataSource.getRepository(IntegrationConnection);
  const contractorRepo = AppDataSource.getRepository(ContractorProfile);
  const requirementRepo = AppDataSource.getRepository(DocumentRequirement);
  const contractorDocRepo = AppDataSource.getRepository(ContractorDocument);
  const contractorTrainingRepo = AppDataSource.getRepository(ContractorTraining);
  const notificationRepo = AppDataSource.getRepository(Notification);

  const platformRoles = await ensurePlatformRoles();
  const platformAdminRole = platformRoles.find((role: any) => role.code === 'PLATFORM_ADMIN');
  if (!platformAdminRole) {
    throw new Error('Platform admin role missing');
  }

  const superAdmin = platformAdminRepo.create({
    fullName: 'Sasha Super Admin',
    email: 'superadmin@aemdemo.com',
    passwordHash: await bcrypt.hash(password, 10),
    roles: [platformAdminRole]
  });
  await platformAdminRepo.save(superAdmin);

  const tenant = tenantRepo.create({
    name: 'AEM Demo Services Ltd',
    tradingName: 'AEM Demo Services',
    subdomain: 'aem-demo',
    logoUrl: 'https://placehold.co/200x120?text=AEM',
    primaryColor: '#0E8585',
    emailHeaderLogoUrl: 'https://placehold.co/600x120?text=AEM+Header',
    address: '221B Baker Street, London, UK',
    contactEmail: 'hello@aem-demo.co.uk',
    contactPhone: '+44 20 7946 0958'
  });
  await tenantRepo.save(tenant);

  const roles = await ensureRolesForTenant(tenant.id);
  const roleMap = new Map(roles.map((role) => [role.code, role]));

  const makeUser = async (fullName: string, email: string, code: string) => {
    const account = accountRepo.create({
      email,
      passwordHash: await bcrypt.hash(password, 10),
      isActive: true,
      emailVerifiedAt: new Date()
    });
    await accountRepo.save(account);

    const user = userRepo.create({
      fullName,
      email,
      phone: '+44 20 7000 0000',
      tenantId: tenant.id,
      accountId: account.id,
      roles: [roleMap.get(code)!]
    });
    const saved = await userRepo.save(user);
    await accountTenantRepo.save(
      accountTenantRepo.create({
        accountId: account.id,
        tenantId: tenant.id,
        userId: saved.id
      })
    );
    return saved;
  };

  const admin = await makeUser('Avery Admin', 'admin@aemdemo.com', 'ADMIN');
  const manager = await makeUser('Maya Manager', 'manager@aemdemo.com', 'MANAGER');
  const worker = await makeUser('Will Worker', 'worker@aemdemo.com', 'FIELD_WORKER');
  const contractorUser = await makeUser('Chris Contractor', 'contractor@aemdemo.com', 'SUB_CONTRACTOR');
  const ankitContractorAccount = accountRepo.create({
    email: 'ankit.contractor@aemdemo.com',
    passwordHash: await bcrypt.hash(password, 10),
    isActive: true,
    emailVerifiedAt: new Date()
  });
  await accountRepo.save(ankitContractorAccount);
  const ankitContractorUser = await userRepo.save(
    userRepo.create({
      fullName: 'Ankit Contractor',
      email: 'ankit.contractor@aemdemo.com',
      phone: '+44 20 7666 7788',
      tenantId: tenant.id,
      accountId: ankitContractorAccount.id,
      roles: [roleMap.get(SystemRole.SUB_CONTRACTOR)!]
    })
  );
  await accountTenantRepo.save(
    accountTenantRepo.create({
      accountId: ankitContractorAccount.id,
      tenantId: tenant.id,
      userId: ankitContractorUser.id
    })
  );
  // Customers log in via their own accounts; no tenant user needed.
  const sharedAdminAccount = await accountRepo.findOne({ where: { email: 'admin@aemdemo.com' } });

  const customers = await customerRepo.save([
    customerRepo.create({
      name: 'Riverside Apartments',
      email: 'customer@aemdemo.com',
      phone: '+44 20 7111 2233',
      address: '12 Riverside Way, London, UK',
      portalToken: crypto.randomBytes(12).toString('hex'),
      tenantId: tenant.id
    }),
    customerRepo.create({
      name: 'Oakwood Retail',
      email: 'maintenance@oakwood.co.uk',
      phone: '+44 20 7222 3344',
      address: '88 Oakwood Road, Manchester, UK',
      portalToken: crypto.randomBytes(12).toString('hex'),
      tenantId: tenant.id
    })
  ]);

  const ensureCustomerAccountLink = async (customer: Customer, tenantId: string, welcomeTitle: string) => {
    let account = await accountRepo.findOne({ where: { email: customer.email } });
    if (!account) {
      account = accountRepo.create({
        email: customer.email,
        passwordHash: await bcrypt.hash(password, 10),
        isActive: true,
        emailVerifiedAt: new Date()
      });
      await accountRepo.save(account);
    }
    await customerAccountTenantRepo.delete({ accountId: account.id, tenantId });
    await customerAccountTenantRepo.save(
      customerAccountTenantRepo.create({
        accountId: account.id,
        tenantId,
        customerId: customer.id
      })
    );
    await notificationRepo.save(
      notificationRepo.create({
        tenantId,
        customerId: customer.id,
        title: welcomeTitle,
        message: 'Your workspace is ready. Track quotes, invoices, and support updates here.'
      })
    );
  };

  for (const customer of customers) {
    await ensureCustomerAccountLink(customer, tenant.id, 'Welcome to your customer portal');
  }

  const tenantTwo = tenantRepo.create({
    name: 'Northgate Facilities Ltd',
    tradingName: 'Northgate Facilities',
    subdomain: 'northgate',
    logoUrl: 'https://placehold.co/200x120?text=Northgate',
    primaryColor: '#1F7A8C',
    emailHeaderLogoUrl: 'https://placehold.co/600x120?text=Northgate',
    address: '52 King Street, Leeds, UK',
    contactEmail: 'ops@northgate.co.uk',
    contactPhone: '+44 20 7999 1111'
  });
  await tenantRepo.save(tenantTwo);
  const rolesTwo = await ensureRolesForTenant(tenantTwo.id);
  const adminRoleTwo = rolesTwo.find((role) => role.code === SystemRole.ADMIN)!;
  const contractorRoleTwo = rolesTwo.find((role) => role.code === SystemRole.SUB_CONTRACTOR)!;
  const northgateAdmin = await userRepo.save(
    userRepo.create({
      fullName: 'Noah Northgate',
      email: 'admin@northgate.co.uk',
      tenantId: tenantTwo.id,
      roles: [adminRoleTwo]
    })
  );
  const ankitContractorNorthgate = await userRepo.save(
    userRepo.create({
      fullName: 'Ankit Contractor (Northgate)',
      email: 'ankit.contractor@aemdemo.com',
      tenantId: tenantTwo.id,
      accountId: ankitContractorAccount.id,
      roles: [contractorRoleTwo]
    })
  );
  await accountTenantRepo.save(
    accountTenantRepo.create({
      accountId: ankitContractorAccount.id,
      tenantId: tenantTwo.id,
      userId: ankitContractorNorthgate.id
    })
  );
  if (sharedAdminAccount) {
    const sharedTenantUser = await userRepo.save(
      userRepo.create({
        fullName: 'Avery Admin (Northgate)',
        email: 'admin@aemdemo.com',
        tenantId: tenantTwo.id,
        accountId: sharedAdminAccount.id,
        roles: [adminRoleTwo]
      })
    );
    await accountTenantRepo.save(
      accountTenantRepo.create({
        accountId: sharedAdminAccount.id,
        tenantId: tenantTwo.id,
        userId: sharedTenantUser.id
      })
    );
  }
  const northgateAccount = accountRepo.create({
    email: 'admin@northgate.co.uk',
    passwordHash: await bcrypt.hash(password, 10),
    isActive: true,
    emailVerifiedAt: new Date()
  });
  await accountRepo.save(northgateAccount);
  if (northgateAdmin) {
    northgateAdmin.accountId = northgateAccount.id;
    await userRepo.save(northgateAdmin);
    await accountTenantRepo.save(
      accountTenantRepo.create({
        accountId: northgateAccount.id,
        tenantId: tenantTwo.id,
        userId: northgateAdmin.id
      })
    );
  }

  const northgateCustomers = await customerRepo.save([
    customerRepo.create({
      name: 'Northgate Retail Park',
      email: 'customer@aemdemo.com',
      phone: '+44 20 7999 2222',
      address: '1 Retail Park, Leeds, UK',
      portalToken: crypto.randomBytes(12).toString('hex'),
      tenantId: tenantTwo.id
    }),
    customerRepo.create({
      name: 'Park Lane Offices',
      email: 'helpdesk@parklane.co.uk',
      phone: '+44 20 7999 3333',
      address: '77 Park Lane, Leeds, UK',
      portalToken: crypto.randomBytes(12).toString('hex'),
      tenantId: tenantTwo.id
    })
  ]);

  for (const customer of northgateCustomers) {
    await ensureCustomerAccountLink(customer, tenantTwo.id, 'Welcome to your Northgate portal');
  }

  const leads = await leadRepo.save([
    leadRepo.create({
      name: 'Harper Electrical',
      email: 'contact@harperelec.co.uk',
      phone: '+44 20 7333 4455',
      source: 'Referral',
      status: LeadStatus.QUALIFIED,
      industry: 'Electrical',
      tags: ['Commercial', 'Urgent'],
      nextFollowUpAt: new Date(Date.now() + 86400000 * 2),
      assignedUserId: manager.id,
      notes: 'Requested inspection and quote for rewiring.',
      tenantId: tenant.id
    }),
    leadRepo.create({
      name: 'Brighton HVAC',
      email: 'info@brightonhvac.co.uk',
      phone: '+44 20 7444 5566',
      source: 'Web Form',
      status: LeadStatus.CONTACTED,
      industry: 'HVAC',
      tags: ['Residential'],
      nextFollowUpAt: new Date(Date.now() + 86400000 * 4),
      assignedUserId: admin.id,
      notes: 'Follow-up scheduled after initial call.',
      tenantId: tenant.id
    })
  ]);

  await leadActivityRepo.save([
    leadActivityRepo.create({
      leadId: leads[0].id,
      tenantId: tenant.id,
      type: 'Call',
      message: 'Discussed project scope and site access.'
    }),
    leadActivityRepo.create({
      leadId: leads[0].id,
      tenantId: tenant.id,
      type: 'Note',
      message: 'Sent checklist of requirements and timeline.'
    }),
    leadActivityRepo.create({
      leadId: leads[1].id,
      tenantId: tenant.id,
      type: 'Email',
      message: 'Shared brochure and availability details.'
    })
  ]);

  const jobs = await jobRepo.save([
    jobRepo.create({
      title: 'Riverside Boiler Maintenance',
      description: 'Annual boiler inspection and maintenance.',
      location: '12 Riverside Way, London',
      status: JobStatus.SCHEDULED,
      priority: 'High',
      scheduledAt: new Date(Date.now() + 86400000),
      scheduledEndAt: new Date(Date.now() + 86400000 + 3 * 3600000),
      customerId: customers[0].id,
      tenantId: tenant.id
    }),
    jobRepo.create({
      title: 'Oakwood HVAC Repair',
      description: 'Fix HVAC airflow imbalance on levels 3-5.',
      location: '88 Oakwood Road, Manchester',
      status: JobStatus.ON_SITE,
      priority: 'Medium',
      scheduledAt: new Date(Date.now() - 3600000 * 2),
      scheduledEndAt: new Date(Date.now() + 3600000 * 2),
      customerId: customers[1].id,
      tenantId: tenant.id
    })
  ]);

  await assignmentRepo.save([
    assignmentRepo.create({
      jobId: jobs[0].id,
      userId: worker.id,
      assignmentType: AssignmentType.INTERNAL,
      assignedAt: new Date(),
      isActive: true,
      isPrimary: true,
      tenantId: tenant.id
    }),
    assignmentRepo.create({
      jobId: jobs[1].id,
      userId: contractorUser.id,
      assignmentType: AssignmentType.SUB_CONTRACTOR,
      assignedAt: new Date(),
      isActive: true,
      isPrimary: true,
      tenantId: tenant.id
    })
  ]);

  await updateRepo.save([
    updateRepo.create({
      jobId: jobs[0].id,
      userId: worker.id,
      status: JobStatus.EN_ROUTE,
      notes: 'En route to site, ETA 20 minutes.',
      tenantId: tenant.id
    }),
    updateRepo.create({
      jobId: jobs[1].id,
      userId: contractorUser.id,
      status: JobStatus.ON_SITE,
      notes: 'Started diagnostics, replacing filters.',
      photoUrls: ['https://placehold.co/600x400?text=Job+Photo'],
      tenantId: tenant.id
    })
  ]);

  const quotes = await quoteRepo.save([
    quoteRepo.create({
      title: 'Riverside Maintenance Quote',
      status: QuoteStatus.SENT,
      lineItems: [
        { description: 'Boiler inspection', quantity: 1, unitPrice: 250, vatRate: 20 },
        { description: 'Parts & consumables', quantity: 1, unitPrice: 95, vatRate: 20 }
      ],
      total: 345,
      publicToken: crypto.randomBytes(12).toString('hex'),
      sentAt: new Date(Date.now() - 86400000),
      customerId: customers[0].id,
      jobId: jobs[0].id,
      tenantId: tenant.id
    }),
    quoteRepo.create({
      title: 'Oakwood HVAC Repair Quote',
      status: QuoteStatus.SIGNED,
      lineItems: [
        { description: 'HVAC diagnostics', quantity: 1, unitPrice: 180, vatRate: 20 },
        { description: 'Replacement filters', quantity: 3, unitPrice: 40, vatRate: 20 }
      ],
      total: 300,
      publicToken: crypto.randomBytes(12).toString('hex'),
      sentAt: new Date(Date.now() - 86400000 * 3),
      signedAt: new Date(Date.now() - 86400000 * 2),
      signedByName: 'Olivia Oakwood',
      signedByEmail: 'maintenance@oakwood.co.uk',
      signatureData: 'data:image/png;base64,signature-placeholder',
      signatureIp: '203.0.113.42',
      customerId: customers[1].id,
      jobId: jobs[1].id,
      tenantId: tenant.id
    })
  ]);

  await invoiceRepo.save([
    invoiceRepo.create({
      title: 'Riverside Maintenance Invoice',
      status: InvoiceStatus.SENT,
      lineItems: [
        { description: 'Boiler inspection', quantity: 1, unitPrice: 250, vatRate: 20 }
      ],
      subTotal: 250,
      vatTotal: 50,
      total: 300,
      vatNumber: 'GB123456789',
      isMtdCompliant: true,
      dueDate: new Date(Date.now() + 86400000 * 14).toISOString().slice(0, 10),
      sentAt: new Date(Date.now() - 86400000),
      customerId: customers[0].id,
      jobId: jobs[0].id,
      tenantId: tenant.id
    }),
    invoiceRepo.create({
      title: 'Oakwood HVAC Repair Invoice',
      status: InvoiceStatus.OVERDUE,
      lineItems: [
        { description: 'HVAC repair', quantity: 1, unitPrice: 300, vatRate: 20 }
      ],
      subTotal: 300,
      vatTotal: 60,
      total: 360,
      vatNumber: 'GB123456789',
      isMtdCompliant: true,
      dueDate: new Date(Date.now() - 86400000 * 5).toISOString().slice(0, 10),
      sentAt: new Date(Date.now() - 86400000 * 10),
      customerId: customers[1].id,
      jobId: jobs[1].id,
      tenantId: tenant.id
    })
  ]);

  await documentRepo.save([
    documentRepo.create({
      name: 'Riverside Service Report.pdf',
      fileUrl: 'https://placehold.co/600x800?text=Report',
      category: 'Service Reports',
      status: DocumentStatus.APPROVED,
      syncStatus: SyncStatus.SYNCED,
      relatedEntityType: 'job',
      relatedEntityId: jobs[0].id,
      tenantId: tenant.id
    }),
    documentRepo.create({
      name: 'Oakwood HVAC Checklist.pdf',
      fileUrl: 'https://placehold.co/600x800?text=Checklist',
      category: 'Maintenance',
      status: DocumentStatus.SUBMITTED,
      syncStatus: SyncStatus.PENDING,
      relatedEntityType: 'job',
      relatedEntityId: jobs[1].id,
      tenantId: tenant.id
    })
  ]);

  const ticket = await ticketRepo.save(
    ticketRepo.create({
      subject: 'Invoice query',
      message: 'Can we split the invoice across two payments?',
      status: TicketStatus.OPEN,
      customerId: customers[0].id,
      tenantId: tenant.id
    })
  );

  await ticketMessageRepo.save([
    ticketMessageRepo.create({
      ticketId: ticket.id,
      senderType: TicketSenderType.CUSTOMER,
      message: 'Can we split the invoice across two payments?',
      tenantId: tenant.id
    }),
    ticketMessageRepo.create({
      ticketId: ticket.id,
      senderType: TicketSenderType.ADMIN,
      message: 'Yes, we can arrange two equal installments. I will update the invoice.',
      tenantId: tenant.id
    })
  ]);

  await timesheetRepo.save([
    timesheetRepo.create({
      workerId: worker.id,
      date: new Date(Date.now() - 86400000 * 2).toISOString().slice(0, 10),
      hours: 7.5,
      hourlyRate: 22,
      approved: true,
      tenantId: tenant.id
    }),
    timesheetRepo.create({
      workerId: worker.id,
      date: new Date(Date.now() - 86400000).toISOString().slice(0, 10),
      hours: 8,
      hourlyRate: 22,
      approved: false,
      tenantId: tenant.id
    })
  ]);

  const contractor = await contractorRepo.save(
    contractorRepo.create({
      userId: contractorUser.id,
      companyName: 'Contractor Pros Ltd',
      tradeType: 'HVAC',
      contactName: 'Chris Contractor',
      phone: '+44 20 7555 6677',
      notes: 'Specialist in HVAC emergency response.',
      tenantId: tenant.id
    })
  );
  const ankitContractor = await contractorRepo.save(
    contractorRepo.create({
      userId: ankitContractorUser.id,
      companyName: 'Ankit Compliance Ltd',
      tradeType: 'Electrical',
      contactName: 'Ankit Contractor',
      phone: '+44 20 7999 6677',
      notes: 'Awaiting compliance documents.',
      tenantId: tenant.id
    })
  );

  const requirements = await requirementRepo.save([
    requirementRepo.create({
      name: 'Public Liability Insurance',
      description: 'Minimum £2M cover.',
      isRequired: true,
      tenantId: tenant.id,
      contractorId: contractor.id
    }),
    requirementRepo.create({
      name: 'W-9 Form',
      description: 'Latest tax form for contractor.',
      isRequired: true,
      tenantId: tenant.id,
      contractorId: contractor.id
    }),
    requirementRepo.create({
      name: 'Trade License',
      description: 'Valid trade license certificate.',
      isRequired: true,
      tenantId: tenant.id,
      contractorId: contractor.id
    })
  ]);
  await requirementRepo.save([
    requirementRepo.create({
      name: 'Public Liability Insurance',
      description: 'Minimum £2M cover.',
      isRequired: true,
      tenantId: tenant.id,
      contractorId: ankitContractor.id
    }),
    requirementRepo.create({
      name: 'Trade License',
      description: 'Valid trade license certificate.',
      isRequired: true,
      tenantId: tenant.id,
      contractorId: ankitContractor.id
    })
  ]);

  await contractorDocRepo.save([
    contractorDocRepo.create({
      contractorId: contractor.id,
      requirementId: requirements[0].id,
      fileUrl: 'https://placehold.co/600x800?text=Insurance',
      status: DocumentStatus.APPROVED,
      tenantId: tenant.id
    }),
    contractorDocRepo.create({
      contractorId: contractor.id,
      requirementId: requirements[1].id,
      fileUrl: 'https://placehold.co/600x800?text=W-9',
      status: DocumentStatus.SUBMITTED,
      tenantId: tenant.id
    })
  ]);

  await contractorTrainingRepo.save(
    contractorTrainingRepo.create({
      contractorId: contractor.id,
      acknowledged: true,
      acknowledgedAt: new Date(),
      tenantId: tenant.id
    })
  );

  await contractorRepo.save({ ...contractor, complianceStatus: ContractorComplianceStatus.SUBMITTED });

  const ankitContractorNorthgateProfile = await contractorRepo.save(
    contractorRepo.create({
      userId: ankitContractorNorthgate.id,
      companyName: 'Ankit Compliance Ltd',
      tradeType: 'General Maintenance',
      contactName: 'Ankit Contractor',
      phone: '+44 20 7999 7788',
      notes: 'Northgate contractor onboarding.',
      tenantId: tenantTwo.id
    })
  );
  await requirementRepo.save([
    requirementRepo.create({
      name: 'Public Liability Insurance',
      description: 'Minimum £2M cover.',
      isRequired: true,
      tenantId: tenantTwo.id,
      contractorId: ankitContractorNorthgateProfile.id
    }),
    requirementRepo.create({
      name: 'Safety Certificate',
      description: 'Latest safety training certificate.',
      isRequired: true,
      tenantId: tenantTwo.id,
      contractorId: ankitContractorNorthgateProfile.id
    })
  ]);

  await integrationRepo.save([
    integrationRepo.create({
      provider: IntegrationProvider.GOOGLE_DRIVE,
      status: IntegrationStatus.CONNECTED,
      connectedAt: new Date(),
      rootFolderId: `root-${tenant.id}`,
      metadata: { note: 'Seeded demo integration.' },
      tenantId: tenant.id
    }),
    integrationRepo.create({
      provider: IntegrationProvider.XERO,
      status: IntegrationStatus.DISCONNECTED,
      tenantId: tenant.id
    })
  ]);

  await notificationRepo.save([
    notificationRepo.create({
      title: 'New support ticket',
      message: 'Riverside Apartments submitted a new ticket.',
      userId: admin.id,
      tenantId: tenant.id
    }),
    notificationRepo.create({
      title: 'Quote signed',
      message: 'Oakwood HVAC Repair quote was signed.',
      userId: manager.id,
      tenantId: tenant.id
    })
  ]);

  console.log('Seed completed.');
  console.log('Demo Tenant ID:', tenant.id);
  console.log('Customer portal tokens:', customers.map((c) => ({ name: c.name, token: c.portalToken })));
  console.log('Login credentials:');
  console.log(`SUPER ADMIN: superadmin@aemdemo.com / ${password}`);
  console.log(`ADMIN: admin@aemdemo.com / ${password}`);
  console.log(`ADMIN (Northgate): admin@northgate.co.uk / ${password}`);
  console.log(`MANAGER: manager@aemdemo.com / ${password}`);
  console.log(`FIELD WORKER: worker@aemdemo.com / ${password}`);
  console.log(`SUB CONTRACTOR: contractor@aemdemo.com / ${password}`);
  console.log(`SUB CONTRACTOR (Multi-Workspace): ankit.contractor@aemdemo.com / ${password}`);
  console.log(`CUSTOMER: customer@aemdemo.com / ${password}`);
};

seed()
  .catch((error) => {
    console.error('Seed failed:', error);
    process.exit(1);
  })
  .finally(async () => {
    await AppDataSource.destroy();
  });

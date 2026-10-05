import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { env } from './env';
import { Tenant } from '../entities/tenant.entity';
import { Role } from '../entities/role.entity';
import { User } from '../entities/user.entity';
import { Customer } from '../entities/customer.entity';
import { CustomerContact } from '../entities/customer-contact.entity';
import { Lead } from '../entities/lead.entity';
import { LeadActivity } from '../entities/lead-activity.entity';
import { Job } from '../entities/job.entity';
import { Quote } from '../entities/quote.entity';
import { Invoice } from '../entities/invoice.entity';
import { DocumentItem } from '../entities/document.entity';
import { Ticket } from '../entities/ticket.entity';
import { Timesheet } from '../entities/timesheet.entity';
import { IntegrationConnection } from '../entities/integration.entity';
import { TicketMessage } from '../entities/ticket-message.entity';
import { ContractorProfile } from '../entities/contractor-profile.entity';
import { DocumentRequirement } from '../entities/document-requirement.entity';
import { ContractorDocument } from '../entities/contractor-document.entity';
import { ContractorDocumentReview } from '../entities/contractor-document-review.entity';
import { ContractorTraining } from '../entities/contractor-training.entity';
import { JobAssignment } from '../entities/job-assignment.entity';
import { JobUpdate } from '../entities/job-update.entity';
import { JobExpense } from '../entities/job-expense.entity';
import { JobTimeEntry } from '../entities/job-time-entry.entity';
import { Notification } from '../entities/notification.entity';
import { PlatformAdmin } from '../admin/entities/platform-admin.entity';
import { PlatformRole } from '../admin/entities/platform-role.entity';
import { Account } from '../entities/account.entity';
import { AccountTenant } from '../entities/account-tenant.entity';
import { AccountVerification } from '../entities/account-verification.entity';
import { CustomerInvite } from '../entities/customer-invite.entity';
import { CustomerAccountTenant } from '../entities/customer-account-tenant.entity';
import { PasswordReset } from '../entities/password-reset.entity';
import { TenantDocumentSequence } from '../entities/tenant-document-sequence.entity';
import { QuoteSignVerification } from '../entities/quote-sign-verification.entity';
import { EmployeeTeam } from '../entities/employee-team.entity';
import { EmployeeTeamMember } from '../entities/employee-team-member.entity';
import { LeadTask } from '../entities/lead-task.entity';
import { ActiveTimer } from '../entities/active-timer.entity';
import { CustomerSiteGroup } from '../entities/customer-site-group.entity';
import { CustomerSite } from '../entities/customer-site.entity';
import { CustomerSiteContact } from '../entities/customer-site-contact.entity';
import { ComplianceRecord } from '../entities/compliance-record.entity';
import { RenewalOpportunity } from '../entities/renewal-opportunity.entity';
import { SplitInvoice } from '../entities/split-invoice.entity';
import { PlannerNote } from '../entities/planner-note.entity';
import { PlannerEntry } from '../entities/planner-entry.entity';
import { LookupOption } from '../entities/lookup-option.entity';
import { JobActivity } from '../entities/job-activity.entity';

const useUrl = Boolean(env.db.url);

export const AppDataSource = new DataSource({
  type: 'postgres',
  ...(useUrl
    ? { url: env.db.url }
    : {
        host: env.db.host,
        port: env.db.port,
        username: env.db.user,
        password: env.db.password,
        database: env.db.name,
      }),
  ssl: env.db.ssl ? { rejectUnauthorized: false } : false,
  synchronize: env.db.sync,
  logging: env.db.logging,
  entities: [
    Tenant,
    Role,
    User,
    Customer,
    CustomerContact,
    CustomerSiteGroup,
    CustomerSite,
    CustomerSiteContact,
    ComplianceRecord,
    RenewalOpportunity,
    SplitInvoice,
    PlannerNote,
    PlannerEntry,
    LookupOption,
    JobActivity,
    Lead,
    LeadActivity,
    LeadTask,
    Job,
    Quote,
    Invoice,
    DocumentItem,
    Ticket,
    Timesheet,
    IntegrationConnection,
    TicketMessage,
    ContractorProfile,
    DocumentRequirement,
    ContractorDocument,
    ContractorDocumentReview,
    ContractorTraining,
    JobAssignment,
    JobUpdate,
    JobExpense,
    JobTimeEntry,
    Notification,
    Account,
    AccountTenant,
    AccountVerification,
    PasswordReset,
    CustomerInvite,
    CustomerAccountTenant,
    QuoteSignVerification,
    EmployeeTeam,
    EmployeeTeamMember,
    TenantDocumentSequence,
    PlatformAdmin,
    PlatformRole,
    ActiveTimer
  ]
});

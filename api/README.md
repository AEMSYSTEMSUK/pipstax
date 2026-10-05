# AEM CRM Backend

## Quick Start
1. Copy `.env.example` to `.env` and fill in database credentials (Supabase/Postgres supported).
2. Install dependencies: `npm install`
3. Run dev server: `npm run dev`

## API Base
`/api/v1`

## Auth
- `POST /api/v1/auth/bootstrap` Create the first tenant + admin user.
- `POST /api/v1/auth/login` Login and get JWT.

## Multi-Tenant
All protected endpoints require:
- `Authorization: Bearer <token>`
- `X-Tenant-Id: <tenantId>` (or override with `TENANT_HEADER`)

## Modules
- Leads: `/api/v1/leads`
- Jobs: `/api/v1/jobs`
- My Assigned Jobs: `/api/v1/jobs/assigned/me`
- Job Assign: `/api/v1/jobs/:id/assign`
- Job Status Update: `/api/v1/jobs/:id/status`
- Job Updates: `/api/v1/jobs/:id/updates`
- Quotes: `/api/v1/quotes`
- Quote PDF: `/api/v1/quotes/:id/pdf`
- Quote Send: `/api/v1/quotes/:id/send`
- Invoices: `/api/v1/invoices`
- Invoice PDF: `/api/v1/invoices/:id/pdf`
- Invoice Send: `/api/v1/invoices/:id/send`
- Invoice Mark Paid: `/api/v1/invoices/:id/mark-paid`
- Invoice Export CSV: `/api/v1/invoices/export.csv`
- Documents: `/api/v1/documents`
- Customers: `/api/v1/customers`
- Tickets: `/api/v1/tickets`
- Ticket Reply: `/api/v1/tickets/:id/reply`
- Timesheets: `/api/v1/timesheets`
- Timesheet Approve: `/api/v1/timesheets/:id/approve`
- Timesheet Export CSV: `/api/v1/timesheets/export.csv`
- Reports: `/api/v1/reports/dashboard`
- Reports PDF: `/api/v1/reports/summary.pdf`
- Reports CSV: `/api/v1/reports/summary.csv`
- Settings: `/api/v1/settings/tenant`
- Role Permissions: `/api/v1/settings/roles`
- User Overrides: `/api/v1/settings/users/:id/permissions`
- Public Quote View: `/api/v1/public/quotes/:token`
- Public Quote PDF: `/api/v1/public/quotes/:token/pdf`
- Public Quote Sign: `/api/v1/public/quotes/:token/sign`
- Public Quote Decline: `/api/v1/public/quotes/:token/decline`
- Integrations: `/api/v1/integrations`
- Connect Integration: `/api/v1/integrations/connect`
- Integration Files: `/api/v1/integrations/:provider/files`
- Customer Portal Profile: `/api/v1/portal/:token/profile`
- Customer Portal Quotes: `/api/v1/portal/:token/quotes`
- Customer Portal Invoices: `/api/v1/portal/:token/invoices`
- Customer Portal Jobs: `/api/v1/portal/:token/jobs`
- Customer Portal Tickets: `/api/v1/portal/:token/tickets`
- Contractor Management: `/api/v1/contractors`
- Contractor Requirements: `/api/v1/contractors/requirements`
- Contractor Documents: `/api/v1/contractors/:id/documents`
- Contractor Document Review: `/api/v1/contractors/:id/documents/:docId/review`
- Contractor Training Ack: `/api/v1/contractors/:id/training/ack`
- Contractor Portal: `/api/v1/contractor-portal/:userId`

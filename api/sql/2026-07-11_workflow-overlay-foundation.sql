ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS "workflowConfig" jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE jobs
  ADD COLUMN IF NOT EXISTS "workflowStageKey" varchar(80);

ALTER TABLE quotes
  ADD COLUMN IF NOT EXISTS "workflowStageKey" varchar(80);

ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS "workflowStageKey" varchar(80);

CREATE INDEX IF NOT EXISTS "IDX_jobs_workflowStageKey" ON jobs ("workflowStageKey");
CREATE INDEX IF NOT EXISTS "IDX_quotes_workflowStageKey" ON quotes ("workflowStageKey");
CREATE INDEX IF NOT EXISTS "IDX_invoices_workflowStageKey" ON invoices ("workflowStageKey");

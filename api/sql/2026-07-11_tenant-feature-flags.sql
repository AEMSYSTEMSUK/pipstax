ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS "featureFlags" jsonb NOT NULL DEFAULT '{}'::jsonb;

UPDATE tenants
SET "featureFlags" = jsonb_build_object(
  'sites', COALESCE(("featureFlags"->>'sites')::boolean, false),
  'complianceReports', COALESCE(("featureFlags"->>'complianceReports')::boolean, false),
  'renewals', COALESCE(("featureFlags"->>'renewals')::boolean, false),
  'splitInvoicing', COALESCE(("featureFlags"->>'splitInvoicing')::boolean, false),
  'complianceWorkflows', COALESCE(("featureFlags"->>'complianceWorkflows')::boolean, false),
  'plannerNotes', COALESCE(("featureFlags"->>'plannerNotes')::boolean, false),
  'siteScopedPortal', COALESCE(("featureFlags"->>'siteScopedPortal')::boolean, false)
)
WHERE "featureFlags" IS NULL
   OR jsonb_typeof("featureFlags") <> 'object'
   OR NOT ("featureFlags" ? 'sites')
   OR NOT ("featureFlags" ? 'complianceReports')
   OR NOT ("featureFlags" ? 'renewals')
   OR NOT ("featureFlags" ? 'splitInvoicing')
   OR NOT ("featureFlags" ? 'complianceWorkflows')
   OR NOT ("featureFlags" ? 'plannerNotes')
   OR NOT ("featureFlags" ? 'siteScopedPortal');

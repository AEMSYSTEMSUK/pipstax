ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS "portalAllowedSiteIds" jsonb NULL;

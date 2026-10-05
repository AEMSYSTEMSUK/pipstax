CREATE TABLE IF NOT EXISTS customer_site_groups (
  id uuid PRIMARY KEY,
  "isDeleted" boolean NOT NULL DEFAULT false,
  "createdAt" timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  name varchar(160) NOT NULL,
  description text NULL,
  "sortOrder" integer NOT NULL DEFAULT 0,
  "tenantId" uuid NOT NULL,
  "customerId" uuid NOT NULL
);

CREATE TABLE IF NOT EXISTS customer_sites (
  id uuid PRIMARY KEY,
  "isDeleted" boolean NOT NULL DEFAULT false,
  "createdAt" timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  name varchar(160) NOT NULL,
  reference varchar(80) NULL,
  status varchar(40) NOT NULL DEFAULT 'ACTIVE',
  "addressLine1" varchar NULL,
  "addressLine2" varchar NULL,
  city varchar NULL,
  state varchar NULL,
  "postalCode" varchar NULL,
  country varchar NULL,
  "primaryContactName" varchar NULL,
  "primaryContactEmail" varchar NULL,
  "primaryContactPhone" varchar NULL,
  notes text NULL,
  "tenantId" uuid NOT NULL,
  "customerId" uuid NOT NULL,
  "siteGroupId" uuid NULL
);

ALTER TABLE quotes ADD COLUMN IF NOT EXISTS "siteId" uuid NULL;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS "siteId" uuid NULL;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS "siteId" uuid NULL;

CREATE INDEX IF NOT EXISTS "IDX_customer_site_groups_tenantId" ON customer_site_groups ("tenantId");
CREATE INDEX IF NOT EXISTS "IDX_customer_site_groups_customerId" ON customer_site_groups ("customerId");
CREATE INDEX IF NOT EXISTS "IDX_customer_sites_tenantId" ON customer_sites ("tenantId");
CREATE INDEX IF NOT EXISTS "IDX_customer_sites_customerId" ON customer_sites ("customerId");
CREATE INDEX IF NOT EXISTS "IDX_customer_sites_siteGroupId" ON customer_sites ("siteGroupId");
CREATE INDEX IF NOT EXISTS "IDX_quotes_siteId" ON quotes ("siteId");
CREATE INDEX IF NOT EXISTS "IDX_jobs_siteId" ON jobs ("siteId");
CREATE INDEX IF NOT EXISTS "IDX_invoices_siteId" ON invoices ("siteId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE constraint_name = 'FK_customer_site_groups_tenantId'
  ) THEN
    ALTER TABLE customer_site_groups
      ADD CONSTRAINT "FK_customer_site_groups_tenantId"
      FOREIGN KEY ("tenantId") REFERENCES tenants(id) ON DELETE NO ACTION ON UPDATE NO ACTION;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE constraint_name = 'FK_customer_site_groups_customerId'
  ) THEN
    ALTER TABLE customer_site_groups
      ADD CONSTRAINT "FK_customer_site_groups_customerId"
      FOREIGN KEY ("customerId") REFERENCES customers(id) ON DELETE NO ACTION ON UPDATE NO ACTION;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE constraint_name = 'FK_customer_sites_tenantId'
  ) THEN
    ALTER TABLE customer_sites
      ADD CONSTRAINT "FK_customer_sites_tenantId"
      FOREIGN KEY ("tenantId") REFERENCES tenants(id) ON DELETE NO ACTION ON UPDATE NO ACTION;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE constraint_name = 'FK_customer_sites_customerId'
  ) THEN
    ALTER TABLE customer_sites
      ADD CONSTRAINT "FK_customer_sites_customerId"
      FOREIGN KEY ("customerId") REFERENCES customers(id) ON DELETE NO ACTION ON UPDATE NO ACTION;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE constraint_name = 'FK_customer_sites_siteGroupId'
  ) THEN
    ALTER TABLE customer_sites
      ADD CONSTRAINT "FK_customer_sites_siteGroupId"
      FOREIGN KEY ("siteGroupId") REFERENCES customer_site_groups(id) ON DELETE NO ACTION ON UPDATE NO ACTION;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE constraint_name = 'FK_quotes_siteId'
  ) THEN
    ALTER TABLE quotes
      ADD CONSTRAINT "FK_quotes_siteId"
      FOREIGN KEY ("siteId") REFERENCES customer_sites(id) ON DELETE NO ACTION ON UPDATE NO ACTION;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE constraint_name = 'FK_jobs_siteId'
  ) THEN
    ALTER TABLE jobs
      ADD CONSTRAINT "FK_jobs_siteId"
      FOREIGN KEY ("siteId") REFERENCES customer_sites(id) ON DELETE NO ACTION ON UPDATE NO ACTION;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE constraint_name = 'FK_invoices_siteId'
  ) THEN
    ALTER TABLE invoices
      ADD CONSTRAINT "FK_invoices_siteId"
      FOREIGN KEY ("siteId") REFERENCES customer_sites(id) ON DELETE NO ACTION ON UPDATE NO ACTION;
  END IF;
END $$;

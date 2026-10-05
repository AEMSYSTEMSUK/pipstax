ALTER TABLE customer_sites
  ADD COLUMN IF NOT EXISTS category varchar(80) NULL,
  ADD COLUMN IF NOT EXISTS "mainContactId" uuid NULL,
  ADD COLUMN IF NOT EXISTS tags jsonb NULL,
  ADD COLUMN IF NOT EXISTS "additionalInformation" text NULL;

CREATE TABLE IF NOT EXISTS customer_site_contacts (
  id uuid PRIMARY KEY,
  "isDeleted" boolean NOT NULL DEFAULT false,
  "createdAt" timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  name varchar(120) NOT NULL,
  email varchar(160) NULL,
  phone varchar NULL,
  role varchar(120) NULL,
  notes text NULL,
  "tenantId" uuid NOT NULL,
  "customerId" uuid NOT NULL,
  "siteId" uuid NOT NULL
);

CREATE INDEX IF NOT EXISTS "IDX_customer_sites_mainContactId" ON customer_sites ("mainContactId");
CREATE INDEX IF NOT EXISTS "IDX_customer_site_contacts_tenantId" ON customer_site_contacts ("tenantId");
CREATE INDEX IF NOT EXISTS "IDX_customer_site_contacts_customerId" ON customer_site_contacts ("customerId");
CREATE INDEX IF NOT EXISTS "IDX_customer_site_contacts_siteId" ON customer_site_contacts ("siteId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE constraint_name = 'FK_customer_site_contacts_tenantId'
  ) THEN
    ALTER TABLE customer_site_contacts
      ADD CONSTRAINT "FK_customer_site_contacts_tenantId"
      FOREIGN KEY ("tenantId") REFERENCES tenants(id) ON DELETE NO ACTION ON UPDATE NO ACTION;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE constraint_name = 'FK_customer_site_contacts_customerId'
  ) THEN
    ALTER TABLE customer_site_contacts
      ADD CONSTRAINT "FK_customer_site_contacts_customerId"
      FOREIGN KEY ("customerId") REFERENCES customers(id) ON DELETE NO ACTION ON UPDATE NO ACTION;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE constraint_name = 'FK_customer_site_contacts_siteId'
  ) THEN
    ALTER TABLE customer_site_contacts
      ADD CONSTRAINT "FK_customer_site_contacts_siteId"
      FOREIGN KEY ("siteId") REFERENCES customer_sites(id) ON DELETE NO ACTION ON UPDATE NO ACTION;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE constraint_name = 'FK_customer_sites_mainContactId'
  ) THEN
    ALTER TABLE customer_sites
      ADD CONSTRAINT "FK_customer_sites_mainContactId"
      FOREIGN KEY ("mainContactId") REFERENCES customer_site_contacts(id) ON DELETE NO ACTION ON UPDATE NO ACTION;
  END IF;
END $$;

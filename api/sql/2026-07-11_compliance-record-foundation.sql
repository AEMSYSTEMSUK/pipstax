CREATE TABLE IF NOT EXISTS compliance_records (
  id uuid PRIMARY KEY,
  "isDeleted" boolean NOT NULL DEFAULT false,
  "createdAt" timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  title varchar(180) NOT NULL,
  "reportType" varchar(100) NOT NULL,
  reference varchar(80) NULL,
  outcome varchar(80) NULL,
  "reviewStatus" varchar(40) NOT NULL DEFAULT 'PENDING_REVIEW',
  "testedAt" timestamp NULL,
  "validFrom" timestamp NULL,
  "validUntil" timestamp NULL,
  "reviewedAt" timestamp NULL,
  "reviewerUserId" uuid NULL,
  "reviewNote" text NULL,
  "customerVisible" boolean NOT NULL DEFAULT true,
  notes text NULL,
  "documentId" uuid NULL,
  "jobId" uuid NULL,
  "tenantId" uuid NOT NULL,
  "customerId" uuid NOT NULL,
  "siteId" uuid NOT NULL
);

CREATE INDEX IF NOT EXISTS "IDX_compliance_records_tenantId" ON compliance_records ("tenantId");
CREATE INDEX IF NOT EXISTS "IDX_compliance_records_customerId" ON compliance_records ("customerId");
CREATE INDEX IF NOT EXISTS "IDX_compliance_records_siteId" ON compliance_records ("siteId");
CREATE INDEX IF NOT EXISTS "IDX_compliance_records_jobId" ON compliance_records ("jobId");
CREATE INDEX IF NOT EXISTS "IDX_compliance_records_documentId" ON compliance_records ("documentId");
CREATE INDEX IF NOT EXISTS "IDX_compliance_records_reviewerUserId" ON compliance_records ("reviewerUserId");
CREATE INDEX IF NOT EXISTS "IDX_compliance_records_validUntil" ON compliance_records ("validUntil");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'FK_compliance_records_tenantId'
  ) THEN
    ALTER TABLE compliance_records
      ADD CONSTRAINT "FK_compliance_records_tenantId"
      FOREIGN KEY ("tenantId") REFERENCES tenants(id) ON DELETE NO ACTION ON UPDATE NO ACTION;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'FK_compliance_records_customerId'
  ) THEN
    ALTER TABLE compliance_records
      ADD CONSTRAINT "FK_compliance_records_customerId"
      FOREIGN KEY ("customerId") REFERENCES customers(id) ON DELETE NO ACTION ON UPDATE NO ACTION;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'FK_compliance_records_siteId'
  ) THEN
    ALTER TABLE compliance_records
      ADD CONSTRAINT "FK_compliance_records_siteId"
      FOREIGN KEY ("siteId") REFERENCES customer_sites(id) ON DELETE NO ACTION ON UPDATE NO ACTION;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'FK_compliance_records_jobId'
  ) THEN
    ALTER TABLE compliance_records
      ADD CONSTRAINT "FK_compliance_records_jobId"
      FOREIGN KEY ("jobId") REFERENCES jobs(id) ON DELETE NO ACTION ON UPDATE NO ACTION;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'FK_compliance_records_documentId'
  ) THEN
    ALTER TABLE compliance_records
      ADD CONSTRAINT "FK_compliance_records_documentId"
      FOREIGN KEY ("documentId") REFERENCES documents(id) ON DELETE NO ACTION ON UPDATE NO ACTION;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'FK_compliance_records_reviewerUserId'
  ) THEN
    ALTER TABLE compliance_records
      ADD CONSTRAINT "FK_compliance_records_reviewerUserId"
      FOREIGN KEY ("reviewerUserId") REFERENCES users(id) ON DELETE NO ACTION ON UPDATE NO ACTION;
  END IF;
END $$;

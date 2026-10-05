CREATE TABLE IF NOT EXISTS renewal_opportunities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
  "isDeleted" BOOLEAN NOT NULL DEFAULT false,
  title VARCHAR(180) NOT NULL,
  "reportType" VARCHAR(100),
  reference VARCHAR(80),
  outcome VARCHAR(80),
  status VARCHAR(40) NOT NULL DEFAULT 'OPEN',
  "dueDate" TIMESTAMP NOT NULL,
  "renewalWindowStart" TIMESTAMP,
  "estimatedValue" NUMERIC(12,2),
  "lastQuotedAt" TIMESTAMP,
  "lastChasedAt" TIMESTAMP,
  "closedAt" TIMESTAMP,
  notes TEXT,
  "ownerUserId" uuid,
  "quoteId" uuid,
  "sourceComplianceRecordId" uuid,
  "sourceJobId" uuid,
  "tenantId" uuid NOT NULL,
  "customerId" uuid NOT NULL,
  "siteId" uuid NOT NULL
);

CREATE INDEX IF NOT EXISTS "IDX_renewal_opportunities_tenantId" ON renewal_opportunities ("tenantId");
CREATE INDEX IF NOT EXISTS "IDX_renewal_opportunities_customerId" ON renewal_opportunities ("customerId");
CREATE INDEX IF NOT EXISTS "IDX_renewal_opportunities_siteId" ON renewal_opportunities ("siteId");
CREATE INDEX IF NOT EXISTS "IDX_renewal_opportunities_status" ON renewal_opportunities (status);
CREATE INDEX IF NOT EXISTS "IDX_renewal_opportunities_dueDate" ON renewal_opportunities ("dueDate");
CREATE INDEX IF NOT EXISTS "IDX_renewal_opportunities_ownerUserId" ON renewal_opportunities ("ownerUserId");
CREATE INDEX IF NOT EXISTS "IDX_renewal_opportunities_quoteId" ON renewal_opportunities ("quoteId");
CREATE INDEX IF NOT EXISTS "IDX_renewal_opportunities_sourceComplianceRecordId" ON renewal_opportunities ("sourceComplianceRecordId");
CREATE INDEX IF NOT EXISTS "IDX_renewal_opportunities_sourceJobId" ON renewal_opportunities ("sourceJobId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'FK_renewal_opportunities_tenantId'
  ) THEN
    ALTER TABLE renewal_opportunities
      ADD CONSTRAINT "FK_renewal_opportunities_tenantId"
      FOREIGN KEY ("tenantId") REFERENCES tenants(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'FK_renewal_opportunities_customerId'
  ) THEN
    ALTER TABLE renewal_opportunities
      ADD CONSTRAINT "FK_renewal_opportunities_customerId"
      FOREIGN KEY ("customerId") REFERENCES customers(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'FK_renewal_opportunities_siteId'
  ) THEN
    ALTER TABLE renewal_opportunities
      ADD CONSTRAINT "FK_renewal_opportunities_siteId"
      FOREIGN KEY ("siteId") REFERENCES customer_sites(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'FK_renewal_opportunities_ownerUserId'
  ) THEN
    ALTER TABLE renewal_opportunities
      ADD CONSTRAINT "FK_renewal_opportunities_ownerUserId"
      FOREIGN KEY ("ownerUserId") REFERENCES users(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'FK_renewal_opportunities_quoteId'
  ) THEN
    ALTER TABLE renewal_opportunities
      ADD CONSTRAINT "FK_renewal_opportunities_quoteId"
      FOREIGN KEY ("quoteId") REFERENCES quotes(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'FK_renewal_opportunities_sourceComplianceRecordId'
  ) THEN
    ALTER TABLE renewal_opportunities
      ADD CONSTRAINT "FK_renewal_opportunities_sourceComplianceRecordId"
      FOREIGN KEY ("sourceComplianceRecordId") REFERENCES compliance_records(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'FK_renewal_opportunities_sourceJobId'
  ) THEN
    ALTER TABLE renewal_opportunities
      ADD CONSTRAINT "FK_renewal_opportunities_sourceJobId"
      FOREIGN KEY ("sourceJobId") REFERENCES jobs(id) ON DELETE SET NULL;
  END IF;
END $$;

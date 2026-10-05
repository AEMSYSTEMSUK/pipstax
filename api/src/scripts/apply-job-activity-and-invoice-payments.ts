export {};
process.env.DB_SYNC = 'false';

const run = async () => {
  const { AppDataSource } = await import('../config/data-source');
  await AppDataSource.initialize();

  try {
    await AppDataSource.query(
      'ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "payments" JSON NULL',
    );
    await AppDataSource.query(`
      CREATE TABLE IF NOT EXISTS "job_activities" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "isDeleted" boolean NOT NULL DEFAULT false,
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "deletedAt" TIMESTAMPTZ NULL,
        "createdByActorType" character varying NULL,
        "createdByActorId" character varying NULL,
        "updatedByActorType" character varying NULL,
        "updatedByActorId" character varying NULL,
        "deletedByActorType" character varying NULL,
        "deletedByActorId" character varying NULL,
        "jobId" uuid NOT NULL,
        "type" character varying(80) NOT NULL,
        "message" text NOT NULL,
        "metadata" JSON NULL,
        "userId" character varying NULL,
        "tenantId" uuid NOT NULL
      )
    `);
    await AppDataSource.query(
      'CREATE INDEX IF NOT EXISTS "IDX_job_activities_job_tenant_deleted" ON "job_activities" ("tenantId", "jobId", "isDeleted")',
    );
    console.log('Job activity table and invoice payments column ensured');
  } finally {
    await AppDataSource.destroy();
  }
};

run().catch((error) => {
  console.error('Failed to apply job activity and invoice payments schema', error);
  process.exit(1);
});

export {};

process.env.DB_SYNC = 'false';

const run = async () => {
  const { AppDataSource } = await import('../config/data-source');
  await AppDataSource.initialize();

  try {
    await AppDataSource.query(`
      CREATE TABLE IF NOT EXISTS "planner_entries" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "isDeleted" boolean NOT NULL DEFAULT false,
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now(),
        "deletedAt" timestamptz NULL,
        "createdByActorType" character varying NULL,
        "createdByActorId" character varying NULL,
        "updatedByActorType" character varying NULL,
        "updatedByActorId" character varying NULL,
        "deletedByActorType" character varying NULL,
        "deletedByActorId" character varying NULL,
        "jobId" uuid NOT NULL,
        "userId" uuid NOT NULL,
        "date" date NOT NULL,
        "note" text NULL,
        "tenantId" uuid NOT NULL
      )
    `);
    await AppDataSource.query('CREATE INDEX IF NOT EXISTS "IDX_planner_entries_tenant_job_user_date" ON "planner_entries" ("tenantId", "jobId", "userId", "date")');
    await AppDataSource.query('ALTER TABLE "planner_entries" ADD CONSTRAINT "FK_planner_entries_job" FOREIGN KEY ("jobId") REFERENCES "jobs"("id") ON DELETE NO ACTION ON UPDATE NO ACTION').catch(() => undefined);
    await AppDataSource.query('ALTER TABLE "planner_entries" ADD CONSTRAINT "FK_planner_entries_user" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION').catch(() => undefined);
    await AppDataSource.query('ALTER TABLE "planner_entries" ADD CONSTRAINT "FK_planner_entries_tenant" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE NO ACTION ON UPDATE NO ACTION').catch(() => undefined);
    console.log('Planner entries table ensured');
  } finally {
    await AppDataSource.destroy();
  }
};

run().catch((error) => {
  console.error('Failed to apply planner entries table', error);
  process.exit(1);
});

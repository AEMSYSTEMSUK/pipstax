export {};
process.env.DB_SYNC = 'false';

const run = async () => {
  const { AppDataSource } = await import('../config/data-source');
  await AppDataSource.initialize();

  try {
    await AppDataSource.query('ALTER TABLE "job_time_entries" ADD COLUMN IF NOT EXISTS "startTime" TIMESTAMPTZ NULL');
    await AppDataSource.query('ALTER TABLE "job_time_entries" ADD COLUMN IF NOT EXISTS "endTime" TIMESTAMPTZ NULL');
    await AppDataSource.query('ALTER TABLE "job_time_entries" ADD COLUMN IF NOT EXISTS "durationMinutes" INTEGER NULL');
    await AppDataSource.query('ALTER TABLE "job_time_entries" ADD COLUMN IF NOT EXISTS "hourlyRate" NUMERIC(10,2) NULL');
    await AppDataSource.query('ALTER TABLE "job_time_entries" ADD COLUMN IF NOT EXISTS "notes" TEXT NULL');
    await AppDataSource.query(
      'ALTER TABLE "job_time_entries" ADD COLUMN IF NOT EXISTS "entryType" VARCHAR(50) DEFAULT \'MANUAL\' NULL',
    );
    await AppDataSource.query(`
      UPDATE "job_time_entries"
      SET
        "durationMinutes" = COALESCE("durationMinutes", 0),
        "startTime" = COALESCE("startTime", "createdAt", now()),
        "endTime" = COALESCE(
          "endTime",
          COALESCE("startTime", "createdAt", now()) + (COALESCE("durationMinutes", 0) * interval '1 minute')
        ),
        "entryType" = COALESCE(NULLIF("entryType", ''), 'MANUAL')
      WHERE "startTime" IS NULL
        OR "endTime" IS NULL
        OR "durationMinutes" IS NULL
        OR "entryType" IS NULL
        OR "entryType" = ''
    `);
    await AppDataSource.query('ALTER TABLE "job_time_entries" ALTER COLUMN "startTime" SET NOT NULL');
    await AppDataSource.query('ALTER TABLE "job_time_entries" ALTER COLUMN "endTime" SET NOT NULL');
    await AppDataSource.query('ALTER TABLE "job_time_entries" ALTER COLUMN "durationMinutes" SET NOT NULL');
    await AppDataSource.query('ALTER TABLE "job_time_entries" ALTER COLUMN "entryType" SET DEFAULT \'MANUAL\'');
    await AppDataSource.query('ALTER TABLE "job_time_entries" ALTER COLUMN "entryType" SET NOT NULL');
    console.log('Job time entry columns ensured on job_time_entries');
  } finally {
    await AppDataSource.destroy();
  }
};

run().catch((error) => {
  console.error('Failed to apply job time entry columns', error);
  process.exit(1);
});

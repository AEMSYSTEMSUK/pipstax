export {};

process.env.DB_SYNC = 'false';

const run = async () => {
  const { AppDataSource } = await import('../config/data-source');
  await AppDataSource.initialize();

  try {
    await AppDataSource.query('ALTER TABLE "planner_notes" ADD COLUMN IF NOT EXISTS "reminderEnabled" boolean NOT NULL DEFAULT false');
    await AppDataSource.query('ALTER TABLE "planner_notes" ADD COLUMN IF NOT EXISTS "reminderSentAt" timestamptz NULL');
    await AppDataSource.query('CREATE INDEX IF NOT EXISTS "IDX_planner_notes_due_reminders" ON "planner_notes" ("date", "tenantId") WHERE "isDeleted" = false AND "reminderEnabled" = true AND "reminderSentAt" IS NULL');
    console.log('Planner note reminder columns ensured');
  } finally {
    await AppDataSource.destroy();
  }
};

run().catch((error) => {
  console.error('Failed to apply planner note reminder columns', error);
  process.exit(1);
});

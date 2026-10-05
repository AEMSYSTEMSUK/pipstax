export {};

process.env.DB_SYNC = 'false';

const run = async () => {
  const { AppDataSource } = await import('../config/data-source');
  await AppDataSource.initialize();

  try {
    await AppDataSource.query(
      'ALTER TABLE "job_expenses" ADD COLUMN IF NOT EXISTS "category" VARCHAR(120) NULL',
    );
    console.log('Job expense category column ensured on job_expenses');
  } finally {
    await AppDataSource.destroy();
  }
};

run().catch((error) => {
  console.error('Failed to apply job expense category column', error);
  process.exit(1);
});

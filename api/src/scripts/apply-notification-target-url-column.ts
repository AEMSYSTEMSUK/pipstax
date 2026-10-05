export {};

process.env.DB_SYNC = 'false';

const run = async () => {
  const { AppDataSource } = await import('../config/data-source');
  await AppDataSource.initialize();

  try {
    await AppDataSource.query(
      'ALTER TABLE "notifications" ADD COLUMN IF NOT EXISTS "targetUrl" VARCHAR NULL',
    );
    console.log('Notification targetUrl column ensured on notifications');
  } finally {
    await AppDataSource.destroy();
  }
};

run().catch((error) => {
  console.error('Failed to apply notification targetUrl column', error);
  process.exit(1);
});

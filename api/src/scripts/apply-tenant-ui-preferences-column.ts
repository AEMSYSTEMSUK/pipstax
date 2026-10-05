export {};

process.env.DB_SYNC = 'false';

const run = async () => {
  const { AppDataSource } = await import('../config/data-source');
  await AppDataSource.initialize();

  try {
    await AppDataSource.query(
      'ALTER TABLE "tenants" ADD COLUMN IF NOT EXISTS "featureFlags" JSONB NOT NULL DEFAULT \'{}\'::jsonb',
    );
    await AppDataSource.query(
      'ALTER TABLE "tenants" ADD COLUMN IF NOT EXISTS "workflowConfig" JSONB NOT NULL DEFAULT \'{}\'::jsonb',
    );
    await AppDataSource.query(
      'ALTER TABLE "tenants" ADD COLUMN IF NOT EXISTS "uiPreferences" JSONB NOT NULL DEFAULT \'{}\'::jsonb',
    );
    console.log('Tenant feature flags, workflow config, and UI preferences columns ensured on tenants');
  } finally {
    await AppDataSource.destroy();
  }
};

run().catch((error) => {
  console.error('Failed to apply tenant UI preferences column', error);
  process.exit(1);
});

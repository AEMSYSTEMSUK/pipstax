export {};

process.env.DB_SYNC = 'false';

const run = async () => {
  const { AppDataSource } = await import('../config/data-source');
  await AppDataSource.initialize();

  try {
    await AppDataSource.query(
      'ALTER TABLE "compliance_records" ADD COLUMN IF NOT EXISTS "expectedRenewalValue" NUMERIC(12,2) NULL',
    );
    console.log('Expected renewal value column ensured on compliance_records');
  } finally {
    await AppDataSource.destroy();
  }
};

run().catch((error) => {
  console.error('Failed to apply compliance expected renewal value column', error);
  process.exit(1);
});

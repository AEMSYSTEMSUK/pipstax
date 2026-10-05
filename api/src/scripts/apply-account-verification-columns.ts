export {};

process.env.DB_SYNC = 'false';

const run = async () => {
  const { AppDataSource } = await import('../config/data-source');
  await AppDataSource.initialize();

  try {
    const result = await AppDataSource.query("SELECT to_regclass('account_verifications') AS name");
    if (!result?.[0]?.name) {
      console.log('Account verification columns skipped on account_verifications (table does not exist yet)');
      return;
    }

    await AppDataSource.query('ALTER TABLE "account_verifications" ADD COLUMN IF NOT EXISTS "expiresAt" TIMESTAMPTZ NULL');
    await AppDataSource.query('ALTER TABLE "account_verifications" ADD COLUMN IF NOT EXISTS "verifiedAt" TIMESTAMPTZ NULL');
    await AppDataSource.query('ALTER TABLE "account_verifications" ADD COLUMN IF NOT EXISTS "attempts" INTEGER NOT NULL DEFAULT 0');
    await AppDataSource.query('UPDATE "account_verifications" SET "attempts" = 0 WHERE "attempts" IS NULL');
    await AppDataSource.query('ALTER TABLE "account_verifications" ALTER COLUMN "attempts" SET DEFAULT 0');
    console.log('Account verification columns ensured on account_verifications');
  } finally {
    await AppDataSource.destroy();
  }
};

run().catch((error) => {
  console.error('Failed to apply account verification columns', error);
  process.exit(1);
});

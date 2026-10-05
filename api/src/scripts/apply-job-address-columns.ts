export {};

process.env.DB_SYNC = 'false';

const JOB_ADDRESS_COLUMNS = [
  { name: 'addressLine1', definition: 'VARCHAR NULL' },
  { name: 'addressLine2', definition: 'VARCHAR NULL' },
  { name: 'city', definition: 'VARCHAR NULL' },
  { name: 'state', definition: 'VARCHAR NULL' },
  { name: 'postalCode', definition: 'VARCHAR NULL' },
  { name: 'country', definition: 'VARCHAR NULL' },
  { name: 'addressManuallyEdited', definition: 'BOOLEAN DEFAULT false NOT NULL' },
];

const quoteIdentifier = (value: string) => `"${value.replace(/"/g, '""')}"`;

const run = async () => {
  const { AppDataSource } = await import('../config/data-source');
  await AppDataSource.initialize();

  try {
    for (const column of JOB_ADDRESS_COLUMNS) {
      await AppDataSource.query(
        `ALTER TABLE "jobs" ADD COLUMN IF NOT EXISTS ${quoteIdentifier(column.name)} ${column.definition}`,
      );
    }
    await AppDataSource.query(
      'UPDATE "jobs" SET "addressManuallyEdited" = false WHERE "addressManuallyEdited" IS NULL',
    );
    console.log('Job address columns ensured on jobs');
  } finally {
    await AppDataSource.destroy();
  }
};

run().catch((error) => {
  console.error('Failed to apply job address columns', error);
  process.exit(1);
});

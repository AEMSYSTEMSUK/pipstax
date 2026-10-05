export {};

process.env.DB_SYNC = 'false';

const AUDIT_COLUMNS = [
  { name: 'deletedAt', type: 'TIMESTAMPTZ' },
  { name: 'createdByActorType', type: 'VARCHAR' },
  { name: 'createdByActorId', type: 'VARCHAR' },
  { name: 'updatedByActorType', type: 'VARCHAR' },
  { name: 'updatedByActorId', type: 'VARCHAR' },
  { name: 'deletedByActorType', type: 'VARCHAR' },
  { name: 'deletedByActorId', type: 'VARCHAR' },
];

const quoteIdentifier = (value: string) => `"${value.replace(/"/g, '""')}"`;

const quoteTablePath = (tablePath: string) =>
  tablePath
    .split('.')
    .map((part) => quoteIdentifier(part))
    .join('.');

const tableExists = async (dataSource: any, tablePath: string) => {
  const result = await dataSource.query('SELECT to_regclass($1) AS name', [tablePath]);
  return Boolean(result?.[0]?.name);
};

const run = async () => {
  const { AppDataSource } = await import('../config/data-source');
  await AppDataSource.initialize();

  try {
    const tablePaths = Array.from(
      new Set(
        AppDataSource.entityMetadatas
          .filter((metadata) =>
            metadata.columns.some((column) => column.propertyName === 'isDeleted') &&
            metadata.columns.some((column) => column.propertyName === 'updatedAt'),
          )
          .map((metadata) => metadata.tablePath),
      ),
    ).sort();

    for (const tablePath of tablePaths) {
      if (!(await tableExists(AppDataSource, tablePath))) {
        console.log(`Audit columns skipped on ${tablePath} (table does not exist yet)`);
        continue;
      }
      const table = quoteTablePath(tablePath);
      for (const column of AUDIT_COLUMNS) {
        await AppDataSource.query(
          `ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS ${quoteIdentifier(column.name)} ${column.type} NULL`,
        );
      }
      await AppDataSource.query(
        `UPDATE ${table} SET "deletedAt" = "updatedAt" WHERE "isDeleted" = true AND "deletedAt" IS NULL`,
      );
      console.log(`Audit columns ensured on ${tablePath}`);
    }
  } finally {
    await AppDataSource.destroy();
  }
};

run().catch((error) => {
  console.error('Failed to apply audit columns', error);
  process.exit(1);
});

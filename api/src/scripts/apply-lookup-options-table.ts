export {};

process.env.DB_SYNC = 'false';

const run = async () => {
  const { AppDataSource } = await import('../config/data-source');
  await AppDataSource.initialize();

  try {
    await AppDataSource.query(`
      CREATE TABLE IF NOT EXISTS "lookup_options" (
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
        "title" character varying(120) NOT NULL,
        "type" character varying(80) NOT NULL,
        "tenantId" uuid NOT NULL
      )
    `);
    await AppDataSource.query('CREATE UNIQUE INDEX IF NOT EXISTS "IDX_lookup_options_tenant_type_title" ON "lookup_options" ("tenantId", "type", "title") WHERE "isDeleted" = false');
    await AppDataSource.query('ALTER TABLE "lookup_options" ADD CONSTRAINT "FK_lookup_options_tenant" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE NO ACTION ON UPDATE NO ACTION').catch(() => undefined);
    console.log('Lookup options table ensured');
  } finally {
    await AppDataSource.destroy();
  }
};

run().catch((error) => {
  console.error('Failed to apply lookup options table', error);
  process.exit(1);
});

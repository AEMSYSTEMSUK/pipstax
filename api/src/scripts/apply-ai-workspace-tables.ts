export {};

// AI Workspace tables (#229 part 3, Nov 2026). Idempotent - safe to run more than once. Run with `npm run db:ai-workspace`
// (or `node dist/scripts/apply-ai-workspace-tables.js` after a build). Only CREATE ... IF NOT EXISTS: never drops or
// alters existing tables.
process.env.DB_SYNC = 'false';

const audit = `
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
  "deletedByActorId" character varying NULL`;

const run = async () => {
  const { AppDataSource } = await import('../config/data-source');
  await AppDataSource.initialize();
  try {
    await AppDataSource.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"').catch(() => undefined);
    await AppDataSource.query(`CREATE TABLE IF NOT EXISTS "ai_platform_settings" (${audit},
      "anthropicKeyEnc" text NULL,
      "defaultModel" character varying(60) NULL)`);
    await AppDataSource.query(`CREATE TABLE IF NOT EXISTS "ai_tenant_settings" (${audit},
      "tenantId" uuid NOT NULL REFERENCES "tenants"("id"),
      "enabled" boolean NOT NULL DEFAULT false,
      "keySource" character varying(16) NOT NULL DEFAULT 'own',
      "anthropicKeyEnc" text NULL,
      "defaultModel" character varying(60) NULL,
      "monthlyCapUsd" numeric(10,2) NOT NULL DEFAULT 25,
      "managedAllowed" boolean NOT NULL DEFAULT false,
      "platformCapUsd" numeric(10,2) NULL)`);
    await AppDataSource.query('CREATE UNIQUE INDEX IF NOT EXISTS "IDX_ai_tenant_settings_tenant" ON "ai_tenant_settings" ("tenantId")');
    await AppDataSource.query(`CREATE TABLE IF NOT EXISTS "ai_spaces" (${audit},
      "tenantId" uuid NOT NULL REFERENCES "tenants"("id"),
      "key" character varying(32) NOT NULL,
      "name" character varying(80) NOT NULL,
      "description" text NULL,
      "requiredPermission" character varying(40) NULL,
      "enabled" boolean NOT NULL DEFAULT true,
      "sortOrder" integer NOT NULL DEFAULT 0)`);
    await AppDataSource.query('CREATE UNIQUE INDEX IF NOT EXISTS "IDX_ai_spaces_tenant_key" ON "ai_spaces" ("tenantId", "key")');
    await AppDataSource.query(`CREATE TABLE IF NOT EXISTS "ai_actions" (${audit},
      "tenantId" uuid NOT NULL REFERENCES "tenants"("id"),
      "spaceId" uuid NOT NULL REFERENCES "ai_spaces"("id"),
      "name" character varying(120) NOT NULL,
      "description" text NULL,
      "instructions" text NOT NULL,
      "inputHint" character varying(255) NULL,
      "model" character varying(60) NULL,
      "allowWrites" boolean NOT NULL DEFAULT false,
      "enabled" boolean NOT NULL DEFAULT true,
      "builtIn" boolean NOT NULL DEFAULT false,
      "sortOrder" integer NOT NULL DEFAULT 0)`);
    await AppDataSource.query('CREATE INDEX IF NOT EXISTS "IDX_ai_actions_tenant_space" ON "ai_actions" ("tenantId", "spaceId")');
    await AppDataSource.query(`CREATE TABLE IF NOT EXISTS "ai_runs" (${audit},
      "tenantId" uuid NOT NULL REFERENCES "tenants"("id"),
      "spaceKey" character varying(32) NOT NULL,
      "actionId" uuid NULL,
      "actionName" character varying(120) NULL,
      "userId" uuid NOT NULL,
      "userName" character varying(191) NOT NULL,
      "model" character varying(60) NOT NULL,
      "keySource" character varying(16) NOT NULL DEFAULT 'own',
      "input" text NOT NULL,
      "transcript" text NULL,
      "output" text NULL,
      "status" character varying(16) NOT NULL DEFAULT 'running',
      "error" text NULL,
      "inputTokens" integer NOT NULL DEFAULT 0,
      "outputTokens" integer NOT NULL DEFAULT 0,
      "costUsd" numeric(12,6) NOT NULL DEFAULT 0,
      "toolCalls" integer NOT NULL DEFAULT 0)`);
    await AppDataSource.query('CREATE INDEX IF NOT EXISTS "IDX_ai_runs_tenant_created" ON "ai_runs" ("tenantId", "createdAt")');
    await AppDataSource.query(`CREATE TABLE IF NOT EXISTS "ai_proposals" (${audit},
      "tenantId" uuid NOT NULL REFERENCES "tenants"("id"),
      "runId" uuid NOT NULL REFERENCES "ai_runs"("id"),
      "kind" character varying(40) NOT NULL,
      "summary" text NOT NULL,
      "payload" jsonb NOT NULL,
      "status" character varying(16) NOT NULL DEFAULT 'pending',
      "requestedById" uuid NOT NULL,
      "decidedById" uuid NULL,
      "decidedByName" character varying(191) NULL,
      "decidedAt" timestamptz NULL,
      "result" text NULL)`);
    await AppDataSource.query('CREATE INDEX IF NOT EXISTS "IDX_ai_proposals_tenant_status" ON "ai_proposals" ("tenantId", "status")');
    console.log('AI Workspace tables ensured');
  } finally {
    await AppDataSource.destroy();
  }
};

run().catch((error) => {
  console.error('Failed to apply AI Workspace tables', error);
  process.exit(1);
});

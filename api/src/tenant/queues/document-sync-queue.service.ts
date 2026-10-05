import { Job, Queue, QueueEvents, Worker } from "bullmq";
import IORedis from "ioredis";
import { AppDataSource } from "../../config/data-source";
import { env } from "../../config/env";
import { IntegrationProvider, IntegrationStatus } from "../../constants/integrations";
import { DOCUMENT_SYNC_PROVIDERS } from "../../constants/document-sync";
import { DocumentItem } from "../../entities/document.entity";
import { IntegrationConnection } from "../../entities/integration.entity";
import {
  pullProviderDocumentsToCRM,
  reconcileTenantDocuments,
  syncDocumentToProvider,
} from "../../services/integrations/document-shadowing.service";

const QUEUE_NAME = "document-sync-jobs";
const DEFAULT_ATTEMPTS = 5;
const DEFAULT_BACKOFF_MS = 10_000;
const DEFAULT_CONCURRENCY = 2;
const DEFAULT_RECONCILE_INTERVAL_MS = 5 * 60 * 1000;

type DocumentPushPayload = {
  tenantId: string;
  documentId: string;
};

type TenantPullPayload = {
  tenantId: string;
  provider?: IntegrationProvider;
};

type TenantReconcilePayload = {
  tenantId: string;
  provider?: IntegrationProvider;
};

type DocumentSyncJob =
  | { name: "document.push"; data: DocumentPushPayload }
  | { name: "tenant.pull"; data: TenantPullPayload }
  | { name: "tenant.reconcile"; data: TenantReconcilePayload };

let queue: Queue | null = null;
let queueEvents: QueueEvents | null = null;
let worker: Worker | null = null;
let reconcileTimer: NodeJS.Timeout | null = null;

const getConnection = () => {
  if (!env.redis.url) {
    return null;
  }
  return new IORedis(env.redis.url, {
    maxRetriesPerRequest: null,
  });
};

const asDocumentProvider = (provider?: IntegrationProvider) => {
  if (!provider) return undefined;
  if (!DOCUMENT_SYNC_PROVIDERS.includes(provider as (typeof DOCUMENT_SYNC_PROVIDERS)[number])) {
    return undefined;
  }
  return provider;
};

const getDocumentSyncQueue = () => {
  if (queue) return queue;
  const connection = getConnection();
  if (!connection) {
    return null;
  }
  queue = new Queue(QUEUE_NAME, {
    connection,
    defaultJobOptions: {
      attempts: Number(process.env.DOCUMENT_SYNC_ATTEMPTS ?? DEFAULT_ATTEMPTS),
      backoff: {
        type: "exponential",
        delay: Number(process.env.DOCUMENT_SYNC_BACKOFF_MS ?? DEFAULT_BACKOFF_MS),
      },
      removeOnComplete: true,
      removeOnFail: 100,
    },
  });
  queueEvents = new QueueEvents(QUEUE_NAME, { connection });
  queueEvents.on("failed", ({ jobId, failedReason }) => {
    // eslint-disable-next-line no-console
    console.warn("[document-sync] job failed", { jobId, failedReason });
  });
  return queue;
};

const processDocumentPush = async ({ tenantId, documentId }: DocumentPushPayload) => {
  const repo = AppDataSource.getRepository(DocumentItem);
  const document = await repo.findOne({
    where: { id: documentId, tenantId, isDeleted: false },
  });
  if (!document) {
    return;
  }
  await syncDocumentToProvider(document);
};

const processTenantPull = async ({ tenantId, provider }: TenantPullPayload) => {
  await pullProviderDocumentsToCRM({
    tenantId,
    provider: asDocumentProvider(provider),
  });
};

const processTenantReconcile = async ({ tenantId, provider }: TenantReconcilePayload) => {
  await reconcileTenantDocuments({
    tenantId,
    provider: asDocumentProvider(provider),
  });
};

const processJob = async (job: Job) => {
  const typedJob = job as Job<DocumentSyncJob["data"], unknown, DocumentSyncJob["name"]>;
  switch (typedJob.name) {
    case "document.push":
      await processDocumentPush(typedJob.data as DocumentPushPayload);
      break;
    case "tenant.pull":
      await processTenantPull(typedJob.data as TenantPullPayload);
      break;
    case "tenant.reconcile":
      await processTenantReconcile(typedJob.data as TenantReconcilePayload);
      break;
    default:
      break;
  }
};

const enqueueJob = async <T extends DocumentSyncJob>(
  name: T["name"],
  data: T["data"],
  options?: {
    jobId?: string;
    delayMs?: number;
  },
) => {
  const documentQueue = getDocumentSyncQueue();
  if (!documentQueue) {
    return null;
  }
  try {
    await documentQueue.add(name, data, {
      jobId: options?.jobId,
      delay: options?.delayMs,
    });
    return true;
  } catch (error) {
    // eslint-disable-next-line no-console
    console.warn("[document-sync] enqueue failed", {
      name,
      error: error instanceof Error ? error.message : "unknown",
    });
    return null;
  }
};

export const enqueueDocumentPush = async (payload: DocumentPushPayload) => {
  return enqueueJob("document.push", payload, {
    jobId: `document-push__${payload.tenantId}__${payload.documentId}`,
  });
};

export const enqueueTenantPull = async (payload: TenantPullPayload) => {
  return enqueueJob("tenant.pull", payload, {
    jobId: `tenant-pull__${payload.tenantId}__${payload.provider ?? "auto"}`,
  });
};

export const enqueueTenantReconcile = async (payload: TenantReconcilePayload) => {
  return enqueueJob("tenant.reconcile", payload);
};

const enqueueConnectedTenantReconciliations = async () => {
  const repo = AppDataSource.getRepository(IntegrationConnection);
  const integrations = await repo.find({
    where: [
      {
        status: IntegrationStatus.CONNECTED,
        provider: IntegrationProvider.GOOGLE_DRIVE,
        isDeleted: false,
      },
      {
        status: IntegrationStatus.CONNECTED,
        provider: IntegrationProvider.SHAREPOINT,
        isDeleted: false,
      },
    ],
    select: {
      tenantId: true,
      provider: true,
    },
  });

  const seen = new Set<string>();
  for (const integration of integrations) {
    const key = `${integration.tenantId}:${integration.provider}`;
    if (seen.has(key)) continue;
    seen.add(key);
    await enqueueJob(
      "tenant.reconcile",
      {
      tenantId: integration.tenantId,
      provider: integration.provider,
      },
      {
        // Scheduler keeps one deduped reconcile job per tenant/provider window.
        jobId: `tenant-reconcile__${integration.tenantId}__${integration.provider}__${Math.floor(
          Date.now() / DEFAULT_RECONCILE_INTERVAL_MS,
        )}`,
      },
    );
  }
};

export const startDocumentSyncWorker = () => {
  if (worker || !env.redis.url) return;
  const connection = getConnection();
  if (!connection) return;

  worker = new Worker(QUEUE_NAME, processJob, {
    connection,
    concurrency: Number(
      process.env.DOCUMENT_SYNC_WORKER_CONCURRENCY ?? DEFAULT_CONCURRENCY,
    ),
  });
  worker.on("failed", (job, error) => {
    // eslint-disable-next-line no-console
    console.warn("[document-sync] worker failed", {
      jobId: job?.id,
      name: job?.name,
      error: error?.message,
    });
  });
};

export const startDocumentSyncScheduler = () => {
  if (reconcileTimer || !env.redis.url) return;
  const everyMs = Number(
    process.env.DOCUMENT_SYNC_RECONCILE_INTERVAL_MS ??
      DEFAULT_RECONCILE_INTERVAL_MS,
  );

  const tick = async () => {
    try {
      await enqueueConnectedTenantReconciliations();
    } catch (error) {
      // eslint-disable-next-line no-console
      console.warn("[document-sync] reconciliation scheduler failed", {
        error: error instanceof Error ? error.message : "unknown",
      });
    }
  };

  void tick();
  reconcileTimer = setInterval(() => {
    void tick();
  }, everyMs);
};

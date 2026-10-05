import { Job, Queue, QueueEvents, Worker } from "bullmq";
import IORedis from "ioredis";
import { env } from "../../config/env";
import { syncInvoicePaymentStatusesFromAccounting } from "../../services/integrations/accounting-sync.service";

const QUEUE_NAME = "accounting-sync-jobs";
const DEFAULT_ATTEMPTS = 4;
const DEFAULT_BACKOFF_MS = 10_000;
const DEFAULT_CONCURRENCY = 2;

type AccountingSyncPayload = {
  tenantId: string;
  requestedBy?: string;
};

let queue: Queue | null = null;
let queueEvents: QueueEvents | null = null;
let worker: Worker | null = null;

const getConnection = () => {
  if (!env.redis.url) return null;
  return new IORedis(env.redis.url, {
    maxRetriesPerRequest: null,
  });
};

const getAccountingSyncQueue = () => {
  if (queue) return queue;
  const connection = getConnection();
  if (!connection) return null;

  queue = new Queue(QUEUE_NAME, {
    connection,
    defaultJobOptions: {
      attempts: Number(process.env.ACCOUNTING_SYNC_ATTEMPTS ?? DEFAULT_ATTEMPTS),
      backoff: {
        type: "exponential",
        delay: Number(process.env.ACCOUNTING_SYNC_BACKOFF_MS ?? DEFAULT_BACKOFF_MS),
      },
      removeOnComplete: true,
      removeOnFail: 100,
    },
  });
  queueEvents = new QueueEvents(QUEUE_NAME, { connection });
  queueEvents.on("failed", ({ jobId, failedReason }) => {
    // eslint-disable-next-line no-console
    console.warn("[accounting-sync] job failed", { jobId, failedReason });
  });
  return queue;
};

const processSync = async ({ tenantId }: AccountingSyncPayload) => {
  await syncInvoicePaymentStatusesFromAccounting(tenantId);
};

export const enqueueInvoiceAccountingSync = async (payload: AccountingSyncPayload) => {
  const accountingQueue = getAccountingSyncQueue();

  // Local fallback when Redis is unavailable: fire-and-forget async task.
  if (!accountingQueue) {
    setTimeout(() => {
      void processSync(payload).catch((error) => {
        // eslint-disable-next-line no-console
        console.warn("[accounting-sync] local async sync failed", {
          tenantId: payload.tenantId,
          error: error instanceof Error ? error.message : "unknown",
        });
      });
    }, 0);
    return true;
  }

  const jobId = `invoice-status-sync__${payload.tenantId}`;
  try {
    await accountingQueue.add("invoice.status-sync", payload, { jobId });
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error ?? "");
    if (message.toLowerCase().includes("jobid")) {
      return true;
    }
    // eslint-disable-next-line no-console
    console.warn("[accounting-sync] enqueue failed", {
      tenantId: payload.tenantId,
      error: message || "unknown",
    });
    return null;
  }
};

export const startAccountingSyncWorker = () => {
  if (worker || !env.redis.url) return;
  const connection = getConnection();
  if (!connection) return;

  worker = new Worker(
    QUEUE_NAME,
    async (job: Job<AccountingSyncPayload>) => {
      await processSync(job.data);
    },
    {
      connection,
      concurrency: Number(
        process.env.ACCOUNTING_SYNC_WORKER_CONCURRENCY ?? DEFAULT_CONCURRENCY,
      ),
    },
  );
  worker.on("failed", (job, error) => {
    // eslint-disable-next-line no-console
    console.warn("[accounting-sync] worker failed", {
      jobId: job?.id,
      name: job?.name,
      error: error?.message,
    });
  });
};


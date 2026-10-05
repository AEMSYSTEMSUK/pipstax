import { Queue, Worker, QueueEvents } from "bullmq";
import IORedis from "ioredis";
import { env } from "../../config/env";
import {
  sendEmailDirect,
  type MailPayload,
} from "../../services/mailer.service";

const QUEUE_NAME = "email-jobs";
let queue: Queue | null = null;
let queueEvents: QueueEvents | null = null;
let worker: Worker | null = null;

const getConnection = () => {
  if (!env.redis.url) {
    return null;
  }
  return new IORedis(env.redis.url, {
    maxRetriesPerRequest: null,
  });
};

export const getEmailQueue = () => {
  if (queue) return queue;
  const connection = getConnection();
  if (!connection) return null;
  queue = new Queue(QUEUE_NAME, { connection });
  queueEvents = new QueueEvents(QUEUE_NAME, { connection });
  return queue;
};

export const enqueueEmail = async (payload: MailPayload) => {
  const emailQueue = getEmailQueue();
  if (!emailQueue) {
    return null;
  }
  try {
    await emailQueue.add("send", payload, {
      attempts: 3,
      backoff: { type: "exponential", delay: 5000 },
      removeOnComplete: true,
      removeOnFail: true,
    });
    return true;
  } catch (error) {
    // eslint-disable-next-line no-console
    console.warn("[mail-queue] enqueue failed, falling back to direct send.", {
      error: error instanceof Error ? error.message : "unknown",
    });
    return null;
  }
};

export const startEmailWorker = () => {
  if (worker || !env.redis.url) return;
  const connection = getConnection();
  if (!connection) return;
  worker = new Worker(
    QUEUE_NAME,
    async (job) => {
      const result = await sendEmailDirect(job.data as MailPayload);
      if (!result.success) {
        throw new Error(result.note ?? 'Email delivery failed');
      }
    },
    { connection },
  );
};

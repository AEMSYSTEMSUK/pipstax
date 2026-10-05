import app from './app';
import { env } from './config/env';
import { AppDataSource } from './config/data-source';
import { startEmailWorker } from './tenant/queues/email-queue.service';
import {
  startDocumentSyncScheduler,
  startDocumentSyncWorker,
} from './tenant/queues/document-sync-queue.service';
import { startLeadTaskReminderScheduler } from './tenant/queues/lead-task-reminder-scheduler.service';
import { startPlannerNoteReminderScheduler } from './tenant/queues/planner-note-reminder-scheduler.service';
import { startComplianceExpiryScheduler } from './tenant/queues/compliance-expiry-scheduler.service';
import { startQuoteExpiryScheduler } from './tenant/queues/quote-expiry-scheduler.service';
import { startAccountingSyncWorker } from './tenant/queues/accounting-sync-queue.service';
import { verifyMailTransport } from './services/mailer.service';

const start = async () => {
  try {
    await AppDataSource.initialize();
    startEmailWorker();
    startDocumentSyncWorker();
    startDocumentSyncScheduler();
    startLeadTaskReminderScheduler();
    startPlannerNoteReminderScheduler();
    startComplianceExpiryScheduler();
    startQuoteExpiryScheduler();
    startAccountingSyncWorker();
    await verifyMailTransport();
    app.listen(env.port, () => {
      // eslint-disable-next-line no-console
      console.log(`API running on port ${env.port}`);
    });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Failed to start server', error);
    process.exit(1);
  }
};

start();

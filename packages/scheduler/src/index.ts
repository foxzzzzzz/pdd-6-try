import 'dotenv/config';
import { Queue } from 'bullmq';
import {
  INSPECTION_QUEUE,
  InspectionJobData,
  createInspectionJobData,
  getDb,
  saveDb,
  schema,
} from '@pdd-inspector/core';
import { eq } from 'drizzle-orm';

const REDIS_HOST = process.env.REDIS_HOST || 'localhost';
const REDIS_PORT = parseInt(process.env.REDIS_PORT || '6379', 10);
const DAILY_CRON = process.env.SCHEDULE_CRON || '0 8 * * *'; // Default: daily at 8:00 AM

const connection = {
  host: REDIS_HOST,
  port: REDIS_PORT,
  maxRetriesPerRequest: null,
};

async function scheduleDailyInspection() {
  console.log('PDD Inspection Scheduler');
  console.log(`  Schedule: ${DAILY_CRON}`);
  console.log(`  Redis: ${REDIS_HOST}:${REDIS_PORT}`);

  const queue = new Queue<InspectionJobData>(INSPECTION_QUEUE, {
    connection,
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: 'exponential', delay: 5000 },
    },
  });

  // Remove existing repeatable jobs to avoid duplicates
  const repeatableJobs = await queue.getRepeatableJobs();
  for (const job of repeatableJobs) {
    await queue.removeRepeatableByKey(job.key);
  }

  // Schedule the master inspection job
  await queue.add(
    'daily-inspection',
    { storeId: 0, storeName: 'SCHEDULER', date: '' }, // Dummy data — actual jobs are created by the server
    {
      repeat: { pattern: DAILY_CRON },
      jobId: 'daily-inspection-repeat',
    },
  );

  console.log(`Scheduled daily inspection at: ${DAILY_CRON}`);
  console.log('Scheduler is running. Press Ctrl+C to stop.');

  // Also trigger once on startup if configured
  if (process.env.RUN_ON_STARTUP === 'true') {
    console.log('Running initial inspection...');
    await triggerAllStores(queue);
  }
}

async function triggerAllStores(queue: Queue<InspectionJobData>) {
  const db = await getDb();
  const activeStores = db
    .select()
    .from(schema.stores)
    .where(eq(schema.stores.status, 'active'))
    .all();

  const date = new Date().toISOString().split('T')[0];

  for (const store of activeStores) {
    const record = db.insert(schema.inspectionRecords).values({
      storeId: store.id,
      date,
      status: 'pending',
    }).returning().get();

    await queue.add(
      `inspect-${store.id}-${date}`,
      createInspectionJobData(store.id, store.name, date, record.id),
    );
    console.log(`  Queued: ${store.name}`);
  }

  saveDb();
  console.log(`Total queued: ${activeStores.length} stores`);
}

scheduleDailyInspection().catch((err) => {
  console.error('Scheduler error:', err);
  process.exit(1);
});

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\nShutting down scheduler...');
  process.exit(0);
});

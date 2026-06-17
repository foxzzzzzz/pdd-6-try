import 'dotenv/config';
import { Worker } from 'bullmq';
import { inspectStore } from './inspector';
import { INSPECTION_QUEUE, InspectionJobData } from '@pdd-inspector/core';

const REDIS_HOST = process.env.REDIS_HOST || 'localhost';
const REDIS_PORT = parseInt(process.env.REDIS_PORT || '6379', 10);
const CONCURRENCY = parseInt(process.env.WORKER_CONCURRENCY || '3', 10);
const HEADLESS = process.env.HEADLESS !== 'false'; // default true

const connection = {
  host: REDIS_HOST,
  port: REDIS_PORT,
  maxRetriesPerRequest: null,
};

console.log('Starting PDD Inspection Worker...');
console.log(`  Redis: ${REDIS_HOST}:${REDIS_PORT}`);
console.log(`  Concurrency: ${CONCURRENCY}`);
console.log(`  Headless: ${HEADLESS}`);

const worker = new Worker<InspectionJobData>(
  INSPECTION_QUEUE,
  async (job) => {
    const { storeId, storeName, date } = job.data;
    console.log(`\n=== Processing: ${storeName} (ID: ${storeId}) ===`);

    // Update progress
    await job.updateProgress(10);

    const result = await inspectStore(storeId, storeName, date, {
      headless: HEADLESS,
      screenshotOnError: true,
    });

    await job.updateProgress(100);

    if (!result.success) {
      throw new Error(`Inspection incomplete. Errors: ${result.errors.join('; ')}`);
    }

    return {
      storeId,
      storeName,
      completionRate: result.completionRate,
      errors: result.errors,
    };
  },
  {
    connection,
    concurrency: CONCURRENCY,
    limiter: {
      max: CONCURRENCY,
      duration: 1000, // max N jobs per second
    },
  },
);

worker.on('completed', (job) => {
  console.log(`✅ Job completed: ${job.data.storeName}`);
});

worker.on('failed', (job, err) => {
  console.error(`❌ Job failed: ${job?.data.storeName} — ${err.message}`);
});

worker.on('error', (err) => {
  console.error('Worker error:', err);
});

// Graceful shutdown
const shutdown = async () => {
  console.log('\nShutting down worker...');
  await worker.close();
  process.exit(0);
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

console.log('Worker is ready, waiting for jobs...');

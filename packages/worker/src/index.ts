import 'dotenv/config';
import { Worker } from 'bullmq';
import { inspectStore } from './inspector';
import { INSPECTION_QUEUE, InspectionJobData } from '@pdd-inspector/core';

const REDIS_HOST = process.env.REDIS_HOST || 'localhost';
const REDIS_PORT = parseInt(process.env.REDIS_PORT || '6379', 10);
const CONCURRENCY = parseInt(process.env.WORKER_CONCURRENCY || '3', 10);
const HEADLESS = process.env.WORKER_HEADLESS !== 'false';
const ENABLE_REPLY = process.env.WORKER_ENABLE_REPLY !== 'false';
const ENABLE_REPORT = process.env.WORKER_ENABLE_REPORT !== 'false';
const ENABLE_HIDE = process.env.WORKER_ENABLE_HIDE_INTERACTIONS !== 'false';
const ENABLE_AI = process.env.WORKER_ENABLE_AI === 'true';

const connection = {
  host: REDIS_HOST,
  port: REDIS_PORT,
  maxRetriesPerRequest: null,
};

console.log('Starting PDD Inspection Worker...');
console.log(`  Redis: ${REDIS_HOST}:${REDIS_PORT}`);
console.log(`  Concurrency: ${CONCURRENCY} | Headless: ${HEADLESS}`);
console.log(`  Ops: reply=${ENABLE_REPLY} report=${ENABLE_REPORT} hide=${ENABLE_HIDE} ai=${ENABLE_AI}`);

const worker = new Worker<InspectionJobData>(
  INSPECTION_QUEUE,
  async (job) => {
    const { storeId, storeName, date, inspectionId } = job.data;
    console.log(`\n=== Processing: ${storeName} (ID: ${storeId}) ===`);
    await job.updateProgress(10);

    const result = await inspectStore(storeId, storeName, date, {
      inspectionId,
      headless: HEADLESS,
      screenshotOnError: true,
      enableReply: ENABLE_REPLY,
      enableReport: ENABLE_REPORT,
      enableHideInteractions: ENABLE_HIDE,
      useAI: ENABLE_AI,
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
      duration: 1000,
    },
  },
);

worker.on('active', (job) => {
  console.log(`▶️  Job active: ${job.data.storeName} (inspectionId=${job.data.inspectionId})`);
});

worker.on('completed', (job) => {
  console.log(`✅ Job completed: ${job.data.storeName}`);
});

worker.on('failed', (job, err) => {
  console.error(`❌ Job failed: ${job?.data.storeName} — ${err.message}`);
});

worker.on('error', (err) => {
  console.error('Worker error:', err);
});

const shutdown = async () => {
  console.log('\nShutting down worker...');
  await worker.close();
  process.exit(0);
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

console.log('Worker is ready, waiting for jobs...');

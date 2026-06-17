import 'dotenv/config';
import { Worker } from 'bullmq';
import { inspectStore } from './inspector';
import { INSPECTION_QUEUE, InspectionJobData } from '@pdd-inspector/core';

// Log to file (avoids Windows stdout buffering issues with tsx watch)
import * as fs from 'fs';
const LOG_FILE = 'data/worker.log';
function log(...args: any[]) {
  const msg = args.join(' ') + '\n';
  process.stdout.write(msg);
  fs.appendFileSync(LOG_FILE, new Date().toISOString().substring(11, 19) + ' ' + msg);
}

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

log('Starting PDD Inspection Worker...');
log(`  Redis: ${REDIS_HOST}:${REDIS_PORT}`);
log(`  Concurrency: ${CONCURRENCY} | Headless: ${HEADLESS}`);
log(`  Ops: reply=${ENABLE_REPLY} report=${ENABLE_REPORT} hide=${ENABLE_HIDE} ai=${ENABLE_AI}`);

async function start() {

const worker = new Worker<InspectionJobData>(
  INSPECTION_QUEUE,
  async (job) => {
    const { storeId, storeName, date, inspectionId } = job.data;
    log(`\n=== Processing: ${storeName} (ID: ${storeId}) ===`);
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
  log(`▶️  Job active: ${job.data.storeName} (inspectionId=${job.data.inspectionId})`);
});

worker.on('completed', (job) => {
  log(`✅ Job completed: ${job.data.storeName}`);
});

worker.on('failed', (job, err) => {
  log('[ERROR]',`❌ Job failed: ${job?.data.storeName} — ${err.message}`);
});

worker.on('error', (err) => {
  log('[ERROR]','Worker error:', err);
});

const shutdown = async () => {
  log('\nShutting down worker...');
  await worker.close(true);
  process.exit(0);
};

// Clean stale locks from previous instance (hot reload safety)
await worker.waitUntilReady();

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

log('Worker ready — code changes auto-reload via tsx watch');

}

start();

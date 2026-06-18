import 'dotenv/config';
import { Worker } from 'bullmq';
import { inspectStore } from './inspector';
import { INSPECTION_QUEUE, InspectionJobData } from '@pdd-inspector/core';

// Force stdout flush on Windows — prevents buffering when running via pnpm
const log = (...args: any[]) => { try { process.stdout.write(args.join(' ') + '\n'); } catch { /* ignore */ } };

const REDIS_HOST = process.env.REDIS_HOST || 'localhost';
const REDIS_PORT = parseInt(process.env.REDIS_PORT || '6379', 10);
const CONCURRENCY = parseInt(process.env.WORKER_CONCURRENCY || '3', 10);
const HEADLESS = process.env.WORKER_HEADLESS !== 'false';
const ACTION_MODE = process.env.WORKER_ACTION_MODE === 'real-run' ? 'real-run' : 'dry-run';
const ACTION_LIMIT = process.env.WORKER_ACTION_LIMIT ? parseInt(process.env.WORKER_ACTION_LIMIT, 10) : null;
const ENABLE_REPLY = process.env.WORKER_ENABLE_REPLY === 'true';
const ENABLE_REPORT = process.env.WORKER_ENABLE_REPORT === 'true';
const ENABLE_HIDE = process.env.WORKER_ENABLE_HIDE_INTERACTIONS === 'true';
const ENABLE_AI = process.env.WORKER_ENABLE_AI === 'true';

const connection = {
  host: REDIS_HOST,
  port: REDIS_PORT,
  maxRetriesPerRequest: null,
};

log('Starting PDD Inspection Worker...');
log(`  Redis: ${REDIS_HOST}:${REDIS_PORT}`);
log(`  Concurrency: ${CONCURRENCY} | Headless: ${HEADLESS}`);
log(`  Ops: mode=${ACTION_MODE} limit=${ACTION_LIMIT ?? 'none'} reply=${ENABLE_REPLY} report=${ENABLE_REPORT} hide=${ENABLE_HIDE} ai=${ENABLE_AI}`);

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
      actionMode: ACTION_MODE,
      actionLimit: ACTION_LIMIT,
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

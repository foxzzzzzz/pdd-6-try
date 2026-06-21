import { loadWorkspaceEnv } from './env-loader';
import { Worker } from 'bullmq';
import { inspectStore } from './inspector';
import { ACTION_QUEUE, ActionJobData, INSPECTION_QUEUE, InspectionJobData } from '@pdd-inspector/core';
import { executeApprovedAction } from './action-executor';
import { clampActionConcurrency, clampInspectionConcurrency } from './action-risk-control';

loadWorkspaceEnv();

// Force stdout flush on Windows — prevents buffering when running via pnpm
const log = (...args: any[]) => { try { process.stdout.write(args.join(' ') + '\n'); } catch { /* ignore */ } };

const REDIS_HOST = process.env.REDIS_HOST || 'localhost';
const REDIS_PORT = parseInt(process.env.REDIS_PORT || '6379', 10);
const CONCURRENCY = clampInspectionConcurrency(parseInt(process.env.WORKER_CONCURRENCY || '1', 10));
const ACTION_CONCURRENCY = clampActionConcurrency(parseInt(process.env.WORKER_ACTION_CONCURRENCY || '1', 10));
const HEADLESS = process.env.WORKER_HEADLESS === 'true';
const ACTION_MODE = process.env.WORKER_ACTION_MODE === 'real-run' ? 'real-run' : 'dry-run';
const ACTION_LIMIT = process.env.WORKER_ACTION_LIMIT ? parseInt(process.env.WORKER_ACTION_LIMIT, 10) : null;
const ENABLE_REPLY = process.env.WORKER_ENABLE_REPLY === 'true';
const ENABLE_REPORT = process.env.WORKER_ENABLE_REPORT === 'true';
const ENABLE_HIDE = process.env.WORKER_ENABLE_HIDE_INTERACTIONS === 'true';
const ENABLE_AI = process.env.WORKER_ENABLE_AI === 'true';
const APPROVAL_REPLY = process.env.ACTION_APPROVAL_REQUIRED_REPLY === 'true';
const APPROVAL_REPORT = process.env.ACTION_APPROVAL_REQUIRED_REPORT !== 'false';
const APPROVAL_HIDE = process.env.ACTION_APPROVAL_REQUIRED_HIDE !== 'false';
const DAILY_LIMIT_REPLY = parseOptionalInt(process.env.ACTION_DAILY_LIMIT_REPLY, 20);
const DAILY_LIMIT_REPORT = parseOptionalInt(process.env.ACTION_DAILY_LIMIT_REPORT, 5);
const DAILY_LIMIT_HIDE = parseOptionalInt(process.env.ACTION_DAILY_LIMIT_HIDE, 5);
const ACTION_DELAY_REPLY_MS = process.env.ACTION_DELAY_REPLY_MS;
const ACTION_DELAY_REPORT_MS = process.env.ACTION_DELAY_REPORT_MS;
const ACTION_DELAY_HIDE_MS = process.env.ACTION_DELAY_HIDE_MS;

const connection = {
  host: REDIS_HOST,
  port: REDIS_PORT,
  maxRetriesPerRequest: null,
};

log('Starting PDD Inspection Worker...');
log(`  Redis: ${REDIS_HOST}:${REDIS_PORT}`);
log(`  Concurrency: inspection=${CONCURRENCY} action=${ACTION_CONCURRENCY} | Headless: ${HEADLESS}`);
log(`  Ops: mode=${ACTION_MODE} limit=${ACTION_LIMIT ?? 'none'} reply=${ENABLE_REPLY} report=${ENABLE_REPORT} hide=${ENABLE_HIDE} ai=${ENABLE_AI}`);
log(`  Approval: reply=${APPROVAL_REPLY} report=${APPROVAL_REPORT} hide=${APPROVAL_HIDE} dailyLimits=${DAILY_LIMIT_REPLY}/${DAILY_LIMIT_REPORT}/${DAILY_LIMIT_HIDE}`);
log(`  Action pacing: reply=${ACTION_DELAY_REPLY_MS || '8000-20000'}ms report=${ACTION_DELAY_REPORT_MS || '20000-60000'}ms hide=${ACTION_DELAY_HIDE_MS || '20000-60000'}ms`);

async function start() {

const worker = new Worker<InspectionJobData>(
  INSPECTION_QUEUE,
  async (job) => {
    const { storeId, storeName, date, inspectionId, operatorId } = job.data;
    log(`\n=== Processing: ${storeName} (ID: ${storeId}) operator=${operatorId || 'none'} ===`);
    await job.updateProgress(10);

    const result = await inspectStore(storeId, storeName, date, {
      inspectionId,
      operatorId,
      headless: HEADLESS,
      screenshotOnError: true,
      enableReply: ENABLE_REPLY,
      enableReport: ENABLE_REPORT,
      enableHideInteractions: ENABLE_HIDE,
      useAI: ENABLE_AI,
      actionMode: ACTION_MODE,
      actionLimit: ACTION_LIMIT,
      replyApprovalRequired: APPROVAL_REPLY,
      reportApprovalRequired: APPROVAL_REPORT,
      hideApprovalRequired: APPROVAL_HIDE,
      replyDailyLimit: DAILY_LIMIT_REPLY,
      reportDailyLimit: DAILY_LIMIT_REPORT,
      hideDailyLimit: DAILY_LIMIT_HIDE,
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

const actionWorker = new Worker<ActionJobData>(
  ACTION_QUEUE,
  async (job) => {
    const { candidateKind, candidateId, storeId, actionType, operatorId } = job.data;
    log(`\n=== Executing approved action: ${candidateKind}#${candidateId} store=${storeId} type=${actionType} operator=${operatorId} ===`);
    await job.updateProgress(10);
    const result = await executeApprovedAction(job.data, {
      headless: HEADLESS,
      replyDailyLimit: DAILY_LIMIT_REPLY,
      reportDailyLimit: DAILY_LIMIT_REPORT,
      hideDailyLimit: DAILY_LIMIT_HIDE,
      replyDelayRangeMs: ACTION_DELAY_REPLY_MS,
      reportDelayRangeMs: ACTION_DELAY_REPORT_MS,
      hideDelayRangeMs: ACTION_DELAY_HIDE_MS,
    });
    await job.updateProgress(100);
    if (result.status !== 'success') {
      throw new Error(result.error || `Approved action finished with ${result.status}`);
    }
    return result;
  },
  {
    connection,
    concurrency: ACTION_CONCURRENCY,
    limiter: {
      max: ACTION_CONCURRENCY,
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

actionWorker.on('active', (job) => {
  log(`Action job active: ${job.data.candidateKind}#${job.data.candidateId}`);
});

actionWorker.on('completed', (job) => {
  log(`Action job completed: ${job.data.candidateKind}#${job.data.candidateId}`);
});

actionWorker.on('failed', (job, err) => {
  log('[ERROR]',`Action job failed: ${job?.data.candidateKind}#${job?.data.candidateId} - ${err.message}`);
});

actionWorker.on('error', (err) => {
  log('[ERROR]','Action worker error:', err);
});

const shutdown = async () => {
  log('\nShutting down worker...');
  await worker.close(true);
  await actionWorker.close(true);
  process.exit(0);
};

// Clean stale locks from previous instance (hot reload safety)
await worker.waitUntilReady();
await actionWorker.waitUntilReady();

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

log('Worker ready — code changes auto-reload via tsx watch');

}

start();

function parseOptionalInt(value: string | undefined, fallback: number | null): number | null {
  if (!value) return fallback;
  const parsed = parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

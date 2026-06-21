import { ActionJobData, getDb, saveDb } from '@pdd-inspector/core';
import { sql } from 'drizzle-orm';
import { BrowserManager } from './browser';
import { ActionSafety } from './action-safety';
import { decideStoreStatusForRiskSignal, detectRiskControlSignal, resolveActionDelayMs } from './action-risk-control';
import { executeInteractionActionCandidate, InteractionActionCandidate } from './actions/interactions';
import { executeReviewActionCandidate, ReviewActionCandidate } from './actions/reviews';

export interface ActionExecutorConfig {
  headless: boolean;
  replyDailyLimit: number | null;
  reportDailyLimit: number | null;
  hideDailyLimit: number | null;
  replyDelayRangeMs?: string;
  reportDelayRangeMs?: string;
  hideDelayRangeMs?: string;
}

interface StoreRecord {
  id: number;
  name: string;
  storageState: string | null;
}

export async function executeApprovedAction(job: ActionJobData, config: ActionExecutorConfig): Promise<{ status: string; error?: string }> {
  const db = await getDb();
  const candidate = getCandidate(db, job);
  if (!candidate) throw new Error(`Action candidate not found: ${job.candidateKind}#${job.candidateId}`);
  if (candidate.storeId !== job.storeId || candidate.actionType !== job.actionType) {
    throw new Error(`Action candidate mismatch: ${job.candidateKind}#${job.candidateId}`);
  }
  if (!['queued', 'approved'].includes(candidate.status)) {
    throw new Error(`Action candidate is ${candidate.status}, not executable`);
  }
  if (!candidate.approvedAt) {
    throw new Error('Action candidate has not been approved');
  }

  const store = getStore(db, job.storeId);
  if (!store) throw new Error(`Store not found: ${job.storeId}`);

  setCandidateStatus(db, job.candidateKind, job.candidateId, 'running', {
    operatorId: job.operatorId,
  });
  saveDb(db);

  const browser = new BrowserManager();
  try {
    await browser.init(config.headless);
    const loggedIn = await browser.login(store.id, store.storageState);
    if (!loggedIn) {
      const errorMessage = 'Store login required before executing approved action';
      setCandidateStatus(db, job.candidateKind, job.candidateId, 'failed', { errorMessage });
      markStoreForRiskControl(db, store.id, errorMessage);
      saveDb(db);
      return { status: 'failed', error: errorMessage };
    }
    refreshStoreSession(db, browser, store.id).catch(() => undefined);

    const safety = buildSingleActionSafety(job.actionType, config);
    await delayBeforeAction(job.actionType, config);
    const detail = job.candidateKind === 'review'
      ? await executeReviewActionCandidate(browser, store.id, candidate as ReviewActionCandidate, safety)
      : await executeInteractionActionCandidate(browser, store.id, candidate as InteractionActionCandidate, safety);
    await delayAfterAction(job.actionType, config);

    const finalStatus = detail.status === 'success' ? 'success' : 'failed';
    if (detail.errorMessage) {
      markStoreForRiskControl(db, store.id, detail.errorMessage);
    }
    setCandidateStatus(db, job.candidateKind, job.candidateId, finalStatus, {
      errorMessage: detail.errorMessage || null,
      screenshotPath: detail.screenshotPath || null,
      submittedAt: detail.submittedAt || null,
      executedAt: detail.executedAt || new Date().toISOString(),
      operatorId: job.operatorId,
    });
    saveDb(db);
    return { status: finalStatus, error: detail.errorMessage };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    markStoreForRiskControl(db, job.storeId, errorMessage);
    setCandidateStatus(db, job.candidateKind, job.candidateId, 'failed', { errorMessage });
    saveDb(db);
    return { status: 'failed', error: errorMessage };
  } finally {
    await browser.close().catch(() => undefined);
  }
}

async function refreshStoreSession(db: any, browser: BrowserManager, storeId: number): Promise<void> {
  const storageState = await browser.saveStorageState();
  db.run(sql.raw(`
    UPDATE stores
    SET storage_state = ${quote(storageState)},
        status = 'active',
        updated_at = ${quote(new Date().toISOString())}
    WHERE id = ${storeId}
  `));
  saveDb(db);
}

async function delayBeforeAction(actionType: ActionJobData['actionType'], config: ActionExecutorConfig): Promise<void> {
  await sleep(resolveActionDelayMs(actionType, getDelayRange(actionType, config)));
}

async function delayAfterAction(actionType: ActionJobData['actionType'], config: ActionExecutorConfig): Promise<void> {
  await sleep(resolveActionDelayMs(actionType, getDelayRange(actionType, config)));
}

function getDelayRange(actionType: ActionJobData['actionType'], config: ActionExecutorConfig): string | undefined {
  if (actionType === 'reply') return config.replyDelayRangeMs;
  if (actionType === 'report') return config.reportDelayRangeMs;
  return config.hideDelayRangeMs;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildSingleActionSafety(actionType: ActionJobData['actionType'], config: ActionExecutorConfig): Partial<ActionSafety> {
  return {
    mode: 'real-run',
    enableReply: actionType === 'reply',
    enableReport: actionType === 'report',
    enableHideInteractions: actionType === 'hide',
    approvedActions: {
      reply: actionType === 'reply',
      report: actionType === 'report',
      hide: actionType === 'hide',
    },
    approvalRequired: {
      reply: actionType === 'reply',
      report: actionType === 'report',
      hide: actionType === 'hide',
    },
    dailyLimits: {
      reply: config.replyDailyLimit,
      report: config.reportDailyLimit,
      hide: config.hideDailyLimit,
    },
    maxActions: 1,
  };
}

function getStore(db: any, storeId: number): StoreRecord | null {
  return db.get(sql.raw(`
    SELECT id, name, storage_state AS storageState
    FROM stores
    WHERE id = ${storeId}
  `)) || null;
}

function getCandidate(db: any, job: ActionJobData): (ReviewActionCandidate | InteractionActionCandidate) & {
  storeId: number;
  actionType: ActionJobData['actionType'];
  status: string;
  approvedAt: string | null;
} | null {
  if (job.candidateKind === 'review') {
    return db.get(sql.raw(`
      SELECT
        id,
        store_id AS storeId,
        review_id AS reviewId,
        review_content AS reviewContent,
        review_stars AS reviewStars,
        action_type AS actionType,
        action_content AS actionContent,
        status,
        approved_at AS approvedAt
      FROM review_actions
      WHERE id = ${job.candidateId}
    `)) || null;
  }
  return db.get(sql.raw(`
    SELECT
      id,
      store_id AS storeId,
      interaction_id AS interactionId,
      content_summary AS contentSummary,
      ai_judgment AS aiJudgment,
      action,
      action AS actionType,
      status,
      approved_at AS approvedAt
    FROM interaction_actions
    WHERE id = ${job.candidateId}
  `)) || null;
}

function setCandidateStatus(
  db: any,
  kind: ActionJobData['candidateKind'],
  id: number,
  status: string,
  values: {
    errorMessage?: string | null;
    screenshotPath?: string | null;
    submittedAt?: string | null;
    executedAt?: string | null;
    operatorId?: string | null;
  } = {},
): void {
  const table = kind === 'review' ? 'review_actions' : 'interaction_actions';
  const updates = [`status = ${quote(status)}`];
  if ('errorMessage' in values) updates.push(`error_message = ${values.errorMessage ? quote(values.errorMessage) : 'NULL'}`);
  if ('screenshotPath' in values) updates.push(`screenshot_path = ${values.screenshotPath ? quote(values.screenshotPath) : 'NULL'}`);
  if ('submittedAt' in values) updates.push(`submitted_at = ${values.submittedAt ? quote(values.submittedAt) : 'NULL'}`);
  if ('executedAt' in values) updates.push(`executed_at = ${values.executedAt ? quote(values.executedAt) : 'NULL'}`);
  if ('operatorId' in values) updates.push(`operator_id = ${values.operatorId ? quote(values.operatorId) : 'NULL'}`);
  db.run(sql.raw(`UPDATE ${table} SET ${updates.join(', ')} WHERE id = ${id}`));
}

function markStoreForRiskControl(db: any, storeId: number, message: string): void {
  const signal = detectRiskControlSignal(message);
  if (!signal) return;
  const status = decideStoreStatusForRiskSignal(signal.kind);
  db.run(sql.raw(`
    UPDATE stores
    SET status = ${quote(status)},
        updated_at = ${quote(new Date().toISOString())}
    WHERE id = ${storeId}
  `));
}

function quote(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

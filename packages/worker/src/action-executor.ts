import { ActionJobData, getDb, quoteSqlString, saveDb, type AppDb } from '@pdd-inspector/core';
import { sql } from 'drizzle-orm';
import { BrowserManager } from './browser';
import { ActionSafety } from './action-safety';
import { resolveActionDelayMs } from './action-risk-control';
import { isGlobalWritePaused, recordRiskEvent, resolveRiskEventType } from './risk-sentinel';
import { executeInteractionActionCandidate, InteractionActionCandidate } from './actions/interactions';
import { executeReviewActionCandidate, ReviewActionCandidate } from './actions/reviews';
import { getOperatorStoreSession, normalizeOperatorId, saveOperatorStoreSession } from './operator-session';
import { isModuleDegraded } from './selector-health';
import { getRuleReviewBlockReason } from './rule-review';

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
  const operatorId = normalizeOperatorId(job.operatorId);
  if (!operatorId) throw new Error('operatorId is required for approved action execution');
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
  const selectorModule = job.actionType === 'hide' ? 'interactions' : 'reviews';
  if (isModuleDegraded(db, selectorModule)) {
    const errorMessage = `Selector health degraded for ${selectorModule}; real-run action paused`;
    setCandidateStatus(db, job.candidateKind, job.candidateId, 'failed', { errorMessage, operatorId });
    saveDb(db);
    return { status: 'failed', error: errorMessage };
  }
  const ruleReviewBlockReason = getRuleReviewBlockReason(db, job.actionType);
  if (ruleReviewBlockReason) {
    const errorMessage = `${ruleReviewBlockReason}; real-run action paused`;
    setCandidateStatus(db, job.candidateKind, job.candidateId, 'failed', { errorMessage, operatorId });
    saveDb(db);
    return { status: 'failed', error: errorMessage };
  }
  if (isGlobalWritePaused(db)) {
    const errorMessage = 'Global write risk control active';
    setCandidateStatus(db, job.candidateKind, job.candidateId, 'failed', { errorMessage });
    saveDb(db);
    return { status: 'failed', error: errorMessage };
  }

  setCandidateStatus(db, job.candidateKind, job.candidateId, 'running', {
    operatorId,
  });
  saveDb(db);

  const browser = new BrowserManager();
  try {
    const operatorSession = getOperatorStoreSession(db, operatorId, store.id);
    await browser.init({ headless: config.headless, profileKey: operatorSession?.profileKey });
    const storageState = operatorSession?.storageState || store.storageState;
    const loggedIn = await browser.login(store.id, storageState);
    if (!loggedIn) {
      const errorMessage = 'Store login required before executing approved action';
      setCandidateStatus(db, job.candidateKind, job.candidateId, 'failed', { errorMessage });
      await recordActionRisk(db, browser, job, errorMessage, 'login');
      saveDb(db);
      return { status: 'failed', error: errorMessage };
    }
    refreshStoreSession(db, browser, store.id, operatorId).catch(() => undefined);

    const safety = buildSingleActionSafety(job.actionType, config);
    await delayBeforeAction(job.actionType, config);
    const detail = job.candidateKind === 'review'
      ? await executeReviewActionCandidate(browser, store.id, candidate as ReviewActionCandidate, safety)
      : await executeInteractionActionCandidate(browser, store.id, candidate as InteractionActionCandidate, safety);
    await delayAfterAction(job.actionType, config);

    const finalStatus = detail.status === 'success' ? 'success' : 'failed';
    if (detail.errorMessage) {
      await recordActionRisk(db, browser, job, detail.errorMessage, resolveRiskEventType(detail.errorMessage) || 'action_failure');
    }
    setCandidateStatus(db, job.candidateKind, job.candidateId, finalStatus, {
      errorMessage: detail.errorMessage || null,
      screenshotPath: detail.screenshotPath || null,
      submittedAt: detail.submittedAt || null,
      executedAt: detail.executedAt || new Date().toISOString(),
      operatorId,
    });
    saveDb(db);
    return { status: finalStatus, error: detail.errorMessage };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    await recordActionRisk(db, browser, job, errorMessage, resolveRiskEventType(errorMessage) || 'action_failure');
    setCandidateStatus(db, job.candidateKind, job.candidateId, 'failed', { errorMessage });
    saveDb(db);
    return { status: 'failed', error: errorMessage };
  } finally {
    await browser.close().catch(() => undefined);
  }
}

async function recordActionRisk(
  db: AppDb,
  browser: BrowserManager,
  job: ActionJobData,
  message: string,
  eventType: 'login' | 'security' | 'rate_limit' | 'permission' | 'action_failure',
): Promise<void> {
  await recordRiskEvent(db, {
    storeId: job.storeId,
    operatorId: job.operatorId,
    eventType,
    message,
    actionType: job.actionType,
    sourceType: job.candidateKind,
    sourceId: String(job.candidateId),
    browser,
  });
}

async function refreshStoreSession(db: AppDb, browser: BrowserManager, storeId: number, operatorId: string): Promise<void> {
  const storageState = await browser.saveStorageState();
  saveOperatorStoreSession(db, operatorId, storeId, storageState, 'active');
  db.run(sql.raw(`
    UPDATE stores
    SET storage_state = ${quoteSqlString(storageState)},
        status = 'active',
        updated_at = ${quoteSqlString(new Date().toISOString())}
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

function getStore(db: AppDb, storeId: number): StoreRecord | null {
  return db.get(sql.raw(`
    SELECT id, name, storage_state AS storageState
    FROM stores
    WHERE id = ${storeId}
  `)) || null;
}

function getCandidate(db: AppDb, job: ActionJobData): (ReviewActionCandidate | InteractionActionCandidate) & {
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
  db: AppDb,
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
  const updates = [`status = ${quoteSqlString(status)}`];
  if ('errorMessage' in values) updates.push(`error_message = ${values.errorMessage ? quoteSqlString(values.errorMessage) : 'NULL'}`);
  if ('screenshotPath' in values) updates.push(`screenshot_path = ${values.screenshotPath ? quoteSqlString(values.screenshotPath) : 'NULL'}`);
  if ('submittedAt' in values) updates.push(`submitted_at = ${values.submittedAt ? quoteSqlString(values.submittedAt) : 'NULL'}`);
  if ('executedAt' in values) updates.push(`executed_at = ${values.executedAt ? quoteSqlString(values.executedAt) : 'NULL'}`);
  if ('operatorId' in values) updates.push(`operator_id = ${values.operatorId ? quoteSqlString(values.operatorId) : 'NULL'}`);
  db.run(sql.raw(`UPDATE ${table} SET ${updates.join(', ')} WHERE id = ${id}`));
}

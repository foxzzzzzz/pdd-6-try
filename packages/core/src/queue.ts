// Queue names
export const INSPECTION_QUEUE = 'pdd-inspection';
export const SCHEDULER_QUEUE = 'pdd-scheduler';
export const ACTION_QUEUE = 'pdd-action';
export const LOGIN_BIND_QUEUE = 'pdd-login-bind';

// Job data type
export interface InspectionJobData {
  storeId: number;
  storeName: string;
  date: string;
  inspectionId?: number;
  operatorId?: string;
}

export interface SchedulerJobData {
  task: 'daily-inspection';
}

export interface InspectionStaggerConfig {
  targetWindowMinutes?: number;
  minDelayMs?: number;
  maxDelayMs?: number;
  estimatedStoreDurationMs?: number;
}

export interface InspectionStaggerPlan {
  storeCount: number;
  intervalMs: number;
  delaysMs: number[];
  estimatedStoreDurationMs: number;
  estimatedTotalMs: number;
  targetWindowMs: number;
  expectedFinishBeforeTarget: boolean;
}

export interface ActionJobData {
  candidateKind: 'review' | 'interaction';
  candidateId: number;
  storeId: number;
  actionType: 'reply' | 'report' | 'hide';
  operatorId: string;
}

export interface LoginBindJobData {
  storeId: number;
  storeName: string;
  operatorId: string;
}

export function createInspectionJobData(
  storeId: number,
  storeName: string,
  date: string,
  inspectionId?: number,
  operatorId?: string | null,
): InspectionJobData {
  const job: InspectionJobData = { storeId, storeName, date };
  if (inspectionId != null) job.inspectionId = inspectionId;
  const normalizedOperatorId = operatorId?.trim();
  if (normalizedOperatorId) job.operatorId = normalizedOperatorId;
  return job;
}

export function createSchedulerJobData(): SchedulerJobData {
  return { task: 'daily-inspection' };
}

export function createInspectionStaggerPlan(
  storeCount: number,
  config: InspectionStaggerConfig = {},
): InspectionStaggerPlan {
  const count = Math.max(0, Math.floor(storeCount));
  const targetWindowMs = positiveNumber(config.targetWindowMinutes, 90) * 60 * 1000;
  const minDelayMs = positiveNumber(config.minDelayMs, 60_000);
  const maxDelayMs = positiveNumber(config.maxDelayMs, 300_000);
  const estimatedStoreDurationMs = positiveNumber(config.estimatedStoreDurationMs, 120_000);

  if (count <= 1) {
    return {
      storeCount: count,
      intervalMs: 0,
      delaysMs: Array(count).fill(0),
      estimatedStoreDurationMs,
      estimatedTotalMs: count * estimatedStoreDurationMs,
      targetWindowMs,
      expectedFinishBeforeTarget: count * estimatedStoreDurationMs <= targetWindowMs,
    };
  }

  const targetIntervalMs = Math.floor(targetWindowMs / count);
  const latestIntervalForTargetMs = Math.max(0, Math.floor((targetWindowMs - estimatedStoreDurationMs) / (count - 1)));
  const preferredIntervalMs = Math.min(targetIntervalMs, latestIntervalForTargetMs, maxDelayMs);
  let intervalMs = Math.max(minDelayMs, preferredIntervalMs);

  const optimisticTotalMs = count * estimatedStoreDurationMs;
  if (optimisticTotalMs <= targetWindowMs && intervalMs > latestIntervalForTargetMs) {
    intervalMs = latestIntervalForTargetMs;
  }

  const delaysMs = Array.from({ length: count }, (_, index) => index * intervalMs);
  const estimatedTotalMs = estimateSerialCompletionMs(delaysMs, estimatedStoreDurationMs);

  return {
    storeCount: count,
    intervalMs,
    delaysMs,
    estimatedStoreDurationMs,
    estimatedTotalMs,
    targetWindowMs,
    expectedFinishBeforeTarget: estimatedTotalMs <= targetWindowMs,
  };
}

export function createActionJobData(
  candidateKind: ActionJobData['candidateKind'],
  candidateId: number,
  storeId: number,
  actionType: ActionJobData['actionType'],
  operatorId: string,
): ActionJobData {
  return { candidateKind, candidateId, storeId, actionType, operatorId };
}

export function createLoginBindJobData(storeId: number, storeName: string, operatorId: string): LoginBindJobData {
  return { storeId, storeName, operatorId: operatorId.trim() };
}

function estimateSerialCompletionMs(delaysMs: number[], durationMs: number): number {
  let currentMs = 0;
  for (const delayMs of delaysMs) {
    const startedAtMs = Math.max(currentMs, delayMs);
    currentMs = startedAtMs + durationMs;
  }
  return currentMs;
}

function positiveNumber(value: number | undefined, fallback: number): number {
  return Number.isFinite(value) && value! > 0 ? value! : fallback;
}

import type { ActionStatus } from '@pdd-inspector/core';

export type ActionMode = 'dry-run' | 'real-run';
export type WriteActionKind = 'reply' | 'report' | 'hide';

export interface ActionSafety {
  mode: ActionMode;
  enableReply: boolean;
  enableReport: boolean;
  enableHideInteractions: boolean;
  maxActions: number | null;
  approvalRequired: Record<WriteActionKind, boolean>;
  approvedActions: Record<WriteActionKind, boolean>;
  dailyLimits: Record<WriteActionKind, number | null>;
  dailyUsage: Record<WriteActionKind, number>;
}

export interface ActionSafetyInput {
  mode?: string;
  actionMode?: string;
  enableReply?: boolean;
  enableReport?: boolean;
  enableHideInteractions?: boolean;
  maxActions?: number | null;
  replyApprovalRequired?: boolean;
  reportApprovalRequired?: boolean;
  hideApprovalRequired?: boolean;
  approvalRequired?: Partial<Record<WriteActionKind, boolean>>;
  approvedActions?: Partial<Record<WriteActionKind, boolean>>;
  dailyLimits?: Partial<Record<WriteActionKind, number | null>>;
  dailyUsage?: Partial<Record<WriteActionKind, number>>;
}

export interface ActionAudit {
  actionMode: ActionMode;
  status: ActionStatus;
  screenshotPath?: string;
  errorMessage?: string;
  submittedAt?: string;
  executedAt?: string;
  approvedAt?: string;
  operatorId?: string;
}

export function resolveActionSafety(input: ActionSafetyInput): ActionSafety {
  const mode = input.mode ?? input.actionMode;
  return {
    mode: mode === 'real-run' ? 'real-run' : 'dry-run',
    enableReply: input.enableReply === true,
    enableReport: input.enableReport === true,
    enableHideInteractions: input.enableHideInteractions === true,
    maxActions: typeof input.maxActions === 'number' && input.maxActions > 0 ? Math.floor(input.maxActions) : null,
    approvalRequired: {
      reply: input.replyApprovalRequired ?? input.approvalRequired?.reply ?? false,
      report: input.reportApprovalRequired ?? input.approvalRequired?.report ?? true,
      hide: input.hideApprovalRequired ?? input.approvalRequired?.hide ?? true,
    },
    approvedActions: {
      reply: input.approvedActions?.reply === true,
      report: input.approvedActions?.report === true,
      hide: input.approvedActions?.hide === true,
    },
    dailyLimits: {
      reply: normalizeLimit(input.dailyLimits?.reply),
      report: normalizeLimit(input.dailyLimits?.report),
      hide: normalizeLimit(input.dailyLimits?.hide),
    },
    dailyUsage: {
      reply: normalizeUsage(input.dailyUsage?.reply),
      report: normalizeUsage(input.dailyUsage?.report),
      hide: normalizeUsage(input.dailyUsage?.hide),
    },
  };
}

export function canSubmitAction(safety: ActionSafety, kind: WriteActionKind): boolean {
  if (safety.mode !== 'real-run') return false;
  if (requiresApproval(safety, kind) && !safety.approvedActions[kind]) return false;
  const limit = safety.dailyLimits[kind];
  if (limit != null && safety.dailyUsage[kind] >= limit) return false;
  if (kind === 'reply') return safety.enableReply;
  if (kind === 'report') return safety.enableReport;
  return safety.enableHideInteractions;
}

export function requiresApproval(safety: ActionSafety, kind: WriteActionKind): boolean {
  return safety.approvalRequired[kind] === true;
}

export function buildActionAudit(
  safety: ActionSafety,
  _actionContent: string,
  result: {
    submitted?: boolean;
    screenshotPath?: string;
    errorMessage?: string;
    approvalRequired?: boolean;
    approvedAt?: string;
    operatorId?: string;
  } = {},
): ActionAudit {
  const submitted = safety.mode === 'real-run' && result.submitted === true;
  const submittedAt = submitted ? new Date().toISOString() : undefined;
  return {
    actionMode: safety.mode,
    status: result.errorMessage ? 'failed' : submitted ? 'success' : result.approvalRequired ? 'pending_approval' : 'skipped',
    screenshotPath: result.screenshotPath,
    errorMessage: result.errorMessage,
    submittedAt,
    executedAt: submittedAt,
    approvedAt: result.approvedAt,
    operatorId: result.operatorId,
  };
}

function normalizeLimit(value: number | null | undefined): number | null {
  return typeof value === 'number' && value > 0 ? Math.floor(value) : null;
}

function normalizeUsage(value: number | undefined): number {
  return typeof value === 'number' && value > 0 ? Math.floor(value) : 0;
}

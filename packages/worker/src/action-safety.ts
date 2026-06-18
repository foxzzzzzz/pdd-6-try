import type { ActionStatus } from '@pdd-inspector/core';

export type ActionMode = 'dry-run' | 'real-run';
export type WriteActionKind = 'reply' | 'report' | 'hide';

export interface ActionSafety {
  mode: ActionMode;
  enableReply: boolean;
  enableReport: boolean;
  enableHideInteractions: boolean;
  maxActions: number | null;
}

export interface ActionSafetyInput {
  mode?: string;
  actionMode?: string;
  enableReply?: boolean;
  enableReport?: boolean;
  enableHideInteractions?: boolean;
  maxActions?: number | null;
}

export interface ActionAudit {
  actionMode: ActionMode;
  status: ActionStatus;
  screenshotPath?: string;
  errorMessage?: string;
  submittedAt?: string;
}

export function resolveActionSafety(input: ActionSafetyInput): ActionSafety {
  const mode = input.mode ?? input.actionMode;
  return {
    mode: mode === 'real-run' ? 'real-run' : 'dry-run',
    enableReply: input.enableReply === true,
    enableReport: input.enableReport === true,
    enableHideInteractions: input.enableHideInteractions === true,
    maxActions: typeof input.maxActions === 'number' && input.maxActions > 0 ? Math.floor(input.maxActions) : null,
  };
}

export function canSubmitAction(safety: ActionSafety, kind: WriteActionKind): boolean {
  if (safety.mode !== 'real-run') return false;
  if (kind === 'reply') return safety.enableReply;
  if (kind === 'report') return safety.enableReport;
  return safety.enableHideInteractions;
}

export function buildActionAudit(
  safety: ActionSafety,
  _actionContent: string,
  result: { submitted?: boolean; screenshotPath?: string; errorMessage?: string } = {},
): ActionAudit {
  const submitted = safety.mode === 'real-run' && result.submitted === true;
  return {
    actionMode: safety.mode,
    status: result.errorMessage ? 'failed' : submitted ? 'success' : 'skipped',
    screenshotPath: result.screenshotPath,
    errorMessage: result.errorMessage,
    submittedAt: submitted ? new Date().toISOString() : undefined,
  };
}

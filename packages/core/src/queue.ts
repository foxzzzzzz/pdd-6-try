// Queue names
export const INSPECTION_QUEUE = 'pdd-inspection';
export const SCHEDULER_QUEUE = 'pdd-scheduler';
export const ACTION_QUEUE = 'pdd-action';

// Job data type
export interface InspectionJobData {
  storeId: number;
  storeName: string;
  date: string;
  inspectionId?: number;
}

export interface SchedulerJobData {
  task: 'daily-inspection';
}

export interface ActionJobData {
  candidateKind: 'review' | 'interaction';
  candidateId: number;
  storeId: number;
  actionType: 'reply' | 'report' | 'hide';
  operatorId: string;
}

export function createInspectionJobData(
  storeId: number,
  storeName: string,
  date: string,
  inspectionId?: number,
): InspectionJobData {
  return inspectionId == null
    ? { storeId, storeName, date }
    : { storeId, storeName, date, inspectionId };
}

export function createSchedulerJobData(): SchedulerJobData {
  return { task: 'daily-inspection' };
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

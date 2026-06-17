// Queue names
export const INSPECTION_QUEUE = 'pdd-inspection';
export const SCHEDULER_QUEUE = 'pdd-scheduler';

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

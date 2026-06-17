// Queue names
export const INSPECTION_QUEUE = 'pdd-inspection';

// Job data type
export interface InspectionJobData {
  storeId: number;
  storeName: string;
  date: string;
  inspectionId?: number;
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

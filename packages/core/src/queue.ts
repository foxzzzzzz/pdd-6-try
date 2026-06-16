// Queue names
export const INSPECTION_QUEUE = 'pdd-inspection';

// Job data type
export interface InspectionJobData {
  storeId: number;
  storeName: string;
  date: string;
}

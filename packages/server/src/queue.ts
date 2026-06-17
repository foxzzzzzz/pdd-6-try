import { Queue, Job } from 'bullmq';
import { getRedisOptions } from './redis';
import { INSPECTION_QUEUE, InspectionJobData, createInspectionJobData } from '@pdd-inspector/core';

let inspectionQueue: Queue<InspectionJobData> | null = null;

export function getInspectionQueue(): Queue<InspectionJobData> {
  if (!inspectionQueue) {
    inspectionQueue = new Queue<InspectionJobData>(INSPECTION_QUEUE, {
      connection: getRedisOptions(),
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 5000,
        },
        removeOnComplete: 100,
        removeOnFail: 50,
      },
    });
  }
  return inspectionQueue;
}

export async function addInspectionJob(
  storeId: number,
  storeName: string,
  date: string,
  inspectionId?: number,
): Promise<Job<InspectionJobData>> {
  const queue = getInspectionQueue();
  return queue.add(`inspect-${storeId}-${date}`, createInspectionJobData(storeId, storeName, date, inspectionId));
}

export async function closeQueue(): Promise<void> {
  if (inspectionQueue) {
    await inspectionQueue.close();
    inspectionQueue = null;
  }
}

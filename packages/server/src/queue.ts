import { Queue, Job } from 'bullmq';
import { getRedisOptions } from './redis';
import {
  ACTION_QUEUE,
  ActionJobData,
  INSPECTION_QUEUE,
  InspectionJobData,
  createActionJobData,
  createInspectionJobData,
} from '@pdd-inspector/core';

let inspectionQueue: Queue<InspectionJobData> | null = null;
let actionQueue: Queue<ActionJobData> | null = null;

function parsePositiveInt(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function getInspectionQueue(): Queue<InspectionJobData> {
  if (!inspectionQueue) {
    inspectionQueue = new Queue<InspectionJobData>(INSPECTION_QUEUE, {
      connection: getRedisOptions(),
      defaultJobOptions: {
        attempts: parsePositiveInt(process.env.INSPECTION_JOB_ATTEMPTS, 1),
        backoff: {
          type: 'exponential',
          delay: parsePositiveInt(process.env.INSPECTION_JOB_BACKOFF_MS, 30000),
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
  operatorId?: string | null,
): Promise<Job<InspectionJobData>> {
  const queue = getInspectionQueue();
  return queue.add(`inspect-${storeId}-${date}`, createInspectionJobData(storeId, storeName, date, inspectionId, operatorId));
}

export function getActionQueue(): Queue<ActionJobData> {
  if (!actionQueue) {
    actionQueue = new Queue<ActionJobData>(ACTION_QUEUE, {
      connection: getRedisOptions(),
      defaultJobOptions: {
        attempts: 1,
        removeOnComplete: 100,
        removeOnFail: 100,
      },
    });
  }
  return actionQueue;
}

export async function addActionJob(
  candidateKind: ActionJobData['candidateKind'],
  candidateId: number,
  storeId: number,
  actionType: ActionJobData['actionType'],
  operatorId: string,
): Promise<Job<ActionJobData>> {
  const queue = getActionQueue();
  return queue.add(
    `action-${candidateKind}-${candidateId}`,
    createActionJobData(candidateKind, candidateId, storeId, actionType, operatorId),
  );
}

export async function closeQueue(): Promise<void> {
  if (inspectionQueue) {
    await inspectionQueue.close();
    inspectionQueue = null;
  }
  if (actionQueue) {
    await actionQueue.close();
    actionQueue = null;
  }
}

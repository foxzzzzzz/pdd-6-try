import { MetricsSnapshot } from '@pdd-inspector/core';
import type { AnomalyDetection } from '@pdd-inspector/core';

export function buildMetricInsertValues(
  metrics: MetricsSnapshot,
  inspectionId: number | null,
  anomaly?: AnomalyDetection | null,
) {
  return {
    ...metrics,
    inspectionId,
    anomalyFlags: anomaly?.isAnomaly ? JSON.stringify(anomaly.flags) : null,
    severity: anomaly?.isAnomaly ? anomaly.severity : 'normal',
  };
}

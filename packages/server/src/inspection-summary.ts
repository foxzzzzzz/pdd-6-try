type InspectionRow = {
  id: number;
  [key: string]: unknown;
};

type MetricsRow = {
  inspectionId: number | null;
  severity?: string | null;
  [key: string]: unknown;
};

export function mergeInspectionMetrics<TInspection extends InspectionRow, TMetrics extends MetricsRow>(
  inspections: TInspection[],
  metrics: TMetrics[],
) {
  const metricsByInspectionId = new Map<number, TMetrics>();
  for (const metric of metrics) {
    if (metric.inspectionId != null && !metricsByInspectionId.has(metric.inspectionId)) {
      metricsByInspectionId.set(metric.inspectionId, metric);
    }
  }

  return inspections.map((inspection) => {
    const metric = metricsByInspectionId.get(inspection.id) ?? null;
    return {
      ...inspection,
      metrics: metric,
      severity: metric?.severity ?? 'normal',
    };
  });
}

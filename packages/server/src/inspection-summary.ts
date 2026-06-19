type InspectionRow = {
  id: number;
  [key: string]: unknown;
};

type MetricsRow = {
  inspectionId: number | null;
  storeId?: number | null;
  date?: string | null;
  createdAt?: string | null;
  severity?: string | null;
  [key: string]: unknown;
};

export type TrendLabel = '上升' | '下降' | '平稳';

export type MetricTrendSummary = {
  disputeRefundRate: TrendLabel;
  platformInterventionRate: TrendLabel;
  qualityRefundRate: TrendLabel;
  averageRefundDuration: TrendLabel;
  commentScoreRank: TrendLabel;
  commentCount: TrendLabel;
};

export function mergeInspectionMetrics<TInspection extends InspectionRow, TMetrics extends MetricsRow>(
  inspections: TInspection[],
  metrics: TMetrics[],
) {
  const metricsByInspectionId = new Map<number, TMetrics>();
  const trendsByStoreId = buildTrendsByStoreId(metrics);
  for (const metric of metrics) {
    if (metric.inspectionId != null && !metricsByInspectionId.has(metric.inspectionId)) {
      metricsByInspectionId.set(metric.inspectionId, metric);
    }
  }

  return inspections.map((inspection) => {
    const metric = metricsByInspectionId.get(inspection.id) ?? null;
    const storeId = typeof metric?.storeId === 'number' ? metric.storeId : null;
    const metricTrends = storeId != null ? trendsByStoreId.get(storeId) : undefined;
    return {
      ...inspection,
      metrics: metric ? { ...metric, metricTrends } : metric,
      severity: metric?.severity ?? 'normal',
    };
  });
}

export function buildMetricTrendSummary(metrics: MetricsRow[]): MetricTrendSummary {
  return {
    disputeRefundRate: trendFor(metrics, 'disputeRefundRate', 0.001),
    platformInterventionRate: trendFor(metrics, 'platformInterventionRate', 0.001),
    qualityRefundRate: trendFor(metrics, 'qualityRefundRate', 0.001),
    averageRefundDuration: trendFor(metrics, 'averageRefundDuration', 0.1),
    commentScoreRank: trendFor(metrics, 'commentScoreRank', 0.001),
    commentCount: trendFor(metrics, 'commentCount', 1),
  };
}

function buildTrendsByStoreId<TMetrics extends MetricsRow>(metrics: TMetrics[]): Map<number, MetricTrendSummary> {
  const grouped = new Map<number, TMetrics[]>();
  for (const metric of metrics) {
    if (typeof metric.storeId !== 'number') continue;
    const group = grouped.get(metric.storeId) ?? [];
    group.push(metric);
    grouped.set(metric.storeId, group);
  }

  const result = new Map<number, MetricTrendSummary>();
  for (const [storeId, group] of grouped) {
    result.set(storeId, buildMetricTrendSummary(group));
  }
  return result;
}

function trendFor(metrics: MetricsRow[], key: string, threshold: number): TrendLabel {
  const values = metrics
    .slice()
    .sort(compareMetricTime)
    .map((metric) => metric[key])
    .filter((value): value is number => typeof value === 'number' && Number.isFinite(value));

  if (values.length < 2) return '平稳';
  const diff = values[values.length - 1] - values[0];
  if (Math.abs(diff) <= threshold) return '平稳';
  return diff > 0 ? '上升' : '下降';
}

function compareMetricTime(a: MetricsRow, b: MetricsRow): number {
  const aKey = `${a.date ?? ''} ${a.createdAt ?? ''}`;
  const bKey = `${b.date ?? ''} ${b.createdAt ?? ''}`;
  return aKey.localeCompare(bKey);
}

import { buildReportSummary } from './report-summary';
import { createHash } from 'crypto';

type StoreRow = {
  id: number;
  name: string;
  status?: string | null;
};

type InspectionRow = {
  id: number;
  storeId: number;
  date: string;
  status: string;
  duration?: number | null;
  completionRate?: number | null;
  summary?: string | null;
  createdAt?: string | null;
};

type MetricRow = {
  id: number;
  storeId: number;
  inspectionId?: number | null;
  date: string;
  rating?: number | null;
  defectRate?: number | null;
  expBasic?: number | null;
  severity?: string | null;
  anomalyFlags?: string | null;
  createdAt?: string | null;
};

type IssueRow = {
  id: number;
  storeId: number;
  createdAt?: string | null;
  rectificationStatus?: string | null;
};

type ReportInput = {
  stores: StoreRow[];
  inspections: InspectionRow[];
  metrics: MetricRow[];
  issues: IssueRow[];
};

type DailyReportInput = ReportInput & { date: string };
type PeriodReportInput = ReportInput & { today: string };

type StoreReportRow = {
  storeId: number;
  storeName: string;
  status?: string | null;
  inspections: number;
  dataPoints?: number;
  latestRating: number | null;
  ratingTrend?: string;
  latestDefectRate: number | null;
  defectTrend?: string;
  latestExpBasic: number | null;
  latestInspectionSummary: string | null;
  anomalyFlags?: string | null;
  issueCount: number;
  resolvedIssues?: number;
  severity: string;
  duration?: number | null;
  completionRate?: number | null;
  avgRating?: number | null;
  avgDefectRate?: number | null;
  weeklyTrend?: Array<{
    week: string;
    avgRating: number | null;
    avgDefectRate: number | null;
  }>;
};

type ReportResult = {
  period?: string;
  materialized?: {
    id?: number;
    status: string;
    source: 'database' | 'generated';
    sourceHash?: string | null;
    generatedAt?: string | null;
    reviewedAt?: string | null;
    publishedAt?: string | null;
  };
  summary: {
    period?: string;
    totalStores?: number;
    anomalyStores?: number;
    totalIssues?: number;
    avgRating?: number | null;
    overview?: string;
    attentionStores?: Array<{ name: string; reason: string }>;
    recommendations?: string[];
    source?: 'template';
    generated?: {
      overview: string;
      attentionStores: Array<{ name: string; reason: string }>;
      recommendations: string[];
      source: 'template';
    };
  };
  stores: StoreReportRow[];
};

type DailyReportRow = {
  id?: number;
  date: string;
  status: string;
  summary: string;
  stores: string;
  sourceHash?: string | null;
  generatedAt?: string | null;
  reviewedAt?: string | null;
  publishedAt?: string | null;
};

export type SerializedDailyReport = {
  date: string;
  status: string;
  summary: string;
  stores: string;
  sourceHash?: string;
  generatedAt: string;
  reviewedAt?: string;
  publishedAt?: string;
};

export function buildDailyReport(input: DailyReportInput): ReportResult {
  const start = input.date;
  const end = addDays(input.date, 1);
  const periodInspections = input.inspections.filter((inspection) => inDateRange(inspection.date, start, end));
  const periodMetrics = input.metrics.filter((metric) => inDateRange(metric.date, start, end));
  const periodIssues = input.issues.filter((issue) => inDateTimeRange(issue.createdAt, start, end));
  const stores = input.stores
    .map((store) => buildStoreReport(store, periodInspections, periodMetrics, periodIssues))
    .filter((store): store is StoreReportRow => store != null);

  return {
    materialized: {
      status: 'generated',
      source: 'generated',
      sourceHash: buildDailyReportSourceHash(input),
      generatedAt: new Date().toISOString(),
    },
    summary: {
      period: start,
      totalStores: stores.length,
      anomalyStores: stores.filter((store) => store.severity !== 'normal').length,
      totalIssues: stores.reduce((sum, store) => sum + store.issueCount, 0),
      generated: buildReportSummary(start, stores),
    },
    stores,
  };
}

export function canMaterializeDailyReport(input: DailyReportInput): boolean {
  const stores = input.stores.filter((store) => store.status == null || store.status === 'active');
  if (stores.length === 0) return false;
  const end = addDays(input.date, 1);
  const inspections = input.inspections.filter((inspection) => inDateRange(inspection.date, input.date, end));
  return stores.every((store) => {
    const latest = sortedInspections(inspections.filter((inspection) => inspection.storeId === store.id))[0];
    return latest && ['completed', 'failed', 'partial'].includes(latest.status);
  });
}

export function buildDailyReportSourceHash(input: DailyReportInput): string {
  const end = addDays(input.date, 1);
  const payload = {
    date: input.date,
    stores: input.stores.map((store) => [store.id, store.name, store.status ?? null]).sort(),
    inspections: input.inspections
      .filter((inspection) => inDateRange(inspection.date, input.date, end))
      .map((inspection) => [inspection.id, inspection.storeId, inspection.status, inspection.createdAt ?? null])
      .sort(),
    metrics: input.metrics
      .filter((metric) => inDateRange(metric.date, input.date, end))
      .map((metric) => [metric.id, metric.storeId, metric.inspectionId ?? null, metric.createdAt ?? null])
      .sort(),
    issues: input.issues
      .filter((issue) => inDateTimeRange(issue.createdAt, input.date, end))
      .map((issue) => [issue.id, issue.storeId, issue.rectificationStatus ?? null, issue.createdAt ?? null])
      .sort(),
  };
  return createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

export function serializeDailyReport(date: string, report: ReportResult): SerializedDailyReport {
  return {
    date,
    status: report.materialized?.status || 'generated',
    summary: JSON.stringify(report.summary),
    stores: JSON.stringify(report.stores),
    sourceHash: report.materialized?.sourceHash || undefined,
    generatedAt: new Date().toISOString(),
  };
}

export function parseMaterializedDailyReport(row: DailyReportRow): ReportResult {
  return {
    materialized: {
      id: row.id,
      status: row.status,
      source: 'database',
      sourceHash: row.sourceHash ?? null,
      generatedAt: row.generatedAt ?? null,
      reviewedAt: row.reviewedAt ?? null,
      publishedAt: row.publishedAt ?? null,
    },
    summary: JSON.parse(row.summary),
    stores: JSON.parse(row.stores),
  };
}

export function buildWeeklyReport(input: PeriodReportInput): ReportResult {
  const start = addDays(input.today, -6);
  const end = addDays(input.today, 1);
  const period = `${start} ~ ${input.today}`;
  const periodInspections = input.inspections.filter((inspection) => inDateRange(inspection.date, start, end));
  const periodMetrics = input.metrics.filter((metric) => inDateRange(metric.date, start, end));
  const periodIssues = input.issues.filter((issue) => inDateTimeRange(issue.createdAt, start, end));
  const stores = input.stores
    .map((store) => buildStoreReport(store, periodInspections, periodMetrics, periodIssues, { countMetricsAsInspections: true }))
    .filter((store): store is StoreReportRow => store != null)
    .map((store) => {
      const metrics = sortedMetrics(periodMetrics.filter((metric) => metric.storeId === store.storeId));
      return {
        ...store,
        ratingTrend: trendLabel(calcTrend(metrics.map((metric) => metric.rating).filter(isNumber))),
        defectTrend: defectTrendLabel(calcTrend(metrics.map((metric) => metric.defectRate).filter(isNumber))),
        resolvedIssues: periodIssues.filter((issue) => (
          issue.storeId === store.storeId
          && (issue.rectificationStatus === 'resolved' || issue.rectificationStatus === 'closed')
        )).length,
      };
    });

  return {
    summary: {
      period,
      totalStores: stores.length,
      anomalyStores: stores.filter((store) => store.severity !== 'normal').length,
      avgRating: avg(stores.map((store) => store.latestRating).filter(isNumber)),
      totalIssues: stores.reduce((sum, store) => sum + store.issueCount, 0),
      generated: buildReportSummary(period, stores),
    },
    stores,
  };
}

export function buildMonthlyReport(input: PeriodReportInput): ReportResult {
  const start = addDays(input.today, -29);
  const end = addDays(input.today, 1);
  const period = `${start} ~ ${input.today}`;
  const periodInspections = input.inspections.filter((inspection) => inDateRange(inspection.date, start, end));
  const periodMetrics = input.metrics.filter((metric) => inDateRange(metric.date, start, end));
  const periodIssues = input.issues.filter((issue) => inDateTimeRange(issue.createdAt, start, end));
  const maybeStores: Array<StoreReportRow | null> = input.stores
    .map((store): StoreReportRow | null => {
      const base = buildStoreReport(store, periodInspections, periodMetrics, periodIssues, { countMetricsAsInspections: true });
      if (!base) return null;
      const metrics = sortedMetrics(periodMetrics.filter((metric) => metric.storeId === store.id));
      return {
        ...base,
        dataPoints: metrics.length,
        avgRating: avg(metrics.map((metric) => metric.rating).filter(isNumber)),
        avgDefectRate: avg(metrics.map((metric) => metric.defectRate).filter(isNumber)),
        weeklyTrend: splitByCalendarWeek(metrics).map((weekMetrics) => ({
          week: `${weekMetrics[weekMetrics.length - 1]?.date || '?'} ~ ${weekMetrics[0]?.date || '?'}`,
          avgRating: avg(weekMetrics.map((metric) => metric.rating).filter(isNumber)),
          avgDefectRate: avg(weekMetrics.map((metric) => metric.defectRate).filter(isNumber)),
        })),
      };
    });
  const stores = maybeStores.filter((store): store is StoreReportRow => store != null);

  return {
    period,
    summary: {
      ...buildReportSummary(period, stores),
      generated: buildReportSummary(period, stores),
    },
    stores,
  };
}

function buildStoreReport(
  store: StoreRow,
  inspections: InspectionRow[],
  metrics: MetricRow[],
  issues: IssueRow[],
  options: { countMetricsAsInspections?: boolean } = {},
): StoreReportRow | null {
  const storeInspections = sortedInspections(inspections.filter((inspection) => inspection.storeId === store.id));
  const storeMetrics = sortedMetrics(metrics.filter((metric) => metric.storeId === store.id));
  if (storeInspections.length === 0 && storeMetrics.length === 0) return null;

  const latestInspection = storeInspections[0] ?? null;
  const latestMetric = findMetricForInspection(storeMetrics, latestInspection) ?? storeMetrics[0] ?? null;
  const storeIssues = issues.filter((issue) => issue.storeId === store.id);
  const status = latestInspection?.status ?? null;

  return {
    storeId: store.id,
    storeName: store.name,
    status,
    inspections: options.countMetricsAsInspections ? storeMetrics.length : storeInspections.length,
    latestRating: latestMetric?.rating ?? null,
    latestDefectRate: latestMetric?.defectRate ?? null,
    latestExpBasic: latestMetric?.expBasic ?? null,
    latestInspectionSummary: latestInspection?.summary || null,
    anomalyFlags: latestMetric?.anomalyFlags ?? null,
    issueCount: storeIssues.length,
    severity: latestMetric?.severity || severityFromStatus(status),
    duration: latestInspection?.duration ?? null,
    completionRate: latestInspection?.completionRate ?? null,
  };
}

function findMetricForInspection(metrics: MetricRow[], inspection: InspectionRow | null): MetricRow | null {
  if (!inspection) return null;
  return metrics.find((metric) => metric.inspectionId === inspection.id) ?? null;
}

function sortedInspections(inspections: InspectionRow[]): InspectionRow[] {
  return [...inspections].sort((a, b) => compareLatest(a.date, a.createdAt, a.id, b.date, b.createdAt, b.id));
}

function sortedMetrics(metrics: MetricRow[]): MetricRow[] {
  return [...metrics].sort((a, b) => compareLatest(a.date, a.createdAt, a.id, b.date, b.createdAt, b.id));
}

function compareLatest(aDate: string, aCreated: string | null | undefined, aId: number, bDate: string, bCreated: string | null | undefined, bId: number): number {
  const dateCompare = bDate.localeCompare(aDate);
  if (dateCompare !== 0) return dateCompare;
  const createdCompare = normalizeDateTime(bCreated).localeCompare(normalizeDateTime(aCreated));
  if (createdCompare !== 0) return createdCompare;
  return bId - aId;
}

function inDateRange(date: string | null | undefined, start: string, endExclusive: string): boolean {
  return Boolean(date && date >= start && date < endExclusive);
}

function inDateTimeRange(dateTime: string | null | undefined, start: string, endExclusive: string): boolean {
  const date = dateTime?.slice(0, 10);
  return inDateRange(date, start, endExclusive);
}

function addDays(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function normalizeDateTime(value: string | null | undefined): string {
  return value || '';
}

function calcTrend(values: number[]): number {
  if (values.length < 2) return 0;
  return values[0] - values[values.length - 1];
}

function trendLabel(value: number): string {
  return value > 0 ? 'up' : value < 0 ? 'down' : 'flat';
}

function defectTrendLabel(value: number): string {
  return value > 0 ? 'up(worse)' : value < 0 ? 'down(better)' : 'flat';
}

function avg(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function isNumber(value: number | null | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function splitByCalendarWeek(metrics: MetricRow[]): MetricRow[][] {
  const groups = new Map<string, MetricRow[]>();
  for (const metric of metrics) {
    const key = weekKey(metric.date);
    const group = groups.get(key) ?? [];
    group.push(metric);
    groups.set(key, group);
  }
  return [...groups.values()].map(sortedMetrics);
}

function weekKey(date: string): string {
  const value = new Date(`${date}T00:00:00.000Z`);
  const day = value.getUTCDay() || 7;
  value.setUTCDate(value.getUTCDate() - day + 1);
  return value.toISOString().slice(0, 10);
}

function severityFromStatus(status: string | null): string {
  if (status === 'failed') return 'critical';
  if (status === 'partial') return 'warning';
  return 'normal';
}

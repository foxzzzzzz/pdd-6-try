export type ReportStoreSummary = {
  storeId?: number;
  storeName: string;
  severity?: string | null;
  inspections?: number;
  latestRating?: number | null;
  latestExpBasic?: number | null;
  latestDefectRate?: number | string | null;
  issueCount?: number;
  latestInspectionSummary?: string | null;
  anomalyFlags?: string | null;
};

export type GeneratedReportSummary = {
  overview: string;
  attentionStores: Array<{ name: string; reason: string }>;
  recommendations: string[];
  source: 'template';
};

function shortReason(store: ReportStoreSummary): string {
  if (store.anomalyFlags) {
    try {
      const flags = JSON.parse(store.anomalyFlags);
      if (Array.isArray(flags) && flags.length > 0) {
        return `检测到${flags.length}个异常指标`;
      }
    } catch { /* ignore */ }
  }
  return store.latestInspectionSummary
    ? store.latestInspectionSummary.substring(0, 60) + '...'
    : `severity=${store.severity}`;
}

export function buildReportSummary(period: string, stores: ReportStoreSummary[]): GeneratedReportSummary {
  const attentionStores = stores
    .filter((store) => store.severity && store.severity !== 'normal')
    .map((store) => ({
      name: store.storeName,
      reason: shortReason(store),
    }));

  const totalIssues = stores.reduce((sum, store) => sum + (store.issueCount || 0), 0);
  const avgRating = average(stores.map((store) => store.latestRating));
  const avgExperience = average(stores.map((store) => store.latestExpBasic));
  const avgDefectRate = average(stores.map((store) => store.latestDefectRate));

  const overviewParts = [
    `${period}巡店覆盖${stores.length}家店`,
  ];
  if (attentionStores.length > 0) {
    overviewParts.push(`${attentionStores.length}家需关注`);
  } else {
    overviewParts.push('全部正常');
  }
  if (avgRating != null) overviewParts.push(`均星${avgRating.toFixed(2)}`);

  const recommendations: string[] = [];
  for (const store of stores.filter(s => s.severity && s.severity !== 'normal').slice(0, 3)) {
    const flags = store.anomalyFlags ? tryParseFlags(store.anomalyFlags) : [];
    if (flags.length > 0) {
      recommendations.push(`${store.storeName}：${flags.slice(0, 2).join('；')}`);
    } else {
      recommendations.push(`${store.storeName}：${shortReason(store)}`);
    }
  }
  if (recommendations.length === 0) {
    recommendations.push('本周期暂无异常店铺');
  }

  return {
    overview: `${overviewParts.join('，')}。`,
    attentionStores,
    recommendations,
    source: 'template',
  };
}

function tryParseFlags(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function average(values: Array<number | string | null | undefined>): number | null {
  const nums = values
    .map((value) => {
      if (typeof value === 'number') return value;
      if (typeof value !== 'string') return null;
      const normalized = value.trim().endsWith('%')
        ? Number(value.trim().slice(0, -1)) / 100
        : Number(value);
      return Number.isFinite(normalized) ? normalized : null;
    })
    .filter((value): value is number => value != null);
  if (nums.length === 0) return null;
  return nums.reduce((sum, value) => sum + value, 0) / nums.length;
}

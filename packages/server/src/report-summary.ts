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
};

export type GeneratedReportSummary = {
  overview: string;
  attentionStores: Array<{ name: string; reason: string }>;
  recommendations: string[];
  source: 'template';
};

export function buildReportSummary(period: string, stores: ReportStoreSummary[]): GeneratedReportSummary {
  const attentionStores = stores
    .filter((store) => store.severity && store.severity !== 'normal')
    .map((store) => ({
      name: store.storeName,
      reason: store.latestInspectionSummary || `severity=${store.severity}`,
    }));

  const totalIssues = stores.reduce((sum, store) => sum + (store.issueCount || 0), 0);
  const avgRating = average(stores.map((store) => store.latestRating));
  const avgExperience = average(stores.map((store) => store.latestExpBasic));
  const avgDefectRate = average(stores.map((store) => store.latestDefectRate));

  const overviewParts = [
    `${period}巡店覆盖${stores.length}家店`,
    `需关注${attentionStores.length}家`,
    `问题${totalIssues}项`,
  ];
  if (avgRating != null) overviewParts.push(`平均星级${avgRating.toFixed(2)}`);
  if (avgExperience != null) overviewParts.push(`平均体验分${avgExperience.toFixed(2)}`);
  if (avgDefectRate != null) overviewParts.push(`平均劣质率${(avgDefectRate * 100).toFixed(2)}%`);

  const recommendations = attentionStores.length > 0
    ? attentionStores.slice(0, 3).map((store) => `优先复盘${store.name}：${store.reason}`)
    : ['本周期暂无异常店铺，保持巡店节奏并关注核心指标波动。'];

  return {
    overview: `${overviewParts.join('，')}。`,
    attentionStores,
    recommendations,
    source: 'template',
  };
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

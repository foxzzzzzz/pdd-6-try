import React, { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../api';
import AnomalyText from '../components/AnomalyText';

type AttentionStore = {
  name: string;
  reason: string;
};

type GeneratedSummary = {
  overview?: string;
  attentionStores?: AttentionStore[];
  recommendations?: string[];
  source?: string;
};

type DailyReportData = {
  materialized?: {
    status?: string;
    source?: string;
    sourceHash?: string | null;
    generatedAt?: string | null;
    reviewedAt?: string | null;
    publishedAt?: string | null;
  };
  summary?: {
    period?: string;
    totalStores?: number;
    anomalyStores?: number;
    totalIssues?: number;
    generated?: GeneratedSummary;
    overview?: string;
    attentionStores?: AttentionStore[];
    recommendations?: string[];
  };
  stores?: Array<{
    storeId: number;
    storeName: string;
    severity: string;
    latestRating?: number | null;
    latestDefectRate?: number | null;
    latestInspectionSummary?: string | null;
    issueCount?: number;
  }>;
};

const statusLabels: Record<string, string> = {
  generated: '已生成',
  reviewed: '已审核',
  published: '已发布',
};

const severityLabels: Record<string, string> = {
  normal: '正常',
  warning: '预警',
  critical: '异常',
};

export default function DailyReport() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [date, setDate] = useState(searchParams.get('date') || todayLocalDate());
  const [report, setReport] = useState<DailyReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setSearchParams(date === todayLocalDate() ? {} : { date });
    loadReport(date);
  }, [date]);

  async function loadReport(nextDate: string) {
    setLoading(true);
    setError(null);
    try {
      setReport(await api.getDailyReport(nextDate));
    } catch (err: any) {
      setError(err.message || '日报加载失败');
      setReport(null);
    } finally {
      setLoading(false);
    }
  }

  const generated = useMemo(() => {
    const summary = report?.summary;
    return summary?.generated || {
      overview: summary?.overview,
      attentionStores: summary?.attentionStores,
      recommendations: summary?.recommendations,
    };
  }, [report]);

  const attentionStores = generated?.attentionStores || [];
  const recommendations = generated?.recommendations || [];
  const materialized = report?.materialized;
  const stores = report?.stores || [];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="text-sm text-gray-500">日报</p>
          <h2 className="text-2xl font-bold text-gray-800">拼多多巡店日报</h2>
          <p className="mt-1 text-sm text-gray-500">按日期查看已归档日报；未归档时展示当前数据动态生成版本。</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <input
            type="date"
            value={date}
            onChange={(event) => setDate(event.target.value)}
            className="rounded border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700"
          />
          <a
            href={`/api/reports/daily?date=${encodeURIComponent(date)}`}
            className="rounded border border-gray-300 bg-white px-3 py-2 text-sm text-gray-600 hover:bg-gray-50"
          >
            查看 JSON
          </a>
        </div>
      </div>

      {error ? (
        <div className="rounded border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>
      ) : null}

      {loading ? (
        <div className="rounded border bg-white p-8 text-center text-sm text-gray-400">加载日报中...</div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
            <StatCard label="日期" value={report?.summary?.period || date} />
            <StatCard label="归档状态" value={statusLabels[materialized?.status || ''] || '动态生成'} />
            <StatCard label="店铺数" value={String(report?.summary?.totalStores ?? stores.length)} />
            <StatCard label="需关注" value={String(report?.summary?.anomalyStores ?? attentionStores.length)} tone="warning" />
            <StatCard label="问题数" value={String(report?.summary?.totalIssues ?? 0)} tone="danger" />
          </div>

          <section className="rounded border bg-white p-5">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-800">总体摘要</h3>
              <StatusPill status={materialized?.status} source={materialized?.source} />
            </div>
            <p className="text-sm leading-7 text-gray-700">
              {generated?.overview || '暂无日报摘要，完成巡店后会自动生成。'}
            </p>
            <div className="mt-4 grid gap-2 text-xs text-gray-500 md:grid-cols-3">
              <MetaItem label="生成时间" value={formatDateTime(materialized?.generatedAt)} />
              <MetaItem label="审核时间" value={formatDateTime(materialized?.reviewedAt)} />
              <MetaItem label="发布时间" value={formatDateTime(materialized?.publishedAt)} />
            </div>
          </section>

          <div className="grid gap-4 lg:grid-cols-2">
            <section className="rounded border bg-white p-5">
              <h3 className="mb-4 text-lg font-semibold text-gray-800">关注店铺</h3>
              {attentionStores.length > 0 ? (
                <div className="space-y-3">
                  {attentionStores.map((store, index) => (
                    <div key={`${store.name}-${index}`} className="rounded border border-orange-100 bg-orange-50 p-3">
                      <div className="font-medium text-gray-800">{store.name}</div>
                      <div className="mt-1"><AnomalyText text={store.reason} /></div>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState text="暂无需要重点关注的店铺。" />
              )}
            </section>

            <section className="rounded border bg-white p-5">
              <h3 className="mb-4 text-lg font-semibold text-gray-800">建议事项</h3>
              {recommendations.length > 0 ? (
                <ol className="space-y-3">
                  {recommendations.map((item, index) => (
                    <li key={index} className="flex gap-3 text-sm leading-6 text-gray-700">
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-50 text-xs font-semibold text-blue-700">
                        {index + 1}
                      </span>
                      <AnomalyText text={item} />
                    </li>
                  ))}
                </ol>
              ) : (
                <EmptyState text="暂无建议事项。" />
              )}
            </section>
          </div>

          <section className="rounded border bg-white">
            <div className="border-b px-5 py-4">
              <h3 className="text-lg font-semibold text-gray-800">店铺明细</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50 text-left text-gray-500">
                  <tr>
                    <th className="px-5 py-3 font-medium">店铺</th>
                    <th className="px-5 py-3 font-medium">状态</th>
                    <th className="px-5 py-3 font-medium">星级</th>
                    <th className="px-5 py-3 font-medium">劣质率</th>
                    <th className="px-5 py-3 font-medium">问题数</th>
                    <th className="px-5 py-3 font-medium">摘要</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {stores.map((store) => (
                    <tr key={store.storeId} className="hover:bg-gray-50">
                      <td className="px-5 py-3">
                        <Link to={`/stores/${store.storeId}`} className="font-medium text-blue-700 hover:text-blue-800">
                          {store.storeName}
                        </Link>
                      </td>
                      <td className="px-5 py-3">
                        <SeverityBadge severity={store.severity} />
                      </td>
                      <td className="px-5 py-3 text-gray-700">{formatNumber(store.latestRating)}</td>
                      <td className="px-5 py-3 text-gray-700">{formatPercent(store.latestDefectRate)}</td>
                      <td className="px-5 py-3 text-gray-700">{store.issueCount ?? 0}</td>
                      <td className="max-w-md px-5 py-3">{store.latestInspectionSummary ? <AnomalyText text={store.latestInspectionSummary} /> : '-'}</td>
                    </tr>
                  ))}
                  {stores.length === 0 ? (
                    <tr>
                      <td colSpan={6}>
                        <EmptyState text="该日期暂无日报明细。" />
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}

function StatCard({ label, value, tone = 'default' }: { label: string; value: string; tone?: 'default' | 'warning' | 'danger' }) {
  const toneClass = {
    default: 'text-gray-900',
    warning: 'text-orange-700',
    danger: 'text-red-700',
  }[tone];
  return (
    <div className="rounded border bg-white p-4">
      <div className="text-xs text-gray-500">{label}</div>
      <div className={`mt-2 text-xl font-semibold ${toneClass}`}>{value}</div>
    </div>
  );
}

function StatusPill({ status, source }: { status?: string; source?: string }) {
  const isArchived = source === 'database';
  return (
    <span className={`rounded px-2 py-1 text-xs font-medium ${isArchived ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
      {isArchived ? `归档：${statusLabels[status || ''] || status || '已生成'}` : '未归档：动态生成'}
    </span>
  );
}

function MetaItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className="text-gray-400">{label}：</span>
      <span>{value}</span>
    </div>
  );
}

function SeverityBadge({ severity }: { severity: string }) {
  const className = severity === 'critical'
    ? 'bg-red-100 text-red-700'
    : severity === 'warning'
      ? 'bg-orange-100 text-orange-700'
      : 'bg-green-100 text-green-700';
  return <span className={`rounded px-2 py-1 text-xs font-medium ${className}`}>{severityLabels[severity] || severity}</span>;
}

function EmptyState({ text }: { text: string }) {
  return <div className="p-6 text-center text-sm text-gray-400">{text}</div>;
}

function todayLocalDate(): string {
  const now = new Date();
  const offset = now.getTimezoneOffset();
  return new Date(now.getTime() - offset * 60_000).toISOString().slice(0, 10);
}

function formatDateTime(value?: string | null): string {
  if (!value) return '-';
  return new Date(value).toLocaleString();
}

function formatNumber(value?: number | null): string {
  return typeof value === 'number' && Number.isFinite(value) ? value.toFixed(2) : '-';
}

function formatPercent(value?: number | null): string {
  return typeof value === 'number' && Number.isFinite(value) ? `${(value * 100).toFixed(2)}%` : '-';
}

import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Calendar, TrendingUp, AlertTriangle, Star } from 'lucide-react';
import { api } from '../api';
import AnomalyText from '../components/AnomalyText';

export default function WeeklyReport() {
  return <PeriodReport title="周报" subtitle="近7天巡店数据汇总" fetcher={api.getWeeklyReport} />;
}

export function MonthlyReport() {
  return <PeriodReport title="月报" subtitle="近30天巡店数据汇总" fetcher={api.getMonthlyReport} />;
}

type SummaryData = {
  period?: string;
  totalStores?: number;
  anomalyStores?: number;
  avgRating?: number;
  totalIssues?: number;
  generated?: {
    overview?: string;
    attentionStores?: { name: string; reason: string }[];
    recommendations?: string[];
  };
};

type StoreData = {
  storeId: number;
  storeName: string;
  status: string;
  inspections: number;
  latestRating?: number | null;
  latestDefectRate?: number | null;
  latestExpBasic?: number | null;
  issueCount: number;
  severity: string;
};

function PeriodReport({ title, subtitle, fetcher }: {
  title: string;
  subtitle: string;
  fetcher: () => Promise<any>;
}) {
  const [data, setData] = useState<{ summary: SummaryData; stores: StoreData[] } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetcher()
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, []);

  const raw = data?.summary;
  const summary = raw?.generated || raw;
  const stores = (data?.stores || []) as StoreData[];
  const attentionStores = (summary as any)?.attentionStores || [];
  const recommendations = (summary as any)?.recommendations || [];
  const period = (raw?.period || '') as string;

  if (loading) return (
    <div className="flex items-center justify-center py-20">
      <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-blue-600" />
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-2">
        <p className="text-sm text-slate-500">{subtitle}</p>
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-bold text-slate-900">{title}</h2>
        </div>
        {period ? (
          <p className="flex items-center gap-1.5 text-sm text-slate-400">
            <Calendar size={14} /> {period}
          </p>
        ) : null}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard label="覆盖店铺" value={data?.summary?.totalStores ?? stores.length} icon={TrendingUp} />
        <StatCard label="需关注" value={data?.summary?.anomalyStores ?? attentionStores.length} icon={AlertTriangle} tone="warning" />
        <StatCard label="均星" value={data?.summary?.avgRating?.toFixed(2) ?? '-'} icon={Star} tone="amber" />
      </div>

      {/* Overview */}
      <section className="rounded-lg border border-slate-200 bg-white p-5">
        <h3 className="mb-3 font-semibold text-slate-800">总体摘要</h3>
        <p className="text-sm leading-7 text-slate-700">{(summary as any)?.overview || '暂无数据'}</p>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Attention Stores */}
        <section className="rounded-lg border border-slate-200 bg-white p-5">
          <h3 className="mb-4 font-semibold text-slate-800">关注店铺</h3>
          {attentionStores.length > 0 ? (
            <div className="space-y-3">
              {attentionStores.map((store: any, i: number) => (
                <div key={`${store.name}-${i}`} className="rounded-lg border border-orange-100 bg-orange-50 p-3">
                  <Link to={`/stores/${stores.find(s => s.storeName === store.name)?.storeId || ''}`}
                    className="font-medium text-slate-800 hover:text-blue-600 transition-colors">
                    {store.name}
                  </Link>
                  <div className="mt-1"><AnomalyText text={store.reason} /></div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-slate-400">无异常店铺</p>
          )}
        </section>

        {/* Recommendations */}
        <section className="rounded-lg border border-slate-200 bg-white p-5">
          <h3 className="mb-4 font-semibold text-slate-800">建议事项</h3>
          {recommendations.length > 0 ? (
            <ol className="space-y-3">
              {recommendations.map((item: any, i: number) => (
                <li key={i} className="flex gap-3 text-sm leading-6 text-slate-700">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-50 text-xs font-semibold text-blue-700">
                    {i + 1}
                  </span>
                  <AnomalyText text={item} />
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-sm text-slate-400">暂无建议事项</p>
          )}
        </section>
      </div>

      {/* Store Table */}
      <section className="rounded-lg border border-slate-200 bg-white">
        <div className="border-b border-slate-100 px-5 py-4">
          <h3 className="font-semibold text-slate-800">店铺明细</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-slate-500">
                <th className="px-5 py-3 font-medium">店铺</th>
                <th className="px-5 py-3 font-medium">巡店次数</th>
                <th className="px-5 py-3 font-medium">星级</th>
                <th className="px-5 py-3 font-medium">劣质率</th>
                <th className="px-5 py-3 font-medium">体验分</th>
                <th className="px-5 py-3 font-medium">状态</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {stores.map((store) => (
                <tr key={store.storeId} className="hover:bg-slate-50 transition-colors">
                  <td className="px-5 py-3 font-medium text-slate-800">
                    <Link to={`/stores/${store.storeId}`} className="hover:text-blue-600 transition-colors">
                      {store.storeName}
                    </Link>
                  </td>
                  <td className="px-5 py-3 text-slate-600">{store.inspections}</td>
                  <td className="px-5 py-3 text-slate-600">{store.latestRating?.toFixed(2) ?? '-'}</td>
                  <td className="px-5 py-3 text-slate-600">{store.latestDefectRate != null ? (store.latestDefectRate * 100).toFixed(2) + '%' : '-'}</td>
                  <td className="px-5 py-3 text-slate-600">{store.latestExpBasic?.toFixed(2) ?? '-'}</td>
                  <td className="px-5 py-3">
                    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${
                      store.severity === 'critical' ? 'bg-red-50 text-red-700' :
                      store.severity === 'warning' ? 'bg-amber-50 text-amber-700' :
                      'bg-emerald-50 text-emerald-700'
                    }`}>
                      <span className={`h-1.5 w-1.5 rounded-full ${
                        store.severity === 'critical' ? 'bg-red-500' :
                        store.severity === 'warning' ? 'bg-amber-500' : 'bg-emerald-500'
                      }`} />
                      {store.severity === 'critical' ? '异常' : store.severity === 'warning' ? '预警' : '正常'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function StatCard({ label, value, icon: Icon, tone = 'slate' }: {
  label: string; value: string | number; icon: React.ComponentType<{ size?: number; className?: string }>; tone?: string;
}) {
  const toneMap: Record<string, string> = {
    slate: 'text-slate-900', warning: 'text-amber-700', amber: 'text-amber-600',
  };
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="flex items-center gap-2 text-xs text-slate-500 mb-1">
        <Icon size={14} className="text-slate-400" /> {label}
      </div>
      <div className={`text-2xl font-bold ${toneMap[tone] || toneMap.slate}`}>{value}</div>
    </div>
  );
}

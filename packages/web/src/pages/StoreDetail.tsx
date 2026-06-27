import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, Star, ShieldAlert, TrendingUp, Clock, BarChart3, MessageSquare, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { api } from '../api';
import MetricsChart from '../components/MetricsChart';

function formatCST(utcStr: string): string {
  if (!utcStr) return '-';
  return new Date(utcStr + 'Z').toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false });
}

function parsePilotUnmetItems(value: unknown): any[] {
  if (typeof value !== 'string' || value.trim() === '') return [];
  try { const p = JSON.parse(value); return Array.isArray(p) ? p : []; } catch { return []; }
}

function formatPercent(value: unknown, digits = 2): string {
  return typeof value === 'number' && Number.isFinite(value) ? `${(value * 100).toFixed(digits)}%` : '-';
}

function formatSignedPercent(value: unknown, digits = 2): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '-';
  const percent = value * 100;
  return `${percent > 0 ? '+' : ''}${percent.toFixed(digits)}%`;
}

function formatScore(value: unknown, suffix: string): string {
  return typeof value === 'number' && Number.isFinite(value) ? `${value.toFixed(2)} ${suffix}` : '-';
}

function formatSignedNumber(value: unknown, suffix: string): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '-';
  return `${value > 0 ? '+' : ''}${value.toFixed(2)} ${suffix}`;
}

function formatHours(value: unknown): string {
  return typeof value === 'number' && Number.isFinite(value) ? `${value.toFixed(2)}小时` : '-';
}

function formatMinutes(value: unknown): string {
  return typeof value === 'number' && Number.isFinite(value) ? `${value.toFixed(2)}分钟` : '-';
}

function formatInteger(value: unknown): string {
  return typeof value === 'number' && Number.isFinite(value) ? String(Math.trunc(value)) : '-';
}

function formatCurrency(value: unknown): string {
  return typeof value === 'number' && Number.isFinite(value) ? `${value.toFixed(2)}元` : '-';
}

export default function StoreDetail() {
  const { id } = useParams<{ id: string }>();
  const [store, setStore] = useState<any>(null);
  const [inspections, setInspections] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    Promise.all([
      api.getStore(parseInt(id)),
      api.getInspections({ storeId: parseInt(id), limit: 30 }),
    ]).then(([s, ins]) => { setStore(s); setInspections(ins as any[]); }).finally(() => setLoading(false));
  }, [id]);

  if (loading) return (
    <div className="flex items-center justify-center py-20">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
    </div>
  );
  if (!store) return <div className="text-center py-20 text-red-500">店铺不存在</div>;

  const latest = inspections[0];
  const metrics = latest?.metrics || {};
  const unmetItems = parsePilotUnmetItems(metrics?.pilotUnmetItems);
  const evaluationRank = metrics.commentScoreRank ?? metrics.reviewScoreRank;
  const trends = metrics.metricTrends || {};
  const riskStatus = unmetItems.length > 0 || metrics.severity === 'critical' || metrics.severity === 'warning'
    ? '存在风险'
    : '正常';

  return (
    <div>
      <Link to="/" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 transition-colors mb-4 focus:outline-none focus:ring-2 focus:ring-blue-500 rounded">
        <ArrowLeft size={16} /> 返回总览
      </Link>

      {/* Store Header */}
      <div className="bg-white rounded-lg border border-slate-200 p-6 mb-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-slate-900">{store.name}</h2>
            <p className="text-sm text-slate-500 mt-1">标识: {store.pddStoreId}{store.factory ? ` · ${store.factory}` : ''}</p>
          </div>
          <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-medium ${
            store.status === 'active' ? 'bg-emerald-50 text-emerald-700' :
            store.status === 'pending_login' ? 'bg-amber-50 text-amber-700' :
            'bg-slate-100 text-slate-600'
          }`}>
            <span className={`w-2 h-2 rounded-full ${
              store.status === 'active' ? 'bg-emerald-500' :
              store.status === 'pending_login' ? 'bg-amber-500' : 'bg-slate-300'
            }`} />
            {store.status === 'active' ? '运行中' : store.status === 'pending_login' ? '待登录' : '已暂停'}
          </span>
        </div>
      </div>

      <Section title="综合体验星级" icon={Star}>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
          <MetricBox label="店铺综合体验星级" value={formatScore(metrics.rating, '星')} icon={Star} color="amber" />
          <MetricBox label="星级变化" value={formatSignedNumber(metrics.ratingChange, '星')} icon={TrendingUp} color="slate" />
          <MetricBox label="领航员综合分行业排名" value={metrics.pilotIndustryRank != null ? `前 ${formatPercent(metrics.pilotIndustryRank)}` : '-'} icon={TrendingUp} color="blue" />
          <MetricBox label="异常预警" value={riskStatus} icon={riskStatus === '正常' ? CheckCircle2 : AlertTriangle} color={riskStatus === '正常' ? 'green' : 'amber'} />
        </div>

        <div className={`mt-5 rounded-lg border ${unmetItems.length > 0 ? 'border-amber-200 bg-amber-50/40' : 'border-emerald-200 bg-emerald-50/40'} p-4`}>
          <div className="mb-3 flex items-center gap-2 font-semibold text-slate-800">
            {unmetItems.length > 0 ? <AlertTriangle size={18} className="text-amber-500" /> : <CheckCircle2 size={18} className="text-emerald-600" />}
            领航员未达标项
          </div>
          {unmetItems.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-slate-500">
                  <th className="pb-2 font-medium">维度</th>
                  <th className="pb-2 font-medium">考核指标</th>
                  <th className="pb-2 font-medium">店铺表现</th>
                  <th className="pb-2 font-medium">下一星级标准</th>
                </tr>
              </thead>
              <tbody>
                {unmetItems.map((item: any, i: number) => (
                  <tr key={i} className="border-b border-slate-100 last:border-0">
                    <td className="py-2 text-slate-700">{item.dimension}</td>
                    <td className="py-2 text-slate-700">{item.metric}</td>
                    <td className="py-2 text-red-600 font-medium">{item.currentValue}</td>
                    <td className="py-2 text-slate-500">{item.nextLevelStandard || item.targetValue || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          ) : (
            <div className="text-sm text-emerald-700">暂无未达标项</div>
          )}
        </div>
      </Section>

      <Section title="售后数据" icon={ShieldAlert}>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
          <MetricBox label="纠纷退款率" value={formatPercent(metrics.disputeRefundRate ?? metrics.disputeRate)} icon={ShieldAlert} color="red" trend={trends.disputeRefundRate} />
          <MetricBox label="平台介入率" value={formatPercent(metrics.platformInterventionRate)} icon={AlertTriangle} color="amber" trend={trends.platformInterventionRate} />
          <MetricBox label="品质退款率" value={formatPercent(metrics.qualityRefundRate)} icon={ShieldAlert} color="red" trend={trends.qualityRefundRate} />
          <MetricBox label="平均退款时长" value={formatHours(metrics.averageRefundDuration)} icon={Clock} color="slate" trend={trends.averageRefundDuration} />
        </div>
        <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
          <SmallMetric label="纠纷退款数" value={formatInteger(metrics.disputeRefundCount)} />
          <SmallMetric label="介入订单数" value={formatInteger(metrics.interventionOrderCount)} />
          <SmallMetric label="成功退款订单数" value={formatInteger(metrics.successfulRefundOrderCount)} />
          <SmallMetric label="成功退款金额" value={formatCurrency(metrics.successfulRefundAmount)} />
        </div>
      </Section>

      <Section title="评价数据 & 客服数据" icon={MessageSquare}>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
          <MetricBox label="店铺评价分排名" value={evaluationRank != null ? `前 ${formatPercent(evaluationRank)}` : '-'} detail={`较前一天 ${formatSignedPercent(metrics.commentScoreRankChange)}`} icon={MessageSquare} color="blue" trend={trends.commentScoreRank} />
          <MetricBox label="评价条数" value={formatInteger(metrics.commentCount)} icon={BarChart3} color="slate" trend={trends.commentCount} />
          <MetricBox label="3分钟人工回复率" value={formatPercent(metrics.customerThreeMinuteReplyRate)} icon={Clock} color="blue" />
          <MetricBox label="平均人工响应时长" value={formatMinutes(metrics.customerAvgResponseMinutes)} icon={Clock} color="slate" />
        </div>
      </Section>

      <Section title="消费者体验指标" icon={BarChart3}>
        <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
          <ExpDetail label="消费者服务体验分" value={metrics.expBasic} change={metrics.expBasicChange} />
          <ExpDetail label="服务态度体验分" value={metrics.expAttitude} change={metrics.expAttitudeChange} />
          <ExpDetail label="基础服务体验分" value={metrics.expServiceBasic} change={metrics.expServiceBasicChange} />
          <ExpDetail label="商品服务体验分" value={metrics.expProduct} change={metrics.expProductChange} />
          <ExpDetail label="发货服务体验分" value={metrics.expShipping} change={metrics.expShippingChange} />
          <ExpDetail label="物流服务体验分" value={metrics.expLogistics} change={metrics.expLogisticsChange} />
        </div>
      </Section>

      {/* Trend Chart */}
      <div className="bg-white rounded-lg border border-slate-200 p-6 mb-6">
        <h3 className="font-semibold text-slate-800 mb-4 flex items-center gap-2">
          <TrendingUp size={18} className="text-blue-500" /> 指标趋势 (近30天)
        </h3>
        <MetricsChart inspections={inspections} />
      </div>

      {/* Recent Inspections */}
      <div className="bg-white rounded-lg border border-slate-200 p-6">
        <h3 className="font-semibold text-slate-800 mb-4 flex items-center gap-2">
          <Clock size={18} className="text-slate-500" /> 最近巡店记录
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-slate-500">
                <th className="pb-2 font-medium">时间日期</th>
                <th className="pb-2 font-medium">状态</th>
                <th className="pb-2 font-medium">完成率</th>
                <th className="pb-2 font-medium">耗时</th>
              </tr>
            </thead>
            <tbody>
              {inspections.slice(0, 10).map((ins: any) => (
                <tr key={ins.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50 transition-colors">
                  <td className="py-2.5 text-xs text-slate-600">{formatCST(ins.createdAt || ins.date)}</td>
                  <td className="py-2.5">
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${
                      ins.status === 'completed' ? 'bg-emerald-50 text-emerald-700' :
                      ins.status === 'partial' ? 'bg-amber-50 text-amber-700' :
                      ins.status === 'failed' ? 'bg-red-50 text-red-700' :
                      'bg-slate-100 text-slate-600'
                    }`}>{ins.status}</span>
                  </td>
                  <td className="py-2.5 text-slate-600">{ins.completionRate ? Math.round(ins.completionRate * 100) + '%' : '-'}</td>
                  <td className="py-2.5 text-slate-600">{ins.duration ? ins.duration + 's' : '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function Section({ title, icon: Icon, children }: { title: string; icon: React.ComponentType<{size?:number; className?:string}>; children: React.ReactNode }) {
  return (
    <section className="bg-white rounded-lg border border-slate-200 p-6 mb-6">
      <h3 className="font-semibold text-slate-800 mb-4 flex items-center gap-2">
        <Icon size={18} className="text-blue-500" /> {title}
      </h3>
      {children}
    </section>
  );
}

function MetricBox({ label, value, icon: Icon, color, trend, detail }: { label: string; value: string; icon: React.ComponentType<{size?:number; className?:string}>; color: string; trend?: string | null; detail?: string | null }) {
  const colors: Record<string, string> = {
    blue: 'text-blue-500 bg-blue-50', amber: 'text-amber-500 bg-amber-50',
    red: 'text-red-500 bg-red-50', slate: 'text-slate-500 bg-slate-100',
    green: 'text-emerald-600 bg-emerald-50',
  };
  return (
    <div className="bg-white rounded-lg border border-slate-200 p-4 hover:shadow-sm transition-shadow duration-150">
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className={`p-1.5 rounded-md ${colors[color] || colors.slate}`}>
            <Icon size={14} />
          </div>
          <span className="text-xs text-slate-500">{label}</span>
        </div>
        {trend && <TrendBadge trend={trend} />}
      </div>
      <div className="text-lg font-bold text-slate-900">{value}</div>
      {detail && <div className="mt-1 text-xs text-slate-500">{detail}</div>}
    </div>
  );
}

function TrendBadge({ trend }: { trend: string }) {
  const color = trend === '上升'
    ? 'bg-red-50 text-red-600'
    : trend === '下降'
      ? 'bg-emerald-50 text-emerald-700'
      : 'bg-slate-100 text-slate-600';
  return <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${color}`}>{trend}</span>;
}

function SmallMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-slate-50 px-3 py-2">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="mt-1 font-semibold text-slate-800">{value}</div>
    </div>
  );
}

function ExpDetail({ label, value, change }: { label: string; value: number | null; change: number | null }) {
  const isUp = change != null && change > 0;
  const isDown = change != null && change < 0;
  return (
    <div className="text-center p-3 bg-slate-50 rounded-lg">
      <div className="text-xs text-slate-500 mb-1">{label}</div>
      <div className="text-lg font-bold text-slate-900">{value == null ? '-' : Number(value).toFixed(2)}</div>
      {change != null && (
        <div className={`text-xs mt-0.5 font-medium ${isUp ? 'text-red-500' : isDown ? 'text-emerald-600' : 'text-slate-400'}`}>
          {formatSignedPercent(change)}
        </div>
      )}
    </div>
  );
}

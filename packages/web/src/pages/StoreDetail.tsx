import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, Star, ShieldAlert, TrendingUp, Truck, Clock, BarChart3, MessageSquare, AlertTriangle, CheckCircle2 } from 'lucide-react';
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
            <p className="text-sm text-slate-500 mt-1">ID: {store.pddStoreId}{store.factory ? ` · ${store.factory}` : ''}</p>
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

      {/* Metrics Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <MetricBox label="店铺星级" value={metrics.rating ? `${Number(metrics.rating).toFixed(2)} 星` : '-'} icon={Star} color="amber" />
        <MetricBox label="劣质率" value={metrics.defectRate != null ? `${(metrics.defectRate * 100).toFixed(2)}%` : '-'} icon={ShieldAlert} color="red" />
        <MetricBox label="消费者体验分" value={metrics.expBasic ? `${Number(metrics.expBasic).toFixed(2)}/5` : '-'} icon={BarChart3} color="blue" />
        <MetricBox label="行业排名" value={metrics.pilotIndustryRank ? `前 ${Number(metrics.pilotIndustryRank).toFixed(2)}%` : metrics.dsrRankChange || '-'} icon={TrendingUp} color="slate" />
        <MetricBox label="评价得分排名" value={metrics.reviewScoreRank != null ? `前 ${Number(metrics.reviewScoreRank).toFixed(2)}%` : '-'} icon={MessageSquare} color="slate" />
        <MetricBox label="3分钟回复率" value={metrics.threeMinuteReplyRate != null ? `${Number(metrics.threeMinuteReplyRate).toFixed(2)}%` : '-'} icon={Clock} color="slate" />
        <MetricBox label="签收时效" value={metrics.groupToSignDuration != null ? `${Number(metrics.groupToSignDuration).toFixed(2)}天` : '-'} icon={Truck} color="slate" />
        <MetricBox label="平均退款时长" value={metrics.averageRefundDuration != null ? `${Number(metrics.averageRefundDuration).toFixed(2)}h` : '-'} icon={Clock} color="slate" />
      </div>

      {/* Consumer Experience Detail */}
      {metrics.expBasic != null && (
        <div className="bg-white rounded-lg border border-slate-200 p-6 mb-6">
          <h3 className="font-semibold text-slate-800 mb-4 flex items-center gap-2">
            <BarChart3 size={18} className="text-blue-500" /> 消费者体验指标
          </h3>
          <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
            <ExpDetail label="总分" value={metrics.expBasic} change={metrics.expBasicChange} />
            <ExpDetail label="基础服务" value={metrics.expServiceBasic} change={metrics.expServiceBasicChange} />
            <ExpDetail label="服务态度" value={metrics.expAttitude} change={metrics.expAttitudeChange} />
            <ExpDetail label="商品服务" value={metrics.expProduct} change={metrics.expProductChange} />
            <ExpDetail label="发货服务" value={metrics.expShipping} change={metrics.expShippingChange} />
            <ExpDetail label="物流服务" value={metrics.expLogistics} change={metrics.expLogisticsChange} />
          </div>
        </div>
      )}

      {/* Pilot Unmet Items */}
      {unmetItems.length > 0 && (
        <div className="bg-white rounded-lg border border-amber-200 p-6 mb-6">
          <h3 className="font-semibold text-slate-800 mb-4 flex items-center gap-2">
            <AlertTriangle size={18} className="text-amber-500" /> 领航员未达标项
          </h3>
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
                    <td className="py-2 text-slate-500">{item.targetValue}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

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

function MetricBox({ label, value, icon: Icon, color }: { label: string; value: string; icon: React.ComponentType<{size?:number; className?:string}>; color: string }) {
  const colors: Record<string, string> = {
    blue: 'text-blue-500 bg-blue-50', amber: 'text-amber-500 bg-amber-50',
    red: 'text-red-500 bg-red-50', slate: 'text-slate-500 bg-slate-100',
  };
  return (
    <div className="bg-white rounded-lg border border-slate-200 p-4 hover:shadow-sm transition-shadow duration-150">
      <div className="flex items-center gap-2 mb-2">
        <div className={`p-1.5 rounded-md ${colors[color] || colors.slate}`}>
          <Icon size={14} />
        </div>
        <span className="text-xs text-slate-500">{label}</span>
      </div>
      <div className="text-lg font-bold text-slate-900">{value}</div>
    </div>
  );
}

function ExpDetail({ label, value, change }: { label: string; value: number | null; change: number | null }) {
  if (value == null) return null;
  const isUp = change != null && change > 0;
  const isDown = change != null && change < 0;
  return (
    <div className="text-center p-3 bg-slate-50 rounded-lg">
      <div className="text-xs text-slate-500 mb-1">{label}</div>
      <div className="text-lg font-bold text-slate-900">{Number(value).toFixed(2)}</div>
      {change != null && (
        <div className={`text-xs mt-0.5 font-medium ${isUp ? 'text-emerald-600' : isDown ? 'text-red-500' : 'text-slate-400'}`}>
          {isUp ? '+' : ''}{Number(change).toFixed(2)}%
        </div>
      )}
    </div>
  );
}

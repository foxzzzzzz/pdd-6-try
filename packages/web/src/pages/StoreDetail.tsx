import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api } from '../api';
import MetricsChart from '../components/MetricsChart';

function formatCST(utcStr: string): string {
  if (!utcStr) return '-';
  return new Date(utcStr + 'Z').toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false });
}

function parsePilotUnmetItems(value: unknown): any[] {
  if (typeof value !== 'string' || value.trim() === '') return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
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
    ]).then(([s, ins]) => {
      setStore(s); setInspections(ins as any[]);
    }).finally(() => setLoading(false));
  }, [id]);

  if (loading) return <div className="text-center py-20 text-gray-400">加载中...</div>;
  if (!store) return <div className="text-center py-20 text-red-400">店铺不存在</div>;

  const latest = inspections[0];
  const metrics = latest?.metrics || {};
  const metricTrends = metrics.metricTrends || {};
  const pilotUnmetItems = parsePilotUnmetItems(metrics.pilotUnmetItems);

  return (
    <div>
      <Link to="/" className="text-blue-500 text-sm mb-4 inline-block">← 返回总览</Link>

      {/* Store Header */}
      <div className="bg-white rounded-lg border p-6 mb-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-gray-800">{store.name}</h2>
            <p className="text-sm text-gray-500">ID: {store.pddStoreId} · {store.factory || '未关联工厂'}</p>
          </div>
          <span className={`px-3 py-1 rounded-full text-sm font-medium ${
            store.status === 'active' ? 'bg-green-100 text-green-700' :
            store.status === 'pending_login' ? 'bg-yellow-100 text-yellow-700' :
            'bg-gray-100 text-gray-600'
          }`}>
            {store.status === 'active' ? '运行中' : store.status === 'pending_login' ? '待登录' : '已暂停'}
          </span>
        </div>
      </div>

      {latest?.summary ? (
        <div className="bg-white rounded-lg border p-5 mb-6">
          <h3 className="font-semibold text-gray-800 mb-2">巡店摘要</h3>
          <p className="text-sm text-gray-700 leading-6">{latest.summary}</p>
        </div>
      ) : null}

      {/* Metrics Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <MetricBox label="店铺星级" value={metrics.rating || '-'} unit="星" />
        <MetricBox label="劣质率" value={metrics.defectRate != null ? (metrics.defectRate * 100).toFixed(1) + '%' : '-'} />
        <MetricBox label="消费者体验分" value={metrics.expBasic || '-'} unit="/5" />
        <MetricBox label="行业排名" value={metrics.dsrRankChange || '-'} />
        <MetricBox label="描述相符" value={metrics.dsrDesc || '-'} />
        <MetricBox label="服务态度" value={metrics.dsrService || '-'} />
        <MetricBox label="物流服务" value={metrics.dsrLogistics || '-'} />
        <MetricBox label="退款时长" value={metrics.refundDuration || '-'} unit="h" />
      </div>

      <div className="mb-6">
        <h3 className="font-semibold text-gray-700 mb-4">消费者体验指标</h3>
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
          <ExperienceMetricBox label="消费者服务体验分" value={metrics.expBasic} change={metrics.expBasicChange} />
          <ExperienceMetricBox label="基础服务体验分" value={metrics.expServiceBasic} change={metrics.expServiceBasicChange} />
          <ExperienceMetricBox label="服务态度体验分" value={metrics.expAttitude} change={metrics.expAttitudeChange} />
          <ExperienceMetricBox label="商品服务体验分" value={metrics.expProduct} change={metrics.expProductChange} />
          <ExperienceMetricBox label="发货服务体验分" value={metrics.expShipping} change={metrics.expShippingChange} />
          <ExperienceMetricBox label="物流服务体验分" value={metrics.expLogistics} change={metrics.expLogisticsChange} />
        </div>
      </div>

      {pilotUnmetItems.length > 0 ? (
        <div className="bg-white rounded-lg border p-6 mb-6">
          <h3 className="font-semibold text-gray-700 mb-4">领航员未达标项</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500 border-b">
                  <th className="pb-2">维度</th>
                  <th className="pb-2">考核指标</th>
                  <th className="pb-2">店铺表现</th>
                  <th className="pb-2">状态</th>
                  <th className="pb-2">下一星级标准</th>
                </tr>
              </thead>
              <tbody>
                {pilotUnmetItems.map((item: any, index: number) => (
                  <tr key={`${item.dimension}-${item.metric}-${index}`} className="border-b last:border-0">
                    <td className="py-2 font-medium text-gray-700">{item.dimension}</td>
                    <td className="py-2 text-gray-700">{item.metric}</td>
                    <td className="py-2">{item.currentValue || '-'}</td>
                    <td className="py-2">
                      <span className="px-2 py-0.5 rounded text-xs bg-red-100 text-red-700">未达标</span>
                    </td>
                    <td className="py-2 text-gray-600">{item.nextLevelStandard || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      <div className="mb-6">
        <h3 className="font-semibold text-gray-700 mb-4">售后重点指标</h3>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
          <CoreMetricBox label="纠纷退款率" value={formatPercent(metrics.disputeRefundRate ?? metrics.disputeRate)} />
          <CoreMetricBox label="平台介入率" value={formatPercent(metrics.platformInterventionRate)} />
          <CoreMetricBox label="品质退款率" value={formatPercent(metrics.qualityRefundRate)} />
          <CoreMetricBox label="平均退款时长" value={formatNumber(metrics.averageRefundDuration ?? metrics.refundDuration)} unit="h" />
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
          <MetricBox label="纠纷退款率趋势" value={formatTrend(metricTrends.disputeRefundRate)} />
          <MetricBox label="平台介入率趋势" value={formatTrend(metricTrends.platformInterventionRate)} />
          <MetricBox label="品质退款率趋势" value={formatTrend(metricTrends.qualityRefundRate)} />
          <MetricBox label="平均退款时长趋势" value={formatTrend(metricTrends.averageRefundDuration)} />
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <MetricBox label="纠纷退款数" value={formatNumber(metrics.disputeRefundCount)} />
          <MetricBox label="介入订单数" value={formatNumber(metrics.interventionOrderCount)} />
          <MetricBox label="成功退款订单数" value={formatNumber(metrics.successfulRefundOrderCount)} />
          <MetricBox label="成功退款金额" value={formatMoney(metrics.successfulRefundAmount)} />
          <MetricBox label="成功退款率" value={formatPercent(metrics.successfulRefundRate ?? metrics.refundRate)} />
          <MetricBox label="退货退款自主完结时长" value={formatNumber(metrics.returnRefundAutoDuration)} unit="h" />
          <MetricBox label="退款自主完结时长" value={formatNumber(metrics.refundAutoDuration)} unit="h" />
        </div>
      </div>

      <div className="mb-6">
        <h3 className="font-semibold text-gray-700 mb-4">评价数据</h3>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <CoreMetricBox label="店铺评价分排名" value={formatPercent(metrics.commentScoreRank)} />
          <MetricBox label="评价分排名变化" value={formatSignedPercent(metrics.commentScoreRankChange)} />
          <CoreMetricBox label="近30天评价数" value={formatNumber(metrics.commentCount)} />
          <MetricBox label="评价数变化" value={formatSignedPercent(metrics.commentCountChange)} />
          <MetricBox label="评价分排名趋势" value={formatTrend(metricTrends.commentScoreRank)} />
          <MetricBox label="评价数趋势" value={formatTrend(metricTrends.commentCount)} />
        </div>
      </div>

      {/* Trend Chart */}
      <div className="bg-white rounded-lg border p-6 mb-6">
        <h3 className="font-semibold text-gray-700 mb-4">📈 指标趋势 (近30天)</h3>
        <MetricsChart inspections={inspections} />
      </div>

      {/* Recent Inspections */}
      <div className="bg-white rounded-lg border p-6">
        <h3 className="font-semibold text-gray-700 mb-4">📋 最近巡店记录</h3>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-gray-500 border-b">
              <th className="pb-2">时间日期</th>
              <th className="pb-2">状态</th>
              <th className="pb-2">完成率</th>
              <th className="pb-2">耗时</th>
              <th className="pb-2">摘要</th>
            </tr>
          </thead>
          <tbody>
            {inspections.slice(0, 10).map((ins: any) => (
              <tr key={ins.id} className="border-b last:border-0">
                <td className="py-2 text-xs">{formatCST(ins.createdAt || ins.date)}</td>
                <td className="py-2">
                  <span className={`px-2 py-0.5 rounded text-xs ${
                    ins.status === 'completed' ? 'bg-green-100 text-green-700' :
                    ins.status === 'partial' ? 'bg-yellow-100 text-yellow-700' :
                    ins.status === 'failed' ? 'bg-red-100 text-red-700' :
                    'bg-gray-100 text-gray-600'
                  }`}>{ins.status}</span>
                </td>
                <td className="py-2">{ins.completionRate ? Math.round(ins.completionRate * 100) + '%' : '-'}</td>
                <td className="py-2">{ins.duration ? ins.duration + 's' : '-'}</td>
                <td className="py-2 text-gray-500 text-xs">{ins.summary || '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function formatNumber(value: number | string | null | undefined): string {
  if (value == null || value === '') return '-';
  return typeof value === 'number' ? String(value) : value;
}

function formatPercent(value: number | null | undefined): string {
  return value == null ? '-' : `${(value * 100).toFixed(2)}%`;
}

function formatSignedPercent(value: number | null | undefined): string {
  if (value == null) return '-';
  const sign = value > 0 ? '+' : '';
  return `${sign}${(value * 100).toFixed(2)}%`;
}

function formatTrend(value: string | null | undefined): string {
  return value || '-';
}

function formatMoney(value: number | null | undefined): string {
  return value == null ? '-' : `${value.toFixed(2)}元`;
}

function CoreMetricBox({ label, value, unit }: { label: string; value: React.ReactNode; unit?: string }) {
  return (
    <div className="bg-white rounded-lg border border-blue-200 p-4 shadow-sm">
      <div className="text-xs font-medium text-blue-600 mb-2">{label}</div>
      <div className="text-2xl font-bold text-gray-900">
        {value}{unit ? <span className="text-sm text-gray-400 ml-1">{unit}</span> : null}
      </div>
    </div>
  );
}

function ExperienceMetricBox({ label, value, change }: { label: string; value: number | null | undefined; change: number | null | undefined }) {
  return (
    <div className="bg-white rounded-lg border p-4">
      <div className="text-xs text-gray-500 mb-1">{label}</div>
      <div className="flex items-baseline gap-2">
        <span className="text-xl font-bold text-gray-800">{formatNumber(value)}</span>
        <span className={change != null && change < 0 ? 'text-sm text-red-600' : 'text-sm text-green-600'}>
          {formatSignedPercent(change)}
        </span>
      </div>
    </div>
  );
}

function MetricBox({ label, value, unit }: { label: string; value: React.ReactNode; unit?: string }) {
  return (
    <div className="bg-white rounded-lg border p-4">
      <div className="text-xs text-gray-500 mb-1">{label}</div>
      <div className="text-xl font-bold text-gray-800">
        {value}{unit ? <span className="text-sm text-gray-400 ml-1">{unit}</span> : null}
      </div>
    </div>
  );
}

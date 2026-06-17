import React, { useEffect, useState } from 'react';
import { api } from '../api';
import { Link } from 'react-router-dom';

interface StoreStatus {
  id: number; name: string; status: string; severity: string;
  metrics: Record<string, any>; lastInspection: any;
}

export default function Dashboard() {
  const [stores, setStores] = useState<StoreStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [inspecting, setInspecting] = useState(false);

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    try {
      const [storeList, inspections] = await Promise.all([
        api.getStores(),
        api.getInspections({ limit: 50 }),
      ]);

      // Merge latest inspection data with stores
      const merged: StoreStatus[] = storeList.map((s: any) => {
        const latest = (inspections as any[]).find((i: any) => i.storeId === s.id);
        return {
          id: s.id, name: s.name, status: s.status,
          severity: latest?.severity || 'normal',
          metrics: latest?.metrics || {},
          lastInspection: latest,
        };
      });
      setStores(merged);
    } catch (err) {
      console.error('Failed to load dashboard:', err);
    } finally {
      setLoading(false);
    }
  }

  async function handleInspectAll() {
    setInspecting(true);
    try {
      const result = await api.triggerInspectAll();
      alert(`已触发 ${result.totalStores} 家店铺巡店`);
      setTimeout(loadData, 5000); // Refresh after 5s
    } catch (err: any) {
      alert('触发失败: ' + err.message);
    } finally {
      setInspecting(false);
    }
  }

  const normal = stores.filter((s) => s.severity === 'normal');
  const warning = stores.filter((s) => s.severity === 'warning');
  const critical = stores.filter((s) => s.severity === 'critical');

  if (loading) return <div className="text-center py-20 text-gray-400">加载中...</div>;

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-800">📊 巡店总览</h2>
          <p className="text-sm text-gray-500 mt-1">
            {stores.length} 家店铺 · 最后更新: {new Date().toLocaleDateString()}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <a href="/api/reports/weekly" className="px-3 py-2 bg-white border rounded-lg text-sm text-gray-600 hover:bg-gray-50">📊 周报</a>
          <a href="/api/reports/monthly" className="px-3 py-2 bg-white border rounded-lg text-sm text-gray-600 hover:bg-gray-50">📈 月报</a>
          <a href="/api/issues/export" className="px-3 py-2 bg-white border rounded-lg text-sm text-gray-600 hover:bg-gray-50">📥 导出问题</a>
          <button
            onClick={handleInspectAll}
            disabled={inspecting}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 text-sm font-medium"
          >
            {inspecting ? '⏳ 触发中...' : '🚀 一键巡店'}
          </button>
        </div>
      </div>

      {/* Status Summary */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <SummaryCard color="green" label="正常" count={normal.length} />
        <SummaryCard color="orange" label="预警" count={warning.length} />
        <SummaryCard color="red" label="异常" count={critical.length} />
      </div>

      {/* Store Cards */}
      <div className="space-y-3">
        {stores.map((store) => (
          <Link
            key={store.id}
            to={`/stores/${store.id}`}
            className="block bg-white rounded-lg border hover:shadow-md transition-shadow"
          >
            <div className={`p-4 border-l-4 ${
              store.severity === 'critical' ? 'border-l-red-500' :
              store.severity === 'warning' ? 'border-l-orange-400' :
              'border-l-green-500'
            }`}>
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-semibold text-gray-800">{store.name}</h3>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {store.status === 'active' ? '🟢 运行中' :
                     store.status === 'pending_login' ? '🟡 待登录' : '⚫ 已暂停'}
                  </p>
                </div>
                <div className="flex items-center gap-4 text-sm">
                  {store.metrics?.rating && (
                    <span className="text-gray-600">⭐ {store.metrics.rating}</span>
                  )}
                  {store.metrics?.defectRate != null && (
                    <span className="text-gray-600">📦 劣质率 {(store.metrics.defectRate * 100).toFixed(1)}%</span>
                  )}
                  <SeverityBadge severity={store.severity} />
                </div>
              </div>
            </div>
          </Link>
        ))}
        {stores.length === 0 && (
          <div className="text-center py-10 text-gray-400">
            暂无店铺，请先<a href="/stores" className="text-blue-500">添加店铺</a>
          </div>
        )}
      </div>
    </div>
  );
}

function SummaryCard({ color, label, count }: { color: string; label: string; count: number }) {
  const bgMap: Record<string, string> = {
    green: 'bg-green-50 border-green-200',
    orange: 'bg-orange-50 border-orange-200',
    red: 'bg-red-50 border-red-200',
  };
  const textMap: Record<string, string> = {
    green: 'text-green-700',
    orange: 'text-orange-700',
    red: 'text-red-700',
  };
  return (
    <div className={`rounded-lg border p-4 ${bgMap[color]}`}>
      <div className={`text-2xl font-bold ${textMap[color]}`}>{count}</div>
      <div className="text-sm text-gray-600">{label}</div>
    </div>
  );
}

function SeverityBadge({ severity }: { severity: string }) {
  const map: Record<string, { bg: string; text: string; label: string }> = {
    normal: { bg: 'bg-green-100', text: 'text-green-700', label: '✅ 正常' },
    warning: { bg: 'bg-orange-100', text: 'text-orange-700', label: '⚠️ 预警' },
    critical: { bg: 'bg-red-100', text: 'text-red-700', label: '🔴 异常' },
  };
  const s = map[severity] || map.normal;
  return <span className={`px-2 py-1 rounded text-xs font-medium ${s.bg} ${s.text}`}>{s.label}</span>;
}

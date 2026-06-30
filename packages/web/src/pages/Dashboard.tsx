import React, { useEffect, useState } from 'react';
import { api } from '../api';
import { Link } from 'react-router-dom';
import { Play, TrendingUp, FileSpreadsheet, Download, CheckCircle2, AlertTriangle, AlertCircle, Star, Package, ChevronRight, ShieldAlert } from 'lucide-react';
import { formatAuditTime } from '../time';

interface StoreStatus {
  id: number; name: string; status: string; severity: string;
  metrics: Record<string, any>; lastInspection: any;
}

export default function Dashboard() {
  const [stores, setStores] = useState<StoreStatus[]>([]);
  const [reports, setReports] = useState<{ daily?: any; weekly?: any; monthly?: any }>({});
  const [riskStatus, setRiskStatus] = useState<any>(null);
  const [selectorHealth, setSelectorHealth] = useState<any>(null);
  const [ruleReviewStatus, setRuleReviewStatus] = useState<any>(null);
  const [browserStatus, setBrowserStatus] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [inspecting, setInspecting] = useState(false);

  useEffect(() => {
    loadData();
    const timer = window.setInterval(loadData, 10000);
    return () => window.clearInterval(timer);
  }, []);

  async function loadData() {
    try {
      const [storeList, inspections, dailyReport, weeklyReport, monthlyReport, risk, selectorHealthStatus, ruleReviews, browser] = await Promise.all([
        api.getStores(),
        api.getInspections({ limit: 50 }),
        api.getDailyReport().catch(() => null),
        api.getWeeklyReport().catch(() => null),
        api.getMonthlyReport().catch(() => null),
        api.getRiskStatus().catch(() => null),
        api.getSelectorHealthStatus().catch(() => null),
        api.getRuleReviewStatus().catch(() => null),
        api.getSystemBrowserStatus().catch(() => null),
      ]);
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
      setReports({ daily: dailyReport, weekly: weeklyReport, monthly: monthlyReport });
      setRiskStatus(risk);
      setSelectorHealth(selectorHealthStatus);
      setRuleReviewStatus(ruleReviews);
      setBrowserStatus(browser);
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
      setTimeout(loadData, 5000);
    } catch (err: any) {
      alert('触发失败: ' + err.message);
    } finally {
      setInspecting(false);
    }
  }

  const normal = stores.filter((s) => s.severity === 'normal');
  const warning = stores.filter((s) => s.severity === 'warning');
  const critical = stores.filter((s) => s.severity === 'critical');

  if (loading) return (
    <div className="flex items-center justify-center py-20">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
    </div>
  );

  return (
    <div>
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">巡店总览</h2>
          <p className="text-sm text-slate-500 mt-1">
            {stores.length} 家店铺 · {new Date().toLocaleDateString('zh-CN')}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link to="/reports/weekly" className="inline-flex items-center gap-1.5 px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm text-slate-600 hover:bg-slate-50 hover:border-slate-300 transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-blue-500">
            <TrendingUp size={16} /> 周报
          </Link>
          <Link to="/reports/monthly" className="inline-flex items-center gap-1.5 px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm text-slate-600 hover:bg-slate-50 hover:border-slate-300 transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-blue-500">
            <FileSpreadsheet size={16} /> 月报
          </Link>
          <a href="/api/issues/export" className="inline-flex items-center gap-1.5 px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm text-slate-600 hover:bg-slate-50 hover:border-slate-300 transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-blue-500">
            <Download size={16} /> 导出
          </a>
          <button
            onClick={handleInspectAll}
            disabled={inspecting || browserStatus?.ok === false}
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 shadow-sm"
          >
            <Play size={16} />
            {inspecting ? '触发中...' : '一键巡店'}
          </button>
        </div>
      </div>

      {browserStatus?.ok === false ? (
        <div className="mb-6 rounded-lg border border-red-200 bg-red-50 p-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div className="flex gap-3">
              <AlertCircle size={20} className="text-red-600" />
              <div>
                <h3 className="font-semibold text-red-800">当前机器没有安装 Chrome</h3>
                <p className="mt-1 text-sm text-red-700">
                  请先安装 Google Chrome，否则无法进行正常巡店。当前浏览器 channel：{browserStatus.channel || 'chrome'}。
                </p>
              </div>
            </div>
            <div className="text-xs text-red-700">安装完成后刷新页面，系统会自动重新检测。</div>
          </div>
        </div>
      ) : null}

      {riskStatus?.activeEvents?.length ? (
        <div className={`mb-6 rounded-lg border p-4 ${
          riskStatus.globalWritePaused ? 'border-red-200 bg-red-50' : 'border-amber-200 bg-amber-50'
        }`}>
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div className="flex gap-3">
              <ShieldAlert size={20} className={riskStatus.globalWritePaused ? 'text-red-600' : 'text-amber-600'} />
              <div>
                <h3 className={`font-semibold ${riskStatus.globalWritePaused ? 'text-red-800' : 'text-amber-800'}`}>
                  {riskStatus.globalWritePaused ? '全局写操作已熔断' : '存在店铺风控事件'}
                </h3>
                <p className={`mt-1 text-sm ${riskStatus.globalWritePaused ? 'text-red-700' : 'text-amber-700'}`}>
                  {riskStatus.globalWritePaused
                    ? '系统已暂停真实回复/举报/隐藏，请运营人工接管并处理安全提示。'
                    : `${riskStatus.activeEvents.length} 条风控事件待处理，请优先查看截图和 HTML 证据。`}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-slate-500">受影响店铺 {riskStatus.pausedStoreIds?.length || 0} 家</span>
              <Link
                to="/risk-events"
                className={`inline-flex items-center justify-center rounded-lg border bg-white px-3 py-2 text-xs font-medium transition-colors duration-150 focus:outline-none focus:ring-2 ${
                  riskStatus.globalWritePaused
                    ? 'border-red-200 text-red-700 hover:bg-red-100 focus:ring-red-500'
                    : 'border-amber-200 text-amber-700 hover:bg-amber-100 focus:ring-amber-500'
                }`}
              >
                查看处理
              </Link>
            </div>
          </div>
          <div className="mt-3 grid gap-2 md:grid-cols-2">
            {riskStatus.activeEvents.slice(0, 4).map((event: any) => (
              <div key={event.id} className="rounded border border-white/60 bg-white/70 px-3 py-2 text-xs text-slate-600">
                <div className="font-medium text-slate-800">{event.storeName || '全局'} · {event.eventType}</div>
                <div className="mt-1 line-clamp-2">{event.message}</div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {selectorHealth?.degradedCount ? (
        <div className="mb-6 rounded-lg border border-amber-200 bg-amber-50 p-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div className="flex gap-3">
              <AlertTriangle size={20} className="text-amber-600" />
              <div>
                <h3 className="font-semibold text-amber-800">页面采集健康异常</h3>
                <p className="mt-1 text-sm text-amber-700">
                  {selectorHealth.degradedCount} 个模块 selector smoke test 未通过；Worker 会暂停对应模块，避免采错或误操作。
                </p>
              </div>
            </div>
            <div className="text-xs text-amber-700">
              建议查看 smoke 报告、截图和 HTML 后再恢复模块。
            </div>
          </div>
          <div className="mt-3 grid gap-2 md:grid-cols-2">
            {selectorHealth.modules?.filter((item: any) => item.status === 'degraded').slice(0, 4).map((item: any) => (
              <div key={item.moduleKey} className="rounded border border-white/60 bg-white/70 px-3 py-2 text-xs text-slate-600">
                <div className="font-medium text-slate-800">{item.moduleName} · {Math.round((item.failureRate || 0) * 100)}% failed</div>
                <div className="mt-1">失败 {item.failedChecks}/{item.totalChecks} · {formatDateTime(item.createdAt)}</div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {ruleReviewStatus?.overdueCount ? (
        <div className="mb-6 rounded-lg border border-red-200 bg-red-50 p-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div className="flex gap-3">
              <ShieldAlert size={20} className="text-red-600" />
              <div>
                <h3 className="font-semibold text-red-800">规则复核已过期</h3>
                <p className="mt-1 text-sm text-red-700">
                  {ruleReviewStatus.overdueCount} 个规则复核项需要人工确认；举报/隐藏 real-run 将保持暂停。
                </p>
              </div>
            </div>
            <Link
              to="/rule-reviews"
              className="inline-flex items-center justify-center rounded-lg border border-red-200 bg-white px-3 py-2 text-xs font-medium text-red-700 transition-colors duration-150 hover:bg-red-100 focus:outline-none focus:ring-2 focus:ring-red-500"
            >
              去复核
            </Link>
          </div>
          <div className="mt-3 grid gap-2 md:grid-cols-2">
            {ruleReviewStatus.reviews?.filter((item: any) => item.status !== 'approved' || !item.nextReviewAt || new Date(item.nextReviewAt).getTime() < Date.now()).slice(0, 4).map((item: any) => (
              <div key={item.category} className="rounded border border-white/60 bg-white/70 px-3 py-2 text-xs text-slate-600">
                <div className="font-medium text-slate-800">{item.title}</div>
                <div className="mt-1">状态 {item.status} · 下次复核 {formatDateTime(item.nextReviewAt)}</div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {/* Status Summary */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <SummaryCard color="green" label="正常" count={normal.length} Icon={CheckCircle2} />
        <SummaryCard color="amber" label="预警" count={warning.length} Icon={AlertTriangle} />
        <SummaryCard color="red" label="异常" count={critical.length} Icon={AlertCircle} />
      </div>

      {/* Report Summaries */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
        <ReportSummaryCard title="日报" report={reports.daily?.summary} href="/reports/daily" />
        <ReportSummaryCard title="周报" report={reports.weekly?.summary} href="/reports/weekly" />
        <ReportSummaryCard title="月报" report={reports.monthly?.summary} href="/reports/monthly" />
      </div>

      {/* Store Cards */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wider">店铺列表</h3>
        {stores.map((store) => (
          <Link
            key={store.id}
            to={`/stores/${store.id}`}
            className="group block bg-white rounded-lg border border-slate-200 hover:border-slate-300 hover:shadow-md transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <div className={`p-4 border-l-4 rounded-l-lg ${
              store.severity === 'critical' ? 'border-l-red-500' :
              store.severity === 'warning' ? 'border-l-amber-500' :
              'border-l-emerald-500'
            }`}>
              <div className="flex items-center justify-between">
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-slate-900 truncate">{store.name}</h3>
                  <div className="flex items-center gap-2 mt-1">
                    <span className={`inline-flex items-center gap-1 text-xs ${
                      store.status === 'active' ? 'text-emerald-600' :
                      store.status === 'pending_login' ? 'text-amber-600' : 'text-slate-400'
                    }`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${
                        store.status === 'active' ? 'bg-emerald-500' :
                        store.status === 'pending_login' ? 'bg-amber-500' : 'bg-slate-300'
                      }`} />
                      {store.status === 'active' ? '运行中' :
                       store.status === 'pending_login' ? '待登录' : '已暂停'}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-6 text-sm">
                  {store.metrics?.rating && (
                    <span className="inline-flex items-center gap-1 text-slate-600">
                      <Star size={14} className="text-amber-400" />
                      {store.metrics.rating}
                    </span>
                  )}
                  {store.metrics?.defectRate != null && (
                    <span className="inline-flex items-center gap-1 text-slate-600">
                      <Package size={14} className="text-slate-400" />
                      {(store.metrics.defectRate * 100).toFixed(1)}%
                    </span>
                  )}
                  <SeverityBadge severity={store.severity} />
                  <ChevronRight size={16} className="text-slate-300 group-hover:text-slate-500 transition-colors" />
                </div>
              </div>
            </div>
          </Link>
        ))}
        {stores.length === 0 && (
          <div className="text-center py-12 text-slate-400 bg-white rounded-lg border border-dashed border-slate-200">
            <Package size={32} className="mx-auto mb-2 text-slate-300" />
            <p>暂无店铺，请先<a href="/stores" className="text-blue-500 hover:underline">添加店铺</a></p>
          </div>
        )}
      </div>
    </div>
  );
}

function ReportSummaryCard({ title, report, href }: { title: string; report: any; href: string }) {
  const isPageLink = href.startsWith('/') && !href.startsWith('/api/');
  const content = (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between mb-2">
        <h3 className="font-semibold text-slate-800 text-sm">{title}</h3>
        <ChevronRight size={14} className="text-slate-400 group-hover:text-slate-600 transition-colors" />
      </div>
      <p className="text-sm text-slate-600 leading-relaxed flex-1 line-clamp-3">
        {report?.overview || '暂无摘要，完成巡店后自动生成。'}
      </p>
      {report?.recommendations?.length ? (
        <div className="mt-3 pt-3 border-t border-slate-100 space-y-1">
          {report.recommendations.slice(0, 2).map((item: string, i: number) => (
            <p key={i} className="text-xs text-slate-400 truncate">{item}</p>
          ))}
        </div>
      ) : null}
    </div>
  );

  const className = "group block bg-white rounded-lg border border-slate-200 p-4 hover:border-slate-300 hover:shadow-md transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-blue-500";

  if (isPageLink) return <Link to={href} className={className}>{content}</Link>;
  return <a href={href} className={className}>{content}</a>;
}

function SummaryCard({ color, label, count, Icon }: { color: string; label: string; count: number; Icon: React.ComponentType<{size?:number; className?:string}> }) {
  const styles: Record<string, { bg: string; border: string; text: string; icon: string }> = {
    green: { bg: 'bg-emerald-50', border: 'border-emerald-200', text: 'text-emerald-700', icon: 'text-emerald-500' },
    amber: { bg: 'bg-amber-50', border: 'border-amber-200', text: 'text-amber-700', icon: 'text-amber-500' },
    red: { bg: 'bg-red-50', border: 'border-red-200', text: 'text-red-700', icon: 'text-red-500' },
  };
  const s = styles[color];
  return (
    <div className={`rounded-lg border ${s.bg} ${s.border} p-4`}>
      <div className="flex items-center gap-2 mb-1">
        <Icon size={18} className={s.icon} />
        <span className="text-xs font-medium text-slate-500 uppercase tracking-wide">{label}</span>
      </div>
      <div className={`text-2xl font-bold ${s.text}`}>{count}</div>
    </div>
  );
}

function SeverityBadge({ severity }: { severity: string }) {
  const map: Record<string, { bg: string; text: string; label: string }> = {
    normal: { bg: 'bg-emerald-50', text: 'text-emerald-700', label: '正常' },
    warning: { bg: 'bg-amber-50', text: 'text-amber-700', label: '预警' },
    critical: { bg: 'bg-red-50', text: 'text-red-700', label: '异常' },
  };
  const s = map[severity] || map.normal;
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium ${s.bg} ${s.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${
        severity === 'critical' ? 'bg-red-500' : severity === 'warning' ? 'bg-amber-500' : 'bg-emerald-500'
      }`} />
      {s.label}
    </span>
  );
}

function formatDateTime(value?: string | null) {
  return formatAuditTime(value);
}

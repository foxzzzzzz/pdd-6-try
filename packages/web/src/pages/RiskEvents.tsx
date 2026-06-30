import React, { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, ExternalLink, RefreshCw, ShieldAlert, Store, UserRound } from 'lucide-react';
import { Link } from 'react-router-dom';
import { api, type RiskEvent, type RiskStatus } from '../api';
import { formatAuditTime } from '../time';

export default function RiskEvents() {
  const [riskStatus, setRiskStatus] = useState<RiskStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [resolvingId, setResolvingId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadRiskEvents();
  }, []);

  async function loadRiskEvents() {
    setLoading(true);
    setError(null);
    try {
      setRiskStatus(await api.getRiskStatus());
    } catch (err: any) {
      setError(err.message || '加载风控事件失败');
    } finally {
      setLoading(false);
    }
  }

  async function resolveEvent(event: RiskEvent) {
    const confirmed = window.confirm('确认已人工处理该风控事件？此操作只会清除事件提醒，不会自动完成登录或解除平台侧安全验证。');
    if (!confirmed) return;
    setResolvingId(event.id);
    setError(null);
    try {
      await api.resolveRiskEvent(event.id);
      await loadRiskEvents();
    } catch (err: any) {
      setError(err.message || '标记风控事件失败');
    } finally {
      setResolvingId(null);
    }
  }

  const events = riskStatus?.activeEvents || [];
  const stats = useMemo(() => ({
    total: events.length,
    critical: events.filter((event) => event.severity === 'critical').length,
    login: events.filter((event) => event.eventType === 'login').length,
    stores: riskStatus?.pausedStoreIds.length || 0,
  }), [events, riskStatus]);

  if (loading) return (
    <div className="flex items-center justify-center py-20">
      <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-blue-600" />
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="text-sm text-slate-500">风控处理</p>
          <h2 className="text-2xl font-bold text-slate-900">风控事件</h2>
          <p className="mt-1 text-sm text-slate-500">
            查看登录、安全验证、操作频繁和真实写操作失败证据；人工处理后再标记已处理。
          </p>
        </div>
        <button
          onClick={loadRiskEvents}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 transition-colors duration-150 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <RefreshCw size={16} /> 刷新
        </button>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <SummaryCard label="待处理" value={stats.total} />
        <SummaryCard label="严重事件" value={stats.critical} tone="red" />
        <SummaryCard label="登录事件" value={stats.login} tone="amber" />
        <SummaryCard label="受影响店铺" value={stats.stores} tone="amber" />
      </div>

      {riskStatus?.globalWritePaused ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4">
          <div className="flex gap-3">
            <ShieldAlert size={20} className="mt-0.5 shrink-0 text-red-600" />
            <div>
              <h3 className="font-semibold text-red-800">全局写操作已熔断</h3>
              <p className="mt-1 text-sm text-red-700">
                请优先处理安全验证、操作频繁或权限类事件。原因：{riskStatus.globalReasons.join('、') || '-'}
              </p>
            </div>
          </div>
        </div>
      ) : null}

      {error ? <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div> : null}

      <section className="rounded-lg border border-slate-200 bg-white">
        <div className="flex items-center gap-2 border-b border-slate-100 px-5 py-4">
          <ShieldAlert size={16} className="text-slate-400" />
          <h3 className="font-semibold text-slate-800">事件列表</h3>
        </div>

        {events.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-400">
            <CheckCircle2 size={32} className="mx-auto mb-2 text-emerald-400" />
            当前没有待处理风控事件。
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {events.map((event) => (
              <div key={event.id} className="grid gap-5 p-5 lg:grid-cols-[minmax(0,1fr)_260px]">
                <div className="min-w-0">
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <span className={`rounded px-2 py-1 text-xs font-medium ${severityClass(event.severity)}`}>
                      {severityLabel(event.severity)}
                    </span>
                    <span className="rounded bg-slate-100 px-2 py-1 text-xs font-medium text-slate-600">
                      {eventTypeLabel(event.eventType)}
                    </span>
                    <span className="text-xs text-slate-400">{formatDateTime(event.createdAt)}</span>
                  </div>
                  <h4 className="font-semibold text-slate-900">{event.storeName || '全局'} · {event.eventType}</h4>
                  <p className="mt-2 text-sm leading-6 text-slate-700">{event.message}</p>

                  <div className="mt-3 flex flex-wrap gap-3 text-xs text-slate-500">
                    {event.storeId != null ? <span className="inline-flex items-center gap-1"><Store size={12} /> 店铺 {event.storeId}</span> : null}
                    {event.operatorId ? <span className="inline-flex items-center gap-1"><UserRound size={12} /> {event.operatorId}</span> : null}
                    {event.actionType ? <span>动作：{event.actionType}</span> : null}
                    {event.sourceType ? <span>来源：{event.sourceType}#{event.sourceId || '-'}</span> : null}
                  </div>

                  {event.eventType === 'login' ? (
                    <div className="mt-3 rounded-lg border border-amber-100 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-800">
                      登录类事件需要先回到店铺配置完成登录绑定；标记已处理只会清除这条提醒。
                    </div>
                  ) : null}
                </div>

                <div className="flex flex-col items-start gap-2 lg:items-end">
                  <div className="flex flex-wrap gap-2 lg:justify-end">
                    {event.screenshotPath ? (
                      <a
                        href={evidenceUrl(event.screenshotPath)}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        <ExternalLink size={14} /> 截图
                      </a>
                    ) : null}
                    {event.htmlPath ? (
                      <a
                        href={evidenceUrl(event.htmlPath)}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        <ExternalLink size={14} /> HTML
                      </a>
                    ) : null}
                  </div>
                  {event.eventType === 'login' ? (
                    <Link
                      to="/stores"
                      className="inline-flex items-center justify-center rounded-lg border border-amber-200 bg-white px-3 py-2 text-sm font-medium text-amber-700 hover:bg-amber-50 focus:outline-none focus:ring-2 focus:ring-amber-500"
                    >
                      去登录绑定
                    </Link>
                  ) : null}
                  <button
                    onClick={() => resolveEvent(event)}
                    disabled={resolvingId === event.id}
                    className="inline-flex items-center justify-center rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white transition-colors duration-150 hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                  >
                    {resolvingId === event.id ? '处理中...' : '标记已处理'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function SummaryCard({ label, value, tone = 'slate' }: { label: string; value: number; tone?: 'slate' | 'red' | 'amber' }) {
  const toneClass = {
    slate: 'text-slate-900',
    red: 'text-red-700',
    amber: 'text-amber-700',
  }[tone];
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="text-xs text-slate-500">{label}</div>
      <div className={`mt-2 text-2xl font-bold ${toneClass}`}>{value}</div>
    </div>
  );
}

function severityLabel(severity: string): string {
  return severity === 'critical' ? '严重' : '提醒';
}

function severityClass(severity: string): string {
  return severity === 'critical' ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-700';
}

function eventTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    login: '登录',
    security: '安全验证',
    rate_limit: '操作频繁',
    permission: '权限',
    action_failure: '写操作失败',
  };
  return labels[type] || type;
}

function evidenceUrl(filePath: string): string {
  return `/api/action-candidates/screenshot?path=${encodeURIComponent(filePath)}`;
}

function formatDateTime(value?: string | null) {
  return formatAuditTime(value);
}

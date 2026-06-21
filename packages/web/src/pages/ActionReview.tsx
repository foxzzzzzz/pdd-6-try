import React, { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, ExternalLink, Filter, SkipForward } from 'lucide-react';
import { api } from '../api';

type Candidate = {
  id: number;
  kind: 'review' | 'interaction';
  storeId: number;
  storeName?: string | null;
  sourceId?: string | null;
  content?: string | null;
  reviewStars?: number | null;
  actionType: 'reply' | 'report' | 'hide';
  suggestedPayload?: string | null;
  status: string;
  actionMode?: string | null;
  screenshotPath?: string | null;
  failureReason?: string | null;
  createdAt?: string | null;
};

const typeLabels: Record<string, string> = {
  reply: '好评回复',
  report: '差评举报',
  hide: '互动隐藏',
};

export default function ActionReview() {
  const [status, setStatus] = useState('pending_approval');
  const [type, setType] = useState('');
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [operatorId, setOperatorId] = useState(() => localStorage.getItem('pdd.operatorId') || '');

  useEffect(() => {
    loadCandidates();
  }, [status, type]);

  async function loadCandidates() {
    setLoading(true);
    setError(null);
    try {
      setCandidates(await api.getActionCandidates({ status, type: type || undefined }));
    } catch (err: any) {
      setError(err.message || '加载待确认动作失败');
    } finally {
      setLoading(false);
    }
  }

  async function approve(candidate: Candidate) {
    const currentOperatorId = requireOperatorId(operatorId);
    if (!currentOperatorId) return;
    localStorage.setItem('pdd.operatorId', currentOperatorId);
    await api.approveActionCandidate(candidate.kind, candidate.id, currentOperatorId);
    await loadCandidates();
  }

  async function skip(candidate: Candidate) {
    const currentOperatorId = requireOperatorId(operatorId);
    if (!currentOperatorId) return;
    localStorage.setItem('pdd.operatorId', currentOperatorId);
    await api.skipActionCandidate(candidate.kind, candidate.id, currentOperatorId);
    await loadCandidates();
  }

  const stats = useMemo(() => ({
    total: candidates.length,
    report: candidates.filter((item) => item.actionType === 'report').length,
    hide: candidates.filter((item) => item.actionType === 'hide').length,
    reply: candidates.filter((item) => item.actionType === 'reply').length,
  }), [candidates]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="text-sm text-slate-500">写操作审批</p>
          <h2 className="text-2xl font-bold text-slate-900">待确认动作</h2>
          <p className="mt-1 text-sm text-slate-500">举报和互动隐藏默认先确认后执行；好评回复按低风险策略受限放行。</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={operatorId}
            onChange={(event) => {
              setOperatorId(event.target.value);
              localStorage.setItem('pdd.operatorId', event.target.value.trim());
            }}
            placeholder="运营ID"
            className="w-36 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <select value={status} onChange={(event) => setStatus(event.target.value)}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
            <option value="pending_approval">待确认</option>
            <option value="approved">已确认</option>
            <option value="queued">已入队</option>
            <option value="running">执行中</option>
            <option value="skipped">已跳过</option>
            <option value="failed">执行失败</option>
            <option value="success">执行成功</option>
          </select>
          <select value={type} onChange={(event) => setType(event.target.value)}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
            <option value="">全部类型</option>
            <option value="reply">好评回复</option>
            <option value="report">差评举报</option>
            <option value="hide">互动隐藏</option>
          </select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="总数" value={stats.total} />
        <StatCard label="差评举报" value={stats.report} tone="red" />
        <StatCard label="互动隐藏" value={stats.hide} tone="amber" />
        <StatCard label="好评回复" value={stats.reply} tone="green" />
      </div>

      {error ? <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div> : null}

      <section className="rounded-lg border border-slate-200 bg-white">
        <div className="flex items-center gap-2 border-b border-slate-100 px-5 py-4">
          <Filter size={16} className="text-slate-400" />
          <h3 className="font-semibold text-slate-800">动作列表</h3>
        </div>
        {loading ? (
          <div className="p-8 text-center text-sm text-slate-400">加载中...</div>
        ) : candidates.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-400">暂无符合条件的动作。</div>
        ) : (
          <div className="divide-y divide-slate-100">
            {candidates.map((candidate) => (
              <div key={`${candidate.kind}-${candidate.id}`} className="grid gap-4 p-5 lg:grid-cols-[1fr_220px]">
                <div className="min-w-0">
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <span className="rounded bg-slate-100 px-2 py-1 text-xs font-medium text-slate-600">{candidate.storeName || `店铺 ${candidate.storeId}`}</span>
                    <span className={`rounded px-2 py-1 text-xs font-medium ${typeBadgeClass(candidate.actionType)}`}>{typeLabels[candidate.actionType] || candidate.actionType}</span>
                    {candidate.reviewStars ? <span className="text-xs text-amber-600">{candidate.reviewStars} 星</span> : null}
                    <span className="text-xs text-slate-400">{formatDateTime(candidate.createdAt)}</span>
                  </div>
                  <p className="line-clamp-3 text-sm leading-6 text-slate-700">{candidate.content || '-'}</p>
                  <div className="mt-3 rounded-lg bg-slate-50 p-3 text-xs leading-5 text-slate-500">
                    <span className="font-medium text-slate-600">建议：</span>
                    {candidate.suggestedPayload || '-'}
                  </div>
                  {candidate.failureReason ? <p className="mt-2 text-xs text-red-600">{candidate.failureReason}</p> : null}
                  {candidate.screenshotPath ? (
                    <a href={candidate.screenshotPath} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700">
                      <ExternalLink size={12} /> 查看截图
                    </a>
                  ) : null}
                </div>
                <div className="flex items-start gap-2 lg:justify-end">
                  {candidate.status === 'pending_approval' ? (
                    <>
                      <button onClick={() => approve(candidate)}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500">
                        <CheckCircle2 size={16} /> 确认执行
                      </button>
                      <button onClick={() => skip(candidate)}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500">
                        <SkipForward size={16} /> 跳过
                      </button>
                    </>
                  ) : (
                    <span className="rounded bg-slate-100 px-2 py-1 text-xs text-slate-500">{candidate.status}</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function StatCard({ label, value, tone = 'slate' }: { label: string; value: number; tone?: 'slate' | 'red' | 'amber' | 'green' }) {
  const toneClass = {
    slate: 'text-slate-900',
    red: 'text-red-700',
    amber: 'text-amber-700',
    green: 'text-emerald-700',
  }[tone];
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="text-xs text-slate-500">{label}</div>
      <div className={`mt-2 text-2xl font-bold ${toneClass}`}>{value}</div>
    </div>
  );
}

function typeBadgeClass(type: string) {
  if (type === 'report') return 'bg-red-50 text-red-700';
  if (type === 'hide') return 'bg-amber-50 text-amber-700';
  return 'bg-emerald-50 text-emerald-700';
}

function formatDateTime(value?: string | null) {
  if (!value) return '-';
  return new Date(value).toLocaleString();
}

function requireOperatorId(value: string): string | null {
  const operatorId = value.trim();
  if (!operatorId) {
    alert('请先填写运营ID，再确认或跳过写操作。');
    return null;
  }
  return operatorId;
}

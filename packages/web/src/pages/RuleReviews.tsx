import React, { useEffect, useMemo, useState } from 'react';
import { CalendarClock, CheckCircle2, RefreshCw, Save, ShieldAlert } from 'lucide-react';
import { api, type RuleReviewStatus, type RuleReviewUpdateInput } from '../api';

type RuleReview = {
  id: number;
  category: string;
  title: string;
  status: RuleReviewStatus;
  lastReviewedAt: string | null;
  nextReviewAt: string | null;
  conclusion: string | null;
  evidencePath: string | null;
  owner: string | null;
  updatedAt: string | null;
};

type RuleReviewForm = {
  status: RuleReviewStatus;
  owner: string;
  conclusion: string;
  evidencePath: string;
  nextReviewDate: string;
};

const categoryLabels: Record<string, string> = {
  review_management: '评价管理规则',
  report_hide: '举报/隐藏规则',
  account_security: '商家后台账号安全规则',
  automation_tools: '自动化工具/第三方工具限制',
  service_agreements: '店铺推广/客服/评价相关协议',
};

const categoryDescriptions: Record<string, string> = {
  review_management: '评价回复、举报入口、互动入口、近 72 小时评价处理边界。',
  report_hide: '差评举报话术、举报理由、隐藏评论适用边界、人工确认要求。',
  account_security: '登录、账号安全、安全验证、权限和操作频繁提示。',
  automation_tools: '自动化工具使用边界、第三方工具限制和平台风控要求。',
  service_agreements: '评价、客服、推广相关协议变化及批量处理边界。',
};

export default function RuleReviews() {
  const [reviews, setReviews] = useState<RuleReview[]>([]);
  const [forms, setForms] = useState<Record<string, RuleReviewForm>>({});
  const [loading, setLoading] = useState(true);
  const [savingCategory, setSavingCategory] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadReviews();
  }, []);

  async function loadReviews() {
    setLoading(true);
    setError(null);
    try {
      const result = await api.getRuleReviewStatus();
      const rows = (result.reviews || []) as RuleReview[];
      setReviews(rows);
      setForms(Object.fromEntries(rows.map((item) => [item.category, buildForm(item)])));
    } catch (err: any) {
      setError(err.message || '加载规则复核状态失败');
    } finally {
      setLoading(false);
    }
  }

  async function saveReview(review: RuleReview) {
    const form = forms[review.category];
    if (!form) return;
    setSavingCategory(review.category);
    setError(null);
    try {
      const payload: RuleReviewUpdateInput = {
        status: form.status,
        owner: form.owner.trim() || undefined,
        conclusion: form.conclusion.trim() || undefined,
        evidencePath: form.evidencePath.trim() || undefined,
        nextReviewAt: dateToIso(form.nextReviewDate),
      };
      await api.updateRuleReview(review.category, payload);
      await loadReviews();
    } catch (err: any) {
      setError(err.message || '保存规则复核结果失败');
    } finally {
      setSavingCategory(null);
    }
  }

  const summary = useMemo(() => {
    const overdue = reviews.filter(isReviewOverdue).length;
    const approved = reviews.filter((item) => item.status === 'approved' && !isReviewOverdue(item)).length;
    return { overdue, approved, total: reviews.length };
  }, [reviews]);

  if (loading) return (
    <div className="flex items-center justify-center py-20">
      <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-blue-600" />
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="text-sm text-slate-500">风控复核</p>
          <h2 className="text-2xl font-bold text-slate-900">规则复核</h2>
          <p className="mt-1 text-sm text-slate-500">
            月度确认高风险写操作相关规则；任一项未通过或过期时，举报/隐藏 real-run 会保持暂停。
          </p>
        </div>
        <button
          onClick={loadReviews}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 transition-colors duration-150 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <RefreshCw size={16} /> 刷新
        </button>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <SummaryCard label="复核项" value={summary.total} />
        <SummaryCard label="已通过" value={summary.approved} tone="green" />
        <SummaryCard label="待处理/过期" value={summary.overdue} tone="red" />
      </div>

      {summary.overdue > 0 ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4">
          <div className="flex gap-3">
            <ShieldAlert size={20} className="mt-0.5 shrink-0 text-red-600" />
            <div>
              <h3 className="font-semibold text-red-800">举报/隐藏真实执行已被规则复核 gate 暂停</h3>
              <p className="mt-1 text-sm text-red-700">
                请逐项完成人工复核，并将状态更新为“已通过”且填写未来的下次复核日期。
              </p>
            </div>
          </div>
        </div>
      ) : (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4">
          <div className="flex gap-3">
            <CheckCircle2 size={20} className="mt-0.5 shrink-0 text-emerald-600" />
            <div>
              <h3 className="font-semibold text-emerald-800">规则复核有效</h3>
              <p className="mt-1 text-sm text-emerald-700">当前复核状态不会阻断举报/隐藏 real-run。</p>
            </div>
          </div>
        </div>
      )}

      {error ? <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div> : null}

      <section className="rounded-lg border border-slate-200 bg-white">
        <div className="flex items-center gap-2 border-b border-slate-100 px-5 py-4">
          <CalendarClock size={16} className="text-slate-400" />
          <h3 className="font-semibold text-slate-800">月度复核清单</h3>
        </div>
        <div className="divide-y divide-slate-100">
          {reviews.map((review) => {
            const form = forms[review.category] || buildForm(review);
            const overdue = isReviewOverdue(review);
            return (
              <div key={review.category} className="grid gap-5 p-5 lg:grid-cols-[minmax(0,1fr)_minmax(360px,440px)]">
                <div className="min-w-0">
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <h4 className="font-semibold text-slate-900">{categoryLabels[review.category] || review.title}</h4>
                    <span className={`rounded px-2 py-1 text-xs font-medium ${statusBadgeClass(review.status, overdue)}`}>
                      {statusLabel(review.status, overdue)}
                    </span>
                  </div>
                  <p className="text-sm leading-6 text-slate-600">
                    {categoryDescriptions[review.category] || '请复核该规则项是否仍适用于当前运营动作。'}
                  </p>
                  <div className="mt-3 grid gap-2 text-xs text-slate-500 sm:grid-cols-2">
                    <div>最近复核：{formatDateTime(review.lastReviewedAt)}</div>
                    <div>下次复核：{formatDateTime(review.nextReviewAt)}</div>
                    <div>负责人：{review.owner || '-'}</div>
                    <div>更新时间：{formatDateTime(review.updatedAt)}</div>
                  </div>
                  {review.conclusion ? (
                    <div className="mt-3 rounded-lg bg-slate-50 p-3 text-xs leading-5 text-slate-600">
                      {review.conclusion}
                    </div>
                  ) : null}
                </div>

                <div className="space-y-3">
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <label className="block">
                      <span className="mb-1 block text-xs font-medium text-slate-500">状态</span>
                      <select
                        value={form.status}
                        onChange={(event) => updateForm(review.category, { status: event.target.value as RuleReviewStatus })}
                        className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="approved">已通过</option>
                        <option value="pending">待复核</option>
                        <option value="expired">已过期</option>
                        <option value="paused">暂停</option>
                      </select>
                    </label>
                    <label className="block">
                      <span className="mb-1 block text-xs font-medium text-slate-500">下次复核日期</span>
                      <input
                        type="date"
                        value={form.nextReviewDate}
                        onChange={(event) => updateForm(review.category, { nextReviewDate: event.target.value })}
                        className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </label>
                  </div>
                  <input
                    value={form.owner}
                    onChange={(event) => updateForm(review.category, { owner: event.target.value })}
                    placeholder="负责人"
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <input
                    value={form.evidencePath}
                    onChange={(event) => updateForm(review.category, { evidencePath: event.target.value })}
                    placeholder="证据路径或链接"
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <textarea
                    value={form.conclusion}
                    onChange={(event) => updateForm(review.category, { conclusion: event.target.value })}
                    placeholder="复核结论"
                    rows={3}
                    className="w-full resize-y rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <button
                    onClick={() => saveReview(review)}
                    disabled={savingCategory === review.category}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors duration-150 hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                  >
                    <Save size={16} />
                    {savingCategory === review.category ? '保存中...' : '保存复核'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );

  function updateForm(category: string, patch: Partial<RuleReviewForm>) {
    setForms((current) => ({
      ...current,
      [category]: {
        ...(current[category] || {
          status: 'pending',
          owner: '',
          conclusion: '',
          evidencePath: '',
          nextReviewDate: defaultNextReviewDate(),
        }),
        ...patch,
      },
    }));
  }
}

function SummaryCard({ label, value, tone = 'slate' }: { label: string; value: number; tone?: 'slate' | 'red' | 'green' }) {
  const toneClass = {
    slate: 'text-slate-900',
    red: 'text-red-700',
    green: 'text-emerald-700',
  }[tone];
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="text-xs text-slate-500">{label}</div>
      <div className={`mt-2 text-2xl font-bold ${toneClass}`}>{value}</div>
    </div>
  );
}

function buildForm(review: RuleReview): RuleReviewForm {
  return {
    status: review.status,
    owner: review.owner || '',
    conclusion: review.conclusion || '',
    evidencePath: review.evidencePath || '',
    nextReviewDate: isoToDateInput(review.nextReviewAt) || defaultNextReviewDate(),
  };
}

function isReviewOverdue(review: Pick<RuleReview, 'status' | 'nextReviewAt'>): boolean {
  if (review.status !== 'approved') return true;
  if (!review.nextReviewAt) return true;
  const next = Date.parse(review.nextReviewAt);
  return !Number.isFinite(next) || next < Date.now();
}

function statusLabel(status: RuleReviewStatus, overdue: boolean): string {
  if (overdue && status === 'approved') return '已过期';
  if (status === 'approved') return '已通过';
  if (status === 'pending') return '待复核';
  if (status === 'expired') return '已过期';
  return '暂停';
}

function statusBadgeClass(status: RuleReviewStatus, overdue: boolean): string {
  if (status === 'approved' && !overdue) return 'bg-emerald-50 text-emerald-700';
  if (status === 'pending') return 'bg-amber-50 text-amber-700';
  return 'bg-red-50 text-red-700';
}

function isoToDateInput(value?: string | null): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 10);
}

function dateToIso(value: string): string | undefined {
  if (!value) return undefined;
  return new Date(`${value}T00:00:00.000Z`).toISOString();
}

function defaultNextReviewDate(): string {
  const date = new Date();
  date.setDate(date.getDate() + 30);
  return date.toISOString().slice(0, 10);
}

function formatDateTime(value?: string | null) {
  if (!value) return '-';
  return new Date(value).toLocaleString();
}

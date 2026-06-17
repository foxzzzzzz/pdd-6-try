import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';

const BASE = '/api';

export default function FactoryView() {
  const { token } = useParams<{ token: string }>();
  const [issue, setIssue] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState('');
  const [status, setStatus] = useState('');
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    if (!token) return;
    fetch(`${BASE}/factory/issues/${token}`)
      .then((r) => r.json())
      .then((data) => { setIssue(data); setStatus(data.rectificationStatus || ''); setFeedback(data.factoryFeedback || ''); })
      .catch(() => setIssue(null))
      .finally(() => setLoading(false));
  }, [token]);

  async function handleSave() {
    setSaving(true);
    try {
      const res = await fetch(`${BASE}/factory/issues/${token}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ factoryFeedback: feedback, rectificationStatus: status }),
      });
      if (res.ok) { setMsg('✅ 保存成功'); }
      else { setMsg('❌ 保存失败'); }
    } catch { setMsg('❌ 网络错误'); }
    finally { setSaving(false); }
  }

  if (loading) return <div className="flex items-center justify-center min-h-screen bg-gray-50 text-gray-400">加载中...</div>;
  if (!issue) return <div className="flex items-center justify-center min-h-screen bg-gray-50 text-red-400">链接无效或已过期</div>;

  const statusOptions = ['pending', 'in_progress', 'resolved', 'closed'];
  const statusLabels: Record<string, string> = {
    pending: '待处理', in_progress: '整改中', resolved: '已解决', closed: '已关闭',
  };
  const severityColors: Record<string, string> = {
    low: 'bg-blue-100 text-blue-700', medium: 'bg-yellow-100 text-yellow-700',
    high: 'bg-orange-100 text-orange-700', critical: 'bg-red-100 text-red-700',
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-2xl mx-auto">
        <div className="bg-white rounded-lg border p-6">
          <h1 className="text-xl font-bold text-gray-800 mb-1">🏭 工厂问题反馈</h1>
          <p className="text-sm text-gray-500 mb-6">店铺: {issue.storeName} · 创建: {issue.createdAt}</p>

          {/* Issue Detail */}
          <div className="space-y-4 mb-6">
            <div className="flex gap-2">
              <span className={`px-2 py-1 rounded text-xs font-medium ${severityColors[issue.severity] || ''}`}>
                {issue.severity}
              </span>
              <span className="px-2 py-1 rounded text-xs bg-gray-100 text-gray-600">
                {statusLabels[issue.rectificationStatus] || issue.rectificationStatus}
              </span>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">问题类型</label>
              <div className="text-sm text-gray-800 bg-gray-50 rounded p-2">{issue.type}</div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">问题描述</label>
              <div className="text-sm text-gray-800 bg-gray-50 rounded p-3 whitespace-pre-wrap">{issue.description}</div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">整改状态</label>
              <select value={status} onChange={(e) => setStatus(e.target.value)}
                className="border rounded px-3 py-2 text-sm w-full">
                {statusOptions.map((s) => (
                  <option key={s} value={s}>{statusLabels[s]}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">工厂反馈</label>
              <textarea value={feedback} onChange={(e) => setFeedback(e.target.value)}
                placeholder="请输入整改措施或反馈信息..."
                rows={4} className="w-full border rounded px-3 py-2 text-sm" />
            </div>
          </div>

          <button onClick={handleSave} disabled={saving}
            className="w-full py-2 bg-blue-600 text-white rounded font-medium hover:bg-blue-700 disabled:opacity-50">
            {saving ? '保存中...' : '💾 保存反馈'}
          </button>

          {msg && <p className={`text-center mt-3 text-sm ${msg.includes('成功') ? 'text-green-600' : 'text-red-500'}`}>{msg}</p>}

          <p className="text-xs text-gray-400 mt-6 text-center">
            拼多多巡店系统 · 工厂协作平台 · 无需登录
          </p>
        </div>
      </div>
    </div>
  );
}

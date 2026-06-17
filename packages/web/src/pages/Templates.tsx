import React, { useEffect, useState } from 'react';
import { api } from '../api';

type TabType = 'reply' | 'report';

export default function Templates() {
  const [tab, setTab] = useState<TabType>('reply');
  const [replyTemplates, setReplyTemplates] = useState<any[]>([]);
  const [reportTemplates, setReportTemplates] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState({ name: '', content: '', scene: '', reportType: '' });

  useEffect(() => { loadTemplates(); }, []);

  async function loadTemplates() {
    try {
      const [replies, reports] = await Promise.all([
        api.getReplyTemplates(),
        api.getReportTemplates(),
      ]);
      setReplyTemplates(replies as any[]);
      setReportTemplates(reports as any[]);
    } finally { setLoading(false); }
  }

  async function handleSave() {
    if (!form.name || !form.content) return alert('请填写模板名称和内容');
    try {
      if (tab === 'reply') {
        if (editing) {
          await api.updateReplyTemplate(editing.id, form);
        } else {
          await api.createReplyTemplate(form);
        }
      } else {
        if (editing) {
          await api.updateReportTemplate(editing.id, form);
        } else {
          await api.createReportTemplate(form);
        }
      }
      setEditing(null);
      setForm({ name: '', content: '', scene: '', reportType: '' });
      loadTemplates();
    } catch (err: any) { alert('保存失败: ' + err.message); }
  }

  async function handleDelete(id: number) {
    if (!confirm('确认删除？')) return;
    if (tab === 'reply') await api.deleteReplyTemplate(id);
    else await api.deleteReportTemplate(id);
    loadTemplates();
  }

  function startEdit(t: any) {
    setEditing(t);
    setForm({ name: t.name, content: t.content, scene: t.scene || '', reportType: t.reportType || '' });
  }

  const templates = tab === 'reply' ? replyTemplates : reportTemplates;

  if (loading) return <div className="text-center py-20 text-gray-400">加载中...</div>;

  return (
    <div>
      <h2 className="text-2xl font-bold text-gray-800 mb-6">📝 模板管理</h2>

      {/* Tabs */}
      <div className="flex gap-2 mb-6">
        {(['reply', 'report'] as TabType[]).map((t) => (
          <button key={t} onClick={() => { setTab(t); setEditing(null); }}
            className={`px-4 py-2 rounded text-sm font-medium ${
              tab === t ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 border hover:bg-gray-50'
            }`}>
            {t === 'reply' ? '💬 回复模板' : '🚨 举报模板'}
          </button>
        ))}
      </div>

      {/* Form */}
      <div className="bg-white rounded-lg border p-4 mb-6">
        <h3 className="font-semibold text-gray-700 mb-3">{editing ? '编辑模板' : '新建模板'}</h3>
        <div className="space-y-3">
          <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="模板名称" className="w-full border rounded px-3 py-2 text-sm" />
          {tab === 'reply' && (
            <input value={form.scene} onChange={(e) => setForm({ ...form, scene: e.target.value })}
              placeholder="适用场景 (如: 通用好评、口味好评)" className="w-full border rounded px-3 py-2 text-sm" />
          )}
          {tab === 'report' && (
            <input value={form.reportType} onChange={(e) => setForm({ ...form, reportType: e.target.value })}
              placeholder="举报类型 (如: 广告、不文明用语)" className="w-full border rounded px-3 py-2 text-sm" />
          )}
          <textarea value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })}
            placeholder="模板内容 (支持 {nickname} {product} 等变量)" rows={3}
            className="w-full border rounded px-3 py-2 text-sm" />
          <div className="flex gap-2">
            <button onClick={handleSave} className="px-4 py-2 bg-blue-600 text-white rounded text-sm hover:bg-blue-700">
              {editing ? '更新' : '创建'}
            </button>
            {editing && (
              <button onClick={() => { setEditing(null); setForm({ name: '', content: '', scene: '', reportType: '' }); }}
                className="px-4 py-2 bg-gray-200 text-gray-700 rounded text-sm hover:bg-gray-300">取消</button>
            )}
          </div>
        </div>
      </div>

      {/* Template List */}
      <div className="space-y-2">
        {templates.map((t: any) => (
          <div key={t.id} className="bg-white rounded-lg border p-4">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <h4 className="font-medium text-gray-800">{t.name}</h4>
                  {t.storeId ? <span className="text-xs bg-purple-100 text-purple-600 px-2 py-0.5 rounded">店铺专属</span>
                    : <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded">全局</span>}
                  {!t.enabled && <span className="text-xs bg-red-100 text-red-500 px-2 py-0.5 rounded">已禁用</span>}
                </div>
                <p className="text-sm text-gray-500 mt-1">{t.content?.substring(0, 100)}{(t.content?.length > 100 ? '...' : '')}</p>
                {(t.scene || t.reportType) && (
                  <span className="text-xs text-gray-400 mt-1 inline-block">
                    {t.scene || t.reportType} · 使用 {t.usageCount || 0} 次
                  </span>
                )}
              </div>
              <div className="flex gap-2 ml-4">
                <button onClick={() => startEdit(t)} className="text-blue-500 text-sm hover:underline">编辑</button>
                <button onClick={() => handleDelete(t.id)} className="text-red-400 text-sm hover:underline">删除</button>
              </div>
            </div>
          </div>
        ))}
        {templates.length === 0 && <div className="text-center py-8 text-gray-400">暂无模板，创建一个吧</div>}
      </div>
    </div>
  );
}

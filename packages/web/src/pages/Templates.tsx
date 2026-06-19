import React, { useEffect, useState } from 'react';
import { MessageSquareReply, Flag, Plus, Pencil, Trash2, Globe, Store } from 'lucide-react';
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
      const [replies, reports] = await Promise.all([api.getReplyTemplates(), api.getReportTemplates()]);
      setReplyTemplates(replies as any[]); setReportTemplates(reports as any[]);
    } finally { setLoading(false); }
  }

  async function handleSave() {
    if (!form.name || !form.content) return alert('请填写模板名称和内容');
    try {
      if (tab === 'reply') editing ? await api.updateReplyTemplate(editing.id, form) : await api.createReplyTemplate(form);
      else editing ? await api.updateReportTemplate(editing.id, form) : await api.createReportTemplate(form);
      setEditing(null); setForm({ name: '', content: '', scene: '', reportType: '' }); loadTemplates();
    } catch (err: any) { alert('保存失败: ' + err.message); }
  }

  async function handleDelete(id: number) {
    if (!confirm('确认删除？')) return;
    tab === 'reply' ? await api.deleteReplyTemplate(id) : await api.deleteReportTemplate(id);
    loadTemplates();
  }

  function startEdit(t: any) {
    setEditing(t); setForm({ name: t.name, content: t.content, scene: t.scene || '', reportType: t.reportType || '' });
  }

  const templates = tab === 'reply' ? replyTemplates : reportTemplates;

  if (loading) return (
    <div className="flex items-center justify-center py-20">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
    </div>
  );

  return (
    <div>
      <h2 className="text-2xl font-bold text-slate-900 mb-6">模板管理</h2>

      {/* Tabs */}
      <div className="flex gap-2 mb-6">
        {([
          { key: 'reply' as TabType, label: '回复模板', icon: MessageSquareReply },
          { key: 'report' as TabType, label: '举报模板', icon: Flag },
        ]).map((t) => (
          <button key={t.key} onClick={() => { setTab(t.key); setEditing(null); }}
            className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-blue-500 ${
              tab === t.key
                ? 'bg-blue-600 text-white shadow-sm'
                : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
            }`}>
            <t.icon size={16} /> {t.label}
          </button>
        ))}
      </div>

      {/* Form */}
      <div className="bg-white rounded-lg border border-slate-200 p-5 mb-6">
        <h3 className="font-semibold text-slate-800 mb-4 flex items-center gap-2">
          <Plus size={16} className="text-blue-500" /> {editing ? '编辑模板' : '新建模板'}
        </h3>
        <div className="space-y-3">
          <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="模板名称" className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-shadow" />
          {tab === 'reply' && (
            <input value={form.scene} onChange={(e) => setForm({ ...form, scene: e.target.value })}
              placeholder="适用场景 (如: 通用好评、口味好评)" className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
          )}
          {tab === 'report' && (
            <input value={form.reportType} onChange={(e) => setForm({ ...form, reportType: e.target.value })}
              placeholder="举报类型 (如: 广告、不文明用语)" className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
          )}
          <textarea value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })}
            placeholder="模板内容 (支持 {nickname} {product} 等变量)" rows={3}
            className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-y" />
          <div className="flex gap-2">
            <button onClick={handleSave} className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2">
              {editing ? '更新' : '创建'}
            </button>
            {editing && (
              <button onClick={() => { setEditing(null); setForm({ name: '', content: '', scene: '', reportType: '' }); }}
                className="px-4 py-2 bg-slate-100 text-slate-600 rounded-lg text-sm hover:bg-slate-200 transition-colors duration-150">取消</button>
            )}
          </div>
        </div>
      </div>

      {/* Template List */}
      <div className="space-y-2">
        {templates.map((t: any) => (
          <div key={t.id} className="bg-white rounded-lg border border-slate-200 p-4 hover:border-slate-300 transition-all duration-150">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <h4 className="font-medium text-slate-800">{t.name}</h4>
                  {t.storeId
                    ? <span className="inline-flex items-center gap-1 text-xs bg-purple-50 text-purple-600 px-2 py-0.5 rounded-full"><Store size={10} /> 店铺专属</span>
                    : <span className="inline-flex items-center gap-1 text-xs bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full"><Globe size={10} /> 全局</span>
                  }
                  {!t.enabled && <span className="text-xs bg-red-50 text-red-500 px-2 py-0.5 rounded-full">已禁用</span>}
                </div>
                <p className="text-sm text-slate-500 truncate">{t.content}</p>
                {(t.scene || t.reportType) && (
                  <span className="text-xs text-slate-400 mt-1 inline-block">{t.scene || t.reportType} · 使用 {t.usageCount || 0} 次</span>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button onClick={() => startEdit(t)} className="inline-flex items-center gap-1 text-blue-500 text-sm hover:text-blue-700 transition-colors px-2 py-1 rounded hover:bg-blue-50 focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <Pencil size={14} /> 编辑
                </button>
                <button onClick={() => handleDelete(t.id)} className="inline-flex items-center gap-1 text-red-400 text-sm hover:text-red-600 transition-colors px-2 py-1 rounded hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-red-500">
                  <Trash2 size={14} /> 删除
                </button>
              </div>
            </div>
          </div>
        ))}
        {templates.length === 0 && (
          <div className="text-center py-12 text-slate-400 bg-white rounded-lg border border-dashed border-slate-200">
            <MessageSquareReply size={32} className="mx-auto mb-2 text-slate-300" />
            <p>暂无模板，创建一个吧</p>
          </div>
        )}
      </div>
    </div>
  );
}

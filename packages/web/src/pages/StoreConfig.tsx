import React, { useEffect, useState } from 'react';
import { Plus, Pencil, Trash2, Play, Store, User, Factory, Globe } from 'lucide-react';
import { api } from '../api';

export default function StoreConfig() {
  const [stores, setStores] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState({ name: '', pddStoreId: '', owner: '', factory: '' });
  const [inspecting, setInspecting] = useState<number | null>(null);

  useEffect(() => { load(); }, []);

  async function load() { try { setStores(await api.getStores() as any[]); } finally { setLoading(false); } }

  async function handleSave() {
    if (!form.name || !form.pddStoreId) return alert('请填写店铺名称和ID');
    try {
      editing ? await api.updateStore(editing.id, form) : await api.createStore(form);
      setEditing(null); setForm({ name: '', pddStoreId: '', owner: '', factory: '' }); load();
    } catch (err: any) { alert('保存失败: ' + err.message); }
  }

  async function handleDelete(id: number) { if (!confirm('确认删除？')) return; await api.deleteStore(id); load(); }

  async function handleInspect(id: number) {
    setInspecting(id);
    try { const r = await api.triggerInspect(id); alert(`已触发巡店: ${r.message}`); }
    catch (err: any) { alert('触发失败: ' + err.message); }
    finally { setInspecting(null); }
  }

  function startEdit(s: any) {
    setEditing(s); setForm({ name: s.name, pddStoreId: s.pddStoreId, owner: s.owner || '', factory: s.factory || '' });
  }

  if (loading) return (
    <div className="flex items-center justify-center py-20">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
    </div>
  );

  return (
    <div>
      <h2 className="text-2xl font-bold text-slate-900 mb-6">店铺配置</h2>

      {/* Form */}
      <div className="bg-white rounded-lg border border-slate-200 p-5 mb-6">
        <h3 className="font-semibold text-slate-800 mb-4 flex items-center gap-2">
          <Plus size={16} className="text-blue-500" /> {editing ? '编辑店铺' : '添加店铺'}
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="店铺名称 *" className="border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
          <input value={form.pddStoreId} onChange={(e) => setForm({ ...form, pddStoreId: e.target.value })}
            placeholder="PDD 店铺ID *" className="border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
          <input value={form.owner} onChange={(e) => setForm({ ...form, owner: e.target.value })}
            placeholder="负责人" className="border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
          <input value={form.factory} onChange={(e) => setForm({ ...form, factory: e.target.value })}
            placeholder="关联工厂" className="border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
        </div>
        <div className="flex gap-2 mt-3">
          <button onClick={handleSave} className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2">
            {editing ? '更新' : '添加'}
          </button>
          {editing && (
            <button onClick={() => { setEditing(null); setForm({ name: '', pddStoreId: '', owner: '', factory: '' }); }}
              className="px-4 py-2 bg-slate-100 text-slate-600 rounded-lg text-sm hover:bg-slate-200 transition-colors duration-150">取消</button>
          )}
        </div>
      </div>

      {/* Store List */}
      <div className="space-y-2">
        {stores.map((s: any) => (
          <div key={s.id} className="bg-white rounded-lg border border-slate-200 p-4 hover:border-slate-300 transition-all duration-150">
            <div className="flex items-center justify-between gap-4">
              <div className="flex-1 min-w-0">
                <h4 className="font-medium text-slate-800">{s.name}</h4>
                <div className="flex items-center gap-3 mt-1 text-xs text-slate-400">
                  <span className="inline-flex items-center gap-1"><Globe size={12} /> {s.pddStoreId}</span>
                  {s.owner && <span className="inline-flex items-center gap-1"><User size={12} /> {s.owner}</span>}
                  {s.factory && <span className="inline-flex items-center gap-1"><Factory size={12} /> {s.factory}</span>}
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${
                  s.status === 'active' ? 'bg-emerald-50 text-emerald-700' :
                  s.status === 'pending_login' ? 'bg-amber-50 text-amber-700' : 'bg-slate-100 text-slate-600'
                }`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${
                    s.status === 'active' ? 'bg-emerald-500' : s.status === 'pending_login' ? 'bg-amber-500' : 'bg-slate-300'
                  }`} />
                  {s.status === 'active' ? '运行中' : s.status === 'pending_login' ? '待登录' : '已暂停'}
                </span>
                <button onClick={() => handleInspect(s.id)} disabled={inspecting === s.id}
                  className="inline-flex items-center gap-1 px-3 py-1.5 bg-emerald-500 text-white rounded-lg text-xs font-medium hover:bg-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2">
                  <Play size={12} /> {inspecting === s.id ? '...' : '巡店'}
                </button>
                <button onClick={() => startEdit(s)} className="inline-flex items-center gap-1 text-blue-500 text-xs hover:text-blue-700 transition-colors px-2 py-1 rounded hover:bg-blue-50 focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <Pencil size={12} /> 编辑
                </button>
                <button onClick={() => handleDelete(s.id)} className="inline-flex items-center gap-1 text-red-400 text-xs hover:text-red-600 transition-colors px-2 py-1 rounded hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-red-500">
                  <Trash2 size={12} /> 删除
                </button>
              </div>
            </div>
          </div>
        ))}
        {stores.length === 0 && (
          <div className="text-center py-12 text-slate-400 bg-white rounded-lg border border-dashed border-slate-200">
            <Store size={32} className="mx-auto mb-2 text-slate-300" />
            <p>暂无店铺，添加一个开始巡店吧</p>
          </div>
        )}
      </div>
    </div>
  );
}

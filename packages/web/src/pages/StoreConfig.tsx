import React, { useEffect, useState } from 'react';
import { api } from '../api';

export default function StoreConfig() {
  const [stores, setStores] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState({ name: '', pddStoreId: '', owner: '', factory: '' });
  const [inspecting, setInspecting] = useState<number | null>(null);

  useEffect(() => {
    load();
    const timer = window.setInterval(load, 10000);
    return () => window.clearInterval(timer);
  }, []);

  async function load() {
    try { setStores(await api.getStores() as any[]); } finally { setLoading(false); }
  }

  async function handleSave() {
    if (!form.name || !form.pddStoreId) return alert('请填写店铺名称和ID');
    try {
      if (editing) await api.updateStore(editing.id, form);
      else await api.createStore(form);
      setEditing(null); setForm({ name: '', pddStoreId: '', owner: '', factory: '' }); load();
    } catch (err: any) { alert('保存失败: ' + err.message); }
  }

  async function handleDelete(id: number) {
    if (!confirm('确认删除？')) return;
    await api.deleteStore(id); load();
  }

  async function handleInspect(id: number) {
    setInspecting(id);
    try {
      const result = await api.triggerInspect(id);
      alert(`已触发巡店: ${result.message}`);
    } catch (err: any) { alert('触发失败: ' + err.message); }
    finally { setInspecting(null); }
  }

  function startEdit(s: any) {
    setEditing(s); setForm({ name: s.name, pddStoreId: s.pddStoreId, owner: s.owner || '', factory: s.factory || '' });
  }

  if (loading) return <div className="text-center py-20 text-gray-400">加载中...</div>;

  return (
    <div>
      <h2 className="text-2xl font-bold text-gray-800 mb-6">🏪 店铺配置</h2>

      {/* Form */}
      <div className="bg-white rounded-lg border p-4 mb-6">
        <h3 className="font-semibold text-gray-700 mb-3">{editing ? '编辑店铺' : '添加店铺'}</h3>
        <div className="grid grid-cols-2 gap-3">
          <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="店铺名称 *" className="border rounded px-3 py-2 text-sm" />
          <input value={form.pddStoreId} onChange={(e) => setForm({ ...form, pddStoreId: e.target.value })}
            placeholder="PDD 店铺ID *" className="border rounded px-3 py-2 text-sm" />
          <input value={form.owner} onChange={(e) => setForm({ ...form, owner: e.target.value })}
            placeholder="负责人" className="border rounded px-3 py-2 text-sm" />
          <input value={form.factory} onChange={(e) => setForm({ ...form, factory: e.target.value })}
            placeholder="关联工厂" className="border rounded px-3 py-2 text-sm" />
        </div>
        <div className="flex gap-2 mt-3">
          <button onClick={handleSave} className="px-4 py-2 bg-blue-600 text-white rounded text-sm hover:bg-blue-700">
            {editing ? '更新' : '添加'}
          </button>
          {editing && (
            <button onClick={() => { setEditing(null); setForm({ name: '', pddStoreId: '', owner: '', factory: '' }); }}
              className="px-4 py-2 bg-gray-200 rounded text-sm">取消</button>
          )}
        </div>
      </div>

      {/* Store List */}
      <div className="space-y-2">
        {stores.map((s: any) => (
          <div key={s.id} className="bg-white rounded-lg border p-4">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="font-medium text-gray-800">{s.name}</h4>
                <p className="text-xs text-gray-400 mt-0.5">ID: {s.pddStoreId} · {s.owner || '无负责人'} · {s.factory || '未关联工厂'}</p>
              </div>
              <div className="flex items-center gap-2">
                <span className={`px-2 py-1 rounded text-xs ${
                  s.status === 'active' ? 'bg-green-100 text-green-700' :
                  s.status === 'pending_login' ? 'bg-yellow-100 text-yellow-700' : 'bg-gray-100 text-gray-600'
                }`}>{s.status === 'active' ? '运行中' : s.status === 'pending_login' ? '待登录' : '已暂停'}</span>
                <button onClick={() => handleInspect(s.id)}
                  disabled={inspecting === s.id}
                  className="px-3 py-1 bg-green-500 text-white rounded text-xs hover:bg-green-600 disabled:opacity-50">
                  {inspecting === s.id ? '⏳' : '🔍 巡店'}
                </button>
                <button onClick={() => startEdit(s)} className="text-blue-500 text-xs hover:underline">编辑</button>
                <button onClick={() => handleDelete(s.id)} className="text-red-400 text-xs hover:underline">删除</button>
              </div>
            </div>
          </div>
        ))}
        {stores.length === 0 && <div className="text-center py-8 text-gray-400">暂无店铺，添加一个开始巡店吧</div>}
      </div>
    </div>
  );
}

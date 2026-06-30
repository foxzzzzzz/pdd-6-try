import React, { useEffect, useMemo, useState } from 'react';
import { Factory, Globe, KeyRound, Pencil, Play, Plus, RefreshCw, Store, Trash2, User } from 'lucide-react';
import { api } from '../api';
import { formatAuditTime } from '../time';

type StoreRow = {
  id: number;
  name: string;
  pddStoreId: string;
  owner?: string | null;
  factory?: string | null;
  status: 'active' | 'pending_login' | 'paused' | string;
};

type OperatorSession = {
  operatorId: string;
  storeId: number;
  profileKey: string;
  status: 'active' | 'pending_login' | 'paused' | string;
  lastLoginAt?: string | null;
  lastUsedAt?: string | null;
  updatedAt?: string | null;
};

const EMPTY_FORM = { name: '', pddStoreId: '', owner: '', factory: '' };

export default function StoreConfig() {
  const [stores, setStores] = useState<StoreRow[]>([]);
  const [sessions, setSessions] = useState<OperatorSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<StoreRow | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [inspecting, setInspecting] = useState<number | null>(null);
  const [binding, setBinding] = useState<number | null>(null);

  useEffect(() => { load(); }, []);

  async function load() {
    try {
      const [storeRows, sessionRows] = await Promise.all([
        api.getStores(),
        api.getOperatorSessions().catch(() => []),
      ]);
      setStores(storeRows as StoreRow[]);
      setSessions(sessionRows as OperatorSession[]);
    } finally {
      setLoading(false);
    }
  }

  async function handleSave() {
    if (!form.name || !form.pddStoreId) return alert('请填写店铺名称和店铺标识');
    if (!form.owner.trim()) return alert('请填写运营 ID，用于固定绑定浏览器登录态');
    try {
      editing ? await api.updateStore(editing.id, form) : await api.createStore(form);
      setEditing(null);
      setForm(EMPTY_FORM);
      await load();
    } catch (err: any) {
      alert('保存失败: ' + err.message);
    }
  }

  async function handleDelete(id: number) {
    if (!confirm('确认删除这个店铺配置吗？')) return;
    await api.deleteStore(id);
    await load();
  }

  async function handleInspect(store: StoreRow) {
    if (store.status !== 'active') {
      alert('请先完成登录绑定，再执行巡店');
      return;
    }
    setInspecting(store.id);
    try {
      const result = await api.triggerInspect(store.id, store.owner || undefined);
      alert(`已触发巡店：${result.message}`);
    } catch (err: any) {
      alert('触发失败: ' + err.message);
    } finally {
      setInspecting(null);
    }
  }

  async function handleLoginBind(store: StoreRow, label = '登录绑定') {
    const operatorId = (store.owner || '').trim();
    if (!operatorId) {
      alert('请先编辑店铺，填写运营 ID');
      return;
    }
    setBinding(store.id);
    try {
      const result = await api.loginBindStore(store.id, operatorId);
      alert(`${label}已触发：${result.message}`);
      await load();
    } catch (err: any) {
      alert(`${label}触发失败: ` + err.message);
    } finally {
      setBinding(null);
    }
  }

  function startEdit(store: StoreRow) {
    setEditing(store);
    setForm({
      name: store.name,
      pddStoreId: store.pddStoreId,
      owner: store.owner || '',
      factory: store.factory || '',
    });
  }

  const sessionsByStore = useMemo(() => {
    const map = new Map<number, OperatorSession>();
    for (const session of sessions) {
      if (!map.has(session.storeId)) map.set(session.storeId, session);
    }
    return map;
  }, [sessions]);

  if (loading) return (
    <div className="flex items-center justify-center py-20">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
    </div>
  );

  return (
    <div>
      <h2 className="text-2xl font-bold text-slate-900 mb-6">店铺配置</h2>

      <div className="bg-white rounded-lg border border-slate-200 p-5 mb-6">
        <h3 className="font-semibold text-slate-800 mb-4 flex items-center gap-2">
          <Plus size={16} className="text-blue-500" /> {editing ? '编辑店铺' : '添加店铺'}
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="店铺名称 *" className="border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
          <div>
            <input value={form.pddStoreId} onChange={(e) => setForm({ ...form, pddStoreId: e.target.value })}
              placeholder="店铺标识 *" className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
            <p className="text-xs text-slate-400 mt-1">每个店铺的唯一识别码，建议用店铺拼音，如 yanlugong</p>
          </div>
          <input value={form.owner} onChange={(e) => setForm({ ...form, owner: e.target.value })}
            placeholder="运营 ID *" className="border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
          <input value={form.factory} onChange={(e) => setForm({ ...form, factory: e.target.value })}
            placeholder="关联工厂" className="border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
        </div>
        <div className="flex gap-2 mt-3">
          <button onClick={handleSave} className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2">
            {editing ? '更新' : '添加'}
          </button>
          {editing && (
            <button onClick={() => { setEditing(null); setForm(EMPTY_FORM); }}
              className="px-4 py-2 bg-slate-100 text-slate-600 rounded-lg text-sm hover:bg-slate-200 transition-colors duration-150">取消</button>
          )}
        </div>
      </div>

      <div className="space-y-2">
        {stores.map((store) => {
          const session = sessionsByStore.get(store.id);
          const active = store.status === 'active';
          const bindLabel = active ? '重新登录' : '登录绑定';
          return (
            <div key={store.id} className="bg-white rounded-lg border border-slate-200 p-4 hover:border-slate-300 transition-all duration-150">
              <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <h4 className="font-medium text-slate-800">{store.name}</h4>
                  <div className="flex flex-wrap items-center gap-3 mt-1 text-xs text-slate-400">
                    <span className="inline-flex items-center gap-1"><Globe size={12} /> {store.pddStoreId}</span>
                    {store.owner && <span className="inline-flex items-center gap-1"><User size={12} /> {store.owner}</span>}
                    {store.factory && <span className="inline-flex items-center gap-1"><Factory size={12} /> {store.factory}</span>}
                    {session && <span className="inline-flex items-center gap-1"><KeyRound size={12} /> {session.profileKey}</span>}
                  </div>
                  <div className="mt-2 text-xs text-slate-500">
                    登录态：{session ? renderSessionText(session) : '未绑定'}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  <StatusBadge status={store.status} />
                  <button onClick={() => handleLoginBind(store, bindLabel)} disabled={binding === store.id}
                    className="inline-flex items-center gap-1 px-3 py-1.5 bg-blue-500 text-white rounded-lg text-xs font-medium hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2">
                    <KeyRound size={12} /> {binding === store.id ? '...' : bindLabel}
                  </button>
                  <button onClick={() => handleLoginBind(store, '测试登录态')} disabled={binding === store.id}
                    className="inline-flex items-center gap-1 px-3 py-1.5 bg-slate-100 text-slate-700 rounded-lg text-xs font-medium hover:bg-slate-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-slate-400 focus:ring-offset-2">
                    <RefreshCw size={12} /> 测试登录态
                  </button>
                  <button onClick={() => handleInspect(store)} disabled={inspecting === store.id || !active}
                    className="inline-flex items-center gap-1 px-3 py-1.5 bg-emerald-500 text-white rounded-lg text-xs font-medium hover:bg-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2">
                    <Play size={12} /> {inspecting === store.id ? '...' : '巡店'}
                  </button>
                  <button onClick={() => startEdit(store)} className="inline-flex items-center gap-1 text-blue-500 text-xs hover:text-blue-700 transition-colors px-2 py-1 rounded hover:bg-blue-50 focus:outline-none focus:ring-2 focus:ring-blue-500">
                    <Pencil size={12} /> 编辑
                  </button>
                  <button onClick={() => handleDelete(store.id)} className="inline-flex items-center gap-1 text-red-400 text-xs hover:text-red-600 transition-colors px-2 py-1 rounded hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-red-500">
                    <Trash2 size={12} /> 删除
                  </button>
                </div>
              </div>
            </div>
          );
        })}
        {stores.length === 0 && (
          <div className="text-center py-12 text-slate-400 bg-white rounded-lg border border-dashed border-slate-200">
            <Store size={32} className="mx-auto mb-2 text-slate-300" />
            <p>暂无店铺，添加店铺后先完成登录绑定</p>
          </div>
        )}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const active = status === 'active';
  const pending = status === 'pending_login';
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${
      active ? 'bg-emerald-50 text-emerald-700' :
      pending ? 'bg-amber-50 text-amber-700' : 'bg-slate-100 text-slate-600'
    }`}>
      <span className={`w-1.5 h-1.5 rounded-full ${
        active ? 'bg-emerald-500' : pending ? 'bg-amber-500' : 'bg-slate-300'
      }`} />
      {active ? '已绑定' : pending ? '待登录' : '已暂停'}
    </span>
  );
}

function renderSessionText(session: OperatorSession): string {
  const last = session.lastLoginAt || session.lastUsedAt || session.updatedAt;
  const time = last ? `，最近使用 ${formatTime(last)}` : '';
  return `${session.status}${time}`;
}

function formatTime(value: string): string {
  const formatted = formatAuditTime(value);
  return formatted === '-' ? value : formatted;
}

import React from 'react';
import { Link, useLocation, Outlet } from 'react-router-dom';
import { ClipboardCheck, LayoutDashboard, FileText, FileEdit, Store } from 'lucide-react';

const navItems = [
  { path: '/', label: '巡店总览', icon: LayoutDashboard },
  { path: '/actions/review', label: '待确认动作', icon: ClipboardCheck },
  { path: '/reports/daily', label: '日报总览', icon: FileText },
  { path: '/templates', label: '模板管理', icon: FileEdit },
  { path: '/stores', label: '店铺配置', icon: Store },
];

export default function Layout() {
  const loc = useLocation();

  return (
    <div className="flex h-screen bg-slate-50">
      {/* Sidebar */}
      <aside className="w-56 bg-slate-900 text-white flex flex-col shrink-0">
        <div className="p-4 border-b border-slate-700">
          <h1 className="text-lg font-bold tracking-tight">PDD 巡店</h1>
          <p className="text-xs text-slate-400 mt-1">AI 自动化系统</p>
        </div>
        <nav className="flex-1 p-3 space-y-1">
          {navItems.map((item) => {
            const isActive = item.path === '/'
              ? loc.pathname === item.path
              : loc.pathname.startsWith(item.path);
            const Icon = item.icon;
            return (
              <Link
                key={item.path}
                to={item.path}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-slate-900 ${
                  isActive
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                }`}
              >
                <Icon size={18} />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="p-3 border-t border-slate-700 text-xs text-slate-500">
          v1.0.0
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 overflow-auto">
        <div className="p-6 max-w-7xl mx-auto">
          <Outlet />
        </div>
      </main>
    </div>
  );
}

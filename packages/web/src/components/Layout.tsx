import React from 'react';
import { Link, useLocation, Outlet } from 'react-router-dom';

const navItems = [
  { path: '/', label: '📊 巡店总览', icon: '📊' },
  { path: '/templates', label: '📝 模板管理', icon: '📝' },
  { path: '/stores', label: '🏪 店铺配置', icon: '🏪' },
];

export default function Layout() {
  const loc = useLocation();

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Sidebar */}
      <aside className="w-56 bg-gray-900 text-white flex flex-col">
        <div className="p-4 border-b border-gray-700">
          <h1 className="text-lg font-bold">🏪 PDD 巡店</h1>
          <p className="text-xs text-gray-400 mt-1">AI 自动化系统</p>
        </div>
        <nav className="flex-1 p-3 space-y-1">
          {navItems.map((item) => (
            <Link
              key={item.path}
              to={item.path}
              className={`block px-3 py-2 rounded text-sm ${
                loc.pathname === item.path
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-300 hover:bg-gray-800'
              }`}
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="p-3 border-t border-gray-700 text-xs text-gray-500">
          v0.3.0
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

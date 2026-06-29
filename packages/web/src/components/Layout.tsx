import React from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import {
  ClipboardCheck,
  FileEdit,
  FileText,
  LayoutDashboard,
  ShieldAlert,
  ShieldCheck,
  Store,
  type LucideIcon,
} from 'lucide-react';

type NavItem = {
  path: string;
  label: string;
  icon: LucideIcon;
  children?: NavItem[];
};

export const navigationSections: NavItem[] = [
  {
    path: '/',
    label: '巡店总览',
    icon: LayoutDashboard,
    children: [
      { path: '/reports/daily', label: '日报总览', icon: FileText },
      { path: '/templates', label: '模板管理', icon: FileEdit },
    ],
  },
  {
    path: '/actions/review',
    label: '风控管理',
    icon: ShieldAlert,
    children: [
      { path: '/actions/review', label: '待确认动作', icon: ClipboardCheck },
      { path: '/risk-events', label: '风控事件', icon: ShieldAlert },
      { path: '/rule-reviews', label: '规则复核', icon: ShieldCheck },
    ],
  },
  { path: '/stores', label: '店铺详情', icon: Store },
];

export default function Layout() {
  const loc = useLocation();

  return (
    <div className="flex h-screen bg-slate-50">
      <aside className="flex w-56 shrink-0 flex-col bg-slate-900 text-white">
        <div className="border-b border-slate-700 p-4">
          <h1 className="text-lg font-bold tracking-tight">PDD 巡店</h1>
          <p className="mt-1 text-xs text-slate-400">AI 自动化系统</p>
        </div>
        <nav className="flex-1 space-y-3 p-3">
          {navigationSections.map((section) => (
            <div key={section.path} className="space-y-1">
              <NavLink item={section} active={isSectionActive(section, loc.pathname)} />
              {section.children?.length ? (
                <div className="ml-4 space-y-1 border-l border-slate-700 pl-2">
                  {section.children.map((child) => (
                    <NavLink
                      key={child.path}
                      item={child}
                      active={isActive(child.path, loc.pathname)}
                      child
                    />
                  ))}
                </div>
              ) : null}
            </div>
          ))}
        </nav>
        <div className="border-t border-slate-700 p-3 text-xs text-slate-500">
          v1.0.0
        </div>
      </aside>

      <main className="flex-1 overflow-auto">
        <div className="mx-auto max-w-7xl p-6">
          <Outlet />
        </div>
      </main>
    </div>
  );
}

function NavLink({ item, active, child = false }: { item: NavItem; active: boolean; child?: boolean }) {
  const Icon = item.icon;
  return (
    <Link
      to={item.path}
      className={`flex items-center gap-3 rounded-lg text-sm font-medium transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-slate-900 ${
        child ? 'px-3 py-2' : 'px-3 py-2.5'
      } ${
        active
          ? 'bg-blue-600 text-white shadow-sm'
          : child
            ? 'text-slate-400 hover:bg-slate-800 hover:text-white'
            : 'text-slate-200 hover:bg-slate-800 hover:text-white'
      }`}
    >
      <Icon size={child ? 16 : 18} />
      <span>{item.label}</span>
    </Link>
  );
}

function isActive(path: string, pathname: string): boolean {
  if (path === '/') return pathname === '/';
  if (path === '/reports/daily') return pathname.startsWith('/reports/');
  return pathname === path || pathname.startsWith(`${path}/`);
}

function isSectionActive(section: NavItem, pathname: string): boolean {
  if (section.path === '/') return pathname === '/';
  if (section.children?.length) return false;
  return isActive(section.path, pathname);
}

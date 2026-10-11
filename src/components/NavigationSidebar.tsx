import React from 'react';
import {
  ShieldAlert,
  Video,
  BarChart3,
  FileText,
  Settings,
  LayoutDashboard,
  Bell,
  Cpu,
  Activity,
  Layers,
} from 'lucide-react';
import { ActiveNavTab } from '../types';

interface NavigationSidebarProps {
  activeTab: ActiveNavTab;
  onTabChange: (tab: ActiveNavTab) => void;
  activeAlertCount: number;
  yoloStatus: 'READY' | 'LOADING' | 'NOT_READY';
}

export const NavigationSidebar: React.FC<NavigationSidebarProps> = ({
  activeTab,
  onTabChange,
  activeAlertCount,
  yoloStatus,
}) => {
  const navItems: Array<{ id: ActiveNavTab; label: string; icon: React.ReactNode; badge?: number }> = [
    { id: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard className="w-4 h-4" /> },
    { id: 'analysis', label: 'Video Analysis', icon: <Video className="w-4 h-4" /> },
    {
      id: 'alerts',
      label: 'Alerts',
      icon: <Bell className="w-4 h-4" />,
      badge: activeAlertCount > 0 ? activeAlertCount : undefined,
    },
    { id: 'analytics', label: 'Analytics', icon: <BarChart3 className="w-4 h-4" /> },
    { id: 'reports', label: 'Reports', icon: <FileText className="w-4 h-4" /> },
    { id: 'settings', label: 'Settings', icon: <Settings className="w-4 h-4" /> },
  ];

  return (
    <aside
      id="vision-sense-sidebar"
      className="w-64 bg-slate-900/90 border-r border-slate-800 flex flex-col justify-between shrink-0 select-none backdrop-blur-md"
    >
      {/* Brand Header */}
      <div>
        <div className="p-5 border-b border-slate-800/80">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">
              <ShieldAlert className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="font-bold text-base tracking-wider text-slate-100 font-mono">
                  VISION SENSE
                </span>
                <span className="inline-block w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              </div>
              <p className="text-[10px] text-slate-400 uppercase tracking-wider font-mono">
                CCTV Crowd Safety AI
              </p>
            </div>
          </div>
        </div>

        {/* Navigation Items */}
        <nav className="p-3 space-y-1">
          {navItems.map((item) => {
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                id={`nav-item-${item.id}`}
                onClick={() => onTabChange(item.id)}
                className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-lg text-xs font-medium transition ${
                  isActive
                    ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 font-semibold'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                }`}
              >
                <div className="flex items-center gap-3">
                  {item.icon}
                  <span>{item.label}</span>
                </div>
                {item.badge !== undefined && (
                  <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </div>

      {/* System Modules Architecture Status */}
      <div className="p-4 border-t border-slate-800/80 space-y-3 bg-slate-950/40">
        <div className="flex items-center justify-between text-[11px] font-mono text-slate-400">
          <span className="flex items-center gap-1.5">
            <Cpu className="w-3.5 h-3.5 text-slate-400" />
            SYSTEM ENGINES
          </span>
          <span className="text-emerald-400 font-semibold">ONLINE</span>
        </div>

        <div className="space-y-1.5 text-[11px] font-mono">
          <div className="flex items-center justify-between text-slate-300">
            <span className="text-slate-400">ML Model: YOLO</span>
            <span className="flex items-center gap-1 text-emerald-400 text-[10px]">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
              {yoloStatus}
            </span>
          </div>

          <div className="flex items-center justify-between text-slate-300">
            <span className="text-slate-400">Tracking: ByteTrack</span>
            <span className="flex items-center gap-1 text-emerald-400 text-[10px]">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
              READY
            </span>
          </div>

          <div className="flex items-center justify-between text-slate-300">
            <span className="text-slate-400">CV: Optical Flow</span>
            <span className="flex items-center gap-1 text-emerald-400 text-[10px]">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
              READY
            </span>
          </div>

          <div className="flex items-center justify-between text-slate-300">
            <span className="text-slate-400">Temporal Analysis</span>
            <span className="flex items-center gap-1 text-emerald-400 text-[10px]">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
              READY
            </span>
          </div>

          <div className="pt-1.5 border-t border-slate-800/60">
            <div className="flex items-center justify-between text-slate-400">
              <span className="text-slate-500">MMAction2 (Action)</span>
              <span className="text-slate-500 text-[10px] font-medium">NOT CONFIGURED</span>
            </div>
            <div className="flex items-center justify-between text-slate-400 mt-1">
              <span className="text-slate-500">GAT (Relational)</span>
              <span className="text-slate-500 text-[10px] font-medium">Future Extension</span>
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
};

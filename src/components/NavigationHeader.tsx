import React, { useState } from 'react';
import {
  ShieldAlert,
  Activity,
  Cpu,
  UploadCloud,
  RefreshCw,
  LayoutDashboard,
  Bell,
  BarChart3,
  FileText,
  Settings,
  HardDrive,
  Camera,
  Menu,
  X,
} from 'lucide-react';
import { ActiveNavTab } from '../types';
import { DetectorStatus } from '../tracking/detectorInterface';

interface NavigationHeaderProps {
  activeTab: ActiveNavTab;
  onTabChange: (tab: ActiveNavTab) => void;
  detectorStatus: DetectorStatus;
  activeModelName: string;
  isTrackingReady: boolean;
  hasVideo: boolean;
  onUploadClick: () => void;
  onResetClick: () => void;
}

export const NavigationHeader: React.FC<NavigationHeaderProps> = ({
  activeTab,
  onTabChange,
  detectorStatus,
  activeModelName,
  isTrackingReady,
  hasVideo,
  onUploadClick,
  onResetClick,
}) => {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState<boolean>(false);

  const navItems: Array<{ id: ActiveNavTab; label: string; icon: React.FC<{ className?: string }> }> = [
    { id: 'live', label: 'LIVE CAMERA', icon: Camera },
    { id: 'dashboard', label: 'CCTV ARCHIVE', icon: LayoutDashboard },
    { id: 'alerts', label: 'ALERTS', icon: Bell },
    { id: 'analytics', label: 'ANALYTICS', icon: BarChart3 },
    { id: 'reports', label: 'REPORTS', icon: FileText },
    { id: 'storage', label: 'STORAGE', icon: HardDrive },
    { id: 'settings', label: 'SETTINGS', icon: Settings },
  ];

  return (
    <header className="bg-[#070b14]/95 border-b-2 border-slate-800/90 backdrop-blur-md sticky top-0 z-40 px-3 sm:px-4 lg:px-6 py-2 w-full max-w-full overflow-x-hidden">
      <div className="flex flex-col gap-2">
        {/* Top Header Row: Brand, Status, Action Buttons */}
        <div className="flex items-center justify-between gap-2">
          {/* Brand & SOC Identity */}
          <div className="flex items-center gap-2.5 sm:gap-3">
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-gradient-to-tr from-cyan-600 via-blue-600 to-indigo-700 flex items-center justify-center shadow-lg shadow-cyan-500/25 border-2 border-cyan-400/50 comic-panel-cyan shrink-0">
              <ShieldAlert className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
            </div>
            <div className="flex flex-col">
              <div className="flex items-center gap-1.5 sm:gap-2">
                <span className="font-extrabold text-base sm:text-lg tracking-wider text-white uppercase font-mono">
                  VisionSense
                </span>
                <span className="text-[9px] sm:text-[10px] uppercase font-mono font-bold px-1.5 py-0.2 rounded bg-cyan-950/80 text-cyan-300 border border-cyan-800/90">
                  v26.0 SOC
                </span>
              </div>
              <p className="text-[9px] sm:text-[10px] text-cyan-400/80 tracking-widest uppercase font-mono font-medium hidden xs:block">
                SURVEILLANCE INTELLIGENCE
              </p>
            </div>
          </div>

          {/* Center: Live System Status Badges (Visible md and up) */}
          <div className="hidden md:flex items-center gap-2 text-[10px] sm:text-[11px] font-mono py-0.5">
            {/* System Online */}
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-950/80 border border-emerald-700/80 text-emerald-300 font-bold comic-panel">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span>ONLINE</span>
            </div>

            {/* Unified AI Engine Status */}
            <div
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border font-bold comic-panel ${
                detectorStatus === 'READY'
                  ? 'bg-cyan-950/80 border-cyan-600/80 text-cyan-300'
                  : detectorStatus === 'LOADING'
                  ? 'bg-amber-950/80 border-amber-600/80 text-amber-300'
                  : 'bg-rose-950/80 border-rose-600/80 text-rose-300'
              }`}
            >
              <Cpu className="w-3.5 h-3.5" />
              <span>{detectorStatus === 'READY' ? 'AI READY' : detectorStatus === 'LOADING' ? 'LOADING' : 'OFFLINE'}</span>
            </div>

            {/* Tracking Status */}
            <div
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border font-bold comic-panel ${
                isTrackingReady
                  ? 'bg-indigo-950/80 border-indigo-700/80 text-indigo-300'
                  : 'bg-[#0a0f1d] border-slate-800 text-slate-400'
              }`}
            >
              <Activity className="w-3.5 h-3.5" />
              <span>{isTrackingReady ? 'BYTETRACK' : 'STANDBY'}</span>
            </div>
          </div>

          {/* Right Header Controls: Reset, Upload, Mobile Menu Toggle */}
          <div className="flex items-center gap-1.5 sm:gap-2">
            {hasVideo && (
              <button
                onClick={onResetClick}
                title="Unload current video and reset"
                className="p-1.5 sm:p-2 rounded-xl bg-[#0a0f1d] hover:bg-rose-950/80 hover:border-rose-600 text-slate-300 hover:text-rose-300 border border-slate-700 text-xs flex items-center comic-panel transition-all active:scale-95 cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              </button>
            )}

            <button
              onClick={onUploadClick}
              className="flex items-center gap-1 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-black font-extrabold text-[11px] sm:text-xs px-2.5 sm:px-3.5 py-1.5 rounded-xl shadow-md shadow-cyan-500/25 comic-panel transition-all transform hover:scale-[1.02] active:scale-95 cursor-pointer"
            >
              <UploadCloud className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-black" />
              <span className="hidden sm:inline">UPLOAD</span>
            </button>

            {/* Mobile Hamburger Menu Toggle */}
            <button
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              className="p-1.5 sm:p-2 rounded-xl bg-[#0a0f1d] hover:bg-slate-800 border border-slate-700 text-slate-300 hover:text-white lg:hidden transition-colors cursor-pointer"
              title="Toggle Menu"
            >
              {isMobileMenuOpen ? <X className="w-4 h-4 text-cyan-400" /> : <Menu className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* Navigation Bar (Desktop horizontal strip & Mobile responsive scroll strip) */}
        <div className="w-full overflow-x-auto no-scrollbar py-0.5">
          <nav className="inline-flex items-center bg-[#0a0f1d] p-1 rounded-xl border border-slate-800 comic-panel min-w-full sm:min-w-0">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => {
                    onTabChange(item.id);
                    setIsMobileMenuOpen(false);
                  }}
                  className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-lg text-[11px] sm:text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                    isActive
                      ? 'bg-cyan-500 text-black shadow-sm font-extrabold'
                      : 'text-slate-400 hover:text-white hover:bg-slate-800'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5 shrink-0" />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>
        </div>

        {/* Collapsible Mobile Navigation Drawer (< lg) */}
        {isMobileMenuOpen && (
          <div className="lg:hidden mt-2 p-3 bg-[#080c16] border border-cyan-500/40 rounded-xl shadow-2xl flex flex-col gap-2 font-mono text-xs animate-comic-pop">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                NAVIGATION MODULES:
              </span>
              <span className="text-[10px] text-cyan-400">VisionSense Operations</span>
            </div>

            <div className="grid grid-cols-2 gap-1.5">
              {navItems.map((item) => {
                const Icon = item.icon;
                const isActive = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => {
                      onTabChange(item.id);
                      setIsMobileMenuOpen(false);
                    }}
                    className={`flex items-center gap-2 p-2 rounded-lg text-left transition-colors cursor-pointer ${
                      isActive
                        ? 'bg-cyan-950/80 text-cyan-300 border border-cyan-700 font-bold'
                        : 'bg-[#0a0f1d] text-slate-300 hover:bg-slate-800'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5 text-cyan-400" />
                    <span className="truncate">{item.label}</span>
                  </button>
                );
              })}
            </div>

            {/* Mobile Status Indicators */}
            <div className="pt-2 border-t border-slate-800 flex items-center justify-between text-[10px]">
              <div className="flex items-center gap-1 text-emerald-400 font-bold">
                <span className="w-2 h-2 rounded-full bg-emerald-400" />
                <span>ONLINE</span>
              </div>
              <span className="text-slate-400">Model: {activeModelName.slice(0, 15)}</span>
            </div>
          </div>
        )}
      </div>
    </header>
  );
};

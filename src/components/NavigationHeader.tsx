import React from 'react';
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
  return (
    <header className="bg-[#070b14]/95 border-b-2 border-slate-800/90 backdrop-blur-md sticky top-0 z-40 px-4 lg:px-6 py-2.5">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        {/* Brand & SOC Identity */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-cyan-600 via-blue-600 to-indigo-700 flex items-center justify-center shadow-lg shadow-cyan-500/25 border-2 border-cyan-400/50 comic-panel-cyan">
            <ShieldAlert className="w-5 h-5 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-extrabold text-lg tracking-wider text-white uppercase font-mono">
                VisionSense
              </span>
              <span className="text-[10px] uppercase font-mono font-bold px-2 py-0.5 rounded bg-cyan-950/80 text-cyan-300 border border-cyan-800/90">
                v26.0 SOC
              </span>
            </div>
            <p className="text-[10px] text-cyan-400/80 tracking-widest uppercase font-mono font-medium">
              SURVEILLANCE INTELLIGENCE SYSTEM
            </p>
          </div>
        </div>

        {/* Live System Status Indicators */}
        <div className="flex items-center gap-2 sm:gap-3 overflow-x-auto text-[11px] font-mono py-0.5">
          {/* System Online */}
          <div className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-emerald-950/80 border border-emerald-700/80 text-emerald-300 font-bold comic-panel">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span>SYSTEM ONLINE</span>
          </div>

          {/* Unified AI Engine Status */}
          <div
            className={`flex items-center gap-1.5 px-3 py-1 rounded-lg border font-bold comic-panel ${
              detectorStatus === 'READY'
                ? 'bg-cyan-950/80 border-cyan-600/80 text-cyan-300'
                : detectorStatus === 'LOADING'
                ? 'bg-amber-950/80 border-amber-600/80 text-amber-300'
                : 'bg-rose-950/80 border-rose-600/80 text-rose-300'
            }`}
          >
            <Cpu className="w-3.5 h-3.5" />
            <span>
              {detectorStatus === 'READY'
                ? 'AI ENGINE READY'
                : detectorStatus === 'LOADING'
                ? 'AI PROCESSING'
                : 'AI OFFLINE'}
            </span>
          </div>

          {/* Tracking Status */}
          <div
            className={`flex items-center gap-1.5 px-3 py-1 rounded-lg border font-bold comic-panel ${
              isTrackingReady
                ? 'bg-indigo-950/80 border-indigo-700/80 text-indigo-300'
                : 'bg-[#0a0f1d] border-slate-800 text-slate-400'
            }`}
          >
            <Activity className="w-3.5 h-3.5" />
            <span>{isTrackingReady ? 'BYTETRACK READY' : 'TRACKING STANDBY'}</span>
          </div>
        </div>

        {/* Controls: Navigation Tabs & Upload Button */}
        <div className="flex items-center gap-2">
          <nav className="flex items-center bg-[#0a0f1d] p-1 rounded-xl border border-slate-800 comic-panel">
            <button
              onClick={() => onTabChange('dashboard')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                activeTab === 'dashboard'
                  ? 'bg-cyan-500 text-black shadow-sm'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              <LayoutDashboard className="w-3.5 h-3.5" />
              <span>LIVE MONITOR</span>
            </button>
            <button
              onClick={() => onTabChange('alerts')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                activeTab === 'alerts'
                  ? 'bg-cyan-500 text-black shadow-sm'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              <Bell className="w-3.5 h-3.5" />
              <span>ALERTS</span>
            </button>
            <button
              onClick={() => onTabChange('analytics')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                activeTab === 'analytics'
                  ? 'bg-cyan-500 text-black shadow-sm'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              <BarChart3 className="w-3.5 h-3.5" />
              <span>ANALYTICS</span>
            </button>
            <button
              onClick={() => onTabChange('reports')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                activeTab === 'reports'
                  ? 'bg-cyan-500 text-black shadow-sm'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              <FileText className="w-3.5 h-3.5" />
              <span>REPORTS</span>
            </button>
            <button
              onClick={() => onTabChange('storage')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                activeTab === 'storage'
                  ? 'bg-cyan-500 text-black shadow-sm'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              <HardDrive className="w-3.5 h-3.5" />
              <span>STORAGE</span>
            </button>
            <button
              onClick={() => onTabChange('settings')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                activeTab === 'settings'
                  ? 'bg-cyan-500 text-black shadow-sm'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              <Settings className="w-3.5 h-3.5" />
              <span>SETTINGS</span>
            </button>
          </nav>

          {hasVideo && (
            <button
              onClick={onResetClick}
              title="Unload current video and reset"
              className="p-2 rounded-xl bg-[#0a0f1d] hover:bg-rose-950/80 hover:border-rose-600 text-slate-300 hover:text-rose-300 border border-slate-700 text-xs flex items-center gap-1 comic-panel transition-all active:scale-95 cursor-pointer"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          )}

          <button
            onClick={onUploadClick}
            className="flex items-center gap-1.5 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-black font-extrabold text-xs px-4 py-2 rounded-xl shadow-md shadow-cyan-500/25 comic-panel transition-all transform hover:scale-[1.02] active:scale-95 cursor-pointer"
          >
            <UploadCloud className="w-4 h-4 text-black" />
            <span className="hidden sm:inline">UPLOAD VIDEO</span>
          </button>
        </div>
      </div>
    </header>
  );
};

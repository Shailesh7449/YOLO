import React from 'react';
import {
  Users,
  TrendingUp,
  AlertTriangle,
  Activity,
  ShieldCheck,
  Video,
  Cpu,
  ArrowUpRight,
  Eye,
} from 'lucide-react';
import {
  CrowdSafetyStatus,
  MovementSafetyStatus,
  VisionSenseAlert,
  TelemetryPoint,
  ActiveNavTab,
} from '../types';

interface DashboardViewProps {
  peopleCount: number;
  peakPeople: number;
  crowdStatus: CrowdSafetyStatus;
  movementStatus: MovementSafetyStatus;
  activeAlerts: VisionSenseAlert[];
  yoloStatus: 'READY' | 'LOADING' | 'NOT_READY';
  telemetryPoints: TelemetryPoint[];
  onNavigateToAnalysis: () => void;
  videoName: string;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  peopleCount,
  peakPeople,
  crowdStatus,
  movementStatus,
  activeAlerts,
  yoloStatus,
  telemetryPoints,
  onNavigateToAnalysis,
  videoName,
}) => {
  const isCrowdWarning = crowdStatus === 'WARNING';
  const recentPoints = telemetryPoints.slice(-15);
  const avgMotionScore =
    recentPoints.length > 0
      ? (
          recentPoints.reduce((acc, p) => acc + p.motionScore, 0) / recentPoints.length
        ).toFixed(2)
      : '0.00';

  return (
    <div className="space-y-6 pb-8">
      {/* Top Banner: CCTV System Operations */}
      <div className="p-6 rounded-2xl bg-gradient-to-r from-slate-900 via-slate-900 to-slate-950 border border-slate-800 shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/40">
              LIVE SECURITY AUDIT
            </span>
            <span className="text-xs text-slate-400 font-mono">VISION SENSE CCTV CORE</span>
          </div>
          <h1 className="text-2xl font-bold text-slate-100 font-mono mt-1">
            Crowd Safety & Video Analysis Dashboard
          </h1>
          <p className="text-xs text-slate-400 max-w-2xl mt-1">
            Integrated surveillance pipeline combining YOLO person detection, ByteTrack tracking,
            dense optical flow motion estimation, and temporal movement persistence analysis.
          </p>
        </div>

        <button
          onClick={onNavigateToAnalysis}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs font-mono transition shadow-lg shadow-emerald-500/20 shrink-0 cursor-pointer"
        >
          <Video className="w-4 h-4" />
          <span>OPEN VIDEO ANALYSIS</span>
          <ArrowUpRight className="w-4 h-4" />
        </button>
      </div>

      {/* System Status Architecture Grid */}
      <div>
        <h2 className="text-xs font-mono font-bold tracking-widest text-slate-400 uppercase mb-3">
          System Engine Status
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          <div className="p-3.5 rounded-xl bg-slate-900/80 border border-slate-800">
            <div className="text-[10px] font-mono text-slate-400">ML Model</div>
            <div className="text-xs font-bold text-slate-200 mt-1 font-mono">YOLO Detector</div>
            <div className="flex items-center gap-1.5 mt-2 text-[10px] font-mono text-emerald-400">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
              {yoloStatus}
            </div>
          </div>

          <div className="p-3.5 rounded-xl bg-slate-900/80 border border-slate-800">
            <div className="text-[10px] font-mono text-slate-400">Tracking</div>
            <div className="text-xs font-bold text-slate-200 mt-1 font-mono">ByteTrack</div>
            <div className="flex items-center gap-1.5 mt-2 text-[10px] font-mono text-emerald-400">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
              READY
            </div>
          </div>

          <div className="p-3.5 rounded-xl bg-slate-900/80 border border-slate-800">
            <div className="text-[10px] font-mono text-slate-400">CV Technique</div>
            <div className="text-xs font-bold text-slate-200 mt-1 font-mono">Dense Optical Flow</div>
            <div className="flex items-center gap-1.5 mt-2 text-[10px] font-mono text-emerald-400">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
              READY
            </div>
          </div>

          <div className="p-3.5 rounded-xl bg-slate-900/80 border border-slate-800">
            <div className="text-[10px] font-mono text-slate-400">Analysis Method</div>
            <div className="text-xs font-bold text-slate-200 mt-1 font-mono">Temporal Analysis</div>
            <div className="flex items-center gap-1.5 mt-2 text-[10px] font-mono text-emerald-400">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
              READY
            </div>
          </div>

          <div className="p-3.5 rounded-xl bg-slate-900/80 border border-slate-800">
            <div className="text-[10px] font-mono text-slate-400">Decision Method</div>
            <div className="text-xs font-bold text-slate-200 mt-1 font-mono">Safety Engine</div>
            <div className="flex items-center gap-1.5 mt-2 text-[10px] font-mono text-emerald-400">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
              READY
            </div>
          </div>
        </div>
      </div>

      {/* Main Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Current People */}
        <div
          className={`p-5 rounded-2xl border transition shadow-lg ${
            isCrowdWarning
              ? 'bg-amber-500/10 border-amber-500/40 text-amber-300'
              : 'bg-slate-900/90 border-slate-800 text-slate-100'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono font-medium text-slate-400 uppercase">
              Current People
            </span>
            <Users className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-4xl font-extrabold font-mono mt-3">{peopleCount}</div>
          <div className="flex items-center justify-between text-[11px] font-mono text-slate-400 mt-2 pt-2 border-t border-slate-800/60">
            <span>Rule: &gt; 20 is Warning</span>
            <span className={isCrowdWarning ? 'text-amber-400 font-bold' : 'text-emerald-400 font-bold'}>
              {isCrowdWarning ? 'OVER CAPACITY' : 'NOMINAL'}
            </span>
          </div>
        </div>

        {/* Peak People */}
        <div className="p-5 rounded-2xl bg-slate-900/90 border border-slate-800 text-slate-100 shadow-lg">
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono font-medium text-slate-400 uppercase">
              Peak People
            </span>
            <TrendingUp className="w-4 h-4 text-sky-400" />
          </div>
          <div className="text-4xl font-extrabold font-mono mt-3 text-slate-200">{peakPeople}</div>
          <div className="flex items-center justify-between text-[11px] font-mono text-slate-400 mt-2 pt-2 border-t border-slate-800/60">
            <span>Session Maximum</span>
            <span className="text-slate-300 font-semibold">{peakPeople} occupants</span>
          </div>
        </div>

        {/* Crowd Safety Status */}
        <div
          className={`p-5 rounded-2xl border transition shadow-lg ${
            isCrowdWarning
              ? 'bg-amber-500/15 border-amber-500/50'
              : 'bg-emerald-500/10 border-emerald-500/30'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono font-medium text-slate-400 uppercase">
              Crowd Status
            </span>
            {isCrowdWarning ? (
              <AlertTriangle className="w-4 h-4 text-amber-400" />
            ) : (
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
            )}
          </div>
          <div
            className={`text-2xl font-black font-mono mt-3 tracking-wide ${
              isCrowdWarning ? 'text-amber-300' : 'text-emerald-300'
            }`}
          >
            {crowdStatus}
          </div>
          <div className="flex items-center justify-between text-[11px] font-mono text-slate-400 mt-3 pt-2 border-t border-slate-800/60">
            <span>Safety Rule Result</span>
            <span className={isCrowdWarning ? 'text-amber-400 font-bold' : 'text-emerald-400 font-bold'}>
              {isCrowdWarning ? '21+ WARNING' : '≤20 NORMAL'}
            </span>
          </div>
        </div>

        {/* Movement Safety Status */}
        <div className="p-5 rounded-2xl bg-slate-900/90 border border-slate-800 text-slate-100 shadow-lg">
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono font-medium text-slate-400 uppercase">
              Movement Status
            </span>
            <Activity className="w-4 h-4 text-sky-400" />
          </div>
          <div
            className={`text-2xl font-black font-mono mt-3 tracking-wide ${
              movementStatus === 'NORMAL' ? 'text-emerald-400' : 'text-amber-400'
            }`}
          >
            {movementStatus}
          </div>
          <div className="flex items-center justify-between text-[11px] font-mono text-slate-400 mt-3 pt-2 border-t border-slate-800/60">
            <span>Motion Score</span>
            <span className="text-sky-400 font-bold">{avgMotionScore}</span>
          </div>
        </div>
      </div>

      {/* Active Alerts & Feed Overview */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Active Alerts */}
        <div className="lg:col-span-2 p-5 rounded-2xl bg-slate-900/90 border border-slate-800 shadow-xl space-y-3">
          <div className="flex items-center justify-between pb-3 border-b border-slate-800">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-400" />
              <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-slate-200">
                Active System Alerts ({activeAlerts.length})
              </h3>
            </div>
            <span className="text-[10px] font-mono text-slate-400">
              Derived from Threshold + Persistence
            </span>
          </div>

          {activeAlerts.length === 0 ? (
            <div className="py-8 text-center text-slate-500 font-mono text-xs">
              <ShieldCheck className="w-8 h-8 text-emerald-500/40 mx-auto mb-2" />
              No active alerts. All crowd safety metrics are nominal.
            </div>
          ) : (
            <div className="space-y-2">
              {activeAlerts.map((alert) => (
                <div
                  key={alert.id}
                  className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-start justify-between gap-3 text-xs font-mono"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40">
                        {alert.type}
                      </span>
                      <span className="text-slate-400 text-[10px]">Frame #{alert.frame}</span>
                    </div>
                    <p className="text-slate-200 font-medium">{alert.message}</p>
                  </div>
                  <span className="text-amber-400 font-bold text-[10px] uppercase shrink-0">
                    {alert.severity}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Current Active Feed */}
        <div className="p-5 rounded-2xl bg-slate-900/90 border border-slate-800 shadow-xl space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-800">
            <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-slate-200">
              Active Video Source
            </h3>
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          </div>

          <div className="space-y-2 text-xs font-mono">
            <div className="p-2.5 rounded-lg bg-slate-950/60 border border-slate-800/80">
              <span className="text-slate-400 text-[10px]">Source Identifier:</span>
              <p className="text-slate-200 font-semibold truncate mt-0.5">{videoName}</p>
            </div>

            <div className="p-2.5 rounded-lg bg-slate-950/60 border border-slate-800/80">
              <span className="text-slate-400 text-[10px]">Tracking Mode:</span>
              <p className="text-emerald-400 font-semibold mt-0.5">YOLO Person + ByteTrack</p>
            </div>

            <div className="p-2.5 rounded-lg bg-slate-950/60 border border-slate-800/80">
              <span className="text-slate-400 text-[10px]">Dense Optical Flow:</span>
              <p className="text-sky-400 font-semibold mt-0.5">Motion Vector Field Active</p>
            </div>
          </div>

          <button
            onClick={onNavigateToAnalysis}
            className="w-full py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-mono text-xs font-bold transition flex items-center justify-center gap-2 cursor-pointer border border-slate-700"
          >
            <Eye className="w-3.5 h-3.5" />
            <span>SWITCH TO VIDEO PLAYER</span>
          </button>
        </div>
      </div>
    </div>
  );
};

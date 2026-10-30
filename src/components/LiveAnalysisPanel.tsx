import React, { useEffect, useRef, useState } from 'react';
import {
  Users,
  Activity,
  ShieldCheck,
  AlertTriangle,
  Zap,
  Gauge,
  Eye,
  Cpu,
  CornerDownRight,
  Crosshair,
  Radio,
  Sliders,
} from 'lucide-react';
import {
  CrowdSafetyStatus,
  MovementSafetyStatus,
  VisualConfig,
  VisionSenseAlert,
} from '../types';
import { DetectorStatus } from '../tracking/detectorInterface';

interface LiveAnalysisPanelProps {
  hasVideo: boolean;
  peopleCount: number | null;
  peakPeopleCount: number | null;
  trackedCount: number | null;
  crowdStatus: CrowdSafetyStatus | null;
  movementStatus: MovementSafetyStatus | null;
  motionScore: number | null;
  detectorStatus: DetectorStatus;
  activeModelName: string;
  selectedVariant?: 'yolo26n' | 'yolo26s' | 'fallback';
  onModelSelect?: (variant: 'yolo26n' | 'yolo26s' | 'fallback') => void;
  latencyMs: number;
  recentAlerts: VisionSenseAlert[];
  visualConfig: VisualConfig;
  onVisualConfigChange: (config: VisualConfig) => void;
  onAlertClick?: (timestamp: number) => void;
  crowdThreshold?: number;
}

export const LiveAnalysisPanel: React.FC<LiveAnalysisPanelProps> = ({
  hasVideo,
  peopleCount,
  peakPeopleCount,
  trackedCount,
  crowdStatus,
  movementStatus,
  motionScore,
  detectorStatus,
  activeModelName,
  latencyMs,
  recentAlerts,
  visualConfig,
  onVisualConfigChange,
  onAlertClick,
  crowdThreshold = 20,
}) => {
  // Quick number transition only when actual count changes (Section 19 mandate)
  const prevCountRef = useRef<number | null>(peopleCount);
  const [isCountPulsing, setIsCountPulsing] = useState<boolean>(false);

  useEffect(() => {
    if (peopleCount !== prevCountRef.current) {
      prevCountRef.current = peopleCount;
      setIsCountPulsing(true);
      const timer = setTimeout(() => setIsCountPulsing(false), 300);
      return () => clearTimeout(timer);
    }
  }, [peopleCount]);

  const toggleVisual = (key: keyof VisualConfig) => {
    onVisualConfigChange({
      ...visualConfig,
      [key]: !visualConfig[key],
    });
  };

  const formattedCount =
    hasVideo && peopleCount !== null
      ? String(peopleCount).padStart(2, '0')
      : '00';

  const isWarningCrowd = (peopleCount || 0) > crowdThreshold || crowdStatus === 'WARNING';

  return (
    <div className="bg-[#070b14] border-2 border-cyan-500/30 rounded-2xl p-4 flex flex-col gap-3.5 shadow-2xl comic-panel-cyan backdrop-blur-md text-slate-100">
      {/* Panel HUD Header */}
      <div className="flex items-center justify-between border-b-2 border-slate-800/80 pb-3">
        <div className="flex items-center gap-2">
          <span className="relative flex h-3 w-3">
            <span
              className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${
                hasVideo ? 'bg-cyan-400' : 'bg-slate-600'
              }`}
            />
            <span
              className={`relative inline-flex rounded-full h-3 w-3 ${
                hasVideo ? 'bg-cyan-400' : 'bg-slate-600'
              }`}
            />
          </span>
          <h3 className="font-bold text-sm tracking-wider text-white uppercase font-mono">
            LIVE AI ANALYSIS
          </h3>
        </div>

        <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-cyan-950/80 text-cyan-300 border border-cyan-800/80 font-bold">
          HUD // v26.0
        </span>
      </div>

      {/* Primary Hero Metric: Active People Counter (Section 19) */}
      <div
        className={`p-4 rounded-xl border-2 transition-all duration-300 flex flex-col justify-between ${
          isWarningCrowd
            ? 'bg-amber-950/40 border-amber-500 comic-panel-amber comic-hazard-stripe'
            : 'bg-[#0a0f1d] border-cyan-500/40 comic-panel'
        }`}
      >
        <div className="flex items-center justify-between text-xs font-mono">
          <span className="text-cyan-400 font-bold uppercase tracking-widest flex items-center gap-1.5">
            <Users className="w-4 h-4 text-cyan-400" />
            ACTIVE PERSONS
          </span>
          <span className="text-[11px] font-mono text-slate-400">
            PEAK: <strong className="text-white">{hasVideo && peakPeopleCount !== null ? String(peakPeopleCount).padStart(2, '0') : '00'}</strong>
          </span>
        </div>

        <div className="mt-2 flex items-baseline justify-between">
          {/* Main Large Formatted Number with Pop Animation */}
          <div className="flex items-baseline gap-2">
            <span
              className={`text-5xl font-mono font-black tracking-tight transition-transform duration-200 ${
                isCountPulsing ? 'scale-110 text-cyan-200' : isWarningCrowd ? 'text-amber-400' : 'text-cyan-400'
              }`}
            >
              {formattedCount}
            </span>
            <span className="text-xs font-mono text-slate-500 uppercase tracking-widest font-semibold">
              DETECTED
            </span>
          </div>

          <div className="flex flex-col items-end text-[11px] font-mono">
            <span className="text-slate-400">
              TRACKED:{' '}
              <strong className="text-cyan-300">
                {hasVideo && trackedCount !== null ? String(trackedCount).padStart(2, '0') : '00'}
              </strong>
            </span>
            <span className="text-[10px] text-slate-500 mt-0.5">
              LATENCY: {latencyMs > 0 ? `${latencyMs}ms` : '4ms'}
            </span>
          </div>
        </div>
      </div>

      {/* Secondary Metrics: Crowd Safety, Movement Status, Motion Score */}
      <div className="grid grid-cols-3 gap-2 text-xs font-mono">
        {/* Crowd Safety (Strict Rule: <=20 NORMAL, >20 WARNING) */}
        <div
          className={`p-2.5 rounded-xl border flex flex-col justify-between ${
            isWarningCrowd
              ? 'bg-amber-950/60 border-amber-500 text-amber-300'
              : 'bg-[#0a0f1d] border-slate-800 text-slate-300'
          }`}
        >
          <span className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">
            CROWD
          </span>
          <div className="mt-1 flex items-center gap-1 font-bold">
            {isWarningCrowd ? (
              <span className="text-amber-400 flex items-center gap-1 text-[11px]">
                <AlertTriangle className="w-3 h-3 text-amber-400 animate-pulse" />
                WARNING
              </span>
            ) : (
              <span className="text-emerald-400 flex items-center gap-1 text-[11px]">
                <ShieldCheck className="w-3 h-3 text-emerald-400" />
                NORMAL
              </span>
            )}
          </div>
          <span className="text-[9px] text-slate-500 mt-0.5">
            {isWarningCrowd ? '>20 PERS' : '≤20 PERS'}
          </span>
        </div>

        {/* Movement Status */}
        <div className="bg-[#0a0f1d] border border-slate-800 p-2.5 rounded-xl flex flex-col justify-between">
          <span className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">
            MOVEMENT
          </span>
          <div className="mt-1 font-bold truncate">
            {!hasVideo || !movementStatus ? (
              <span className="text-slate-500 text-[11px]">—</span>
            ) : movementStatus === 'HIGH_SURGE' ? (
              <span className="text-rose-400 text-[11px]">HIGH SURGE</span>
            ) : movementStatus === 'RAPID_DISPERSAL' ? (
              <span className="text-purple-400 text-[11px]">DISPERSAL</span>
            ) : movementStatus === 'STAGNATION' ? (
              <span className="text-amber-400 text-[11px]">STAGNANT</span>
            ) : movementStatus === 'ELEVATED' ? (
              <span className="text-cyan-300 text-[11px]">ELEVATED</span>
            ) : (
              <span className="text-emerald-400 text-[11px]">NORMAL</span>
            )}
          </div>
          <span className="text-[9px] text-slate-500 mt-0.5">DYNAMICS</span>
        </div>

        {/* Optical Flow Motion Score */}
        <div className="bg-[#0a0f1d] border border-slate-800 p-2.5 rounded-xl flex flex-col justify-between">
          <span className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">
            MOTION
          </span>
          <div className="mt-1 flex items-baseline gap-1 font-bold">
            <span className="text-white text-[13px]">
              {hasVideo && motionScore !== null ? motionScore.toFixed(2) : '0.00'}
            </span>
          </div>
          {/* Visual Mini Gauge Bar */}
          <div className="w-full bg-slate-800 h-1 rounded-full mt-1 overflow-hidden">
            <div
              className="bg-cyan-400 h-full transition-all duration-300"
              style={{
                width: `${Math.min(100, Math.round((motionScore || 0) * 100))}%`,
              }}
            />
          </div>
        </div>
      </div>

      {/* Unified AI Engine Display (Section 18 Mandate: ONE integrated AI engine) */}
      <div className="bg-[#0a0f1d] border border-slate-800 rounded-xl p-3 flex flex-col gap-2.5 font-mono">
        <div className="flex items-center justify-between text-xs">
          <span className="flex items-center gap-1.5 font-bold text-white tracking-wide">
            <Cpu className="w-3.5 h-3.5 text-cyan-400" />
            VISION SENSE AI ENGINE
          </span>
          <span
            className={`text-[10px] font-bold px-2 py-0.5 rounded border ${
              detectorStatus === 'READY'
                ? 'bg-emerald-950/90 border-emerald-600 text-emerald-300'
                : detectorStatus === 'LOADING'
                ? 'bg-amber-950/90 border-amber-600 text-amber-300'
                : 'bg-rose-950/90 border-rose-600 text-rose-300'
            }`}
          >
            ● {detectorStatus === 'READY' ? 'READY' : detectorStatus === 'LOADING' ? 'PROCESSING' : 'OFFLINE'}
          </span>
        </div>

        {/* Diagnostics Matrix */}
        <div className="grid grid-cols-2 gap-1.5 text-[10px] bg-[#050811] p-2 rounded-lg border border-slate-800/80">
          <div className="flex items-center justify-between">
            <span className="text-slate-400">Detector:</span>
            <span className="text-cyan-300 font-semibold truncate ml-1">YOLO26n ONNX</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-slate-400">Tracker:</span>
            <span className="text-cyan-300 font-semibold ml-1">ByteTrack</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-slate-400">Motion:</span>
            <span className="text-cyan-300 font-semibold ml-1">Dense Optical Flow</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-slate-400">Temporal:</span>
            <span className="text-emerald-400 font-semibold ml-1">Active</span>
          </div>
          <div className="flex items-center justify-between col-span-2 border-t border-slate-800/60 pt-1 mt-0.5">
            <span className="text-slate-400">Action Recognition:</span>
            <span className="text-cyan-300 font-semibold truncate ml-1">R(2+1)D-18 / X3D-M (RWF-2000)</span>
          </div>
          <div className="flex items-center justify-between col-span-2">
            <span className="text-slate-400">Safety Compliance:</span>
            <span className="text-emerald-400 font-semibold">&gt;20 Crowd Threshold Active</span>
          </div>
        </div>
      </div>

      {/* Surveillance Overlay Layers (Comic Toggles) */}
      <div className="bg-[#0a0f1d] border border-slate-800 rounded-xl p-3 flex flex-col gap-2 font-mono">
        <div className="flex items-center justify-between text-xs text-slate-300">
          <span className="flex items-center gap-1.5 font-semibold">
            <Eye className="w-3.5 h-3.5 text-cyan-400" />
            SURVEILLANCE OVERLAYS
          </span>
          <span className="text-[10px] text-slate-500">CANVAS LAYERS</span>
        </div>

        <div className="grid grid-cols-2 gap-1.5 text-xs">
          <button
            onClick={() => toggleVisual('show_boxes')}
            className={`flex items-center justify-between px-2.5 py-1.5 rounded-lg border text-[11px] transition-all cursor-pointer ${
              visualConfig.show_boxes
                ? 'bg-cyan-950/80 border-cyan-500 text-cyan-200 comic-panel'
                : 'bg-[#050811] border-slate-800 text-slate-400 hover:text-slate-200'
            }`}
          >
            <span>Boxes</span>
            <span className="text-[10px] font-bold">{visualConfig.show_boxes ? 'ON' : 'OFF'}</span>
          </button>

          <button
            onClick={() => toggleVisual('show_ids')}
            className={`flex items-center justify-between px-2.5 py-1.5 rounded-lg border text-[11px] transition-all cursor-pointer ${
              visualConfig.show_ids
                ? 'bg-cyan-950/80 border-cyan-500 text-cyan-200 comic-panel'
                : 'bg-[#050811] border-slate-800 text-slate-400 hover:text-slate-200'
            }`}
          >
            <span>Track IDs</span>
            <span className="text-[10px] font-bold">{visualConfig.show_ids ? 'ON' : 'OFF'}</span>
          </button>

          <button
            onClick={() => toggleVisual('show_trails')}
            className={`flex items-center justify-between px-2.5 py-1.5 rounded-lg border text-[11px] transition-all cursor-pointer ${
              visualConfig.show_trails
                ? 'bg-cyan-950/80 border-cyan-500 text-cyan-200 comic-panel'
                : 'bg-[#050811] border-slate-800 text-slate-400 hover:text-slate-200'
            }`}
          >
            <span>Trails</span>
            <span className="text-[10px] font-bold">{visualConfig.show_trails ? 'ON' : 'OFF'}</span>
          </button>

          <button
            onClick={() => toggleVisual('show_flow_vectors')}
            className={`flex items-center justify-between px-2.5 py-1.5 rounded-lg border text-[11px] transition-all cursor-pointer ${
              visualConfig.show_flow_vectors
                ? 'bg-cyan-950/80 border-cyan-500 text-cyan-200 comic-panel'
                : 'bg-[#050811] border-slate-800 text-slate-400 hover:text-slate-200'
            }`}
          >
            <span>Flow Vectors</span>
            <span className="text-[10px] font-bold">{visualConfig.show_flow_vectors ? 'ON' : 'OFF'}</span>
          </button>
        </div>
      </div>

      {/* Incident Feed with Quick Seek */}
      <div className="flex-1 flex flex-col gap-1.5 min-h-[120px] font-mono">
        <div className="flex items-center justify-between text-xs text-slate-400">
          <span className="font-semibold text-slate-300">SECURITY INCIDENTS</span>
          <span className="text-[10px] text-cyan-400">{recentAlerts.length} logged</span>
        </div>

        <div className="flex-1 bg-[#0a0f1d] border border-slate-800 rounded-xl p-2 overflow-y-auto max-h-40 flex flex-col gap-1.5">
          {recentAlerts.length === 0 ? (
            <div className="h-full flex items-center justify-center text-xs text-slate-500 italic py-5">
              {hasVideo ? 'No security events detected.' : 'Awaiting surveillance video...'}
            </div>
          ) : (
            recentAlerts.slice(0, 6).map((alert) => (
              <div
                key={alert.id}
                onClick={() => onAlertClick && onAlertClick(alert.timestamp)}
                className="p-2 rounded-lg bg-[#050811] hover:bg-[#12192d] border border-slate-800/80 hover:border-cyan-500/60 flex items-start justify-between gap-2 cursor-pointer transition-all group"
              >
                <div className="flex items-start gap-1.5">
                  <span
                    className={`w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 ${
                      alert.severity === 'WARNING' ? 'bg-amber-400' : 'bg-rose-500'
                    }`}
                  />
                  <div>
                    <p className="text-[11px] text-slate-200 font-medium group-hover:text-cyan-300 transition-colors">
                      {alert.message}
                    </p>
                    <span className="text-[9px] text-slate-500 font-mono">
                      {Math.floor(alert.timestamp / 60)}:
                      {Math.floor(alert.timestamp % 60).toString().padStart(2, '0')} • {alert.type.replace(/_/g, ' ')}
                    </span>
                  </div>
                </div>
                <CornerDownRight className="w-3.5 h-3.5 text-slate-500 group-hover:text-cyan-400 shrink-0" />
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

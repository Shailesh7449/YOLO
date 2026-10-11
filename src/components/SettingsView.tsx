import React from 'react';
import { Settings, Cpu, Shield, Sliders, CheckCircle2, Info } from 'lucide-react';
import { VisualConfig } from '../types';

interface SettingsViewProps {
  selectedModel: 'yolo26n' | 'yolo26s' | 'fallback';
  onSelectModel: (variant: 'yolo26n' | 'yolo26s' | 'fallback') => void;
  visualConfig: VisualConfig;
  onVisualConfigChange: (config: VisualConfig) => void;
  crowdThreshold?: number;
  onCrowdThresholdChange?: (threshold: number) => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  selectedModel,
  onSelectModel,
  visualConfig,
  onVisualConfigChange,
  crowdThreshold = 20,
  onCrowdThresholdChange,
}) => {
  return (
    <div className="flex flex-col gap-6 p-4 lg:p-6 max-w-4xl mx-auto w-full">
      <div className="border-b border-slate-800 pb-4">
        <h2 className="text-xl font-bold tracking-wider text-white font-mono flex items-center gap-2">
          <Settings className="w-5 h-5 text-cyan-400" />
          SYSTEM CONFIGURATION & MODEL PARAMETERS
        </h2>
        <p className="text-xs text-slate-400 mt-1">
          Tune inference engines, visualization parameters, and view crowd safety operating limits.
        </p>
      </div>

      {/* Unified AI Engine Architecture */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-5 flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-white font-mono uppercase flex items-center gap-2">
            <Cpu className="w-4 h-4 text-cyan-400" />
            VISION SENSE AI ENGINE ARCHITECTURE
          </h3>
          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-950/80 border border-emerald-700 text-emerald-300 font-bold">
            INTERNAL PIPELINE
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="p-4 rounded-xl border bg-cyan-950/40 border-cyan-500 shadow-md shadow-cyan-950/50 flex flex-col justify-between gap-3">
            <div>
              <div className="flex items-center justify-between">
                <span className="font-bold text-sm text-white">YOLO26n Engine</span>
                <CheckCircle2 className="w-4 h-4 text-cyan-400" />
              </div>
              <span className="text-[10px] font-mono uppercase text-cyan-400 mt-0.5 block">
                Primary Person Detector
              </span>
              <p className="text-xs text-slate-400 mt-2">
                Ultralytics YOLO26 Nano model with letterbox aspect-ratio preservation and inverse coordinate mapping.
              </p>
            </div>
            <span className="text-[10px] font-mono text-slate-500">Fixed at start • No runtime switching</span>
          </div>

          <div className="p-4 rounded-xl border bg-slate-950/60 border-slate-800 flex flex-col justify-between gap-3">
            <div>
              <div className="flex items-center justify-between">
                <span className="font-bold text-sm text-white">ByteTrack v2</span>
                <CheckCircle2 className="w-4 h-4 text-indigo-400" />
              </div>
              <span className="text-[10px] font-mono uppercase text-indigo-400 mt-0.5 block">
                Multi-Object Tracking
              </span>
              <p className="text-xs text-slate-400 mt-2">
                Kalman state prediction & 2-stage IoU association. Tracks consistent person IDs across all frames.
              </p>
            </div>
            <span className="text-[10px] font-mono text-slate-500">Temporal persistence enabled</span>
          </div>

          <div className="p-4 rounded-xl border bg-slate-950/60 border-slate-800 flex flex-col justify-between gap-3">
            <div>
              <div className="flex items-center justify-between">
                <span className="font-bold text-sm text-white">Optical Flow & Dynamics</span>
                <CheckCircle2 className="w-4 h-4 text-slate-400" />
              </div>
              <span className="text-[10px] font-mono uppercase text-slate-400 mt-0.5 block">
                Dense Motion Estimator
              </span>
              <p className="text-xs text-slate-400 mt-2">
                Continuous luminance differencing combined with velocity vectors for surge and dispersal detection.
              </p>
            </div>
            <span className="text-[10px] font-mono text-slate-500">Autonomous alert triggers</span>
          </div>
        </div>
      </div>

      {/* Crowd Safety Rule Configuration */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-5 flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-white font-mono uppercase flex items-center gap-2">
            <Shield className="w-4 h-4 text-amber-400" />
            CROWD SAFETY POLICY & THRESHOLD LIMIT
          </h3>
          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-950/80 border border-amber-700 text-amber-300 font-bold">
            DEFAULT: 20 PERSONS
          </span>
        </div>

        {/* Interactive Threshold Slider */}
        <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <div className="flex flex-col">
              <span className="text-xs font-mono font-bold text-white uppercase">
                Crowd Warning Trigger Threshold
              </span>
              <span className="text-[11px] font-mono text-slate-400">
                Number of people allowed before raising a WARNING condition.
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-2xl font-mono font-black text-cyan-400">
                {crowdThreshold}
              </span>
              <span className="text-xs font-mono text-slate-400">persons</span>
              {crowdThreshold !== 20 && onCrowdThresholdChange && (
                <button
                  onClick={() => onCrowdThresholdChange(20)}
                  className="text-[10px] font-mono px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors ml-2 cursor-pointer"
                >
                  Reset (20)
                </button>
              )}
            </div>
          </div>

          <input
            type="range"
            min={5}
            max={80}
            step={1}
            value={crowdThreshold}
            onChange={(e) => onCrowdThresholdChange?.(parseInt(e.target.value, 10))}
            className="w-full accent-cyan-500 cursor-pointer h-2 bg-slate-800 rounded-lg"
          />

          <div className="flex items-center justify-between text-[10px] font-mono text-slate-500">
            <span>5 (Low density)</span>
            <span className="text-cyan-400 font-bold">20 (Standard CCTV limit)</span>
            <span>80 (High density)</span>
          </div>
        </div>

        {/* Mathematical Rule Display */}
        <div className="p-4 rounded-lg bg-slate-950 border border-slate-800 flex items-start gap-3">
          <Info className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
          <div className="text-xs text-slate-300 flex flex-col gap-1.5 leading-relaxed">
            <span className="font-bold text-white uppercase font-mono">
              Operating Formula: people_count &le; {crowdThreshold} = NORMAL, people_count &gt; {crowdThreshold} = WARNING
            </span>
            <p className="text-slate-400">
              Calibrated strictly to CCTV safety compliance standards. A density of {crowdThreshold} persons is designated as NORMAL capacity; {crowdThreshold + 1} or more individuals triggers an immediate debounced WARNING state. Only verified person class detections contribute to this count.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

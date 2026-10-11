import React from 'react';
import { BarChart3, TrendingUp, Users, Activity, ShieldAlert, Cpu } from 'lucide-react';
import { TelemetryPoint } from '../types';

interface AnalyticsViewProps {
  telemetryHistory: TelemetryPoint[];
  peakPeople: number;
  totalAlerts: number;
  activeModelName: string;
}

export const AnalyticsView: React.FC<AnalyticsViewProps> = ({
  telemetryHistory,
  peakPeople,
  totalAlerts,
  activeModelName,
}) => {
  const latest = telemetryHistory[telemetryHistory.length - 1];

  // SVG mini-chart generator
  const renderChart = () => {
    if (telemetryHistory.length < 2) {
      return (
        <div className="h-48 flex items-center justify-center text-xs text-slate-500 font-mono">
          Insufficient telemetry data. Play a video to accumulate time-series analytics.
        </div>
      );
    }

    const width = 800;
    const height = 180;
    const padding = 20;

    const maxCount = Math.max(25, ...telemetryHistory.map((p) => p.peopleCount));
    const points = telemetryHistory.map((p, idx) => {
      const x = padding + (idx / (telemetryHistory.length - 1)) * (width - 2 * padding);
      const y = height - padding - (p.peopleCount / maxCount) * (height - 2 * padding);
      return `${x},${y}`;
    });

    const thresholdY = height - padding - (20 / maxCount) * (height - 2 * padding);

    return (
      <div className="relative w-full overflow-hidden">
        <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-48 overflow-visible">
          {/* Safety Threshold Guideline (20 people) */}
          <line
            x1={padding}
            y1={thresholdY}
            x2={width - padding}
            y2={thresholdY}
            stroke="#f59e0b"
            strokeDasharray="4 4"
            strokeWidth="1.5"
          />
          <text x={width - padding - 140} y={thresholdY - 6} fill="#f59e0b" fontSize="10" fontFamily="monospace">
            SAFETY THRESHOLD: 20
          </text>

          {/* Area fill */}
          <polygon
            points={`${padding},${height - padding} ${points.join(' ')} ${width - padding},${height - padding}`}
            fill="rgba(6, 182, 212, 0.15)"
          />

          {/* Line stroke */}
          <polyline
            fill="none"
            stroke="#06b6d4"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            points={points.join(' ')}
          />
        </svg>
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-6 p-4 lg:p-6 max-w-7xl mx-auto w-full">
      <div className="border-b border-slate-800 pb-4">
        <h2 className="text-xl font-bold tracking-wider text-white font-mono flex items-center gap-2">
          <BarChart3 className="w-5 h-5 text-cyan-400" />
          TEMPORAL TELEMETRY & CROWD ANALYTICS
        </h2>
        <p className="text-xs text-slate-400 mt-1">
          Longitudinal density gradients and velocity dynamics tracked in 10 FPS decoupled intervals.
        </p>
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-4">
          <div className="flex items-center justify-between text-slate-400 text-xs">
            <span>Peak Crowd Footfall</span>
            <Users className="w-4 h-4 text-cyan-400" />
          </div>
          <p className="text-3xl font-bold font-mono text-white mt-2">{peakPeople}</p>
          <span className="text-[11px] text-slate-500 font-mono mt-1 block">Maximum simultaneous tracks</span>
        </div>

        <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-4">
          <div className="flex items-center justify-between text-slate-400 text-xs">
            <span>Security Threshold Events</span>
            <ShieldAlert className="w-4 h-4 text-amber-400" />
          </div>
          <p className="text-3xl font-bold font-mono text-amber-300 mt-2">{totalAlerts}</p>
          <span className="text-[11px] text-slate-500 font-mono mt-1 block">&gt;20 threshold crossings</span>
        </div>

        <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-4">
          <div className="flex items-center justify-between text-slate-400 text-xs">
            <span>Current Motion Index</span>
            <Activity className="w-4 h-4 text-emerald-400" />
          </div>
          <p className="text-3xl font-bold font-mono text-white mt-2">
            {latest ? `${Math.round(latest.motionScore * 100)}%` : '—'}
          </p>
          <span className="text-[11px] text-slate-500 font-mono mt-1 block">Lucas-Kanade optical gradient</span>
        </div>

        <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-4">
          <div className="flex items-center justify-between text-slate-400 text-xs">
            <span>Inference Core</span>
            <Cpu className="w-4 h-4 text-indigo-400" />
          </div>
          <p className="text-lg font-bold font-mono text-cyan-300 mt-2 truncate">{activeModelName}</p>
          <span className="text-[11px] text-slate-500 font-mono mt-1 block">End-to-End NMS Free</span>
        </div>
      </div>

      {/* Real-time Density Trend Chart */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-5 shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-4">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-cyan-400" />
            <h3 className="font-bold text-sm text-white font-mono uppercase">
              Real-Time Crowd Density Trend
            </h3>
          </div>
          <span className="text-[11px] font-mono text-slate-400">
            {telemetryHistory.length} Telemetry Frames
          </span>
        </div>

        {renderChart()}
      </div>
    </div>
  );
};

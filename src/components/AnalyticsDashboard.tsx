import React from 'react';
import {
  StatsSnapshot,
  TrackedObject,
  CrossingEvent,
  COCO_CLASSES,
  DEFAULT_COLORS,
} from '../types';
import { Activity, Compass, ArrowUpRight, ArrowDownRight, Gauge, Users, Car } from 'lucide-react';

interface AnalyticsDashboardProps {
  stats: StatsSnapshot;
  objects: TrackedObject[];
  events: CrossingEvent[];
}

export const AnalyticsDashboard: React.FC<AnalyticsDashboardProps> = ({
  stats,
  objects,
  events,
}) => {
  const lineEntries = Object.entries(stats.counter_totals);
  let totalIn = 0;
  let totalOut = 0;
  for (const [, counts] of lineEntries) {
    totalIn += counts.count_in;
    totalOut += counts.count_out;
  }

  return (
    <div id="analytics-dashboard" className="space-y-4">
      {/* Top Metrics Row */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <div id="metric-fps" className="p-3 bg-slate-900/80 rounded-xl border border-slate-800 flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Pipeline FPS</span>
            <Gauge className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold tracking-tight text-emerald-400">
              {stats.fps.toFixed(1)}
            </span>
            <span className="text-xs text-slate-500">fps</span>
          </div>
          <div className="mt-1 text-[11px] text-slate-400 truncate">
            Frame #{stats.frame_count}
          </div>
        </div>

        <div id="metric-active" className="p-3 bg-slate-900/80 rounded-xl border border-slate-800 flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Active Tracks</span>
            <Users className="w-4 h-4 text-sky-400" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold tracking-tight text-sky-400">
              {stats.active_total}
            </span>
            <span className="text-xs text-slate-500">objects</span>
          </div>
          <div className="mt-1 text-[11px] text-slate-400 truncate">
            Peak: {stats.peak_active} concurrent
          </div>
        </div>

        <div id="metric-unique" className="p-3 bg-slate-900/80 rounded-xl border border-slate-800 flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Total Unique</span>
            <Car className="w-4 h-4 text-indigo-400" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold tracking-tight text-indigo-400">
              {stats.total_unique}
            </span>
            <span className="text-xs text-slate-500">lifetime</span>
          </div>
          <div className="mt-1 text-[11px] text-slate-400 truncate">
            ByteTrack persistent IDs
          </div>
        </div>

        <div id="metric-crossings-in" className="p-3 bg-slate-900/80 rounded-xl border border-slate-800 flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Line Crossings (IN)</span>
            <ArrowUpRight className="w-4 h-4 text-amber-400" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold tracking-tight text-amber-400">
              {totalIn}
            </span>
            <span className="text-xs text-slate-500">entries</span>
          </div>
          <div className="mt-1 text-[11px] text-slate-400 truncate">
            {lineEntries.map(([name, c]) => `${name}: ${c.count_in}`).join(', ') || 'No lines'}
          </div>
        </div>

        <div id="metric-crossings-out" className="p-3 bg-slate-900/80 rounded-xl border border-slate-800 flex flex-col justify-between col-span-2 sm:col-span-1">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Line Crossings (OUT)</span>
            <ArrowDownRight className="w-4 h-4 text-rose-400" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold tracking-tight text-rose-400">
              {totalOut}
            </span>
            <span className="text-xs text-slate-500">exits</span>
          </div>
          <div className="mt-1 text-[11px] text-slate-400 truncate">
            Total Traffic: {totalIn + totalOut}
          </div>
        </div>
      </div>

      {/* Main Dual Panels: Active Objects Table & Recent Crossing Events */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Active Objects Table (2 Cols) */}
        <div className="lg:col-span-2 bg-slate-900/80 rounded-xl border border-slate-800 p-4 flex flex-col">
          <div className="flex items-center justify-between pb-3 border-b border-slate-800/80">
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-emerald-400" />
              <h3 className="text-sm font-semibold text-slate-200">Active Tracked Entities</h3>
            </div>
            <span className="text-xs text-slate-400">
              {objects.length} tracked currently
            </span>
          </div>

          <div className="mt-3 overflow-x-auto max-h-60">
            {objects.length === 0 ? (
              <div className="py-8 text-center text-xs text-slate-500">
                No active objects detected in current frame.
              </div>
            ) : (
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="text-slate-400 border-b border-slate-800/60 font-medium">
                    <th className="pb-2 pl-2">ID</th>
                    <th className="pb-2">Class</th>
                    <th className="pb-2">Confidence</th>
                    <th className="pb-2">Speed</th>
                    <th className="pb-2">Heading</th>
                    <th className="pb-2">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/40">
                  {objects.map((obj) => {
                    const color = DEFAULT_COLORS[obj.class_id] ?? '#94a3b8';
                    const className = COCO_CLASSES[obj.class_id] ?? `Class ${obj.class_id}`;
                    return (
                      <tr key={obj.track_id} className="hover:bg-slate-800/40">
                        <td className="py-2 pl-2 font-mono font-bold text-slate-300">
                          #{obj.track_id}
                        </td>
                        <td className="py-2">
                          <span
                            className="px-2 py-0.5 rounded text-[11px] font-medium"
                            style={{
                              backgroundColor: `${color}20`,
                              color: color,
                              border: `1px solid ${color}40`,
                            }}
                          >
                            {className}
                          </span>
                        </td>
                        <td className="py-2 font-mono text-slate-300">
                          {(obj.confidence * 100).toFixed(0)}%
                        </td>
                        <td className="py-2 font-mono text-slate-300">
                          {obj.speed_ps.toFixed(1)} px/s
                        </td>
                        <td className="py-2">
                          <div className="flex items-center gap-1 text-slate-300">
                            <Compass className="w-3 h-3 text-slate-400" />
                            <span className="font-mono font-semibold">{obj.direction}</span>
                          </div>
                        </td>
                        <td className="py-2">
                          {obj.is_stationary ? (
                            <span className="text-[10px] text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded">
                              Stationary
                            </span>
                          ) : (
                            <span className="text-[10px] text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded">
                              Moving
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Real-time Crossing Events Feed (1 Col) */}
        <div className="bg-slate-900/80 rounded-xl border border-slate-800 p-4 flex flex-col">
          <div className="flex items-center justify-between pb-3 border-b border-slate-800/80">
            <h3 className="text-sm font-semibold text-slate-200">Line Crossing Log</h3>
            <span className="text-[11px] text-slate-400">{events.length} recorded</span>
          </div>

          <div className="mt-3 overflow-y-auto max-h-60 space-y-2 pr-1">
            {events.length === 0 ? (
              <div className="py-8 text-center text-xs text-slate-500">
                No virtual line crossing events yet.
              </div>
            ) : (
              events.slice(0, 30).map((ev) => {
                const color = DEFAULT_COLORS[ev.class_id] ?? '#94a3b8';
                return (
                  <div
                    key={ev.id}
                    className="flex items-center justify-between p-2 rounded-lg bg-slate-950/60 border border-slate-800/60 text-xs"
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                          ev.direction === 'in'
                            ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                            : 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                        }`}
                      >
                        {ev.direction}
                      </span>
                      <div className="flex flex-col">
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono text-slate-300 font-semibold">
                            #{ev.track_id}
                          </span>
                          <span className="text-[11px]" style={{ color }}>
                            {ev.class_name}
                          </span>
                        </div>
                        <span className="text-[10px] text-slate-500">
                          {ev.line_name} • Frame #{ev.frame_idx}
                        </span>
                      </div>
                    </div>
                    <span className="text-[10px] font-mono text-slate-500">
                      {new Date(ev.timestamp).toLocaleTimeString()}
                    </span>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

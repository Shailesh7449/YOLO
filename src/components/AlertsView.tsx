import React, { useState } from 'react';
import { Bell, AlertTriangle, ShieldCheck, Filter, Search, PlayCircle } from 'lucide-react';
import { VisionSenseAlert } from '../types';

interface AlertsViewProps {
  alerts: VisionSenseAlert[];
  onSelectAlert: (timestamp: number) => void;
}

export const AlertsView: React.FC<AlertsViewProps> = ({ alerts, onSelectAlert }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [severityFilter, setSeverityFilter] = useState<'ALL' | 'CRITICAL' | 'WARNING'>('ALL');

  const filtered = alerts.filter((a) => {
    const matchesSearch = a.message.toLowerCase().includes(searchTerm.toLowerCase()) || a.type.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesSev = severityFilter === 'ALL' || a.severity === severityFilter;
    return matchesSearch && matchesSev;
  });

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div className="flex flex-col gap-5 p-4 lg:p-6 max-w-7xl mx-auto w-full">
      {/* View Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-4">
        <div>
          <h2 className="text-xl font-bold tracking-wider text-white font-mono flex items-center gap-2">
            <Bell className="w-5 h-5 text-cyan-400" />
            SECURITY INCIDENTS & ALERTS LOG
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Real-time automated incident detection triggered by crowd thresholds, physical violence, and movement surges.
          </p>
        </div>

        {/* Filter Bar */}
        <div className="flex items-center flex-wrap gap-2 w-full sm:w-auto">
          <div className="relative flex-1 sm:flex-initial">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              type="text"
              placeholder="Search incidents..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="bg-slate-900 border border-slate-800 rounded-lg pl-8 pr-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500 w-full sm:w-48"
            />
          </div>
          <select
            value={severityFilter}
            onChange={(e: any) => setSeverityFilter(e.target.value)}
            className="bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-300 focus:outline-none focus:border-cyan-500"
          >
            <option value="ALL">All Severities</option>
            <option value="CRITICAL">Critical Violence Only</option>
            <option value="WARNING">Warnings Only</option>
          </select>
        </div>
      </div>

      {/* Alerts Table / Cards */}
      {filtered.length === 0 ? (
        <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-12 flex flex-col items-center justify-center text-center">
          <ShieldCheck className="w-12 h-12 text-slate-600 mb-3" />
          <h3 className="text-base font-bold text-white">No Incidents Found</h3>
          <p className="text-xs text-slate-400 mt-1 max-w-md">
            No incidents match your current filter criteria or have occurred in the active video feed.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-2.5">
          {filtered.map((alert) => (
            <div
              key={alert.id}
              onClick={() => onSelectAlert(alert.timestamp)}
              className="p-4 rounded-xl bg-slate-900/80 hover:bg-slate-800/90 border border-slate-800 hover:border-cyan-500/40 transition-all flex items-center justify-between gap-4 cursor-pointer group"
            >
              <div className="flex items-center gap-3.5">
                <div
                  className={`p-2 rounded-lg shrink-0 ${
                    alert.severity === 'CRITICAL'
                      ? 'bg-rose-950/90 border border-rose-700 text-rose-400'
                      : 'bg-amber-950/80 border border-amber-800/80 text-amber-400'
                  }`}
                >
                  <AlertTriangle className="w-4 h-4" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-bold text-cyan-400">
                      [{formatTime(alert.timestamp)}]
                    </span>
                    <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded bg-slate-950 text-slate-300 border border-slate-800 font-medium">
                      {alert.type.replace(/_/g, ' ')}
                    </span>
                    <span
                      className={`text-[10px] font-mono px-1.5 py-0.5 rounded border ${
                        alert.severity === 'CRITICAL'
                          ? 'bg-rose-950 text-rose-300 border-rose-600 font-bold animate-pulse'
                          : 'bg-amber-950 text-amber-400 border-amber-800'
                      }`}
                    >
                      {alert.severity}
                    </span>
                  </div>
                  <p className="text-sm text-slate-200 font-medium mt-1 group-hover:text-white">
                    {alert.message}
                  </p>
                  <div className="flex items-center gap-3 text-[11px] text-slate-500 font-mono mt-1">
                    <span>Frame: {alert.frame}</span>
                    <span>•</span>
                    <span>People Detected: {alert.peopleCount}</span>
                    <span>•</span>
                    <span>Motion Index: {(alert.motionScore * 100).toFixed(0)}%</span>
                  </div>
                </div>
              </div>

              <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 group-hover:bg-cyan-600 text-slate-300 group-hover:text-white text-xs font-medium transition-colors shrink-0">
                <PlayCircle className="w-4 h-4" />
                <span>Jump to Video</span>
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

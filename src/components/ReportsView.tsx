import React from 'react';
import { FileText, Download, ShieldCheck, AlertTriangle, CheckCircle2, Clock } from 'lucide-react';
import { VisionSenseAlert, TelemetryPoint, VideoMetadata } from '../types';

interface ReportsViewProps {
  alerts: VisionSenseAlert[];
  telemetryHistory: TelemetryPoint[];
  videoMetadata: VideoMetadata | null;
  peakPeople: number;
}

export const ReportsView: React.FC<ReportsViewProps> = ({
  alerts,
  telemetryHistory,
  videoMetadata,
  peakPeople,
}) => {
  const exportJSON = () => {
    const data = {
      system: 'VisionSense AI Security Operations Center',
      version: 'v26.0',
      timestamp: new Date().toISOString(),
      crowdSafetyRule: 'people_count <= 20 = NORMAL, people_count > 20 = WARNING',
      videoMetadata,
      summary: {
        peakPeopleCount: peakPeople,
        totalAlertsRecorded: alerts.length,
        totalTelemetryFrames: telemetryHistory.length,
      },
      alerts,
      telemetry: telemetryHistory,
    };

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `visionsense-incident-report-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportCSV = () => {
    const headers = 'Alert_ID,Timestamp_Sec,Type,Severity,People_Count,Motion_Score,Message\n';
    const rows = alerts
      .map(
        (a) =>
          `"${a.id}",${a.timestamp},"${a.type}","${a.severity}",${a.peopleCount},${a.motionScore},"${a.message.replace(/"/g, '""')}"`
      )
      .join('\n');

    const blob = new Blob([headers + rows], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `visionsense-incidents-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex flex-col gap-6 p-4 lg:p-6 max-w-7xl mx-auto w-full">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-4">
        <div>
          <h2 className="text-xl font-bold tracking-wider text-white font-mono flex items-center gap-2">
            <FileText className="w-5 h-5 text-cyan-400" />
            CROWD SAFETY & COMPLIANCE REPORT
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Automated compliance auditing against mandatory 20-person crowd safety limits.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={exportCSV}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium border border-slate-700 transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export CSV</span>
          </button>
          <button
            onClick={exportJSON}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold shadow-md shadow-cyan-600/20 transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export JSON Audit</span>
          </button>
        </div>
      </div>

      {/* Audit Executive Summary */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-5">
        <h3 className="text-sm font-bold text-white font-mono uppercase mb-4 flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-emerald-400" />
          Executive Safety Summary
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs font-mono">
          <div className="p-3.5 rounded-lg bg-slate-950/70 border border-slate-800">
            <span className="text-slate-500 block mb-1">CROWD THRESHOLD COMPLIANCE</span>
            <span className={`text-base font-bold ${peakPeople > 20 ? 'text-amber-400' : 'text-emerald-400'}`}>
              {peakPeople > 20 ? 'WARNING TRIGGERED' : 'COMPLIANT (≤20)'}
            </span>
            <p className="text-[11px] text-slate-400 mt-1">
              Peak density reached {peakPeople} individuals.
            </p>
          </div>

          <div className="p-3.5 rounded-lg bg-slate-950/70 border border-slate-800">
            <span className="text-slate-500 block mb-1">TOTAL SAFETY INCIDENTS</span>
            <span className="text-base font-bold text-white">{alerts.length} Events</span>
            <p className="text-[11px] text-slate-400 mt-1">
              Debounced safety alerts recorded during surveillance.
            </p>
          </div>

          <div className="p-3.5 rounded-lg bg-slate-950/70 border border-slate-800">
            <span className="text-slate-500 block mb-1">AI VERIFICATION ENGINE</span>
            <span className="text-base font-bold text-cyan-400">Ultralytics YOLO26</span>
            <p className="text-[11px] text-slate-400 mt-1">
              ByteTrack persistent Kalman filter multi-object tracking.
            </p>
          </div>
        </div>
      </div>

      {/* Model & Architecture Audit Specs */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-5 text-xs text-slate-300">
        <h4 className="font-bold text-white font-mono uppercase mb-2">Model Compliance & Licensing Notice</h4>
        <p className="leading-relaxed text-slate-400">
          In accordance with VisionSense technical specifications, all crowd count telemetry is calculated strictly from genuine person class detections. Non-person detections are excluded from crowd metrics. The core threshold enforces that 20 people represents normal operating capacity, while 21 or more immediately activates safety warning states.
        </p>
        <div className="mt-3 flex items-center gap-2 text-cyan-400 font-mono text-[11px]">
          <CheckCircle2 className="w-3.5 h-3.5" />
          <span>Detailed architecture and benchmark metrics documented in docs/ML_MODELS.md</span>
        </div>
      </div>
    </div>
  );
};

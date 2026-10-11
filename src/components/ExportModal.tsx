import React from 'react';
import { X, FileSpreadsheet, FileJson, FileText, Image, Download } from 'lucide-react';
import { TrajectoryStore } from '../tracking/trajectoryStore';
import { StatsTracker } from '../analytics/statsTracker';
import { LineCounter } from '../analytics/lineCounter';
import { HeatmapGenerator } from '../analytics/heatmapGenerator';
import { ReportGenerator } from '../analytics/reportGenerator';

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  trajectoryStore: TrajectoryStore;
  statsTracker: StatsTracker;
  lineCounter: LineCounter;
  heatmapGen: HeatmapGenerator;
  videoName: string;
}

export const ExportModal: React.FC<ExportModalProps> = ({
  isOpen,
  onClose,
  trajectoryStore,
  statsTracker,
  lineCounter,
  heatmapGen,
  videoName,
}) => {
  if (!isOpen) return null;

  const stem = videoName.replace(/\.[^/.]+$/, '');
  const flatRows = trajectoryStore.toExportList();
  const summary = statsTracker.summary();
  const lineCounts = lineCounter.getCounts();

  const handleExportCSV = () => {
    const csvContent = ReportGenerator.generateCSV(flatRows);
    ReportGenerator.downloadFile(`${stem}_trajectories.csv`, csvContent, 'text/csv');
  };

  const handleExportJSON = () => {
    const jsonContent = ReportGenerator.generateJSON(flatRows);
    ReportGenerator.downloadFile(`${stem}_trajectories.json`, jsonContent, 'application/json');
  };

  const handleExportSummaryTXT = () => {
    const txtContent = ReportGenerator.generateSummaryTXT(
      summary,
      lineCounts,
      flatRows,
      videoName
    );
    ReportGenerator.downloadFile(`${stem}_summary.txt`, txtContent, 'text/plain');
  };

  const handleExportSummaryJSON = () => {
    const jsonContent = ReportGenerator.generateSummaryJSON(summary, lineCounts, videoName);
    ReportGenerator.downloadFile(`${stem}_summary.json`, jsonContent, 'application/json');
  };

  const handleExportHeatmap = () => {
    const dataUrl = heatmapGen.toDataURL();
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = `${stem}_heatmap.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="w-full max-w-lg bg-slate-900 rounded-2xl border border-slate-800 p-6 shadow-2xl space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <div>
            <h3 className="text-base font-semibold text-slate-100">Export Analytics & Reports</h3>
            <p className="text-xs text-slate-400">
              Download tracking reports, coordinate trajectories, and heatmaps.
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-2.5">
          {/* CSV Export */}
          <div className="flex items-center justify-between p-3 rounded-xl bg-slate-950/60 border border-slate-800">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400">
                <FileSpreadsheet className="w-5 h-5" />
              </div>
              <div>
                <div className="text-sm font-semibold text-slate-200">Trajectory Table (CSV)</div>
                <div className="text-xs text-slate-400">
                  {flatRows.length} tracks with ID, duration, start/end coords, speed
                </div>
              </div>
            </div>
            <button
              onClick={handleExportCSV}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium transition"
            >
              <Download className="w-3.5 h-3.5" />
              <span>.CSV</span>
            </button>
          </div>

          {/* JSON Full Trajectory Export */}
          <div className="flex items-center justify-between p-3 rounded-xl bg-slate-950/60 border border-slate-800">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-indigo-500/10 text-indigo-400">
                <FileJson className="w-5 h-5" />
              </div>
              <div>
                <div className="text-sm font-semibold text-slate-200">Full Trajectory Data (JSON)</div>
                <div className="text-xs text-slate-400">
                  Complete frame-by-frame (x, y) centroid sequences
                </div>
              </div>
            </div>
            <button
              onClick={handleExportJSON}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium transition"
            >
              <Download className="w-3.5 h-3.5" />
              <span>.JSON</span>
            </button>
          </div>

          {/* Summary Report TXT */}
          <div className="flex items-center justify-between p-3 rounded-xl bg-slate-950/60 border border-slate-800">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-amber-500/10 text-amber-400">
                <FileText className="w-5 h-5" />
              </div>
              <div>
                <div className="text-sm font-semibold text-slate-200">Executive Summary (TXT)</div>
                <div className="text-xs text-slate-400">
                  Performance, object tallies, line crossings, speed summary
                </div>
              </div>
            </div>
            <button
              onClick={handleExportSummaryTXT}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium transition"
            >
              <Download className="w-3.5 h-3.5" />
              <span>.TXT</span>
            </button>
          </div>

          {/* Summary Report JSON */}
          <div className="flex items-center justify-between p-3 rounded-xl bg-slate-950/60 border border-slate-800">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-sky-500/10 text-sky-400">
                <FileJson className="w-5 h-5" />
              </div>
              <div>
                <div className="text-sm font-semibold text-slate-200">Summary Metrics (JSON)</div>
                <div className="text-xs text-slate-400">
                  Structured dictionary of all aggregated pipeline analytics
                </div>
              </div>
            </div>
            <button
              onClick={handleExportSummaryJSON}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium transition"
            >
              <Download className="w-3.5 h-3.5" />
              <span>.JSON</span>
            </button>
          </div>

          {/* Heatmap PNG */}
          <div className="flex items-center justify-between p-3 rounded-xl bg-slate-950/60 border border-slate-800">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-orange-500/10 text-orange-400">
                <Image className="w-5 h-5" />
              </div>
              <div>
                <div className="text-sm font-semibold text-slate-200">Density Heatmap (PNG)</div>
                <div className="text-xs text-slate-400">
                  High-res 2D spatial movement accumulation map
                </div>
              </div>
            </div>
            <button
              onClick={handleExportHeatmap}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium transition"
            >
              <Download className="w-3.5 h-3.5" />
              <span>.PNG</span>
            </button>
          </div>
        </div>

        <div className="flex justify-end pt-2">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-slate-200 font-medium"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

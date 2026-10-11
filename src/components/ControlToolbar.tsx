import React, { useRef } from 'react';
import {
  Play,
  Pause,
  RotateCcw,
  StepForward,
  Camera,
  Layers,
  Flame,
  GitCommit,
  Sliders,
  BarChart3,
  Download,
  Activity,
  Upload,
} from 'lucide-react';
import { VisualConfig } from '../types';

interface ControlToolbarProps {
  isPlaying: boolean;
  onTogglePlay: () => void;
  onStepFrame: () => void;
  onReset: () => void;
  onSnapshot: () => void;
  visualConfig: VisualConfig;
  onUpdateVisualConfig: (updater: (prev: VisualConfig) => VisualConfig) => void;
  currentSceneId: string;
  onSelectScene: (sceneId: string) => void;
  onFileUpload: (file: File) => void;
  onOpenUploadModal: () => void;
  onToggleWebcam: () => void;
  isWebcamActive: boolean;
  onOpenSettings: () => void;
  onOpenLineManager: () => void;
  onOpenBenchmark: () => void;
  onOpenExport: () => void;
  isRecordingAnnotated?: boolean;
  onToggleRecordAnnotated?: () => void;
}

export const ControlToolbar: React.FC<ControlToolbarProps> = ({
  isPlaying,
  onTogglePlay,
  onStepFrame,
  onReset,
  onSnapshot,
  visualConfig,
  onUpdateVisualConfig,
  currentSceneId,
  onSelectScene,
  onFileUpload,
  onOpenUploadModal,
  onToggleWebcam,
  isWebcamActive,
  onOpenSettings,
  onOpenLineManager,
  onOpenBenchmark,
  onOpenExport,
  isRecordingAnnotated = false,
  onToggleRecordAnnotated,
}) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onFileUpload(file);
    }
  };

  return (
    <div
      id="control-toolbar"
      className="flex flex-wrap items-center justify-between gap-3 p-3 bg-slate-900/90 backdrop-blur-md rounded-xl border border-slate-800 text-sm"
    >
      {/* Playback controls */}
      <div className="flex items-center gap-1.5">
        <button
          id="btn-play-pause"
          onClick={onTogglePlay}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium transition-all cursor-pointer ${
            isPlaying
              ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 hover:bg-amber-500/30'
              : 'bg-emerald-600 text-white hover:bg-emerald-500 shadow-md shadow-emerald-950'
          }`}
          title="Toggle Play / Pause (Key: q)"
        >
          {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 fill-current" />}
          <span>{isPlaying ? 'Pause [q]' : 'Play [q]'}</span>
        </button>

        <button
          id="btn-step-frame"
          onClick={onStepFrame}
          disabled={isPlaying}
          className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 disabled:opacity-40 disabled:hover:bg-slate-800 transition cursor-pointer"
          title="Step one frame forward"
        >
          <StepForward className="w-4 h-4" />
        </button>

        <button
          id="btn-reset-pipeline"
          onClick={onReset}
          className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition cursor-pointer"
          title="Reset tracker, lines, heatmap and trajectory"
        >
          <RotateCcw className="w-4 h-4" />
        </button>

        <button
          id="btn-save-snapshot"
          onClick={onSnapshot}
          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition cursor-pointer"
          title="Save Snapshot PNG (Key: s)"
        >
          <Camera className="w-3.5 h-3.5" />
          <span>Snap [s]</span>
        </button>
      </div>

      {/* Video Source Switcher & Upload Button */}
      <div className="flex items-center gap-2">
        <button
          id="btn-upload-video"
          onClick={onOpenUploadModal}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-mono text-xs font-semibold shadow-md shadow-emerald-950/40 transition cursor-pointer"
          title="Upload surveillance video for verification, preview & analysis"
        >
          <Upload className="w-3.5 h-3.5" />
          <span>UPLOAD VIDEO</span>
        </button>

        <span className="text-xs text-slate-400 font-mono hidden sm:inline">Feed:</span>
        <select
          id="select-video-source"
          value={isWebcamActive ? 'webcam' : currentSceneId}
          onChange={(e) => {
            const val = e.target.value;
            if (val === 'webcam') {
              onToggleWebcam();
            } else if (val === 'upload') {
              onOpenUploadModal();
            } else {
              onSelectScene(val);
            }
          }}
          className="bg-slate-800 border border-slate-700 text-slate-200 text-xs rounded-lg px-2.5 py-1.5 focus:ring-1 focus:ring-emerald-500 focus:outline-none font-mono cursor-pointer"
        >
          <option value="crowded_cctv">Test Video: crowded.mp4 (H.264 Crowd Feed)</option>
          <option value="cctv_normal">CCTV Feed 01: Concourse (Normal, 14 People)</option>
          <option value="cctv_surge">CCTV Feed 02: Gate 4 Surge (Warning, 23 People)</option>
          <option value="bus_demo">Sample Feed: bus.jpg (COCO/YOLO Person)</option>
          <option value="synthetic">Synthetic Smoke-Test (prepare_video.py)</option>
          <option value="upload">Upload Custom Video File (.mp4, .mov)...</option>
          <option value="webcam">Live CCTV Webcam Stream</option>
        </select>

        <input
          ref={fileInputRef}
          type="file"
          accept="video/mp4,video/webm,video/ogg,video/quicktime,image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={handleFileChange}
        />
      </div>

      {/* Layer Toggles (Hotkeys: h, t, b, l, u, v) */}
      <div className="flex items-center gap-1 bg-slate-950/70 p-1 rounded-lg border border-slate-800/80">
        <button
          id="toggle-boxes"
          onClick={() => onUpdateVisualConfig((c) => ({ ...c, show_boxes: !c.show_boxes }))}
          className={`flex items-center gap-1 px-2 py-1 rounded text-xs transition cursor-pointer ${
            visualConfig.show_boxes
              ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
              : 'text-slate-400 hover:text-slate-200'
          }`}
          title="Toggle YOLO Person Boxes [b]"
        >
          <Layers className="w-3.5 h-3.5" />
          <span>Boxes [b]</span>
        </button>

        <button
          id="toggle-trails"
          onClick={() => onUpdateVisualConfig((c) => ({ ...c, show_trails: !c.show_trails }))}
          className={`flex items-center gap-1 px-2 py-1 rounded text-xs transition cursor-pointer ${
            visualConfig.show_trails
              ? 'bg-indigo-500/20 text-indigo-400 border border-indigo-500/30'
              : 'text-slate-400 hover:text-slate-200'
          }`}
          title="Toggle ByteTrack Trails [t]"
        >
          <GitCommit className="w-3.5 h-3.5" />
          <span>Trails [t]</span>
        </button>

        <button
          id="toggle-flow-vectors"
          onClick={() =>
            onUpdateVisualConfig((c) => ({ ...c, show_flow_vectors: !c.show_flow_vectors }))
          }
          className={`flex items-center gap-1 px-2 py-1 rounded text-xs transition cursor-pointer ${
            visualConfig.show_flow_vectors
              ? 'bg-sky-500/20 text-sky-400 border border-sky-500/30'
              : 'text-slate-400 hover:text-slate-200'
          }`}
          title="Toggle Dense Optical Flow Vectors [v]"
        >
          <Activity className="w-3.5 h-3.5" />
          <span>Flow [v]</span>
        </button>

        <button
          id="toggle-heatmap"
          onClick={() =>
            onUpdateVisualConfig((c) => ({ ...c, heatmap_enabled: !c.heatmap_enabled }))
          }
          className={`flex items-center gap-1 px-2 py-1 rounded text-xs transition cursor-pointer ${
            visualConfig.heatmap_enabled
              ? 'bg-orange-500/20 text-orange-400 border border-orange-500/30'
              : 'text-slate-400 hover:text-slate-200'
          }`}
          title="Toggle Movement Heatmap [h]"
        >
          <Flame className="w-3.5 h-3.5" />
          <span>Heatmap [h]</span>
        </button>

        <button
          id="toggle-hud"
          onClick={() => onUpdateVisualConfig((c) => ({ ...c, show_hud: !c.show_hud }))}
          className={`px-2 py-1 rounded text-xs transition cursor-pointer ${
            visualConfig.show_hud
              ? 'bg-slate-700 text-slate-100 font-medium'
              : 'text-slate-400 hover:text-slate-200'
          }`}
          title="Toggle Live HUD [u]"
        >
          HUD [u]
        </button>
      </div>

      {/* Action buttons */}
      <div className="flex items-center gap-1.5">
        <button
          id="btn-open-line-manager"
          onClick={onOpenLineManager}
          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition cursor-pointer text-xs"
          title="Manage Virtual Counting Lines"
        >
          <span>Lines</span>
        </button>

        <button
          id="btn-open-benchmark"
          onClick={onOpenBenchmark}
          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition cursor-pointer text-xs"
          title="Run MOTA / MOTP Speed Benchmark"
        >
          <BarChart3 className="w-3.5 h-3.5 text-indigo-400" />
          <span className="hidden sm:inline">Benchmark</span>
        </button>

        <button
          id="btn-open-settings"
          onClick={onOpenSettings}
          className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition cursor-pointer"
          title="Visual & Tracking Settings"
        >
          <Sliders className="w-4 h-4" />
        </button>

        <button
          id="btn-open-export"
          onClick={onOpenExport}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-medium transition shadow-sm cursor-pointer text-xs"
          title="Export CSV / JSON Reports"
        >
          <Download className="w-3.5 h-3.5" />
          <span>Export</span>
        </button>
      </div>
    </div>
  );
};

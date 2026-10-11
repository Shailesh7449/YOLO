import React from 'react';
import { X, Sliders, Palette, Zap } from 'lucide-react';
import { VisualConfig, ColormapName } from '../types';

interface VisualSettingsPanelProps {
  isOpen: boolean;
  onClose: () => void;
  config: VisualConfig;
  onChange: (updater: (prev: VisualConfig) => VisualConfig) => void;
  trackerConfig: { trackThresh: number; matchThresh: number; trackBuffer: number };
  onTrackerConfigChange: (updater: (prev: any) => any) => void;
}

const COLORMAPS: ColormapName[] = ['HOT', 'JET', 'INFERNO', 'PLASMA', 'TURBO', 'VIRIDIS'];

export const VisualSettingsPanel: React.FC<VisualSettingsPanelProps> = ({
  isOpen,
  onClose,
  config,
  onChange,
  trackerConfig,
  onTrackerConfigChange,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="w-full max-w-lg bg-slate-900 rounded-2xl border border-slate-800 p-5 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <Sliders className="w-4 h-4 text-emerald-400" />
            <h3 className="text-base font-semibold text-slate-100">Tracking & Visual Configuration</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Heatmap Settings */}
        <div className="p-3 bg-slate-950/60 rounded-xl border border-slate-800/80 space-y-3">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-orange-400 uppercase tracking-wider">
            <Palette className="w-3.5 h-3.5" />
            <span>Movement Density Heatmap</span>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-slate-400 block mb-1">Colormap</label>
              <select
                value={config.heatmap_colormap}
                onChange={(e) =>
                  onChange((c) => ({ ...c, heatmap_colormap: e.target.value as ColormapName }))
                }
                className="w-full bg-slate-800 border border-slate-700 text-xs rounded-lg px-2.5 py-1.5 text-slate-200"
              >
                {COLORMAPS.map((cm) => (
                  <option key={cm} value={cm}>
                    {cm}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
                <span>Overlay Alpha</span>
                <span className="font-mono text-slate-300">{((config.heatmap_alpha ?? 0.6) * 100).toFixed(0)}%</span>
              </div>
              <input
                type="range"
                min="0.1"
                max="1.0"
                step="0.05"
                value={config.heatmap_alpha}
                onChange={(e) =>
                  onChange((c) => ({ ...c, heatmap_alpha: parseFloat(e.target.value) }))
                }
                className="w-full accent-orange-500"
              />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
              <span>Gaussian Blur Kernel Size</span>
              <span className="font-mono text-slate-300">{config.heatmap_kernel} px</span>
            </div>
            <input
              type="range"
              min="9"
              max="51"
              step="4"
              value={config.heatmap_kernel}
              onChange={(e) =>
                onChange((c) => ({ ...c, heatmap_kernel: parseInt(e.target.value, 10) }))
              }
              className="w-full accent-orange-500"
            />
          </div>
        </div>

        {/* Trajectory Trail Settings */}
        <div className="p-3 bg-slate-950/60 rounded-xl border border-slate-800/80 space-y-3">
          <div className="text-xs font-semibold text-indigo-400 uppercase tracking-wider">
            Trajectory Trails
          </div>

          <div>
            <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
              <span>Max Trail History Length</span>
              <span className="font-mono text-slate-300">{config.max_trail_length} frames</span>
            </div>
            <input
              type="range"
              min="10"
              max="150"
              step="5"
              value={config.max_trail_length}
              onChange={(e) =>
                onChange((c) => ({ ...c, max_trail_length: parseInt(e.target.value, 10) }))
              }
              className="w-full accent-indigo-500"
            />
          </div>

          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-300">Fade Trail Alpha over Time</span>
            <input
              type="checkbox"
              checked={config.trail_fade}
              onChange={(e) => onChange((c) => ({ ...c, trail_fade: e.target.checked }))}
              className="accent-indigo-500 w-4 h-4 rounded"
            />
          </div>
        </div>

        {/* ByteTrack Engine Parameters */}
        <div className="p-3 bg-slate-950/60 rounded-xl border border-slate-800/80 space-y-3">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-400 uppercase tracking-wider">
            <Zap className="w-3.5 h-3.5" />
            <span>ByteTrack Algorithm Parameters</span>
          </div>

          <div className="space-y-2">
            <div>
              <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
                <span>Detection Confidence Threshold (`track_thresh`)</span>
                <span className="font-mono text-slate-300">{trackerConfig.trackThresh.toFixed(2)}</span>
              </div>
              <input
                type="range"
                min="0.2"
                max="0.8"
                step="0.05"
                value={trackerConfig.trackThresh}
                onChange={(e) =>
                  onTrackerConfigChange((tc: any) => ({
                    ...tc,
                    trackThresh: parseFloat(e.target.value),
                  }))
                }
                className="w-full accent-emerald-500"
              />
            </div>

            <div>
              <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
                <span>IOU Match Association Threshold (`match_thresh`)</span>
                <span className="font-mono text-slate-300">{trackerConfig.matchThresh.toFixed(2)}</span>
              </div>
              <input
                type="range"
                min="0.4"
                max="0.95"
                step="0.05"
                value={trackerConfig.matchThresh}
                onChange={(e) =>
                  onTrackerConfigChange((tc: any) => ({
                    ...tc,
                    matchThresh: parseFloat(e.target.value),
                  }))
                }
                className="w-full accent-emerald-500"
              />
            </div>

            <div>
              <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
                <span>Lost Track Buffer Lifetime (`track_buffer`)</span>
                <span className="font-mono text-slate-300">{trackerConfig.trackBuffer} frames</span>
              </div>
              <input
                type="range"
                min="10"
                max="90"
                step="5"
                value={trackerConfig.trackBuffer}
                onChange={(e) =>
                  onTrackerConfigChange((tc: any) => ({
                    ...tc,
                    trackBuffer: parseInt(e.target.value, 10),
                  }))
                }
                className="w-full accent-emerald-500"
              />
            </div>
          </div>
        </div>

        {/* Close Button */}
        <div className="flex justify-end pt-2">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

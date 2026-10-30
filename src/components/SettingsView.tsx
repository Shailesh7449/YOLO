import React, { useState, useEffect } from 'react';
import {
  Settings,
  Cpu,
  Shield,
  CheckCircle2,
  Info,
  Bell,
  BellRing,
  AlertTriangle,
  Radio,
} from 'lucide-react';
import { VisualConfig } from '../types';
import { notificationService, NotificationPermissionStatus } from '../services/notificationService';

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
  const [permissionStatus, setPermissionStatus] = useState<NotificationPermissionStatus>(() =>
    notificationService.getPermissionStatus()
  );
  const [isRequestingPermission, setIsRequestingPermission] = useState<boolean>(false);
  const [thresholdInput, setThresholdInput] = useState<string>(String(crowdThreshold));

  useEffect(() => {
    setThresholdInput(String(crowdThreshold));
  }, [crowdThreshold]);

  const handleRequestNotification = async () => {
    setIsRequestingPermission(true);
    const result = await notificationService.requestPermission();
    setPermissionStatus(result);
    setIsRequestingPermission(false);
  };

  const handleNumericThresholdChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    setThresholdInput(raw);
    const parsed = parseInt(raw, 10);
    if (!isNaN(parsed) && parsed >= 0) {
      onCrowdThresholdChange?.(parsed);
    }
  };

  return (
    <div className="flex flex-col gap-5 p-3 sm:p-5 lg:p-6 max-w-4xl mx-auto w-full">
      <div className="border-b border-slate-800 pb-4">
        <h2 className="text-lg sm:text-xl font-bold tracking-wider text-white font-mono flex items-center gap-2">
          <Settings className="w-5 h-5 text-cyan-400 shrink-0" />
          <span>SYSTEM CONFIGURATION & MODEL PARAMETERS</span>
        </h2>
        <p className="text-xs text-slate-400 mt-1">
          Tune real-time detection models, security crowd safety rules, and browser notification delivery.
        </p>
      </div>

      {/* Model Selection Architecture */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-4 sm:p-5 flex flex-col gap-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h3 className="text-sm font-bold text-white font-mono uppercase flex items-center gap-2">
            <Cpu className="w-4 h-4 text-cyan-400" />
            <span>DETECTION INFERENCE MODEL SELECTION</span>
          </h3>
          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-cyan-950/80 border border-cyan-700 text-cyan-300 font-bold">
            ONNX RUNTIME WEB
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {/* Option 1: YOLO26n Baseline */}
          <div
            onClick={() => onSelectModel('yolo26n')}
            className={`p-4 rounded-xl border flex flex-col justify-between gap-3 cursor-pointer transition-all ${
              selectedModel === 'yolo26n'
                ? 'bg-cyan-950/50 border-cyan-500 shadow-md shadow-cyan-950/50'
                : 'bg-slate-950/60 border-slate-800 hover:border-slate-700'
            }`}
          >
            <div>
              <div className="flex items-center justify-between">
                <span className="font-bold text-sm text-white">YOLO26n ONNX</span>
                <Radio className={`w-4 h-4 ${selectedModel === 'yolo26n' ? 'text-cyan-400 fill-cyan-400' : 'text-slate-600'}`} />
              </div>
              <span className="text-[10px] font-mono uppercase text-cyan-400 mt-0.5 block font-semibold">
                COCO Baseline (NMS-Free End-to-End)
              </span>
              <p className="text-xs text-slate-400 mt-2 leading-relaxed">
                YOLOv10-Nano architecture trained on full 80-class COCO. Highly resilient against false positives on vehicles, bicycles, and general background objects.
              </p>
            </div>
            <div className="flex items-center justify-between text-[10px] font-mono text-slate-500 pt-2 border-t border-slate-800/80">
              <span>Class 0 Filtering</span>
              <span className={selectedModel === 'yolo26n' ? 'text-cyan-400 font-bold' : ''}>
                {selectedModel === 'yolo26n' ? 'ACTIVE MODEL' : 'Select'}
              </span>
            </div>
          </div>

          {/* Option 2: YOLO26s Surveillance Fine-Tuned */}
          <div
            onClick={() => onSelectModel('yolo26s')}
            className={`p-4 rounded-xl border flex flex-col justify-between gap-3 cursor-pointer transition-all ${
              selectedModel === 'yolo26s'
                ? 'bg-cyan-950/50 border-cyan-500 shadow-md shadow-cyan-950/50'
                : 'bg-slate-950/60 border-slate-800 hover:border-slate-700'
            }`}
          >
            <div>
              <div className="flex items-center justify-between">
                <span className="font-bold text-sm text-white">YOLO26s ONNX (Surveillance)</span>
                <Radio className={`w-4 h-4 ${selectedModel === 'yolo26s' ? 'text-cyan-400 fill-cyan-400' : 'text-slate-600'}`} />
              </div>
              <span className="text-[10px] font-mono uppercase text-indigo-400 mt-0.5 block font-semibold">
                High-Angle CCTV Fine-Tuned (94.3% mAP@50)
              </span>
              <p className="text-xs text-slate-400 mt-2 leading-relaxed">
                YOLOv8 architecture with Non-Maximum Suppression (NMS) fine-tuned on CCTV footage. Exceptional sensitivity on small, distant, and overhead pedestrians.
              </p>
            </div>
            <div className="flex items-center justify-between text-[10px] font-mono text-slate-500 pt-2 border-t border-slate-800/80">
              <span>NMS IoU 0.45 Enabled</span>
              <span className={selectedModel === 'yolo26s' ? 'text-cyan-400 font-bold' : ''}>
                {selectedModel === 'yolo26s' ? 'ACTIVE MODEL' : 'Select'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Action Recognition & Violence Detection Module */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-4 sm:p-5 flex flex-col gap-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h3 className="text-sm font-bold text-white font-mono uppercase flex items-center gap-2">
            <Shield className="w-4 h-4 text-rose-400" />
            <span>ACTION RECOGNITION: VIOLENCE & FIGHT DETECTION</span>
          </h3>
          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-rose-950/80 border border-rose-700 text-rose-300 font-bold">
            RWF-2000 PROTOCOL • 3D CNN
          </span>
        </div>

        <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 flex flex-col gap-3 font-mono">
          <div className="flex items-center justify-between flex-wrap gap-2 border-b border-slate-800/80 pb-2.5">
            <div>
              <span className="text-sm font-bold text-white block">R(2+1)D-18 & X3D-M Dual Backbones</span>
              <span className="text-[10px] text-cyan-400">Spatio-Temporal Video Action Recognition (32 frames @ 224x224)</span>
            </div>
            <span className="px-2.5 py-1 rounded-md bg-emerald-950/80 border border-emerald-600 text-emerald-300 text-xs font-bold">
              ● MODULE ONLINE
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-[11px] text-slate-300 pt-1">
            <div className="bg-slate-900/60 p-2.5 rounded-lg border border-slate-800">
              <span className="text-[10px] text-slate-500 uppercase block">Benchmark Dataset</span>
              <span className="font-bold text-white mt-0.5 block">RWF-2000 CCTV</span>
              <span className="text-[9px] text-cyan-400">F1: 0.93 | Accuracy: 83.3%</span>
            </div>
            <div className="bg-slate-900/60 p-2.5 rounded-lg border border-slate-800">
              <span className="text-[10px] text-slate-500 uppercase block">Active Hardware Acceleration</span>
              <span className="font-bold text-emerald-400 mt-0.5 block">GTX 1650 (CUDA)</span>
              <span className="text-[9px] text-slate-400">GPU Latency: 21.0ms</span>
            </div>
            <div className="bg-slate-900/60 p-2.5 rounded-lg border border-slate-800">
              <span className="text-[10px] text-slate-500 uppercase block">Alert Protocol</span>
              <span className="font-bold text-rose-400 mt-0.5 block">CRITICAL ALERT</span>
              <span className="text-[9px] text-slate-400">Threshold: 0.50 | 2-win debounced</span>
            </div>
          </div>

          <p className="text-[10px] text-slate-400 leading-relaxed border-t border-slate-800/60 pt-2">
            <strong>Architecture Note:</strong> Fully independent spatio-temporal video-action module decoupled from person detection and crowd density. Weapon detection (guns, knives, rods) is strictly out of scope. Licensed under MIT (visionlab-ai/school-violence-detection-models).
          </p>
        </div>
      </div>

      {/* Crowd Safety Rule Configuration */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-4 sm:p-5 flex flex-col gap-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h3 className="text-sm font-bold text-white font-mono uppercase flex items-center gap-2">
            <Shield className="w-4 h-4 text-amber-400" />
            <span>CROWD SAFETY POLICY & THRESHOLD LIMIT</span>
          </h3>
          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-950/80 border border-amber-700 text-amber-300 font-bold">
            RULE: COUNT &gt; LIMIT
          </span>
        </div>

        {/* Interactive Threshold Slider & Input Box */}
        <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 flex flex-col gap-3">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex flex-col">
              <span className="text-xs font-mono font-bold text-white uppercase">
                Crowd Warning Trigger Threshold
              </span>
              <span className="text-[11px] font-mono text-slate-400">
                Number of people permitted before raising a WARNING security event.
              </span>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={0}
                max={500}
                value={thresholdInput}
                onChange={handleNumericThresholdChange}
                className="w-16 px-2 py-1 bg-slate-900 border border-cyan-500 text-cyan-400 font-mono font-black text-center text-lg rounded-lg focus:outline-none focus:ring-1 focus:ring-cyan-400"
              />
              <span className="text-xs font-mono text-slate-400">persons</span>
              {crowdThreshold !== 20 && onCrowdThresholdChange && (
                <button
                  onClick={() => onCrowdThresholdChange(20)}
                  className="text-[10px] font-mono px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors cursor-pointer"
                >
                  Reset (20)
                </button>
              )}
            </div>
          </div>

          <input
            type="range"
            min={1}
            max={60}
            step={1}
            value={crowdThreshold}
            onChange={(e) => onCrowdThresholdChange?.(parseInt(e.target.value, 10))}
            className="w-full accent-cyan-500 cursor-pointer h-2 bg-slate-800 rounded-lg"
          />

          <div className="flex items-center justify-between text-[10px] font-mono text-slate-500">
            <span>1 (Strict / Solo Area)</span>
            <span className="text-cyan-400 font-bold">{crowdThreshold} (Current Policy)</span>
            <span>60+ (Dense Concourse)</span>
          </div>
        </div>

        {/* Mathematical Rule Display */}
        <div className="p-4 rounded-lg bg-slate-950 border border-slate-800 flex items-start gap-3">
          <Info className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
          <div className="text-xs text-slate-300 flex flex-col gap-1.5 leading-relaxed">
            <span className="font-bold text-white uppercase font-mono">
              Operating Formula: detected_count &le; {crowdThreshold} = NORMAL • detected_count &gt; {crowdThreshold} = WARNING
            </span>
            <p className="text-slate-400 text-[11px]">
              Exact threshold rule: {crowdThreshold} detected people is evaluated as NORMAL capacity. At {crowdThreshold + 1} or more people, a structured security alert event is generated once upon entering the exceeded state. Duplicate notifications are suppressed while the count remains above {crowdThreshold}.
            </p>
          </div>
        </div>
      </div>

      {/* Browser Desktop Notification Delivery Foundation */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-4 sm:p-5 flex flex-col gap-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h3 className="text-sm font-bold text-white font-mono uppercase flex items-center gap-2">
            <Bell className="w-4 h-4 text-cyan-400" />
            <span>BROWSER DESKTOP NOTIFICATION DISPATCH</span>
          </h3>
          <span
            className={`text-[10px] font-mono px-2 py-0.5 rounded font-bold uppercase ${
              permissionStatus === 'granted'
                ? 'bg-emerald-950/80 border border-emerald-700 text-emerald-300'
                : permissionStatus === 'denied'
                ? 'bg-rose-950/80 border border-rose-700 text-rose-300'
                : 'bg-amber-950/80 border border-amber-700 text-amber-300'
            }`}
          >
            {permissionStatus === 'granted'
              ? 'ENABLED (SYSTEM)'
              : permissionStatus === 'denied'
              ? 'BLOCKED BY BROWSER'
              : permissionStatus === 'unsupported'
              ? 'NOT SUPPORTED'
              : 'PERM REQUIRED'}
          </span>
        </div>

        <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex flex-col gap-1">
            <span className="text-xs font-mono font-bold text-white uppercase flex items-center gap-1.5">
              <BellRing className="w-3.5 h-3.5 text-cyan-400" />
              OS Desktop Alerts for Security Incidents
            </span>
            <p className="text-[11px] font-mono text-slate-400 leading-relaxed max-w-lg">
              Deliver desktop / OS notifications immediately when crowd limit is exceeded on any active video or live camera. Requires explicit operator permission.
            </p>
          </div>

          <div>
            {permissionStatus === 'granted' ? (
              <div className="flex items-center gap-1.5 text-xs text-emerald-400 font-mono font-bold bg-emerald-950/60 border border-emerald-800 px-3 py-2 rounded-xl">
                <CheckCircle2 className="w-4 h-4" />
                <span>NOTIFICATIONS ACTIVE</span>
              </div>
            ) : permissionStatus === 'unsupported' ? (
              <span className="text-xs text-slate-500 font-mono">Browser Notification API unavailable</span>
            ) : (
              <button
                onClick={handleRequestNotification}
                disabled={isRequestingPermission}
                className="px-4 py-2 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-black font-extrabold font-mono text-xs shadow-md shadow-cyan-500/25 transition-all transform active:scale-95 cursor-pointer whitespace-nowrap"
              >
                {isRequestingPermission ? 'REQUESTING...' : 'ENABLE NOTIFICATIONS'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

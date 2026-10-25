import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Camera,
  VideoOff,
  Play,
  Pause,
  RefreshCw,
  AlertTriangle,
  ShieldCheck,
  Activity,
  Cpu,
  Eye,
  Sliders,
  CheckCircle2,
  XCircle,
  Wifi,
  Radio,
  Layers,
} from 'lucide-react';
import { detectorManager } from '../tracking/detectorManager';
import { ByteTracker } from '../tracking/bytetrack';
import { RawDetection, TrackedObject, CrowdSafetyStatus, VisionSenseAlert } from '../types';
import { notificationService } from '../services/notificationService';

interface LiveCameraViewProps {
  crowdThreshold: number;
  onAlertTriggered?: (alert: VisionSenseAlert) => void;
  activeModelName?: string;
}

interface VideoDevice {
  deviceId: string;
  label: string;
}

export const LiveCameraView: React.FC<LiveCameraViewProps> = ({
  crowdThreshold = 20,
  onAlertTriggered,
  activeModelName = 'YOLO26n ONNX (End-to-End NMS-Free)',
}) => {
  // Camera & Stream State
  const [cameraMode, setCameraMode] = useState<'webcam' | 'rtsp'>('webcam');
  const [availableDevices, setAvailableDevices] = useState<VideoDevice[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('');
  const [rtspUrl, setRtspUrl] = useState<string>('rtsp://127.0.0.1:8554/live');
  const [streamState, setStreamState] = useState<'STOPPED' | 'CONNECTING' | 'STREAMING' | 'PAUSED' | 'ERROR'>('STOPPED');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Live Performance & Analytics Telemetry
  const [fps, setFps] = useState<number>(0);
  const [inferenceLatencyMs, setInferenceLatencyMs] = useState<number>(0);
  const [peopleCount, setPeopleCount] = useState<number>(0);
  const [crowdStatus, setCrowdStatus] = useState<CrowdSafetyStatus>('NORMAL');
  const [activeTracks, setActiveTracks] = useState<TrackedObject[]>([]);
  const [lastFrameTime, setLastFrameTime] = useState<string>('--:--:--');
  const [recentLiveAlerts, setRecentLiveAlerts] = useState<VisionSenseAlert[]>([]);

  // Live Spatio-Temporal Violence Detection State
  const [violenceStatus, setViolenceStatus] = useState<'NORMAL' | 'DETECTED'>('NORMAL');
  const [violenceConfidence, setViolenceConfidence] = useState<number>(0);
  const [violenceModel, setViolenceModel] = useState<string>('R(2+1)D-18 (RWF-2000)');

  // Overlay Settings
  const [showBoxes, setShowBoxes] = useState<boolean>(true);
  const [showIds, setShowIds] = useState<boolean>(true);
  const [showTrails, setShowTrails] = useState<boolean>(true);
  const [showHud, setShowHud] = useState<boolean>(true);
  const [confThreshold, setConfThreshold] = useState<number>(0.28);

  // References
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const trackerRef = useRef<ByteTracker>(new ByteTracker(0.20, 0.35, 0.30, 30, 1));
  const isRunningRef = useRef<boolean>(false);
  const isPausedRef = useRef<boolean>(false);
  const isInferringRef = useRef<boolean>(false);
  const animFrameIdRef = useRef<number | null>(null);
  const lastAlertTimestampRef = useRef<number>(0);
  const fpsFrameCountRef = useRef<number>(0);
  const fpsLastTimeRef = useRef<number>(performance.now());
  const previousStatusRef = useRef<CrowdSafetyStatus>('NORMAL');
  const frameSnapshotsRef = useRef<string[]>([]);
  const lastViolenceCheckTimeRef = useRef<number>(0);
  const offscreenCanvasRef = useRef<HTMLCanvasElement | null>(null);

  // Enumerate video devices on mount
  const refreshDevices = useCallback(async () => {
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) {
        setErrorMessage('Browser mediaDevices API not supported in this environment.');
        return;
      }
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoInputs = devices
        .filter((d) => d.kind === 'videoinput')
        .map((d, index) => ({
          deviceId: d.deviceId,
          label: d.label || `Camera ${index + 1} (${d.deviceId.slice(0, 8)}...)`,
        }));

      setAvailableDevices(videoInputs);
      if (videoInputs.length > 0 && !selectedDeviceId) {
        setSelectedDeviceId(videoInputs[0].deviceId);
      }
    } catch (err: any) {
      console.warn('[LiveCamera] Device enumeration error:', err);
    }
  }, [selectedDeviceId]);

  useEffect(() => {
    refreshDevices();
  }, [refreshDevices]);

  // Clean stop helper
  const stopStream = useCallback(() => {
    isRunningRef.current = false;
    isPausedRef.current = false;
    if (animFrameIdRef.current) {
      cancelAnimationFrame(animFrameIdRef.current);
      animFrameIdRef.current = null;
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }

    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }

    trackerRef.current.reset();
    setActiveTracks([]);
    setPeopleCount(0);
    setCrowdStatus('NORMAL');
    setFps(0);
    setInferenceLatencyMs(0);
    setStreamState('STOPPED');
  }, []);

  // Ensure stream stops on component unmount
  useEffect(() => {
    return () => {
      stopStream();
    };
  }, [stopStream]);

  // Start live webcam capture
  const startWebcam = useCallback(async () => {
    stopStream();
    setErrorMessage(null);
    setStreamState('CONNECTING');

    try {
      // Initialize YOLO Detector if not already initialized
      if (detectorManager.getStatus() !== 'READY') {
        await detectorManager.init();
      }

      const constraints: MediaStreamConstraints = {
        video: selectedDeviceId
          ? { deviceId: { exact: selectedDeviceId }, width: { ideal: 1280 }, height: { ideal: 720 } }
          : { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' },
        audio: false,
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;

      // Re-enumerate devices after permission grant to get human-readable labels
      refreshDevices();

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      trackerRef.current = new ByteTracker(0.20, 0.35, 0.30, 30, 1);
      isRunningRef.current = true;
      isPausedRef.current = false;
      setStreamState('STREAMING');
      fpsLastTimeRef.current = performance.now();
      fpsFrameCountRef.current = 0;
    } catch (err: any) {
      console.error('[LiveCamera] Access error:', err);
      let msg = 'Failed to access camera: ' + (err.message || err.name);
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        msg = 'Camera permission was denied. Please allow camera access in your browser settings (click lock icon in address bar) and click Start again.';
      } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        msg = 'No video camera detected on your system. Please plug in a USB webcam and retry.';
      } else if (err.name === 'NotReadableError' || err.name === 'TrackStartError') {
        msg = 'Camera is currently in use by another application. Please close other software accessing the webcam and retry.';
      }
      setErrorMessage(msg);
      setStreamState('ERROR');
    }
  }, [selectedDeviceId, stopStream, refreshDevices]);

  // Pause / Resume Stream
  const togglePause = useCallback(() => {
    if (streamState === 'STREAMING') {
      isPausedRef.current = true;
      setStreamState('PAUSED');
    } else if (streamState === 'PAUSED') {
      isPausedRef.current = false;
      setStreamState('STREAMING');
    }
  }, [streamState]);

  // Main Live Inference & Tracking Render Loop
  useEffect(() => {
    if (streamState !== 'STREAMING' && streamState !== 'PAUSED') return;

    let frameStride = 0;

    const processLiveFrame = async () => {
      if (!isRunningRef.current) return;

      const video = videoRef.current;
      const canvas = canvasRef.current;

      if (!video || !canvas || video.readyState < 2 || video.paused || video.ended) {
        animFrameIdRef.current = requestAnimationFrame(processLiveFrame);
        return;
      }

      const now = performance.now();
      fpsFrameCountRef.current++;
      if (now - fpsLastTimeRef.current >= 1000) {
        setFps(Math.round((fpsFrameCountRef.current * 1000) / (now - fpsLastTimeRef.current)));
        fpsFrameCountRef.current = 0;
        fpsLastTimeRef.current = now;
      }

      // Match canvas dimensions to video render size
      const width = video.videoWidth || 1280;
      const height = video.videoHeight || 720;
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        animFrameIdRef.current = requestAnimationFrame(processLiveFrame);
        return;
      }

      // Draw clear overlay
      ctx.clearRect(0, 0, width, height);

      // Perform inference at controlled stride (every 2nd or 3rd frame to avoid latency lag)
      frameStride++;
      if (!isPausedRef.current && !isInferringRef.current && frameStride % 2 === 0) {
        isInferringRef.current = true;
        const tStart = performance.now();

        try {
          // 1. Real YOLO person detection
          const rawDets = await detectorManager.detect(video, width, height);
          const tLatency = Math.round(performance.now() - tStart);
          setInferenceLatencyMs(tLatency);

          // 2. Filter for person class with confidence threshold
          const filteredRaw: RawDetection[] = [];
          for (const d of rawDets) {
            if (d.class_id === 0 && d.confidence >= confThreshold) {
              filteredRaw.push([d.bbox[0], d.bbox[1], d.bbox[2], d.bbox[3], d.confidence, d.class_id]);
            }
          }

          // 3. Update ByteTrack multi-object tracker
          const tracked = trackerRef.current.update(filteredRaw);
          setActiveTracks(tracked);

          // 4. Exact Crowd Safety Rule: <= 20 NORMAL (Green), > 20 WARNING (Amber)
          const currentCount = tracked.length;
          setPeopleCount(currentCount);

          const status: CrowdSafetyStatus = currentCount > crowdThreshold ? 'WARNING' : 'NORMAL';
          setCrowdStatus(status);

          const nowTime = new Date().toLocaleTimeString();
          setLastFrameTime(nowTime);

          // 5. Trigger Crowd Warning Alert via centralized notificationService
          const nowSec = now / 1000;
          const streamSourceId = cameraMode === 'webcam' ? (selectedDeviceId || 'live_camera') : (rtspUrl || 'live_rtsp');
          const streamLabel = cameraMode === 'webcam' ? 'Live Webcam Stream' : 'Live RTSP Stream';
          
          const secEvent = notificationService.evaluateCrowdThreshold(
            streamSourceId,
            streamLabel,
            currentCount,
            crowdThreshold,
            nowSec,
            5 // 5s cooldown
          );

          if (secEvent) {
            const newAlert: VisionSenseAlert = {
              id: secEvent.id,
              type: 'CROWD_THRESHOLD_EXCEEDED',
              severity: 'WARNING',
              message: secEvent.message,
              timestamp: nowSec,
              frame: frameStride,
              peopleCount: currentCount,
              motionScore: 0.5,
            };

            setRecentLiveAlerts((prev) => [newAlert, ...prev.slice(0, 19)]);
            if (onAlertTriggered) {
              onAlertTriggered(newAlert);
            }
          }

          // Emit recovery notification if crowd clears below threshold
          if (previousStatusRef.current === 'WARNING' && status === 'NORMAL') {
            const recoveryAlert: VisionSenseAlert = {
              id: `recovery_${Date.now()}`,
              type: 'UNUSUAL_MOVEMENT',
              severity: 'NORMAL',
              message: `CROWD SAFETY RESTORED: Count stabilized at ${currentCount} persons (Threshold: ${crowdThreshold}).`,
              timestamp: nowSec,
              frame: frameStride,
              peopleCount: currentCount,
              motionScore: 0.1,
            };
            setRecentLiveAlerts((prev) => [recoveryAlert, ...prev.slice(0, 19)]);
          }
          previousStatusRef.current = status;

          // 6. Live Spatio-Temporal Violence Detection: sample 224x224 frame into rolling buffer
          if (frameStride % 4 === 0 && video) {
            try {
              if (!offscreenCanvasRef.current) {
                offscreenCanvasRef.current = document.createElement('canvas');
                offscreenCanvasRef.current.width = 224;
                offscreenCanvasRef.current.height = 224;
              }
              const offCtx = offscreenCanvasRef.current.getContext('2d');
              if (offCtx) {
                offCtx.drawImage(video, 0, 0, 224, 224);
                const b64 = offscreenCanvasRef.current.toDataURL('image/jpeg', 0.65);
                frameSnapshotsRef.current.push(b64);
                if (frameSnapshotsRef.current.length > 32) {
                  frameSnapshotsRef.current.shift();
                }
              }
            } catch {}
          }

          // Evaluate violence window every 2.5s if >= 16 frames buffered
          if (
            frameSnapshotsRef.current.length >= 16 &&
            nowSec - lastViolenceCheckTimeRef.current >= 2.5
          ) {
            lastViolenceCheckTimeRef.current = nowSec;
            const sampleFrames = frameSnapshotsRef.current.slice(-16);
            fetch('/api/violence/predict', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                frames: sampleFrames,
                source_id: streamSourceId,
                timestamps: sampleFrames.map((_, idx) => nowSec - (16 - idx) * 0.15),
              }),
            })
              .then((r) => r.json())
              .then((data) => {
                if (data?.prediction) {
                  const pred = data.prediction;
                  setViolenceModel(pred.model_name || 'R(2+1)D-18 / X3D-M');
                  setViolenceConfidence(pred.confidence || 0);

                  if (pred.is_violence) {
                    setViolenceStatus('DETECTED');
                    const vSecEvent = notificationService.evaluateViolenceIncident(
                      streamSourceId,
                      streamLabel,
                      true,
                      pred.confidence,
                      nowSec,
                      pred.model_name
                    );
                    if (vSecEvent) {
                      const vAlert: VisionSenseAlert = {
                        id: vSecEvent.id,
                        type: 'VIOLENCE_DETECTED',
                        severity: 'CRITICAL',
                        message: vSecEvent.message,
                        timestamp: nowSec,
                        frame: frameStride,
                        peopleCount: currentCount,
                        motionScore: 0.85,
                      };
                      setRecentLiveAlerts((prev) => [vAlert, ...prev.slice(0, 19)]);
                      if (onAlertTriggered) onAlertTriggered(vAlert);
                    }
                  } else {
                    setViolenceStatus('NORMAL');
                    notificationService.evaluateViolenceIncident(
                      streamSourceId,
                      streamLabel,
                      false,
                      pred.confidence,
                      nowSec
                    );
                  }
                }
              })
              .catch(() => {});
          }
        } catch (inferErr) {
          console.warn('[LiveCamera] Inference cycle error:', inferErr);
        } finally {
          isInferringRef.current = false;
        }
      }

      // Render Visual Annotations on Canvas Overlay
      if (activeTracks.length > 0) {
        for (const track of activeTracks) {
          const [x1, y1, x2, y2] = track.bbox;
          const boxW = x2 - x1;
          const boxH = y2 - y1;
          const isWarning = crowdStatus === 'WARNING';
          const primaryColor = isWarning ? '#f59e0b' : '#06b6d4'; // Amber or Cyan
          const badgeBg = isWarning ? 'rgba(245, 158, 11, 0.9)' : 'rgba(6, 182, 212, 0.9)';

          // Trajectory trails
          if (showTrails && track.history && track.history.length > 1) {
            ctx.beginPath();
            ctx.lineWidth = 2;
            ctx.strokeStyle = primaryColor;
            ctx.globalAlpha = 0.6;
            for (let h = 0; h < track.history.length; h++) {
              const pt = track.history[h];
              if (h === 0) ctx.moveTo(pt[0], pt[1]);
              else ctx.lineTo(pt[0], pt[1]);
            }
            ctx.stroke();
            ctx.globalAlpha = 1.0;
          }

          // Bounding box
          if (showBoxes) {
            ctx.lineWidth = 2.5;
            ctx.strokeStyle = primaryColor;
            ctx.strokeRect(x1, y1, boxW, boxH);

            // Corner brackets
            const cornerLen = Math.min(12, boxW / 4, boxH / 4);
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 2;
            // Top-left
            ctx.beginPath();
            ctx.moveTo(x1, y1 + cornerLen);
            ctx.lineTo(x1, y1);
            ctx.lineTo(x1 + cornerLen, y1);
            ctx.stroke();
            // Bottom-right
            ctx.beginPath();
            ctx.moveTo(x2, y2 - cornerLen);
            ctx.lineTo(x2, y2);
            ctx.lineTo(x2 - cornerLen, y2);
            ctx.stroke();
          }

          // Identification & Confidence Badge
          if (showIds) {
            const labelText = `ID #${track.track_id} | ${Math.round(track.confidence * 100)}%`;
            ctx.font = 'bold 11px JetBrains Mono, monospace';
            const textMetrics = ctx.measureText(labelText);
            const badgeW = textMetrics.width + 10;
            const badgeH = 18;

            ctx.fillStyle = badgeBg;
            ctx.fillRect(x1, Math.max(0, y1 - badgeH), badgeW, badgeH);

            ctx.fillStyle = '#000000';
            ctx.fillText(labelText, x1 + 5, Math.max(12, y1 - 4));
          }
        }
      }

      // Draw Safety Border when crowd threshold is exceeded
      if (crowdStatus === 'WARNING') {
        ctx.strokeStyle = 'rgba(245, 158, 11, 0.7)';
        ctx.lineWidth = 8;
        ctx.strokeRect(0, 0, width, height);
      }

      animFrameIdRef.current = requestAnimationFrame(processLiveFrame);
    };

    animFrameIdRef.current = requestAnimationFrame(processLiveFrame);

    return () => {
      if (animFrameIdRef.current) {
        cancelAnimationFrame(animFrameIdRef.current);
      }
    };
  }, [streamState, crowdThreshold, confThreshold, showBoxes, showIds, showTrails, activeTracks, crowdStatus, onAlertTriggered]);

  return (
    <div className="flex flex-col gap-4 w-full">
      {/* Control Bar: Source Selection & Stream Commands */}
      <div className="bg-[#0b101e] border-2 border-slate-800 rounded-xl p-4 flex flex-wrap items-center justify-between gap-3 shadow-lg">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center bg-[#070b14] border border-slate-700/80 rounded-lg p-1">
            <button
              onClick={() => { setCameraMode('webcam'); stopStream(); }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-bold transition-all ${
                cameraMode === 'webcam' ? 'bg-cyan-500 text-black shadow-sm' : 'text-slate-400 hover:text-white'
              }`}
            >
              <Camera className="w-3.5 h-3.5" />
              <span>Browser Webcam / USB</span>
            </button>
            <button
              onClick={() => { setCameraMode('rtsp'); stopStream(); }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-bold transition-all ${
                cameraMode === 'rtsp' ? 'bg-cyan-500 text-black shadow-sm' : 'text-slate-400 hover:text-white'
              }`}
            >
              <Wifi className="w-3.5 h-3.5" />
              <span>Network CCTV / RTSP</span>
            </button>
          </div>

          {cameraMode === 'webcam' ? (
            <div className="flex items-center gap-2">
              <select
                value={selectedDeviceId}
                onChange={(e) => {
                  setSelectedDeviceId(e.target.value);
                  if (streamState === 'STREAMING') {
                    startWebcam();
                  }
                }}
                disabled={streamState === 'CONNECTING'}
                className="bg-[#070b14] border border-slate-700 text-slate-200 text-xs rounded-lg px-3 py-2 font-mono focus:border-cyan-500 focus:outline-none"
              >
                {availableDevices.length === 0 && <option value="">No cameras detected</option>}
                {availableDevices.map((dev) => (
                  <option key={dev.deviceId} value={dev.deviceId}>
                    {dev.label}
                  </option>
                ))}
              </select>
              <button
                onClick={refreshDevices}
                title="Refresh camera devices"
                className="p-2 rounded-lg bg-[#070b14] border border-slate-700 text-slate-400 hover:text-cyan-300 hover:border-cyan-500"
              >
                <RefreshCw className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={rtspUrl}
                onChange={(e) => setRtspUrl(e.target.value)}
                placeholder="rtsp://user:pass@camera-ip:554/stream"
                className="bg-[#070b14] border border-slate-700 text-slate-200 text-xs rounded-lg px-3 py-2 font-mono w-64 focus:border-cyan-500 focus:outline-none"
              />
            </div>
          )}
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2">
          {streamState === 'STOPPED' || streamState === 'ERROR' ? (
            <button
              onClick={startWebcam}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-black font-extrabold text-xs shadow-md shadow-cyan-500/20 transition-all cursor-pointer"
            >
              <Play className="w-4 h-4 fill-black" />
              <span>START MONITORING</span>
            </button>
          ) : (
            <>
              <button
                onClick={togglePause}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#070b14] border border-slate-700 hover:border-slate-500 text-slate-200 text-xs font-bold transition-all cursor-pointer"
              >
                {streamState === 'PAUSED' ? (
                  <>
                    <Play className="w-3.5 h-3.5 text-emerald-400 fill-emerald-400" />
                    <span>RESUME</span>
                  </>
                ) : (
                  <>
                    <Pause className="w-3.5 h-3.5 text-amber-400" />
                    <span>PAUSE</span>
                  </>
                )}
              </button>
              <button
                onClick={stopStream}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-rose-950/80 border border-rose-700/80 hover:bg-rose-900 text-rose-200 text-xs font-bold transition-all cursor-pointer"
              >
                <VideoOff className="w-3.5 h-3.5 text-rose-400" />
                <span>STOP</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* Error / Alert Message Banner */}
      {errorMessage && (
        <div className="bg-rose-950/90 border border-rose-600 rounded-xl p-3 flex items-start gap-3 text-rose-200 text-xs font-mono">
          <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="font-bold text-rose-100">Live Camera Stream Warning</p>
            <p className="mt-0.5 opacity-90">{errorMessage}</p>
          </div>
          <button
            onClick={() => setErrorMessage(null)}
            className="text-rose-400 hover:text-rose-200 text-sm font-bold"
          >
            ×
          </button>
        </div>
      )}

      {/* Main Monitoring Grid: Video Feed + Live Command HUD */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
        {/* Left Column: Live Video Canvas */}
        <div className="lg:col-span-8 flex flex-col gap-3">
          <div className="relative aspect-video w-full rounded-2xl overflow-hidden bg-black border-2 border-slate-800 shadow-2xl flex items-center justify-center">
            {/* Native Video Element */}
            <video
              ref={videoRef}
              className={`w-full h-full object-contain ${streamState === 'STREAMING' || streamState === 'PAUSED' ? 'block' : 'hidden'}`}
              playsInline
              muted
              autoPlay
            />

            {/* AI Bounding Box & HUD Canvas Overlay */}
            <canvas
              ref={canvasRef}
              className={`absolute inset-0 w-full h-full object-contain pointer-events-none z-10 ${
                streamState === 'STREAMING' || streamState === 'PAUSED' ? 'block' : 'hidden'
              }`}
            />

            {/* Standby / Offline Screen */}
            {(streamState === 'STOPPED' || streamState === 'ERROR') && (
              <div className="flex flex-col items-center justify-center gap-3 p-6 text-center text-slate-400">
                <div className="w-16 h-16 rounded-2xl bg-slate-900 border border-slate-800 flex items-center justify-center text-slate-500">
                  <Camera className="w-8 h-8" />
                </div>
                <div className="max-w-md">
                  <h3 className="text-white font-bold text-base font-mono">LIVE CAMERA MONITOR STANDBY</h3>
                  <p className="text-xs text-slate-400 mt-1">
                    Select a connected USB webcam or network camera source above and click{' '}
                    <span className="text-cyan-400 font-bold">START MONITORING</span>.
                  </p>
                </div>
              </div>
            )}

            {/* Connecting Spinner */}
            {streamState === 'CONNECTING' && (
              <div className="flex flex-col items-center justify-center gap-3 text-cyan-400 font-mono">
                <RefreshCw className="w-8 h-8 animate-spin" />
                <p className="text-xs font-bold tracking-wider">REQUESTING CAMERA HARDWARE PERMISSION...</p>
              </div>
            )}

            {/* Top HUD Badges */}
            {showHud && (streamState === 'STREAMING' || streamState === 'PAUSED') && (
              <div className="absolute top-3 left-3 right-3 flex items-center justify-between z-20 pointer-events-none font-mono text-[11px]">
                <div className="flex items-center gap-2">
                  <span className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-black/80 border border-slate-700/80 text-white font-bold backdrop-blur-md">
                    <Radio className="w-3.5 h-3.5 text-cyan-400 animate-pulse" />
                    <span>LIVE CAM-01</span>
                  </span>
                  <span
                    className={`flex items-center gap-1.5 px-2.5 py-1 rounded border font-bold backdrop-blur-md ${
                      crowdStatus === 'WARNING'
                        ? 'bg-amber-950/90 border-amber-600 text-amber-300 animate-pulse'
                        : 'bg-emerald-950/80 border-emerald-700 text-emerald-300'
                    }`}
                  >
                    <span>{crowdStatus === 'WARNING' ? '⚠️ CROWD WARNING' : '● NORMAL DENSITY'}</span>
                  </span>

                  {/* Live Violence Status Pill */}
                  <span
                    className={`px-2.5 py-1 rounded-md text-[11px] font-bold tracking-wide border flex items-center gap-1.5 backdrop-blur-md transition-all ${
                      violenceStatus === 'DETECTED'
                        ? 'bg-rose-950/90 border-rose-500 text-rose-300 animate-pulse'
                        : 'bg-emerald-950/80 border-emerald-700 text-emerald-300'
                    }`}
                  >
                    <span>{violenceStatus === 'DETECTED' ? '🚨 VIOLENCE DETECTED' : '🛡️ VIOLENCE: SECURE'}</span>
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <span className="px-2 py-1 rounded bg-black/80 border border-slate-800 text-cyan-300 font-bold backdrop-blur-md">
                    {fps} FPS
                  </span>
                  <span className="px-2 py-1 rounded bg-black/80 border border-slate-800 text-slate-300 font-bold backdrop-blur-md">
                    {inferenceLatencyMs} ms
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Quick HUD Overlay Controls */}
          <div className="flex items-center justify-between bg-[#0b101e] border border-slate-800 rounded-xl px-4 py-2.5 text-xs font-mono">
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-1.5 cursor-pointer text-slate-300">
                <input
                  type="checkbox"
                  checked={showBoxes}
                  onChange={(e) => setShowBoxes(e.target.checked)}
                  className="accent-cyan-500 rounded"
                />
                <span>Boxes</span>
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer text-slate-300">
                <input
                  type="checkbox"
                  checked={showIds}
                  onChange={(e) => setShowIds(e.target.checked)}
                  className="accent-cyan-500 rounded"
                />
                <span>Track IDs</span>
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer text-slate-300">
                <input
                  type="checkbox"
                  checked={showTrails}
                  onChange={(e) => setShowTrails(e.target.checked)}
                  className="accent-cyan-500 rounded"
                />
                <span>Motion Trails</span>
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer text-slate-300">
                <input
                  type="checkbox"
                  checked={showHud}
                  onChange={(e) => setShowHud(e.target.checked)}
                  className="accent-cyan-500 rounded"
                />
                <span>HUD</span>
              </label>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-slate-400 text-[11px]">Confidence:</span>
              <input
                type="range"
                min="0.15"
                max="0.80"
                step="0.05"
                value={confThreshold}
                onChange={(e) => setConfThreshold(parseFloat(e.target.value))}
                className="w-20 accent-cyan-500 cursor-pointer"
              />
              <span className="text-cyan-300 text-[11px] font-bold">{Math.round(confThreshold * 100)}%</span>
            </div>
          </div>
        </div>

        {/* Right Column: Live AI Command HUD & Alert Timeline */}
        <div className="lg:col-span-4 flex flex-col gap-3">
          {/* Live Metrics Card */}
          <div className="bg-[#0b101e] border-2 border-slate-800 rounded-2xl p-4 flex flex-col gap-3 shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <div className="flex items-center gap-2 text-white font-extrabold text-xs font-mono uppercase tracking-wider">
                <Activity className="w-4 h-4 text-cyan-400" />
                <span>Live Intelligence Telemetry</span>
              </div>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-cyan-950 text-cyan-300 border border-cyan-800">
                {lastFrameTime}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2 font-mono">
              <div className="bg-[#070b14] border border-slate-800 rounded-xl p-3 flex flex-col">
                <span className="text-[10px] text-slate-400 font-bold uppercase">Visible People</span>
                <span className={`text-2xl font-black mt-1 ${crowdStatus === 'WARNING' ? 'text-amber-400' : 'text-cyan-400'}`}>
                  {peopleCount}
                </span>
                <span className="text-[9px] text-slate-500 mt-0.5">Threshold: {crowdThreshold}</span>
              </div>

              <div className="bg-[#070b14] border border-slate-800 rounded-xl p-3 flex flex-col">
                <span className="text-[10px] text-slate-400 font-bold uppercase">Active Tracks</span>
                <span className="text-2xl font-black text-indigo-400 mt-1">
                  {activeTracks.length}
                </span>
                <span className="text-[9px] text-slate-500 mt-0.5">ByteTrack Kalman</span>
              </div>

              <div className="bg-[#070b14] border border-slate-800 rounded-xl p-3 flex flex-col">
                <span className="text-[10px] text-slate-400 font-bold uppercase">Inference Speed</span>
                <span className="text-xl font-bold text-white mt-1">{fps} FPS</span>
                <span className="text-[9px] text-slate-500 mt-0.5">{inferenceLatencyMs} ms / frame</span>
              </div>

              <div className="bg-[#070b14] border border-slate-800 rounded-xl p-3 flex flex-col">
                <span className="text-[10px] text-slate-400 font-bold uppercase">Safety Status</span>
                <span className={`text-sm font-extrabold mt-1.5 ${crowdStatus === 'WARNING' ? 'text-amber-400' : 'text-emerald-400'}`}>
                  {crowdStatus === 'WARNING' ? '⚠️ WARNING' : '✓ NORMAL'}
                </span>
                <span className="text-[9px] text-slate-500 mt-0.5">Debounced 5.0s</span>
              </div>
            </div>

            {/* Live Violence Recognition Telemetry Card */}
            <div
              className={`border rounded-xl p-3 flex flex-col gap-1.5 font-mono transition-all ${
                violenceStatus === 'DETECTED'
                  ? 'bg-rose-950/60 border-rose-500 text-rose-200 animate-pulse'
                  : 'bg-[#070b14] border-slate-800 text-slate-300'
              }`}
            >
              <div className="flex items-center justify-between text-[11px]">
                <span className="font-bold flex items-center gap-1.5 uppercase tracking-wider">
                  <ShieldCheck className={`w-3.5 h-3.5 ${violenceStatus === 'DETECTED' ? 'text-rose-400' : 'text-emerald-400'}`} />
                  Physical Action Status
                </span>
                <span
                  className={`text-[10px] font-bold px-2 py-0.5 rounded border ${
                    violenceStatus === 'DETECTED'
                      ? 'bg-rose-900 border-rose-500 text-white font-extrabold'
                      : 'bg-emerald-950/80 border-emerald-700 text-emerald-300'
                  }`}
                >
                  {violenceStatus === 'DETECTED' ? '● VIOLENCE DETECTED' : '● SECURE'}
                </span>
              </div>
              <div className="flex items-center justify-between text-[10px] text-slate-400 mt-1">
                <span>Model: <strong className="text-white">{violenceModel}</strong></span>
                <span>Confidence: <strong className={violenceStatus === 'DETECTED' ? 'text-rose-400' : 'text-cyan-300'}>{(violenceConfidence * 100).toFixed(1)}%</strong></span>
              </div>
              <div className="w-full bg-slate-900 h-1.5 rounded-full overflow-hidden mt-0.5">
                <div
                  className={`h-full transition-all duration-300 ${violenceStatus === 'DETECTED' ? 'bg-rose-500' : 'bg-cyan-500'}`}
                  style={{ width: `${Math.min(100, Math.round(violenceConfidence * 100))}%` }}
                />
              </div>
            </div>

            {/* Model Card */}
            <div className="bg-[#070b14] border border-slate-800 rounded-xl p-2.5 flex items-center justify-between text-xs font-mono">
              <div className="flex items-center gap-2">
                <Cpu className="w-3.5 h-3.5 text-cyan-400" />
                <span className="text-slate-300 font-bold truncate max-w-[200px]">{activeModelName}</span>
              </div>
              <span className="text-[10px] text-emerald-400 font-bold px-1.5 py-0.5 bg-emerald-950/80 rounded border border-emerald-800">
                ACTIVE
              </span>
            </div>
          </div>

          {/* Live Alerts Stream */}
          <div className="bg-[#0b101e] border-2 border-slate-800 rounded-2xl p-4 flex flex-col gap-2.5 shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <span className="text-white font-extrabold text-xs font-mono uppercase tracking-wider flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                <span>Live Event Feed</span>
              </span>
              <span className="text-[10px] font-mono text-slate-400">{recentLiveAlerts.length} events</span>
            </div>

            <div className="flex flex-col gap-2 max-h-[220px] overflow-y-auto pr-1">
              {recentLiveAlerts.length === 0 ? (
                <div className="p-4 text-center text-slate-500 font-mono text-xs">
                  No alerts triggered. Live monitoring within normal safety limits.
                </div>
              ) : (
                recentLiveAlerts.map((a) => (
                  <div
                    key={a.id}
                    className={`p-2.5 rounded-xl border text-xs font-mono flex flex-col gap-1 ${
                      a.severity === 'WARNING'
                        ? 'bg-amber-950/40 border-amber-800/80 text-amber-200'
                        : 'bg-emerald-950/40 border-emerald-800/80 text-emerald-200'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-[11px]">{a.type}</span>
                      <span className="text-[10px] opacity-75">{new Date(a.timestamp * 1000).toLocaleTimeString()}</span>
                    </div>
                    <p className="text-[11px] opacity-90">{a.message}</p>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

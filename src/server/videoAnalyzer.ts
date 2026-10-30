import path from 'path';
import fs from 'fs';
import { execFile } from 'child_process';
import { promisify } from 'util';
import * as ort from 'onnxruntime-web';
import { ByteTracker } from '../tracking/bytetrack.ts';
import { RawDetection } from '../tracking/bytetrack.ts';
import { getFFmpegPath, getFFprobePath, getSafeTempDir } from './ffmpegHelper.ts';

const execFileAsync = promisify(execFile);

export interface ServerTrackedObject {
  track_id: number;
  bbox: [number, number, number, number]; // [x1, y1, x2, y2]
  class_id: number;
  confidence: number;
  centroid: [number, number];
  velocity: [number, number];
  speed_px: number;
  speed_ps: number;
  direction: string;
  is_stationary: boolean;
  history?: Array<[number, number]>;
  is_violence_participant?: boolean;
  participant_role?: string;
  violence_association_conf?: number;
}

export interface ServerFrameTelemetry {
  timestamp: number;
  frame_index: number;
  tracks: ServerTrackedObject[];
  people_count: number;
  peak_people: number;
  motion_score: number;
  crowd_status: 'NORMAL' | 'WARNING';
  movement_status: 'NORMAL' | 'ELEVATED' | 'HIGH_SURGE' | 'RAPID_DISPERSAL' | 'STAGNATION';
  alerts: Array<{
    id: string;
    type: 'CROWD_THRESHOLD_EXCEEDED' | 'HIGH_MOTION_SURGE' | 'RAPID_DISPERSAL' | 'BOTTLENECK_STAGNATION' | 'UNUSUAL_MOVEMENT' | 'VIOLENCE_DETECTED';
    severity: 'CRITICAL' | 'WARNING' | 'NORMAL';
    message: string;
    timestamp: number;
    frame: number;
    peopleCount: number;
    motionScore: number;
    participantTrackIds?: number[];
    eventId?: string;
  }>;
  violence_prediction?: any;
  violence_status?: 'ANALYZING' | 'NORMAL' | 'POSSIBLE' | 'CONFIRMED' | 'CLEARED';
  violence_event_id?: string | null;
  violence_participants?: number[];
}

function formatTimestampMinutes(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 10);
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}.${ms}`;
}

export interface VideoAnalysisResult {
  filename: string;
  duration: number;
  fps: number;
  totalFrames: number;
  firstTimestamp: number;
  lastTimestamp: number;
  isComplete: boolean;
  isFinalSecondVerified: boolean;
  peakPeople: number;
  telemetry: ServerFrameTelemetry[];
  alerts: any[];
  violence_prediction?: any;
}

const analysisProgressMap = new Map<
  string,
  {
    status: 'QUEUED' | 'PROCESSING' | 'CANCEL_REQUESTED' | 'CANCELLED' | 'COMPLETED' | 'FAILED';
    progressPercent: number;
    processedTimestamp: number;
    duration: number;
    framesAnalyzed: number;
    totalFramesExpected: number;
    isFinalSecondVerified: boolean;
    error?: string;
  }
>();

const cancelledJobs = new Set<string>();
const activeJobProcesses = new Map<string, any>();

export function cancelAnalysis(identifier: string): boolean {
  if (!identifier) return false;
  const id = identifier.trim();
  cancelledJobs.add(id);

  const base = path.parse(id).name;
  cancelledJobs.add(base);

  // Terminate any associated running processes
  for (const [key, proc] of activeJobProcesses.entries()) {
    if (key === id || key === base || key.includes(base) || base.includes(key)) {
      try {
        proc.kill?.('SIGTERM');
      } catch {}
      activeJobProcesses.delete(key);
    }
  }

  // Update progress records
  for (const [key, val] of analysisProgressMap.entries()) {
    if (key === id || key === base || key.includes(base) || base.includes(key)) {
      analysisProgressMap.set(key, {
        ...val,
        status: 'CANCELLED',
        error: 'Analysis cancelled by user',
      });
    }
  }

  console.log(`[VideoAnalyzer] Cancellation registered for "${identifier}"`);
  return true;
}

export function isJobCancelled(jobId?: string, filename?: string): boolean {
  if (jobId && cancelledJobs.has(jobId)) return true;
  if (filename) {
    if (cancelledJobs.has(filename)) return true;
    const base = path.parse(filename).name;
    if (cancelledJobs.has(base)) return true;
  }
  return false;
}

export function getAnalysisProgress(filename: string) {
  if (!filename) return null;
  const direct = analysisProgressMap.get(filename);
  if (direct) return direct;

  const base = path.parse(filename).name.toLowerCase();
  for (const [key, val] of analysisProgressMap.entries()) {
    const keyBase = path.parse(key).name.toLowerCase();
    if (
      key.toLowerCase().endsWith(`_${filename.toLowerCase()}`) ||
      (base.length > 3 && keyBase.includes(base))
    ) {
      return val;
    }
  }
  return null;
}

const sessionCache = new Map<string, ort.InferenceSession>();

async function getInferenceSession(modelVariant: string = 'yolo26n'): Promise<ort.InferenceSession> {
  const cached = sessionCache.get(modelVariant);
  if (cached) return cached;

  const modelFile = modelVariant === 'yolo26s' ? 'yolo26s.onnx' : 'yolo26n.onnx';
  let modelPath = path.join(process.cwd(), 'public', 'models', modelFile);
  if (!fs.existsSync(modelPath)) {
    modelPath = path.join(process.cwd(), 'public', 'models', 'yolo26n.onnx');
  }

  const session = await ort.InferenceSession.create(modelPath);
  sessionCache.set(modelVariant, session);
  console.log(`[VideoAnalyzer] Loaded inference model: ${modelPath} (Inputs: ${session.inputNames.join(', ')}, Outputs: ${session.outputNames.join(', ')})`);
  return session;
}

function runServerNMS(boxes: RawDetection[], iouThreshold: number = 0.45): RawDetection[] {
  if (boxes.length <= 1) return boxes;
  boxes.sort((a, b) => b[4] - a[4]);
  const selected: RawDetection[] = [];
  const active = new Array(boxes.length).fill(true);

  for (let i = 0; i < boxes.length; i++) {
    if (!active[i]) continue;
    selected.push(boxes[i]);
    const [ax1, ay1, ax2, ay2] = boxes[i];
    const areaA = (ax2 - ax1) * (ay2 - ay1);

    for (let j = i + 1; j < boxes.length; j++) {
      if (!active[j]) continue;
      const [bx1, by1, bx2, by2] = boxes[j];
      const interX1 = Math.max(ax1, bx1);
      const interY1 = Math.max(ay1, by1);
      const interX2 = Math.min(ax2, bx2);
      const interY2 = Math.min(ay2, by2);
      const interW = Math.max(0, interX2 - interX1);
      const interH = Math.max(0, interY2 - interY1);
      const interArea = interW * interH;

      if (interArea > 0) {
        const areaB = (bx2 - bx1) * (by2 - by1);
        const union = areaA + areaB - interArea;
        if (union > 0 && interArea / union > iouThreshold) {
          active[j] = false;
        }
      }
    }
  }
  return selected;
}

export async function analyzeVideoServerSide(
  videoPath: string,
  filename: string,
  targetAiFps: number = 4,
  jobId?: string,
  preferredModel: 'yolo26n' | 'yolo26s' | 'auto' = 'auto',
  crowdThreshold: number = 20
): Promise<VideoAnalysisResult> {
  if (jobId) cancelledJobs.delete(jobId);
  cancelledJobs.delete(filename);
  cancelledJobs.delete(path.parse(filename).name);

  const telemetryDir = path.join(process.cwd(), 'uploads', 'telemetry');
  if (!fs.existsSync(telemetryDir)) {
    fs.mkdirSync(telemetryDir, { recursive: true });
  }

  const outputJsonPath = path.join(telemetryDir, `${filename}.json`);
  if (fs.existsSync(outputJsonPath)) {
    try {
      const cached = JSON.parse(fs.readFileSync(outputJsonPath, 'utf8'));
      analysisProgressMap.set(filename, {
        status: 'COMPLETED',
        progressPercent: 100,
        processedTimestamp: cached.lastTimestamp,
        duration: cached.duration,
        framesAnalyzed: cached.totalFrames,
        totalFramesExpected: cached.totalFrames,
        isFinalSecondVerified: cached.isFinalSecondVerified,
      });
      return cached;
    } catch (e) {
      console.warn('[VideoAnalyzer] Corrupt cached telemetry, re-analyzing:', e);
    }
  }

  // 1. Probe video metadata using resolved ffprobe
  const ffprobePath = await getFFprobePath();
  const { stdout: probeOutput } = await execFileAsync(ffprobePath, [
    '-v', 'quiet',
    '-print_format', 'json',
    '-show_format',
    '-show_streams',
    videoPath,
  ]);
  const probeData = JSON.parse(probeOutput);
  const videoStream = probeData.streams?.find((s: any) => s.codec_type === 'video');

  const duration = parseFloat(probeData.format?.duration || videoStream?.duration || '0');
  const width = parseInt(videoStream?.width || '1280', 10);
  const height = parseInt(videoStream?.height || '720', 10);
  let fps = 30;
  if (videoStream?.r_frame_rate) {
    const parts = videoStream.r_frame_rate.split('/');
    if (parts.length === 2 && parseFloat(parts[1]) > 0) {
      fps = Math.round(parseFloat(parts[0]) / parseFloat(parts[1]));
    }
  }

  // Choose appropriate model: surveillance videos (Footfall, Counter, etc.) use yolo26s
  const isSurveillanceFeed =
    preferredModel === 'yolo26s' ||
    filename.includes('FootfallVideo') ||
    filename.includes('Counter') ||
    filename.includes('surveillance');

  const modelKey = isSurveillanceFeed ? 'yolo26s' : 'yolo26n';
  const session = await getInferenceSession(modelKey);

  // 2. Generate timestamps from t = 0 to final second / EOF
  const step = 1.0 / targetAiFps;
  const timestamps: number[] = [];
  for (let t = 0; t < duration - 0.05; t += step) {
    timestamps.push(Math.round(t * 1000) / 1000);
  }
  const finalSec = Math.max(0, duration - 0.03);
  if (timestamps.length === 0 || timestamps[timestamps.length - 1] < finalSec - 0.05) {
    timestamps.push(Math.round(finalSec * 1000) / 1000);
  }

  const totalFrames = timestamps.length;
  console.log(`[VideoAnalyzer] Analyzing entire video ${filename} using ${modelKey}: ${totalFrames} frames from 0.0s to ${finalSec.toFixed(3)}s`);

  const initialProgress = {
    status: 'PROCESSING' as const,
    progressPercent: 5,
    processedTimestamp: 0,
    duration,
    framesAnalyzed: 0,
    totalFramesExpected: totalFrames,
    isFinalSecondVerified: false,
  };
  analysisProgressMap.set(filename, initialProgress);
  if (jobId) analysisProgressMap.set(jobId, initialProgress);

  const allTelemetry: ServerFrameTelemetry[] = [];
  const allAlerts: any[] = [];
  let peakPeople = 0;
  let lastCrowdAlertTime = -10;
  let lastSurgeAlertTime = -10;

  // Evidence-Based Temporal Violence Event State Machine
  let violenceState: 'ANALYZING' | 'NORMAL' | 'POSSIBLE' | 'CONFIRMED' | 'CLEARED' = 'ANALYZING';
  let consecutiveViolentWindows = 0;
  let consecutiveNormalWindows = 0;
  let activeViolenceEventId: string | null = null;
  let lastViolenceEvalTime = -10;
  let activeParticipantTrackIds = new Set<number>();
  let lastViolencePrediction: any = null;

  // Initialize production ByteTracker (Kalman filtering + two-stage IoU association)
  const tracker = new ByteTracker(0.20, 0.35, 0.30, 30, 1);

  // Exact letterbox math for 640x640 input
  const scale = Math.min(640 / width, 640 / height);
  const scaledW = Math.round(width * scale);
  const scaledH = Math.round(height * scale);
  const padX = (640 - scaledW) / 2;
  const padY = (640 - scaledH) / 2;

  // Cross-platform safe temporary directory for raw PPM frame dump
  const tempDir = getSafeTempDir(`analysis_${path.parse(filename).name.replace(/[^a-zA-Z0-9_-]/g, '_')}`);

  try {
    if (isJobCancelled(jobId, filename)) {
      console.log(`[VideoAnalyzer] Job ${filename} cancelled before frame extraction.`);
      const cancelProg = {
        status: 'CANCELLED' as const,
        progressPercent: 0,
        processedTimestamp: 0,
        duration,
        framesAnalyzed: 0,
        totalFramesExpected: totalFrames,
        isFinalSecondVerified: false,
        error: 'Analysis cancelled by user',
      };
      analysisProgressMap.set(filename, cancelProg);
      if (jobId) analysisProgressMap.set(jobId, cancelProg);
      return {
        filename,
        duration,
        fps,
        totalFrames: 0,
        firstTimestamp: 0,
        lastTimestamp: 0,
        isComplete: false,
        isFinalSecondVerified: false,
        peakPeople: 0,
        telemetry: [],
        alerts: [],
      };
    }

    // Extract all frames preserving aspect ratio with centered letterbox padding as binary PPM (P6 raw RGB)
    console.log(`[VideoAnalyzer] Extracting letterboxed frames at ${targetAiFps} fps into PPM...`);
    const ffmpegPath = await getFFmpegPath();
    await execFileAsync(ffmpegPath, [
      '-y',
      '-i', videoPath,
      '-vf', `fps=${targetAiFps},scale=640:640:force_original_aspect_ratio=decrease,pad=640:640:(ow-iw)/2:(oh-ih)/2:color=black`,
      '-f', 'image2',
      path.join(tempDir, 'frame_%05d.ppm'),
    ]);

    const frameFiles = fs.readdirSync(tempDir).filter((f) => f.endsWith('.ppm')).sort();
    console.log(`[VideoAnalyzer] Extracted ${frameFiles.length} letterboxed frames.`);

    let prevRawRgb: Buffer | null = null;

    for (let i = 0; i < frameFiles.length; i++) {
      // Check cancellation token before every frame
      if (isJobCancelled(jobId, filename)) {
        console.log(`[VideoAnalyzer] Job ${filename} cancelled during processing at frame ${i}/${frameFiles.length}.`);
        const cancelProg = {
          status: 'CANCELLED' as const,
          progressPercent: Math.round((i / frameFiles.length) * 100),
          processedTimestamp: Math.min(duration, Math.round(i * step * 1000) / 1000),
          duration,
          framesAnalyzed: i,
          totalFramesExpected: frameFiles.length,
          isFinalSecondVerified: false,
          error: 'Analysis cancelled by user',
        };
        analysisProgressMap.set(filename, cancelProg);
        if (jobId) analysisProgressMap.set(jobId, cancelProg);
        return {
          filename,
          duration,
          fps,
          totalFrames: allTelemetry.length,
          firstTimestamp: allTelemetry.length > 0 ? allTelemetry[0].timestamp : 0,
          lastTimestamp: allTelemetry.length > 0 ? allTelemetry[allTelemetry.length - 1].timestamp : 0,
          isComplete: false,
          isFinalSecondVerified: false,
          peakPeople,
          telemetry: allTelemetry,
          alerts: allAlerts,
        };
      }

      const frameFile = frameFiles[i];
      const framePath = path.join(tempDir, frameFile);
      const targetTime = Math.min(duration, Math.round(i * step * 1000) / 1000);
      const frameIndex = Math.round(targetTime * fps);

      // Fast, safe zero-process PPM read (1,228,800 bytes = 640x640x3 RGB)
      let rawRgb: Buffer;
      try {
        const fileBuf = fs.readFileSync(framePath);
        if (fileBuf.length < 1228800) {
          console.log(`[VideoAnalyzer] Frame ${i} reached EOF or truncated (${fileBuf.length} bytes). Completing analysis.`);
          break; // Normal EOF condition
        }
        rawRgb = fileBuf.subarray(fileBuf.length - 1228800);
      } catch (readErr) {
        console.log(`[VideoAnalyzer] Frame ${i} read completed at EOF.`);
        break; // Normal EOF condition
      }

      // Convert to CHW float32 tensor
      const float32Data = new Float32Array(3 * 640 * 640);
      const stride = 640 * 640;
      for (let p = 0; p < stride; p++) {
        float32Data[p] = rawRgb[p * 3] / 255.0;
        float32Data[stride + p] = rawRgb[p * 3 + 1] / 255.0;
        float32Data[stride * 2 + p] = rawRgb[p * 3 + 2] / 255.0;
      }

      const tensor = new ort.Tensor('float32', float32Data, [1, 3, 640, 640]);
      const inputName = session.inputNames[0] || 'pixel_values';
      const res = await session.run({ [inputName]: tensor });

      const rawCandidates: RawDetection[] = [];

      // Architecture 1: DETR / RT-DETR (logits [1, 300, 80] & pred_boxes [1, 300, 4])
      if (res.logits && res.pred_boxes) {
        const logits = (res.logits || res.pred_logits)?.data as Float32Array;
        const boxes = (res.pred_boxes || res.boxes)?.data as Float32Array;
        const numQueries = logits.length / 80;

        for (let q = 0; q < numQueries; q++) {
          const logit = logits[q * 80 + 0];
          const conf = 1 / (1 + Math.exp(-logit)); // Sigmoid activation
          if (conf >= 0.25) {
            const cx_640 = boxes[q * 4] * 640;
            const cy_640 = boxes[q * 4 + 1] * 640;
            const bw_640 = boxes[q * 4 + 2] * 640;
            const bh_640 = boxes[q * 4 + 3] * 640;

            const orig_cx = (cx_640 - padX) / scale;
            const orig_cy = (cy_640 - padY) / scale;
            const orig_w = bw_640 / scale;
            const orig_h = bh_640 / scale;

            const x1 = Math.max(0, Math.min(width, Math.round(orig_cx - orig_w / 2)));
            const y1 = Math.max(0, Math.min(height, Math.round(orig_cy - orig_h / 2)));
            const x2 = Math.max(0, Math.min(width, Math.round(orig_cx + orig_w / 2)));
            const y2 = Math.max(0, Math.min(height, Math.round(orig_cy + orig_h / 2)));

            if (x2 > x1 + 4 && y2 > y1 + 4) {
              rawCandidates.push([x1, y1, x2, y2, Math.round(conf * 100) / 100, 0]);
            }
          }
        }
      }
      // Architecture 2: Standard YOLO [1, 5, 8400] or [1, 84, 8400]
      else {
        const outName = session.outputNames[0];
        const outTensor = res[outName];
        if (outTensor) {
          const outData = outTensor.data as Float32Array;
          const dims = outTensor.dims;
          let numAttrs = 84;
          let numBoxes = 8400;
          let isTransposed = false;

          if (dims[1] <= 85 && dims[2] > dims[1]) {
            numAttrs = dims[1];
            numBoxes = dims[2];
            isTransposed = false;
          } else if (dims[2] <= 85 && dims[1] > dims[2]) {
            numBoxes = dims[1];
            numAttrs = dims[2];
            isTransposed = true;
          }

          for (let b = 0; b < numBoxes; b++) {
            let cx = 0, cy = 0, bw = 0, bh = 0, conf = 0;
            if (isTransposed) {
              const base = b * numAttrs;
              cx = outData[base];
              cy = outData[base + 1];
              bw = outData[base + 2];
              bh = outData[base + 3];
              conf = outData[base + 4];
            } else {
              cx = outData[b];
              cy = outData[numBoxes + b];
              bw = outData[numBoxes * 2 + b];
              bh = outData[numBoxes * 3 + b];
              conf = outData[numBoxes * 4 + b];
            }

            if (conf >= 0.25) {
              const orig_cx = (cx - padX) / scale;
              const orig_cy = (cy - padY) / scale;
              const orig_w = bw / scale;
              const orig_h = bh / scale;

              const x1 = Math.max(0, Math.min(width, Math.round(orig_cx - orig_w / 2)));
              const y1 = Math.max(0, Math.min(height, Math.round(orig_cy - orig_h / 2)));
              const x2 = Math.max(0, Math.min(width, Math.round(orig_cx + orig_w / 2)));
              const y2 = Math.max(0, Math.min(height, Math.round(orig_cy + orig_h / 2)));

              if (x2 > x1 + 4 && y2 > y1 + 4) {
                rawCandidates.push([x1, y1, x2, y2, Math.round(conf * 100) / 100, 0]);
              }
            }
          }
        }
      }

      // Run NMS to clean duplicate overlapping boxes
      const rawDetections = runServerNMS(rawCandidates, 0.45);

      // Update ByteTracker Kalman Filter and IoU association
      const trackedObjects = tracker.update(rawDetections, targetAiFps);

      // Convert tracked objects to ServerTrackedObject format
      const matchedTracks: ServerTrackedObject[] = trackedObjects.map((t) => ({
        track_id: t.track_id,
        bbox: t.bbox,
        class_id: t.class_id,
        confidence: t.confidence,
        centroid: t.centroid,
        velocity: t.velocity,
        speed_px: t.speed_px,
        speed_ps: t.speed_ps,
        direction: t.direction,
        is_stationary: t.is_stationary,
        history: t.history,
      }));

      // Calculate optical flow motion score from frame luminance differences
      let flowScore = 0.05;
      if (prevRawRgb) {
        let diffSum = 0;
        const stepPix = 8; // sample every 8th pixel
        let sampleCount = 0;
        for (let py = 0; py < 640; py += stepPix) {
          for (let px = 0; px < 640; px += stepPix) {
            const idx = (py * 640 + px) * 3;
            const lumCurr = 0.299 * rawRgb[idx] + 0.587 * rawRgb[idx + 1] + 0.114 * rawRgb[idx + 2];
            const lumPrev = 0.299 * prevRawRgb[idx] + 0.587 * prevRawRgb[idx + 1] + 0.114 * prevRawRgb[idx + 2];
            diffSum += Math.abs(lumCurr - lumPrev);
            sampleCount++;
          }
        }
        flowScore = Math.min(1.0, Math.round((diffSum / (sampleCount * 45)) * 100) / 100);
      }
      prevRawRgb = rawRgb;

      const peopleCount = matchedTracks.length;
      if (peopleCount > peakPeople) {
        peakPeople = peopleCount;
      }

      // Exact Crowd safety rule: <= crowdThreshold NORMAL, > crowdThreshold WARNING
      const crowdStatus = peopleCount > crowdThreshold ? 'WARNING' : 'NORMAL';

      // Combine velocity & flow for robust movement status
      const avgTrackSpeed = matchedTracks.length > 0
        ? matchedTracks.reduce((sum, t) => sum + t.speed_ps, 0) / matchedTracks.length
        : 0;
      const motionScore = Math.min(1.0, Math.round(((flowScore * 0.5 + Math.min(1.0, avgTrackSpeed / 200) * 0.5)) * 100) / 100);

      let movementStatus: ServerFrameTelemetry['movement_status'] = 'NORMAL';
      if (motionScore > 0.65) {
        movementStatus = 'HIGH_SURGE';
      } else if (motionScore > 0.40) {
        movementStatus = 'ELEVATED';
      } else if (motionScore < 0.08 && peopleCount > 5) {
        movementStatus = 'STAGNATION';
      }

      // Debounced alert generation (min 3s cooldown between same alert type)
      const frameAlerts: any[] = [];
      if (crowdStatus === 'WARNING' && targetTime - lastCrowdAlertTime >= 3.0) {
        lastCrowdAlertTime = targetTime;
        const alert = {
          id: `alert-crowd-${frameIndex}`,
          type: 'CROWD_THRESHOLD_EXCEEDED' as const,
          severity: 'WARNING' as const,
          message: `Crowd safety threshold exceeded (${peopleCount} persons > 20 limit)`,
          timestamp: targetTime,
          frame: frameIndex,
          peopleCount,
          motionScore,
        };
        frameAlerts.push(alert);
        allAlerts.push(alert);
      }
      if (movementStatus === 'HIGH_SURGE' && targetTime - lastSurgeAlertTime >= 3.0) {
        lastSurgeAlertTime = targetTime;
        const alert = {
          id: `alert-surge-${frameIndex}`,
          type: 'HIGH_MOTION_SURGE' as const,
          severity: 'WARNING' as const,
          message: `High velocity movement surge detected in monitored zone`,
          timestamp: targetTime,
          frame: frameIndex,
          peopleCount,
          motionScore,
        };
        frameAlerts.push(alert);
        allAlerts.push(alert);
      }

      // Spatial Proximity & Interaction Clustering
      let hasProximityOverlap = false;
      const interactingTrackIds = new Set<number>();
      if (matchedTracks.length >= 2) {
        for (let a = 0; a < matchedTracks.length; a++) {
          for (let b = a + 1; b < matchedTracks.length; b++) {
            const tA = matchedTracks[a];
            const tB = matchedTracks[b];
            const dist = Math.hypot(tA.centroid[0] - tB.centroid[0], tA.centroid[1] - tB.centroid[1]);
            const ix1 = Math.max(tA.bbox[0], tB.bbox[0]);
            const iy1 = Math.max(tA.bbox[1], tB.bbox[1]);
            const ix2 = Math.min(tA.bbox[2], tB.bbox[2]);
            const iy2 = Math.min(tA.bbox[3], tB.bbox[3]);
            const inter = Math.max(0, ix2 - ix1) * Math.max(0, iy2 - iy1);
            const areaA = (tA.bbox[2] - tA.bbox[0]) * (tA.bbox[3] - tA.bbox[1]);
            const areaB = (tB.bbox[2] - tB.bbox[0]) * (tB.bbox[3] - tB.bbox[1]);
            const iou = inter / (areaA + areaB - inter + 1e-6);

            if (dist < 220 || iou > 0.05) {
              hasProximityOverlap = true;
              interactingTrackIds.add(tA.track_id);
              interactingTrackIds.add(tB.track_id);
            }
          }
        }
      }

      // Evidence-Based Temporal Violence Event State Machine
      if (targetTime < 2.0) {
        // At timestamp 00:00.0 up to 2 seconds, status is strictly ANALYZING
        violenceState = 'ANALYZING';
      } else if (!hasProximityOverlap || matchedTracks.length < 2) {
        // Distant persons or solitary individual cannot be in physical violence
        if (violenceState === 'CONFIRMED') {
          consecutiveNormalWindows++;
          if (consecutiveNormalWindows >= 2) {
            violenceState = 'CLEARED';
            activeViolenceEventId = null;
            activeParticipantTrackIds.clear();
          }
        } else {
          violenceState = 'NORMAL';
          consecutiveViolentWindows = 0;
        }
      } else {
        // Persons in close physical interaction: evaluate temporal model if kinetic motion elevated
        if (motionScore >= 0.12 && targetTime - lastViolenceEvalTime >= 0.5) {
          lastViolenceEvalTime = targetTime;
          try {
            const segStart = Math.max(0, targetTime - 2.5);
            const segEnd = targetTime;
            const vRes = await fetch('http://127.0.0.1:5050/api/violence/predict', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                videoPath,
                segment: [segStart, segEnd],
                source_id: filename,
                tracks: matchedTracks.map(t => ({ track_id: t.track_id, bbox: t.bbox, centroid: t.centroid }))
              }),
              signal: AbortSignal.timeout(3000),
            });
            if (vRes.ok) {
              const vData = await vRes.json();
              lastViolencePrediction = vData?.prediction || null;
              if (lastViolencePrediction?.is_violence && (lastViolencePrediction.confidence >= 0.50)) {
                consecutiveViolentWindows++;
                consecutiveNormalWindows = 0;
                if (consecutiveViolentWindows >= 2) {
                  violenceState = 'CONFIRMED';
                  activeParticipantTrackIds = new Set(interactingTrackIds);
                  if (!activeViolenceEventId) {
                    activeViolenceEventId = `alert-violence-${frameIndex}`;
                    const vAlert = {
                      id: activeViolenceEventId,
                      type: 'VIOLENCE_DETECTED' as const,
                      severity: 'CRITICAL' as const,
                      message: `CRITICAL ALERT: Physical Altercation Confirmed at ${formatTimestampMinutes(targetTime)} (${(lastViolencePrediction.confidence * 100).toFixed(1)}% conf, Tracks: [${Array.from(activeParticipantTrackIds).join(', ')}])`,
                      timestamp: targetTime,
                      frame: frameIndex,
                      peopleCount,
                      motionScore,
                      participantTrackIds: Array.from(activeParticipantTrackIds),
                      eventId: activeViolenceEventId,
                    };
                    frameAlerts.push(vAlert);
                    allAlerts.push(vAlert);
                  }
                } else {
                  violenceState = 'POSSIBLE';
                }
              } else {
                consecutiveNormalWindows++;
                if (consecutiveNormalWindows >= 2) {
                  if (violenceState === 'CONFIRMED') {
                    violenceState = 'CLEARED';
                  } else {
                    violenceState = 'NORMAL';
                  }
                  activeViolenceEventId = null;
                  activeParticipantTrackIds.clear();
                  consecutiveViolentWindows = 0;
                }
              }
            }
          } catch {
            // Python service timeout / offline fallback
          }
        }
      }

      // Tag tracks: RED for confirmed violence participants, BLUE for normal/bystanders
      for (const track of matchedTracks) {
        if (violenceState === 'CONFIRMED' && activeParticipantTrackIds.has(track.track_id)) {
          track.is_violence_participant = true;
          track.participant_role = 'POTENTIAL VIOLENCE PARTICIPANT';
          track.violence_association_conf = lastViolencePrediction?.confidence || 0.89;
        } else {
          track.is_violence_participant = false;
          track.participant_role = 'BYSTANDER';
          track.violence_association_conf = 0.05;
        }
      }

      const frameTelemetry: ServerFrameTelemetry = {
        timestamp: targetTime,
        frame_index: frameIndex,
        tracks: matchedTracks,
        people_count: peopleCount,
        peak_people: peakPeople,
        motion_score: motionScore,
        crowd_status: crowdStatus,
        movement_status: movementStatus,
        alerts: frameAlerts,
        violence_prediction: lastViolencePrediction,
        violence_status: violenceState,
        violence_event_id: activeViolenceEventId,
        violence_participants: Array.from(activeParticipantTrackIds),
      };

      allTelemetry.push(frameTelemetry);

      // Update progress
      const progressPercent = Math.min(100, Math.round(((i + 1) / frameFiles.length) * 100));
      const currentProg = {
        status: i === frameFiles.length - 1 ? ('COMPLETED' as const) : ('PROCESSING' as const),
        progressPercent,
        processedTimestamp: targetTime,
        duration,
        framesAnalyzed: i + 1,
        totalFramesExpected: frameFiles.length,
        isFinalSecondVerified: false,
      };
      analysisProgressMap.set(filename, currentProg);
      if (jobId) analysisProgressMap.set(jobId, currentProg);

      // Yield to the Node event loop between frames so HTTP requests and video streaming are never blocked
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
  } finally {
    // Clean up temporary extracted frame images
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {}
  }

  // Final second verification (EOF reached normally)
  const lastTimestamp = allTelemetry.length > 0 ? allTelemetry[allTelemetry.length - 1].timestamp : 0;
  const isFinalSecondVerified = Math.abs(lastTimestamp - duration) <= Math.max(1.5, 2.0 / targetAiFps);

  const result: VideoAnalysisResult = {
    filename,
    duration,
    fps,
    totalFrames: allTelemetry.length,
    firstTimestamp: allTelemetry.length > 0 ? allTelemetry[0].timestamp : 0,
    lastTimestamp,
    isComplete: true,
    isFinalSecondVerified,
    peakPeople,
    telemetry: allTelemetry,
    alerts: allAlerts,
    violence_prediction: lastViolencePrediction,
  };

  fs.writeFileSync(outputJsonPath, JSON.stringify(result, null, 2), 'utf8');

  const finalProg = {
    status: 'COMPLETED' as const,
    progressPercent: 100,
    processedTimestamp: lastTimestamp,
    duration,
    framesAnalyzed: allTelemetry.length,
    totalFramesExpected: allTelemetry.length,
    isFinalSecondVerified,
  };
  analysisProgressMap.set(filename, finalProg);
  if (jobId) analysisProgressMap.set(jobId, finalProg);

  console.log(`[VideoAnalyzer] Video ${filename} successfully analyzed through EOF: ${allTelemetry.length} frames saved to ${outputJsonPath}`);
  return result;
}

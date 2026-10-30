import fs from 'fs';
import path from 'path';
import { Router } from 'express';
import { analyzeVideoServerSide, cancelAnalysis, isJobCancelled, VideoAnalysisResult } from './videoAnalyzer.ts';

export interface ManifestVideoEntry {
  id: string;
  title: string;
  filename: string;
  category: 'violence' | 'normal';
  expected_label: 'VIOLENCE' | 'NON-VIOLENCE';
  source_dataset: string;
  source_url: string;
  license: string;
  inclusion_notes: string;
  duration: number;
  fps: number;
  resolution: string;
  width: number;
  height: number;
  file_size: number;
  file_size_formatted: string;
  video_url: string;
  thumbnail_url: string;
  relative_path: string;
}

export interface DatasetManifest {
  dataset_name: string;
  version: string;
  description: string;
  disclaimer: string;
  total_videos: number;
  violence_count: number;
  normal_count: number;
  videos: ManifestVideoEntry[];
}

export type ClassificationOutcome =
  | 'TRUE_POSITIVE'
  | 'TRUE_NEGATIVE'
  | 'FALSE_POSITIVE'
  | 'FALSE_NEGATIVE'
  | 'PENDING'
  | 'ERROR';

export interface VideoTestResult {
  videoId: string;
  filename: string;
  expectedLabel: 'VIOLENCE' | 'NON-VIOLENCE';
  predictedLabel: 'VIOLENCE' | 'NON-VIOLENCE' | 'UNKNOWN';
  classification: ClassificationOutcome;
  confidence: number;
  testedAt: string;
  status: 'COMPLETED' | 'FAILED' | 'CANCELLED' | 'RUNNING' | 'PENDING';
  durationSec: number;
  framesAnalyzed: number;
  processingTimeMs: number;
  processingFps: number;
  peakPeople: number;
  violenceEventStart: number | null;
  violenceEventEnd: number | null;
  participantIds: number[];
  errorMessage?: string;
}

export interface ValidationMetrics {
  totalVideos: number;
  testedCount: number;
  pendingCount: number;
  failedCount: number;
  truePositives: number;
  trueNegatives: number;
  falsePositives: number;
  falseNegatives: number;
  accuracy: number | null;
  precision: number | null;
  recall: number | null;
  f1Score: number | null;
  falsePositiveRate: number | null;
  falseNegativeRate: number | null;
  avgProcessingTimeSec: number;
  avgThroughputFps: number;
  disclaimer: string;
}

export interface BatchTestStatus {
  isRunning: boolean;
  totalVideos: number;
  completedCount: number;
  currentIndex: number;
  currentVideoId: string | null;
  currentVideoTitle: string | null;
  percent: number;
  startedAt: string | null;
  elapsedSec: number;
  metrics: ValidationMetrics;
}

const MANIFEST_PATH = path.join(process.cwd(), 'public', 'datasets', 'manifest.json');
const RESULTS_PATH = path.join(process.cwd(), 'public', 'datasets', 'test_results.json');
const DISCLAIMER_TEXT = 'SMALL-SAMPLE FUNCTIONAL VALIDATION — NOT A GENERALIZATION CLAIM';

let activeBatch: {
  isRunning: boolean;
  shouldStop: boolean;
  currentIndex: number;
  currentVideoId: string | null;
  currentVideoTitle: string | null;
  startedAt: number | null;
  activeJobId: string | null;
} = {
  isRunning: false,
  shouldStop: false,
  currentIndex: 0,
  currentVideoId: null,
  currentVideoTitle: null,
  startedAt: null,
  activeJobId: null,
};

let activeSingleAnalysis: string | null = null;

export function loadManifest(): DatasetManifest {
  if (!fs.existsSync(MANIFEST_PATH)) {
    throw new Error(`Test library manifest not found at: ${MANIFEST_PATH}`);
  }
  const raw = fs.readFileSync(MANIFEST_PATH, 'utf8');
  return JSON.parse(raw) as DatasetManifest;
}

export function loadTestResults(): Record<string, VideoTestResult> {
  if (!fs.existsSync(RESULTS_PATH)) {
    return {};
  }
  try {
    const raw = fs.readFileSync(RESULTS_PATH, 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    console.warn('[TestLibrary] Failed reading test_results.json, initializing empty:', err);
    return {};
  }
}

export function saveTestResults(results: Record<string, VideoTestResult>): void {
  try {
    fs.writeFileSync(RESULTS_PATH, JSON.stringify(results, null, 2), 'utf8');
  } catch (err) {
    console.error('[TestLibrary] Failed saving test_results.json:', err);
  }
}

export function computeValidationMetrics(
  manifest: DatasetManifest,
  results: Record<string, VideoTestResult>
): ValidationMetrics {
  let tp = 0;
  let tn = 0;
  let fp = 0;
  let fn = 0;
  let failed = 0;
  let tested = 0;
  let totalTimeMs = 0;
  let totalFrames = 0;

  for (const video of manifest.videos) {
    const res = results[video.id];
    if (!res) continue;

    if (res.status === 'COMPLETED') {
      tested++;
      totalTimeMs += res.processingTimeMs || 0;
      totalFrames += res.framesAnalyzed || 0;

      if (res.classification === 'TRUE_POSITIVE') tp++;
      else if (res.classification === 'TRUE_NEGATIVE') tn++;
      else if (res.classification === 'FALSE_POSITIVE') fp++;
      else if (res.classification === 'FALSE_NEGATIVE') fn++;
    } else if (res.status === 'FAILED') {
      failed++;
    }
  }

  const validDecisions = tp + tn + fp + fn;
  const accuracy = validDecisions > 0 ? (tp + tn) / validDecisions : null;
  const precision = tp + fp > 0 ? tp / (tp + fp) : null;
  const recall = tp + fn > 0 ? tp / (tp + fn) : null;
  const f1Score =
    precision !== null && recall !== null && precision + recall > 0
      ? (2 * (precision * recall)) / (precision + recall)
      : null;
  const falsePositiveRate = fp + tn > 0 ? fp / (fp + tn) : null;
  const falseNegativeRate = fn + tp > 0 ? fn / (fn + tp) : null;

  const avgProcessingTimeSec = tested > 0 ? Math.round((totalTimeMs / tested / 1000) * 100) / 100 : 0;
  const avgThroughputFps =
    totalTimeMs > 0 ? Math.round((totalFrames / (totalTimeMs / 1000)) * 10) / 10 : 0;

  return {
    totalVideos: manifest.total_videos,
    testedCount: tested,
    pendingCount: Math.max(0, manifest.total_videos - tested - failed),
    failedCount: failed,
    truePositives: tp,
    trueNegatives: tn,
    falsePositives: fp,
    falseNegatives: fn,
    accuracy: accuracy !== null ? Math.round(accuracy * 1000) / 1000 : null,
    precision: precision !== null ? Math.round(precision * 1000) / 1000 : null,
    recall: recall !== null ? Math.round(recall * 1000) / 1000 : null,
    f1Score: f1Score !== null ? Math.round(f1Score * 1000) / 1000 : null,
    falsePositiveRate: falsePositiveRate !== null ? Math.round(falsePositiveRate * 1000) / 1000 : null,
    falseNegativeRate: falseNegativeRate !== null ? Math.round(falseNegativeRate * 1000) / 1000 : null,
    avgProcessingTimeSec,
    avgThroughputFps,
    disclaimer: DISCLAIMER_TEXT,
  };
}

export function classifyResult(
  expectedLabel: 'VIOLENCE' | 'NON-VIOLENCE',
  predictedLabel: 'VIOLENCE' | 'NON-VIOLENCE'
): ClassificationOutcome {
  if (expectedLabel === 'VIOLENCE' && predictedLabel === 'VIOLENCE') return 'TRUE_POSITIVE';
  if (expectedLabel === 'NON-VIOLENCE' && predictedLabel === 'NON-VIOLENCE') return 'TRUE_NEGATIVE';
  if (expectedLabel === 'NON-VIOLENCE' && predictedLabel === 'VIOLENCE') return 'FALSE_POSITIVE';
  if (expectedLabel === 'VIOLENCE' && predictedLabel === 'NON-VIOLENCE') return 'FALSE_NEGATIVE';
  return 'ERROR';
}

export function evaluateInferenceResult(
  analysis: VideoAnalysisResult,
  expectedLabel: 'VIOLENCE' | 'NON-VIOLENCE'
): {
  predictedLabel: 'VIOLENCE' | 'NON-VIOLENCE';
  confidence: number;
  violenceStart: number | null;
  violenceEnd: number | null;
  participantIds: number[];
} {
  // Check if any frame registered a CONFIRMED violence event
  let hasConfirmedViolence = false;
  let maxConfidence = 0.05;
  let violenceStart: number | null = null;
  let violenceEnd: number | null = null;
  const participantIdsSet = new Set<number>();

  for (const frame of analysis.telemetry || []) {
    if (frame.violence_status === 'CONFIRMED' || frame.violence_event_id) {
      hasConfirmedViolence = true;
      if (violenceStart === null || frame.timestamp < violenceStart) {
        violenceStart = frame.timestamp;
      }
      if (violenceEnd === null || frame.timestamp > violenceEnd) {
        violenceEnd = frame.timestamp;
      }
      if (frame.violence_participants) {
        frame.violence_participants.forEach((id) => participantIdsSet.add(id));
      }
    }

    if (frame.violence_prediction?.confidence) {
      if (frame.violence_prediction.confidence > maxConfidence) {
        maxConfidence = frame.violence_prediction.confidence;
      }
    }
  }

  // Also check alerts for VIOLENCE_DETECTED
  const violenceAlert = (analysis.alerts || []).find((a) => a.type === 'VIOLENCE_DETECTED');
  if (violenceAlert) {
    hasConfirmedViolence = true;
    if (violenceStart === null || violenceAlert.timestamp < violenceStart) {
      violenceStart = violenceAlert.timestamp;
    }
    if (violenceAlert.participantTrackIds) {
      violenceAlert.participantTrackIds.forEach((id: number) => participantIdsSet.add(id));
    }
  }

  const predictedLabel: 'VIOLENCE' | 'NON-VIOLENCE' = hasConfirmedViolence ? 'VIOLENCE' : 'NON-VIOLENCE';
  const confidence = hasConfirmedViolence
    ? Math.max(0.65, Math.round(maxConfidence * 100) / 100)
    : Math.max(0.70, Math.round((1.0 - maxConfidence) * 100) / 100);

  return {
    predictedLabel,
    confidence,
    violenceStart,
    violenceEnd,
    participantIds: Array.from(participantIdsSet),
  };
}

/**
 * Run real video analysis on a single built-in test video
 */
export async function runTestVideo(
  videoId: string,
  forceReanalyze: boolean = false
): Promise<VideoTestResult> {
  const manifest = loadManifest();
  const videoSpec = manifest.videos.find((v) => v.id === videoId);

  if (!videoSpec) {
    throw new Error(`Video with ID "${videoId}" not found in manifest.`);
  }

  const absVideoPath = path.join(process.cwd(), videoSpec.relative_path);
  if (!fs.existsSync(absVideoPath)) {
    throw new Error(`Video file does not exist on disk: ${absVideoPath}`);
  }

  // If forceReanalyze is requested, remove existing cached telemetry
  const telemetryFile = path.join(process.cwd(), 'uploads', 'telemetry', `${videoSpec.filename}.json`);
  if (forceReanalyze && fs.existsSync(telemetryFile)) {
    try {
      fs.unlinkSync(telemetryFile);
    } catch {}
  }

  const startTime = Date.now();
  const jobId = `test_${videoSpec.id}_${startTime}`;

  console.log(`[TestLibrary] Starting analysis for test video "${videoSpec.id}" (${videoSpec.filename})...`);

  try {
    const analysisResult = await analyzeVideoServerSide(
      absVideoPath,
      videoSpec.filename,
      4, // 4 FPS analysis
      jobId,
      'auto',
      20
    );

    const processingTimeMs = Date.now() - startTime;
    const { predictedLabel, confidence, violenceStart, violenceEnd, participantIds } =
      evaluateInferenceResult(analysisResult, videoSpec.expected_label);

    const outcome = classifyResult(videoSpec.expected_label, predictedLabel);

    const testRecord: VideoTestResult = {
      videoId: videoSpec.id,
      filename: videoSpec.filename,
      expectedLabel: videoSpec.expected_label,
      predictedLabel,
      classification: outcome,
      confidence,
      testedAt: new Date().toISOString(),
      status: 'COMPLETED',
      durationSec: videoSpec.duration,
      framesAnalyzed: analysisResult.totalFrames || 0,
      processingTimeMs,
      processingFps:
        processingTimeMs > 0
          ? Math.round(((analysisResult.totalFrames || 0) / (processingTimeMs / 1000)) * 10) / 10
          : 0,
      peakPeople: analysisResult.peakPeople || 0,
      violenceEventStart: violenceStart,
      violenceEventEnd: violenceEnd,
      participantIds,
    };

    const results = loadTestResults();
    results[videoSpec.id] = testRecord;
    saveTestResults(results);

    console.log(
      `[TestLibrary] Video ${videoSpec.id} completed. Expected: ${videoSpec.expected_label}, Predicted: ${predictedLabel} -> ${outcome} (${confidence * 100}% conf)`
    );

    return testRecord;
  } catch (err: any) {
    const processingTimeMs = Date.now() - startTime;
    console.error(`[TestLibrary] Video ${videoSpec.id} analysis failed:`, err);

    const failedRecord: VideoTestResult = {
      videoId: videoSpec.id,
      filename: videoSpec.filename,
      expectedLabel: videoSpec.expected_label,
      predictedLabel: 'UNKNOWN',
      classification: 'ERROR',
      confidence: 0,
      testedAt: new Date().toISOString(),
      status: 'FAILED',
      durationSec: videoSpec.duration,
      framesAnalyzed: 0,
      processingTimeMs,
      processingFps: 0,
      peakPeople: 0,
      violenceEventStart: null,
      violenceEventEnd: null,
      participantIds: [],
      errorMessage: err?.message || 'Unknown analysis error',
    };

    const results = loadTestResults();
    results[videoSpec.id] = failedRecord;
    saveTestResults(results);

    throw err;
  }
}

/**
 * Sequential Batch Runner: resource-aware (strictly 1 video at a time)
 */
export async function startBatchRunner(): Promise<void> {
  if (activeBatch.isRunning) {
    console.log('[TestLibrary] Batch analysis already in progress.');
    return;
  }

  const manifest = loadManifest();
  activeBatch.isRunning = true;
  activeBatch.shouldStop = false;
  activeBatch.currentIndex = 0;
  activeBatch.startedAt = Date.now();

  console.log(`[TestLibrary] Sequential Batch Analysis started across ${manifest.videos.length} clips.`);

  (async () => {
    try {
      for (let i = 0; i < manifest.videos.length; i++) {
        if (activeBatch.shouldStop) {
          console.log('[TestLibrary] Batch execution stopped by operator request.');
          break;
        }

        const video = manifest.videos[i];
        activeBatch.currentIndex = i;
        activeBatch.currentVideoId = video.id;
        activeBatch.currentVideoTitle = video.title;

        console.log(`[TestLibrary] Batch running video ${i + 1}/${manifest.videos.length}: ${video.id} (${video.title})`);

        try {
          await runTestVideo(video.id, true);
        } catch (videoErr) {
          console.warn(`[TestLibrary] Video ${video.id} failed during batch, continuing:`, videoErr);
        }

        // Brief cooldown between videos to release GPU/VRAM and event-loop pressure
        await new Promise((r) => setTimeout(r, 600));
      }
    } finally {
      activeBatch.isRunning = false;
      activeBatch.currentVideoId = null;
      activeBatch.currentVideoTitle = null;
      activeBatch.shouldStop = false;
      console.log('[TestLibrary] Batch analysis execution finished.');
    }
  })();
}

export function stopBatchRunner(): boolean {
  if (!activeBatch.isRunning) return false;
  activeBatch.shouldStop = true;
  if (activeBatch.currentVideoId) {
    cancelAnalysis(activeBatch.currentVideoId);
  }
  return true;
}

export function getBatchStatus(): BatchTestStatus {
  const manifest = loadManifest();
  const results = loadTestResults();
  const metrics = computeValidationMetrics(manifest, results);

  const completedCount = metrics.testedCount + metrics.failedCount;
  const percent =
    manifest.total_videos > 0 ? Math.round((completedCount / manifest.total_videos) * 100) : 0;
  const elapsedSec = activeBatch.startedAt ? Math.round((Date.now() - activeBatch.startedAt) / 1000) : 0;

  return {
    isRunning: activeBatch.isRunning,
    totalVideos: manifest.total_videos,
    completedCount,
    currentIndex: activeBatch.currentIndex,
    currentVideoId: activeBatch.currentVideoId,
    currentVideoTitle: activeBatch.currentVideoTitle,
    percent,
    startedAt: activeBatch.startedAt ? new Date(activeBatch.startedAt).toISOString() : null,
    elapsedSec,
    metrics,
  };
}

export function resetTestResults(): void {
  saveTestResults({});
  console.log('[TestLibrary] Test results cleared while preserving video assets.');
}

/**
 * Test Library Express Router
 */
export function createTestLibraryRouter(): Router {
  const router = Router();

  // GET /api/test-library/manifest - Get manifest + current results + metrics
  router.get('/manifest', (req, res) => {
    try {
      const manifest = loadManifest();
      const results = loadTestResults();
      const metrics = computeValidationMetrics(manifest, results);

      // Merge results with video entries
      const enrichedVideos = manifest.videos.map((v) => ({
        ...v,
        testResult: results[v.id] || null,
      }));

      res.json({
        ...manifest,
        videos: enrichedVideos,
        metrics,
        batchStatus: getBatchStatus(),
      });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || 'Failed loading test library manifest' });
    }
  });

  // POST /api/test-library/analyze/:videoId - Run real inference on selected video
  router.post('/analyze/:videoId', async (req, res) => {
    const videoId = req.params.videoId;
    if (activeBatch.isRunning) {
      return res.status(409).json({ error: 'Batch test is currently running. Please wait or stop the batch.' });
    }

    if (activeSingleAnalysis && activeSingleAnalysis !== videoId) {
      return res.status(409).json({
        error: `Another video (${activeSingleAnalysis}) is currently being analyzed. Analyzing 1 video at a time preserves system resources.`,
      });
    }

    activeSingleAnalysis = videoId;
    try {
      const result = await runTestVideo(videoId, true);
      res.json({ success: true, result });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || 'Analysis failed' });
    } finally {
      activeSingleAnalysis = null;
    }
  });

  // POST /api/test-library/batch/start - Start sequential batch analysis
  router.post('/batch/start', async (req, res) => {
    if (activeBatch.isRunning) {
      return res.status(409).json({ error: 'Batch test is already running.' });
    }
    if (activeSingleAnalysis) {
      return res.status(409).json({ error: 'A single video analysis is in progress. Please wait for it to complete.' });
    }

    await startBatchRunner();
    res.json({ success: true, message: 'Sequential batch analysis initiated', status: getBatchStatus() });
  });

  // POST /api/test-library/batch/stop - Safely stop batch
  router.post('/batch/stop', (req, res) => {
    const stopped = stopBatchRunner();
    res.json({ success: stopped, message: stopped ? 'Batch stop requested' : 'No active batch running' });
  });

  // GET /api/test-library/batch/status - Poll batch status
  router.get('/batch/status', (req, res) => {
    res.json(getBatchStatus());
  });

  // POST /api/test-library/reset-results - Clear test records without deleting files
  router.post('/reset-results', (req, res) => {
    if (activeBatch.isRunning) {
      return res.status(409).json({ error: 'Cannot reset results while a batch test is running.' });
    }
    resetTestResults();
    res.json({ success: true, message: 'Test records cleared successfully' });
  });

  return router;
}

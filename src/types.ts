export interface TrackedObject {
  track_id: number;
  bbox: [number, number, number, number]; // [x1, y1, x2, y2]
  class_id: number;
  confidence: number;
  centroid: [number, number]; // [cx, cy]
  velocity: [number, number]; // [vx, vy]
  speed_px: number; // px / frame
  speed_ps: number; // px / second
  direction: string; // 'N' | 'NE' | 'E' | 'SE' | 'S' | 'SW' | 'W' | 'NW'
  is_stationary: boolean;
  history?: Array<[number, number]>;
}

export type RawDetection = [number, number, number, number, number, number]; // [x1, y1, x2, y2, conf, cls]

/**
 * EXACT CROWD SAFETY THRESHOLD:
 * people_count <= 20 => NORMAL (Green)
 * people_count > 20  => WARNING (Amber / Yellow)
 */
export type CrowdSafetyStatus = 'NORMAL' | 'WARNING';
export type MovementSafetyStatus = 'NORMAL' | 'ELEVATED' | 'HIGH_SURGE' | 'RAPID_DISPERSAL' | 'STAGNATION';

export interface OpticalFlowVector {
  x: number;
  y: number;
  u: number;
  v: number;
  magnitude: number;
}

export interface OpticalFlowResult {
  motionScore: number; // Normalized 0.00 - 1.00
  averageMotion: [number, number]; // Mean [u, v]
  motionRegions: Array<{
    x: number;
    y: number;
    width: number;
    height: number;
    intensity: number;
  }>;
  gridVectors: OpticalFlowVector[];
}

export interface VisionSenseAlert {
  id: string;
  type: 'CROWD_THRESHOLD_EXCEEDED' | 'HIGH_MOTION_SURGE' | 'RAPID_DISPERSAL' | 'BOTTLENECK_STAGNATION' | 'UNUSUAL_MOVEMENT';
  severity: 'WARNING' | 'NORMAL';
  message: string;
  timestamp: number; // Video playback timestamp in seconds
  frame: number;
  peopleCount: number;
  motionScore: number;
}

export interface FrameTelemetry {
  timestamp: number;        // Source video timestamp (seconds)
  frame_index: number;      // Exact source video frame index
  tracks: TrackedObject[];  // ByteTrack tracks associated with this exact frame
  people_count: number;
  peak_people: number;
  motion_score: number;
  crowd_status: CrowdSafetyStatus;
  movement_status: MovementSafetyStatus;
  optical_flow?: OpticalFlowResult;
  alerts: VisionSenseAlert[];
}

export type PlaybackState = 'PLAYING' | 'PAUSED' | 'COMPLETED';
export type AIAnalysisStatus = 'QUEUED' | 'PROCESSING' | 'CANCEL_REQUESTED' | 'CANCELLED' | 'COMPLETED' | 'FAILED';
export type AnalysisStatus = AIAnalysisStatus;
export type UploadState = 'IDLE' | 'SELECTED' | 'UPLOADING' | 'PROCESSING' | 'CANCEL_REQUESTED' | 'CANCELLED' | 'COMPLETED' | 'FAILED';

export interface SynchronizedTelemetryResult {
  status: 'SYNCHRONIZED' | 'BEHIND_PLAYBACK' | 'NOT_YET_AVAILABLE' | 'NO_DATA';
  telemetry: FrameTelemetry | null;
  tracks: TrackedObject[];
  people_count: number;
  crowd_status: CrowdSafetyStatus;
  movement_status: MovementSafetyStatus;
  motion_score: number;
  timeDifference: number;
  processedThroughTimestamp: number;
  message?: string;
}

export interface AnalysisProgressInfo {
  status: AIAnalysisStatus;
  progressPercent: number;
  processedTimestamp: number;
  duration: number;
  framesAnalyzed: number;
  totalFramesExpected: number;
  isFinalSecondVerified: boolean;
  fps: number;
}

export interface TelemetryPoint {
  timestamp: number;
  frame: number;
  peopleCount: number;
  peakPeople: number;
  motionScore: number;
  crowdStatus: CrowdSafetyStatus;
  movementStatus: MovementSafetyStatus;
  activeAlertsCount: number;
}

export type ActiveNavTab = 'dashboard' | 'analysis' | 'alerts' | 'analytics' | 'reports' | 'storage' | 'settings';

export interface CountingLineConfig {
  id: string;
  name: string;
  points: [[number, number], [number, number]]; // [[rel_x1, rel_y1], [rel_x2, rel_y2]] in 0.0-1.0
  direction: 'horizontal' | 'vertical' | 'both';
  count_in: number;
  count_out: number;
}

export interface CrossingEvent {
  id: string;
  frame_idx: number;
  timestamp: number;
  track_id: number;
  class_id: number;
  class_name: string;
  line_name: string;
  direction: 'in' | 'out';
}

export interface StatsSnapshot {
  fps: number;
  frame_count: number;
  active_total: number;
  active_by_class: Record<number, number>;
  total_unique: number;
  peak_active: number;
  avg_speed_by_class: Record<number, number>;
  counter_totals: Record<string, { count_in: number; count_out: number; total: number }>;
}

export type ColormapName = 'HOT' | 'JET' | 'INFERNO' | 'PLASMA' | 'TURBO' | 'VIRIDIS';

export interface TrajectoryExportRecord {
  track_id: number;
  class_id: number;
  class_name: string;
  frame_first: number;
  frame_last: number;
  duration_frames: number;
  duration_s: number;
  path: { frame: number; cx: number; cy: number }[];
  start_cx: number;
  start_cy: number;
  end_cx: number;
  end_cy: number;
  avg_speed_ps: number;
}

export interface VisualConfig {
  show_boxes: boolean;
  show_ids: boolean;
  show_labels: boolean;
  show_confidence: boolean;
  show_trails: boolean;
  show_hud: boolean;
  show_lines: boolean;
  show_flow_vectors: boolean;
  trail_fade: boolean;
  box_thickness: number;
  font_scale: number;
  max_trail_length: number;
  heatmap_enabled?: boolean;
  heatmap_colormap?: ColormapName;
  heatmap_alpha?: number;
  heatmap_kernel?: number;
}

export interface VideoMetadata {
  width: number;
  height: number;
  fps: number;
  duration: number;
  size: number;
  codec: string;
}

export const COCO_CLASSES: Record<number, string> = {
  0: 'Person',
};

export const DEFAULT_COLORS: Record<number, string> = {
  0: '#06b6d4', // Person -> Cyan / Emerald
};

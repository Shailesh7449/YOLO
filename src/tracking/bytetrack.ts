import { RawDetection, TrackedObject } from '../types';
export type { RawDetection, TrackedObject };

export class KalmanBoxTracker {
  private static count = 0;
  public id: number;
  public class_id: number;
  public confidence: number;
  public hits: number = 0;
  public age: number = 0;
  public time_since_update: number = 0;
  public history: Array<[number, number]> = [];
  public bbox: [number, number, number, number];
  public velocity: [number, number] = [0, 0];

  constructor(bbox: [number, number, number, number], conf: number, cls: number) {
    KalmanBoxTracker.count += 1;
    this.id = KalmanBoxTracker.count;
    this.bbox = bbox;
    this.confidence = conf;
    this.class_id = cls;
    const cx = (bbox[0] + bbox[2]) / 2;
    const cy = (bbox[1] + bbox[3]) / 2;
    this.history.push([cx, cy]);
  }

  public static resetCount() {
    KalmanBoxTracker.count = 0;
  }

  predict(): [number, number, number, number] {
    this.age += 1;
    if (this.time_since_update > 0) {
      this.hits = 0;
    }
    this.time_since_update += 1;

    // Apply linear velocity
    const [x1, y1, x2, y2] = this.bbox;
    const [vx, vy] = this.velocity;
    this.bbox = [x1 + vx, y1 + vy, x2 + vx, y2 + vy];
    return this.bbox;
  }

  update(bbox: [number, number, number, number], conf: number) {
    this.time_since_update = 0;
    this.hits += 1;
    this.confidence = conf;

    const prevCx = (this.bbox[0] + this.bbox[2]) / 2;
    const prevCy = (this.bbox[1] + this.bbox[3]) / 2;
    const newCx = (bbox[0] + bbox[2]) / 2;
    const newCy = (bbox[1] + bbox[3]) / 2;

    // Exponential smoothing on velocity
    const alpha = 0.6;
    const rawVx = newCx - prevCx;
    const rawVy = newCy - prevCy;
    this.velocity = [
      alpha * rawVx + (1 - alpha) * this.velocity[0],
      alpha * rawVy + (1 - alpha) * this.velocity[1],
    ];

    this.bbox = bbox;
    this.history.push([newCx, newCy]);
    if (this.history.length > 50) {
      this.history.shift();
    }
  }

  getSpeedPx(): number {
    return Math.sqrt(this.velocity[0] ** 2 + this.velocity[1] ** 2);
  }

  getDirection(): string {
    const [vx, vy] = this.velocity;
    if (Math.abs(vx) < 0.3 && Math.abs(vy) < 0.3) return 'STATIONARY';
    const angle = (Math.atan2(vy, vx) * 180) / Math.PI; // -180 to 180
    if (angle >= -22.5 && angle < 22.5) return 'E';
    if (angle >= 22.5 && angle < 67.5) return 'SE';
    if (angle >= 67.5 && angle < 112.5) return 'S';
    if (angle >= 112.5 && angle < 157.5) return 'SW';
    if (angle >= 157.5 || angle < -157.5) return 'W';
    if (angle >= -157.5 && angle < -112.5) return 'NW';
    if (angle >= -112.5 && angle < -67.5) return 'N';
    return 'NE';
  }
}

function iou(bb_test: [number, number, number, number], bb_gt: [number, number, number, number]): number {
  const xx1 = Math.max(bb_test[0], bb_gt[0]);
  const yy1 = Math.max(bb_test[1], bb_gt[1]);
  const xx2 = Math.min(bb_test[2], bb_gt[2]);
  const yy2 = Math.min(bb_test[3], bb_gt[3]);

  const w = Math.max(0, xx2 - xx1);
  const h = Math.max(0, yy2 - yy1);
  const intersection = w * h;

  const area_test = (bb_test[2] - bb_test[0]) * (bb_test[3] - bb_test[1]);
  const area_gt = (bb_gt[2] - bb_gt[0]) * (bb_gt[3] - bb_gt[1]);
  const union = area_test + area_gt - intersection;

  return union <= 0 ? 0 : intersection / union;
}

export class ByteTracker {
  private trackers: KalmanBoxTracker[] = [];
  private max_age: number;
  private min_hits: number;
  private track_thresh: number;
  private high_thresh: number;
  private match_thresh: number;

  constructor(
    track_thresh: number | { trackThresh?: number; matchThresh?: number; trackBuffer?: number; highThresh?: number } = 0.25,
    high_thresh = 0.5,
    match_thresh = 0.65,
    max_age = 30,
    min_hits = 3
  ) {
    if (typeof track_thresh === 'object') {
      this.track_thresh = track_thresh.trackThresh ?? 0.25;
      this.high_thresh = track_thresh.highThresh ?? 0.5;
      this.match_thresh = track_thresh.matchThresh ?? 0.65;
      this.max_age = track_thresh.trackBuffer ?? 30;
      this.min_hits = 1;
    } else {
      this.track_thresh = track_thresh;
      this.high_thresh = high_thresh;
      this.match_thresh = match_thresh;
      this.max_age = max_age;
      this.min_hits = min_hits;
    }
  }

  public reset() {
    this.trackers = [];
    KalmanBoxTracker.resetCount();
  }

  public update(detections: RawDetection[], fps = 30): TrackedObject[] {
    // 1. Predict positions of existing trackers
    for (const tracker of this.trackers) {
      tracker.predict();
    }

    // 2. Separate detections into high-confidence and low-confidence
    const detsHigh: RawDetection[] = [];
    const detsLow: RawDetection[] = [];

    for (const det of detections) {
      if (det[4] >= this.high_thresh) {
        detsHigh.push(det);
      } else if (det[4] >= this.track_thresh) {
        detsLow.push(det);
      }
    }

    // 3. First association: match high-confidence detections with active trackers
    const matchedTrackers = new Set<number>();
    const matchedDets = new Set<number>();

    for (let d = 0; d < detsHigh.length; d++) {
      let bestIou = this.match_thresh;
      let bestTrackerIdx = -1;

      for (let t = 0; t < this.trackers.length; t++) {
        if (matchedTrackers.has(t)) continue;
        const score = iou(detsHigh[d].slice(0, 4) as [number, number, number, number], this.trackers[t].bbox);
        if (score > bestIou) {
          bestIou = score;
          bestTrackerIdx = t;
        }
      }

      if (bestTrackerIdx !== -1) {
        this.trackers[bestTrackerIdx].update(
          detsHigh[d].slice(0, 4) as [number, number, number, number],
          detsHigh[d][4]
        );
        matchedTrackers.add(bestTrackerIdx);
        matchedDets.add(d);
      }
    }

    // 4. Second association: match low-confidence detections with remaining trackers
    const remainingTrackerIndices: number[] = [];
    for (let t = 0; t < this.trackers.length; t++) {
      if (!matchedTrackers.has(t)) {
        remainingTrackerIndices.push(t);
      }
    }

    for (let d = 0; d < detsLow.length; d++) {
      let bestIou = 0.45; // slightly lower threshold for low-confidence recovery
      let bestRemainingIdx = -1;

      for (let i = 0; i < remainingTrackerIndices.length; i++) {
        const t = remainingTrackerIndices[i];
        const score = iou(detsLow[d].slice(0, 4) as [number, number, number, number], this.trackers[t].bbox);
        if (score > bestIou) {
          bestIou = score;
          bestRemainingIdx = i;
        }
      }

      if (bestRemainingIdx !== -1) {
        const t = remainingTrackerIndices[bestRemainingIdx];
        this.trackers[t].update(
          detsLow[d].slice(0, 4) as [number, number, number, number],
          detsLow[d][4]
        );
        remainingTrackerIndices.splice(bestRemainingIdx, 1);
      }
    }

    // 5. Initialize new trackers for unmatched high-confidence detections
    for (let d = 0; d < detsHigh.length; d++) {
      if (!matchedDets.has(d)) {
        const trk = new KalmanBoxTracker(
          detsHigh[d].slice(0, 4) as [number, number, number, number],
          detsHigh[d][4],
          detsHigh[d][5]
        );
        this.trackers.push(trk);
      }
    }

    // 6. Remove dead trackers
    this.trackers = this.trackers.filter(
      (trk) => trk.time_since_update <= this.max_age
    );

    // 7. Format active confirmed tracks
    const results: TrackedObject[] = [];
    for (const trk of this.trackers) {
      if (trk.hits >= this.min_hits || trk.time_since_update === 0) {
        const [x1, y1, x2, y2] = trk.bbox;
        const cx = (x1 + x2) / 2;
        const cy = (y1 + y2) / 2;
        const speedPx = trk.getSpeedPx();
        const speedPs = speedPx * fps;

        results.push({
          track_id: trk.id,
          bbox: [Math.round(x1), Math.round(y1), Math.round(x2), Math.round(y2)],
          class_id: trk.class_id,
          confidence: trk.confidence,
          centroid: [Math.round(cx), Math.round(cy)],
          velocity: [Math.round(trk.velocity[0] * 10) / 10, Math.round(trk.velocity[1] * 10) / 10],
          speed_px: Math.round(speedPx * 10) / 10,
          speed_ps: Math.round(speedPs * 10) / 10,
          direction: trk.getDirection(),
          is_stationary: speedPx < 0.5,
          history: [...trk.history],
        });
      }
    }

    return results;
  }
}

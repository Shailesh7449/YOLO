import { TrackedObject } from '../types';

const DIRECTIONS = ['E', 'NE', 'N', 'NW', 'W', 'SW', 'S', 'SE'] as const;

export class MotionEstimator {
  historyLen: number;
  fps: number;
  stationaryThresh: number;
  private history: Map<number, [number, number][]> = new Map();

  constructor(historyLen: number = 5, fps: number = 30, stationaryThresh: number = 2.0) {
    this.historyLen = historyLen;
    this.fps = fps;
    this.stationaryThresh = stationaryThresh;
  }

  update(objects: TrackedObject[]): TrackedObject[] {
    const activeIds = new Set<number>();

    for (const obj of objects) {
      const tid = obj.track_id;
      activeIds.add(tid);

      let hist = this.history.get(tid);
      if (!hist) {
        hist = [];
        this.history.set(tid, hist);
      }
      hist.push(obj.centroid);
      if (hist.length > this.historyLen + 1) {
        hist.shift();
      }

      const [vx, vy, speed] = this.computeVelocity(hist);
      obj.velocity = [vx, vy];
      obj.speed_px = speed;
      obj.speed_ps = Math.round(speed * this.fps * 10) / 10;
      obj.direction = this.angleToDirection(Math.atan2(-vy, vx));
      obj.is_stationary = speed < this.stationaryThresh;
    }

    // Prune stale tracks
    for (const tid of this.history.keys()) {
      if (!activeIds.has(tid)) {
        this.history.delete(tid);
      }
    }

    return objects;
  }

  reset() {
    this.history.clear();
  }

  private computeVelocity(hist: [number, number][]): [number, number, number] {
    if (hist.length < 2) {
      return [0, 0, 0];
    }

    let dxSum = 0;
    let dySum = 0;
    const n = hist.length - 1;

    for (let i = 0; i < n; i++) {
      dxSum += hist[i + 1][0] - hist[i][0];
      dySum += hist[i + 1][1] - hist[i][1];
    }

    const vx = dxSum / n;
    const vy = dySum / n;
    const speed = Math.hypot(vx, vy);
    return [vx, vy, speed];
  }

  private angleToDirection(angleRad: number): string {
    let deg = (angleRad * 180) / Math.PI;
    if (deg < 0) deg += 360;
    const idx = Math.round(deg / 45) % 8;
    return DIRECTIONS[idx];
  }
}

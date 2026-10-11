import { TrackedObject, StatsSnapshot } from '../types';

export class StatsTracker {
  fpsWindow: number;
  speedWindow: number;

  frameCount: number = 0;
  totalUniqueTracks: number = 0;
  peakActive: number = 0;

  private frameTimes: number[] = [];
  private lastTick: number | null = null;
  private activeByClass: Map<number, number> = new Map();
  private classFrameCounts: Map<number, number> = new Map();
  private speedBuffers: Map<number, number[]> = new Map();
  private counterTotals: Record<string, { count_in: number; count_out: number; total: number }> = {};

  constructor(fpsWindow: number = 30, speedWindow: number = 60) {
    this.fpsWindow = fpsWindow;
    this.speedWindow = speedWindow;
  }

  tick(
    objects: TrackedObject[],
    totalUnique: number,
    counterTotals: Record<string, { count_in: number; count_out: number; total: number }> = {}
  ) {
    const now = performance.now();
    if (this.lastTick !== null) {
      const dt = now - this.lastTick;
      if (dt > 0) {
        this.frameTimes.push(dt);
        if (this.frameTimes.length > this.fpsWindow) {
          this.frameTimes.shift();
        }
      }
    }
    this.lastTick = now;

    this.frameCount++;
    this.totalUniqueTracks = totalUnique;
    this.counterTotals = counterTotals;

    this.activeByClass.clear();
    for (const obj of objects) {
      const cid = obj.class_id;
      this.activeByClass.set(cid, (this.activeByClass.get(cid) || 0) + 1);
      this.classFrameCounts.set(cid, (this.classFrameCounts.get(cid) || 0) + 1);

      if (obj.speed_ps > 0) {
        let buf = this.speedBuffers.get(cid);
        if (!buf) {
          buf = [];
          this.speedBuffers.set(cid, buf);
        }
        buf.push(obj.speed_ps);
        if (buf.length > this.speedWindow) {
          buf.shift();
        }
      }
    }

    if (objects.length > this.peakActive) {
      this.peakActive = objects.length;
    }
  }

  snapshot(): StatsSnapshot {
    let fps = 0;
    if (this.frameTimes.length >= 2) {
      const avgDt = this.frameTimes.reduce((a, b) => a + b, 0) / this.frameTimes.length;
      fps = avgDt > 0 ? Math.round((1000 / avgDt) * 10) / 10 : 0;
    }

    const byClassRecord: Record<number, number> = {};
    for (const [k, v] of this.activeByClass.entries()) {
      byClassRecord[k] = v;
    }

    const avgSpeedRecord: Record<number, number> = {};
    for (const [k, buf] of this.speedBuffers.entries()) {
      if (buf.length > 0) {
        const mean = buf.reduce((a, b) => a + b, 0) / buf.length;
        avgSpeedRecord[k] = Math.round(mean * 10) / 10;
      }
    }

    return {
      fps,
      frame_count: this.frameCount,
      active_total: Array.from(this.activeByClass.values()).reduce((a, b) => a + b, 0),
      active_by_class: byClassRecord,
      total_unique: this.totalUniqueTracks,
      peak_active: this.peakActive,
      avg_speed_by_class: avgSpeedRecord,
      counter_totals: this.counterTotals,
    };
  }

  summary(): StatsSnapshot & { class_density: Record<number, number> } {
    const snap = this.snapshot();
    const totalFrames = Math.max(1, this.frameCount);
    const classDensity: Record<number, number> = {};

    for (const [cid, cnt] of this.classFrameCounts.entries()) {
      classDensity[cid] = Math.round((cnt / totalFrames) * 1000) / 1000;
    }

    return {
      ...snap,
      class_density: classDensity,
    };
  }

  reset() {
    this.frameCount = 0;
    this.totalUniqueTracks = 0;
    this.peakActive = 0;
    this.frameTimes = [];
    this.lastTick = null;
    this.activeByClass.clear();
    this.classFrameCounts.clear();
    this.speedBuffers.clear();
    this.counterTotals = {};
  }
}
